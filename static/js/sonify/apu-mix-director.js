/**
 * Atlas APU Mix Director.
 *
 * Given a state (healthy, warning, critical, unknown) and a performance
 * phase (intro, groove, pressure, rupture, recovery, afterglow), returns
 * a bounded, deterministic mix directive describing how each APU bus
 * should be shaped for that moment.
 *
 * Mix directives are pure data. The engine wiring in Pass C consumes
 * them to move existing Web Audio parameters. Nothing in this module
 * touches Tone.js, an AudioContext, or any node. That keeps the design
 * testable, reviewable, and safe to change without audio glitches.
 *
 * Five outputs per call:
 *
 *   1. buses          - per-bus gainMul, highcutHz, and stereo width
 *   2. ducking        - a list of sidechain rules (source, target, depth,
 *                       releaseMs), tuned so kick, bass, lead, services,
 *                       and noise stop stepping on each other
 *   3. chipWobble     - LFO settings that vibrate the master lowpass by
 *                       a few cents so the piece never feels frozen
 *   4. transientSoftener - shelf-plus-ratio parameters that shave the
 *                       sharpest transient content before the soft
 *                       clipper, preventing upper-mid buildup
 *   5. provenance     - short label the debug UI can display
 *
 * Every numeric output is clamped inside safe Web Audio ranges. No path
 * can produce NaN, Infinity, negative gain, an out-of-range filter
 * cutoff, or a ducking depth that would silence a bus.
 */

export const APU_MIX_DIRECTOR_BUILD_ID = "20260727-apu-mix-director-v2";

export const APU_MIX_LISTENER_POLISH = Object.freeze({
  bassGainMul: 0.82,
  kickBassDuckDepthMul: 1.18,
});

// ---------------------------------------------------------------------------
// Bus roles
// ---------------------------------------------------------------------------

export const APU_MIX_BUSES = Object.freeze([
  "primary",
  "secondary",
  "bass",
  "pad",
  "services",
  "drums",
  "accent",
]);

// ---------------------------------------------------------------------------
// State base profiles
//
// Each entry is the "steady state" mix for that estate state, before
// phase modulation. Higher highcutHz = brighter; wider width = more
// stereo spread. Widths above 1.0 are clamped so a state cannot ask
// for out-of-phase panning.
// ---------------------------------------------------------------------------

const STATE_MIX_BASE = Object.freeze({
  healthy: Object.freeze({
    buses: Object.freeze({
      primary:   Object.freeze({ gainMul: 1.00, highcutHz: 6800, width: 0.50 }),
      secondary: Object.freeze({ gainMul: 0.92, highcutHz: 5000, width: 0.42 }),
      bass:      Object.freeze({ gainMul: 1.00, highcutHz: 1400, width: 0.06 }),
      pad:       Object.freeze({ gainMul: 0.86, highcutHz: 4200, width: 0.80 }),
      services:  Object.freeze({ gainMul: 1.00, highcutHz: 5200, width: 0.60 }),
      drums:     Object.freeze({ gainMul: 1.00, highcutHz: 9000, width: 0.18 }),
      accent:    Object.freeze({ gainMul: 0.90, highcutHz: 5200, width: 0.72 }),
    }),
    wobble:   Object.freeze({ rateHz: 0.22, depthCents: 4.0 }),
    softener: Object.freeze({ thresholdDb: -8, ratio: 1.4, freqHz: 3400 }),
  }),
  warning: Object.freeze({
    buses: Object.freeze({
      primary:   Object.freeze({ gainMul: 1.02, highcutHz: 6200, width: 0.40 }),
      secondary: Object.freeze({ gainMul: 0.95, highcutHz: 4400, width: 0.34 }),
      bass:      Object.freeze({ gainMul: 1.02, highcutHz: 1300, width: 0.06 }),
      pad:       Object.freeze({ gainMul: 0.80, highcutHz: 3400, width: 0.68 }),
      services:  Object.freeze({ gainMul: 0.98, highcutHz: 4600, width: 0.50 }),
      drums:     Object.freeze({ gainMul: 1.02, highcutHz: 8000, width: 0.16 }),
      accent:    Object.freeze({ gainMul: 0.92, highcutHz: 4600, width: 0.60 }),
    }),
    wobble:   Object.freeze({ rateHz: 0.36, depthCents: 6.0 }),
    softener: Object.freeze({ thresholdDb: -7, ratio: 1.5, freqHz: 3200 }),
  }),
  critical: Object.freeze({
    buses: Object.freeze({
      primary:   Object.freeze({ gainMul: 1.05, highcutHz: 5400, width: 0.28 }),
      secondary: Object.freeze({ gainMul: 0.98, highcutHz: 3800, width: 0.26 }),
      bass:      Object.freeze({ gainMul: 1.08, highcutHz: 1150, width: 0.04 }),
      pad:       Object.freeze({ gainMul: 0.70, highcutHz: 2600, width: 0.50 }),
      services:  Object.freeze({ gainMul: 0.95, highcutHz: 4000, width: 0.42 }),
      drums:     Object.freeze({ gainMul: 1.06, highcutHz: 6800, width: 0.12 }),
      accent:    Object.freeze({ gainMul: 0.95, highcutHz: 4000, width: 0.48 }),
    }),
    wobble:   Object.freeze({ rateHz: 0.48, depthCents: 8.0 }),
    softener: Object.freeze({ thresholdDb: -5, ratio: 1.8, freqHz: 3000 }),
  }),
  unknown: Object.freeze({
    buses: Object.freeze({
      primary:   Object.freeze({ gainMul: 0.86, highcutHz: 4200, width: 0.55 }),
      secondary: Object.freeze({ gainMul: 0.82, highcutHz: 3400, width: 0.50 }),
      bass:      Object.freeze({ gainMul: 0.90, highcutHz: 1000, width: 0.08 }),
      pad:       Object.freeze({ gainMul: 0.75, highcutHz: 2400, width: 0.86 }),
      services:  Object.freeze({ gainMul: 0.85, highcutHz: 3800, width: 0.66 }),
      drums:     Object.freeze({ gainMul: 0.80, highcutHz: 6400, width: 0.22 }),
      accent:    Object.freeze({ gainMul: 0.82, highcutHz: 3800, width: 0.78 }),
    }),
    wobble:   Object.freeze({ rateHz: 0.14, depthCents: 5.0 }),
    softener: Object.freeze({ thresholdDb: -10, ratio: 1.3, freqHz: 3600 }),
  }),
});

// ---------------------------------------------------------------------------
// Phase modulators
//
// Each phase applies a multiplicative correction to the state base.
// gainMul stacks with the state's gainMul; widthMul opens or narrows
// stereo per phase; wobbleDepthMul and duckDepthMul push wobble and
// ducking respectively.
// ---------------------------------------------------------------------------

const PHASE_MIX_MOD = Object.freeze({
  intro:     Object.freeze({ gainMul: 0.82, widthMul: 1.15, wobbleDepthMul: 1.20, duckDepthMul: 0.75 }),
  groove:    Object.freeze({ gainMul: 1.00, widthMul: 1.00, wobbleDepthMul: 1.00, duckDepthMul: 1.00 }),
  pressure:  Object.freeze({ gainMul: 1.04, widthMul: 0.90, wobbleDepthMul: 0.80, duckDepthMul: 1.15 }),
  rupture:   Object.freeze({ gainMul: 1.08, widthMul: 0.75, wobbleDepthMul: 0.55, duckDepthMul: 1.35 }),
  recovery:  Object.freeze({ gainMul: 0.94, widthMul: 1.05, wobbleDepthMul: 1.05, duckDepthMul: 0.85 }),
  afterglow: Object.freeze({ gainMul: 0.75, widthMul: 1.20, wobbleDepthMul: 1.25, duckDepthMul: 0.65 }),
});

// ---------------------------------------------------------------------------
// Ducking rules
//
// Each rule says "when `source` fires, briefly duck `target` by depth dB
// with a `releaseMs` recovery." The engine wiring in Pass C converts
// each rule to a sidechained GainNode envelope automation.
//
// Rules are ordered by importance so a mixer that can only afford four
// sidechains still gets the four that matter most for clarity.
// ---------------------------------------------------------------------------

const DUCKING_RULES = Object.freeze([
  Object.freeze({ source: "kick",     target: "bass",     baseDepthDb: 3.2, releaseMs: 120 }),
  Object.freeze({ source: "kick",     target: "pad",      baseDepthDb: 1.6, releaseMs: 200 }),
  Object.freeze({ source: "primary",  target: "pad",      baseDepthDb: 2.2, releaseMs: 90 }),
  Object.freeze({ source: "primary",  target: "services", baseDepthDb: 1.2, releaseMs: 70 }),
  Object.freeze({ source: "services", target: "accent",   baseDepthDb: 1.0, releaseMs: 60 }),
  Object.freeze({ source: "drums",    target: "accent",   baseDepthDb: 1.4, releaseMs: 80 }),
]);

// ---------------------------------------------------------------------------
// Safety envelope
//
// Every output value is clamped into a range that either a) Web Audio
// itself accepts, or b) is musically defensible even at the extremes.
// A future refactor of the phase modulators or state bases cannot break
// the envelope without changing these constants.
// ---------------------------------------------------------------------------

const SAFETY = Object.freeze({
  gainMulMin: 0.30,
  gainMulMax: 1.20,
  highcutMinHz: 200,
  highcutMaxHz: 20000,
  widthMin: 0.00,
  widthMax: 1.00,
  duckDepthMinDb: 0.00,
  duckDepthMaxDb: 6.00,
  duckReleaseMinMs: 20,
  duckReleaseMaxMs: 400,
  wobbleRateMinHz: 0.05,
  wobbleRateMaxHz: 4.00,
  wobbleDepthMinCents: 0.00,
  wobbleDepthMaxCents: 20.00,
  softenerThresholdMinDb: -30,
  softenerThresholdMaxDb: 0,
  softenerRatioMin: 1.0,
  softenerRatioMax: 4.0,
  softenerFreqMinHz: 500,
  softenerFreqMaxHz: 12000,
});

const clamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  if (numeric < minimum) return minimum;
  if (numeric > maximum) return maximum;
  return numeric;
};

const safeState = (state) => (STATE_MIX_BASE[state] ? state : "unknown");
const safePhase = (phase) => (PHASE_MIX_MOD[phase] ? phase : "groove");

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Produce a mix directive for a given state and phase.
 *
 * @param {object} [options]
 * @param {string} [options.state] - "healthy" | "warning" | "critical" | "unknown"
 * @param {string} [options.phase] - performance director phase name
 * @returns {object} frozen mix directive
 */
export function mixDirectiveFor({ state = "healthy", phase = "groove" } = {}) {
  const stateKey = safeState(state);
  const phaseKey = safePhase(phase);
  const stateBase = STATE_MIX_BASE[stateKey];
  const phaseMod = PHASE_MIX_MOD[phaseKey];

  const buses = {};
  for (const busName of APU_MIX_BUSES) {
    const base = stateBase.buses[busName];
    const listenerGainMul = busName === "bass" ? APU_MIX_LISTENER_POLISH.bassGainMul : 1;
    buses[busName] = Object.freeze({
      gainMul:   clamp(base.gainMul * phaseMod.gainMul * listenerGainMul, SAFETY.gainMulMin, SAFETY.gainMulMax),
      highcutHz: clamp(base.highcutHz, SAFETY.highcutMinHz, SAFETY.highcutMaxHz),
      width:     clamp(base.width * phaseMod.widthMul, SAFETY.widthMin, SAFETY.widthMax),
    });
  }

  const ducking = DUCKING_RULES.map((rule) => {
    const listenerDepthMul = rule.source === "kick" && rule.target === "bass"
      ? APU_MIX_LISTENER_POLISH.kickBassDuckDepthMul
      : 1;
    return Object.freeze({
      source: rule.source,
      target: rule.target,
      depthDb: clamp(
        rule.baseDepthDb * phaseMod.duckDepthMul * listenerDepthMul,
        SAFETY.duckDepthMinDb,
        SAFETY.duckDepthMaxDb,
      ),
      releaseMs: clamp(rule.releaseMs, SAFETY.duckReleaseMinMs, SAFETY.duckReleaseMaxMs),
    });
  });

  const chipWobble = Object.freeze({
    rateHz: clamp(stateBase.wobble.rateHz, SAFETY.wobbleRateMinHz, SAFETY.wobbleRateMaxHz),
    depthCents: clamp(
      stateBase.wobble.depthCents * phaseMod.wobbleDepthMul,
      SAFETY.wobbleDepthMinCents,
      SAFETY.wobbleDepthMaxCents,
    ),
    target: "masterFilter",
  });

  const transientSoftener = Object.freeze({
    thresholdDb: clamp(stateBase.softener.thresholdDb, SAFETY.softenerThresholdMinDb, SAFETY.softenerThresholdMaxDb),
    ratio:       clamp(stateBase.softener.ratio, SAFETY.softenerRatioMin, SAFETY.softenerRatioMax),
    freqHz:      clamp(stateBase.softener.freqHz, SAFETY.softenerFreqMinHz, SAFETY.softenerFreqMaxHz),
  });

  return Object.freeze({
    provenance: `${stateKey}/${phaseKey}: ${describeIntent(stateKey, phaseKey)}`,
    state: stateKey,
    phase: phaseKey,
    buses: Object.freeze(buses),
    ducking: Object.freeze(ducking),
    chipWobble,
    transientSoftener,
  });
}

/**
 * Provenance snippet describing the mixing intent for a state + phase.
 * @param {string} state
 * @param {string} phase
 * @returns {string}
 */
export function describeIntent(state, phase) {
  const s = safeState(state);
  const p = safePhase(phase);
  const stateIntent = {
    healthy: "open and balanced",
    warning: "narrowed and edgy",
    critical: "compressed and dark",
    unknown: "soft and adrift",
  }[s];
  const phaseIntent = {
    intro: "sparse opening",
    groove: "settled body",
    pressure: "rising tension",
    rupture: "peak drama",
    recovery: "resolving fall",
    afterglow: "quiet aftermath",
  }[p];
  return `${stateIntent}, ${phaseIntent}`;
}

/**
 * Enumerate the safety envelope so tests and external consumers can
 * verify that no directive can breach it.
 * @returns {object}
 */
export function safetyEnvelope() {
  return SAFETY;
}
