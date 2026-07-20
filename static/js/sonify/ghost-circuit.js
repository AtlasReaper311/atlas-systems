/**
 * Pure arrangement and motif grammar for the Ghost Circuit performance layer.
 *
 * The module deliberately contains no Tone.js state. A performance seed, score
 * state and phrase position always produce the same phase, arpeggio ordering,
 * filter motion, transition accent and riff event. Live System SYMPHONY plans
 * may supply an already-bounded phase mix from composition-director.js without
 * inheriting Ghost Circuit's fixed phase cycle.
 */

export const GHOST_CIRCUIT_VERSION = 3;
export const RIFF_ROOT_MIDI = 50; // D3
export const RIFF_MAX_MIDI = 69; // A4

const GHOST_MIX_PROFILES = Object.freeze({
  normal: Object.freeze({ backing: 1, pad: 1, lead: 0.76, arp: 1.35, riff: 1.8 }),
  focus: Object.freeze({ backing: 0.62, pad: 0.72, lead: 0.48, arp: 1.55, riff: 2.05 }),
  arp: Object.freeze({ backing: 0.1, pad: 0.15, lead: 0, arp: 1.65, riff: 0 }),
  riff: Object.freeze({ backing: 0.1, pad: 0.15, lead: 0, arp: 0, riff: 2.25 }),
});

export const ARRANGEMENT_PHASES = Object.freeze({
  healthy: Object.freeze([
    "boot", "drive", "drive", "lift", "drop", "drive", "afterglow", "drive",
  ]),
  warning: Object.freeze([
    "boot", "drive", "lift", "drive", "drop", "drive", "afterglow", "lift",
  ]),
  critical: Object.freeze([
    "boot", "drive", "lift", "drop", "drive", "drop", "afterglow", "lift",
  ]),
  unknown: Object.freeze([
    "boot", "afterglow", "drive", "afterglow", "lift", "afterglow", "drive", "afterglow",
  ]),
});

export const PHASE_MIX = Object.freeze({
  boot: Object.freeze({ drums: 0.62, bass: 0.72, pad: 1.08, arp: 0.34, riff: 0, filter: 0.72 }),
  drive: Object.freeze({ drums: 0.94, bass: 1, pad: 0.9, arp: 0.82, riff: 0.48, filter: 0.94 }),
  lift: Object.freeze({ drums: 1.02, bass: 0.92, pad: 1, arp: 1.04, riff: 0.72, filter: 1.14 }),
  drop: Object.freeze({ drums: 1.08, bass: 1.08, pad: 0.72, arp: 1, riff: 1, filter: 1.06 }),
  afterglow: Object.freeze({ drums: 0.54, bass: 0.62, pad: 1.16, arp: 0.42, riff: 0.2, filter: 0.78 }),
});

const RIFF_STEPS = Object.freeze({
  healthy: Object.freeze([
    Object.freeze([0, 3, 6, 10, 12, 15, 22, 24, 27]),
    Object.freeze([0, 4, 7, 11, 16, 19, 23, 28]),
    Object.freeze([2, 5, 8, 14, 18, 21, 26, 30]),
    Object.freeze([0, 6, 9, 12, 17, 20, 25, 29]),
  ]),
  warning: Object.freeze([
    Object.freeze([0, 3, 7, 10, 14, 16, 19, 23, 27, 30]),
    Object.freeze([1, 4, 8, 11, 15, 18, 22, 25, 29]),
    Object.freeze([0, 5, 7, 12, 15, 16, 21, 24, 28, 31]),
    Object.freeze([2, 6, 9, 13, 17, 20, 24, 27, 30]),
  ]),
  critical: Object.freeze([
    Object.freeze([0, 2, 7, 8, 11, 15, 16, 18, 23, 24, 27, 31]),
    Object.freeze([0, 3, 6, 8, 12, 14, 16, 19, 22, 24, 28, 30]),
    Object.freeze([1, 4, 7, 9, 13, 15, 17, 20, 23, 25, 29, 31]),
    Object.freeze([0, 5, 7, 10, 12, 16, 21, 23, 26, 28, 31]),
  ]),
  unknown: Object.freeze([
    Object.freeze([0, 7, 12, 19, 24, 31]),
    Object.freeze([2, 10, 15, 22, 27]),
    Object.freeze([0, 8, 14, 20, 28]),
    Object.freeze([4, 11, 16, 23, 30]),
  ]),
});

const RIFF_CONTOURS = Object.freeze([
  Object.freeze([0, 2, 4, 1, 5, 4, 2, 1]),
  Object.freeze([0, 4, 2, 5, 1, 4, 6, 2]),
  Object.freeze([4, 2, 0, 1, 5, 3, 1, 0]),
  Object.freeze([0, 1, 4, 3, 6, 4, 1, 5]),
]);

function integer(value, fallback = 0) {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function modulo(value, length) {
  return ((integer(value) % length) + length) % length;
}

function normalizedState(scoreState) {
  return ARRANGEMENT_PHASES[scoreState] ? scoreState : "unknown";
}

export function arrangementPhaseForPhrase(
  scoreState,
  phraseIndex = 0,
  performance = null,
) {
  if (performance?.liveDirected && performance?.phaseMix) {
    return Object.freeze({
      name: performance.phase ?? "develop",
      cycleIndex: integer(phraseIndex),
      cycleLength: 1,
      mix: Object.freeze({
        drums: performance.phaseMix.drums ?? 1,
        bass: performance.phaseMix.bass ?? 1,
        pad: performance.phaseMix.pad ?? 1,
        arp: performance.phaseMix.melody ?? 1,
        riff: performance.phaseMix.melody ?? 0.5,
        filter: performance.phaseMix.filter ?? 1,
      }),
    });
  }
  const state = normalizedState(scoreState);
  const cycle = ARRANGEMENT_PHASES[state];
  const offset = integer(performance?.sectionVariant);
  const cycleIndex = modulo(integer(phraseIndex) + offset, cycle.length);
  const name = cycle[cycleIndex];
  return Object.freeze({
    name,
    cycleIndex,
    cycleLength: cycle.length,
    mix: PHASE_MIX[name],
  });
}

export function ghostLayerMixProfile({ focus = false, audition = null } = {}) {
  if (audition === "arp" || audition === "riff") {
    return GHOST_MIX_PROFILES[audition];
  }
  return focus ? GHOST_MIX_PROFILES.focus : GHOST_MIX_PROFILES.normal;
}

export function rotatePatternSteps(pattern, rotation = 0, length = 32) {
  if (!Array.isArray(pattern) || !Number.isInteger(length) || length <= 0) return [];
  return pattern
    .map((step) => modulo(integer(step) + integer(rotation), length))
    .sort((left, right) => left - right);
}

export function orderedDegreeIndex(direction, eventIndex, length, seedOffset = 0) {
  if (!Number.isInteger(length) || length <= 0) return 0;
  const index = Math.abs(integer(eventIndex));
  if (direction === "down") return modulo(length - 1 - index, length);
  if (direction === "upDown") {
    if (length === 1) return 0;
    const span = length * 2 - 2;
    const position = modulo(index, span);
    return position < length ? position : span - position;
  }
  if (direction === "seeded") {
    return modulo(index * 3 + integer(seedOffset), length);
  }
  return modulo(index, length);
}

export function filterAutomationMultiplier(mode, step, phraseIndex = 0) {
  const position = modulo(integer(step), 32) / 31;
  if (mode === "slow-open") return 0.72 + position * 0.5;
  if (mode === "slow-close") return 1.22 - position * 0.5;
  if (mode === "rhythmic-8n") {
    return modulo(integer(step) + integer(phraseIndex), 4) < 2 ? 0.74 : 1.12;
  }
  return 1;
}

export function transitionAccentForStep(
  scoreState,
  phraseIndex,
  step,
  performance = null,
) {
  if (!performance || !Number.isInteger(step)) return null;
  const phase = arrangementPhaseForPhrase(scoreState, phraseIndex, performance);
  if (step === 0 && phraseIndex > 0 && phase.name === "drop") {
    return Object.freeze({ id: "crash-crisp", velocity: scoreState === "critical" ? 0.68 : 0.52 });
  }
  if (performance.liveDirected) {
    if (step === 0 && ["peak", "recover"].includes(phase.name)) {
      return Object.freeze({
        id: "crash-crisp",
        velocity: phase.name === "peak" ? 0.52 : 0.34,
      });
    }
    return null;
  }
  const offset = integer(performance.sectionVariant);
  if (step === 30 && modulo(phraseIndex + offset, 8) === 6) {
    return Object.freeze({ id: "fx-tapestop", velocity: 0.42 });
  }
  return null;
}

export function ghostRiffEventForStep(
  scoreState,
  scale,
  step,
  phraseIndex = 0,
  performance = null,
) {
  if (!performance || !Number.isInteger(step) || step < 0 || step >= 32) return null;
  const state = normalizedState(scoreState);
  const phase = arrangementPhaseForPhrase(state, phraseIndex, performance);
  if (phase.mix.riff <= 0) return null;

  const patternPool = RIFF_STEPS[state];
  const pattern = patternPool[modulo(performance.riffPattern, patternPool.length)];
  const phraseEvolution = modulo(phraseIndex, 4);
  const rotation = modulo(
    integer(performance.patternRotation) + phraseEvolution,
    32,
  );
  const activeSteps = rotatePatternSteps(pattern, rotation);
  const eventIndex = activeSteps.indexOf(step);
  if (eventIndex === -1) return null;

  const contour = RIFF_CONTOURS[modulo(performance.riffContour, RIFF_CONTOURS.length)];
  const safeScale = Array.isArray(scale) && scale.length ? scale : [0];
  const contourIndex = modulo(eventIndex + phraseEvolution, contour.length);
  const degree = contour[contourIndex];
  const octaveLift = (phase.name === "lift" || phase.name === "drop" || phase.name === "peak")
    && eventIndex % 4 === 3
    ? 12
    : 0;
  const stateGain = state === "critical"
    ? 1
    : state === "warning"
      ? 0.9
      : state === "unknown"
        ? 0.52
        : 0.78;
  return Object.freeze({
    midi: Math.min(
      RIFF_MAX_MIDI,
      RIFF_ROOT_MIDI + safeScale[modulo(degree, safeScale.length)] + octaveLift,
    ),
    duration: state === "unknown"
      ? "8n"
      : performance.grit >= 0.72
        ? "32n"
        : "16n",
    velocity: Math.min(
      0.56,
      (0.22 + (performance.energy ?? 0.5) * 0.3) * stateGain,
    ),
    phase: phase.name,
    timbre: modulo(performance.riffTimbre, 3),
  });
}
