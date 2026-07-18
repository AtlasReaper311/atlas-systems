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
} from "./mapping.js?v=20260718-system-symphony-ghost-circuit";
import { createHybridSampler } from "./sampler.js?v=20260718-system-symphony-ghost-circuit";
import {
  arrangementPhaseForPhrase,
  filterAutomationMultiplier,
  ghostRiffEventForStep,
  orderedDegreeIndex,
  rotatePatternSteps,
  transitionAccentForStep,
} from "./ghost-circuit.js?v=20260718-system-symphony-ghost-circuit";

export const DEFAULT_USER_GAIN = 0.62;
export const MAX_SERVICE_VOICES = MAX_COMPONENTS;
export const MAX_INCIDENT_ACCENTS = 4;
export const WAVEFORM_SIZE = 512;
export const AUDIO_START_TIMEOUT_MS = 8000;
export const PAD_MEASURE_STEPS = 8;
export const PAD_ROOT_MIDI = 38; // D2
export const ARP_ROOT_MIDI = 50; // D3
export const ARP_MAX_MIDI = 62; // D4
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

export function shouldPlayPad(step) {
  return Number.isInteger(step) && step >= 0 && step % PAD_MEASURE_STEPS === 0;
}

export function buildPadVoicing(
  scoreState,
  scale,
  measureIndex,
  chordOffset = 0,
  voicing = "triad",
) {
  const chords = PAD_CHORDS[scoreState] ?? PAD_CHORDS.unknown;
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
          Math.abs(Math.trunc(performance.bassPattern ?? 0))
            % patterns.length
        ];
        const activePattern = scoreState === "unknown"
          ? pattern.filter((_, index) => index % 2 === 0)
          : pattern;
        return activePattern.map((patternStep) => (
          measure * PAD_MEASURE_STEPS
          + (
            patternStep
            + (performance.bassShift ?? 0)
            + PAD_MEASURE_STEPS
          ) % PAD_MEASURE_STEPS
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
    Math.max(24, 26 + safeScale[degree % safeScale.length] + (performance?.bassOctaveShift ?? 0)),
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
          ? "4n"
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
      (0.36 + performance.energy * 0.28) * stateVelocity * phase.mix.arp,
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
  const snareSteps = scoreState === "unknown"
    ? [4]
    : [2, 6];
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
  let arpStepIndex = 0;
  let activePerformance = null;
  let pendingPerformance = null;
  let pendingPerformanceSet = false;

  const voices = new Map();
  const voiceParams = new Map();
  const familyBuses = new Map();

  let transport = null;
  let schedulerId = null;
  let arpSchedulerId = null;
  let userGain = null;
  let analyser = null;
  let limiter = null;
  let compressor = null;
  let reverb = null;
  let masterFilter = null;
  let masterHighpass = null;
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
  let riffGain = null;
  let deploymentGain = null;
  let drone = null;
  let pad = null;
  let bass = null;
  let counterline = null;
  let counterlineFilter = null;
  let terminalSynth = null;
  let terminalFilter = null;
  let terminalDelay = null;
  let terminalDelaySend = null;
  let riffSynths = [];
  let riffFilter = null;
  let riffDrive = null;
  let riffDriveSend = null;
  let atmosphericSend = null;
  let kick = null;
  let snare = null;
  let hat = null;
  let hatFilter = null;
  let metal = null;
  let textureNoise = null;
  let textureFilter = null;
  let deploymentSynth = null;
  let hybridSampler = null;
  let voiceHandler = null;
  let incidentHandler = null;
  let deploymentHandler = null;
  let performanceHandler = null;
  let sampleLoadHandler = null;

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
    reverb = new Tone.Reverb({ decay: 2.1, wet: 1 });
    masterHighpass = new Tone.Filter({
      type: "highpass",
      frequency: 28,
      rolloff: -12,
      Q: 0.6,
    });
    masterFilter = new Tone.Filter({
      type: "lowpass",
      frequency: 12000,
      rolloff: -24,
      Q: 0.85,
    });
    masterVolume = new Tone.Volume(-12);
    masterVolume.chain(masterHighpass, masterFilter, compressor, limiter, userGain);
    reverb.connect(compressor);
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
    riffGain = new Tone.Gain(0).connect(masterVolume);
    deploymentGain = new Tone.Gain(0.62).connect(masterVolume);
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

    terminalSynth = new Tone.FMSynth({
      harmonicity: 1.5,
      modulationIndex: 2.2,
      oscillator: { type: "sine" },
      modulation: { type: "triangle" },
      envelope: { attack: 0.006, decay: 0.16, sustain: 0.16, release: 0.38 },
      modulationEnvelope: { attack: 0.008, decay: 0.2, sustain: 0.08, release: 0.3 },
      volume: -8,
    });
    terminalFilter = new Tone.Filter({
      type: "lowpass",
      frequency: 4600,
      rolloff: -24,
      Q: 1.2,
    });
    terminalDelay = new Tone.FeedbackDelay({
      delayTime: "8n",
      feedback: 0.28,
      wet: 1,
    });
    terminalSynth.chain(terminalFilter, terminalGain);
    terminalGain.connect(terminalDelaySend);
    terminalDelaySend.chain(terminalDelay, masterVolume);

    riffFilter = new Tone.Filter({
      type: "lowpass",
      frequency: 3200,
      rolloff: -24,
      Q: 1.8,
    });
    riffDriveSend = new Tone.Gain(0);
    riffDrive = new Tone.Distortion({
      distortion: 0.2,
      oversample: "2x",
      wet: 1,
    }).connect(masterVolume);
    riffSynths = [
      new Tone.Synth({
        oscillator: { type: "square" },
        envelope: { attack: 0.004, decay: 0.12, sustain: 0.12, release: 0.2 },
        volume: -13,
      }),
      new Tone.FMSynth({
        harmonicity: 2.01,
        modulationIndex: 3.4,
        oscillator: { type: "triangle" },
        modulation: { type: "square" },
        envelope: { attack: 0.003, decay: 0.14, sustain: 0.08, release: 0.24 },
        modulationEnvelope: { attack: 0.002, decay: 0.1, sustain: 0.03, release: 0.18 },
        volume: -15,
      }),
      new Tone.AMSynth({
        harmonicity: 1.5,
        oscillator: { type: "sawtooth" },
        modulation: { type: "sine" },
        envelope: { attack: 0.006, decay: 0.16, sustain: 0.1, release: 0.28 },
        modulationEnvelope: { attack: 0.004, decay: 0.12, sustain: 0.05, release: 0.2 },
        volume: -14,
      }),
    ];
    riffSynths.forEach((synth) => synth.connect(riffFilter));
    riffFilter.connect(riffGain);
    riffGain.connect(terminalDelaySend);
    riffGain.connect(riffDriveSend);
    riffDriveSend.connect(riffDrive);

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
    textureGain.connect(atmosphericSend);
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

    hybridSampler = createHybridSampler(Tone, {
      output: masterVolume,
      reverbInput: reverb,
      delayInput: terminalDelaySend,
      onLoadProgress: (stats) => sampleLoadHandler?.(stats),
    });

    transport = Tone.getTransport();
    schedulerId = transport.scheduleRepeat(onEighth, "8n");
    arpSchedulerId = transport.scheduleRepeat(onSixteenth, "16n");
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
      activePerformance?.padVoicingLabel ?? "triad",
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
    const frequency = midiToFrequencyHz(event.midi);
    const sampled = hybridSampler?.playBass(
      time,
      frame,
      { ...event, step, frequency },
      phraseIndex,
      activePerformance,
    ) ?? false;
    bass.triggerAttackRelease(
      frequency,
      event.duration,
      time,
      sampled ? Math.min(0.2, event.velocity * 0.22) : event.velocity,
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

  function playTerminal(time, frame, step, arpPhraseIndex) {
    const event = terminalEventForStep(
      frame.scoreState,
      frame.scale,
      step,
      arpPhraseIndex,
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

  function playGhostRiff(time, frame, step) {
    const event = ghostRiffEventForStep(
      frame.scoreState,
      frame.scale,
      step,
      phraseIndex,
      activePerformance,
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

  function applyGhostFilterMotion(time, frame, step) {
    if (!activePerformance) return;
    const phase = arrangementPhaseForPhrase(frame.scoreState, phraseIndex, activePerformance);
    const automation = filterAutomationMultiplier(
      activePerformance.filterAutomationLabel,
      step,
      phraseIndex,
    );
    const terminalHz = Math.min(
      7200,
      Math.max(900, (3200 + activePerformance.grit * 2200) * automation * phase.mix.filter),
    );
    const riffHz = Math.min(
      6400,
      Math.max(620, (1800 + activePerformance.grit * 2600) * automation * phase.mix.filter),
    );
    if (typeof terminalFilter?.frequency?.setValueAtTime === "function") {
      terminalFilter.frequency.setValueAtTime(terminalHz, time);
    } else if (terminalFilter?.frequency) {
      terminalFilter.frequency.value = terminalHz;
    }
    if (typeof riffFilter?.frequency?.setValueAtTime === "function") {
      riffFilter.frequency.setValueAtTime(riffHz, time);
    } else if (riffFilter?.frequency) {
      riffFilter.frequency.value = riffHz;
    }
  }

  function playPercussion(time, frame, step) {
    const events = percussionEventsForStep(frame.scoreState, step, activePerformance);
    const sampled = hybridSampler?.playDrums(
      time,
      frame,
      step,
      phraseIndex,
      events,
      activePerformance,
    ) ?? {};
    if (events.kick) {
      kick.triggerAttackRelease(
        "D1",
        events.kick.duration,
        time,
        sampled.kick ? Math.min(0.18, events.kick.velocity * 0.2) : events.kick.velocity,
      );
    }
    if (!sampled.snare && events.snare) {
      snare.triggerAttackRelease(
        events.snare.duration,
        time,
        events.snare.velocity,
      );
    }
    if (!sampled.hat && events.hat) {
      hat.triggerAttackRelease(events.hat.duration, time, events.hat.velocity);
    }
    if (!sampled.metal && events.metal) {
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
    let performanceChanged = false;
    if (pendingPerformanceSet && shouldApplyPendingPerformance(step)) {
      activePerformance = pendingPerformance;
      pendingPerformance = null;
      pendingPerformanceSet = false;
      arpStepIndex = 0;
      performanceChanged = true;
      applyMixToGraph(currentFrame, 0.35, time);
      const Tone = requireTone();
      Tone.Draw.schedule(() => performanceHandler?.(activePerformance), time);
    }
    if (step === 0 && !performanceChanged) {
      applyMixToGraph(currentFrame, 1.2, time);
    }
    if (step % 8 === 0) {
      hybridSampler?.playBassPhrase(
        time,
        currentFrame,
        step,
        phraseIndex,
        activePerformance,
      );
    }
    playDrone(time, step);
    playPad(time, currentFrame, step);
    playBass(time, currentFrame, step);
    playCounterline(time, currentFrame, step);
    playPercussion(time, currentFrame, step);
    playService(time, currentFrame, step);
    const transitionAccent = transitionAccentForStep(
      currentFrame.scoreState,
      phraseIndex,
      step,
      activePerformance,
    );
    if (transitionAccent) {
      hybridSampler?.playAccent(
        transitionAccent.id,
        time,
        transitionAccent.velocity,
      );
    } else if (step === 0) {
      hybridSampler?.playSectionAccent(
        time,
        currentFrame,
        phraseIndex,
        activePerformance,
      );
    }
    stepIndex += 1;
  }

  function onSixteenth(time) {
    if (!running || !currentFrame || !activePerformance) return;
    const step = arpStepIndex % PHRASE_STEPS;
    applyGhostFilterMotion(time, currentFrame, step);
    playTerminal(time, currentFrame, step, phraseIndex);
    playGhostRiff(time, currentFrame, step);
    hybridSampler?.playLead(
      time,
      currentFrame,
      step,
      phraseIndex,
      activePerformance,
    );
    arpStepIndex += 1;
  }

  function applyMixToGraph(
    frame,
    transition = frame.transitionSeconds,
    scheduledTime = undefined,
  ) {
    const performance = activePerformance;
    const phaseMix = performance
      ? arrangementPhaseForPhrase(frame.scoreState, phraseIndex, performance).mix
      : { drums: 1, bass: 1, pad: 1, arp: 1, riff: 0, filter: 1 };
    const ramp = (parameter, value) => (
      safeRamp(parameter, value, transition, scheduledTime)
    );
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

    ramp(
      transport.bpm,
      performance?.targetBpm ?? frame.bpm,
    );
    ramp(masterVolume.volume, frame.masterGainDb);
    ramp(masterFilter.frequency, frame.masterFilterHz);
    ramp(masterHighpass.frequency, frame.masterHpHz);
    ramp(
      droneGain.gain,
      droneBase * (performance?.droneMultiplier ?? 1),
    );
    ramp(
      padGain.gain,
      padBase * (performance?.padMultiplier ?? 1) * phaseMix.pad,
    );
    ramp(
      bassGain.gain,
      bassBase * (performance?.bassMultiplier ?? 1) * phaseMix.bass,
    );
    ramp(
      counterlineGain.gain,
      (COUNTERLINE_BUS_GAINS[frame.scoreState] ?? COUNTERLINE_BUS_GAINS.unknown)
        * (performance?.counterlineMultiplier ?? 1),
    );
    ramp(
      counterlineFilter.frequency,
      counterlineFilterBase * (performance?.serviceFilterMultiplier ?? 1),
    );
    ramp(
      percussionGain.gain,
      (PERCUSSION_BUS_GAINS[frame.scoreState] ?? 0)
        * (performance?.drumMultiplier ?? 1)
        * phaseMix.drums,
    );
    ramp(
      textureGain.gain,
      textureBase * (performance?.textureMultiplier ?? 1),
    );
    const terminalStateMultiplier = frame.scoreState === "unknown"
      ? 0.7
      : frame.scoreState === "healthy"
        ? 0.9
        : 1;
    ramp(
      terminalGain.gain,
      (performance?.terminalGain ?? 0) * terminalStateMultiplier * phaseMix.arp,
    );
    ramp(
      riffGain.gain,
      (performance?.riffGain ?? 0) * phaseMix.riff,
    );
    ramp(
      terminalFilter.frequency,
      performance ? 3200 + performance.grit * 2200 : 4200,
    );
    ramp(terminalDelaySend.gain, performance?.delayWet ?? 0.08);
    ramp(serviceDistortion.wet, performance?.distortionWet ?? 0);
    ramp(
      riffDriveSend.gain,
      performance ? Math.min(0.12, performance.grit * 0.12 * phaseMix.riff) : 0,
    );
    ramp(
      atmosphericSend.gain,
      0.08 + (performance?.reverbWet ?? 0.22) * 0.5,
    );
    ramp(
      textureFilter.frequency,
      performance ? 360 + performance.grit * 440 : 420,
    );
    hybridSampler?.applyScene(
      frame,
      performance,
      phraseIndex,
      transition,
      scheduledTime,
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
    if (arpSchedulerId !== null) transport.clear(arpSchedulerId);
    for (const [name, voice] of voices) disposeServiceVoice(name, voice);
    for (const bus of familyBuses.values()) bus.dispose();
    familyBuses.clear();
    hybridSampler?.dispose?.();
    hybridSampler = null;
    for (const node of [
      ...riffSynths,
      riffDrive,
      riffDriveSend,
      riffFilter,
      riffGain,
      deploymentSynth,
      terminalDelay,
      terminalDelaySend,
      atmosphericSend,
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
      masterHighpass,
      masterFilter,
      reverb,
      compressor,
      limiter,
      analyser,
      userGain,
    ]) {
      node?.dispose?.();
    }
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
          hybridSampler?.load(),
        ]);
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
      arpStepIndex = 0;
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
          hybridSampler?.playAccent("kick-aggressive", time, 0.82);
          hybridSampler?.playAccent("snare-aggressive", time, 0.64);
          kick.triggerAttackRelease("D1", "8n", time, 0.88);
          if (!hybridSampler?.isReady()) {
            snare.triggerAttackRelease(0.09, time, 0.56);
          }
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
          if (index === 0) hybridSampler?.playAccent("crash-crisp", time, 0.62);
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
    isSampleReady: () => hybridSampler?.isReady?.() ?? false,
    getSampleLoadStats: () => hybridSampler?.loadStats?.() ?? null,
    getSamplePalette: () => hybridSampler?.getPalette?.() ?? null,
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
    setSampleLoadHandler(handler) {
      sampleLoadHandler = typeof handler === "function" ? handler : null;
    },
    dispose() {
      if (destroyed) return;
      running = false;
      destroyed = true;
      disposeGraph();
    },
  };
}
