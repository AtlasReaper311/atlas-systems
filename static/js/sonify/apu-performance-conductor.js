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
 *   - This conductor STACKS a phase silence budget on top: if the state
 *     identity keeps an event, the phase can still cause it to be
 *     omitted when the current phase asks for more space.
 *   - Density is a target for how full the phrase should feel. It
 *     scales percussion accent presence and secondary voice activity.
 *   - Ornaments schedule extra deterministic notes at 4/8/16 bar
 *     boundaries, chosen by hash of (seed, phraseIndex, size). Each
 *     ornament maps to a bounded, engine-visible instruction the engine
 *     invokes at the right musical moment.
 *
 * This module is pure data. All variation comes from the perf plan and
 * the current frame. No Math.random, no Date.now.
 *
 * The conductor is deliberately opinionated but bounded: any single
 * decision it makes can be checked at unit level (should this event
 * pass? what ornament fires now? what velocity scale does the density
 * ask for?). The engine invokes these checks at every play* site.
 */

export const APU_PERFORMANCE_CONDUCTOR_BUILD_ID = "20260727-apu-performance-conductor-v2";

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

// Category weight: how strongly does silence budget apply to each event category?
// Higher = more likely to be dropped when phase asks for silence.
// Values chosen so the melodic voices thin out first, drums keep pulse.
const SILENCE_WEIGHTS = Object.freeze({
  rhythm: 0.4,    // drums keep pulse even in intro
  bass: 0.5,      // bass thins moderately
  pad: 0.6,       // pads thin freely (they're texture)
  primary: 0.8,   // lead thins strongly
  secondary: 1.0, // counter voice thins the most
  service: 0.7,   // services thin moderately
  accent: 0.9,    // accents thin strongly
});

// Density affects velocity/gate presence. Lower density = quieter accents.
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

/**
 * Decide whether an event category should be omitted at the current
 * step because the current phase asks for silence. The state identity's
 * own omissionThreshold is a separate decision made upstream; this
 * function assumes the state has already voted "keep".
 *
 * @param {object} args
 * @param {object} args.perfPlan - perf director plan from advancePhrase
 * @param {string} args.category - one of the SILENCE_WEIGHTS keys
 * @param {number} args.stepIndex - absolute step index
 * @param {number} args.phraseIndex - current perf phrase index
 * @param {number} [args.seedHash] - stable seed hash for determinism
 * @returns {boolean} true when the event should be omitted
 */
export function shouldOmitForPhase({ perfPlan, category, stepIndex, phraseIndex, seedHash = 0 } = {}) {
  if (!perfPlan) return false;
  const budget = clamp(perfPlan.silenceBudget, 0, 1);
  if (budget <= 0) return false;
  const weight = SILENCE_WEIGHTS[category] ?? 0.5;
  const density = clamp(perfPlan.density, 0, 1);
  const activityWeight = ACTIVITY_WEIGHTS[category] ?? 0.5;
  const densityGap = (1 - density) * activityWeight;
  const threshold = clamp(budget * weight + densityGap, 0, 0.92);
  // Deterministic hash per (category, phrase, step); no randomness.
  const hash = fnv1a(`silence:${category}:${phraseIndex}:${stepIndex}:${seedHash}`);
  const normalized = hash / 0x7fffffff;
  return normalized < threshold;
}

/**
 * Scale a velocity by the current density target. Density below 1.0
 * quiets accents. Never boosts above 1.0.
 */
export function velocityScaleForDensity(perfPlan, category) {
  if (!perfPlan) return 1.0;
  const density = clamp(perfPlan.density, 0, 1);
  const range = DENSITY_TARGETS[category] ?? { min: 0.4, max: 1.0 };
  return clamp(range.min + (range.max - range.min) * density, 0.1, 1.0);
}


/**
 * Add bounded rhythmic activity when a phase asks for genuine density.
 * The engine only uses these instructions when the sequencer did not already
 * schedule the same voice on that step.
 */
export function supplementalRhythmForDensity(perfPlan, step, phraseIndex = 0) {
  if (!perfPlan) return Object.freeze([]);
  const density = clamp(perfPlan.density, 0, 1);
  const localStep = ((Math.trunc(step) % 32) + 32) % 32;
  const out = [];
  if (density >= 0.58 && localStep % 4 === 2) {
    out.push(Object.freeze({ voice: "hat", velocity: 0.16 + density * 0.16, duration: "32n" }));
  }
  if (density >= 0.76 && localStep % 8 === 6) {
    out.push(Object.freeze({ voice: "hat", velocity: 0.18 + density * 0.15, duration: "32n" }));
  }
  if (density >= 0.9 && localStep === (12 + (Math.abs(Math.trunc(phraseIndex)) % 2) * 16)) {
    out.push(Object.freeze({ voice: "noiseAccent", velocity: 0.18, duration: "32n" }));
  }
  return Object.freeze(out);
}

/**
 * Ornament kinds and their engine-side effect. This table is the sole
 * source of truth for what an ornament means audibly.
 *
 * Each ornament produces a bounded list of scheduled instructions the
 * engine invokes at (barStart + offsetSteps). Instructions are just
 * plain data; the engine maps them to actual voice triggers.
 */
const ORNAMENT_INSTRUCTIONS = Object.freeze({
  // Small (every 4 bars) - subtle
  ripple:      Object.freeze([{ voice: "primary",  offsetSteps: 30, midiOffset: 12, velocity: 0.35, duration: "32n" }]),
  stab:        Object.freeze([{ voice: "accent",   offsetSteps: 31, midiOffset: 0,  velocity: 0.30, duration: "16n" }]),
  tick:        Object.freeze([{ voice: "hat",      offsetSteps: 30, velocity: 0.42, duration: "32n" }]),

  // Medium (every 8 bars) - noticeable
  swell:       Object.freeze([
    { voice: "pad", offsetSteps: 28, midiOffset: 0, velocity: 0.25, duration: "2n" },
    { voice: "pad", offsetSteps: 30, midiOffset: 5, velocity: 0.28, duration: "2n" },
  ]),
  glitch:      Object.freeze([{ voice: "noiseAccent", offsetSteps: 29, velocity: 0.32, duration: "16n" }]),
  shimmer:     Object.freeze([
    { voice: "primary", offsetSteps: 28, midiOffset: 24, velocity: 0.28, duration: "32n" },
    { voice: "primary", offsetSteps: 29, midiOffset: 19, velocity: 0.24, duration: "32n" },
    { voice: "primary", offsetSteps: 30, midiOffset: 12, velocity: 0.22, duration: "32n" },
  ]),

  // Large (every 16 bars) - structural
  flourish:    Object.freeze([
    { voice: "primary", offsetSteps: 26, midiOffset: 0,  velocity: 0.42, duration: "16n" },
    { voice: "primary", offsetSteps: 28, midiOffset: 7,  velocity: 0.44, duration: "16n" },
    { voice: "primary", offsetSteps: 30, midiOffset: 12, velocity: 0.48, duration: "16n" },
  ]),
  structural:  Object.freeze([
    { voice: "kick",      offsetSteps: 28, velocity: 0.6, duration: "16n" },
    { voice: "openHat",   offsetSteps: 30, velocity: 0.5, duration: "16n" },
    { voice: "accent",    offsetSteps: 31, midiOffset: 0, velocity: 0.5, duration: "8n" },
  ]),
  reprise:     Object.freeze([
    { voice: "secondary", offsetSteps: 24, midiOffset: 0,  velocity: 0.4,  duration: "8n" },
    { voice: "secondary", offsetSteps: 28, midiOffset: -5, velocity: 0.36, duration: "8n" },
  ]),
});

/**
 * Return the ornament instruction list scheduled for the current phrase.
 * Perf plan carries an ornaments array; each ornament maps to
 * ORNAMENT_INSTRUCTIONS. Instructions are unioned with an offsetSteps
 * value indicating the step index within the phrase (0..31).
 *
 * If the perf plan has no ornaments this returns an empty frozen array.
 */
export function ornamentInstructionsForPhrase(perfPlan) {
  if (!perfPlan?.ornaments?.length) return Object.freeze([]);
  const out = [];
  for (const ornament of perfPlan.ornaments) {
    const list = ORNAMENT_INSTRUCTIONS[ornament.name];
    if (!list) continue;
    for (const instruction of list) {
      out.push(Object.freeze({ ...instruction, ornament: ornament.name, size: ornament.size, bar: ornament.bar }));
    }
  }
  return Object.freeze(out);
}

/**
 * Diagnostic surface: describes what the conductor is doing for a given
 * perf plan without actually consuming it.
 */
export function describeConductor(perfPlan) {
  if (!perfPlan) return "conductor idle";
  const ornaments = perfPlan.ornaments?.map((o) => `${o.size}:${o.name}`).join(",") ?? "";
  return `phase=${perfPlan.phase} silence=${perfPlan.silenceBudget?.toFixed(2)} density=${perfPlan.density?.toFixed(2)} ornaments=[${ornaments}]`;
}

/**
 * Enumerate the categories the conductor handles, so tests can prove
 * every category has a silence weight and density target.
 */
export function performanceCategories() {
  return Object.freeze(Object.keys(SILENCE_WEIGHTS));
}
