/**
 * Long-form Atlas APU browser renderer.
 *
 * This engine keeps the bounded score frame and composition director, then
 * inserts the deterministic 32-bar arranger before note generation.
 */

import { clamp, sceneForFrame } from "./apu-palette.js?v=20260725-system-symphony-atlas-apu-preview-v1";
import {
  APU_TRACK_PHRASES,
  ATLAS_APU_TRACK_BUILD_ID,
  arrangementForPhrase,
} from "./apu-arranger.js?v=20260725-system-symphony-atlas-apu-track-v1";
import {
  APU_TRACK_STEPS,
  bassEventForTrackStep,
  padChordForTrackStep,
  primaryPulseEventForTrackStep,
  rhythmEventsForTrackStep,
  secondaryPulseEventForTrackStep,
  serviceEventForTrackStep,
  transitionEventForTrackStep,
} from "./apu-track-sequencer.js?v=20260725-system-symphony-atlas-apu-track-v1";
import { createCompositionDirector } from "./composition-director.js?v=20260720-system-symphony-loop-production-v2";
import { midiToFrequencyHz } from "./mapping.js?v=20260720-system-symphony-loop-production-v2";

export const APU_TRACK_AUDIO_START_TIMEOUT_MS = 8000;
export const APU_TRACK_DEFAULT_GAIN = 0.5;
export const APU_TRACK_WAVEFORM_SIZE = 512;
export const APU_TRACK_SPECTRUM_SIZE = 64;
export const APU_TRACK_SERVICE_POOL = 8;

function requireTone() {
  const Tone = globalThis.Tone;
  if (!Tone) throw new Error("system-symphony-apu-track: Tone.js is unavailable");
  return Tone;
}

function safeRamp(parameter, value, seconds = 0.12, at = undefined) {
  if (!parameter || !Number.isFinite(value)) return;
  const duration = Math.max(0.01, Number(seconds) || 0.01);
  const startAt = Number.isFinite(at)
    ? at
    : typeof globalThis.Tone?.now === "function"
      ? globalThis.Tone.now()
      : null;
  if (
    Number.isFinite(startAt)
    && typeof parameter.setValueAtTime === "function"
    && typeof parameter.linearRampToValueAtTime === "function"
  ) {
    const current = Number.isFinite(parameter.value) ? parameter.value : value;
    parameter.cancelScheduledValues?.(startAt);
    parameter.setValueAtTime(current, startAt);
    parameter.linearRampToValueAtTime(value, startAt + duration);
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
          () => reject(new Error("system-symphony-apu-track: audio context start timed out")),
          APU_TRACK_AUDIO_START_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer !== null) globalThis.clearTimeout(timer);
  }
  if (Tone.getContext().state !== "running") {
    throw new Error("system-symphony-apu-track: audio context remains suspended");
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

function createServiceVoice(Tone, output) {
  const synth = new Tone.Synth({
    oscillator: { type: "pulse", width: 0.25 },
    envelope: { attack: 0.003, decay: 0.07, sustain: 0.16, release: 0.1 },
    volume: -15,
  });
  const filter = new Tone.Filter({ type: "lowpass", frequency: 3200, Q: 0.7, rolloff: -24 });
  const panner = new Tone.Panner(0);
  const gain = new Tone.Gain(0.7);
  synth.chain(filter, panner, gain, output);
  return { synth, filter, panner, gain };
}

export function createApuTrackEngine({
  onArrangement = null,
  onVoice = null,
  onRunningChange = null,
  onError = null,
} = {}) {
  let initialized = false;
  let running = false;
  let disposed = false;
  let currentFrame = null;
  let pendingFrame = null;
  let currentDirectorPlan = null;
  let currentArrangement = null;
  let trackPhraseIndex = -1;
  let stepIndex = 0;
  let userVolume = APU_TRACK_DEFAULT_GAIN;
  let pendingDeployment = null;
  let pendingIncidentCount = 0;
  let servicePoolCursor = 0;

  const director = createCompositionDirector({ seed: "ATLAS-APU-TRACK" });

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
  let primaryBus = null;
  let secondaryBus = null;
  let serviceBus = null;
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
  let padFilter = null;
  let kick = null;
  let snare = null;
  let hat = null;
  let openHat = null;
  let hatFilter = null;
  let noiseAccent = null;
  let noiseAccentFilter = null;
  let transitionVoice = null;
  let deploymentVoice = null;
  let incidentVoice = null;
  let serviceVoices = [];

  function emitError(error) {
    onError?.(error instanceof Error ? error : new Error(String(error)));
  }

  function buildGraph(Tone) {
    outputGain = new Tone.Gain(0).toDestination();
    limiter = new Tone.Limiter(-1.5);
    compressor = new Tone.Compressor({ threshold: -20, ratio: 2.5, attack: 0.018, release: 0.2 });
    masterFilter = new Tone.Filter({ type: "lowpass", frequency: 9000, rolloff: -24, Q: 0.7 });
    masterHighpass = new Tone.Filter({ type: "highpass", frequency: 24, rolloff: -12, Q: 0.5 });
    masterVolume = new Tone.Volume(-10);
    crusher = new Tone.BitCrusher(12);
    crusher.wet.value = 0.08;
    chipBus = new Tone.Gain(1);
    chipBus.chain(crusher, masterVolume, masterHighpass, masterFilter, compressor, limiter, outputGain);

    analyser = new Tone.Analyser("waveform", APU_TRACK_WAVEFORM_SIZE);
    spectrumAnalyser = new Tone.Analyser("fft", APU_TRACK_SPECTRUM_SIZE);
    limiter.connect(analyser);
    limiter.connect(spectrumAnalyser);

    melodyBus = new Tone.Gain(0.9).connect(chipBus);
    primaryBus = new Tone.Gain(0).connect(melodyBus);
    secondaryBus = new Tone.Gain(0).connect(melodyBus);
    serviceBus = new Tone.Gain(0).connect(melodyBus);
    bassBus = new Tone.Gain(0).connect(chipBus);
    drumBus = new Tone.Gain(0).connect(chipBus);
    padBus = new Tone.Gain(0).connect(chipBus);
    accentBus = new Tone.Gain(0).connect(chipBus);

    delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.17, wet: 1 });
    delaySend = new Tone.Gain(0.08);
    delayReturn = new Tone.Gain(0.1).connect(chipBus);
    delaySend.chain(delay, delayReturn);
    primaryBus.connect(delaySend);
    secondaryBus.connect(delaySend);

    reverb = new Tone.Freeverb({ roomSize: 0.72, dampening: 3800, wet: 1 });
    reverbSend = new Tone.Gain(0.1);
    reverbReturn = new Tone.Gain(0.1).connect(chipBus);
    reverbSend.chain(reverb, reverbReturn);
    padBus.connect(reverbSend);
    accentBus.connect(reverbSend);

    pulseA = new Tone.Synth({
      oscillator: { type: "pulse", width: 0.25 },
      envelope: { attack: 0.004, decay: 0.08, sustain: 0.24, release: 0.16 },
      volume: -11,
    }).connect(primaryBus);

    pulseB = new Tone.Synth({
      oscillator: { type: "pulse", width: 0.125 },
      envelope: { attack: 0.003, decay: 0.07, sustain: 0.16, release: 0.12 },
      volume: -14,
    }).connect(secondaryBus);

    triangleBass = new Tone.MonoSynth({
      oscillator: { type: "triangle" },
      filter: { type: "lowpass", Q: 0.5, rolloff: -24 },
      envelope: { attack: 0.004, decay: 0.08, sustain: 0.72, release: 0.14 },
      filterEnvelope: {
        attack: 0.006,
        decay: 0.08,
        sustain: 0.6,
        release: 0.1,
        baseFrequency: 72,
        octaves: 1.3,
      },
      volume: -10,
    }).connect(bassBus);

    pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.1, decay: 0.3, sustain: 0.46, release: 1.1 },
      volume: -21,
    });
    padFilter = new Tone.Filter({ type: "lowpass", frequency: 4200, Q: 0.6, rolloff: -24 });
    pad.chain(padFilter, padBus);

    kick = new Tone.MembraneSynth({
      pitchDecay: 0.028,
      octaves: 2.6,
      envelope: { attack: 0.001, decay: 0.14, sustain: 0, release: 0.12 },
      volume: -10,
    }).connect(drumBus);

    snare = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.065, sustain: 0, release: 0.02 },
      volume: -16,
    }).connect(drumBus);

    hat = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.022, sustain: 0 },
      volume: -23,
    });
    openHat = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.04 },
      volume: -24,
    });
    hatFilter = new Tone.Filter({ type: "highpass", frequency: 5200, Q: 0.6, rolloff: -24 });
    hat.connect(hatFilter);
    openHat.connect(hatFilter);
    hatFilter.connect(drumBus);

    noiseAccent = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.001, decay: 0.14, sustain: 0, release: 0.05 },
      volume: -20,
    });
    noiseAccentFilter = new Tone.Filter({ type: "bandpass", frequency: 1800, Q: 2.4 });
    noiseAccent.chain(noiseAccentFilter, accentBus);

    transitionVoice = new Tone.FMSynth({
      harmonicity: 2,
      modulationIndex: 6,
      oscillator: { type: "square" },
      modulation: { type: "triangle" },
      envelope: { attack: 0.002, decay: 0.12, sustain: 0.12, release: 0.24 },
      modulationEnvelope: { attack: 0.002, decay: 0.09, sustain: 0.2, release: 0.16 },
      volume: -13,
    }).connect(accentBus);

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
      { length: APU_TRACK_SERVICE_POOL },
      () => createServiceVoice(Tone, serviceBus),
    );

    transport = Tone.getTransport();
    schedulerId = transport.scheduleRepeat(onStep, "16n");
    initialized = true;
  }

  function applyScene(frame, at = undefined) {
    if (!initialized || !frame) return;
    const scene = sceneForFrame(frame, currentDirectorPlan);
    const profile = scene.profile;
    safeRamp(transport.bpm, currentArrangement?.targetBpm ?? scene.bpm, 0.8, at);
    safeRamp(masterVolume.volume, scene.masterGainDb, 0.8, at);
    safeRamp(masterFilter.frequency, scene.masterFilterHz, 0.8, at);
    safeRamp(masterHighpass.frequency, scene.masterHpHz, 0.8, at);
    setBits(crusher, profile.crusherBits);
    safeRamp(crusher.wet, profile.crusherWet, 0.5, at);
    safeRamp(delayReturn.gain, profile.delayWet, 0.5, at);
    safeRamp(reverbReturn.gain, profile.reverbWet, 0.5, at);
    safeRamp(hatFilter.frequency, profile.noiseBrightnessHz, 0.5, at);
    safeRamp(padFilter.frequency, profile.padCutoffHz, 0.5, at);
    setPulseWidth(pulseA, profile.pulseADuty, at);
    setPulseWidth(pulseB, profile.pulseBDuty, at);
  }

  function applyArrangementMix(at = undefined) {
    if (!currentArrangement) return;
    const mix = currentArrangement.mix;
    safeRamp(primaryBus.gain, mix.primary, 0.18, at);
    safeRamp(secondaryBus.gain, mix.secondary, 0.18, at);
    safeRamp(serviceBus.gain, mix.services, 0.18, at);
    safeRamp(bassBus.gain, mix.bass, 0.18, at);
    safeRamp(drumBus.gain, mix.drums, 0.18, at);
    safeRamp(padBus.gain, mix.pad, 0.18, at);
    safeRamp(accentBus.gain, mix.accent, 0.18, at);
  }

  function commitPhrase(at) {
    if (pendingFrame) {
      currentFrame = pendingFrame;
      pendingFrame = null;
    }
    if (!currentFrame) return;
    director.observe(currentFrame);
    currentDirectorPlan = director.advancePhrase();
    trackPhraseIndex += 1;
    currentArrangement = arrangementForPhrase(currentFrame, currentDirectorPlan, trackPhraseIndex);
    applyScene(currentFrame, at);
    applyArrangementMix(at);
    const Tone = requireTone();
    Tone.Draw.schedule(() => onArrangement?.({
      arrangement: currentArrangement,
      scene: sceneForFrame(currentFrame, currentDirectorPlan),
      cycleProgress: `${currentArrangement.cyclePhrase + 1}/${APU_TRACK_PHRASES}`,
    }), at);
  }

  function playRhythm(time, step) {
    const events = rhythmEventsForTrackStep(currentFrame, currentArrangement, step);
    if (events.kick) kick.triggerAttackRelease("F1", "16n", time, events.kick.velocity);
    if (events.snare) snare.triggerAttackRelease(0.055, time, events.snare.velocity);
    if (events.hat) hat.triggerAttackRelease(0.018, time, events.hat.velocity);
    if (events.openHat) openHat.triggerAttackRelease(0.1, time, events.openHat.velocity);
    if (events.noiseAccent) noiseAccent.triggerAttackRelease(0.1, time, events.noiseAccent.velocity);
  }

  function playBass(time, step) {
    const event = bassEventForTrackStep(currentFrame, currentArrangement, step);
    if (!event) return;
    triangleBass.triggerAttackRelease(midiToFrequencyHz(event.midi), event.duration, time, event.velocity);
  }

  function playPad(time, step) {
    const event = padChordForTrackStep(currentFrame, currentArrangement, step);
    if (!event) return;
    pad.triggerAttackRelease(event.midis.map(midiToFrequencyHz), event.duration, time, event.velocity);
  }

  function playPrimary(time, step) {
    const event = primaryPulseEventForTrackStep(currentFrame, currentArrangement, step);
    if (!event) return;
    pulseA.triggerAttackRelease(midiToFrequencyHz(event.midi), event.duration, time, event.velocity);
  }

  function playSecondary(time, step) {
    const event = secondaryPulseEventForTrackStep(currentFrame, currentArrangement, step);
    if (!event) return;
    pulseB.triggerAttackRelease(midiToFrequencyHz(event.midi), event.duration, time, event.velocity);
  }

  function playService(time, step) {
    const event = serviceEventForTrackStep(currentFrame, currentArrangement, step);
    if (!event) return;
    const slot = serviceVoices[servicePoolCursor % serviceVoices.length];
    servicePoolCursor += 1;
    safeRamp(slot.panner.pan, event.identity.pan, 0.02, time);
    safeRamp(
      slot.filter.frequency,
      event.identity.filtered ? Math.min(1400, event.voice.filterHz ?? 1400) : event.voice.filterHz ?? 3200,
      0.03,
      time,
    );
    setPulseWidth(slot.synth, event.identity.dutyCycle, time);
    if (slot.synth.detune) safeRamp(slot.synth.detune, event.voice.detuneCents ?? 0, 0.03, time);
    slot.synth.triggerAttackRelease(midiToFrequencyHz(event.midi), event.duration, time, event.velocity);
    const Tone = requireTone();
    Tone.Draw.schedule(() => onVoice?.({
      name: event.voice.name,
      channel: event.identity.channel,
      label: event.identity.label,
    }), time);
  }

  function playTransition(time, step) {
    const event = transitionEventForTrackStep(currentFrame, currentArrangement, step);
    if (!event) return;
    if (["rise", "drop", "restart"].includes(event.type)) {
      noiseAccent.triggerAttackRelease(event.type === "drop" ? 0.14 : 0.08, time, Math.min(0.42, event.velocity));
    }
    transitionVoice.triggerAttackRelease(midiToFrequencyHz(event.midi), event.duration, time, event.velocity);
  }

  function scheduleGeneratedCue(events, voice, startAt, subdivision = "16n") {
    const Tone = requireTone();
    const stepSeconds = Tone.Time(subdivision).toSeconds();
    for (const event of events) {
      transport.scheduleOnce((time) => {
        voice.triggerAttackRelease(midiToFrequencyHz(event.midi), event.duration, time, event.velocity);
      }, startAt + event.offset * stepSeconds);
    }
  }

  function deploymentSequence(identity = "deployment") {
    const text = String(identity);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const roots = [65, 67, 68];
    const root = roots[(hash >>> 0) % roots.length];
    return [0, 3, 5, 7, 5, 8].map((offset, index) => ({
      offset: index,
      midi: root + offset,
      duration: index === 5 ? "4n" : "16n",
      velocity: index === 5 ? 0.46 : 0.34,
    }));
  }

  function incidentSequence(count = 1) {
    const boundedCount = Math.max(1, Math.min(4, Math.trunc(count) || 1));
    return Array.from({ length: boundedCount * 2 }, (_, index) => ({
      offset: index,
      midi: index % 2 === 0 ? 54 : 60,
      duration: "32n",
      velocity: index % 2 === 0 ? 0.44 : 0.32,
    }));
  }

  function flushQueuedCues(time) {
    if (pendingDeployment) {
      const identity = pendingDeployment.identity
        ?? pendingDeployment.deployId
        ?? pendingDeployment.commitSha
        ?? "deployment";
      scheduleGeneratedCue(deploymentSequence(identity), deploymentVoice, time);
      pendingDeployment = null;
    }
    if (pendingIncidentCount > 0) {
      scheduleGeneratedCue(incidentSequence(pendingIncidentCount), incidentVoice, time, "32n");
      pendingIncidentCount = 0;
    }
  }

  function onStep(time) {
    if (!running || !currentFrame || !Number.isFinite(time)) return;
    const step = stepIndex % APU_TRACK_STEPS;
    if (step === 0) {
      commitPhrase(time);
      flushQueuedCues(time);
    }
    playRhythm(time, step);
    playBass(time, step);
    playPad(time, step);
    playPrimary(time, step);
    playSecondary(time, step);
    playService(time, step);
    playTransition(time, step);
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
      transitionVoice,
      noiseAccentFilter,
      noiseAccent,
      hatFilter,
      openHat,
      hat,
      snare,
      kick,
      padFilter,
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
      serviceBus,
      secondaryBus,
      primaryBus,
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
    buildId: ATLAS_APU_TRACK_BUILD_ID,

    async start() {
      if (disposed) throw new Error("system-symphony-apu-track: engine is disposed");
      const Tone = requireTone();
      try {
        await startToneWithTimeout(Tone);
        if (!initialized) buildGraph(Tone);
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
      return analyser?.getValue?.() ?? new Float32Array(APU_TRACK_WAVEFORM_SIZE);
    },

    getSpectrum() {
      return spectrumAnalyser?.getValue?.() ?? new Float32Array(APU_TRACK_SPECTRUM_SIZE);
    },

    getScene() {
      return currentFrame ? sceneForFrame(currentFrame, currentDirectorPlan) : null;
    },

    getArrangement() {
      return currentArrangement;
    },

    getPhase() {
      return currentDirectorPlan?.phase ?? "standby";
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
