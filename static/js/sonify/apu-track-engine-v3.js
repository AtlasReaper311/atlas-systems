import { clamp, sceneForFrame } from "./apu-palette.js?v=20260725-system-symphony-atlas-apu-preview-v1";
import {
  APU_TRACK_PHRASES,
  ATLAS_APU_TRACK_BUILD_ID,
  arrangementForPhrase,
} from "./apu-arranger.js?v=20260726-system-symphony-atlas-chip-laws-v3";
import {
  APU_TRACK_STEPS,
  bassEventForTrackStep,
  padChordForTrackStep,
  primaryPulseEventForTrackStep,
  quantizeMidiToHarmony,
  rhythmEventsForTrackStep,
  secondaryPulseEventForTrackStep,
  serviceEventForTrackStep,
  transitionEventForTrackStep,
} from "./apu-track-sequencer.js?v=20260726-system-symphony-atlas-chip-laws-v3";
import { createCompositionDirector } from "./composition-director.js?v=20260720-system-symphony-loop-production-v2";
import { midiToFrequencyHz } from "./mapping.js?v=20260720-system-symphony-loop-production-v2";
import {
  ATLAS_APU_ENGINE_CONTROLS_BUILD_ID,
  engineControlsForFrame,
} from "./atlas-apu-engine-controls.js?v=20260726-atlas-apu-engine-controls-v4";
import {
  APU_MASTERING_DEFAULT_USER_GAIN,
  APU_MASTERING_LIMITER_CEILING_DB,
} from "./apu-mastering.js?v=20260726-system-symphony-mastering-v4";

export const APU_TRACK_AUDIO_START_TIMEOUT_MS = 8000;
export const APU_TRACK_DEFAULT_GAIN = APU_MASTERING_DEFAULT_USER_GAIN;
export const APU_TRACK_WAVEFORM_SIZE = 512;
export const APU_TRACK_SPECTRUM_SIZE = 64;
export const APU_TRACK_SERVICE_POOL = 8;
export const APU_TRACK_BPM = 100;
export const APU_TRACK_CRITICAL_CHOKE_SECONDS = 0.09;
export const APU_TRACK_PULSE_WIDTH_LEAD_SECONDS = 0.028;
export const APU_TRACK_TRANSITION_ORNAMENT_OFFSET_SECONDS = 0.012;

function requireTone() {
  const Tone = globalThis.Tone;
  if (!Tone) throw new Error("system-symphony-apu-track: Tone.js is unavailable");
  return Tone;
}

export function safeRamp(parameter, value, seconds = 0.12, at = undefined) {
  if (!parameter || !Number.isFinite(value)) return;
  const duration = Math.max(0.01, Number(seconds) || 0.01);
  const startAt = Number.isFinite(at)
    ? at
    : typeof globalThis.Tone?.now === "function"
      ? globalThis.Tone.now()
      : null;
  if (
    Number.isFinite(startAt)
    && typeof parameter.cancelAndHoldAtTime === "function"
    && typeof parameter.linearRampToValueAtTime === "function"
  ) {
    parameter.cancelAndHoldAtTime(startAt);
    parameter.linearRampToValueAtTime(value, startAt + duration);
    return;
  }
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

function setBits(crusher, bits) {
  if (!crusher?.bits) return;
  const value = Math.round(clamp(bits, 4, 16));
  if (crusher.bits.value !== value) crusher.bits.value = value;
}

function setPulseWidth(synth, width, at = undefined) {
  const parameter = synth?.oscillator?.width;
  if (parameter) safeRamp(parameter, clamp(width, 0.08, 0.75), 0.04, at);
}

function pulseWidthLeadTime(time) {
  return Number.isFinite(time)
    ? Math.max(0, time - APU_TRACK_PULSE_WIDTH_LEAD_SECONDS)
    : undefined;
}

function createServiceVoice(Tone, output, index) {
  const oscillators = [
    { type: "pulse", width: 0.25 },
    { type: "triangle" },
    { type: "sawtooth" },
    { type: "square" },
  ];
  const oscillator = oscillators[index % oscillators.length];
  const synth = new Tone.Synth({
    oscillator,
    envelope: {
      attack: index % 2 === 0 ? 0.003 : 0.012,
      decay: index % 3 === 0 ? 0.055 : 0.09,
      sustain: index % 2 === 0 ? 0.12 : 0.22,
      release: index % 3 === 0 ? 0.08 : 0.16,
    },
    volume: -17,
  });
  const filter = new Tone.Filter({
    type: index % 3 === 1 ? "bandpass" : "lowpass",
    frequency: 2800 + index * 180,
    Q: index % 3 === 1 ? 1.8 : 0.7,
    rolloff: -24,
  });
  const panner = new Tone.Panner(0);
  const gain = new Tone.Gain(index % 2 === 0 ? 0.64 : 0.52);
  synth.chain(filter, panner, gain, output);
  return { synth, filter, panner, gain, oscillatorType: oscillator.type };
}

function stateKey(frame) {
  const value = String(frame?.scoreState ?? "unknown");
  return ["healthy", "warning", "critical", "unknown"].includes(value) ? value : "unknown";
}

function compressionForRange(dynamicRangeDb) {
  if (dynamicRangeDb <= 6) return Object.freeze({ threshold: -25, ratio: 5.2, attack: 0.006, release: 0.11 });
  if (dynamicRangeDb <= 9) return Object.freeze({ threshold: -21, ratio: 3.1, attack: 0.012, release: 0.16 });
  if (dynamicRangeDb >= 16) return Object.freeze({ threshold: -13, ratio: 1.25, attack: 0.035, release: 0.32 });
  return Object.freeze({ threshold: -18, ratio: 1.7, attack: 0.022, release: 0.24 });
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
  let lastStateTransition = null;
  let lastTransitionEvent = null;
  let currentEngineControls = engineControlsForFrame();

  const director = createCompositionDirector({ seed: "ATLAS-APU-TRACK" });
  const channelFailures = new Map();
  const scheduledCueIds = new Set();
  const nodes = {};
  let serviceVoices = [];

  function emitError(error) {
    onError?.(error instanceof Error ? error : new Error(String(error)));
  }

  function runChannel(name, callback) {
    try {
      callback();
      channelFailures.delete(name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (channelFailures.get(name) === message) return;
      channelFailures.set(name, message);
      emitError(new Error(`system-symphony-apu-track: ${name} channel failed: ${message}`));
    }
  }

  function buildGraph(Tone) {
    nodes.output = new Tone.Gain(0).toDestination();
    nodes.limiter = new Tone.Limiter(APU_MASTERING_LIMITER_CEILING_DB);
    nodes.compressor = new Tone.Compressor({ threshold: -18, ratio: 1.7, attack: 0.022, release: 0.24 });
    nodes.masterFilter = new Tone.Filter({ type: "lowpass", frequency: 9000, rolloff: -24, Q: 0.7 });
    nodes.masterHighpass = new Tone.Filter({ type: "highpass", frequency: 24, rolloff: -12, Q: 0.5 });
    nodes.masterVolume = new Tone.Volume(-10);
    nodes.chipBus = new Tone.Gain(1);
    nodes.chipBus.chain(
      nodes.masterVolume,
      nodes.masterHighpass,
      nodes.masterFilter,
      nodes.compressor,
      nodes.limiter,
      nodes.output,
    );

    nodes.waveform = new Tone.Analyser("waveform", APU_TRACK_WAVEFORM_SIZE);
    nodes.spectrum = new Tone.Analyser("fft", APU_TRACK_SPECTRUM_SIZE);
    nodes.limiter.connect(nodes.waveform);
    nodes.limiter.connect(nodes.spectrum);

    nodes.melodyBus = new Tone.Gain(0.9).connect(nodes.chipBus);
    nodes.chipColor = new Tone.BitCrusher(12);
    nodes.chipColor.wet.value = 0.08;
    nodes.primaryBus = new Tone.Gain(0).connect(nodes.melodyBus);
    nodes.secondaryBus = new Tone.Gain(0).connect(nodes.melodyBus);
    nodes.serviceBus = new Tone.Gain(0);
    nodes.serviceBus.chain(nodes.chipColor, nodes.melodyBus);
    nodes.bassBus = new Tone.Gain(0).connect(nodes.chipBus);
    nodes.drumBus = new Tone.Gain(0).connect(nodes.chipBus);
    nodes.padBus = new Tone.Gain(0).connect(nodes.chipBus);
    nodes.accentBus = new Tone.Gain(0).connect(nodes.chipBus);

    nodes.delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.13, wet: 1 });
    nodes.delaySend = new Tone.Gain(0.06);
    nodes.delayReturn = new Tone.Gain(0.08).connect(nodes.chipBus);
    nodes.delaySend.chain(nodes.delay, nodes.delayReturn);
    nodes.primaryBus.connect(nodes.delaySend);
    nodes.secondaryBus.connect(nodes.delaySend);

    nodes.reverb = new Tone.Freeverb({ roomSize: 0.7, dampening: 3900, wet: 1 });
    nodes.reverbSend = new Tone.Gain(0.1);
    nodes.reverbReturn = new Tone.Gain(0.1).connect(nodes.chipBus);
    nodes.reverbSend.chain(nodes.reverb, nodes.reverbReturn);
    nodes.padBus.connect(nodes.reverbSend);
    nodes.accentBus.connect(nodes.reverbSend);

    nodes.primary = new Tone.Synth({
      oscillator: { type: "pulse", width: 0.5 },
      envelope: { attack: 0.006, decay: 0.075, sustain: 0.2, release: 0.13 },
      volume: -12,
    });
    nodes.primaryFilter = new Tone.Filter({ type: "lowpass", frequency: 4800, Q: 1.25, rolloff: -24 });
    nodes.primaryPanner = new Tone.Panner(-0.2);
    nodes.primary.chain(nodes.primaryFilter, nodes.primaryPanner, nodes.primaryBus);

    nodes.secondary = new Tone.FMSynth({
      harmonicity: 1.5,
      modulationIndex: 3.2,
      oscillator: { type: "pulse", width: 0.25 },
      modulation: { type: "square" },
      envelope: { attack: 0.003, decay: 0.08, sustain: 0.08, release: 0.12 },
      modulationEnvelope: { attack: 0.002, decay: 0.06, sustain: 0.12, release: 0.1 },
      volume: -16,
    });
    nodes.secondaryFilter = new Tone.Filter({ type: "bandpass", frequency: 3300, Q: 1.1, rolloff: -24 });
    nodes.secondaryPanner = new Tone.Panner(0.2);
    nodes.secondary.chain(nodes.secondaryFilter, nodes.secondaryPanner, nodes.secondaryBus);

    nodes.bass = new Tone.MonoSynth({
      oscillator: { type: "triangle" },
      filter: { type: "lowpass", Q: 0.5, rolloff: -24 },
      envelope: { attack: 0.004, decay: 0.08, sustain: 0.68, release: 0.12 },
      filterEnvelope: {
        attack: 0.006,
        decay: 0.08,
        sustain: 0.56,
        release: 0.1,
        baseFrequency: 72,
        octaves: 1.25,
      },
      volume: -11,
    }).connect(nodes.bassBus);

    nodes.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 0.16, decay: 0.36, sustain: 0.5, release: 1.2 },
      volume: -22,
    });
    nodes.padSub = new Tone.MonoSynth({
      oscillator: { type: "square" },
      filter: { type: "lowpass", frequency: 310, Q: 0.8, rolloff: -24 },
      envelope: { attack: 0.004, decay: 0.075, sustain: 0.08, release: 0.06 },
      volume: -18,
    });
    nodes.padFilter = new Tone.Filter({ type: "lowpass", frequency: 3800, Q: 0.5, rolloff: -24 });
    nodes.pad.connect(nodes.padFilter);
    nodes.padSub.connect(nodes.padFilter);
    nodes.padFilter.connect(nodes.padBus);

    nodes.kick = new Tone.MembraneSynth({
      pitchDecay: 0.028,
      octaves: 2.6,
      envelope: { attack: 0.002, decay: 0.14, sustain: 0, release: 0.12 },
      volume: -11,
    }).connect(nodes.drumBus);
    nodes.snare = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.003, decay: 0.064, sustain: 0, release: 0.025 },
      volume: -19,
    }).connect(nodes.drumBus);
    nodes.hat = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.002, decay: 0.018, sustain: 0 },
      volume: -30,
    });
    nodes.openHat = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.003, decay: 0.08, sustain: 0, release: 0.032 },
      volume: -31,
    });
    nodes.hatFilter = new Tone.Filter({ type: "highpass", frequency: 6100, Q: 0.5, rolloff: -24 });
    nodes.hat.connect(nodes.hatFilter);
    nodes.openHat.connect(nodes.hatFilter);
    nodes.hatFilter.connect(nodes.drumBus);

    nodes.noiseAccent = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.004, decay: 0.095, sustain: 0, release: 0.045 },
      volume: -25,
    });
    nodes.noiseAccentFilter = new Tone.Filter({ type: "bandpass", frequency: 1500, Q: 1.35 });
    nodes.noiseAccent.chain(nodes.noiseAccentFilter, nodes.accentBus);

    nodes.telemetryHum = new Tone.Oscillator({ frequency: 55, type: "sine", volume: -34 });
    nodes.telemetryHumFilter = new Tone.Filter({ type: "lowpass", frequency: 240, Q: 0.8, rolloff: -24 });
    nodes.telemetryHumGain = new Tone.Gain(0);
    nodes.telemetryHum.chain(nodes.telemetryHumFilter, nodes.telemetryHumGain, nodes.accentBus);
    nodes.telemetryHum.start();

    nodes.deployment = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.002, decay: 0.1, sustain: 0.16, release: 0.24 },
      volume: -12,
    }).connect(nodes.accentBus);
    nodes.incident = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.001, decay: 0.045, sustain: 0.04, release: 0.035 },
      volume: -15,
    }).connect(nodes.accentBus);

    serviceVoices = Array.from(
      { length: APU_TRACK_SERVICE_POOL },
      (_, index) => createServiceVoice(Tone, nodes.serviceBus, index),
    );

    nodes.transport = Tone.getTransport();
    nodes.schedulerId = nodes.transport.scheduleRepeat(onStep, "16n");
    initialized = true;
  }

  function barDurationSeconds() {
    return 240 / APU_TRACK_BPM;
  }

  function applyScene(frame, at = undefined, duration = 0.5) {
    if (!initialized || !frame || !currentArrangement) return;
    currentEngineControls = engineControlsForFrame(frame);
    const scene = sceneForFrame(frame, currentDirectorPlan);
    const profile = scene.profile;
    const timbre = currentArrangement.timbre ?? {};
    const scoreTimbre = currentEngineControls.timbre;
    const compression = compressionForRange(timbre.dynamicRangeDb ?? 12);
    safeRamp(nodes.transport.bpm, APU_TRACK_BPM, 0.08, at);
    safeRamp(nodes.masterVolume.volume, timbre.masterGainDb ?? scene.masterGainDb, duration, at);
    safeRamp(nodes.masterFilter.frequency, scene.masterFilterHz * (scoreTimbre?.masterFilterScale ?? 1), duration, at);
    safeRamp(nodes.masterHighpass.frequency, scene.masterHpHz * (scoreTimbre?.masterHighpassScale ?? 1), duration, at);
    safeRamp(nodes.primaryFilter.Q, scoreTimbre?.leadFilterQ ?? 1.25, duration, at);
    safeRamp(nodes.secondaryFilter.Q, scoreTimbre?.counterFilterQ ?? 1.1, duration, at);
    safeRamp(nodes.compressor.threshold, compression.threshold, duration, at);
    safeRamp(nodes.compressor.ratio, compression.ratio, duration, at);
    safeRamp(nodes.compressor.attack, compression.attack, duration, at);
    safeRamp(nodes.compressor.release, compression.release, duration, at);
    setBits(nodes.chipColor, scoreTimbre?.chipBits ?? profile.crusherBits);
    safeRamp(nodes.chipColor.wet, scoreTimbre?.chipWet ?? profile.crusherWet, duration, at);
    safeRamp(nodes.delayReturn.gain, scoreTimbre?.delayGain ?? profile.delayWet, duration, at);
    safeRamp(nodes.reverbReturn.gain, scoreTimbre?.reverbGain ?? profile.reverbWet, duration, at);
    safeRamp(nodes.hatFilter.frequency, scoreTimbre?.hatFilterHz ?? Math.max(2800, profile.noiseBrightnessHz), duration, at);
    safeRamp(nodes.noiseAccentFilter.frequency, scoreTimbre?.noiseAccentFilterHz ?? 1500, duration, at);
    safeRamp(nodes.telemetryHumGain.gain, scoreTimbre?.telemetryHumGain ?? (stateKey(frame) === "unknown" ? 0.045 : 0), duration, at);
  }

  function applyArrangementMix(at = undefined, duration = 0.18) {
    if (!currentArrangement) return;
    const mix = currentArrangement.mix;
    const timbre = currentArrangement.timbre ?? {};
    const scoreBuses = currentEngineControls.buses;
    const scoreTimbre = currentEngineControls.timbre;
    const width = clamp(timbre.stereoWidth ?? 0.5, 0, 1);
    safeRamp(nodes.primaryBus.gain, clamp(mix.primary * (scoreBuses?.primary ?? 1), 0, 1), duration, at);
    safeRamp(nodes.secondaryBus.gain, clamp(mix.secondary * (scoreBuses?.secondary ?? 1), 0, 1), duration, at);
    safeRamp(nodes.serviceBus.gain, clamp(mix.services * (scoreBuses?.services ?? 1), 0, 1), duration, at);
    safeRamp(nodes.bassBus.gain, clamp(mix.bass * (scoreBuses?.bass ?? 1), 0, 1), duration, at);
    safeRamp(nodes.drumBus.gain, clamp(mix.drums * (scoreBuses?.drums ?? 1), 0, 1), duration, at);
    safeRamp(nodes.padBus.gain, clamp(mix.pad * (scoreBuses?.pad ?? 1), 0, 1), duration, at);
    safeRamp(nodes.accentBus.gain, clamp(mix.accent * (scoreBuses?.accent ?? 1), 0, 1), duration, at);
    safeRamp(nodes.primaryFilter.frequency, (timbre.leadCutoffHz ?? 4800) * (scoreTimbre?.leadFilterScale ?? 1), duration, at);
    safeRamp(nodes.secondaryFilter.frequency, (timbre.counterCutoffHz ?? 3300) * (scoreTimbre?.counterFilterScale ?? 1), duration, at);
    const scene = sceneForFrame(currentFrame, currentDirectorPlan);
    safeRamp(nodes.padFilter.frequency, scene.profile.padCutoffHz * (timbre.padCutoffScale ?? 1) * (scoreTimbre?.padFilterScale ?? 1), duration, at);
    safeRamp(nodes.primaryPanner.pan, -0.42 * width, duration, at);
    safeRamp(nodes.secondaryPanner.pan, 0.42 * width, duration, at);
    setPulseWidth(nodes.primary, scoreTimbre?.primaryDutyCycle ?? timbre.primaryDutyCycle ?? 0.5, at);
    setPulseWidth(nodes.secondary, scoreTimbre?.counterDutyCycle ?? timbre.counterDutyCycle ?? 0.25, at);
  }

  function applyStateTransition(previousFrame, nextFrame, at) {
    const from = stateKey(previousFrame);
    const to = stateKey(nextFrame);
    if (!previousFrame || from === to) return 0.18;
    const policy = currentArrangement?.stateIdentity?.transitionPolicy ?? "crossfade";
    lastStateTransition = Object.freeze({ from, to, policy, stepIndex, phraseIndex: trackPhraseIndex });

    if (policy === "hard-choke") {
      nodes.pad.releaseAll?.(at);
      nodes.secondary.triggerRelease?.(at);
      safeRamp(nodes.padBus.gain, 0, APU_TRACK_CRITICAL_CHOKE_SECONDS, at);
      safeRamp(nodes.secondaryBus.gain, 0, APU_TRACK_CRITICAL_CHOKE_SECONDS, at);
      return Math.max(0.12, APU_TRACK_CRITICAL_CHOKE_SECONDS * 2);
    }

    if (policy === "one-bar-decay") return barDurationSeconds();
    if (policy === "tight-crossfade") return 0.18;
    return 0.28;
  }

  function emitArrangement(at) {
    requireTone().Draw.schedule(() => onArrangement?.({
      arrangement: currentArrangement,
      scene: sceneForFrame(currentFrame, currentDirectorPlan),
      cycleProgress: `${currentArrangement.cyclePhrase + 1}/${APU_TRACK_PHRASES}`,
    }), at);
  }

  function commitPhrase(at) {
    const previousFrame = currentFrame;
    if (pendingFrame) {
      currentFrame = pendingFrame;
      pendingFrame = null;
    }
    if (!currentFrame) return;
    director.observe(currentFrame);
    currentDirectorPlan = director.advancePhrase();
    trackPhraseIndex += 1;
    currentArrangement = arrangementForPhrase(currentFrame, currentDirectorPlan, trackPhraseIndex);
    const duration = applyStateTransition(previousFrame, currentFrame, at);
    applyScene(currentFrame, at, duration);
    applyArrangementMix(at, duration);
    emitArrangement(at);
  }

  function commitBarFrame(at) {
    if (!pendingFrame || !currentFrame || trackPhraseIndex < 0) return;
    const previousFrame = currentFrame;
    currentFrame = pendingFrame;
    pendingFrame = null;
    director.observe(currentFrame);
    currentArrangement = arrangementForPhrase(currentFrame, currentDirectorPlan, trackPhraseIndex);
    const duration = applyStateTransition(previousFrame, currentFrame, at);
    applyScene(currentFrame, at, duration);
    applyArrangementMix(at, duration);
    emitArrangement(at);
  }

  function playRhythm(time, step) {
    const events = rhythmEventsForTrackStep(currentFrame, currentArrangement, step);
    if (events.kick) nodes.kick.triggerAttackRelease("F1", "16n", time, events.kick.velocity);
    if (events.snare) nodes.snare.triggerAttackRelease(0.05, time, events.snare.velocity);
    if (events.hat) nodes.hat.triggerAttackRelease(0.015, time, events.hat.velocity);
    if (events.openHat) nodes.openHat.triggerAttackRelease(0.075, time, events.openHat.velocity);
    if (events.noiseAccent) {
      const accentVelocity = Math.min(stateKey(currentFrame) === "critical" ? 0.24 : 0.22, events.noiseAccent.velocity);
      nodes.noiseAccent.triggerAttackRelease(0.085, time, accentVelocity);
    }
  }

  function playBass(time, step) {
    const event = bassEventForTrackStep(currentFrame, currentArrangement, step);
    if (!event) return;
    nodes.bass.triggerAttackRelease(midiToFrequencyHz(event.midi), event.duration, time, event.velocity);
    if (stateKey(currentFrame) === "critical") {
      nodes.padSub.triggerAttackRelease(
        midiToFrequencyHz(Math.max(24, event.midi - 12)),
        "32n",
        time,
        Math.min(0.34, event.velocity * 0.48),
      );
    }
  }

  function playPad(time, step) {
    const event = padChordForTrackStep(currentFrame, currentArrangement, step);
    if (event) nodes.pad.triggerAttackRelease(event.midis.map(midiToFrequencyHz), event.duration, time, event.velocity);
  }

  function playPrimary(time, step) {
    const event = primaryPulseEventForTrackStep(currentFrame, currentArrangement, step);
    if (!event) return;
    setPulseWidth(nodes.primary, event.dutyCycle, pulseWidthLeadTime(time));
    nodes.primary.triggerAttackRelease(midiToFrequencyHz(event.midi), event.duration, time, event.velocity);
  }

  function playSecondary(time, step) {
    const event = secondaryPulseEventForTrackStep(currentFrame, currentArrangement, step);
    if (!event) return;
    setPulseWidth(nodes.secondary, event.dutyCycle, pulseWidthLeadTime(time));
    nodes.secondary.triggerAttackRelease(midiToFrequencyHz(event.midi), event.duration, time, event.velocity);
  }

  function playService(time, step) {
    const event = serviceEventForTrackStep(currentFrame, currentArrangement, step);
    if (!event) return;
    const slot = serviceVoices[servicePoolCursor % serviceVoices.length];
    servicePoolCursor += 1;
    const width = clamp(currentArrangement?.timbre?.stereoWidth ?? 0.5, 0, 1);
    safeRamp(slot.panner.pan, event.identity.pan * width, 0.02, time);
    const scale = currentArrangement?.timbre?.serviceCutoffScale ?? 1;
    const cutoff = event.identity.filtered
      ? Math.min(1400, event.voice.filterHz ?? 1400)
      : event.voice.filterHz ?? 3200;
    safeRamp(slot.filter.frequency, cutoff * scale, 0.03, time);
    setPulseWidth(slot.synth, event.identity.dutyCycle, pulseWidthLeadTime(time));
    if (slot.synth.detune) safeRamp(slot.synth.detune, event.voice.detuneCents ?? 0, 0.03, time);
    slot.synth.triggerAttackRelease(midiToFrequencyHz(event.midi), event.duration, time, event.velocity);
    requireTone().Draw.schedule(() => onVoice?.({
      name: event.voice.name,
      channel: event.identity.channel,
      label: event.identity.label,
      oscillator: slot.oscillatorType,
    }), time);
  }

  function playTransition(time, step) {
    const event = transitionEventForTrackStep(
      currentFrame,
      currentArrangement,
      step,
      lastStateTransition,
      stepIndex,
    );
    if (!event) return;
    lastTransitionEvent = Object.freeze({
      type: event.type,
      stepIndex,
      phraseIndex: trackPhraseIndex,
    });
    const ornamentTime = time + APU_TRACK_TRANSITION_ORNAMENT_OFFSET_SECONDS;
    if (event.bassDrop) {
      nodes.padSub.triggerAttackRelease(
        midiToFrequencyHz(event.bassDrop.midi),
        event.bassDrop.duration,
        ornamentTime,
        Math.min(0.3, event.bassDrop.velocity),
      );
    }
    if (event.noise) {
      nodes.noiseAccent.triggerAttackRelease(
        event.noise.duration,
        ornamentTime,
        Math.min(0.24, event.noise.velocity),
      );
    }
    for (const note of event.notes ?? []) {
      const voice = note.voice === "deployment" ? nodes.deployment : nodes.incident;
      voice.triggerAttackRelease(
        midiToFrequencyHz(note.midi),
        note.duration,
        ornamentTime,
        Math.min(0.46, note.velocity),
      );
    }
  }

  function scheduleCue(events, voice, startAt, subdivision = "16n") {
    const Tone = requireTone();
    const stepSeconds = Tone.Time(subdivision).toSeconds();
    for (const event of events) {
      let cueId = null;
      cueId = nodes.transport.scheduleOnce((time) => {
        scheduledCueIds.delete(cueId);
        voice.triggerAttackRelease(midiToFrequencyHz(event.midi), event.duration, time, event.velocity);
      }, startAt + event.offset * stepSeconds);
      scheduledCueIds.add(cueId);
    }
  }

  function deploymentSequence(identity = "deployment") {
    const text = String(identity);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const root = [65, 67, 68][(hash >>> 0) % 3];
    return [0, 2, 4, 5, 4, 7].map((offset, index) => ({
      offset: index,
      midi: quantizeMidiToHarmony(currentFrame, currentArrangement, index * 2, root + offset, 60, 84),
      duration: index === 5 ? "4n" : "16n",
      velocity: index === 5 ? 0.42 : 0.3,
    }));
  }

  function incidentSequence(count = 1) {
    const total = Math.max(1, Math.min(4, Math.trunc(count) || 1)) * 2;
    return Array.from({ length: total }, (_, index) => ({
      offset: index,
      midi: quantizeMidiToHarmony(currentFrame, currentArrangement, index, index % 2 === 0 ? 53 : 60, 48, 72),
      duration: "32n",
      velocity: index % 2 === 0 ? 0.38 : 0.28,
    }));
  }

  function flushQueuedCues(time) {
    if (pendingDeployment) {
      const identity = pendingDeployment.identity
        ?? pendingDeployment.deployId
        ?? pendingDeployment.commitSha
        ?? "deployment";
      scheduleCue(deploymentSequence(identity), nodes.deployment, time);
      pendingDeployment = null;
    }
    if (pendingIncidentCount > 0) {
      scheduleCue(incidentSequence(pendingIncidentCount), nodes.incident, time, "32n");
      pendingIncidentCount = 0;
    }
  }

  function onStep(time) {
    if (!running || !currentFrame || !Number.isFinite(time)) return;
    const step = stepIndex % APU_TRACK_STEPS;

    // Advance before rendering so a channel exception cannot pin transport.
    stepIndex += 1;

    if (step === 0) {
      runChannel("phrase", () => commitPhrase(time));
      runChannel("queued-cues", () => flushQueuedCues(time));
    } else if (step === 16) {
      runChannel("bar-frame", () => commitBarFrame(time));
    }
    runChannel("rhythm", () => playRhythm(time, step));
    runChannel("bass", () => playBass(time, step));
    runChannel("pad", () => playPad(time, step));
    runChannel("primary", () => playPrimary(time, step));
    runChannel("secondary", () => playSecondary(time, step));
    runChannel("services", () => playService(time, step));
    runChannel("transition", () => playTransition(time, step));
  }

  function disposeGraph() {
    if (!initialized) return;
    nodes.transport?.stop?.();
    if (nodes.schedulerId !== null) nodes.transport.clear(nodes.schedulerId);
    for (const cueId of scheduledCueIds) nodes.transport.clear(cueId);
    scheduledCueIds.clear();
    nodes.telemetryHum?.stop?.();
    for (const voice of serviceVoices) {
      voice.synth.dispose();
      voice.filter.dispose();
      voice.panner.dispose();
      voice.gain.dispose();
    }
    serviceVoices = [];
    for (const node of Object.values(nodes).reverse()) node?.dispose?.();
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
        if (nodes.transport.state !== "started") nodes.transport.start();
        safeRamp(nodes.output.gain, userVolume, 0.18);
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
      safeRamp(nodes.output.gain, 0, 0.16);
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
      if (nodes.output && running) safeRamp(nodes.output.gain, userVolume, 0.1);
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
      return nodes.waveform?.getValue?.() ?? new Float32Array(APU_TRACK_WAVEFORM_SIZE);
    },

    getSpectrum() {
      return nodes.spectrum?.getValue?.() ?? new Float32Array(APU_TRACK_SPECTRUM_SIZE);
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

    getDiagnostics() {
      return Object.freeze({
        stepIndex,
        trackPhraseIndex,
        section: currentArrangement?.section ?? null,
        cyclePhrase: currentArrangement?.cyclePhrase ?? null,
        state: stateKey(currentFrame),
        pendingState: pendingFrame ? stateKey(pendingFrame) : null,
        lastStateTransition,
        lastTransitionEvent,
        engineControlsBuildId: ATLAS_APU_ENGINE_CONTROLS_BUILD_ID,
        scorePlanGuard: currentEngineControls.guard,
        scorePlanMovement: currentEngineControls.movement,
        sampleFree: currentEngineControls.sampleFree,
        channelFailures: Object.freeze(Object.fromEntries(channelFailures)),
      });
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
