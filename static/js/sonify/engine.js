/**
 * System SYMPHONY persistent cyberpunk telemetry composition.
 *
 * Tone.js stays isolated here. Telemetry updates reshape one continuous
 * composition; they never restart it. The scheduler triggers at most one
 * rotating service voice per eighth note, so topology growth does not create
 * unbounded simultaneous polyphony.
 */

import {
  MAX_COMPONENTS,
  boundVoiceMidi,
  midiToFrequencyHz,
  stableHash,
} from "./mapping.js?v=20260716-system-symphony-performance-console";

export const DEFAULT_USER_GAIN = 0.62;
export const MAX_SERVICE_VOICES = MAX_COMPONENTS;
export const MAX_INCIDENT_ACCENTS = 4;
export const WAVEFORM_SIZE = 512;
export const AUDIO_START_TIMEOUT_MS = 8000;
export const PAD_MEASURE_STEPS = 8;
export const PAD_ROOT_MIDI = 38; // D2
export const DRONE_MIDI = Object.freeze([26, 33]); // D1 / A1
export const PERCUSSION_BUS_GAINS = Object.freeze({
  healthy: 0.48,
  warning: 0.62,
  critical: 0.9,
  unknown: 0.22,
});
export const COUNTERLINE_BUS_GAINS = Object.freeze({
  healthy: 0.3,
  warning: 0.36,
  critical: 0.3,
  unknown: 0.22,
});
export const PAD_DURATIONS = Object.freeze({
  healthy: "2m",
  warning: "2m",
  critical: "1m",
  unknown: "2m",
});

const UI_RAMP_SECONDS = 0.25;
const VOICE_REMOVE_RAMP_SECONDS = 0.5;
const PHRASE_STEPS = 32;

const PAD_CHORDS = Object.freeze({
  healthy: [[0, 2, 4], [0, 3, 5], [4, 6, 1], [0, 2, 5]],
  warning: [[0, 1, 4], [0, 3, 5], [1, 4, 6], [0, 2, 5]],
  critical: [[0, 1, 4], [1, 3, 5], [0, 4, 6], [0, 1, 5]],
  unknown: [[0, 3], [0, 4], [1, 3], [0, 5]],
});

const BASS_STEPS = Object.freeze({
  healthy: new Set([0, 6, 8, 14, 16, 22, 24, 30]),
  warning: new Set([0, 5, 8, 11, 14, 16, 21, 24, 27, 30]),
  critical: new Set([0, 4, 8, 12, 16, 20, 24, 28]),
  unknown: new Set([0, 12, 16, 28]),
});

const BASS_DEGREES = Object.freeze({
  healthy: [0, 4, 5, 4],
  warning: [0, 1, 4, 5, 0],
  critical: [0, 1, 4, 0],
  unknown: [0, 4, 0, 5],
});

const COUNTERLINE_STEPS = Object.freeze({
  healthy: [2, 10, 18, 26],
  warning: [2, 6, 10, 14, 18, 22, 26, 30],
  critical: [2, 6, 10, 14, 18, 22, 26, 30],
  unknown: [6, 14, 22, 30],
});

const COUNTERLINE_DEGREES = Object.freeze({
  healthy: [0, 4, 2, 5],
  warning: [0, 1, 4, 3],
  critical: [0, 1, 4, 1],
  unknown: [0, 4, 1, 5],
});

const COUNTERLINE_DURATIONS = Object.freeze({
  healthy: "2n.",
  warning: "4n",
  critical: "8n",
  unknown: "1m",
});

const COUNTERLINE_VELOCITIES = Object.freeze({
  healthy: 0.34,
  warning: 0.38,
  critical: 0.34,
  unknown: 0.26,
});

const TERMINAL_PATTERNS = Object.freeze([
  Object.freeze([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31]),
  Object.freeze([2, 3, 6, 7, 10, 11, 14, 15, 18, 19, 22, 23, 26, 27, 30, 31]),
  Object.freeze([1, 4, 5, 8, 9, 12, 13, 16, 17, 20, 21, 24, 25, 28, 29, 31]),
  Object.freeze([2, 5, 6, 9, 10, 13, 14, 17, 18, 21, 22, 25, 26, 29, 30, 31]),
]);

const TERMINAL_DEGREES = Object.freeze({
  healthy: Object.freeze([0, 4, 2, 5, 4, 6, 2, 3]),
  warning: Object.freeze([0, 1, 4, 3, 5, 1, 6, 4]),
  critical: Object.freeze([0, 1, 4, 1, 5, 3, 1, 6]),
  unknown: Object.freeze([0, 3, 1, 4, 0, 5, 3, 1]),
});

const PERFORMANCE_KICK_VARIANTS = Object.freeze([
  Object.freeze([6, 22]),
  Object.freeze([3, 11, 19, 27]),
  Object.freeze([7, 15, 23, 31]),
  Object.freeze([5, 13, 21, 29]),
]);

const PERFORMANCE_METAL_VARIANTS = Object.freeze([
  Object.freeze([7, 23]),
  Object.freeze([11, 27]),
  Object.freeze([15, 31]),
  Object.freeze([5, 21]),
]);

const SERVICE_ANCHOR_STEPS = Object.freeze({
  healthy: new Set([1, 5, 9, 13, 17, 21, 25, 29]),
  warning: new Set([1, 3, 5, 9, 11, 13, 17, 19, 21, 25, 27, 29]),
  critical: new Set([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31]),
  unknown: new Set([3, 7, 11, 19, 23, 27]),
});

const NOTE_LENGTHS = Object.freeze({
  legato: "1m",
  tenuto: "2n.",
  urgent: "4n",
  suspended: "1m",
});

const FAMILY_BUS_GAINS = Object.freeze({
  "analog-pad": 0.72,
  "data-sequence": 0.6,
  "industrial-pulse": 0.56,
  "edge-saw": 0.5,
  "sub-drone": 0.7,
  "relay-bass": 0.64,
  "tape-signal": 0.48,
});

function randomUnit(seed) {
  let value = seed >>> 0;
  value += 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function shouldPlayPad(step) {
  return Number.isInteger(step) && step >= 0 && step % PAD_MEASURE_STEPS === 0;
}

export function buildPadVoicing(scoreState, scale, measureIndex, chordOffset = 0) {
  const chords = PAD_CHORDS[scoreState] ?? PAD_CHORDS.unknown;
  const safeChordOffset = Math.abs(Math.trunc(chordOffset));
  const chord = chords[
    (Math.abs(Math.trunc(measureIndex)) + safeChordOffset) % chords.length
  ];
  const inversion = Math.floor(Math.abs(Math.trunc(measureIndex)) / chords.length)
    % chord.length;
  return chord.map((_, index) => {
    const degree = chord[(index + inversion) % chord.length];
    const scaleOffset = scale[degree % scale.length];
    const octave = index === 0 ? 0 : 12;
    return Math.min(57, PAD_ROOT_MIDI + scaleOffset + octave);
  });
}

export function bassEventForStep(
  scoreState,
  scale,
  step,
  phraseIndex = 0,
  performance = null,
) {
  const baseSteps = [...(BASS_STEPS[scoreState] ?? BASS_STEPS.unknown)];
  const activeSteps = performance
    ? baseSteps.map((activeStep, index) => (
        index % 2 === 0
          ? activeStep
          : (activeStep + (performance.bassShift ?? 0) + PHRASE_STEPS) % PHRASE_STEPS
      ))
    : baseSteps;
  const eventIndex = activeSteps.indexOf(step);
  if (eventIndex === -1) return null;

  const degrees = BASS_DEGREES[scoreState] ?? BASS_DEGREES.unknown;
  const phraseSeed = stableHash(
    `${scoreState}:${performance?.seed ?? "live"}:${phraseIndex}:bass`,
  );
  const degree = degrees[
    (
      phraseSeed
      + eventIndex
      + (performance?.bassDegreeOffset ?? 0)
      + phraseIndex * (performance?.phraseStride ?? 1)
    ) % degrees.length
  ];
  const safeScale = Array.isArray(scale) && scale.length ? scale : [0];
  const midi = 26 + safeScale[degree % safeScale.length];
  const baseVelocity = scoreState === "critical"
    ? 0.5
    : scoreState === "unknown"
      ? 0.36
      : 0.46;
  return {
    midi,
    duration: scoreState === "critical"
      ? "8n"
      : scoreState === "warning"
        ? "4n"
        : scoreState === "unknown"
          ? "1m"
          : "2n.",
    velocity: Math.min(0.58, baseVelocity * (performance?.bassMultiplier ?? 1)),
  };
}

export function counterlineEventForStep(
  scoreState,
  scale,
  step,
  phraseIndex = 0,
  performance = null,
) {
  const activeSteps = COUNTERLINE_STEPS[scoreState] ?? COUNTERLINE_STEPS.unknown;
  const eventIndex = activeSteps.indexOf(step);
  if (eventIndex === -1) return null;

  const degrees = COUNTERLINE_DEGREES[scoreState] ?? COUNTERLINE_DEGREES.unknown;
  const safeScale = Array.isArray(scale) && scale.length ? scale : [0];
  const degree = degrees[
    (
      eventIndex
      + Math.abs(Math.trunc(phraseIndex)) * (performance?.phraseStride ?? 1)
      + (performance?.melodyOffset ?? 0)
    ) % degrees.length
  ];
  return {
    midi: PAD_ROOT_MIDI + safeScale[degree % safeScale.length],
    duration: COUNTERLINE_DURATIONS[scoreState] ?? COUNTERLINE_DURATIONS.unknown,
    velocity: Math.min(
      0.56,
      (COUNTERLINE_VELOCITIES[scoreState] ?? COUNTERLINE_VELOCITIES.unknown)
        * (performance?.counterlineMultiplier ?? 1),
    ),
  };
}

export function terminalEventForStep(
  scoreState,
  scale,
  step,
  phraseIndex = 0,
  performance = null,
) {
  if (!performance || !Number.isInteger(step) || step < 0 || step >= PHRASE_STEPS) {
    return null;
  }
  const pattern = TERMINAL_PATTERNS[
    Math.abs(Math.trunc(performance.terminalPattern ?? 0)) % TERMINAL_PATTERNS.length
  ];
  const eventCount = Math.min(
    pattern.length,
    4 + Math.round((performance.terminalDensity ?? 0.5) * 12),
  );
  const activeSteps = pattern.slice(0, eventCount);
  const eventIndex = activeSteps.indexOf(step);
  if (eventIndex === -1) return null;

  const degrees = TERMINAL_DEGREES[scoreState] ?? TERMINAL_DEGREES.unknown;
  const safeScale = Array.isArray(scale) && scale.length ? scale : [0];
  const degree = degrees[
    (
      eventIndex
      + (performance.melodyOffset ?? 0)
      + phraseIndex * (performance.phraseStride ?? 1)
    ) % degrees.length
  ];
  const octave = performance.energy >= 0.78 && eventIndex % 4 === 3 ? 12 : 0;
  return {
    midi: Math.min(60, PAD_ROOT_MIDI + safeScale[degree % safeScale.length] + octave),
    duration: performance.motion >= 0.7 ? "8n" : "4n",
    velocity: Math.min(0.46, 0.2 + performance.energy * 0.24),
  };
}

export function shouldPlayServiceVoice(
  scoreState,
  phraseIndex,
  step,
  scoreDensity,
  voiceDensity,
  performance = null,
) {
  if (!Number.isInteger(step) || step < 0 || step >= PHRASE_STEPS) return false;
  const anchors = SERVICE_ANCHOR_STEPS[scoreState] ?? SERVICE_ANCHOR_STEPS.unknown;
  if (anchors.has(step)) return true;
  const chance = randomUnit(
    stableHash(
      `${scoreState}:${performance?.seed ?? "live"}:${phraseIndex}:${step}:service`,
    ),
  );
  const density = Math.min(
    1,
    Math.max(0, Number(scoreDensity) || 0)
      * Math.max(0, Number(voiceDensity) || 0)
      * (performance?.densityMultiplier ?? 1),
  );
  return chance <= density;
}

export function serviceOctaveDisplacement(seed) {
  return randomUnit(seed) < 0.06 ? -12 : 0;
}

function basePercussionEventsForStep(scoreState, step) {
  if (!Number.isInteger(step) || step < 0 || step >= PHRASE_STEPS) {
    return { kick: null, snare: null, hat: null, metal: null };
  }

  if (scoreState === "critical") {
    return {
      kick: step % 8 === 0 || step === 14 || step === 30
        ? { duration: "8n", velocity: step % 8 === 0 ? 0.72 : 0.48 }
        : null,
      snare: step % 8 === 4
        ? { duration: 0.09, velocity: 0.48 }
        : null,
      hat: step % 2 === 1
        ? { duration: 0.035, velocity: step % 8 === 7 ? 0.3 : 0.2 }
        : null,
      metal: step === 15 || step === 31
        ? { duration: "16n", velocity: 0.24 }
        : null,
    };
  }

  if (scoreState === "warning") {
    return {
      kick: step % 8 === 0 || [6, 14, 22, 30].includes(step)
        ? { duration: "8n", velocity: step % 8 === 0 ? 0.52 : 0.3 }
        : null,
      snare: step % 8 === 4
        ? { duration: 0.085, velocity: 0.36 }
        : null,
      hat: step % 2 === 1
        ? { duration: 0.032, velocity: step % 8 === 7 ? 0.22 : 0.14 }
        : null,
      metal: step === 15 || step === 31
        ? { duration: "16n", velocity: 0.14 }
        : null,
    };
  }

  if (scoreState === "healthy") {
    return {
      kick: step % 8 === 0 ? { duration: "8n", velocity: 0.4 } : null,
      snare: step % 8 === 4 ? { duration: 0.08, velocity: 0.28 } : null,
      hat: step % 2 === 1
        ? { duration: 0.03, velocity: step % 8 === 7 ? 0.16 : 0.1 }
        : null,
      metal: step === 15 || step === 31
        ? { duration: "16n", velocity: 0.09 }
        : null,
    };
  }

  return {
    kick: step === 0 || step === 16
      ? { duration: "8n", velocity: 0.3 }
      : null,
    snare: step === 12 || step === 28
      ? { duration: 0.075, velocity: 0.16 }
      : null,
    hat: [3, 7, 11, 19, 23, 31].includes(step)
      ? { duration: 0.035, velocity: 0.08 }
      : null,
    metal: step === 15 || step === 31
      ? { duration: "16n", velocity: 0.07 }
      : null,
  };
}

export function percussionEventsForStep(scoreState, step, performance = null) {
  const base = basePercussionEventsForStep(scoreState, step);
  if (!performance) return base;

  const events = { ...base };
  const kickSteps = PERFORMANCE_KICK_VARIANTS[
    Math.abs(Math.trunc(performance.percussionVariant ?? 0))
      % PERFORMANCE_KICK_VARIANTS.length
  ];
  const metalSteps = PERFORMANCE_METAL_VARIANTS[
    Math.abs(Math.trunc(performance.percussionVariant ?? 0))
      % PERFORMANCE_METAL_VARIANTS.length
  ];
  if (!events.kick && performance.energy >= 0.45 && kickSteps.includes(step)) {
    events.kick = { duration: "16n", velocity: 0.22 + performance.energy * 0.18 };
  }
  if (!events.hat && performance.motion >= 0.72 && step % 4 === 2) {
    events.hat = { duration: 0.025, velocity: 0.08 + performance.motion * 0.1 };
  }
  if (!events.metal && performance.grit >= 0.56 && metalSteps.includes(step)) {
    events.metal = { duration: "32n", velocity: 0.07 + performance.grit * 0.1 };
  }

  const multiplier = performance.drumMultiplier ?? 1;
  for (const event of Object.values(events)) {
    if (event) event.velocity = Math.min(0.82, event.velocity * multiplier);
  }
  return events;
}

export function shouldApplyPendingPerformance(step) {
  return Number.isInteger(step) && step >= 0 && step % PAD_MEASURE_STEPS === 0;
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
    case "analog-pad":
      return new Tone.FMSynth({
        harmonicity: 0.501,
        modulationIndex: 1.8,
        oscillator: { type: "sine" },
        modulation: { type: "sine" },
        envelope: { attack: 0.65, decay: 0.8, sustain: 0.68, release: 3.4 },
        modulationEnvelope: { attack: 1.1, decay: 0.8, sustain: 0.22, release: 2.8 },
        volume: -13,
      });
    case "data-sequence":
      return new Tone.AMSynth({
        harmonicity: 1.5,
        oscillator: { type: "triangle" },
        modulation: { type: "square" },
        envelope: { attack: 0.035, decay: 0.28, sustain: 0.42, release: 1.25 },
        modulationEnvelope: { attack: 0.08, decay: 0.22, sustain: 0.18, release: 0.8 },
        volume: -14,
      });
    case "industrial-pulse":
      return new Tone.MembraneSynth({
        pitchDecay: 0.055,
        octaves: 1.8,
        oscillator: { type: "sine" },
        envelope: { attack: 0.008, decay: 0.48, sustain: 0.16, release: 1.1 },
        volume: -15,
      });
    case "edge-saw":
      return new Tone.MonoSynth({
        oscillator: { type: "sawtooth" },
        filter: { type: "lowpass", Q: 2.8, rolloff: -24 },
        envelope: { attack: 0.18, decay: 0.42, sustain: 0.48, release: 1.7 },
        filterEnvelope: {
          attack: 0.22,
          decay: 0.55,
          sustain: 0.24,
          release: 1.3,
          baseFrequency: 110,
          octaves: 2.7,
        },
        volume: -16,
      });
    case "sub-drone":
      return new Tone.MonoSynth({
        oscillator: { type: "sine" },
        filter: { type: "lowpass", Q: 1.2, rolloff: -24 },
        envelope: { attack: 0.7, decay: 0.65, sustain: 0.76, release: 3.2 },
        filterEnvelope: {
          attack: 0.8,
          decay: 0.7,
          sustain: 0.35,
          release: 2.6,
          baseFrequency: 70,
          octaves: 2.2,
        },
        volume: -13,
      });
    case "relay-bass":
      return new Tone.MonoSynth({
        oscillator: { type: "square" },
        filter: { type: "lowpass", Q: 1.5, rolloff: -24 },
        envelope: { attack: 0.055, decay: 0.45, sustain: 0.5, release: 1.5 },
        filterEnvelope: {
          attack: 0.08,
          decay: 0.5,
          sustain: 0.24,
          release: 1.1,
          baseFrequency: 75,
          octaves: 2.3,
        },
        volume: -15,
      });
    case "tape-signal":
    default:
      return new Tone.FMSynth({
        harmonicity: 1.003,
        modulationIndex: 2.4,
        oscillator: { type: "triangle" },
        modulation: { type: "sine" },
        envelope: { attack: 0.22, decay: 0.6, sustain: 0.42, release: 2.2 },
        modulationEnvelope: { attack: 0.5, decay: 0.7, sustain: 0.12, release: 1.9 },
        volume: -16,
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
  let activePerformance = null;
  let pendingPerformance = null;
  let pendingPerformanceSet = false;

  const voices = new Map();
  const voiceParams = new Map();
  const familyBuses = new Map();

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
  let serviceDistortion = null;
  let droneGain = null;
  let padGain = null;
  let bassGain = null;
  let counterlineGain = null;
  let percussionGain = null;
  let textureGain = null;
  let terminalGain = null;
  let deploymentGain = null;
  let drone = null;
  let pad = null;
  let bass = null;
  let counterline = null;
  let counterlineFilter = null;
  let terminalSynth = null;
  let terminalFilter = null;
  let terminalDelay = null;
  let kick = null;
  let snare = null;
  let hat = null;
  let hatFilter = null;
  let metal = null;
  let textureNoise = null;
  let textureFilter = null;
  let deploymentSynth = null;
  let voiceHandler = null;
  let incidentHandler = null;
  let deploymentHandler = null;
  let performanceHandler = null;

  function familyBus(Tone, family) {
    let bus = familyBuses.get(family);
    if (bus) return bus;
    bus = new Tone.Gain(FAMILY_BUS_GAINS[family] ?? 0.5).connect(serviceBus);
    familyBuses.set(family, bus);
    return bus;
  }

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
    synth.chain(filter, panner, gain, familyBus(Tone, params.instrumentFamily));
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
    compressor = new Tone.Compressor(-20, 3.5);
    reverb = new Tone.Reverb({ decay: 4.8, wet: 0.3 });
    masterFilter = new Tone.Filter({
      type: "lowpass",
      frequency: 4200,
      rolloff: -24,
      Q: 0.85,
    });
    masterVolume = new Tone.Volume(-12);
    masterVolume.chain(masterFilter, reverb, compressor, limiter, userGain);
    limiter.connect(analyser);

    serviceBus = new Tone.Gain(0.86);
    serviceDistortion = new Tone.Distortion({
      distortion: 0.22,
      oversample: "2x",
      wet: 0,
    });
    serviceBus.chain(serviceDistortion, masterVolume);
    droneGain = new Tone.Gain(0.3).connect(masterVolume);
    padGain = new Tone.Gain(0.72).connect(masterVolume);
    bassGain = new Tone.Gain(0.5).connect(masterVolume);
    counterlineGain = new Tone.Gain(0.25).connect(masterVolume);
    percussionGain = new Tone.Gain(0).connect(masterVolume);
    textureGain = new Tone.Gain(0.012).connect(masterVolume);
    terminalGain = new Tone.Gain(0).connect(masterVolume);
    deploymentGain = new Tone.Gain(0.62).connect(masterVolume);

    drone = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsine", count: 3, spread: 8 },
      envelope: { attack: 4.2, decay: 2.2, sustain: 0.86, release: 8.5 },
      volume: -15,
    }).connect(droneGain);

    pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsawtooth", count: 3, spread: 13 },
      envelope: { attack: 2.4, decay: 1.8, sustain: 0.72, release: 6.8 },
      volume: -17,
    }).connect(padGain);

    bass = new Tone.MonoSynth({
      oscillator: { type: "square" },
      filter: { type: "lowpass", Q: 1.4, rolloff: -24 },
      envelope: { attack: 0.035, decay: 0.36, sustain: 0.58, release: 0.9 },
      filterEnvelope: {
        attack: 0.05,
        decay: 0.38,
        sustain: 0.28,
        release: 0.72,
        baseFrequency: 58,
        octaves: 2.2,
      },
      volume: -14,
    }).connect(bassGain);

    counterline = new Tone.FMSynth({
      harmonicity: 0.502,
      modulationIndex: 2.1,
      oscillator: { type: "triangle" },
      modulation: { type: "sine" },
      envelope: { attack: 0.18, decay: 0.7, sustain: 0.5, release: 2.8 },
      modulationEnvelope: { attack: 0.3, decay: 0.8, sustain: 0.16, release: 2.2 },
      volume: -15,
    });
    counterlineFilter = new Tone.Filter({
      type: "lowpass",
      frequency: 1600,
      rolloff: -24,
      Q: 1.6,
    });
    counterline.chain(counterlineFilter, counterlineGain);

    terminalSynth = new Tone.AMSynth({
      harmonicity: 1.5,
      oscillator: { type: "triangle" },
      modulation: { type: "square" },
      envelope: { attack: 0.012, decay: 0.18, sustain: 0.24, release: 0.8 },
      modulationEnvelope: { attack: 0.02, decay: 0.16, sustain: 0.08, release: 0.55 },
      volume: -16,
    });
    terminalFilter = new Tone.Filter({
      type: "lowpass",
      frequency: 2100,
      rolloff: -24,
      Q: 2.2,
    });
    terminalDelay = new Tone.FeedbackDelay({
      delayTime: "8n.",
      feedback: 0.22,
      wet: 0.08,
    });
    terminalSynth.chain(terminalFilter, terminalDelay, terminalGain);

    kick = new Tone.MembraneSynth({
      pitchDecay: 0.045,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.28, sustain: 0.02, release: 0.35 },
      volume: -8,
    }).connect(percussionGain);
    snare = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.001, decay: 0.11, sustain: 0 },
      volume: -15,
    }).connect(percussionGain);
    hat = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0 },
      volume: -22,
    });
    hatFilter = new Tone.Filter({
      type: "bandpass",
      frequency: 3600,
      Q: 1.8,
    });
    hat.chain(hatFilter, percussionGain);
    metal = new Tone.MetalSynth({
      frequency: 92,
      envelope: { attack: 0.001, decay: 0.12, release: 0.04 },
      harmonicity: 3.1,
      modulationIndex: 11,
      resonance: 900,
      octaves: 0.8,
      volume: -22,
    }).connect(percussionGain);

    textureNoise = new Tone.Noise("brown");
    textureFilter = new Tone.Filter({
      type: "bandpass",
      frequency: 420,
      Q: 2.4,
    });
    textureNoise.chain(textureFilter, textureGain);
    textureNoise.start();

    deploymentSynth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 1.5,
      modulationIndex: 2.8,
      oscillator: { type: "sine" },
      modulation: { type: "triangle" },
      envelope: { attack: 0.02, decay: 0.28, sustain: 0.3, release: 1.8 },
      modulationEnvelope: { attack: 0.04, decay: 0.25, sustain: 0.1, release: 1.2 },
      volume: -10,
    }).connect(deploymentGain);

    transport = Tone.getTransport();
    schedulerId = transport.scheduleRepeat(onEighth, "8n");
    initialized = true;
  }

  function playPad(time, frame, step) {
    if (!shouldPlayPad(step)) return;
    const measureIndex = phraseIndex * 4 + step / PAD_MEASURE_STEPS;
    const notes = buildPadVoicing(
      frame.scoreState,
      frame.scale,
      measureIndex,
      activePerformance?.chordOffset ?? 0,
    )
      .map(midiToFrequencyHz);
    const velocity = frame.scoreState === "healthy"
      ? 0.42
      : frame.scoreState === "warning"
        ? 0.4
        : frame.scoreState === "unknown"
          ? 0.34
          : 0.36;
    pad.triggerAttackRelease(
      notes,
      PAD_DURATIONS[frame.scoreState] ?? PAD_DURATIONS.unknown,
      time,
      Math.min(0.5, velocity * (activePerformance?.padMultiplier ?? 1)),
    );
  }

  function playDrone(time, step) {
    if (step !== 0) return;
    drone.triggerAttackRelease(
      DRONE_MIDI.map(midiToFrequencyHz),
      "4m",
      time,
      0.3,
    );
  }

  function playBass(time, frame, step) {
    const event = bassEventForStep(
      frame.scoreState,
      frame.scale,
      step,
      phraseIndex,
      activePerformance,
    );
    if (!event) return;
    bass.triggerAttackRelease(
      midiToFrequencyHz(event.midi),
      event.duration,
      time,
      event.velocity,
    );
  }

  function playCounterline(time, frame, step) {
    const event = counterlineEventForStep(
      frame.scoreState,
      frame.scale,
      step,
      phraseIndex,
      activePerformance,
    );
    if (!event) return;
    counterline.triggerAttackRelease(
      midiToFrequencyHz(event.midi),
      event.duration,
      time,
      event.velocity,
    );
  }

  function playTerminal(time, frame, step) {
    const event = terminalEventForStep(
      frame.scoreState,
      frame.scale,
      step,
      phraseIndex,
      activePerformance,
    );
    if (!event) return;
    terminalSynth.triggerAttackRelease(
      midiToFrequencyHz(event.midi),
      event.duration,
      time,
      event.velocity,
    );
  }

  function playPercussion(time, frame, step) {
    const events = percussionEventsForStep(frame.scoreState, step, activePerformance);
    if (events.kick) {
      kick.triggerAttackRelease(
        "D1",
        events.kick.duration,
        time,
        events.kick.velocity,
      );
    }
    if (events.snare) {
      snare.triggerAttackRelease(
        events.snare.duration,
        time,
        events.snare.velocity,
      );
    }
    if (events.hat) {
      hat.triggerAttackRelease(events.hat.duration, time, events.hat.velocity);
    }
    if (events.metal) {
      metal.triggerAttackRelease(events.metal.duration, time, events.metal.velocity);
    }
  }

  function playService(time, frame, step) {
    if (!frame.voices.length) return;
    const params = frame.voices[serviceCursor % frame.voices.length];
    serviceCursor += 1 + ((phraseIndex + step) % 3 === 0 ? 1 : 0);
    if (!shouldPlayServiceVoice(
      frame.scoreState,
      phraseIndex,
      step,
      frame.density,
      params.density,
      activePerformance,
    )) return;

    const voice = voices.get(params.name);
    if (!voice) return;

    const motifIndex = (
      phraseIndex * (activePerformance?.phraseStride ?? 1)
      + step
      + params.hash
      + (activePerformance?.melodyOffset ?? 0)
    ) % params.motifMidi.length;
    const seed = params.hash ^ phraseIndex ^ (step << 8);
    const midi = boundVoiceMidi(
      params,
      params.motifMidi[motifIndex] + serviceOctaveDisplacement(seed),
    );
    const frequency = midiToFrequencyHz(midi) * Math.pow(2, params.detuneCents / 1200);
    const duration = NOTE_LENGTHS[params.articulation] ?? "4n";
    const velocity = Math.min(
      0.62,
      params.velocity
        * (params.status === "unknown" ? 0.7 : 1)
        * (activePerformance ? 0.84 + activePerformance.energy * 0.24 : 1),
    );
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
    if (pendingPerformanceSet && shouldApplyPendingPerformance(step)) {
      activePerformance = pendingPerformance;
      pendingPerformance = null;
      pendingPerformanceSet = false;
      applyMixToGraph(currentFrame, 0.35);
      const Tone = requireTone();
      Tone.Draw.schedule(() => performanceHandler?.(activePerformance), time);
    }
    playDrone(time, step);
    playPad(time, currentFrame, step);
    playBass(time, currentFrame, step);
    playCounterline(time, currentFrame, step);
    playTerminal(time, currentFrame, step);
    playPercussion(time, currentFrame, step);
    playService(time, currentFrame, step);
    stepIndex += 1;
  }

  function applyMixToGraph(frame, transition = frame.transitionSeconds) {
    const performance = activePerformance;
    const droneBase = frame.scoreState === "critical"
      ? 0.34
      : frame.scoreState === "warning"
        ? 0.32
        : frame.scoreState === "unknown"
          ? 0.27
          : 0.34;
    const padBase = frame.scoreState === "unknown"
      ? 0.6
      : frame.scoreState === "warning"
        ? 0.78
        : frame.scoreState === "critical"
          ? 0.72
          : 0.82;
    const bassBase = frame.scoreState === "critical"
      ? 0.78
      : frame.scoreState === "warning"
        ? 0.62
        : frame.scoreState === "unknown"
          ? 0.4
          : 0.6;
    const counterlineFilterBase = frame.scoreState === "critical"
      ? 1200
      : frame.scoreState === "warning"
        ? 1450
        : frame.scoreState === "unknown"
          ? 900
          : 1800;
    const textureBase = frame.scoreState === "critical"
      ? 0.024
      : frame.scoreState === "warning"
        ? 0.018
        : frame.scoreState === "unknown"
          ? 0.02
          : 0.012;

    safeRamp(
      transport.bpm,
      frame.bpm * (performance?.bpmMultiplier ?? 1),
      transition,
    );
    safeRamp(masterVolume.volume, frame.masterGainDb, transition);
    safeRamp(masterFilter.frequency, frame.masterFilterHz, transition);
    safeRamp(
      droneGain.gain,
      droneBase * (performance?.droneMultiplier ?? 1),
      transition,
    );
    safeRamp(
      padGain.gain,
      padBase * (performance?.padMultiplier ?? 1),
      transition,
    );
    safeRamp(
      bassGain.gain,
      bassBase * (performance?.bassMultiplier ?? 1),
      transition,
    );
    safeRamp(
      counterlineGain.gain,
      (COUNTERLINE_BUS_GAINS[frame.scoreState] ?? COUNTERLINE_BUS_GAINS.unknown)
        * (performance?.counterlineMultiplier ?? 1),
      transition,
    );
    safeRamp(
      counterlineFilter.frequency,
      counterlineFilterBase * (performance?.serviceFilterMultiplier ?? 1),
      transition,
    );
    safeRamp(
      percussionGain.gain,
      (PERCUSSION_BUS_GAINS[frame.scoreState] ?? 0)
        * (performance?.drumMultiplier ?? 1),
      transition,
    );
    safeRamp(
      textureGain.gain,
      textureBase * (performance?.textureMultiplier ?? 1),
      transition,
    );
    const terminalStateMultiplier = frame.scoreState === "unknown"
      ? 0.7
      : frame.scoreState === "healthy"
        ? 0.9
        : 1;
    safeRamp(
      terminalGain.gain,
      (performance?.terminalGain ?? 0) * terminalStateMultiplier,
      transition,
    );
    safeRamp(
      terminalFilter.frequency,
      performance ? 1350 + performance.grit * 1350 : 1800,
      transition,
    );
    safeRamp(terminalDelay.wet, performance?.delayWet ?? 0.08, transition);
    safeRamp(serviceDistortion.wet, performance?.distortionWet ?? 0, transition);
    safeRamp(reverb.wet, performance?.reverbWet ?? 0.3, transition);
    safeRamp(
      textureFilter.frequency,
      performance ? 360 + performance.grit * 440 : 420,
      transition,
    );
  }

  function applyFrameToGraph(frame) {
    syncServiceVoices(frame.voices);
    const transition = frame.transitionSeconds;
    applyMixToGraph(frame, transition);

    voiceParams.clear();
    for (const params of frame.voices) {
      voiceParams.set(params.name, params);
      const voice = voices.get(params.name);
      if (!voice) continue;
      safeRamp(
        voice.filter.frequency,
        Math.max(
          420,
          params.filterHz
            * params.brightness
            * (activePerformance?.serviceFilterMultiplier ?? 1),
        ),
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
    for (const bus of familyBuses.values()) bus.dispose();
    familyBuses.clear();
    for (const node of [
      deploymentSynth,
      terminalDelay,
      terminalFilter,
      terminalSynth,
      textureFilter,
      textureNoise,
      metal,
      hatFilter,
      hat,
      snare,
      kick,
      counterlineFilter,
      counterline,
      bass,
      pad,
      drone,
      deploymentGain,
      terminalGain,
      textureGain,
      percussionGain,
      bassGain,
      counterlineGain,
      padGain,
      droneGain,
      serviceDistortion,
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

    setPerformance(performance, { quantize = true } = {}) {
      const nextPerformance = performance ?? null;
      const nextId = nextPerformance?.id ?? null;
      const activeId = activePerformance?.id ?? null;
      const pendingId = pendingPerformanceSet ? pendingPerformance?.id ?? null : undefined;
      if (nextId === activeId && !pendingPerformanceSet) {
        return { queued: false, unchanged: true };
      }
      if (pendingPerformanceSet && nextId === pendingId) {
        return { queued: true, unchanged: true };
      }
      if (quantize && initialized && running) {
        pendingPerformance = nextPerformance;
        pendingPerformanceSet = true;
        return { queued: true, unchanged: false };
      }
      activePerformance = nextPerformance;
      pendingPerformance = null;
      pendingPerformanceSet = false;
      if (initialized && currentFrame) {
        applyMixToGraph(currentFrame, 0.35);
      }
      performanceHandler?.(activePerformance);
      return { queued: false, unchanged: false };
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
          snare.triggerAttackRelease(0.09, time, 0.56);
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
      const notes = [50, 57, 64, 66, 62]; // D3, A3, E4, F#4, D4
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
    setPerformanceHandler(handler) {
      performanceHandler = typeof handler === "function" ? handler : null;
    },
    dispose() {
      if (destroyed) return;
      running = false;
      destroyed = true;
      disposeGraph();
    },
  };
}
