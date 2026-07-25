import { clamp, sceneForFrame } from "./apu-palette.js?v=20260725-system-symphony-atlas-apu-preview-v1";
import {
  APU_TRACK_PHRASES,
  ATLAS_APU_TRACK_BUILD_ID,
  arrangementForPhrase,
} from "./apu-arranger.js?v=20260726-system-symphony-atlas-apu-state-identities-v1";
import {
  APU_TRACK_STEPS,
  bassEventForTrackStep,
  padChordForTrackStep,
  primaryPulseEventForTrackStep,
  quantizeMidiToHarmony,
  rhythmEventsForTrackStep,
  secondaryPulseEventForTrackStep,
  serviceEventForTrackStep,
} from "./apu-track-sequencer.js?v=20260726-system-symphony-atlas-apu-state-identities-v1";
import {
  ATLAS_APU_LOCKED_BPM,
  logicalChannels,
  stateIdentityFor,
  transitionPolicy,
} from "./apu-state-identities.js?v=20260726-system-symphony-atlas-apu-state-identities-v1";
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

function setBits(crusher, bits) {
  if (!crusher?.bits) return;
  const value = Math.round(clamp(bits, 4, 16));
  if (crusher.bits.value !== value) crusher.bits.value = value;
}

function setPulseWidth(synth, width, at = undefined) {
  const parameter = synth?.oscillator?.width;
  if (parameter) safeRamp(parameter, clamp(width, 0.08, 0.75), 0.04, at);
}

function safelySet(node, settings) {
  if (!node || typeof node.set !== "function") return;
  try {
    node.set(settings);
  } catch {
    // Tone builds differ in which nested properties are mutable. Parameter
    // ramps below remain authoritative when a composite set is unsupported.
  }
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
  let currentTransition = transitionPolicy("unknown", "unknown");
  let trackPhraseIndex = -1;
  let stepIndex = 0;
  let userVolume = APU_TRACK_DEFAULT_GAIN;
  let pendingDeployment = null;
  let pendingIncidentCount = 0;
  let servicePoolCursor = 0;
  let stateTransitionCount = 0;

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
    nodes.limiter = new Tone.Limiter(-1);
    nodes.compressor = new Tone.Compressor({
      threshold: -20,
      ratio: 2.5,
      attack: 0.018,
      release: 0.2,
    });
    nodes.masterFilter = new Tone.Filter({ type: "lowpass", frequency: 9000, rolloff: -24, Q: 0.7 });
    nodes.masterHighpass = new Tone.Filter({ type: "highpass", frequency: 24, rolloff: -12, Q: 0.5 });
    nodes.masterVolume = new Tone.Volume(-10);
    nodes.crusher = new Tone.BitCrusher(12);
    nodes.crusher.wet.value = 0.08;
    nodes.chipBus = new Tone.Gain(1);
    nodes.chipBus.chain(
      nodes.crusher,
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
    nodes.primaryBus = new Tone.Gain(0).connect(nodes.melodyBus);
    nodes.secondaryBus = new Tone.Gain(0).connect(nodes.melodyBus);
    nodes.serviceBus = new Tone.Gain(0).connect(nodes.melodyBus);
    nodes.bassBus = new Tone.Gain(0).connect(nodes.chipBus);
    nodes.drumBus = new Tone.Gain(0).connect(nodes.chipBus);
    nodes.padBus = new Tone.Gain(0).connect(nodes.chipBus);
    nodes.accentBus = new Tone.Gain(0).connect(nodes.chipBus);

    nodes.delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.13, wet: 1 });
    nodes.delaySend = new Tone.Gain(0.06);
    nodes.delayReturn = new Tone.Gain(0.08).connect(nodes.chipBus);
    nodes.delaySend.chain(nodes.delay, nodes.delayReturn);

    nodes.reverb = new Tone.Freeverb({ roomSize: 0.7, dampening: 3900, wet: 1 });
    nodes.reverbSend = new Tone.Gain(0.1);
    nodes.reverbReturn = new Tone.Gain(0.1).connect(nodes.chipBus);
    nodes.reverbSend.chain(nodes.reverb, nodes.reverbReturn);

    nodes.primaryPanner = new Tone.Panner(-0.24);
    nodes.secondaryPanner = new Tone.Panner(0.24);
    nodes.primary = new Tone.Synth({
      oscillator: { type: "pulse", width: 0.5 },
      envelope: { attack: 0.008, decay: 0.075, sustain: 0.2, release: 0.18 },
      volume: -12,
    });
    nodes.primaryFilter = new Tone.Filter({ type: "lowpass", frequency: 4800, Q: 1.25, rolloff: -24 });
    nodes.primary.chain(nodes.primaryFilter, nodes.primaryPanner, nodes.primaryBus);
    nodes.primaryBus.connect(nodes.delaySend);

    nodes.secondary = new Tone.FMSynth({
      harmonicity: 1.5,
      modulationIndex: 3.2,
      oscillator: { type: "sine" },
      modulation: { type: "square" },
      envelope: { attack: 0.003, decay: 0.08, sustain: 0.08, release: 0.12 },
      modulationEnvelope: { attack: 0.002, decay: 0.06, sustain: 0.12, release: 0.1 },
      volume: -16,
    });
    nodes.secondaryFilter = new Tone.Filter({ type: "bandpass", frequency: 3300, Q: 1.1, rolloff: -24 });
    nodes.secondary.chain(nodes.secondaryFilter, nodes.secondaryPanner, nodes.secondaryBus);
    nodes.secondaryBus.connect(nodes.delaySend);

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

    nodes.memory = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 0.18, decay: 0.36, sustain: 0.5, release: 1.1 },
      volume: -22,
    });
    nodes.memoryFilter = new Tone.Filter({ type: "lowpass", frequency: 3800, Q: 0.5, rolloff: -24 });
    nodes.memory.chain(nodes.memoryFilter, nodes.padBus);
    nodes.padBus.connect(nodes.reverbSend);

    nodes.kick = new Tone.MembraneSynth({
      pitchDecay: 0.028,
      octaves: 2.6,
      envelope: { attack: 0.001, decay: 0.14, sustain: 0, release: 0.12 },
      volume: -10,
    }).connect(nodes.drumBus);
    nodes.snare = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.018 },
      volume: -18,
    }).connect(nodes.drumBus);
    nodes.hat = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.014, sustain: 0 },
      volume: -29,
    });
    nodes.openHat = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.075, sustain: 0, release: 0.025 },
      volume: -30,
    });
    nodes.hatFilter = new Tone.Filter({ type: "highpass", frequency: 6100, Q: 0.5, rolloff: -24 });
    nodes.hat.connect(nodes.hatFilter);
    nodes.openHat.connect(nodes.hatFilter);
    nodes.hatFilter.connect(nodes.drumBus);

    nodes.noiseAccent = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.035 },
      volume: -23,
    });
    nodes.noiseAccentFilter = new Tone.Filter({ type: "bandpass", frequency: 1500, Q: 2.2 });
    nodes.noiseAccent.chain(nodes.noiseAccentFilter, nodes.accentBus);

    nodes.telemetryHum = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.4, decay: 0.2, sustain: 0.18, release: 1.5 },
      volume: -34,
    }).connect(nodes.accentBus);
    nodes.impact = new Tone.MembraneSynth({
      pitchDecay: 0.018,
      octaves: 1.6,
      envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 },
      volume: -15,
    }).connect(nodes.accentBus);

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
    nodes.accentBus.connect(nodes.reverbSend);

    serviceVoices = Array.from(
      { length: APU_TRACK_SERVICE_POOL },
      (_, index) => createServiceVoice(Tone, nodes.serviceBus, index),
    );

    nodes.transport = Tone.getTransport();
    nodes.transport.bpm.value = ATLAS_APU_LOCKED_BPM;
    nodes.schedulerId = nodes.transport.scheduleRepeat(onStep, "16n");
    initialized = true;
  }

  function applyStateSynthesis(identity, at = undefined) {
    setPulseWidth(nodes.primary, identity.synthesis.primaryDuty, at);
    safelySet(nodes.primary, {
      envelope: {
        attack: identity.synthesis.primaryAttack,
        decay: identity.id === "critical" ? 0.045 : 0.08,
        sustain: identity.id === "unknown" ? 0.38 : 0.16,
        release: identity.synthesis.primaryRelease,
      },
    });
    safelySet(nodes.secondary, {
      harmonicity: identity.id === "critical" ? 2 : identity.id === "warning" ? 1.8 : 1.5,
      modulationIndex: identity.id === "critical" ? 6.2 : identity.id === "warning" ? 4.2 : identity.id === "unknown" ? 1.4 : 2.6,
      envelope: {
        attack: identity.synthesis.secondaryAttack,
        decay: identity.id === "critical" ? 0.04 : 0.08,
        sustain: identity.id === "unknown" ? 0.34 : 0.08,
        release: identity.synthesis.secondaryRelease,
      },
    });

    const memoryOscillator = identity.id === "critical"
      ? { type: "square" }
      : identity.id === "warning"
        ? { type: "pulse", width: 0.25 }
        : { type: "sine" };
    safelySet(nodes.memory, {
      oscillator: memoryOscillator,
      envelope: {
        attack: identity.synthesis.memoryAttack,
        decay: identity.id === "critical" ? 0.05 : 0.3,
        sustain: identity.id === "critical" ? 0.08 : identity.id === "unknown" ? 0.62 : 0.5,
        release: identity.synthesis.memoryRelease,
      },
    });
    safelySet(nodes.bass, {
      oscillator: { type: identity.id === "critical" ? "square" : "triangle" },
      envelope: {
        attack: identity.id === "critical" ? 0.001 : 0.004,
        decay: identity.id === "critical" ? 0.045 : 0.08,
        sustain: identity.id === "unknown" ? 0.82 : identity.id === "critical" ? 0.24 : 0.68,
        release: identity.id === "unknown" ? 0.8 : identity.id === "critical" ? 0.05 : 0.12,
      },
    });

    const halfWidth = identity.synthesis.stereoWidth * 0.5;
    safeRamp(nodes.primaryPanner.pan, -halfWidth, 0.16, at);
    safeRamp(nodes.secondaryPanner.pan, halfWidth, 0.16, at);
    safeRamp(nodes.compressor.threshold, identity.dynamics.compressorThresholdDb, 0.2, at);
    safeRamp(nodes.compressor.ratio, identity.dynamics.compressorRatio, 0.2, at);
    safeRamp(nodes.limiter.threshold, identity.dynamics.peakCeilingDb, 0.1, at);
    safeRamp(nodes.masterVolume.volume, identity.dynamics.masterTrimDb, 0.3, at);
  }

  function applyScene(frame, at = undefined) {
    if (!initialized || !frame) return;
    const scene = sceneForFrame(frame, currentDirectorPlan);
    const profile = scene.profile;
    const identity = stateIdentityFor(frame.scoreState);
    safeRamp(nodes.transport.bpm, ATLAS_APU_LOCKED_BPM, 0.1, at);
    safeRamp(nodes.masterFilter.frequency, scene.masterFilterHz, 0.8, at);
    safeRamp(nodes.masterHighpass.frequency, scene.masterHpHz, 0.8, at);
    setBits(nodes.crusher, profile.crusherBits);
    safeRamp(nodes.crusher.wet, profile.crusherWet, 0.5, at);
    safeRamp(nodes.delayReturn.gain, profile.delayWet, 0.5, at);
    safeRamp(nodes.reverbReturn.gain, profile.reverbWet, 0.5, at);
    safeRamp(nodes.hatFilter.frequency, Math.max(2800, profile.noiseBrightnessHz), 0.5, at);
    applyStateSynthesis(identity, at);
  }

  function applyArrangementMix(at = undefined, durationSeconds = 0.18) {
    if (!currentArrangement) return;
    const mix = currentArrangement.mix;
    const timbre = currentArrangement.timbre ?? {};
    safeRamp(nodes.primaryBus.gain, mix.primary, durationSeconds, at);
    safeRamp(nodes.secondaryBus.gain, mix.secondary, durationSeconds, at);
    safeRamp(nodes.serviceBus.gain, mix.services, durationSeconds, at);
    safeRamp(nodes.bassBus.gain, mix.bass, durationSeconds, at);
    safeRamp(nodes.drumBus.gain, mix.drums, durationSeconds, at);
    safeRamp(nodes.padBus.gain, mix.pad, durationSeconds, at);
    safeRamp(nodes.accentBus.gain, mix.accent, durationSeconds, at);
    safeRamp(nodes.primaryFilter.frequency, timbre.leadCutoffHz ?? 4800, 0.2, at);
    safeRamp(nodes.secondaryFilter.frequency, timbre.counterCutoffHz ?? 3300, 0.2, at);
    const scene = sceneForFrame(currentFrame, currentDirectorPlan);
    safeRamp(
      nodes.memoryFilter.frequency,
      scene.profile.padCutoffHz * (timbre.padCutoffScale ?? 1),
      0.2,
      at,
    );
  }

  function releaseSafely(node, at, releaseAll = false) {
    try {
      if (releaseAll) node?.releaseAll?.(at);
      else node?.triggerRelease?.(at);
    } catch {
      // A voice may already be idle. Tail flushing must never stop transport.
    }
  }

  function applyStateTransition(fromState, toState, at) {
    currentTransition = transitionPolicy(fromState, toState);
    if (currentTransition.mode === "hard-choke") {
      releaseSafely(nodes.memory, at, true);
      releaseSafely(nodes.secondary, at);
      for (const voice of serviceVoices) releaseSafely(voice.synth, at);
    }
    if (fromState !== toState) stateTransitionCount += 1;
    return currentTransition;
  }

  function emitArrangement(at) {
    requireTone().Draw.schedule(() => onArrangement?.({
      arrangement: currentArrangement,
      scene: sceneForFrame(currentFrame, currentDirectorPlan),
      cycleProgress: `${currentArrangement.cyclePhrase + 1}/${APU_TRACK_PHRASES}`,
      transition: currentTransition,
    }), at);
  }

  function consumePendingFrame() {
    if (!pendingFrame) return null;
    const previous = currentFrame;
    currentFrame = pendingFrame;
    pendingFrame = null;
    return previous;
  }

  function commitPhrase(at) {
    const previousFrame = consumePendingFrame();
    if (!currentFrame) return;
    director.observe(currentFrame);
    currentDirectorPlan = director.advancePhrase();
    trackPhraseIndex += 1;
    currentArrangement = arrangementForPhrase(currentFrame, currentDirectorPlan, trackPhraseIndex);
    const transition = applyStateTransition(
      previousFrame?.scoreState ?? currentFrame.scoreState,
      currentFrame.scoreState,
      at,
    );
    applyScene(currentFrame, at);
    applyArrangementMix(at, transition.durationSeconds);
    emitArrangement(at);
  }

  function commitBarStateChange(at) {
    if (!pendingFrame || !currentFrame || !currentArrangement) return;
    const previousFrame = consumePendingFrame();
    currentArrangement = arrangementForPhrase(currentFrame, currentDirectorPlan, trackPhraseIndex);
    const transition = applyStateTransition(previousFrame?.scoreState, currentFrame.scoreState, at);
    applyScene(currentFrame, at);
    applyArrangementMix(at, transition.durationSeconds);
    emitArrangement(at);
  }

  function playRhythm(time, step) {
    const events = rhythmEventsForTrackStep(currentFrame, currentArrangement, step);
    const state = stateIdentityFor(currentFrame.scoreState).id;
    if (events.kick) nodes.kick.triggerAttackRelease("F1", "16n", time, events.kick.velocity);
    if (events.snare) nodes.snare.triggerAttackRelease(0.05, time, events.snare.velocity);
    if (events.hat) nodes.hat.triggerAttackRelease(0.015, time, events.hat.velocity);
    if (events.openHat) nodes.openHat.triggerAttackRelease(0.075, time, events.openHat.velocity);
    if (events.noiseAccent) {
      nodes.noiseAccent.triggerAttackRelease(0.09, time, events.noiseAccent.velocity);
      if (state === "critical") {
        nodes.impact.triggerAttackRelease("F1", "32n", time, Math.min(0.52, events.noiseAccent.velocity + 0.08));
      }
    }
  }

  function playBass(time, step) {
    const event = bassEventForTrackStep(currentFrame, currentArrangement, step);
    if (event) nodes.bass.triggerAttackRelease(midiToFrequencyHz(event.midi), event.duration, time, event.velocity);
  }

  function playMemory(time, step) {
    const event = padChordForTrackStep(currentFrame, currentArrangement, step);
    if (!event) return;
    nodes.memory.triggerAttackRelease(
      event.midis.map(midiToFrequencyHz),
      event.duration,
      time,
      event.velocity,
    );
  }

  function playPrimary(time, step) {
    const event = primaryPulseEventForTrackStep(currentFrame, currentArrangement, step);
    if (!event) return;
    const identity = stateIdentityFor(currentFrame.scoreState);
    if (nodes.primary.detune) {
      const detune = event.pitchIntent === "drift"
        ? ((step + currentArrangement.phraseIndex) % 2 === 0 ? -1 : 1) * identity.synthesis.detuneDepthCents
        : 0;
      safeRamp(nodes.primary.detune, detune, 0.08, time);
    }
    nodes.primary.triggerAttackRelease(midiToFrequencyHz(event.midi), event.duration, time, event.velocity);
  }

  function playSecondary(time, step) {
    const event = secondaryPulseEventForTrackStep(currentFrame, currentArrangement, step);
    if (!event) return;
    const identity = stateIdentityFor(currentFrame.scoreState);
    if (nodes.secondary.detune) {
      const detune = event.pitchIntent === "drift"
        ? ((step + currentArrangement.phraseIndex + 1) % 2 === 0 ? -1 : 1) * identity.synthesis.detuneDepthCents
        : 0;
      safeRamp(nodes.secondary.detune, detune, 0.08, time);
    }
    nodes.secondary.triggerAttackRelease(midiToFrequencyHz(event.midi), event.duration, time, event.velocity);
  }

  function playService(time, step) {
    const event = serviceEventForTrackStep(currentFrame, currentArrangement, step);
    if (!event) return;
    const slot = serviceVoices[servicePoolCursor % serviceVoices.length];
    servicePoolCursor += 1;
    safeRamp(slot.panner.pan, event.identity.pan, 0.02, time);
    const scale = currentArrangement?.timbre?.serviceCutoffScale ?? 1;
    const cutoff = event.identity.filtered
      ? Math.min(1400, event.voice.filterHz ?? 1400)
      : event.voice.filterHz ?? 3200;
    safeRamp(slot.filter.frequency, cutoff * scale, 0.03, time);
    setPulseWidth(slot.synth, event.identity.dutyCycle, time);
    if (slot.synth.detune) safeRamp(slot.synth.detune, event.detuneCents ?? 0, 0.08, time);
    slot.synth.triggerAttackRelease(midiToFrequencyHz(event.midi), event.duration, time, event.velocity);
    requireTone().Draw.schedule(() => onVoice?.({
      name: event.voice.name,
      channel: event.identity.channel,
      label: event.identity.label,
      oscillator: slot.oscillatorType,
    }), time);
  }

  function playAccentRole(time, step) {
    const state = stateIdentityFor(currentFrame.scoreState).id;
    if (state === "unknown" && (step === 0 || step === 16)) {
      const midi = step === 0 ? 53 : 55;
      nodes.telemetryHum.triggerAttackRelease(midiToFrequencyHz(midi), "1m", time, 0.08);
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

    // Advance before rendering. A channel exception cannot pin the scheduler to
    // one percussion step and produce an endless repeated event.
    stepIndex += 1;

    if (step === 0) {
      runChannel("phrase", () => commitPhrase(time));
      runChannel("queued-cues", () => flushQueuedCues(time));
    } else if (step === 16 && pendingFrame) {
      runChannel("bar-state", () => commitBarStateChange(time));
    }

    runChannel("rhythm", () => playRhythm(time, step));
    runChannel("bass", () => playBass(time, step));
    runChannel("memory", () => playMemory(time, step));
    runChannel("primary", () => playPrimary(time, step));
    runChannel("secondary", () => playSecondary(time, step));
    runChannel("services", () => playService(time, step));
    runChannel("accent-role", () => playAccentRole(time, step));
  }

  function disposeGraph() {
    if (!initialized) return;
    nodes.transport?.stop?.();
    if (nodes.schedulerId !== null) nodes.transport.clear(nodes.schedulerId);
    for (const cueId of scheduledCueIds) nodes.transport.clear(cueId);
    scheduledCueIds.clear();
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
        currentState: currentFrame?.scoreState ?? null,
        pendingState: pendingFrame?.scoreState ?? null,
        stateTransitionCount,
        transitionMode: currentTransition.mode,
        logicalChannelCount: logicalChannels().length,
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
