/**
 * Deterministic Demo-mode performance settings for System SYMPHONY.
 *
 * A seed and four macro values always produce the same curated arrangement.
 * Live telemetry never imports these settings into its score frame.
 */

import { LOCKED_TRANSPORT_BPM, stableHash } from "./mapping.js?v=20260720-system-symphony-loop-production-v2";
import { deriveDimensions } from "./seed-dimensions.js?v=20260720-system-symphony-loop-production-v2";
import { resolveSamplePalette } from "./samples.js?v=20260720-system-symphony-loop-production-v2";

export const DEFAULT_PERFORMANCE_SEED = "A71A5";
export const PERFORMANCE_SCHEMA_VERSION = 3;
export const PERFORMANCE_EFFECT_LIMITS = Object.freeze({
  distortionWet: 0.4,
  delayWet: 0.36,
  reverbWet: 0.46,
  riffGain: 0.52,
});

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
const PERFORMANCE_SCENE_DYNAMICS = Object.freeze({
  healthy: Object.freeze({
    bpm: 100,
    density: [0.92, 0.38],
    drums: [0.95, 0.35],
    bass: [1, 0.35],
    counterline: [0.82, 0.32],
    pad: [0.48, 0.24],
    drone: [0.3, 0.18],
    texture: [0.8, 1],
    arpGain: [0.38, 0.32],
    arpDensity: [0.42, 0.42],
    filter: [0.9, 0.12],
    distortion: [0.03, 0.22],
    delay: [0.12, 0.12, 0.08],
    reverb: [0.13, 0.19],
  }),
  warning: Object.freeze({
    bpm: 100,
    density: [1, 0.45],
    drums: [1.05, 0.42],
    bass: [1.08, 0.4],
    counterline: [0.92, 0.36],
    pad: [0.38, 0.2],
    drone: [0.22, 0.14],
    texture: [1, 1.35],
    arpGain: [0.46, 0.4],
    arpDensity: [0.54, 0.5],
    filter: [0.8, 0.14],
    distortion: [0.07, 0.32],
    delay: [0.09, 0.12, 0.07],
    reverb: [0.1, 0.15],
  }),
  critical: Object.freeze({
    bpm: 100,
    density: [1.08, 0.5],
    drums: [1.16, 0.5],
    bass: [1.16, 0.45],
    counterline: [1, 0.4],
    pad: [0.26, 0.16],
    drone: [0.12, 0.1],
    texture: [1.25, 1.75],
    arpGain: [0.54, 0.42],
    arpDensity: [0.64, 0.56],
    filter: [0.72, 0.16],
    distortion: [0.12, 0.42],
    delay: [0.05, 0.08, 0.05],
    reverb: [0.07, 0.11],
  }),
  unknown: Object.freeze({
    bpm: 100,
    density: [0.78, 0.25],
    drums: [0.42, 0.32],
    bass: [0.58, 0.28],
    counterline: [0.58, 0.22],
    pad: [0.38, 0.18],
    drone: [0.42, 0.22],
    texture: [0.9, 1.15],
    arpGain: [0.22, 0.24],
    arpDensity: [0.1, 0.24],
    filter: [0.68, 0.14],
    distortion: [0.04, 0.2],
    delay: [0.18, 0.1, 0.15],
    reverb: [0.2, 0.3],
  }),
});
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
  let value = stableHash(`${seed}:${label}`) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) % modulo;
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
  const dimensions = deriveDimensions(stateSeed);
  const filterJitter = (variation(stateSeed, "filter", 9) - 4) / 100;
  const distortionJitter = (variation(stateSeed, "distortion", 7) - 3) / 100;
  const delayJitter = (variation(stateSeed, "delay", 7) - 3) / 100;
  const reverbJitter = (variation(stateSeed, "reverb", 7) - 3) / 100;
  const scene = PERFORMANCE_SCENES[normalizedState];
  const dynamics = PERFORMANCE_SCENE_DYNAMICS[normalizedState];
  const chordOffset = dimensions.chordOffset;
  const chordProgression = dimensions.chordProgression;
  const bassPattern = dimensions.bassPattern;
  const bassShift = BASS_SHIFTS[dimensions.bassShift];
  const bassDegreeOffset = dimensions.bassDegreeOffset;
  const percussionVariant = variation(stateSeed, "percussion", 8);
  const melodyOffset = dimensions.melodyOffset;
  const terminalPattern = variation(stateSeed, "terminal-pattern", 8);
  const phraseStride = dimensions.phraseStride + 1;
  const {
    kickTimbre,
    snareTimbre,
    hatTimbre,
    metalTimbre,
    bassTimbre,
    bassLoopTimbre,
    bassLoopSliceVariant,
    leadTimbre,
    atmosphereTimbre,
    leadSliceVariant,
    sectionVariant,
  } = dimensions;
  const sampleSignature = resolveSamplePalette(normalizedState, {
    kickTimbre,
    snareTimbre,
    hatTimbre,
    metalTimbre,
    bassTimbre,
    bassLoopTimbre,
    leadTimbre,
    atmosphereTimbre,
    sectionVariant,
  }, 0).signature;
  // Demo scenes run at the same locked transport tempo as the live states. The
  // macro and seed variation still shapes density, drums, filtering, arpeggios
  // and effects; it no longer moves the tempo, so the 100 BPM loops stay at
  // native rate here too.
  const targetBpm = LOCKED_TRANSPORT_BPM;
  const patternSignature = [
    `v${PERFORMANCE_SCHEMA_VERSION}`,
    chordOffset,
    chordProgression,
    bassPattern,
    bassShift,
    bassDegreeOffset,
    percussionVariant,
    melodyOffset,
    terminalPattern,
    phraseStride,
    sampleSignature,
    normalizedState === "healthy" ? leadSliceVariant : "procedural",
    bassLoopSliceVariant,
    sectionVariant,
    dimensions.hatDensity,
    dimensions.bassOctaveOffset,
    dimensions.padVoicing,
    dimensions.filterAutomation,
    dimensions.arpDirection,
    dimensions.patternRotation,
    dimensions.riffPattern,
    dimensions.riffContour,
    dimensions.riffTimbre,
    dimensions.arpOctaveSpan,
    dimensions.arpGate,
  ].join("-");

  return Object.freeze({
    ...dimensions,
    id: `v${PERFORMANCE_SCHEMA_VERSION}:${stateSeed}:${macroValues.energy}:${macroValues.motion}:${macroValues.grit}:${macroValues.space}`,
    schemaVersion: PERFORMANCE_SCHEMA_VERSION,
    seed: normalizedSeed,
    scoreState: normalizedState,
    sceneName: scene.name,
    sceneLabel: scene.label,
    macroValues,
    energy,
    motion,
    grit,
    space,
    patternSignature,
    chordOffset,
    chordProgression,
    bassPattern,
    bassShift,
    bassDegreeOffset,
    percussionVariant,
    melodyOffset,
    terminalPattern,
    phraseStride,
    kickTimbre,
    snareTimbre,
    hatTimbre,
    metalTimbre,
    bassTimbre,
    bassLoopTimbre,
    bassLoopSliceVariant,
    leadTimbre,
    atmosphereTimbre,
    leadSliceVariant,
    sectionVariant,
    sampleSignature,
    targetBpm,
    densityMultiplier: bounded(
      dynamics.density[0] + motion * dynamics.density[1],
      0.76,
      1.58,
    ),
    drumMultiplier: bounded(
      dynamics.drums[0] + energy * dynamics.drums[1],
      0.4,
      1.56,
    ),
    bassMultiplier: bounded(
      dynamics.bass[0] + energy * dynamics.bass[1],
      0.56,
      1.5,
    ),
    counterlineMultiplier: bounded(
      dynamics.counterline[0] + motion * dynamics.counterline[1],
      0.56,
      1.28,
    ),
    padMultiplier: bounded(
      dynamics.pad[0] + space * dynamics.pad[1],
      0.24,
      0.9,
    ),
    droneMultiplier: bounded(
      dynamics.drone[0] + space * dynamics.drone[1],
      0.1,
      0.68,
    ),
    textureMultiplier: bounded(
      dynamics.texture[0] + grit * dynamics.texture[1],
      0.78,
      2.8,
    ),
    terminalGain: bounded(
      dynamics.arpGain[0] + motion * dynamics.arpGain[1],
      0.2,
      0.84,
    ),
    terminalDensity: bounded(
      dynamics.arpDensity[0] + motion * dynamics.arpDensity[1],
      0.08,
      1,
    ),
    riffGain: bounded(
      0.2 + motion * 0.22 + energy * 0.1,
      0.2,
      PERFORMANCE_EFFECT_LIMITS.riffGain,
    ),
    serviceFilterMultiplier: bounded(
      dynamics.filter[0] + grit * dynamics.filter[1] + filterJitter,
      0.64,
      1.04,
    ),
    distortionWet: bounded(
      dynamics.distortion[0] + grit * dynamics.distortion[1] + distortionJitter,
      0.02,
      PERFORMANCE_EFFECT_LIMITS.distortionWet,
    ),
    delayWet: bounded(
      dynamics.delay[0]
        + motion * dynamics.delay[1]
        + space * dynamics.delay[2]
        + delayJitter,
      0.04,
      PERFORMANCE_EFFECT_LIMITS.delayWet,
    ),
    reverbWet: bounded(
      dynamics.reverb[0] + space * dynamics.reverb[1] + reverbJitter,
      0.08,
      PERFORMANCE_EFFECT_LIMITS.reverbWet,
    ),
  });
}
