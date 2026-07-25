/**
 * Atlas APU browser synthesis engine.
 *
 * The engine consumes the existing bounded System Symphony score frame and
 * composition director. Every audible layer is generated in Web Audio through
 * Tone.js. It does not construct Player, Sampler, GrainPlayer, or audio buffers.
 */

import {
  ATLAS_APU_BUILD_ID,
  chipIdentityForVoice,
  clamp,
  sceneForFrame,
} from "./apu-palette.js?v=20260725-system-symphony-atlas-apu-preview-v1";
import {
  APU_PHRASE_STEPS,
  bassEventForStep,
  deploymentSequence,
  incidentSequence,
  padChordForStep,
  rhythmEventsForStep,
  secondaryPulseEventForStep,
  serviceEventForStep,
} from "./apu-sequencer.js?v=20260725-system-symphony-atlas-apu-preview-v1";
import {
  createCompositionDirector,
  motifEventForStep,
} from "./composition-director.js?v=20260720-system-symphony-loop-production-v2";
import { midiToFrequencyHz } from "./mapping.js?v=20260720-system-symphony-loop-production-v2";

export const APU_AUDIO_START_TIMEOUT_MS = 8000;
export const APU_DEFAULT_GAIN = 0.5;
export const APU_WAVEFORM_SIZE = 512;
export const APU_SPECTRUM_SIZE = 64;
export const APU_MAX_SERVICE_POOL = 6;

function requireTone() {
  const Tone = globalThis.Tone;
  if (!Tone) {
    throw new Error("system-symphony-apu: Tone.js is unavailable");
  }
  return Tone;
}

function safeRamp(parameter, value, seconds = 0.12, at = undefined) {
  if (!parameter || !Number.isFinite(value)) return;
  const duration = Math.max(0.01, Number(seconds) || 0.01);
  if (
    Number.isFinite(at)
    && typeof parameter.setValueAtTime === "function"
    && typeof parameter.linearRampToValueAtTime === "function"
  ) {
    parameter.cancelScheduledValues?.(at);
    parameter.setValueAtTime(parameter.value, at);
    parameter.linearRampToValueAtTime(value, at + duration);
    return;
  }
  if (typeof parameter.rampTo === "function") {
    parameter.rampTo(value, duration);
    return;
  }
  parameter.value = value;
}

async function startToneWithTimeout(Tone) {
  let timer = null;
  try {
    await Promise.race([
      Tone.start(),
      new Promise((_, reject) => {
        timer = globalThis.setTimeout(
          () => reject(new Error("system-symphony-apu: audio context start timed out")),
          APU_AUDIO_START_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer !== null) globalThis.clearTimeout(timer);
  }
  if (Tone.getContext().state !== "running") {
    throw new Error("system-symphony-apu: audio context remains suspended");
  }
}

function setPulseWidth(synth, width, at = undefined) {
  const parameter = synth?.oscillator?.width;
  if (!parameter) return;
  safeRamp(parameter, clamp(width, 0.08, 0.75), 0.08, at);
}

function setBits(crusher, bits) {
  if (!crusher?.bits) return;
  const bounded = Math.round(clamp(bits, 4, 16));
  if (crusher.bits.value !== bounded) crusher.bits.value = bounded;
}

function makeServiceVoice(Tone, output) {
  const synth = new Tone.Synth({
    oscillator: { type: "pulse", width: 0.25 },
    envelope: { attack: 0.003, decay: 0.08, sustain: 0.18, release: 0.12 },
    volume: -15,
  });
  const filter = new Tone.Filter({ type: "lowpass", frequency: 3200, Q: 0.7, rolloff: -24 });
  const panner = new Tone.Panner(0);
  const gain = new Tone.Gain(0.7);
  synth.chain(filter, panner, gain, output);
  return { synth, filter, panner, gain };
}

export function createApuEngine({
  onPhase = null,
  onVoice = null,
  onRunningChange = null,
  onError = null,
} = {}) {
  let initialized = false;
  let running = false;
  let disposed = false;
  let currentFrame = null;
  let pendingFrame = null;
  let phraseIndex = 0;
  let stepIndex = 0;
  let currentPlan = null;
  let userVolume = APU_DEFAULT_GAIN;
  let pendingDeployment = null;
  let pendingIncidentCount = 0;
  let servicePoolCursor = 0;

  const director = createCompositionDirector({ seed: "ATLAS-APU-LIVE" });

  let transport = null;
  let schedulerId = null;
  let outputGain = null;
  let limiter = null;
  let compressor = null;
  let masterFilter = null;
  let masterHighpass = null;
  let masterVolume = null;
  let analyser = null;
  let spectrumAnalyser = null;
  let crusher = null;
  let chipBus = null;
  let melodyBus = null;
  let bassBus = null;
  let drumBus = null;
  let padBus = null;
  let accentBus = null;
  let delay = null;
  let delaySend = null;
  let delayReturn = null;
  let reverb = null;
  let reverbSend = null;
  let reverbReturn = null;
  let pulseA = null;
  let pulseB = null;
  let triangleBass = null;
  let pad = null;
  let kick = null;
  let snare = null;
  let hat = null;
  let hatFilter = null;
  let noiseAccent = null;
  let noiseAccentFilter = null;
  let deploymentVoice = null;
  let incidentVoice = null;
  let serviceVoices = [];

  function emitError(error) {
    onError?.(error instanceof Error ? error : new Error(String(error)));
  }

  function buildGraph(Tone) {
    outputGain = new Tone.Gain(0).toDestination();
    limiter = new Tone.Limiter(-1.5);
    compressor = new Tone.Compressor({ threshold: -20, ratio: 2.4, attack: 0.02, release: 0.18 });
    masterFilter = new Tone.Filter({ type: "lowpass", frequency: 9000, rolloff: -24, Q: 0.7 });
    masterHighpass = new Tone.Filter({ type: "highpass", frequency: 24, rolloff: -12, Q: 0.5 });
    masterVolume = new Tone.Volume(-10);
    crusher = new Tone.BitCrusher(12);
    crusher.wet.value = 0.08;
    chipBus = new Tone.Gain(1);
    chipBus.chain(crusher, masterVolume, masterHighpass, masterFilter, compressor, limiter, outputGain);

    analyser = new Tone.Analyser("waveform", APU_WAVEFORM_SIZE);
    spectrumAnalyser = new Tone.Analyser("fft", APU_SPECTRUM_SIZE);
    limiter.connect(analyser);
    limiter.connect(spectrumAnalyser);

    melodyBus = new Tone.Gain(0.82).connect(chipBus);
    bassBus = new Tone.Gain(0.74).connect(chipBus);
    drumBus = new Tone.Gain(0.58).connect(chipBus);
    padBus = new Tone.Gain(0.38).connect(chipBus);
    accentBus = new Tone.Gain(0.7).connect(chipBus);

    delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.16, wet: 1 });
    delaySend = new Tone.Gain(0.08);
    delayReturn = new Tone.Gain(0.12).connect(chipBus);
    delaySend.chain(delay, delayReturn);
    melodyBus.connect(delaySend);

    reverb = new Tone.Reverb({ decay: 1.35, wet: 1 });
    reverbSend = new Tone.Gain(0.1);
    reverbReturn = new Tone.Gain(0.1).connect(chipBus);
    reverbSend.chain(reverb, reverbReturn);
    padBus.connect(reverbSend);
    accentBus.connect(reverbSend);

    pulseA = new Tone.Synth({
      oscillator: { type: "pulse", width: 0.25 },
      envelope: { attack: 0.004, decay: 0.08, sustain: 0.24, release: 0.16 },
      volume: -12,
    }).connect(melodyBus);

    pulseB = new Tone.Synth({
      oscillator: { type: "pulse", width: 0.125 },
      envelope: { attack: 0.003, decay: 0.07, sustain: 0.16, release: 0.12 },
      volume: -15,
    }).connect(melodyBus);

    triangleBass = new Tone.MonoSynth({
      oscillator: { type: "triangle" },
      filter: { type: "lowpass", Q: 0.5, rolloff: -24 },
      envelope: { attack: 0.004, decay: 0.08, sustain: 0.72, release: 0.12 },
      filterEnvelope: {
        attack: 0.006,
        decay: 0.08,
        sustain: 0.6,
        release: 0.1,
        baseFrequency: 72,
        octaves: 1.3,
      },
      volume: -11,
    }).connect(bassBus);

    pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.12, decay: 0.32, sustain: 0.44, release: 1.2 },
      volume: -22,
    }).connect(padBus);

    kick = new Tone.MembraneSynth({
      pitchDecay: 0.028,
      octaves: 2.6,
      envelope: { attack: 0.001, decay: 0.14, sustain: 0, release: 0.12 },
      volume: -11,
    }).connect(drumBus);

    snare = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.065, sustain: 0, release: 0.02 },
      volume: -17,
    }).connect(drumBus);

    hat = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.022, sustain: 0 },
      volume: -24,
    });
    hatFilter = new Tone.Filter({ type: "highpass", frequency: 5200, Q: 0.6, rolloff: -24 });
    hat.chain(hatFilter, drumBus);

    noiseAccent = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.04 },
      volume: -21,
    });
    noiseAccentFilter = new Tone.Filter({ type: "bandpass", frequency: 1800, Q: 2.4 });
    noiseAccent.chain(noiseAccentFilter, accentBus);

    deploymentVoice = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "pulse", width: 0.25 },
      envelope: { attack: 0.002, decay: 0.11, sustain: 0.18, release: 0.28 },
      volume: -10,
    }).connect(accentBus);

    incidentVoice = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0.05, release: 0.04 },
      volume: -13,
    }).connect(accentBus);

    serviceVoices = Array.from(
      { length: APU_MAX_SERVICE_POOL },
      () => makeServiceVoice(Tone, melodyBus),
    );

    transport = Tone.getTransport();
    schedulerId = transport.scheduleRepeat(onStep, "16n");
    initialized = true;
  }

  function applyScene(frame, at = undefined) {
    if (!initialized || !frame) return;
    const scene = sceneForFrame(frame, currentPlan);
    const profile = scene.profile;
    safeRamp(transport.bpm, scene.bpm, 0.8, at);
    safeRamp(masterVolume.volume, scene.masterGainDb, 0.8, at);
    safeRamp(masterFilter.frequency, scene.masterFilterHz, 0.8, at);
    safeRamp(masterHighpass.frequency, scene.masterHpHz, 0.8, at);
    setBits(crusher, profile.crusherBits);
    safeRamp(crusher.wet, profile.crusherWet, 0.5, at);
    safeRamp(delayReturn.gain, profile.delayWet, 0.5, at);
    safeRamp(reverbReturn.gain, profile.reverbWet, 0.5, at);
    safeRamp(hatFilter.frequency, profile.noiseBrightnessHz, 0.5, at);
    setPulseWidth(pulseA, profile.pulseADuty, at);
    setPulseWidth(pulseB, profile.pulseBDuty, at);
    if (triangleBass?.filter?.frequency) {
      safeRamp(triangleBass.filter.frequency, profile.bassCutoffHz, 0.5, at);
    }
  }

  function commitFrame(at) {
    if (pendingFrame) {
      currentFrame = pendingFrame;
      pendingFrame = null;
    }
    if (!currentFrame) return;
    director.observe(currentFrame);
    currentPlan = director.advancePhrase();
    phraseIndex = currentPlan?.phraseIndex ?? phraseIndex + 1;
    applyScene(currentFrame, at);
    const Tone = requireTone();
    Tone.Draw.schedule(() => onPhase?.({
      phase: currentPlan?.phase ?? "establish",
      phraseIndex,
      scene: sceneForFrame(currentFrame, currentPlan),
    }), at);
  }

  function playRhythm(time, step) {
    const events = rhythmEventsForStep(currentFrame.scoreState, step, currentFrame.density);
    if (events.kick) kick.triggerAttackRelease("F1", "16n", time, events.kick.velocity);
    if (events.snare) snare.triggerAttackRelease(0.055, time, events.snare.velocity);
    if (events.hat) hat.triggerAttackRelease(0.018, time, events.hat.velocity);
    if (events.noiseAccent) noiseAccent.triggerAttackRelease(0.08, time, events.noiseAccent.velocity);
  }

  function playBass(time, step) {
    const event = bassEventForStep(currentFrame, currentPlan, step, phraseIndex);
    if (!event) return;
    triangleBass.triggerAttackRelease(
      midiToFrequencyHz(event.midi),
      event.duration,
      time,
      event.velocity,
    );
  }

  function playPad(time, step) {
    const event = padChordForStep(currentFrame, currentPlan, step, phraseIndex);
    if (!event) return;
    pad.triggerAttackRelease(
      event.midis.map(midiToFrequencyHz),
      event.duration,
      time,
      event.velocity,
    );
  }

  function playPrimaryPulse(time, step) {
    const event = motifEventForStep(currentPlan, currentFrame.scale, step);
    if (!event) return;
    pulseA.triggerAttackRelease(
      midiToFrequencyHz(event.midi),
      event.duration,
      time,
      event.velocity,
    );
  }

  function playSecondaryPulse(time, step) {
    const event = secondaryPulseEventForStep(currentFrame, currentPlan, step, phraseIndex);
    if (!event) return;
    pulseB.triggerAttackRelease(
      midiToFrequencyHz(event.midi),
      event.duration,
      time,
      event.velocity,
    );
  }

  function playService(time, step) {
    const event = serviceEventForStep(currentFrame, step, phraseIndex);
    if (!event) return;
    const slot = serviceVoices[servicePoolCursor % serviceVoices.length];
    servicePoolCursor += 1;
    const identity = event.identity ?? chipIdentityForVoice(event.voice);
    safeRamp(slot.panner.pan, identity.pan, 0.02, time);
    safeRamp(
      slot.filter.frequency,
      identity.filtered ? Math.min(1400, event.voice.filterHz ?? 1400) : event.voice.filterHz ?? 3200,
      0.03,
      time,
    );
    setPulseWidth(slot.synth, identity.dutyCycle, time);
    if (slot.synth.detune) safeRamp(slot.synth.detune, event.voice.detuneCents ?? 0, 0.03, time);
    slot.synth.triggerAttackRelease(
      midiToFrequencyHz(event.midi),
      event.duration,
      time,
      event.velocity,
    );
    const Tone = requireTone();
    Tone.Draw.schedule(() => onVoice?.({
      name: event.voice.name,
      channel: identity.channel,
      label: identity.label,
    }), time);
  }

  function scheduleGeneratedCue(events, voice, startAt, subdivision = "16n") {
    const Tone = requireTone();
    const stepSeconds = Tone.Time(subdivision).toSeconds();
    for (const event of events) {
      transport.scheduleOnce((time) => {
        voice.triggerAttackRelease(
          midiToFrequencyHz(event.midi),
          event.duration,
          time,
          event.velocity,
        );
      }, startAt + event.offset * stepSeconds);
    }
  }

  function flushQueuedCues(time) {
    if (pendingDeployment) {
      const identity = pendingDeployment.identity
        ?? pendingDeployment.deployId
        ?? pendingDeployment.commitSha
        ?? "deployment";
      scheduleGeneratedCue(
        deploymentSequence(currentFrame, identity),
        deploymentVoice,
        time,
      );
      pendingDeployment = null;
    }
    if (pendingIncidentCount > 0) {
      scheduleGeneratedCue(
        incidentSequence(currentFrame, pendingIncidentCount),
        incidentVoice,
        time,
        "32n",
      );
      pendingIncidentCount = 0;
    }
  }

  function onStep(time) {
    if (!running || !currentFrame || !Number.isFinite(time)) return;
    const step = stepIndex % APU_PHRASE_STEPS;
    if (step === 0) {
      commitFrame(time);
      flushQueuedCues(time);
    }
    playRhythm(time, step);
    playBass(time, step);
    playPad(time, step);
    playPrimaryPulse(time, step);
    playSecondaryPulse(time, step);
    playService(time, step);
    stepIndex += 1;
  }

  function disposeGraph() {
    if (!initialized) return;
    transport?.stop?.();
    if (schedulerId !== null) transport.clear(schedulerId);
    for (const voice of serviceVoices) {
      voice.synth.dispose();
      voice.filter.dispose();
      voice.panner.dispose();
      voice.gain.dispose();
    }
    serviceVoices = [];
    for (const node of [
      incidentVoice,
      deploymentVoice,
      noiseAccentFilter,
      noiseAccent,
      hatFilter,
      hat,
      snare,
      kick,
      pad,
      triangleBass,
      pulseB,
      pulseA,
      reverbReturn,
      reverb,
      reverbSend,
      delayReturn,
      delay,
      delaySend,
      accentBus,
      padBus,
      drumBus,
      bassBus,
      melodyBus,
      chipBus,
      crusher,
      masterVolume,
      masterHighpass,
      masterFilter,
      compressor,
      limiter,
      spectrumAnalyser,
      analyser,
      outputGain,
    ]) node?.dispose?.();
    schedulerId = null;
    initialized = false;
  }

  return Object.freeze({
    buildId: ATLAS_APU_BUILD_ID,

    async start() {
      if (disposed) throw new Error("system-symphony-apu: engine is disposed");
      const Tone = requireTone();
      try {
        await startToneWithTimeout(Tone);
        if (!initialized) {
          buildGraph(Tone);
          await reverb.generate();
          if (currentFrame) {
            director.observe(currentFrame);
            currentPlan = director.advancePhrase();
            phraseIndex = currentPlan?.phraseIndex ?? 0;
            applyScene(currentFrame);
          }
        }
        running = true;
        if (transport.state !== "started") transport.start();
        safeRamp(outputGain.gain, userVolume, 0.18);
        onRunningChange?.(true);
        return true;
      } catch (error) {
        emitError(error);
        throw error;
      }
    },

    pause() {
      if (!initialized || !running) return;
      running = false;
      safeRamp(outputGain.gain, 0, 0.16);
      onRunningChange?.(false);
    },

    applyFrame(frame) {
      if (!frame || typeof frame !== "object") return false;
      if (!currentFrame || !initialized || !running) {
        currentFrame = frame;
        pendingFrame = null;
        director.observe(frame);
        if (initialized) {
          currentPlan = director.advancePhrase();
          phraseIndex = currentPlan?.phraseIndex ?? phraseIndex;
          applyScene(frame);
        }
        return true;
      }
      pendingFrame = frame;
      return true;
    },

    setVolume(value) {
      userVolume = clamp(Number(value), 0, 1);
      if (outputGain && running) safeRamp(outputGain.gain, userVolume, 0.1);
      return userVolume;
    },

    queueDeployment(deployment) {
      if (!deployment || typeof deployment !== "object") return false;
      pendingDeployment = { ...deployment };
      return true;
    },

    queueIncident(count = 1) {
      pendingIncidentCount = Math.max(
        pendingIncidentCount,
        Math.min(4, Math.max(1, Math.trunc(count) || 1)),
      );
      return true;
    },

    getWaveform() {
      return analyser?.getValue?.() ?? new Float32Array(APU_WAVEFORM_SIZE);
    },

    getSpectrum() {
      return spectrumAnalyser?.getValue?.() ?? new Float32Array(APU_SPECTRUM_SIZE);
    },

    getScene() {
      return currentFrame ? sceneForFrame(currentFrame, currentPlan) : null;
    },

    getPhase() {
      return currentPlan?.phase ?? "standby";
    },

    isRunning() {
      return running;
    },

    isInitialized() {
      return initialized;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      running = false;
      disposeGraph();
      onRunningChange?.(false);
    },
  });
}
