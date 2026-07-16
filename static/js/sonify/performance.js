/**
 * Deterministic Demo-mode performance settings for System SYMPHONY.
 *
 * A seed and four macro values always produce the same curated arrangement.
 * Live telemetry never imports these settings into its score frame.
 */

import { stableHash } from "./mapping.js?v=20260716-system-symphony-performance-console";

export const DEFAULT_PERFORMANCE_SEED = "A71A5";

export const PERFORMANCE_SCENES = Object.freeze({
  healthy: Object.freeze({
    name: "NIGHT DRIVE",
    label: "Healthy // Night Drive",
  }),
  warning: Object.freeze({
    name: "GRID PRESSURE",
    label: "Warning // Grid Pressure",
  }),
  critical: Object.freeze({
    name: "REDLINE PROTOCOL",
    label: "Critical // Redline Protocol",
  }),
  unknown: Object.freeze({
    name: "GHOST SIGNAL",
    label: "Unknown // Ghost Signal",
  }),
});

export const PERFORMANCE_MACRO_DEFAULTS = Object.freeze({
  energy: 68,
  motion: 64,
  grit: 58,
  space: 72,
});

const BASS_SHIFTS = Object.freeze([0, 1, -1, 0]);
const PERFORMANCE_SEED_PATTERN = /^[0-9A-F]{4,8}$/;

function clamp(value, minimum, maximum) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function clampMacro(value, fallback) {
  const numeric = Number(value);
  return Math.round(clamp(
    Number.isFinite(numeric) ? numeric : fallback,
    0,
    100,
  ));
}

function bounded(value, minimum, maximum) {
  return Number(clamp(value, minimum, maximum).toFixed(4));
}

function variation(seed, label, modulo) {
  return stableHash(`${seed}:${label}`) % modulo;
}

export function normalizePerformanceSeed(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!PERFORMANCE_SEED_PATTERN.test(normalized)) {
    throw new Error("performance seed must contain 4 to 8 hexadecimal characters");
  }
  return normalized;
}

export function formatPerformanceSeed(value) {
  const numeric = Number.isFinite(value) ? Math.trunc(value) : 0;
  return (numeric >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

export function normalizePerformanceMacros(macros = {}) {
  return Object.freeze(Object.fromEntries(
    Object.entries(PERFORMANCE_MACRO_DEFAULTS).map(([name, fallback]) => [
      name,
      clampMacro(macros?.[name], fallback),
    ]),
  ));
}

export function createPerformanceArrangement(
  seed,
  scoreState,
  macros = PERFORMANCE_MACRO_DEFAULTS,
) {
  const normalizedSeed = normalizePerformanceSeed(seed);
  const normalizedState = PERFORMANCE_SCENES[scoreState] ? scoreState : "unknown";
  const macroValues = normalizePerformanceMacros(macros);
  const energy = macroValues.energy / 100;
  const motion = macroValues.motion / 100;
  const grit = macroValues.grit / 100;
  const space = macroValues.space / 100;
  const stateSeed = `${normalizedSeed}:${normalizedState}`;
  const tempoJitter = (variation(stateSeed, "tempo", 9) - 4) / 200;
  const filterJitter = (variation(stateSeed, "filter", 9) - 4) / 100;
  const distortionJitter = (variation(stateSeed, "distortion", 7) - 3) / 100;
  const delayJitter = (variation(stateSeed, "delay", 7) - 3) / 100;
  const reverbJitter = (variation(stateSeed, "reverb", 7) - 3) / 100;
  const scene = PERFORMANCE_SCENES[normalizedState];

  return Object.freeze({
    id: `${stateSeed}:${macroValues.energy}:${macroValues.motion}:${macroValues.grit}:${macroValues.space}`,
    seed: normalizedSeed,
    scoreState: normalizedState,
    sceneName: scene.name,
    sceneLabel: scene.label,
    macroValues,
    energy,
    motion,
    grit,
    space,
    chordOffset: variation(stateSeed, "chords", 4),
    bassShift: BASS_SHIFTS[variation(stateSeed, "bass-shift", BASS_SHIFTS.length)],
    bassDegreeOffset: variation(stateSeed, "bass-degree", 5),
    percussionVariant: variation(stateSeed, "percussion", 4),
    melodyOffset: variation(stateSeed, "melody", 8),
    terminalPattern: variation(stateSeed, "terminal-pattern", 4),
    phraseStride: variation(stateSeed, "phrase-stride", 2) === 0 ? 1 : 3,
    bpmMultiplier: bounded(0.94 + energy * 0.3 + tempoJitter, 0.92, 1.26),
    densityMultiplier: bounded(0.78 + motion * 0.54, 0.78, 1.32),
    drumMultiplier: bounded(0.7 + energy * 0.48, 0.7, 1.18),
    bassMultiplier: bounded(0.76 + energy * 0.34, 0.76, 1.1),
    counterlineMultiplier: bounded(0.72 + motion * 0.48, 0.72, 1.2),
    padMultiplier: bounded(0.76 + space * 0.32, 0.76, 1.08),
    droneMultiplier: bounded(0.84 + space * 0.24, 0.84, 1.08),
    textureMultiplier: bounded(0.72 + grit * 1.58, 0.72, 2.3),
    terminalGain: bounded(0.12 + motion * 0.3, 0.12, 0.42),
    terminalDensity: bounded(0.24 + motion * 0.68, 0.24, 0.92),
    serviceFilterMultiplier: bounded(0.9 + grit * 0.2 + filterJitter, 0.86, 1.14),
    distortionWet: bounded(0.02 + grit * 0.28 + distortionJitter, 0.02, 0.32),
    delayWet: bounded(0.04 + motion * 0.15 + space * 0.12 + delayJitter, 0.04, 0.33),
    reverbWet: bounded(0.18 + space * 0.3 + reverbJitter, 0.18, 0.5),
  });
}
