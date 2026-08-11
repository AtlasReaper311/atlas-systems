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

// Pass C v3 wiring imports -------------------------------------------
import {
  tanhCurve,
  quantiseCurve8Bit,
  setSoftClipperDrive as setChipSoftClipperDrive,
} from "./apu-soft-clipper.js?v=20260727-apu-soft-clipper-v1";
import { createDrumSculptorKit } from "./apu-drum-sculptor.js?v=20260727-apu-drum-sculptor-v1";
import {
  chipWaveKindForDuty,
  createRawChipVoice,
  extractRawContext,
} from "./apu-chip-voice-adapter.js?v=20260727-apu-chip-voice-adapter-v2";
import { masterStageProfileForState } from "./apu-master-stage-profiles.js?v=20260727-apu-master-stage-profiles-v1";
import { createPerformanceDirector } from "./apu-performance-director-v4.js?v=20260727-apu-performance-director-v4";
import { mixDirectiveFor } from "./apu-mix-director.js?v=20260727-apu-mix-director-v1";
import {
  APU_MIX_WIRING_BUILD_ID,
  attachMixWiring,
  createMixBus,
} from "./apu-mix-wiring.js?v=20260727-apu-mix-wiring-v2";
import {
  ornamentInstructionsForPhrase,
  shouldOmitForPhase,
  supplementalRhythmForDensity,
  velocityScaleForDensity,
} from "./apu-performance-conductor.js?v=20260727-apu-performance-conductor-v2";
import { conductServiceEvent } from "./apu-service-voice-conductor.js?v=20260727-apu-service-voice-conductor-v2";
import {
  createReplaySongCursor,
  createReplaySongPlan,
  performancePlanForReplayMovement,
  replayFrameForMovement,
} from "./apu-replay-song.js?v=20260727-apu-replay-song-v3";

export const APU_TRACK_AUDIO_START_TIMEOUT_MS = 8000;
export const APU_TRACK_DEFAULT_GAIN = APU_MASTERING_DEFAULT_USER_GAIN;
export const APU_TRACK_WAVEFORM_SIZE = 512;
export const APU_TRACK_SPECTRUM_SIZE = 64;
export const APU_TRACK_SERVICE_POOL = 8;
export const APU_TRACK_BPM = 100;
export const APU_TRACK_CRITICAL_CHOKE_SECONDS = 0.09;
export const APU_TRACK_PULSE_WIDTH_LEAD_SECONDS = 0.028;
export const APU_TRACK_TRANSITION_ORNAMENT_OFFSET_SECONDS = 0.012;
export const APU_TRACK_PASS_C_V3_BUILD_ID = "20260727-apu-track-engine-pass-c-v3";

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

function setPulseWidth(synth, width, at = undefined) {
  const bounded = clamp(width, 0.08, 0.75);
  if (typeof synth?.setDutyCycle === "function") {
    synth.setDutyCycle(bounded, at);
    return;
  }
  const parameter = synth?.oscillator?.width;
  if (parameter) safeRamp(parameter, bounded, 0.04, at);
}
function pulseWidthLeadTime(time) {
  return Number.isFinite(time)
    ? Math.max(0, time - APU_TRACK_PULSE_WIDTH_LEAD_SECONDS)
    : undefined;
}

/**
 * Service voice: each service in the pool gets a chip-wave oscillator via
 * the chip voice adapter. The oscillator kind is chosen from the same
 * four-wave rotation as before but now uses the Part 1 factories.
 */
function createServiceVoice(Tone, output, index) {
  const layers = ["primary", "secondary", "pad", "accent", "bass"];
  const kinds = ["pulse-hollow", "triangle-4bit", "vrc6-sawtooth", "pulse-square", "pulse-narrow"];
  const layer = layers[index % layers.length];
  const chipKind = kinds[index % kinds.length];
  const filter = new Tone.Filter({
    type: index % 3 === 1 ? "bandpass" : "lowpass",
    frequency: 2800 + index * 180,
    Q: index % 3 === 1 ? 1.8 : 0.7,
    rolloff: -24,
  });
  const basePan = ((index % 4) - 1.5) * 0.22;
  const panner = new Tone.Panner(basePan);
  const gain = new Tone.Gain(index % 2 === 0 ? 0.64 : 0.52);
  filter.chain(panner, gain, output);
  const synth = createRawChipVoice(Tone, filter, {
    waveKind: chipKind,
    envelope: {
      attack: index % 2 === 0 ? 0.003 : 0.012,
      decay: index % 3 === 0 ? 0.055 : 0.09,
      sustain: index % 2 === 0 ? 0.12 : 0.22,
      release: index % 3 === 0 ? 0.08 : 0.16,
    },
    volumeDb: -17,
    maxVoices: 4,
  });
  return { synth, filter, panner, gain, chipKind, layer, basePan };
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
  let currentScoreFrame = null;
  let pendingFrame = null;
  let currentDirectorPlan = null;
  let currentPerfPlan = null;
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
  const perfDirector = createPerformanceDirector({ seed: "ATLAS-APU-PERF-V4" });
  let mixWiring = null;
  let currentReplayPlan = null;
  let replayCursor = null;
  let currentReplayMovement = null;
  const channelFailures = new Map();
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
    const rawContext = extractRawContext(Tone);
    if (!rawContext) throw new Error("system-symphony-apu-track: raw AudioContext unavailable");

    // Master: buses -> colour -> dynamics -> DAC -> clipper -> limiter.
    nodes.output = new Tone.Gain(0).toDestination();
    nodes.limiter = new Tone.Limiter(APU_MASTERING_LIMITER_CEILING_DB);
    nodes.softClipper = new Tone.WaveShaper(Array.from(tanhCurve(1.35)));
    nodes.softClipper.oversample = "2x";
    nodes.masterDac = new Tone.WaveShaper(Array.from(quantiseCurve8Bit()));
    nodes.masterDac.oversample = "none";
    nodes.masterDacDry = new Tone.Gain(0.94);
    nodes.masterDacWet = new Tone.Gain(0.06);
    nodes.masterDacMix = new Tone.Gain(1);
    nodes.compressor = new Tone.Compressor({ threshold: -18, ratio: 1.7, attack: 0.022, release: 0.24 });
    nodes.softenerShelf = new Tone.Filter({ type: "highshelf", frequency: 4200, gain: -0.8, Q: 0.6 });
    nodes.masterFilter = new Tone.Filter({ type: "lowpass", frequency: 9000, rolloff: -24, Q: 0.7 });
    nodes.masterHighpass = new Tone.Filter({ type: "highpass", frequency: 24, rolloff: -12, Q: 0.5 });
    nodes.masterVolume = new Tone.Volume(-10);
    nodes.chipBus = new Tone.Gain(1);
    nodes.chipBus.chain(
      nodes.masterVolume,
      nodes.masterHighpass,
      nodes.masterFilter,
      nodes.softenerShelf,
      nodes.compressor,
    );
    nodes.compressor.connect(nodes.masterDacDry);
    nodes.compressor.chain(nodes.masterDac, nodes.masterDacWet);
    nodes.masterDacDry.connect(nodes.masterDacMix);
    nodes.masterDacWet.connect(nodes.masterDacMix);
    nodes.masterDacMix.chain(nodes.softClipper, nodes.limiter, nodes.output);

    nodes.waveform = new Tone.Analyser("waveform", APU_TRACK_WAVEFORM_SIZE);
    nodes.spectrum = new Tone.Analyser("fft", APU_TRACK_SPECTRUM_SIZE);
    nodes.limiter.connect(nodes.waveform);
    nodes.limiter.connect(nodes.spectrum);

    nodes.melodyBus = new Tone.Gain(0.9).connect(nodes.chipBus);
    nodes.chipColor = new Tone.BitCrusher(12);
    nodes.chipColor.wet.value = 0.08;
    nodes.chipColor.connect(nodes.melodyBus);

    nodes.delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.13, wet: 1 });
    nodes.delaySend = new Tone.Gain(0.06);
    nodes.delayReturn = new Tone.Gain(0.08).connect(nodes.chipBus);
    nodes.delaySend.chain(nodes.delay, nodes.delayReturn);
    nodes.reverb = new Tone.Freeverb({ roomSize: 0.7, dampening: 3900, wet: 1 });
    nodes.reverbSend = new Tone.Gain(0.1);
    nodes.reverbReturn = new Tone.Gain(0.1).connect(nodes.chipBus);
    nodes.reverbSend.chain(nodes.reverb, nodes.reverbReturn);

    nodes.mixBuses = Object.freeze({
      primary: createMixBus(Tone, { name: "primary", downstream: nodes.melodyBus, auxiliarySends: [nodes.delaySend] }),
      secondary: createMixBus(Tone, { name: "secondary", downstream: nodes.melodyBus, auxiliarySends: [nodes.delaySend] }),
      services: createMixBus(Tone, { name: "services", downstream: nodes.chipColor }),
      bass: createMixBus(Tone, { name: "bass", downstream: nodes.chipBus }),
      drums: createMixBus(Tone, { name: "drums", downstream: nodes.chipBus }),
      pad: createMixBus(Tone, { name: "pad", downstream: nodes.chipBus, auxiliarySends: [nodes.reverbSend] }),
      accent: createMixBus(Tone, { name: "accent", downstream: nodes.chipBus, auxiliarySends: [nodes.reverbSend] }),
    });
    nodes.primaryBus = nodes.mixBuses.primary.input;
    nodes.secondaryBus = nodes.mixBuses.secondary.input;
    nodes.serviceBus = nodes.mixBuses.services.input;
    nodes.bassBus = nodes.mixBuses.bass.input;
    nodes.drumBus = nodes.mixBuses.drums.input;
    nodes.padBus = nodes.mixBuses.pad.input;
    nodes.accentBus = nodes.mixBuses.accent.input;

    nodes.primaryFilter = new Tone.Filter({ type: "lowpass", frequency: 4800, Q: 1.25, rolloff: -24 });
    nodes.primaryPanner = new Tone.Panner(-0.2);
    nodes.primaryFilter.chain(nodes.primaryPanner, nodes.primaryBus);
    nodes.primary = createRawChipVoice(Tone, nodes.primaryFilter, {
      waveKind: "pulse-square",
      envelope: { attack: 0.006, decay: 0.075, sustain: 0.2, release: 0.13 },
      volumeDb: -12,
      maxVoices: 8,
    });

    nodes.secondaryFilter = new Tone.Filter({ type: "bandpass", frequency: 3300, Q: 1.1, rolloff: -24 });
    nodes.secondaryPanner = new Tone.Panner(0.2);
    nodes.secondaryFilter.chain(nodes.secondaryPanner, nodes.secondaryBus);
    nodes.secondary = createRawChipVoice(Tone, nodes.secondaryFilter, {
      waveKind: "pulse-hollow",
      envelope: { attack: 0.003, decay: 0.08, sustain: 0.08, release: 0.12 },
      volumeDb: -16,
      maxVoices: 6,
    });

    nodes.bass = createRawChipVoice(Tone, nodes.bassBus, {
      waveKind: "triangle-4bit",
      envelope: { attack: 0.004, decay: 0.08, sustain: 0.68, release: 0.12 },
      volumeDb: -11,
      maxVoices: 4,
    });

    nodes.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 0.16, decay: 0.36, sustain: 0.5, release: 1.2 },
      volume: -22,
    });
    nodes.padFilter = new Tone.Filter({ type: "lowpass", frequency: 3800, Q: 0.5, rolloff: -24 });
    nodes.pad.connect(nodes.padFilter);
    nodes.padFilter.connect(nodes.padBus);
    nodes.padSub = createRawChipVoice(Tone, nodes.padFilter, {
      waveKind: "pulse-square",
      envelope: { attack: 0.004, decay: 0.075, sustain: 0.08, release: 0.06 },
      volumeDb: -18,
      maxVoices: 3,
    });

    nodes.hatFilter = new Tone.Filter({ type: "highpass", frequency: 6100, Q: 0.5, rolloff: -24 });
    nodes.hatFilter.connect(nodes.drumBus);
    nodes.noiseAccentFilter = new Tone.Filter({ type: "bandpass", frequency: 1500, Q: 1.35 });
    nodes.noiseAccentFilter.connect(nodes.accentBus);
    nodes.rawDrumBridge = rawContext.createGain();
    nodes.rawHatBridge = rawContext.createGain();
    nodes.rawAccentBridge = rawContext.createGain();
    Tone.connect(nodes.rawDrumBridge, nodes.drumBus);
    Tone.connect(nodes.rawHatBridge, nodes.hatFilter);
    Tone.connect(nodes.rawAccentBridge, nodes.noiseAccentFilter);
    nodes.drumKit = createDrumSculptorKit(rawContext, {
      kickOutput: nodes.rawDrumBridge,
      snareOutput: nodes.rawDrumBridge,
      hatOutput: nodes.rawHatBridge,
      accentOutput: nodes.rawAccentBridge,
    }, { mode: "polished", state: stateKey(currentScoreFrame ?? currentFrame), bpm: APU_TRACK_BPM });
    nodes.kick = nodes.drumKit.kick;
    nodes.snare = nodes.drumKit.snare;
    nodes.hat = nodes.drumKit.hat;
    nodes.openHat = nodes.drumKit.openHat;
    nodes.noiseAccent = nodes.drumKit.noiseAccent;

    nodes.telemetryHum = new Tone.Oscillator({ frequency: 55, type: "sine", volume: -34 });
    nodes.telemetryHumFilter = new Tone.Filter({ type: "lowpass", frequency: 240, Q: 0.8, rolloff: -24 });
    nodes.telemetryHumGain = new Tone.Gain(0);
    nodes.telemetryHum.chain(nodes.telemetryHumFilter, nodes.telemetryHumGain, nodes.accentBus);
    nodes.telemetryHum.start();

    nodes.deployment = createRawChipVoice(Tone, nodes.accentBus, {
      waveKind: "vrc6-sawtooth",
      envelope: { attack: 0.002, decay: 0.1, sustain: 0.16, release: 0.24 },
      volumeDb: -12,
      maxVoices: 8,
    });
    nodes.incident = createRawChipVoice(Tone, nodes.accentBus, {
      waveKind: "pulse-narrow",
      envelope: { attack: 0.001, decay: 0.045, sustain: 0.04, release: 0.035 },
      volumeDb: -15,
      maxVoices: 8,
    });

    serviceVoices = Array.from(
      { length: APU_TRACK_SERVICE_POOL },
      (_, index) => createServiceVoice(Tone, nodes.serviceBus, index),
    );

    mixWiring = attachMixWiring(Tone, {
      buses: nodes.mixBuses,
      masterFilter: nodes.masterFilter,
      softenerShelf: nodes.softenerShelf,
      compressor: nodes.compressor,
      primaryPanner: nodes.primaryPanner,
      secondaryPanner: nodes.secondaryPanner,
      servicePanners: serviceVoices.map((voice) => ({ panner: voice.panner, basePan: voice.basePan })),
    });

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
    const state = stateKey(frame);
    const perfPhase = currentPerfPlan?.phase ?? "groove";
    nodes.drumKit?.setState?.(state);
    const masterStage = masterStageProfileForState(state);
    setChipSoftClipperDrive(nodes.softClipper, masterStage.drive);
    safeRamp(nodes.masterDacWet.gain, masterStage.quantiseWet, duration, at);
    safeRamp(nodes.masterDacDry.gain, 1 - masterStage.quantiseWet, duration, at);
    mixWiring?.applyDirective(mixDirectiveFor({ state, phase: perfPhase }), {
      at,
      duration,
      compressionTarget: compression,
      safeRamp,
    });
    safeRamp(nodes.transport.bpm, APU_TRACK_BPM, 0.08, at);
    safeRamp(nodes.masterVolume.volume, timbre.masterGainDb ?? scene.masterGainDb, duration, at);
    safeRamp(nodes.masterFilter.frequency, scene.masterFilterHz * (scoreTimbre?.masterFilterScale ?? 1), duration, at);
    safeRamp(nodes.masterHighpass.frequency, scene.masterHpHz * (scoreTimbre?.masterHighpassScale ?? 1), duration, at);
    safeRamp(nodes.primaryFilter.Q, scoreTimbre?.leadFilterQ ?? 1.25, duration, at);
    safeRamp(nodes.secondaryFilter.Q, scoreTimbre?.counterFilterQ ?? 1.1, duration, at);
    setBits(nodes.chipColor, scoreTimbre?.chipBits ?? profile.crusherBits);
    safeRamp(nodes.chipColor.wet, scoreTimbre?.chipWet ?? profile.crusherWet, duration, at);
    safeRamp(nodes.delayReturn.gain, scoreTimbre?.delayGain ?? profile.delayWet, duration, at);
    safeRamp(nodes.reverbReturn.gain, scoreTimbre?.reverbGain ?? profile.reverbWet, duration, at);
    safeRamp(nodes.hatFilter.frequency, scoreTimbre?.hatFilterHz ?? Math.max(2800, profile.noiseBrightnessHz), duration, at);
    safeRamp(nodes.noiseAccentFilter.frequency, scoreTimbre?.noiseAccentFilterHz ?? 1500, duration, at);
    safeRamp(nodes.telemetryHumGain.gain, scoreTimbre?.telemetryHumGain ?? (state === "unknown" ? 0.045 : 0), duration, at);
  }
  function applyArrangementMix(at = undefined, duration = 0.18) {
    if (!currentArrangement) return;
    const mix = currentArrangement.mix;
    const timbre = currentArrangement.timbre ?? {};
    const scoreBuses = currentEngineControls.buses;
    const scoreTimbre = currentEngineControls.timbre;
    const m = (name) => mixWiring?.getGainMultiplier(name) ?? 1;
    safeRamp(nodes.primaryBus.gain, clamp(mix.primary * (scoreBuses?.primary ?? 1) * m("primary"), 0, 1), duration, at);
    safeRamp(nodes.secondaryBus.gain, clamp(mix.secondary * (scoreBuses?.secondary ?? 1) * m("secondary"), 0, 1), duration, at);
    safeRamp(nodes.serviceBus.gain, clamp(mix.services * (scoreBuses?.services ?? 1) * m("services"), 0, 1), duration, at);
    safeRamp(nodes.bassBus.gain, clamp(mix.bass * (scoreBuses?.bass ?? 1) * m("bass"), 0, 1), duration, at);
    safeRamp(nodes.drumBus.gain, clamp(mix.drums * (scoreBuses?.drums ?? 1) * m("drums"), 0, 1), duration, at);
    safeRamp(nodes.padBus.gain, clamp(mix.pad * (scoreBuses?.pad ?? 1) * m("pad"), 0, 1), duration, at);
    safeRamp(nodes.accentBus.gain, clamp(mix.accent * (scoreBuses?.accent ?? 1) * m("accent"), 0, 1), duration, at);
    safeRamp(nodes.primaryFilter.frequency, (timbre.leadCutoffHz ?? 4800) * (scoreTimbre?.leadFilterScale ?? 1), duration, at);
    safeRamp(nodes.secondaryFilter.frequency, (timbre.counterCutoffHz ?? 3300) * (scoreTimbre?.counterFilterScale ?? 1), duration, at);
    const scene = sceneForFrame(currentScoreFrame ?? currentFrame, currentDirectorPlan);
    safeRamp(nodes.padFilter.frequency, scene.profile.padCutoffHz * (timbre.padCutoffScale ?? 1) * (scoreTimbre?.padFilterScale ?? 1), duration, at);
  }
  function emitArrangement(at) {
    requireTone().Draw.schedule(() => onArrangement?.({
      arrangement: currentArrangement,
      scene: sceneForFrame(currentScoreFrame ?? currentFrame, currentDirectorPlan),
      cycleProgress: `${currentArrangement.cyclePhrase + 1}/${APU_TRACK_PHRASES}`,
    }), at);
  }

  function setBits(crusher, bits) {
    if (!crusher?.bits) return;
    const value = Math.round(clamp(bits, 4, 16));
    if (crusher.bits.value !== value) crusher.bits.value = value;
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

  function replayMovementForCurrentBar() {
    if (!replayCursor || replayCursor.isFinished()) return null;
    return replayCursor.movementForBar(replayCursor.getBar());
  }

  function refreshScoreFrame() {
    currentReplayMovement = replayMovementForCurrentBar();
    currentScoreFrame = currentReplayMovement
      ? replayFrameForMovement(currentFrame, currentReplayMovement, currentReplayPlan?.sourceLabel)
      : currentFrame;
    return currentScoreFrame;
  }

  function advanceReplayBar() {
    if (!replayCursor || replayCursor.isFinished()) return;
    replayCursor.advance(1);
  }

  function commitPhrase(at) {
    const previousScoreFrame = currentScoreFrame ?? currentFrame;
    if (pendingFrame) {
      currentFrame = pendingFrame;
      pendingFrame = null;
    }
    if (!currentFrame) return;
    const scoreFrame = refreshScoreFrame();
    director.observe(scoreFrame);
    perfDirector.observe(scoreFrame);
    currentDirectorPlan = director.advancePhrase();
    const basePerfPlan = perfDirector.advancePhrase();
    currentPerfPlan = performancePlanForReplayMovement(basePerfPlan, currentReplayMovement);
    trackPhraseIndex += 1;
    currentArrangement = arrangementForPhrase(scoreFrame, currentDirectorPlan, trackPhraseIndex);
    const duration = applyStateTransition(previousScoreFrame, scoreFrame, at);
    applyScene(scoreFrame, at, duration);
    applyArrangementMix(at, duration);
    scheduleOrnamentsForPhrase(at);
    emitArrangement(at);
  }
  function commitBarFrame(at) {
    if (!currentFrame || trackPhraseIndex < 0) return;
    const previousScoreFrame = currentScoreFrame ?? currentFrame;
    if (pendingFrame) {
      currentFrame = pendingFrame;
      pendingFrame = null;
    }
    const scoreFrame = refreshScoreFrame();
    director.observe(scoreFrame);
    perfDirector.observe(scoreFrame);
    currentPerfPlan = performancePlanForReplayMovement(currentPerfPlan, currentReplayMovement);
    currentArrangement = arrangementForPhrase(scoreFrame, currentDirectorPlan, trackPhraseIndex);
    const duration = applyStateTransition(previousScoreFrame, scoreFrame, at);
    applyScene(scoreFrame, at, duration);
    applyArrangementMix(at, duration);
    emitArrangement(at);
  }
  function scheduleOrnamentsForPhrase(baseTime) {
    if (!currentPerfPlan || !Number.isFinite(baseTime)) return;
    const stepSeconds = requireTone().Time("16n").toSeconds();
    for (const instruction of ornamentInstructionsForPhrase(currentPerfPlan)) {
      const fireAt = baseTime + Math.max(0, instruction.offsetSteps ?? 0) * stepSeconds;
      triggerOrnamentInstruction(instruction, fireAt);
    }
  }
  function triggerOrnamentInstruction(inst, time) {
    const rootMidi = currentArrangement?.rootMidi ?? 41;
    const midi = quantizeMidiToHarmony(
      currentScoreFrame ?? currentFrame, currentArrangement, 0,
      rootMidi + (inst.midiOffset ?? 0),
      24, 96,
    );
    const velocity = clamp(inst.velocity ?? 0.3, 0.05, 0.6);
    const duration = inst.duration ?? "16n";
    switch (inst.voice) {
      case "primary":
        nodes.primary.triggerAttackRelease(midiToFrequencyHz(midi), duration, time, velocity);
        mixWiring?.duckOnHit("primary", time);
        break;
      case "secondary":
        nodes.secondary.triggerAttackRelease(midiToFrequencyHz(midi), duration, time, velocity);
        break;
      case "pad":
        nodes.pad.triggerAttackRelease(midiToFrequencyHz(midi), duration, time, velocity);
        break;
      case "accent":
        nodes.incident.triggerAttackRelease(midiToFrequencyHz(midi), duration, time, velocity);
        break;
      case "kick":
        nodes.kick.triggerAttackRelease?.("F1", "16n", time, velocity);
        mixWiring?.duckOnHit("kick", time);
        break;
      case "openHat":
        nodes.openHat.triggerAttackRelease?.(0.075, time, velocity);
        break;
      case "hat":
        nodes.hat.triggerAttackRelease?.(0.015, time, velocity);
        break;
      case "noiseAccent":
        nodes.noiseAccent.triggerAttackRelease?.(0.085, time, velocity);
        break;
      default:
        break;
    }
  }

  // ---- Per-step channels --------------------------------------
  function playRhythm(time, step) {
    if (shouldOmitForPhase({
      perfPlan: currentPerfPlan, category: "rhythm",
      stepIndex, phraseIndex: trackPhraseIndex,
    })) return;
    const events = rhythmEventsForTrackStep(currentScoreFrame ?? currentFrame, currentArrangement, step);
    const densityScale = velocityScaleForDensity(currentPerfPlan, "rhythm");
    if (events.kick) {
      const velocity = clamp(events.kick.velocity * densityScale, 0.04, 0.9);
      nodes.kick.triggerAttackRelease("F1", "16n", time, velocity);
      mixWiring?.duckOnHit("kick", time);
      mixWiring?.duckOnHit("drums", time);
    }
    if (events.snare) {
      nodes.snare.triggerAttackRelease(0.05, time, clamp(events.snare.velocity * densityScale, 0.04, 0.9));
      mixWiring?.duckOnHit("drums", time);
    }
    if (events.hat) nodes.hat.triggerAttackRelease(0.015, time, clamp(events.hat.velocity * densityScale, 0.04, 0.9));
    if (events.openHat) nodes.openHat.triggerAttackRelease(0.075, time, clamp(events.openHat.velocity * densityScale, 0.04, 0.9));
    if (events.noiseAccent) {
      const limit = stateKey(currentScoreFrame ?? currentFrame) === "critical" ? 0.24 : 0.22;
      nodes.noiseAccent.triggerAttackRelease(0.085, time, clamp(Math.min(limit, events.noiseAccent.velocity) * densityScale, 0.04, 0.5));
    }
    for (const extra of supplementalRhythmForDensity(currentPerfPlan, step, trackPhraseIndex)) {
      if (extra.voice === "hat" && !events.hat) nodes.hat.triggerAttackRelease(0.015, time, extra.velocity);
      if (extra.voice === "noiseAccent" && !events.noiseAccent) nodes.noiseAccent.triggerAttackRelease(0.085, time, extra.velocity);
    }
  }
  function playBass(time, step) {
    if (shouldOmitForPhase({
      perfPlan: currentPerfPlan, category: "bass",
      stepIndex: stepIndex, phraseIndex: trackPhraseIndex,
    })) return;
    const event = bassEventForTrackStep((currentScoreFrame ?? currentFrame), currentArrangement, step);
    if (!event) return;
    const v = clamp(event.velocity * velocityScaleForDensity(currentPerfPlan, "bass"), 0.04, 0.9);
    nodes.bass.triggerAttackRelease(midiToFrequencyHz(event.midi), event.duration, time, v);
    if (stateKey((currentScoreFrame ?? currentFrame)) === "critical") {
      nodes.padSub.triggerAttackRelease(
        midiToFrequencyHz(Math.max(24, event.midi - 12)),
        "32n",
        time,
        Math.min(0.34, v * 0.48),
      );
    }
  }

  function playPad(time, step) {
    if (shouldOmitForPhase({
      perfPlan: currentPerfPlan, category: "pad",
      stepIndex: stepIndex, phraseIndex: trackPhraseIndex,
    })) return;
    const event = padChordForTrackStep((currentScoreFrame ?? currentFrame), currentArrangement, step);
    if (event) {
      const v = clamp(event.velocity * velocityScaleForDensity(currentPerfPlan, "pad"), 0.04, 0.9);
      nodes.pad.triggerAttackRelease(event.midis.map(midiToFrequencyHz), event.duration, time, v);
    }
  }

  function playPrimary(time, step) {
    if (shouldOmitForPhase({ perfPlan: currentPerfPlan, category: "primary", stepIndex, phraseIndex: trackPhraseIndex })) return;
    const event = primaryPulseEventForTrackStep(currentScoreFrame ?? currentFrame, currentArrangement, step);
    if (!event) return;
    const chipKind = chipWaveKindForDuty(event.dutyCycle);
    if (nodes.primary.getWaveKind?.() !== chipKind) nodes.primary.setWaveKind?.(chipKind);
    setPulseWidth(nodes.primary, event.dutyCycle, pulseWidthLeadTime(time));
    const velocity = clamp(event.velocity * velocityScaleForDensity(currentPerfPlan, "primary"), 0.04, 0.9);
    nodes.primary.triggerAttackRelease(midiToFrequencyHz(event.midi), event.duration, time, velocity);
    mixWiring?.duckOnHit("primary", time);
  }
  function playSecondary(time, step) {
    if (shouldOmitForPhase({
      perfPlan: currentPerfPlan, category: "secondary",
      stepIndex: stepIndex, phraseIndex: trackPhraseIndex,
    })) return;
    const event = secondaryPulseEventForTrackStep((currentScoreFrame ?? currentFrame), currentArrangement, step);
    if (!event) return;
    setPulseWidth(nodes.secondary, event.dutyCycle, pulseWidthLeadTime(time));
    const v = clamp(event.velocity * velocityScaleForDensity(currentPerfPlan, "secondary"), 0.04, 0.9);
    nodes.secondary.triggerAttackRelease(midiToFrequencyHz(event.midi), event.duration, time, v);
  }

  function playService(time, step) {
    if (shouldOmitForPhase({ perfPlan: currentPerfPlan, category: "service", stepIndex, phraseIndex: trackPhraseIndex })) return;
    const frame = currentScoreFrame ?? currentFrame;
    const rawEvent = serviceEventForTrackStep(frame, currentArrangement, step);
    if (!rawEvent) return;
    const played = conductServiceEvent({
      event: rawEvent,
      frame,
      arrangement: currentArrangement,
      perfPlan: currentPerfPlan,
      step,
      phraseIndex: trackPhraseIndex,
    });
    if (!played) return;
    const matching = serviceVoices.filter((voice) => voice.layer === played.route);
    const pool = matching.length ? matching : serviceVoices;
    const slot = pool[servicePoolCursor % pool.length];
    servicePoolCursor += 1;
    const scale = currentArrangement?.timbre?.serviceCutoffScale ?? 1;
    const cutoff = played.identity.filtered
      ? Math.min(1400, played.voice.filterHz ?? 1400)
      : played.voice.filterHz ?? 3200;
    safeRamp(slot.filter.frequency, cutoff * scale, 0.03, time);
    setPulseWidth(slot.synth, played.identity.dutyCycle, pulseWidthLeadTime(time));
    safeRamp(slot.synth.detune, played.voice.detuneCents ?? 0, 0.03, time);
    const velocity = clamp(played.velocity * velocityScaleForDensity(currentPerfPlan, "service"), 0.04, 0.5);
    slot.synth.triggerAttackRelease(midiToFrequencyHz(played.midi), played.duration, time, velocity);
    mixWiring?.duckOnHit("services", time);
    requireTone().Draw.schedule(() => onVoice?.({
      name: played.voice.name,
      channel: played.identity.channel,
      label: played.identity.label,
      oscillator: slot.chipKind,
      preferredLayer: played.preferredLayer,
      routedLayer: slot.layer,
      motifDegree: played.motifDegree,
      motifSlotIndex: played.motifSlotIndex,
      rhythmSlotIndex: played.rhythmSlotIndex,
      mutation: played.mutation,
      provenance: played.provenance,
    }), time);
  }
  function playTransition(time, step) {
    const event = transitionEventForTrackStep(
      (currentScoreFrame ?? currentFrame),
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
    const stepSeconds = requireTone().Time(subdivision).toSeconds();
    for (const event of events) {
      const fireAt = startAt + event.offset * stepSeconds;
      voice.triggerAttackRelease(midiToFrequencyHz(event.midi), event.duration, fireAt, event.velocity);
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
      midi: quantizeMidiToHarmony((currentScoreFrame ?? currentFrame), currentArrangement, index * 2, root + offset, 60, 84),
      duration: index === 5 ? "4n" : "16n",
      velocity: index === 5 ? 0.42 : 0.3,
    }));
  }

  function incidentSequence(count = 1) {
    const total = Math.max(1, Math.min(4, Math.trunc(count) || 1)) * 2;
    return Array.from({ length: total }, (_, index) => ({
      offset: index,
      midi: quantizeMidiToHarmony((currentScoreFrame ?? currentFrame), currentArrangement, index, index % 2 === 0 ? 53 : 60, 48, 72),
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
    if ((step === 0 || step === 16) && replayCursor && !replayCursor.isFinished()) advanceReplayBar();
  }
  function disposeGraph() {
    if (!initialized) return;
    nodes.transport?.stop?.();
    if (nodes.schedulerId !== null && nodes.schedulerId !== undefined) nodes.transport.clear(nodes.schedulerId);
    nodes.telemetryHum?.stop?.();
    mixWiring?.dispose?.();
    mixWiring = null;
    nodes.drumKit?.dispose?.();
    for (const voice of serviceVoices) {
      voice.synth.dispose?.();
      voice.filter.dispose?.();
      voice.panner.dispose?.();
      voice.gain.dispose?.();
    }
    serviceVoices = [];
    for (const handle of Object.values(nodes.mixBuses ?? {})) handle.dispose?.();
    const owned = [
      nodes.primary, nodes.secondary, nodes.bass, nodes.pad, nodes.padSub,
      nodes.telemetryHum, nodes.telemetryHumFilter, nodes.telemetryHumGain,
      nodes.deployment, nodes.incident,
      nodes.primaryFilter, nodes.primaryPanner, nodes.secondaryFilter, nodes.secondaryPanner,
      nodes.padFilter, nodes.hatFilter, nodes.noiseAccentFilter,
      nodes.delay, nodes.delaySend, nodes.delayReturn,
      nodes.reverb, nodes.reverbSend, nodes.reverbReturn,
      nodes.melodyBus, nodes.chipColor, nodes.chipBus,
      nodes.masterVolume, nodes.masterHighpass, nodes.masterFilter, nodes.softenerShelf,
      nodes.compressor, nodes.masterDac, nodes.masterDacDry, nodes.masterDacWet,
      nodes.masterDacMix, nodes.softClipper, nodes.limiter,
      nodes.waveform, nodes.spectrum, nodes.output,
    ];
    for (const node of owned) node?.dispose?.();
    for (const bridge of [nodes.rawDrumBridge, nodes.rawHatBridge, nodes.rawAccentBridge]) {
      try { bridge?.disconnect?.(); } catch { /* already disconnected */ }
    }
    initialized = false;
  }
  return Object.freeze({
    buildId: ATLAS_APU_TRACK_BUILD_ID,
    passCV3BuildId: APU_TRACK_PASS_C_V3_BUILD_ID,

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
        currentScoreFrame = frame;
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
      return (currentScoreFrame ?? currentFrame) ? sceneForFrame(currentScoreFrame ?? currentFrame, currentDirectorPlan) : null;
    },

    getArrangement() {
      return currentArrangement;
    },

    getPhase() {
      return currentDirectorPlan?.phase ?? "standby";
    },

    getPerformancePhase() {
      return currentPerfPlan?.phase ?? "standby";
    },

    getPerformancePlan() {
      return currentPerfPlan;
    },

    // ---- Replay ---------------------------------------------
    setReplayIncident(incident, options = {}) {
      if (incident == null) {
        currentReplayPlan = null;
        replayCursor = null;
        currentReplayMovement = null;
        currentScoreFrame = currentFrame;
        return null;
      }
      currentReplayPlan = createReplaySongPlan(incident, options);
      replayCursor = createReplaySongCursor(currentReplayPlan);
      currentReplayMovement = replayCursor.movementForBar(0);
      currentScoreFrame = replayFrameForMovement(currentFrame, currentReplayMovement, currentReplayPlan.sourceLabel);
      return currentReplayPlan;
    },

    getReplayPlan() {
      return currentReplayPlan;
    },

    getReplayMovementAtBar(bar) {
      return replayCursor?.movementForBar(bar) ?? null;
    },

    getDiagnostics() {
      return Object.freeze({
        stepIndex,
        trackPhraseIndex,
        section: currentArrangement?.section ?? null,
        cyclePhrase: currentArrangement?.cyclePhrase ?? null,
        state: stateKey(currentScoreFrame ?? currentFrame),
        pendingState: pendingFrame ? stateKey(pendingFrame) : null,
        lastStateTransition,
        lastTransitionEvent,
        engineControlsBuildId: ATLAS_APU_ENGINE_CONTROLS_BUILD_ID,
        scorePlanGuard: currentEngineControls.guard,
        scorePlanMovement: currentEngineControls.movement,
        sampleFree: currentEngineControls.sampleFree,
        channelFailures: Object.freeze(Object.fromEntries(channelFailures)),
        // Pass C v3 diagnostics
        performancePhase: currentPerfPlan?.phase ?? "standby",
        performanceSilenceBudget: currentPerfPlan?.silenceBudget ?? 0,
        performanceDensity: currentPerfPlan?.density ?? 0,
        performanceOrnaments: currentPerfPlan?.ornaments ?? [],
        mixWiringBuildId: APU_MIX_WIRING_BUILD_ID,
        passCV3BuildId: APU_TRACK_PASS_C_V3_BUILD_ID,
        replayPlanId: currentReplayPlan?.incidentId ?? null,
        replaySourceLabel: currentReplayPlan?.sourceLabel ?? null,
        replayCurrentMovement: currentReplayMovement?.kind ?? null,
        replayBar: replayCursor?.getBar() ?? null,
        chipVoiceKinds: Object.freeze({
          primary: nodes.primary?.getWaveKind?.() ?? null,
          secondary: nodes.secondary?.getWaveKind?.() ?? null,
          bass: nodes.bass?.getWaveKind?.() ?? null,
          padSub: nodes.padSub?.getWaveKind?.() ?? null,
        }),
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
