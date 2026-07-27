import { stateFeatureInstructionsForPhrase } from "./apu-state-orchestration-d1a.js?v=20260727-system-symphony-pass-d1a";

/**
 * Atlas APU performance conductor.
 *
 * Consumes a `PerformanceDirector v4` plan and turns the plan's data
 * (silenceBudget, density, ornaments, phase energy) into decisions that
 * meaningfully affect what the engine plays.
 *
 * Ownership contract:
 *
 *   - State identities own base per-state omission via omissionThreshold.
 *   - This conductor applies a bounded phase silence budget after the state
 *     decision while preserving rhythm, bass, and pad continuity anchors.
 *   - Density is a target for how full the phrase should feel. It
 *     scales percussion accent presence and secondary voice activity.
 *   - D1A state orchestration adds deterministic arps and bounded response
 *     figures without choosing state, harmony, tempo, or evidence.
 *   - Ornaments schedule extra deterministic notes at 4/8/16 bar
 *     boundaries, chosen by hash of (seed, phraseIndex, size).
 *
 * This module is pure data. No Math.random, no Date.now.
 */

export const APU_PERFORMANCE_CONDUCTOR_BUILD_ID = "20260727-apu-performance-conductor-d1a-v4";

const clamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  if (numeric < minimum) return minimum;
  if (numeric > maximum) return maximum;
  return numeric;
};

function fnv1a(text) {
  let hash = 2166136261;
  const source = String(text ?? "");
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) & 0x7fffffff;
}

const SILENCE_WEIGHTS = Object.freeze({
  rhythm: 0.22,
  bass: 0.28,
  pad: 0.35,
  primary: 0.65,
  secondary: 0.82,
  service: 0.52,
  accent: 0.72,
});

const CONTINUITY_ANCHORS = Object.freeze({
  rhythm: 4,
  bass: 8,
  pad: 16,
});

const PASS_C_SILENCE_SCALE = 0.62;
const PASS_C_DENSITY_GAP_SCALE = 0.55;

const ACTIVITY_WEIGHTS = Object.freeze({
  rhythm: 0.35,
  bass: 0.28,
  pad: 0.42,
  primary: 0.5,
  secondary: 0.7,
  service: 0.55,
  accent: 0.65,
});

const DENSITY_TARGETS = Object.freeze({
  rhythm: { min: 0.35, max: 1.0 },
  bass: { min: 0.55, max: 1.0 },
  pad: { min: 0.45, max: 1.0 },
  primary: { min: 0.5, max: 1.0 },
  secondary: { min: 0.4, max: 1.0 },
  service: { min: 0.4, max: 1.0 },
  accent: { min: 0.3, max: 1.0 },
});

export function shouldOmitForPhase({ perfPlan, category, stepIndex, phraseIndex, seedHash = 0 } = {}) {
  if (!perfPlan) return false;
  const budget = clamp(perfPlan.silenceBudget, 0, 1);
  if (budget <= 0) return false;
  const localStep = ((Math.trunc(stepIndex) % 32) + 32) % 32;
  const anchorEvery = CONTINUITY_ANCHORS[category];
  if (anchorEvery && localStep % anchorEvery === 0) return false;

  const weight = SILENCE_WEIGHTS[category] ?? 0.5;
  const density = clamp(perfPlan.density, 0, 1);
  const activityWeight = ACTIVITY_WEIGHTS[category] ?? 0.5;
  const densityGap = (1 - density) * activityWeight * PASS_C_DENSITY_GAP_SCALE;
  const threshold = clamp(
    budget * PASS_C_SILENCE_SCALE * weight + densityGap,
    0,
    0.72,
  );
  const hash = fnv1a(`silence:${category}:${phraseIndex}:${stepIndex}:${seedHash}`);
  return hash / 0x7fffffff < threshold;
}

export function velocityScaleForDensity(perfPlan, category) {
  if (!perfPlan) return 1.0;
  const density = clamp(perfPlan.density, 0, 1);
  const range = DENSITY_TARGETS[category] ?? { min: 0.4, max: 1.0 };
  return clamp(range.min + (range.max - range.min) * density, 0.1, 1.0);
}

export function supplementalRhythmForDensity(perfPlan, step, phraseIndex = 0) {
  if (!perfPlan) return Object.freeze([]);
  const density = clamp(perfPlan.density, 0, 1);
  const localStep = ((Math.trunc(step) % 32) + 32) % 32;
  const out = [];
  if (density >= 0.46 && localStep % 4 === 2) {
    out.push(Object.freeze({ voice: "hat", velocity: 0.16 + density * 0.16, duration: "32n" }));
  }
  if (density >= 0.72 && localStep % 8 === 6) {
    out.push(Object.freeze({ voice: "hat", velocity: 0.18 + density * 0.15, duration: "32n" }));
  }
  if (density >= 0.9 && localStep === (12 + (Math.abs(Math.trunc(phraseIndex)) % 2) * 16)) {
    out.push(Object.freeze({ voice: "noiseAccent", velocity: 0.18, duration: "32n" }));
  }
  return Object.freeze(out);
}

const CONNECTIVE_ARP_CONTOURS = Object.freeze({
  healthy: Object.freeze([0, 4, 7]),
  warning: Object.freeze([0, 3, 7]),
  critical: Object.freeze([0, 7, 12]),
  unknown: Object.freeze([0, 5, 7]),
});

const CONNECTIVE_ARP_PHASE_GAIN = Object.freeze({
  intro: 0.76,
  groove: 1,
  pressure: 1.06,
  rupture: 0.94,
  recovery: 0.9,
  afterglow: 0.7,
});

export function connectiveArpeggioInstructionsForPhrase(perfPlan) {
  if (!perfPlan) return Object.freeze([]);
  const phraseIndex = Math.max(0, Math.trunc(perfPlan.phraseIndex ?? 0));
  const state = CONNECTIVE_ARP_CONTOURS[perfPlan.state] ? perfPlan.state : "unknown";
  const phase = CONNECTIVE_ARP_PHASE_GAIN[perfPlan.phase] ? perfPlan.phase : "groove";
  const source = CONNECTIVE_ARP_CONTOURS[state];
  const descending = phraseIndex % 2 === 1;
  const contour = descending ? [...source].reverse() : [...source];
  const start = phraseIndex % 2 === 0 ? 8 : 20;
  const octaveLift = phraseIndex % 4 >= 2 ? 12 : 0;
  const stateGain = { healthy: 1, warning: 0.94, critical: 0.82, unknown: 0.72 }[state];
  const velocity = clamp(0.22 * stateGain * CONNECTIVE_ARP_PHASE_GAIN[phase], 0.11, 0.26);
  const duration = state === "unknown" || phase === "afterglow" ? "16n" : "32n";

  return Object.freeze(contour.map((midiOffset, index) => Object.freeze({
    voice: "primary",
    offsetSteps: start + index * 2,
    midiOffset: midiOffset + octaveLift,
    velocity: Number((velocity - index * 0.012).toFixed(3)),
    duration,
    ornament: "connective-arp",
    size: "phrase",
    bar: perfPlan.bars ?? phraseIndex * 2,
  })));
}

const ORNAMENT_INSTRUCTIONS = Object.freeze({
  ripple: Object.freeze([{ voice: "primary", offsetSteps: 30, midiOffset: 12, velocity: 0.35, duration: "32n" }]),
  stab: Object.freeze([{ voice: "accent", offsetSteps: 31, midiOffset: 0, velocity: 0.30, duration: "16n" }]),
  tick: Object.freeze([{ voice: "hat", offsetSteps: 30, velocity: 0.42, duration: "32n" }]),
  swell: Object.freeze([
    { voice: "pad", offsetSteps: 28, midiOffset: 0, velocity: 0.25, duration: "2n" },
    { voice: "pad", offsetSteps: 30, midiOffset: 5, velocity: 0.28, duration: "2n" },
  ]),
  glitch: Object.freeze([{ voice: "noiseAccent", offsetSteps: 29, velocity: 0.32, duration: "16n" }]),
  shimmer: Object.freeze([
    { voice: "primary", offsetSteps: 28, midiOffset: 24, velocity: 0.28, duration: "32n" },
    { voice: "primary", offsetSteps: 29, midiOffset: 19, velocity: 0.24, duration: "32n" },
    { voice: "primary", offsetSteps: 30, midiOffset: 12, velocity: 0.22, duration: "32n" },
  ]),
  flourish: Object.freeze([
    { voice: "primary", offsetSteps: 26, midiOffset: 0, velocity: 0.42, duration: "16n" },
    { voice: "primary", offsetSteps: 28, midiOffset: 7, velocity: 0.44, duration: "16n" },
    { voice: "primary", offsetSteps: 30, midiOffset: 12, velocity: 0.48, duration: "16n" },
  ]),
  structural: Object.freeze([
    { voice: "kick", offsetSteps: 28, velocity: 0.6, duration: "16n" },
    { voice: "openHat", offsetSteps: 30, velocity: 0.5, duration: "16n" },
    { voice: "accent", offsetSteps: 31, midiOffset: 0, velocity: 0.5, duration: "8n" },
  ]),
  reprise: Object.freeze([
    { voice: "secondary", offsetSteps: 24, midiOffset: 0, velocity: 0.4, duration: "8n" },
    { voice: "secondary", offsetSteps: 28, midiOffset: -5, velocity: 0.36, duration: "8n" },
  ]),
});

export function ornamentInstructionsForPhrase(perfPlan) {
  if (!perfPlan) return Object.freeze([]);
  const out = [
    ...connectiveArpeggioInstructionsForPhrase(perfPlan),
    ...stateFeatureInstructionsForPhrase(perfPlan),
  ];
  for (const ornament of perfPlan.ornaments ?? []) {
    const list = ORNAMENT_INSTRUCTIONS[ornament.name];
    if (!list) continue;
    for (const instruction of list) {
      out.push(Object.freeze({ ...instruction, ornament: ornament.name, size: ornament.size, bar: ornament.bar }));
    }
  }
  return Object.freeze(out);
}

export function describeConductor(perfPlan) {
  if (!perfPlan) return "conductor idle";
  const ornaments = perfPlan.ornaments?.map((o) => `${o.size}:${o.name}`).join(",") ?? "";
  const stateFeatures = stateFeatureInstructionsForPhrase(perfPlan).length;
  return `phase=${perfPlan.phase} silence=${perfPlan.silenceBudget?.toFixed(2)} density=${perfPlan.density?.toFixed(2)} stateFeatures=${stateFeatures} ornaments=[${ornaments}]`;
}

export function performanceCategories() {
  return Object.freeze(Object.keys(SILENCE_WEIGHTS));
}
