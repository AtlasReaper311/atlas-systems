/**
 * System SYMPHONY persistent generative orchestra.
 *
 * Tone.js stays isolated here. Telemetry updates reshape one continuous
 * composition; they never restart it. The scheduler triggers at most one
 * rotating service voice per eighth note, so topology growth does not create
 * unbounded simultaneous polyphony.
 */

import {
  MAX_COMPONENTS,
  midiToFrequencyHz,
  stableHash,
} from "./mapping.js?v=20260716-system-symphony-v2";

export const DEFAULT_USER_GAIN = 0.62;
export const MAX_SERVICE_VOICES = MAX_COMPONENTS;
export const MAX_INCIDENT_ACCENTS = 4;
export const WAVEFORM_SIZE = 512;
export const AUDIO_START_TIMEOUT_MS = 8000;

const UI_RAMP_SECONDS = 0.25;
const VOICE_REMOVE_RAMP_SECONDS = 0.5;
const PHRASE_STEPS = 32;

const PAD_CHORDS = Object.freeze({
  healthy: [[0, 2, 4], [3, 5, 7], [4, 6, 1], [1, 3, 5]],
  warning: [[0, 2, 4], [5, 3, 1], [3, 5, 0], [1, 4, 6]],
  critical: [[0, 1, 4], [0, 3, 5], [1, 4, 6], [0, 2, 5]],
  unknown: [[0, 4], [1, 5], [0, 6], [4, 7]],
});

const BASS_STEPS = Object.freeze({
  healthy: new Set([0, 16]),
  warning: new Set([0, 8, 16, 24]),
  critical: new Set([0, 4, 8, 12, 16, 20, 24, 28]),
  unknown: new Set([0, 24]),
});

const NOTE_LENGTHS = Object.freeze({
  legato: "2n",
  tenuto: "4n",
  urgent: "8n",
  suspended: "2n",
});

function randomUnit(seed) {
  let value = seed >>> 0;
  value += 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function requireTone() {
  const Tone = globalThis.Tone;
  if (!Tone) {
    throw new Error(
      "system-symphony: Tone.js is unavailable; load /vendor/tone.min.js first",
    );
  }
  return Tone;
}

export async function startToneWithTimeout(
  Tone,
  timeoutMs = AUDIO_START_TIMEOUT_MS,
) {
  let timeoutId;
  try {
    await Promise.race([
      Tone.start(),
      new Promise((_, reject) => {
        timeoutId = globalThis.setTimeout(() => {
          reject(new Error("system-symphony: audio context did not start in time"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function safeRamp(parameter, value, seconds) {
  if (!parameter || !Number.isFinite(value)) return;
  if (typeof parameter.rampTo === "function") {
    parameter.rampTo(value, Math.max(0.01, seconds));
  } else {
    parameter.value = value;
  }
}

function serviceSynth(Tone, family) {
  switch (family) {
    case "strings":
      return new Tone.FMSynth({
        harmonicity: 1.01,
        modulationIndex: 1.3,
        oscillator: { type: "sine" },
        modulation: { type: "triangle" },
        envelope: { attack: 0.18, decay: 0.45, sustain: 0.62, release: 1.8 },
        modulationEnvelope: { attack: 0.5, decay: 0.4, sustain: 0.35, release: 1.5 },
        volume: -10,
      });
    case "pulse":
      return new Tone.MembraneSynth({
        pitchDecay: 0.025,
        octaves: 2,
        envelope: { attack: 0.002, decay: 0.16, sustain: 0.08, release: 0.35 },
        volume: -12,
      });
    case "brass":
      return new Tone.MonoSynth({
        oscillator: { type: "sawtooth" },
        filter: { type: "lowpass", Q: 2, rolloff: -24 },
        envelope: { attack: 0.08, decay: 0.28, sustain: 0.5, release: 0.9 },
        filterEnvelope: {
          attack: 0.08,
          decay: 0.35,
          sustain: 0.3,
          release: 0.8,
          baseFrequency: 180,
          octaves: 3.2,
        },
        volume: -13,
      });
    case "plucked":
      return new Tone.PluckSynth({
        attackNoise: 0.7,
        dampening: 4200,
        resonance: 0.82,
        volume: -10,
      });
    case "low-strings":
      return new Tone.MonoSynth({
        oscillator: { type: "triangle" },
        filter: { type: "lowpass", Q: 1, rolloff: -24 },
        envelope: { attack: 0.12, decay: 0.45, sustain: 0.7, release: 1.4 },
        filterEnvelope: {
          attack: 0.2,
          decay: 0.5,
          sustain: 0.42,
          release: 1.2,
          baseFrequency: 90,
          octaves: 2.8,
        },
        volume: -12,
      });
    case "spectral-bells":
      return new Tone.FMSynth({
        harmonicity: 2.01,
        modulationIndex: 5,
        oscillator: { type: "sine" },
        modulation: { type: "sine" },
        envelope: { attack: 0.005, decay: 1.2, sustain: 0.05, release: 2.2 },
        modulationEnvelope: { attack: 0.002, decay: 0.9, sustain: 0, release: 1.6 },
        volume: -15,
      });
    case "woodwinds":
    default:
      return new Tone.MonoSynth({
        oscillator: { type: "sine" },
        filter: { type: "lowpass", Q: 3, rolloff: -24 },
        envelope: { attack: 0.09, decay: 0.24, sustain: 0.58, release: 0.9 },
        filterEnvelope: {
          attack: 0.11,
          decay: 0.35,
          sustain: 0.5,
          release: 0.8,
          baseFrequency: 260,
          octaves: 3.4,
        },
        volume: -12,
      });
  }
}

export function createEngine() {
  let initialized = false;
  let running = false;
  let destroyed = false;
  let userVolume = DEFAULT_USER_GAIN;
  let currentFrame = null;
  let phraseIndex = 0;
  let stepIndex = 0;
  let serviceCursor = 0;

  const voices = new Map();
  const voiceParams = new Map();

  let transport = null;
  let schedulerId = null;
  let userGain = null;
  let analyser = null;
  let limiter = null;
  let compressor = null;
  let reverb = null;
  let masterFilter = null;
  let masterVolume = null;
  let serviceBus = null;
  let padGain = null;
  let bassGain = null;
  let percussionGain = null;
  let deploymentGain = null;
  let pad = null;
  let bass = null;
  let kick = null;
  let noise = null;
  let noiseFilter = null;
  let deploymentSynth = null;
  let voiceHandler = null;
  let incidentHandler = null;
  let deploymentHandler = null;

  function createServiceVoice(params) {
    const Tone = requireTone();
    const synth = serviceSynth(Tone, params.instrumentFamily);
    const filter = new Tone.Filter({
      type: "lowpass",
      frequency: 3600,
      rolloff: -24,
      Q: 1,
    });
    const panner = new Tone.Panner(params.pan);
    const gain = new Tone.Gain(0);
    synth.chain(filter, panner, gain, serviceBus);
    const voice = { synth, filter, panner, gain, removalTimer: null };
    voices.set(params.name, voice);
    return voice;
  }

  function disposeServiceVoice(name, voice) {
    if (voice.removalTimer !== null) clearTimeout(voice.removalTimer);
    voice.synth.dispose();
    voice.filter.dispose();
    voice.panner.dispose();
    voice.gain.dispose();
    voices.delete(name);
  }

  function syncServiceVoices(frameVoices) {
    const desired = new Set(
      frameVoices.slice(0, MAX_SERVICE_VOICES).map((voice) => voice.name),
    );
    for (const params of frameVoices.slice(0, MAX_SERVICE_VOICES)) {
      let voice = voices.get(params.name);
      if (!voice) voice = createServiceVoice(params);
      if (voice.removalTimer !== null) {
        clearTimeout(voice.removalTimer);
        voice.removalTimer = null;
      }
    }
    for (const [name, voice] of voices) {
      if (desired.has(name) || voice.removalTimer !== null) continue;
      safeRamp(voice.gain.gain, 0, VOICE_REMOVE_RAMP_SECONDS);
      voice.removalTimer = setTimeout(
        () => disposeServiceVoice(name, voice),
        (VOICE_REMOVE_RAMP_SECONDS + 0.1) * 1000,
      );
    }
  }

  function buildGraph(Tone) {
    userGain = new Tone.Gain(0).toDestination();
    analyser = new Tone.Analyser("waveform", WAVEFORM_SIZE);
    limiter = new Tone.Limiter(-2);
    compressor = new Tone.Compressor(-18, 3);
    reverb = new Tone.Reverb({ decay: 3.2, wet: 0.24 });
    masterFilter = new Tone.Filter({
      type: "lowpass",
      frequency: 5200,
      rolloff: -24,
      Q: 0.7,
    });
    masterVolume = new Tone.Volume(-12);
    masterVolume.chain(masterFilter, reverb, compressor, limiter, userGain);
    limiter.connect(analyser);

    serviceBus = new Tone.Gain(0.82).connect(masterVolume);
    padGain = new Tone.Gain(0.5).connect(masterVolume);
    bassGain = new Tone.Gain(0.3).connect(masterVolume);
    percussionGain = new Tone.Gain(0).connect(masterVolume);
    deploymentGain = new Tone.Gain(0.72).connect(masterVolume);

    pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 1.2, decay: 1.1, sustain: 0.64, release: 4.2 },
      volume: -14,
    }).connect(padGain);

    bass = new Tone.MonoSynth({
      oscillator: { type: "triangle" },
      filter: { type: "lowpass", Q: 1, rolloff: -24 },
      envelope: { attack: 0.08, decay: 0.4, sustain: 0.55, release: 1.1 },
      filterEnvelope: {
        attack: 0.12,
        decay: 0.42,
        sustain: 0.32,
        release: 0.8,
        baseFrequency: 65,
        octaves: 2.4,
      },
      volume: -12,
    }).connect(bassGain);

    kick = new Tone.MembraneSynth({
      pitchDecay: 0.045,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.28, sustain: 0.02, release: 0.35 },
      volume: -8,
    }).connect(percussionGain);
    noise = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.001, decay: 0.055, sustain: 0 },
      volume: -17,
    });
    noiseFilter = new Tone.Filter({
      type: "bandpass",
      frequency: 1800,
      Q: 1.5,
    });
    noise.chain(noiseFilter, percussionGain);

    deploymentSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.015, decay: 0.22, sustain: 0.35, release: 1.4 },
      volume: -8,
    }).connect(deploymentGain);

    transport = Tone.getTransport();
    schedulerId = transport.scheduleRepeat(onEighth, "8n");
    initialized = true;
  }

  function playPad(time, frame, step) {
    if (step !== 0) return;
    const chords = PAD_CHORDS[frame.scoreState];
    const chord = chords[phraseIndex % chords.length];
    const inversion = Math.floor(phraseIndex / chords.length) % chord.length;
    const notes = chord.map((degree, index) => {
      const scaleOffset = frame.scale[degree % frame.scale.length];
      const octave = index < inversion ? 24 : 12;
      return midiToFrequencyHz(50 + scaleOffset + octave);
    });
    pad.triggerAttackRelease(notes, frame.scoreState === "unknown" ? "2m" : "1m", time, 0.34);
  }

  function playBass(time, frame, step) {
    if (!BASS_STEPS[frame.scoreState].has(step)) return;
    const phraseSeed = stableHash(`${frame.scoreState}:${phraseIndex}:bass`);
    const degreeChoices = frame.scoreState === "critical" ? [0, 1, 4, 0] : [0, 4, 0, 5];
    const degree = degreeChoices[(step / 4 + phraseSeed) % degreeChoices.length];
    const midi = 38 + frame.scale[degree % frame.scale.length];
    const duration = frame.scoreState === "critical" ? "8n" : "2n";
    bass.triggerAttackRelease(midiToFrequencyHz(midi), duration, time, 0.42);
  }

  function playPercussion(time, frame, step) {
    if (frame.scoreState === "critical") {
      if (step % 8 === 0 || step === 14 || step === 30) {
        kick.triggerAttackRelease("D1", "8n", time, step % 8 === 0 ? 0.72 : 0.48);
      }
      if ([3, 7, 11, 15, 19, 23, 27, 31].includes(step)) {
        noise.triggerAttackRelease(0.055, time, step % 8 === 7 ? 0.42 : 0.28);
      }
    } else if (frame.scoreState === "warning" && (step === 0 || step === 16)) {
      kick.triggerAttackRelease("D1", "16n", time, 0.24);
    }
  }

  function playService(time, frame, step) {
    if (!frame.voices.length) return;
    const chance = randomUnit(
      stableHash(`${frame.scoreState}:${phraseIndex}:${step}:service`),
    );
    if (chance > frame.density) return;

    const params = frame.voices[serviceCursor % frame.voices.length];
    serviceCursor += 1 + ((phraseIndex + step) % 3 === 0 ? 1 : 0);
    const voice = voices.get(params.name);
    if (!voice) return;

    const motifIndex = (phraseIndex + step + params.hash) % params.motifMidi.length;
    const displacementChance = randomUnit(params.hash ^ phraseIndex ^ (step << 8));
    const octave = displacementChance > 0.9 ? 12 : displacementChance < 0.08 ? -12 : 0;
    const midi = params.motifMidi[motifIndex] + octave;
    const frequency = midiToFrequencyHz(midi) * Math.pow(2, params.detuneCents / 1200);
    const duration = NOTE_LENGTHS[params.articulation] ?? "4n";
    const velocity = params.velocity * (params.status === "unknown" ? 0.7 : 1);
    voice.synth.triggerAttackRelease(frequency, duration, time, velocity);

    const Tone = requireTone();
    Tone.Draw.schedule(() => {
      voiceHandler?.(params.name, params);
    }, time);
  }

  function onEighth(time) {
    if (!running || !currentFrame) return;
    const step = stepIndex % PHRASE_STEPS;
    if (step === 0 && stepIndex > 0) phraseIndex += 1;
    playPad(time, currentFrame, step);
    playBass(time, currentFrame, step);
    playPercussion(time, currentFrame, step);
    playService(time, currentFrame, step);
    stepIndex += 1;
  }

  function applyFrameToGraph(frame) {
    syncServiceVoices(frame.voices);
    const transition = frame.transitionSeconds;
    safeRamp(transport.bpm, frame.bpm, transition);
    safeRamp(masterVolume.volume, frame.masterGainDb, transition);
    safeRamp(masterFilter.frequency, frame.masterFilterHz, transition);
    safeRamp(
      padGain.gain,
      frame.scoreState === "unknown" ? 0.3 : frame.scoreState === "warning" ? 0.48 : 0.58,
      transition,
    );
    safeRamp(
      bassGain.gain,
      frame.scoreState === "critical" ? 0.72 : frame.scoreState === "warning" ? 0.46 : 0.25,
      transition,
    );
    safeRamp(
      percussionGain.gain,
      frame.scoreState === "critical" ? 0.84 : frame.scoreState === "warning" ? 0.16 : 0,
      transition,
    );

    voiceParams.clear();
    for (const params of frame.voices) {
      voiceParams.set(params.name, params);
      const voice = voices.get(params.name);
      if (!voice) continue;
      safeRamp(
        voice.filter.frequency,
        Math.max(420, params.filterHz * params.brightness),
        transition,
      );
      safeRamp(voice.gain.gain, params.voiceGain, transition);
      safeRamp(voice.panner.pan, params.pan, 0.3);
      if (voice.synth.detune) {
        safeRamp(voice.synth.detune, params.detuneCents, transition);
      }
    }
  }

  function disposeGraph() {
    if (!initialized) return;
    if (schedulerId !== null) transport.clear(schedulerId);
    for (const [name, voice] of voices) disposeServiceVoice(name, voice);
    for (const node of [
      deploymentSynth,
      noiseFilter,
      noise,
      kick,
      bass,
      pad,
      deploymentGain,
      percussionGain,
      bassGain,
      padGain,
      serviceBus,
      masterVolume,
      masterFilter,
      reverb,
      compressor,
      limiter,
      analyser,
      userGain,
    ]) {
      node?.dispose?.();
    }
    initialized = false;
  }

  return {
    async start() {
      if (destroyed) throw new Error("system-symphony: engine was disposed");
      const Tone = requireTone();
      await startToneWithTimeout(Tone);
      if (!initialized) {
        buildGraph(Tone);
        await reverb.generate();
        if (currentFrame) applyFrameToGraph(currentFrame);
      }
      running = true;
      if (transport.state !== "started") transport.start();
      safeRamp(userGain.gain, userVolume, UI_RAMP_SECONDS);
    },

    pause() {
      if (!initialized || !running) return;
      running = false;
      safeRamp(userGain.gain, 0, UI_RAMP_SECONDS);
    },

    applyFrame(frame) {
      currentFrame = frame;
      if (initialized) applyFrameToGraph(frame);
    },

    queueIncidentAccent(count = 1) {
      if (!initialized || !running || count <= 0) return false;
      const Tone = requireTone();
      const bounded = Math.min(MAX_INCIDENT_ACCENTS, Math.trunc(count));
      const startAt = transport.nextSubdivision("4n");
      const stepSeconds = Tone.Time("4n").toSeconds();
      for (let index = 0; index < bounded; index += 1) {
        transport.scheduleOnce((time) => {
          kick.triggerAttackRelease("D1", "8n", time, 0.88);
          noise.triggerAttackRelease(0.07, time, 0.56);
          Tone.Draw.schedule(() => incidentHandler?.(), time);
        }, startAt + index * stepSeconds);
      }
      return true;
    },

    queueDeploymentMotif(deployment = {}) {
      if (!initialized || !running) return false;
      const Tone = requireTone();
      const startAt = transport.nextSubdivision("4n");
      const stepSeconds = Tone.Time("8n").toSeconds();
      const notes = [62, 69, 76, 78, 74]; // D4, A4, E5, F#5, D5
      notes.forEach((midi, index) => {
        transport.scheduleOnce((time) => {
          deploymentSynth.triggerAttackRelease(
            midiToFrequencyHz(midi),
            index === notes.length - 1 ? "2n" : "8n",
            time,
            0.52,
          );
          Tone.Draw.schedule(
            () => deploymentHandler?.(deployment, index === 0),
            time,
          );
        }, startAt + index * stepSeconds);
      });
      return true;
    },

    setUserVolume(value) {
      userVolume = Math.min(1, Math.max(0, Number(value) || 0));
      if (initialized && running) {
        safeRamp(userGain.gain, userVolume, 0.08);
      }
    },

    getWaveform() {
      if (!initialized || !analyser) return new Float32Array(WAVEFORM_SIZE);
      const value = analyser.getValue();
      return value instanceof Float32Array
        ? value
        : Float32Array.from(value ?? []);
    },

    isInitialized: () => initialized,
    isRunning: () => running,
    setVoiceHandler(handler) {
      voiceHandler = typeof handler === "function" ? handler : null;
    },
    setIncidentHandler(handler) {
      incidentHandler = typeof handler === "function" ? handler : null;
    },
    setDeploymentHandler(handler) {
      deploymentHandler = typeof handler === "function" ? handler : null;
    },
    dispose() {
      if (destroyed) return;
      running = false;
      destroyed = true;
      disposeGraph();
    },
  };
}
