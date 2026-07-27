/**
 * Atlas APU Mix Director.
 *
 * Pure-data state and phase mix policy. Pass D1A keeps the locked 100 BPM,
 * sample-free engine and shifts Boss Protocol weight away from constant low
 * frequency energy into the melodic and rhythmic layers.
 */

export const APU_MIX_DIRECTOR_BUILD_ID = "20260727-apu-mix-director-d1a-v4";

export const APU_MIX_LISTENER_POLISH = Object.freeze({
  bassGainMul: 0.82,
  criticalBassGainMul: 0.70,
  criticalPadSubGainMul: 0.68,
  kickBassDuckDepthMul: 1.24,
});

export const APU_MIX_BUSES = Object.freeze([
  "primary",
  "secondary",
  "bass",
  "pad",
  "services",
  "drums",
  "accent",
]);

const STATE_MIX_BASE = Object.freeze({
  healthy: Object.freeze({
    buses: Object.freeze({
      primary: Object.freeze({ gainMul: 1.00, highcutHz: 6800, width: 0.50 }),
      secondary: Object.freeze({ gainMul: 0.92, highcutHz: 5000, width: 0.42 }),
      bass: Object.freeze({ gainMul: 1.00, highcutHz: 1400, width: 0.06 }),
      pad: Object.freeze({ gainMul: 0.86, highcutHz: 4200, width: 0.80 }),
      services: Object.freeze({ gainMul: 1.00, highcutHz: 5200, width: 0.60 }),
      drums: Object.freeze({ gainMul: 1.00, highcutHz: 9000, width: 0.18 }),
      accent: Object.freeze({ gainMul: 0.90, highcutHz: 5200, width: 0.72 }),
    }),
    wobble: Object.freeze({ rateHz: 0.22, depthCents: 4.0 }),
    softener: Object.freeze({ thresholdDb: -8, ratio: 1.4, freqHz: 3400 }),
  }),
  warning: Object.freeze({
    buses: Object.freeze({
      primary: Object.freeze({ gainMul: 1.02, highcutHz: 6200, width: 0.40 }),
      secondary: Object.freeze({ gainMul: 0.95, highcutHz: 4400, width: 0.34 }),
      bass: Object.freeze({ gainMul: 1.02, highcutHz: 1300, width: 0.06 }),
      pad: Object.freeze({ gainMul: 0.80, highcutHz: 3400, width: 0.68 }),
      services: Object.freeze({ gainMul: 0.98, highcutHz: 4600, width: 0.50 }),
      drums: Object.freeze({ gainMul: 1.02, highcutHz: 8000, width: 0.16 }),
      accent: Object.freeze({ gainMul: 0.92, highcutHz: 4600, width: 0.60 }),
    }),
    wobble: Object.freeze({ rateHz: 0.36, depthCents: 6.0 }),
    softener: Object.freeze({ thresholdDb: -7, ratio: 1.5, freqHz: 3200 }),
  }),
  critical: Object.freeze({
    buses: Object.freeze({
      primary: Object.freeze({ gainMul: 1.08, highcutHz: 5400, width: 0.28 }),
      secondary: Object.freeze({ gainMul: 1.05, highcutHz: 3800, width: 0.26 }),
      bass: Object.freeze({ gainMul: 0.90, highcutHz: 1250, width: 0.04 }),
      pad: Object.freeze({ gainMul: 0.55, highcutHz: 2700, width: 0.50 }),
      services: Object.freeze({ gainMul: 0.98, highcutHz: 4000, width: 0.42 }),
      drums: Object.freeze({ gainMul: 1.04, highcutHz: 6800, width: 0.12 }),
      accent: Object.freeze({ gainMul: 1.00, highcutHz: 4000, width: 0.48 }),
    }),
    wobble: Object.freeze({ rateHz: 0.48, depthCents: 8.0 }),
    softener: Object.freeze({ thresholdDb: -5, ratio: 1.8, freqHz: 3000 }),
  }),
  unknown: Object.freeze({
    buses: Object.freeze({
      primary: Object.freeze({ gainMul: 0.94, highcutHz: 4400, width: 0.58 }),
      secondary: Object.freeze({ gainMul: 0.90, highcutHz: 3600, width: 0.54 }),
      bass: Object.freeze({ gainMul: 0.78, highcutHz: 1050, width: 0.08 }),
      pad: Object.freeze({ gainMul: 0.64, highcutHz: 2500, width: 0.84 }),
      services: Object.freeze({ gainMul: 0.92, highcutHz: 4000, width: 0.68 }),
      drums: Object.freeze({ gainMul: 0.78, highcutHz: 6400, width: 0.22 }),
      accent: Object.freeze({ gainMul: 0.84, highcutHz: 3900, width: 0.78 }),
    }),
    wobble: Object.freeze({ rateHz: 0.14, depthCents: 5.0 }),
    softener: Object.freeze({ thresholdDb: -10, ratio: 1.3, freqHz: 3600 }),
  }),
});

const PHASE_MIX_MOD = Object.freeze({
  intro: Object.freeze({ gainMul: 0.82, widthMul: 1.15, wobbleDepthMul: 1.20, duckDepthMul: 0.75 }),
  groove: Object.freeze({ gainMul: 1.00, widthMul: 1.00, wobbleDepthMul: 1.00, duckDepthMul: 1.00 }),
  pressure: Object.freeze({ gainMul: 1.04, widthMul: 0.90, wobbleDepthMul: 0.80, duckDepthMul: 1.15 }),
  rupture: Object.freeze({ gainMul: 1.08, widthMul: 0.75, wobbleDepthMul: 0.55, duckDepthMul: 1.35 }),
  recovery: Object.freeze({ gainMul: 0.94, widthMul: 1.05, wobbleDepthMul: 1.05, duckDepthMul: 0.85 }),
  afterglow: Object.freeze({ gainMul: 0.75, widthMul: 1.20, wobbleDepthMul: 1.25, duckDepthMul: 0.65 }),
});

const DUCKING_RULES = Object.freeze([
  Object.freeze({ source: "kick", target: "bass", baseDepthDb: 3.2, releaseMs: 120 }),
  Object.freeze({ source: "kick", target: "pad", baseDepthDb: 1.6, releaseMs: 200 }),
  Object.freeze({ source: "primary", target: "pad", baseDepthDb: 2.2, releaseMs: 90 }),
  Object.freeze({ source: "primary", target: "services", baseDepthDb: 1.2, releaseMs: 70 }),
  Object.freeze({ source: "services", target: "accent", baseDepthDb: 1.0, releaseMs: 60 }),
  Object.freeze({ source: "drums", target: "accent", baseDepthDb: 1.4, releaseMs: 80 }),
]);

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

const safeState = (state) => STATE_MIX_BASE[state] ? state : "unknown";
const safePhase = (phase) => PHASE_MIX_MOD[phase] ? phase : "groove";

export function mixDirectiveFor({ state = "healthy", phase = "groove" } = {}) {
  const stateKey = safeState(state);
  const phaseKey = safePhase(phase);
  const stateBase = STATE_MIX_BASE[stateKey];
  const phaseMod = PHASE_MIX_MOD[phaseKey];
  const buses = {};

  for (const busName of APU_MIX_BUSES) {
    const base = stateBase.buses[busName];
    const globalBass = busName === "bass" ? APU_MIX_LISTENER_POLISH.bassGainMul : 1;
    const bossBass = busName === "bass" && stateKey === "critical"
      ? APU_MIX_LISTENER_POLISH.criticalBassGainMul
      : 1;
    const bossPadSub = busName === "pad" && stateKey === "critical"
      ? APU_MIX_LISTENER_POLISH.criticalPadSubGainMul
      : 1;
    buses[busName] = Object.freeze({
      gainMul: clamp(base.gainMul * phaseMod.gainMul * globalBass * bossBass * bossPadSub, SAFETY.gainMulMin, SAFETY.gainMulMax),
      highcutHz: clamp(base.highcutHz, SAFETY.highcutMinHz, SAFETY.highcutMaxHz),
      width: clamp(base.width * phaseMod.widthMul, SAFETY.widthMin, SAFETY.widthMax),
    });
  }

  const ducking = DUCKING_RULES.map((rule) => {
    const listenerDepthMul = rule.source === "kick" && rule.target === "bass"
      ? APU_MIX_LISTENER_POLISH.kickBassDuckDepthMul
      : 1;
    return Object.freeze({
      source: rule.source,
      target: rule.target,
      depthDb: clamp(rule.baseDepthDb * phaseMod.duckDepthMul * listenerDepthMul, SAFETY.duckDepthMinDb, SAFETY.duckDepthMaxDb),
      releaseMs: clamp(rule.releaseMs, SAFETY.duckReleaseMinMs, SAFETY.duckReleaseMaxMs),
    });
  });

  const chipWobble = Object.freeze({
    rateHz: clamp(stateBase.wobble.rateHz, SAFETY.wobbleRateMinHz, SAFETY.wobbleRateMaxHz),
    depthCents: clamp(stateBase.wobble.depthCents * phaseMod.wobbleDepthMul, SAFETY.wobbleDepthMinCents, SAFETY.wobbleDepthMaxCents),
    target: "masterFilter",
  });

  const transientSoftener = Object.freeze({
    thresholdDb: clamp(stateBase.softener.thresholdDb, SAFETY.softenerThresholdMinDb, SAFETY.softenerThresholdMaxDb),
    ratio: clamp(stateBase.softener.ratio, SAFETY.softenerRatioMin, SAFETY.softenerRatioMax),
    freqHz: clamp(stateBase.softener.freqHz, SAFETY.softenerFreqMinHz, SAFETY.softenerFreqMaxHz),
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

export function describeIntent(state, phase) {
  const stateIntent = {
    healthy: "open and balanced",
    warning: "narrowed and edgy",
    critical: "upper-weighted, rhythmic and dark",
    unknown: "slow-moving and distant",
  }[safeState(state)];
  const phaseIntent = {
    intro: "sparse opening",
    groove: "settled body",
    pressure: "rising tension",
    rupture: "peak drama",
    recovery: "resolving fall",
    afterglow: "quiet aftermath",
  }[safePhase(phase)];
  return `${stateIntent}, ${phaseIntent}`;
}

export function safetyEnvelope() {
  return SAFETY;
}
