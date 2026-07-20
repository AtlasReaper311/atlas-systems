/**
 * System SYMPHONY persistent telemetry composition engine.
 *
 * Live telemetry supplies bounded musical intention through composition-director.
 * The engine owns transport-aware expression: phrase memory, motif recurrence,
 * quantised scene changes and a shared musical mix. Ghost Circuit remains a
 * separate deterministic performance client of the same synthesis graph.
 */

import {
  MAX_COMPONENTS,
  boundVoiceMidi,
  midiToFrequencyHz,
  stableHash,
} from "./mapping.js?v=20260720-system-symphony-loop-production-v2";
import { createHybridSampler } from "./sampler.js?v=20260720-system-symphony-loop-production-v2";
import {
  arrangementPhaseForPhrase,
  filterAutomationMultiplier,
  ghostLayerMixProfile,
  ghostRiffEventForStep,
  orderedDegreeIndex,
  rotatePatternSteps,
  transitionAccentForStep,
} from "./ghost-circuit.js?v=20260720-system-symphony-loop-production-v2";
import {
  createCompositionDirector,
  motifEventForStep,
} from "./composition-director.js?v=20260720-system-symphony-loop-production-v2";

export const DEFAULT_USER_GAIN = 0.62;
export const AUDIO_CONTEXT_BLOCKED_CODE = "audio-context-blocked";
export const SCENE_CROSSFADE_SECONDS = 4;
export const MAX_SERVICE_VOICES = MAX_COMPONENTS;
export const MAX_INCIDENT_ACCENTS = 4;
export const WAVEFORM_SIZE = 512;
export const AUDIO_START_TIMEOUT_MS = 8000;
export const SYSTEM_SYMPHONY_BUILD_ID = "20260720-system-symphony-loop-production-v2";
export const LIVE_STATE_TRANSITION_SECONDS = 6;
export const LIVE_STATE_CONFIRMATION_FRAMES = Object.freeze({
  healthy: 3,
  warning: 2,
  critical: 2,
  unknown: 3,
});
export const PAD_MEASURE_STEPS = 8;
export const PAD_ROOT_MIDI = 41; // F2
export const ARP_ROOT_MIDI = 53; // F3
export const ARP_MAX_MIDI = 65; // F4
export const DRONE_MIDI = Object.freeze([29, 36]); // F1 / C2
export const SUB_ROOT_MIDI = 29; // F1
export const SUB_FIFTH_MIDI = 36; // C2

// Optional production layers added after the approved PR #38 composition. During
// the loop-recovery baseline they are bypassed so the core score plus correctly
// integrated 100 BPM loops can be judged on their own. Each flag can be enabled
// and listened to individually once the baseline is approved; the nodes stay in
// the graph either way so re-enabling is a single flag change with no rewiring.
export const PRODUCTION_FEATURES = Object.freeze({
  sidechain: true,
  subBass: true,
  masterClipper: true,
  ghostReverb: true,
  airTexture: true,
  dropGestures: true,
});
export const PERCUSSION_BUS_GAINS = Object.freeze({
  healthy: 0.42,
  warning: 0.56,
  critical: 0.72,
  unknown: 0.2,
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

export const MIX_LIMITS = Object.freeze({
  drumParallelGain: 0.18,
  drumDriveWet: 0.16,
  serviceDriveWet: 0.2,
  terminalGain: 0.92,
  riffGain: 0.82,
  motifGain: 0.46,
  masterGainDbMin: -14,
  masterGainDbMax: -4,
});

const UI_RAMP_SECONDS = 0.25;
const VOICE_REMOVE_RAMP_SECONDS = 0.5;
const PHRASE_STEPS = 32;
const MAX_GHOST_ARP_BUS_GAIN = MIX_LIMITS.terminalGain;
const MAX_GHOST_RIFF_BUS_GAIN = MIX_LIMITS.riffGain;

const PAD_PROGRESSIONS = Object.freeze({
  healthy: Object.freeze([
    Object.freeze([[0, 2, 4], [0, 3, 5], [4, 6, 1], [0, 2, 5]]),
    Object.freeze([[0, 2, 5], [3, 5, 0], [4, 6, 2], [2, 4, 6]]),
    Object.freeze([[0, 4, 6], [5, 0, 2], [3, 5, 1], [4, 6, 2]]),
    Object.freeze([[0, 2, 4], [5, 1, 3], [3, 5, 0], [4, 1, 6]]),
  ]),
  warning: Object.freeze([
    Object.freeze([[0, 1, 4], [0, 3, 5], [1, 4, 6], [0, 2, 5]]),
    Object.freeze([[0, 1, 5], [3, 5, 0], [1, 4, 6], [4, 6, 2]]),
    Object.freeze([[0, 4, 6], [1, 3, 5], [0, 1, 4], [5, 0, 2]]),
    Object.freeze([[0, 2, 5], [1, 4, 6], [3, 5, 0], [0, 1, 4]]),
  ]),
  critical: Object.freeze([
    Object.freeze([[0, 1, 4], [1, 3, 5], [0, 4, 6], [0, 1, 5]]),
    Object.freeze([[0, 1, 5], [1, 4, 6], [0, 3, 5], [1, 3, 6]]),
    Object.freeze([[0, 4, 6], [1, 3, 5], [0, 1, 4], [3, 5, 1]]),
    Object.freeze([[0, 1, 4], [4, 6, 1], [1, 3, 5], [0, 1, 5]]),
  ]),
  unknown: Object.freeze([
    Object.freeze([[0, 3], [0, 4], [1, 3], [0, 5]]),
    Object.freeze([[0, 4], [1, 5], [0, 3], [2, 5]]),
    Object.freeze([[0, 5], [3, 0], [1, 4], [0, 3]]),
    Object.freeze([[0, 3], [2, 5], [0, 4], [1, 3]]),
  ]),
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

const PERFORMANCE_BASS_PATTERNS = Object.freeze([
  Object.freeze([0, 2, 4, 6]),
  Object.freeze([0, 3, 6]),
  Object.freeze([0, 2, 5]),
  Object.freeze([0, 3, 5]),
  Object.freeze([0, 2, 4]),
  Object.freeze([0, 4, 6]),
  Object.freeze([0, 3, 6]),
  Object.freeze([0, 2, 4, 6]),
]);

const GHOST_BASS_PATTERNS = Object.freeze([
  Object.freeze([0, 2, 3, 5, 7]),
  Object.freeze([0, 1, 3, 4, 6]),
  Object.freeze([0, 2, 4, 5, 7]),
  Object.freeze([0, 3, 4, 6]),
  Object.freeze([0, 1, 4, 5, 7]),
  Object.freeze([0, 2, 3, 6]),
  Object.freeze([0, 1, 3, 5, 6]),
  Object.freeze([0, 2, 4, 6, 7]),
]);

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
  Object.freeze([0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 16, 17, 18, 20, 21, 22, 24, 25, 26, 28, 29, 30]),
  Object.freeze([1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15, 17, 18, 19, 21, 22, 23, 25, 26, 27, 29, 30, 31]),
  Object.freeze([0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15, 16, 17, 19, 20, 21, 23, 24, 25, 27, 28, 29, 31]),
  Object.freeze([0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31]),
  Object.freeze([0, 1, 2, 4, 5, 7, 8, 9, 10, 12, 13, 15, 16, 17, 18, 20, 21, 23, 24, 25, 26, 28, 29, 31]),
  Object.freeze([0, 1, 3, 4, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 19, 20, 22, 23, 24, 25, 27, 28, 30, 31]),
  Object.freeze([0, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 15, 16, 18, 19, 20, 21, 23, 24, 26, 27, 28, 29, 31]),
  Object.freeze([1, 2, 3, 4, 6, 7, 9, 10, 11, 12, 14, 15, 17, 18, 19, 20, 22, 23, 25, 26, 27, 28, 30, 31]),
]);

const TERMINAL_DEGREES = Object.freeze({
  healthy: Object.freeze([0, 4, 2, 5, 4, 6, 2, 3]),
  warning: Object.freeze([0, 1, 4, 3, 5, 1, 6, 4]),
  critical: Object.freeze([0, 1, 4, 1, 5, 3, 1, 6]),
  unknown: Object.freeze([0, 3, 1, 4, 0, 5, 3, 1]),
});

const PERFORMANCE_KICK_VARIANTS = Object.freeze([
  Object.freeze([0, 2, 4, 6]),
  Object.freeze([0, 2, 5]),
  Object.freeze([0, 3, 5]),
  Object.freeze([0, 3, 6]),
  Object.freeze([0, 2, 4, 6]),
  Object.freeze([0, 3, 6]),
  Object.freeze([0, 2, 5]),
  Object.freeze([0, 4, 6]),
]);

const PERFORMANCE_HAT_VARIANTS = Object.freeze([
  Object.freeze([1, 3, 5, 7]),
  Object.freeze([0, 2, 4, 6]),
  Object.freeze([1, 3, 6]),
  Object.freeze([0, 3, 5]),
  Object.freeze([1, 3, 5, 7]),
  Object.freeze([1, 3, 5, 7]),
  Object.freeze([1, 3, 7]),
  Object.freeze([1, 5, 7]),
]);

const PERFORMANCE_METAL_VARIANTS = Object.freeze([
  Object.freeze([7]),
  Object.freeze([3]),
  Object.freeze([5]),
  Object.freeze([6]),
  Object.freeze([7]),
  Object.freeze([3]),
  Object.freeze([5]),
  Object.freeze([7]),
]);

const PERFORMANCE_VARIANT_POOLS = Object.freeze({
  healthy: Object.freeze([0, 1, 0, 1]),
  warning: Object.freeze([4, 5, 6, 7]),
  critical: Object.freeze([4, 5, 6, 7]),
  unknown: Object.freeze([0, 1, 2, 3]),
});

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

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

export function liveStateConfirmationFrames(currentState, nextState) {
  if (!currentState || currentState === nextState) return 1;
  if (nextState === "critical") return LIVE_STATE_CONFIRMATION_FRAMES.critical;
  if (nextState === "unknown") return LIVE_STATE_CONFIRMATION_FRAMES.unknown;
  if (currentState === "critical" && nextState === "healthy") {
    return LIVE_STATE_CONFIRMATION_FRAMES.healthy;
  }
  return LIVE_STATE_CONFIRMATION_FRAMES[nextState] ?? 2;
}

export function canCommitLiveFrameAtStep(step, currentState, nextState) {
  if (!Number.isInteger(step) || step < 0 || step % PAD_MEASURE_STEPS !== 0) return false;
  if (!currentState || !nextState || currentState === nextState) return true;
  return step % PHRASE_STEPS === 0;
}

export function shouldPlayPad(step) {
  return Number.isInteger(step) && step >= 0 && step % PAD_MEASURE_STEPS === 0;
}

export function buildPadVoicing(
  scoreState,
  scale,
  measureIndex,
  chordOffset = 0,
  voicing = "triad",
  progressionVariant = 0,
) {
  const progressions = PAD_PROGRESSIONS[scoreState] ?? PAD_PROGRESSIONS.unknown;
  const chords = progressions[Math.abs(Math.trunc(progressionVariant)) % progressions.length];
  const safeScale = Array.isArray(scale) && scale.length ? scale : [0];
  const safeChordOffset = Math.abs(Math.trunc(chordOffset));
  const chord = chords[
    (Math.abs(Math.trunc(measureIndex)) + safeChordOffset) % chords.length
  ];
  const root = chord[0];
  const voicingDegrees = voicing === "sus2"
    ? [root, root + 1, root + 4]
    : voicing === "sus4"
      ? [root, root + 3, root + 4]
      : voicing === "quartal"
        ? [root, root + 3, root + 6]
        : chord;
  const inversion = Math.floor(Math.abs(Math.trunc(measureIndex)) / chords.length)
    % voicingDegrees.length;
  let previousMidi = PAD_ROOT_MIDI - 1;
  return voicingDegrees.map((_, index) => {
    const degree = voicingDegrees[(index + inversion) % voicingDegrees.length];
    const scaleOctave = Math.floor(degree / safeScale.length) * 12;
    const scaleOffset = safeScale[((degree % safeScale.length) + safeScale.length) % safeScale.length]
      + scaleOctave;
    let midi = PAD_ROOT_MIDI + scaleOffset;
    while (midi <= previousMidi) midi += 12;
    previousMidi = Math.min(57, midi);
    return previousMidi;
  });
}

export function bassEventForStep(
  scoreState,
  scale,
  step,
  phraseIndex = 0,
  performance = null,
) {
  const activeSteps = performance
    ? Array.from({ length: PHRASE_STEPS / PAD_MEASURE_STEPS }, (_, measure) => {
      const patterns = scoreState === "unknown"
        ? GHOST_BASS_PATTERNS
        : PERFORMANCE_BASS_PATTERNS;
      const pattern = patterns[
        Math.abs(Math.trunc(performance.bassPattern ?? 0)) % patterns.length
      ];
      const activePattern = scoreState === "unknown"
        ? pattern.filter((_, index) => index % 2 === 0)
        : pattern;
      return activePattern.map((patternStep) => (
        measure * PAD_MEASURE_STEPS
        + (patternStep + (performance.bassShift ?? 0) + PAD_MEASURE_STEPS)
          % PAD_MEASURE_STEPS
      ));
    }).flat()
    : [...(BASS_STEPS[scoreState] ?? BASS_STEPS.unknown)];
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
  const midi = Math.min(
    50,
    Math.max(27, 29 + safeScale[degree % safeScale.length] + (performance?.bassOctaveShift ?? 0)),
  );
  const baseVelocity = performance
    ? scoreState === "critical"
      ? 0.62
      : scoreState === "unknown"
        ? 0.46
        : 0.58
    : scoreState === "critical"
      ? 0.5
      : scoreState === "unknown"
        ? 0.36
        : 0.46;
  return {
    midi,
    duration: performance
      ? scoreState === "unknown"
        ? "4n"
        : performance.motion >= 0.72
          ? "16n"
          : "8n"
      : scoreState === "critical"
        ? "8n"
        : scoreState === "warning"
          ? "8n"
          : scoreState === "unknown"
            ? "1m"
            : "2n.",
    velocity: Math.min(
      performance ? 0.78 : 0.58,
      baseVelocity * (performance?.bassMultiplier ?? 1),
    ),
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
  const basePattern = TERMINAL_PATTERNS[
    Math.abs(Math.trunc(performance.terminalPattern ?? 0)) % TERMINAL_PATTERNS.length
  ];
  const pattern = rotatePatternSteps(
    basePattern,
    (performance.patternRotation ?? 0) + Math.abs(Math.trunc(phraseIndex)) % 4,
  );
  const eventCount = Math.min(
    pattern.length,
    8 + Math.round((performance.terminalDensity ?? 0.5) * 16),
  );
  const activeSteps = pattern.slice(0, eventCount);
  const eventIndex = activeSteps.indexOf(step);
  if (eventIndex === -1) return null;

  const degrees = TERMINAL_DEGREES[scoreState] ?? TERMINAL_DEGREES.unknown;
  const safeScale = Array.isArray(scale) && scale.length ? scale : [0];
  const degreeIndex = orderedDegreeIndex(
    performance.arpDirectionLabel,
    eventIndex + phraseIndex * (performance.phraseStride ?? 1),
    degrees.length,
    performance.melodyOffset,
  );
  const degree = degrees[degreeIndex];
  const octave = performance.arpOctaveSpan > 0
    && performance.energy >= 0.72
    && eventIndex % 8 === 7
    ? 12
    : 0;
  const stateVelocity = scoreState === "critical"
    ? 1
    : scoreState === "warning"
      ? 0.9
      : scoreState === "unknown"
        ? 0.58
        : 0.78;
  const phase = arrangementPhaseForPhrase(scoreState, phraseIndex, performance);
  const gateDurations = scoreState === "unknown"
    ? ["16n", "8n", "8n", "4n"]
    : ["32n", "16n", "16n", "8n"];
  return {
    midi: Math.min(
      ARP_MAX_MIDI,
      ARP_ROOT_MIDI + safeScale[degree % safeScale.length] + octave,
    ),
    duration: gateDurations[Math.abs(Math.trunc(performance.arpGate ?? 1)) % gateDurations.length],
    velocity: Math.min(
      0.68,
      (0.36 + performance.energy * 0.28) * stateVelocity,
    ),
    phase: phase.name,
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
    stableHash(`${scoreState}:${performance?.seed ?? "live"}:${phraseIndex}:${step}:service`),
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
      snare: step % 8 === 4 ? { duration: 0.09, velocity: 0.48 } : null,
      hat: step % 2 === 1
        ? { duration: 0.035, velocity: step % 8 === 7 ? 0.3 : 0.2 }
        : null,
      metal: step === 15 || step === 31 ? { duration: "16n", velocity: 0.24 } : null,
    };
  }

  if (scoreState === "warning") {
    return {
      kick: step % 8 === 0 || [6, 14, 22, 30].includes(step)
        ? { duration: "8n", velocity: step % 8 === 0 ? 0.52 : 0.3 }
        : null,
      snare: step % 8 === 4 ? { duration: 0.085, velocity: 0.36 } : null,
      hat: step % 2 === 1
        ? { duration: 0.032, velocity: step % 8 === 7 ? 0.22 : 0.14 }
        : null,
      metal: step === 15 || step === 31 ? { duration: "16n", velocity: 0.14 } : null,
    };
  }

  if (scoreState === "healthy") {
    return {
      kick: step % 8 === 0 ? { duration: "8n", velocity: 0.4 } : null,
      snare: step % 8 === 4 ? { duration: 0.08, velocity: 0.28 } : null,
      hat: step % 2 === 1
        ? { duration: 0.03, velocity: step % 8 === 7 ? 0.16 : 0.1 }
        : null,
      metal: step === 15 || step === 31 ? { duration: "16n", velocity: 0.09 } : null,
    };
  }

  return {
    kick: step === 0 || step === 16 ? { duration: "8n", velocity: 0.3 } : null,
    snare: step === 12 || step === 28 ? { duration: 0.075, velocity: 0.16 } : null,
    hat: [3, 7, 11, 19, 23, 31].includes(step)
      ? { duration: 0.035, velocity: 0.08 }
      : null,
    metal: step === 15 || step === 31 ? { duration: "16n", velocity: 0.07 } : null,
  };
}

export function percussionEventsForStep(scoreState, step, performance = null) {
  const base = basePercussionEventsForStep(scoreState, step);
  if (!performance) return base;
  if (!Number.isInteger(step) || step < 0 || step >= PHRASE_STEPS) return base;

  const events = { kick: null, snare: null, hat: null, metal: null };
  const measureStep = step % PAD_MEASURE_STEPS;
  const variant = Math.abs(Math.trunc(performance.percussionVariant ?? 0));
  const variantPool = PERFORMANCE_VARIANT_POOLS[scoreState]
    ?? PERFORMANCE_VARIANT_POOLS.unknown;
  const patternVariant = variantPool[variant % variantPool.length];
  const kickSteps = PERFORMANCE_KICK_VARIANTS[
    patternVariant % PERFORMANCE_KICK_VARIANTS.length
  ];
  const hatSteps = PERFORMANCE_HAT_VARIANTS[
    patternVariant % PERFORMANCE_HAT_VARIANTS.length
  ];
  const metalSteps = PERFORMANCE_METAL_VARIANTS[
    patternVariant % PERFORMANCE_METAL_VARIANTS.length
  ];
  const stateLevel = scoreState === "critical"
    ? 1
    : scoreState === "warning"
      ? 0.9
      : scoreState === "unknown"
        ? 0.62
        : 0.82;
  const unknownKickSteps = kickSteps.filter((_, index) => index % 2 === 0);
  const activeKickSteps = scoreState === "unknown" ? unknownKickSteps : kickSteps;
  if (activeKickSteps.includes(measureStep)) {
    events.kick = {
      duration: "8n",
      velocity: (0.5 + performance.energy * 0.22) * stateLevel,
    };
  }
  const snareSteps = scoreState === "unknown" ? [4] : [2, 6];
  if (snareSteps.includes(measureStep)) {
    events.snare = {
      duration: 0.08,
      velocity: (0.25 + performance.energy * 0.18) * stateLevel,
    };
  }
  const density = performance.hatDensityLabel ?? "standard";
  const densityHatSteps = density === "sparse"
    ? [1, 5]
    : density === "dense"
      ? [1, 3, 5, 7]
      : hatSteps.slice(0, 3);
  const activeHatSteps = scoreState === "unknown"
    ? densityHatSteps.filter((_, index) => index % 2 === 0)
    : densityHatSteps;
  if (activeHatSteps.includes(measureStep)) {
    events.hat = {
      duration: 0.028,
      velocity: (0.09 + performance.motion * 0.14) * stateLevel,
    };
  }
  const allowMetal = scoreState !== "unknown"
    || Math.floor(step / PAD_MEASURE_STEPS) % 2 === 1;
  if (allowMetal && performance.grit >= 0.45 && metalSteps.includes(measureStep)) {
    events.metal = {
      duration: "32n",
      velocity: (0.08 + performance.grit * 0.13) * stateLevel,
    };
  }
  const multiplier = performance.drumMultiplier ?? 1;
  for (const event of Object.values(events)) {
    if (event) {
      const maximum = scoreState === "critical" ? 0.72 : 0.78;
      event.velocity = Math.min(maximum, event.velocity * multiplier);
    }
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
  const toneContext = typeof Tone.getContext === "function"
    ? Tone.getContext()
    : Tone.context ?? null;
  const rawContext = toneContext?.rawContext ?? toneContext;
  const hasObservableState = typeof rawContext?.state === "string";
  let lastError = null;
  let timeoutId;
  let pollId;
  let removeStateListener = () => {};
  let disconnectUnlockPulse = () => {};

  const attempt = (action) => {
    try {
      return Promise.resolve(action()).catch((error) => {
        lastError = error;
      });
    } catch (error) {
      lastError = error;
      return Promise.resolve();
    }
  };

  const toneStart = attempt(() => Tone.start());
  if (rawContext && rawContext !== toneContext && typeof rawContext.resume === "function") {
    attempt(() => rawContext.resume());
  }

  if (
    rawContext
    && typeof rawContext.createBuffer === "function"
    && typeof rawContext.createBufferSource === "function"
    && rawContext.destination
  ) {
    try {
      const source = rawContext.createBufferSource();
      source.buffer = rawContext.createBuffer(
        1,
        1,
        Number.isFinite(rawContext.sampleRate) ? rawContext.sampleRate : 44100,
      );
      source.connect(rawContext.destination);
      source.start(0);
      disconnectUnlockPulse = () => source.disconnect?.();
    } catch (error) {
      lastError = error;
    }
  }

  const started = hasObservableState
    ? new Promise((resolve) => {
      const checkState = () => {
        if (rawContext.state === "running") resolve();
      };
      rawContext.addEventListener?.("statechange", checkState);
      removeStateListener = () => rawContext.removeEventListener?.(
        "statechange",
        checkState,
      );
      pollId = globalThis.setInterval(checkState, 50);
      checkState();
    })
    : toneStart;

  try {
    await Promise.race([
      started,
      new Promise((_, reject) => {
        timeoutId = globalThis.setTimeout(() => {
          const state = hasObservableState ? rawContext.state : "unknown";
          const error = new Error(
            `system-symphony: audio context did not start in time (state: ${state})`,
            lastError ? { cause: lastError } : undefined,
          );
          error.code = AUDIO_CONTEXT_BLOCKED_CODE;
          error.contextState = state;
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    globalThis.clearTimeout(timeoutId);
    globalThis.clearInterval(pollId);
    removeStateListener();
    disconnectUnlockPulse();
  }
}

function safeRamp(parameter, value, seconds, scheduledTime = undefined) {
  if (!parameter || !Number.isFinite(value)) return;
  const duration = Math.max(0.01, seconds);
  if (
    Number.isFinite(scheduledTime)
    && typeof parameter.setValueAtTime === "function"
    && typeof parameter.linearRampToValueAtTime === "function"
  ) {
    parameter.setValueAtTime(parameter.value, scheduledTime);
    parameter.linearRampToValueAtTime(value, scheduledTime + duration);
  } else if (typeof parameter.rampTo === "function") {
    parameter.rampTo(value, duration);
  } else {
    parameter.value = value;
  }
}

function safeTransportRamp(parameter, value, seconds) {
  if (!parameter || !Number.isFinite(value)) return;
  if (Math.abs((Number(parameter.value) || 0) - value) < 0.01) return;
  const duration = Math.max(0.01, seconds);
  if (typeof parameter.rampTo === "function") parameter.rampTo(value, duration);
  else parameter.value = value;
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
        filter: { type: "lowpass", Q: 1.8, rolloff: -24 },
        envelope: { attack: 0.18, decay: 0.42, sustain: 0.48, release: 1.7 },
        filterEnvelope: {
          attack: 0.22,
          decay: 0.55,
          sustain: 0.24,
          release: 1.3,
          baseFrequency: 110,
          octaves: 1.8,
        },
        volume: -16,
      });
    case "sub-drone":
      return new Tone.MonoSynth({
        oscillator: { type: "sine" },
        filter: { type: "lowpass", Q: 1, rolloff: -24 },
        envelope: { attack: 0.7, decay: 0.65, sustain: 0.76, release: 3.2 },
        filterEnvelope: {
          attack: 0.8,
          decay: 0.7,
          sustain: 0.35,
          release: 2.6,
          baseFrequency: 70,
          octaves: 1.4,
        },
        volume: -13,
      });
    case "relay-bass":
      return new Tone.MonoSynth({
        oscillator: { type: "sawtooth" },
        filter: { type: "lowpass", Q: 0.9, rolloff: -24 },
        envelope: { attack: 0.02, decay: 0.3, sustain: 0.5, release: 0.8 },
        filterEnvelope: {
          attack: 0.03,
          decay: 0.22,
          sustain: 0.45,
          release: 0.5,
          baseFrequency: 92,
          octaves: 0.8,
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
  let pendingLiveFrame = null;
  let liveStateCandidate = null;
  let liveStateCandidateCount = 0;
  let phraseIndex = 0;
  let stepIndex = 0;
  let serviceCursor = 0;
  let arpStepIndex = 0;
  let demoMode = false;
  let activePerformance = null;
  let pendingPerformance = null;
  let pendingPerformanceSet = false;
  let pendingSceneFrame = null;
  let pendingSceneTransition = SCENE_CROSSFADE_SECONDS;
  let ghostFocus = false;
  let ghostAudition = null;
  const liveDirector = createCompositionDirector();
  let livePlan = null;

  const voices = new Map();
  const familyBuses = new Map();

  let transport = null;
  let schedulerId = null;
  let arpSchedulerId = null;
  let userGain = null;
  let analyser = null;
  let spectrumAnalyser = null;
  let limiter = null;
  let masterClipper = null;
  let masterCompressor = null;
  let musicDuckGain = null;
  let reverb = null;
  let reverbReturn = null;
  let ghostReverb = null;
  let ghostReverbReturn = null;
  let masterFilter = null;
  let masterHighpass = null;
  let masterVolume = null;

  let drumInput = null;
  let drumHighpass = null;
  let drumDrive = null;
  let drumCompressor = null;
  let drumParallelCompressor = null;
  let drumParallelGain = null;
  let percussionGain = null;

  let bassInput = null;
  let bassFilter = null;
  let bassCompressor = null;
  let bassGain = null;

  let melodicBus = null;
  let melodicCompressor = null;
  let serviceBus = null;
  let serviceDistortion = null;
  let droneGain = null;
  let padGain = null;
  let counterlineGain = null;
  let motifGain = null;
  let terminalGain = null;
  let riffGain = null;

  let textureBus = null;
  let textureGain = null;
  let accentBus = null;
  let deploymentGain = null;
  let atmosphericSend = null;

  let drone = null;
  let pad = null;
  let bass = null;
  let counterline = null;
  let counterlineFilter = null;
  let motifSynth = null;
  let motifFilter = null;
  let terminalSynth = null;
  let terminalFilter = null;
  let terminalDelay = null;
  let terminalDelaySend = null;
  let riffSynths = [];
  let riffFilter = null;
  let kick = null;
  let snare = null;
  let hat = null;
  let hatFilter = null;
  let metal = null;
  let textureNoise = null;
  let textureFilter = null;
  let textureAirNoise = null;
  let textureAirFilter = null;
  let textureAirGain = null;
  let subBass = null;
  let subFilter = null;
  let subGain = null;
  let deploymentSynth = null;
  let hybridSampler = null;

  let voiceHandler = null;
  let incidentHandler = null;
  let deploymentHandler = null;
  let performanceHandler = null;
  let ghostPhaseHandler = null;
  let sampleLoadHandler = null;

  function resetLiveStateCandidate() {
    liveStateCandidate = null;
    liveStateCandidateCount = 0;
  }

  function acceptLiveFrameState(frame) {
    const currentState = currentFrame?.scoreState ?? null;
    const nextState = frame?.scoreState ?? "unknown";
    if (!currentState || currentState === nextState) {
      resetLiveStateCandidate();
      return true;
    }
    if (liveStateCandidate !== nextState) {
      liveStateCandidate = nextState;
      liveStateCandidateCount = 1;
    } else {
      liveStateCandidateCount += 1;
    }
    const required = liveStateConfirmationFrames(currentState, nextState);
    if (liveStateCandidateCount < required) return false;
    resetLiveStateCandidate();
    return true;
  }

  function effectivePerformance() {
    return demoMode ? activePerformance : livePlan;
  }

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
    spectrumAnalyser = new Tone.Analyser("fft", 64);
    limiter = new Tone.Limiter(-2);
    masterClipper = new Tone.Distortion({
      distortion: 0.04,
      oversample: "2x",
      wet: PRODUCTION_FEATURES.masterClipper ? 0.03 : 0,
    });
    masterCompressor = new Tone.Compressor({ threshold: -18, ratio: 2.8, attack: 0.025, release: 0.22 });
    masterHighpass = new Tone.Filter({ type: "highpass", frequency: 28, rolloff: -12, Q: 0.6 });
    masterFilter = new Tone.Filter({ type: "lowpass", frequency: 12000, rolloff: -24, Q: 0.8 });
    masterVolume = new Tone.Volume(-10);
    masterVolume.chain(masterHighpass, masterFilter, masterCompressor, masterClipper, limiter, userGain);
    limiter.connect(analyser);
    limiter.connect(spectrumAnalyser);
    musicDuckGain = new Tone.Gain(1).connect(masterVolume);

    reverb = new Tone.Reverb({ decay: 1.9, wet: 1 });
    reverbReturn = new Tone.Gain(0.16).connect(musicDuckGain);
    reverb.connect(reverbReturn);
    ghostReverb = new Tone.Reverb({ decay: 0.45, wet: 1 });
    ghostReverbReturn = new Tone.Gain(0).connect(musicDuckGain);
    ghostReverb.connect(ghostReverbReturn);

    drumInput = new Tone.Gain(1);
    drumHighpass = new Tone.Filter({ type: "highpass", frequency: 30, rolloff: -12, Q: 0.5 });
    drumDrive = new Tone.Distortion({ distortion: 0.12, oversample: "2x", wet: 0.06 });
    drumCompressor = new Tone.Compressor({ threshold: -20, ratio: 3.4, attack: 0.008, release: 0.12 });
    percussionGain = new Tone.Gain(0);
    drumInput.chain(drumHighpass, drumDrive, drumCompressor, percussionGain, masterVolume);
    drumParallelCompressor = new Tone.Compressor({ threshold: -30, ratio: 7, attack: 0.003, release: 0.09 });
    drumParallelGain = new Tone.Gain(0.08).connect(masterVolume);
    drumInput.connect(drumParallelCompressor);
    drumParallelCompressor.connect(drumParallelGain);

    bassInput = new Tone.Gain(1);
    bassFilter = new Tone.Filter({ type: "lowpass", frequency: 1700, rolloff: -24, Q: 0.72 });
    bassCompressor = new Tone.Compressor({ threshold: -22, ratio: 2.6, attack: 0.018, release: 0.16 });
    bassGain = new Tone.Gain(0.5);
    bassInput.chain(bassFilter, bassCompressor, bassGain, musicDuckGain);

    melodicBus = new Tone.Gain(1);
    melodicCompressor = new Tone.Compressor({ threshold: -24, ratio: 1.8, attack: 0.04, release: 0.3 });
    melodicBus.chain(melodicCompressor, musicDuckGain);
    melodicBus.connect(ghostReverb);
    textureBus = new Tone.Gain(1).connect(musicDuckGain);
    accentBus = new Tone.Gain(0.82).connect(musicDuckGain);

    serviceBus = new Tone.Gain(0.78);
    serviceDistortion = new Tone.Distortion({ distortion: 0.18, oversample: "2x", wet: 0 });
    serviceBus.chain(serviceDistortion, melodicBus);

    droneGain = new Tone.Gain(0.3).connect(textureBus);
    padGain = new Tone.Gain(0.72).connect(melodicBus);
    counterlineGain = new Tone.Gain(0.25).connect(melodicBus);
    motifGain = new Tone.Gain(0).connect(melodicBus);
    terminalGain = new Tone.Gain(0).connect(melodicBus);
    riffGain = new Tone.Gain(0).connect(melodicBus);
    textureGain = new Tone.Gain(0.012).connect(textureBus);
    deploymentGain = new Tone.Gain(0.52).connect(accentBus);
    atmosphericSend = new Tone.Gain(0.12).connect(reverb);
    terminalDelaySend = new Tone.Gain(0.08);

    drone = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsine", count: 3, spread: 8 },
      envelope: { attack: 4.2, decay: 2.2, sustain: 0.86, release: 8.5 },
      volume: -15,
    }).connect(droneGain);
    droneGain.connect(atmosphericSend);

    pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsawtooth", count: 3, spread: 13 },
      envelope: { attack: 2.4, decay: 1.8, sustain: 0.72, release: 6.8 },
      volume: -17,
    }).connect(padGain);
    padGain.connect(atmosphericSend);

    bass = new Tone.MonoSynth({
      oscillator: { type: "sawtooth" },
      filter: { type: "lowpass", Q: 0.72, rolloff: -24 },
      envelope: { attack: 0.008, decay: 0.14, sustain: 0.56, release: 0.24 },
      filterEnvelope: {
        attack: 0.012,
        decay: 0.12,
        sustain: 0.48,
        release: 0.2,
        baseFrequency: 92,
        octaves: 0.72,
      },
      volume: -15,
    }).connect(bassInput);

    counterline = new Tone.FMSynth({
      harmonicity: 0.502,
      modulationIndex: 2.1,
      oscillator: { type: "triangle" },
      modulation: { type: "sine" },
      envelope: { attack: 0.18, decay: 0.7, sustain: 0.5, release: 2.8 },
      modulationEnvelope: { attack: 0.3, decay: 0.8, sustain: 0.16, release: 2.2 },
      volume: -15,
    });
    counterlineFilter = new Tone.Filter({ type: "lowpass", frequency: 1600, rolloff: -24, Q: 1.4 });
    counterline.chain(counterlineFilter, counterlineGain);

    motifSynth = new Tone.FMSynth({
      harmonicity: 1.005,
      modulationIndex: 1.8,
      oscillator: { type: "triangle" },
      modulation: { type: "sine" },
      envelope: { attack: 0.018, decay: 0.2, sustain: 0.22, release: 0.72 },
      modulationEnvelope: { attack: 0.03, decay: 0.24, sustain: 0.08, release: 0.5 },
      volume: -13,
    });
    motifFilter = new Tone.Filter({ type: "lowpass", frequency: 3000, rolloff: -24, Q: 1 });
    motifSynth.chain(motifFilter, motifGain);
    motifGain.connect(atmosphericSend);

    terminalSynth = new Tone.FMSynth({
      harmonicity: 1.5,
      modulationIndex: 2.2,
      oscillator: { type: "sine" },
      modulation: { type: "triangle" },
      envelope: { attack: 0.006, decay: 0.16, sustain: 0.16, release: 0.38 },
      modulationEnvelope: { attack: 0.008, decay: 0.2, sustain: 0.08, release: 0.3 },
      volume: -9,
    });
    terminalFilter = new Tone.Filter({ type: "lowpass", frequency: 4600, rolloff: -24, Q: 1.1 });
    terminalDelay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.24, wet: 1 });
    terminalSynth.chain(terminalFilter, terminalGain);
    terminalGain.connect(terminalDelaySend);
    terminalDelaySend.chain(terminalDelay, melodicBus);

    riffFilter = new Tone.Filter({ type: "lowpass", frequency: 3200, rolloff: -24, Q: 1.5 });
    riffSynths = [
      new Tone.Synth({
        oscillator: { type: "square" },
        envelope: { attack: 0.004, decay: 0.12, sustain: 0.12, release: 0.2 },
        volume: -14,
      }),
      new Tone.FMSynth({
        harmonicity: 2.01,
        modulationIndex: 3.1,
        oscillator: { type: "triangle" },
        modulation: { type: "square" },
        envelope: { attack: 0.003, decay: 0.14, sustain: 0.08, release: 0.24 },
        modulationEnvelope: { attack: 0.002, decay: 0.1, sustain: 0.03, release: 0.18 },
        volume: -16,
      }),
      new Tone.AMSynth({
        harmonicity: 1.5,
        oscillator: { type: "sawtooth" },
        modulation: { type: "sine" },
        envelope: { attack: 0.006, decay: 0.16, sustain: 0.1, release: 0.28 },
        modulationEnvelope: { attack: 0.004, decay: 0.12, sustain: 0.05, release: 0.2 },
        volume: -15,
      }),
    ];
    riffSynths.forEach((synth) => synth.connect(riffFilter));
    riffFilter.connect(riffGain);

    kick = new Tone.MembraneSynth({
      pitchDecay: 0.035,
      octaves: 3.4,
      envelope: { attack: 0.001, decay: 0.22, sustain: 0.015, release: 0.28 },
      volume: -10,
    }).connect(drumInput);
    snare = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.001, decay: 0.09, sustain: 0 },
      volume: -18,
    }).connect(drumInput);
    hat = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.032, sustain: 0 },
      volume: -24,
    });
    hatFilter = new Tone.Filter({ type: "bandpass", frequency: 3900, Q: 1.6 });
    hat.chain(hatFilter, drumInput);
    metal = new Tone.MetalSynth({
      frequency: 92,
      envelope: { attack: 0.001, decay: 0.1, release: 0.035 },
      harmonicity: 3.1,
      modulationIndex: 10,
      resonance: 900,
      octaves: 0.8,
      volume: -24,
    }).connect(drumInput);

    textureNoise = new Tone.Noise("brown");
    textureFilter = new Tone.Filter({ type: "bandpass", frequency: 420, Q: 2.4 });
    textureNoise.chain(textureFilter, textureGain);
    textureGain.connect(atmosphericSend);
    textureNoise.start();
    textureAirNoise = new Tone.Noise("pink");
    textureAirFilter = new Tone.Filter({ type: "bandpass", frequency: 6800, Q: 0.9 });
    textureAirGain = new Tone.Gain(0.004).connect(textureBus);
    textureAirNoise.chain(textureAirFilter, textureAirGain);
    textureAirNoise.start();

    subBass = new Tone.MonoSynth({
      oscillator: { type: "sine" },
      filter: { type: "lowpass", Q: 0.4, rolloff: -24 },
      envelope: { attack: 0.025, decay: 0.08, sustain: 0.86, release: 0.18 },
      filterEnvelope: { attack: 0.02, decay: 0.08, sustain: 0.8, release: 0.15, baseFrequency: 55, octaves: 0.5 },
      volume: -18,
    });
    subFilter = new Tone.Filter({ type: "lowpass", frequency: 115, rolloff: -24, Q: 0.5 });
    subGain = new Tone.Gain(0.22);
    subBass.chain(subFilter, subGain, bassInput);

    deploymentSynth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 1.5,
      modulationIndex: 2.6,
      oscillator: { type: "sine" },
      modulation: { type: "triangle" },
      envelope: { attack: 0.02, decay: 0.28, sustain: 0.3, release: 1.8 },
      modulationEnvelope: { attack: 0.04, decay: 0.25, sustain: 0.1, release: 1.2 },
      volume: -11,
    }).connect(deploymentGain);

    hybridSampler = createHybridSampler(Tone, {
      output: masterVolume,
      drumOutput: drumInput,
      bassOutput: bassInput,
      melodicOutput: melodicBus,
      textureOutput: textureBus,
      fxOutput: accentBus,
      reverbInput: reverb,
      delayInput: terminalDelaySend,
      onLoadProgress: (stats) => sampleLoadHandler?.(stats),
    });

    transport = Tone.getTransport();
    schedulerId = transport.scheduleRepeat(onEighth, "8n");
    arpSchedulerId = transport.scheduleRepeat(onSixteenth, "16n");
    initialized = true;
  }

  function playPad(time, frame, step, performance) {
    if (!shouldPlayPad(step)) return;
    const measureIndex = phraseIndex * 4 + step / PAD_MEASURE_STEPS;
    const notes = buildPadVoicing(
      frame.scoreState,
      frame.scale,
      measureIndex,
      performance?.chordOffset ?? 0,
      performance?.padVoicingLabel ?? "triad",
      performance?.chordProgression ?? 0,
    ).map(midiToFrequencyHz);
    const velocity = frame.scoreState === "healthy"
      ? 0.4
      : frame.scoreState === "warning"
        ? 0.36
        : frame.scoreState === "unknown"
          ? 0.3
          : 0.34;
    pad.triggerAttackRelease(
      notes,
      PAD_DURATIONS[frame.scoreState] ?? PAD_DURATIONS.unknown,
      time,
      Math.min(0.48, velocity * (performance?.padMultiplier ?? 1)),
    );
  }

  function playDrone(time, step) {
    if (step !== 0) return;
    drone.triggerAttackRelease(DRONE_MIDI.map(midiToFrequencyHz), "4m", time, 0.28);
  }

  function triggerSidechainDuck(time, scoreState) {
    if (!PRODUCTION_FEATURES.sidechain) return;
    const parameter = musicDuckGain?.gain;
    if (!parameter || !Number.isFinite(time)) return;
    // Moderate sidechain: a clear pump that lets the mix breathe with the kick
    // without over-pumping the low end. Critical ducks a touch deeper for energy.
    // Depth and recovery are conservative so the groove reads as a pump, not a
    // wobble; they are easy to open up further once the mix is settled.
    const depth = scoreState === "critical" ? 0.74 : scoreState === "warning" ? 0.78 : 0.82;
    parameter.cancelScheduledValues?.(time);
    parameter.setValueAtTime?.(1, time);
    parameter.linearRampToValueAtTime?.(depth, time + 0.005);
    parameter.linearRampToValueAtTime?.(1, time + 0.14);
  }

  function playSubFoundation(time, step, performance) {
    if (!PRODUCTION_FEATURES.subBass || !subBass) return;
    if ([0, 8, 16, 24].includes(step)) {
      subBass.triggerAttackRelease(midiToFrequencyHz(SUB_ROOT_MIDI), "1m", time, 0.3);
      return;
    }
    if ([14, 30].includes(step) && performance?.dropStage !== "build") {
      subBass.triggerAttackRelease(midiToFrequencyHz(SUB_FIFTH_MIDI), "4n", time, 0.22);
    }
  }

  function playDropGesture(time, step, performance) {
    if (!PRODUCTION_FEATURES.dropGestures) return;
    if (!performance?.liveDirected || !Number.isFinite(time)) return;
    const Tone = requireTone();
    if (performance.dropStage === "build" && step === 28) {
      const spacing = Tone.Time("16n").toSeconds();
      for (let index = 0; index < 8; index += 1) {
        transport.scheduleOnce((scheduled) => {
          snare.triggerAttackRelease(0.055, scheduled, Math.max(0.08, 0.28 - index * 0.02));
        }, time + index * spacing);
      }
    }
    if (performance.dropStage === "build" && step === 31) {
      const eighth = Tone.Time("8n").toSeconds();
      musicDuckGain.gain.setValueAtTime?.(musicDuckGain.gain.value, time);
      musicDuckGain.gain.linearRampToValueAtTime?.(0.03, time + 0.02);
      musicDuckGain.gain.linearRampToValueAtTime?.(1, time + eighth * 0.95);
    }
    if (performance.dropStage === "drop" && step === 0) {
      hybridSampler?.playAccent("crash-crisp", time, 0.58);
    }
  }

  function playBass(time, frame, step, performance) {
    const event = bassEventForStep(
      frame.scoreState,
      frame.scale,
      step,
      phraseIndex,
      performance,
    );
    if (!event) return;
    const activeLoop = hybridSampler?.getPalette?.()?.bassLoop ?? null;
    const loopFoundationActive = Boolean(activeLoop)
      && (hybridSampler?.isSampleAvailable?.(activeLoop) ?? false);
    if (loopFoundationActive) {
      // The sampled bass loop owns the low-end foundation for this phrase. The
      // procedural bass is silenced so one fundamental sits in 30 to 150 Hz
      // instead of two sources doubling and beating against each other.
      return;
    }
    const frequency = midiToFrequencyHz(event.midi);
    const sampled = hybridSampler?.playBass(
      time,
      frame,
      { ...event, step, frequency },
      phraseIndex,
      performance,
    ) ?? false;
    const fallbackVelocity = sampled
      ? Math.min(0.035, event.velocity * 0.05)
      : Math.min(0.64, event.velocity);
    bass.triggerAttackRelease(frequency, event.duration, time, fallbackVelocity);
  }

  function playCounterline(time, frame, step, performance) {
    const event = counterlineEventForStep(
      frame.scoreState,
      frame.scale,
      step,
      phraseIndex,
      performance,
    );
    if (!event) return;
    counterline.triggerAttackRelease(
      midiToFrequencyHz(event.midi),
      event.duration,
      time,
      event.velocity,
    );
  }

  function playTerminal(time, frame, step, performance) {
    const event = terminalEventForStep(
      frame.scoreState,
      frame.scale,
      step,
      phraseIndex,
      performance,
    );
    if (!event) return;
    terminalSynth.triggerAttackRelease(
      midiToFrequencyHz(event.midi),
      event.duration,
      time,
      event.velocity,
    );
  }

  function playAtlasMotif(time, frame, step, performance) {
    if (!performance?.liveDirected) return;
    const event = motifEventForStep(performance, frame.scale, step);
    if (!event) return;
    motifSynth.triggerAttackRelease(
      midiToFrequencyHz(event.midi),
      event.duration,
      time,
      event.velocity,
    );
  }

  function playGhostRiff(time, frame, step, performance) {
    const event = ghostRiffEventForStep(
      frame.scoreState,
      frame.scale,
      step,
      phraseIndex,
      performance,
    );
    if (!event) return;
    const synth = riffSynths[event.timbre] ?? riffSynths[0];
    synth?.triggerAttackRelease(
      midiToFrequencyHz(event.midi),
      event.duration,
      time,
      event.velocity,
    );
  }

  function applyFilterMotion(time, frame, step, performance) {
    if (!performance) return;
    const phase = arrangementPhaseForPhrase(frame.scoreState, phraseIndex, performance);
    const automation = filterAutomationMultiplier(
      performance.filterAutomationLabel,
      step,
      phraseIndex,
    );
    const terminalHz = Math.min(
      6800,
      Math.max(900, (3000 + performance.grit * 1800) * automation * phase.mix.filter),
    );
    const riffHz = Math.min(
      5600,
      Math.max(620, (1700 + performance.grit * 2200) * automation * phase.mix.filter),
    );
    const motifHz = Math.min(
      5200,
      Math.max(1000, (2400 + (performance.intent?.brightness ?? 0.5) * 1800) * phase.mix.filter),
    );
    if (terminalSynth?.modulationIndex?.setValueAtTime) {
      const fmIndex = 1.4 + (performance.intent?.tension ?? performance.grit ?? 0.5) * 3.2;
      terminalSynth.modulationIndex.setValueAtTime(fmIndex, time);
    } else if (terminalSynth?.modulationIndex?.value !== undefined) {
      terminalSynth.modulationIndex.value = 1.4 + (performance.intent?.tension ?? performance.grit ?? 0.5) * 3.2;
    }
    if (typeof terminalFilter?.frequency?.setValueAtTime === "function") {
      terminalFilter.frequency.setValueAtTime(terminalHz, time);
      riffFilter.frequency.setValueAtTime(riffHz, time);
      motifFilter.frequency.setValueAtTime(motifHz, time);
    } else {
      terminalFilter.frequency.value = terminalHz;
      riffFilter.frequency.value = riffHz;
      motifFilter.frequency.value = motifHz;
    }
  }

  function playPercussion(time, frame, step, performance) {
    const events = percussionEventsForStep(frame.scoreState, step, performance);
    const sampled = hybridSampler?.playDrums(
      time,
      frame,
      step,
      phraseIndex,
      events,
      performance,
    ) ?? {};
    if (events.kick) {
      triggerSidechainDuck(time, frame.scoreState);
      kick.triggerAttackRelease(
        "F1",
        events.kick.duration,
        time,
        sampled.kick ? Math.min(0.14, events.kick.velocity * 0.16) : events.kick.velocity,
      );
    }
    if (events.snare) {
      snare.triggerAttackRelease(
        events.snare.duration,
        time,
        sampled.snare ? Math.min(0.1, events.snare.velocity * 0.22) : events.snare.velocity,
      );
    }
    if (!sampled.hat && events.hat) {
      hat.triggerAttackRelease(events.hat.duration, time, events.hat.velocity);
    }
    if (!sampled.metal && events.metal) {
      metal.triggerAttackRelease(events.metal.duration, time, events.metal.velocity);
    }
  }

  function playService(time, frame, step, performance) {
    if (!frame.voices.length) return;
    const params = frame.voices[serviceCursor % frame.voices.length];
    serviceCursor += 1 + ((phraseIndex + step) % 3 === 0 ? 1 : 0);
    if (!shouldPlayServiceVoice(
      frame.scoreState,
      phraseIndex,
      step,
      frame.density,
      params.density,
      performance,
    )) return;
    if (performance?.liveDirected && performance.phase === "breathe" && step % 4 !== 1) return;

    const voice = voices.get(params.name);
    if (!voice) return;
    const motifIndex = (
      phraseIndex * (performance?.phraseStride ?? 1)
      + step
      + params.hash
      + (performance?.melodyOffset ?? 0)
    ) % params.motifMidi.length;
    const seed = params.hash ^ phraseIndex ^ (step << 8);
    const midi = boundVoiceMidi(
      params,
      params.motifMidi[motifIndex] + serviceOctaveDisplacement(seed),
    );
    const frequency = midiToFrequencyHz(midi) * Math.pow(2, params.detuneCents / 1200);
    const duration = NOTE_LENGTHS[params.articulation] ?? "4n";
    const velocity = Math.min(
      0.58,
      params.velocity
        * (params.status === "unknown" ? 0.7 : 1)
        * (performance ? 0.82 + performance.energy * 0.18 : 1),
    );
    voice.synth.triggerAttackRelease(frequency, duration, time, velocity);

    const Tone = requireTone();
    Tone.Draw.schedule(() => voiceHandler?.(params.name, params), time);
  }

  function commitPendingLiveFrame(time, { allowStateChange = false } = {}) {
    if (demoMode || !pendingLiveFrame) return false;
    const nextFrame = pendingLiveFrame;
    const previousState = currentFrame?.scoreState;
    const stateChanged = Boolean(previousState && previousState !== nextFrame.scoreState);
    if (stateChanged && !allowStateChange) return false;
    currentFrame = nextFrame;
    pendingLiveFrame = null;
    liveDirector.observe(currentFrame);
    if (stateChanged) pad?.releaseAll?.(time);
    applyFrameToGraph(
      currentFrame,
      stateChanged ? LIVE_STATE_TRANSITION_SECONDS : 0.9,
      time,
    );
    return stateChanged;
  }

  function advanceLivePhrase(time, transitionSeconds = 1.1) {
    if (demoMode || !currentFrame) return;
    liveDirector.observe(currentFrame);
    livePlan = liveDirector.advancePhrase();
    applyMixToGraph(currentFrame, transitionSeconds, time);
  }

  function onEighth(time) {
    if (!running || !currentFrame || !Number.isFinite(time)) return;
    const step = stepIndex % PHRASE_STEPS;

    let liveStateChanged = false;
    if (!demoMode && shouldApplyPendingPerformance(step)) {
      liveStateChanged = commitPendingLiveFrame(time, {
        allowStateChange: canCommitLiveFrameAtStep(
          step,
          currentFrame?.scoreState,
          pendingLiveFrame?.scoreState,
        ),
      });
    }

    if (step === 0 && stepIndex > 0) {
      phraseIndex += 1;
      if (!demoMode) {
        advanceLivePhrase(
          time,
          liveStateChanged ? LIVE_STATE_TRANSITION_SECONDS : 1.1,
        );
      }
    }

    let performanceChanged = false;
    if (demoMode && pendingPerformanceSet && shouldApplyPendingPerformance(step)) {
      const sceneChanged = Boolean(pendingSceneFrame);
      if (sceneChanged) {
        currentFrame = pendingSceneFrame;
        pendingSceneFrame = null;
        // A scene change restarts the shared grid on its downbeat. The band (8n)
        // and arp (16n) counters reset together so they stay phase locked, with
        // arpStepIndex always tracking twice stepIndex. A macro only change keeps
        // the grid running so the beat does not jump on every knob move.
        phraseIndex = 0;
        stepIndex = 0;
        arpStepIndex = 0;
        pad?.releaseAll?.(time);
      }
      activePerformance = pendingPerformance;
      pendingPerformance = null;
      pendingPerformanceSet = false;
      performanceChanged = true;
      if (sceneChanged) {
        applyFrameToGraph(currentFrame, pendingSceneTransition, time);
        pendingSceneTransition = SCENE_CROSSFADE_SECONDS;
      } else {
        applyMixToGraph(currentFrame, 0.9, time);
      }
      const Tone = requireTone();
      Tone.Draw.schedule(() => {
        performanceHandler?.(activePerformance);
        ghostPhaseHandler?.(currentGhostPhase());
      }, time);
    }

    const performance = effectivePerformance();
    if (step === 0 && !performanceChanged) {
      applyMixToGraph(currentFrame, 1.1, time);
      if (demoMode) {
        const Tone = requireTone();
        Tone.Draw.schedule(() => ghostPhaseHandler?.(currentGhostPhase()), time);
      }
    }
    if (step === 0) {
      hybridSampler?.playBassPhrase(
        time,
        currentFrame,
        step,
        phraseIndex,
        performance,
      );
    }
    playDropGesture(time, step, performance);
    playDrone(time, step);
    playSubFoundation(time, step, performance);
    playPad(time, currentFrame, step, performance);
    playBass(time, currentFrame, step, performance);
    playCounterline(time, currentFrame, step, performance);
    playPercussion(time, currentFrame, step, performance);
    playService(time, currentFrame, step, performance);
    const transitionAccent = transitionAccentForStep(
      currentFrame.scoreState,
      phraseIndex,
      step,
      performance,
    );
    if (transitionAccent) {
      hybridSampler?.playAccent(transitionAccent.id, time, transitionAccent.velocity);
    } else if (step === 0) {
      hybridSampler?.playSectionAccent(
        time,
        currentFrame,
        phraseIndex,
        performance,
      );
    }
    stepIndex += 1;
  }

  function onSixteenth(time) {
    if (!running || !currentFrame || !Number.isFinite(time)) return;
    const performance = effectivePerformance();
    if (!performance) return;
    const step = arpStepIndex % PHRASE_STEPS;
    applyFilterMotion(time, currentFrame, step, performance);
    playAtlasMotif(time, currentFrame, step, performance);
    playTerminal(time, currentFrame, step, performance);
    playGhostRiff(time, currentFrame, step, performance);
    hybridSampler?.playLead(
      time,
      currentFrame,
      step,
      phraseIndex,
      performance,
    );
    arpStepIndex += 1;
  }

  function applyMixToGraph(
    frame,
    transition = frame.transitionSeconds,
    scheduledTime = undefined,
    { ghostMixOnly = false } = {},
  ) {
    const performance = effectivePerformance();
    const phaseMix = performance
      ? arrangementPhaseForPhrase(frame.scoreState, phraseIndex, performance).mix
      : { drums: 1, bass: 1, pad: 1, arp: 1, riff: 0, filter: 1 };
    const ghostMix = demoMode
      ? ghostLayerMixProfile({ focus: ghostFocus, audition: ghostAudition })
      : { backing: 1, pad: 1, lead: 1, arp: 1, riff: 1 };
    const ramp = (parameter, value) => safeRamp(parameter, value, transition, scheduledTime);

    const droneBase = frame.scoreState === "unknown" ? 0.26 : frame.scoreState === "critical" ? 0.3 : 0.32;
    const padBase = frame.scoreState === "unknown" ? 0.58 : frame.scoreState === "warning" ? 0.7 : frame.scoreState === "critical" ? 0.64 : 0.78;
    const bassBase = frame.scoreState === "critical" ? 0.66 : frame.scoreState === "warning" ? 0.58 : frame.scoreState === "unknown" ? 0.36 : 0.54;
    const counterlineFilterBase = frame.scoreState === "critical" ? 1200 : frame.scoreState === "warning" ? 1450 : frame.scoreState === "unknown" ? 900 : 1800;
    const textureBase = frame.scoreState === "critical" ? 0.022 : frame.scoreState === "warning" ? 0.017 : frame.scoreState === "unknown" ? 0.02 : 0.012;
    const livePhaseMix = performance?.liveDirected ? performance.phaseMix : null;

    if (!ghostMixOnly) {
      safeTransportRamp(transport.bpm, performance?.targetBpm ?? frame.bpm, transition);
      ramp(masterVolume.volume, clamp(frame.masterGainDb, MIX_LIMITS.masterGainDbMin, MIX_LIMITS.masterGainDbMax));
      ramp(masterFilter.frequency, frame.masterFilterHz);
      ramp(masterHighpass.frequency, frame.masterHpHz);
    }

    ramp(droneGain.gain, droneBase * (performance?.droneMultiplier ?? 1) * ghostMix.pad);
    ramp(padGain.gain, padBase * (performance?.padMultiplier ?? 1) * phaseMix.pad * ghostMix.pad);
    ramp(bassGain.gain, bassBase * (performance?.bassMultiplier ?? 1) * phaseMix.bass * ghostMix.backing);
    ramp(
      counterlineGain.gain,
      (COUNTERLINE_BUS_GAINS[frame.scoreState] ?? COUNTERLINE_BUS_GAINS.unknown)
        * (performance?.counterlineMultiplier ?? 1)
        * ghostMix.backing,
    );
    ramp(
      serviceBus.gain,
      0.74 * (livePhaseMix?.services ?? 1) * ghostMix.backing,
    );
    ramp(
      percussionGain.gain,
      (PERCUSSION_BUS_GAINS[frame.scoreState] ?? 0)
        * (performance?.drumMultiplier ?? 1)
        * phaseMix.drums
        * ghostMix.backing,
    );
    ramp(
      drumParallelGain.gain,
      Math.min(
        MIX_LIMITS.drumParallelGain,
        (frame.scoreState === "critical" ? 0.14 : frame.scoreState === "warning" ? 0.11 : frame.scoreState === "unknown" ? 0.04 : 0.08)
          * phaseMix.drums,
      ),
    );
    ramp(
      textureGain.gain,
      textureBase
        * (performance?.textureMultiplier ?? 1)
        * (livePhaseMix?.texture ?? 1)
        * ghostMix.backing,
    );
    ramp(
      motifGain.gain,
      performance?.liveDirected
        ? Math.min(
          MIX_LIMITS.motifGain,
          0.22 * (performance.phaseMix?.melody ?? 1) * (0.72 + performance.intent.confidence * 0.28),
        )
        : 0,
    );

    const terminalStateMultiplier = frame.scoreState === "unknown" ? 0.62 : frame.scoreState === "healthy" ? 0.84 : 0.9;
    ramp(
      terminalGain.gain,
      Math.min(
        MAX_GHOST_ARP_BUS_GAIN,
        (performance?.terminalGain ?? 0)
          * terminalStateMultiplier
          * phaseMix.arp
          * ghostMix.arp,
      ),
    );
    ramp(
      riffGain.gain,
      Math.min(
        MAX_GHOST_RIFF_BUS_GAIN,
        (performance?.riffGain ?? 0) * phaseMix.riff * ghostMix.riff,
      ),
    );

    if (!ghostMixOnly) {
      ramp(counterlineFilter.frequency, counterlineFilterBase * (performance?.serviceFilterMultiplier ?? 1));
      ramp(terminalFilter.frequency, performance ? 3000 + performance.grit * 1800 : 4200);
      ramp(terminalDelaySend.gain, performance?.delayWet ?? 0.08);
      const Tone = requireTone();
      const delayDivision = frame.scoreState === "critical"
        ? "16n"
        : frame.scoreState === "unknown"
          ? "4n"
          : "8n";
      ramp(terminalDelay.delayTime, Tone.Time(delayDivision).toSeconds());
      ramp(
        ghostReverbReturn.gain,
        PRODUCTION_FEATURES.ghostReverb ? (demoMode ? 0.07 : 0.018) : 0,
      );
      ramp(
        textureAirGain.gain,
        PRODUCTION_FEATURES.airTexture
          ? (frame.scoreState === "unknown" ? 0.0025 : 0.0045)
          : 0,
      );
      ramp(
        serviceDistortion.wet,
        Math.min(MIX_LIMITS.serviceDriveWet, performance?.distortionWet ?? 0),
      );
      ramp(
        drumDrive.wet,
        Math.min(
          MIX_LIMITS.drumDriveWet,
          (frame.scoreState === "critical" ? 0.11 : frame.scoreState === "warning" ? 0.08 : frame.scoreState === "unknown" ? 0.025 : 0.05)
            * (livePhaseMix?.drive ?? 1),
        ),
      );
      ramp(atmosphericSend.gain, 0.07 + (performance?.reverbWet ?? 0.2) * 0.42);
      ramp(textureFilter.frequency, performance ? 360 + performance.grit * 420 : 420);
      ramp(
        bassFilter.frequency,
        frame.scoreState === "critical" ? 1450 : frame.scoreState === "warning" ? 1250 : frame.scoreState === "unknown" ? 760 : 1550,
      );
    }

    hybridSampler?.applyScene(
      frame,
      performance,
      phraseIndex,
      transition,
      scheduledTime,
      { focus: ghostFocus, audition: ghostAudition },
      { ghostMixOnly },
    );
  }

  function currentGhostPhase() {
    if (!demoMode || !currentFrame || !activePerformance) return null;
    return arrangementPhaseForPhrase(
      currentFrame.scoreState,
      phraseIndex,
      activePerformance,
    );
  }

  function applyFrameToGraph(
    frame,
    transition = frame.transitionSeconds,
    scheduledTime = undefined,
  ) {
    syncServiceVoices(frame.voices);
    applyMixToGraph(frame, transition, scheduledTime);
    const performance = effectivePerformance();
    for (const params of frame.voices) {
      const voice = voices.get(params.name);
      if (!voice) continue;
      safeRamp(
        voice.filter.frequency,
        Math.max(420, params.filterHz * params.brightness * (performance?.serviceFilterMultiplier ?? 1)),
        transition,
        scheduledTime,
      );
      safeRamp(voice.gain.gain, params.voiceGain, transition, scheduledTime);
      safeRamp(voice.panner.pan, params.pan, 0.3, scheduledTime);
      if (voice.synth.detune) {
        safeRamp(voice.synth.detune, params.detuneCents, transition, scheduledTime);
      }
    }
  }

  function disposeGraph() {
    if (!initialized) return;
    transport?.stop?.();
    if (schedulerId !== null) transport.clear(schedulerId);
    if (arpSchedulerId !== null) transport.clear(arpSchedulerId);
    for (const [name, voice] of voices) disposeServiceVoice(name, voice);
    for (const bus of familyBuses.values()) bus.dispose();
    familyBuses.clear();
    hybridSampler?.dispose?.();
    hybridSampler = null;
    for (const node of [
      ...riffSynths,
      subGain,
      subFilter,
      subBass,
      textureAirGain,
      textureAirFilter,
      textureAirNoise,
      deploymentSynth,
      terminalDelay,
      terminalDelaySend,
      terminalFilter,
      terminalSynth,
      motifFilter,
      motifSynth,
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
      atmosphericSend,
      deploymentGain,
      accentBus,
      textureGain,
      textureBus,
      riffGain,
      terminalGain,
      motifGain,
      counterlineGain,
      padGain,
      droneGain,
      serviceDistortion,
      serviceBus,
      melodicCompressor,
      melodicBus,
      bassGain,
      bassCompressor,
      bassFilter,
      bassInput,
      percussionGain,
      drumParallelGain,
      drumParallelCompressor,
      drumCompressor,
      drumDrive,
      drumHighpass,
      drumInput,
      masterVolume,
      masterHighpass,
      masterFilter,
      ghostReverbReturn,
      ghostReverb,
      reverbReturn,
      reverb,
      musicDuckGain,
      masterCompressor,
      masterClipper,
      limiter,
      spectrumAnalyser,
      analyser,
      userGain,
    ]) node?.dispose?.();
    riffSynths = [];
    schedulerId = null;
    arpSchedulerId = null;
    initialized = false;
  }

  return {
    async start() {
      if (destroyed) throw new Error("system-symphony: engine was disposed");
      const Tone = requireTone();
      await startToneWithTimeout(Tone);
      if (!initialized) {
        buildGraph(Tone);
        await Promise.all([
          reverb.generate(),
          ghostReverb.generate(),
          hybridSampler?.load(),
        ]);
        if (currentFrame) {
          liveDirector.observe(currentFrame);
          if (!demoMode && !livePlan) livePlan = liveDirector.advancePhrase();
          applyFrameToGraph(currentFrame);
        }
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
      if (!frame || typeof frame !== "object") return;
      if (demoMode || !initialized || !running) {
        resetLiveStateCandidate();
        liveDirector.observe(frame);
        currentFrame = frame;
        pendingLiveFrame = null;
        if (!demoMode && !livePlan) livePlan = liveDirector.advancePhrase();
        if (initialized) applyFrameToGraph(frame);
        return;
      }
      if (!acceptLiveFrameState(frame)) {
        if (
          pendingLiveFrame
          && pendingLiveFrame.scoreState !== currentFrame?.scoreState
          && pendingLiveFrame.scoreState !== frame.scoreState
        ) {
          pendingLiveFrame = null;
        }
        return;
      }
      liveDirector.observe(frame);
      pendingLiveFrame = frame;
    },

    setPerformance(performance, { quantize = true } = {}) {
      const nextPerformance = performance ?? null;
      if (!nextPerformance) {
        demoMode = false;
        activePerformance = null;
        pendingPerformance = null;
        pendingPerformanceSet = false;
        pendingSceneFrame = null;
        // Returning to live restarts the shared grid so the band and arp
        // callbacks re-align at step zero together.
        stepIndex = 0;
        arpStepIndex = 0;
        if (currentFrame) {
          liveDirector.observe(currentFrame);
          if (!livePlan) livePlan = liveDirector.advancePhrase();
          if (initialized) applyMixToGraph(currentFrame, 0.45);
        }
        performanceHandler?.(null);
        ghostPhaseHandler?.(null);
        return { queued: false, unchanged: false };
      }

      resetLiveStateCandidate();
      demoMode = true;
      const nextId = nextPerformance.id ?? null;
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
      pendingSceneFrame = null;
      pendingSceneTransition = SCENE_CROSSFADE_SECONDS;
      // Immediate (non quantized) scene apply restarts the shared grid too.
      stepIndex = 0;
      arpStepIndex = 0;
      if (initialized && currentFrame) applyMixToGraph(currentFrame, 0.35);
      performanceHandler?.(activePerformance);
      ghostPhaseHandler?.(currentGhostPhase());
      return { queued: false, unchanged: false };
    },

    setScene(
      frame,
      performance,
      {
        quantize = true,
        transitionSeconds = SCENE_CROSSFADE_SECONDS,
      } = {},
    ) {
      if (!frame) throw new Error("system-symphony: scene frame is required");
      demoMode = true;
      const nextPerformance = performance ?? null;
      const boundedTransition = Math.min(
        8,
        Math.max(1.5, Number(transitionSeconds) || SCENE_CROSSFADE_SECONDS),
      );
      if (quantize && initialized && running) {
        pendingSceneFrame = frame;
        pendingPerformance = nextPerformance;
        pendingPerformanceSet = true;
        pendingSceneTransition = boundedTransition;
        return { queued: true, unchanged: false };
      }
      resetLiveStateCandidate();
      currentFrame = frame;
      activePerformance = nextPerformance;
      pendingSceneFrame = null;
      pendingPerformance = null;
      pendingPerformanceSet = false;
      pendingSceneTransition = SCENE_CROSSFADE_SECONDS;
      phraseIndex = 0;
      stepIndex = 0;
      arpStepIndex = 0;
      if (initialized) applyFrameToGraph(frame, boundedTransition);
      performanceHandler?.(activePerformance);
      ghostPhaseHandler?.(currentGhostPhase());
      return { queued: false, unchanged: false };
    },

    setGhostFocus(enabled) {
      ghostFocus = Boolean(enabled);
      if (initialized && currentFrame && demoMode) {
        applyMixToGraph(currentFrame, 0.25, undefined, { ghostMixOnly: true });
      }
      return ghostFocus;
    },

    setGhostAudition(layer) {
      ghostAudition = layer === "arp" || layer === "riff" ? layer : null;
      if (initialized && currentFrame && demoMode) {
        applyMixToGraph(currentFrame, 0.18, undefined, { ghostMixOnly: true });
      }
      return ghostAudition;
    },

    queueIncidentAccent(count = 1) {
      if (!initialized || !running || count <= 0) return false;
      const Tone = requireTone();
      const bounded = Math.min(MAX_INCIDENT_ACCENTS, Math.trunc(count));
      const startAt = transport.nextSubdivision("4n");
      const stepSeconds = Tone.Time("4n").toSeconds();
      for (let index = 0; index < bounded; index += 1) {
        transport.scheduleOnce((time) => {
          hybridSampler?.playAccent("kick-aggressive", time, 0.7);
          hybridSampler?.playAccent("snare-aggressive", time, 0.48);
          kick.triggerAttackRelease("D1", "8n", time, 0.66);
          if (!hybridSampler?.isReady()) snare.triggerAttackRelease(0.09, time, 0.42);
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
      const scale = currentFrame?.scale?.length ? currentFrame.scale : [0, 2, 3, 5, 7, 9, 10];
      const degrees = livePlan?.motifDegrees?.length
        ? livePlan.motifDegrees.slice(0, 4)
        : [0, 4, 2, 5];
      const notes = [...degrees, 0].map((degree, index) => (
        53 + scale[Math.abs(degree) % scale.length] + (index === degrees.length - 1 ? 12 : 0)
      ));
      notes.forEach((midi, index) => {
        transport.scheduleOnce((time) => {
          if (index === 0) hybridSampler?.playAccent("crash-crisp", time, 0.46);
          deploymentSynth.triggerAttackRelease(
            midiToFrequencyHz(midi),
            index === notes.length - 1 ? "2n" : "8n",
            time,
            index === notes.length - 1 ? 0.42 : 0.36,
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
      if (initialized && running) safeRamp(userGain.gain, userVolume, 0.08);
    },

    getWaveform() {
      if (!initialized || !analyser) return new Float32Array(WAVEFORM_SIZE);
      const value = analyser.getValue();
      return value instanceof Float32Array
        ? value
        : Float32Array.from(value ?? []);
    },

    getSpectrum() {
      if (!initialized || !spectrumAnalyser) return new Float32Array(64).fill(-100);
      const value = spectrumAnalyser.getValue();
      return value instanceof Float32Array
        ? value
        : Float32Array.from(value ?? []);
    },

    isInitialized: () => initialized,
    isRunning: () => running,
    isSampleReady: () => hybridSampler?.isReady?.() ?? false,
    getSampleLoadStats: () => hybridSampler?.loadStats?.() ?? null,
    getSamplePalette: () => hybridSampler?.getPalette?.() ?? null,
    // Development-only mute/solo diagnostic surface. Returns live bus references
    // so a debug session can isolate the source of an artefact by ear or by
    // metering. Not consumed by the shipped UI.
    getDebugNodes: () => ({
      percussionGain,
      bassGain,
      bassInput,
      subGain,
      droneGain,
      padGain,
      counterlineGain,
      motifGain,
      terminalGain,
      melodicBus,
      textureBus,
      musicDuckGain,
      proceduralBass: bass,
      sampler: hybridSampler?.getDebugNodes?.() ?? null,
    }),
    getGhostPhase: currentGhostPhase,
    getGhostMixState: () => Object.freeze({ focus: ghostFocus, audition: ghostAudition }),
    getCompositionSnapshot: () => Object.freeze({
      mode: demoMode ? "ghost-circuit" : "live",
      phraseIndex,
      pendingLiveFrame: Boolean(pendingLiveFrame),
      liveStateCandidate,
      liveStateCandidateCount,
      livePlan,
      director: liveDirector.getSnapshot(),
    }),
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
    setGhostPhaseHandler(handler) {
      ghostPhaseHandler = typeof handler === "function" ? handler : null;
    },
    setSampleLoadHandler(handler) {
      sampleLoadHandler = typeof handler === "function" ? handler : null;
    },
    dispose() {
      if (destroyed) return;
      destroyed = true;
      running = false;
      disposeGraph();
      resetLiveStateCandidate();
      liveDirector.reset();
    },
  };
}
