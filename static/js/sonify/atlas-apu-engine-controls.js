/**
 * Atlas APU engine guard and control mapping.
 *
 * This pure module is the Phase 3 boundary between the auditable score plan and
 * the browser synthesis engine. Invalid or missing score plans fail back to the
 * existing frame/arrangement controls.
 */

import { clamp } from "./mapping.js?v=20260720-system-symphony-loop-production-v2";
import {
  ATLAS_APU_CHIP_ID,
  ATLAS_APU_GRID,
  ATLAS_APU_ROLE_KEYS,
  ATLAS_APU_SCORE_PLAN_BUILD_ID,
} from "./atlas-apu-score-plan.js?v=20260726-atlas-apu-score-plan-v3";
import { normalizedStateIdentity } from "./apu-state-identities.js?v=20260728-system-symphony-state-identities-v7";
import { themeForState } from "./atlas-apu-state-themes.js?v=20260726-atlas-apu-state-themes-v1";

export const ATLAS_APU_ENGINE_CONTROLS_BUILD_ID = "20260728-atlas-apu-engine-controls-v5";

const STATE_KEYS = Object.freeze(["healthy", "warning", "critical", "unknown"]);
const BUS_KEYS = Object.freeze(["primary", "secondary", "services", "bass", "drums", "pad", "accent"]);

const STATE_CHIP_COLOR = Object.freeze({
  healthy: Object.freeze({ bits: 14, wet: 0.035, hum: 0 }),
  warning: Object.freeze({ bits: 9, wet: 0.12, hum: 0.005 }),
  critical: Object.freeze({ bits: 7, wet: 0.16, hum: 0.01 }),
  unknown: Object.freeze({ bits: 11, wet: 0.075, hum: 0.048 }),
});

function round(value, places = 4) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function hasAllRoles(plan = {}) {
  const roles = plan.roles && typeof plan.roles === "object" ? plan.roles : {};
  return ATLAS_APU_ROLE_KEYS.every((role) => roles[role] && typeof roles[role] === "object");
}

function normalizedThemeWeights(plan = {}) {
  const raw = Object.fromEntries(STATE_KEYS.map((state) => [
    state,
    clamp(Number(plan.stateVector?.[state]) || 0, 0, 1),
  ]));
  const total = STATE_KEYS.reduce((sum, state) => sum + raw[state], 0);
  if (!(total > 0)) {
    const dominant = STATE_KEYS.includes(plan.dominantState) ? plan.dominantState : "unknown";
    return Object.freeze(Object.fromEntries(STATE_KEYS.map((state) => [state, state === dominant ? 1 : 0])));
  }
  return Object.freeze(Object.fromEntries(STATE_KEYS.map((state) => [state, round(raw[state] / total)])));
}

function blendProfiles(profiles, weights, integerKeys = []) {
  const integers = new Set(integerKeys);
  const keys = Object.keys(profiles.healthy);
  return Object.freeze(Object.fromEntries(keys.map((key) => {
    const value = STATE_KEYS.reduce(
      (sum, state) => sum + Number(profiles[state][key] ?? 0) * weights[state],
      0,
    );
    return [key, integers.has(key) ? Math.round(value) : round(value)];
  })));
}

export function scorePlanGuardForFrame(frame = {}) {
  const plan = frame?.scorePlan;
  const reasons = [];
  if (!plan || typeof plan !== "object") reasons.push("missing score plan");
  if (plan?.buildId !== ATLAS_APU_SCORE_PLAN_BUILD_ID) reasons.push("unsupported score plan build");
  if (plan?.chip !== ATLAS_APU_CHIP_ID) reasons.push("unexpected chip id");
  if (plan?.sampleFreeTarget !== true) reasons.push("sample-free target is not declared");
  if (plan?.tempo?.grid !== ATLAS_APU_GRID) reasons.push("unsupported timing grid");
  if (!plan?.theme || plan.theme.id !== plan?.dominantState) reasons.push("theme does not match dominant state");
  if (!hasAllRoles(plan)) reasons.push("missing APU role lanes");

  return Object.freeze({
    buildId: ATLAS_APU_ENGINE_CONTROLS_BUILD_ID,
    active: reasons.length === 0,
    mode: reasons.length === 0 ? "score-plan" : "legacy-frame",
    sampleFree: reasons.length === 0 && plan?.sampleFreeTarget === true,
    reasons: Object.freeze(reasons),
    scorePlanBuildId: plan?.buildId ?? null,
    movement: plan?.movement ?? null,
    chip: plan?.chip ?? null,
  });
}

function busProfileForState(plan, state) {
  const range = themeForState(state).range ?? {};
  const beauty = clamp(Number(range.beauty) || 0, 0, 1);
  const urgency = clamp(Number(range.urgency) || 0, 0, 1);
  const confidence = clamp(Number(plan.confidence) || 0, 0, 1);
  const recoveryActive = plan.roles?.recovery?.active === true;

  if (state === "critical") {
    return Object.freeze({
      primary: 0.88,
      secondary: 0.78,
      services: 0.68,
      bass: 1.04,
      drums: 1.03,
      pad: 0.36,
      accent: recoveryActive ? 0.96 : 0.82,
    });
  }

  if (state === "warning") {
    return Object.freeze({
      primary: 0.92,
      secondary: 1.02,
      services: 0.98,
      bass: 0.98,
      drums: 1.02,
      pad: 0.7,
      accent: recoveryActive ? 1.05 : 0.9,
    });
  }

  if (state === "unknown") {
    return Object.freeze({
      primary: 0.64,
      secondary: 0.52,
      services: 0.5,
      bass: 0.62,
      drums: 0.28,
      pad: 1.18,
      accent: 0.72,
    });
  }

  return Object.freeze({
    primary: round(0.96 + beauty * 0.08),
    secondary: round(0.88 + confidence * 0.12),
    services: round(0.86 + confidence * 0.12),
    bass: 0.96,
    drums: round(0.82 + urgency * 0.08),
    pad: round(0.94 + beauty * 0.08),
    accent: recoveryActive ? 1.16 : 0.86,
  });
}

function busScalesFor(plan = {}, weights = normalizedThemeWeights(plan)) {
  const profiles = Object.fromEntries(STATE_KEYS.map((state) => [state, busProfileForState(plan, state)]));
  const blended = blendProfiles(profiles, weights);
  return Object.freeze(Object.fromEntries(BUS_KEYS.map((key) => [key, blended[key]])));
}

function timbreProfileForState(plan, state) {
  const range = themeForState(state).range ?? {};
  const beauty = clamp(Number(range.beauty) || 0, 0, 1);
  const urgency = clamp(Number(range.urgency) || 0, 0, 1);
  const confidence = clamp(Number(plan.confidence) || 0, 0, 1);
  const chipColor = STATE_CHIP_COLOR[state] ?? STATE_CHIP_COLOR.unknown;
  const noiseDensity = clamp(Number(plan.roles?.signal?.density) || 0, 0, 1);
  const thermalPressure = clamp(Number(plan.roles?.thermal?.pressure) || 0, 0, 1);
  const identity = normalizedStateIdentity(state);

  return Object.freeze({
    chipBits: chipColor.bits,
    chipWet: clamp(chipColor.wet + urgency * 0.012, 0, 0.175),
    masterFilterScale: clamp(0.72 + beauty * 0.38 - thermalPressure * 0.08, 0.42, 1.18),
    masterHighpassScale: clamp(0.82 + urgency * 0.42, 0.7, 1.32),
    leadFilterScale: clamp(0.82 + beauty * 0.28 + urgency * 0.08, 0.58, 1.18),
    counterFilterScale: clamp(0.72 + urgency * 0.32 + confidence * 0.1, 0.42, 1.16),
    padFilterScale: clamp(0.7 + beauty * 0.32 - urgency * 0.16, 0.42, 1.12),
    leadFilterQ: clamp(0.72 + urgency * 1.05, 0.7, 1.95),
    counterFilterQ: clamp(0.78 + urgency * 1.2 + (state === "warning" ? 0.28 : 0), 0.75, 2.25),
    delayGain: clamp(0.045 + beauty * 0.06 + (1 - confidence) * 0.04, 0.03, 0.17),
    reverbGain: clamp(0.055 + beauty * 0.09 + (state === "unknown" ? 0.08 : 0), 0.04, 0.22),
    hatFilterHz: clamp(3000 + noiseDensity * 3900 + urgency * 900, 2600, 7600),
    noiseAccentFilterHz: clamp(820 + urgency * 1050 + noiseDensity * 520, 650, 2600),
    telemetryHumGain: clamp(chipColor.hum + (1 - confidence) * 0.018, 0, 0.07),
    primaryDutyCycle: clamp(Number(identity.primaryDutyCycle) || 0.5, 0.08, 0.75),
    counterDutyCycle: clamp(Number(plan.roles?.contention?.alerts) > 0 ? 0.125 : 0.25, 0.08, 0.75),
  });
}

function timbreFor(plan = {}, weights = normalizedThemeWeights(plan)) {
  const profiles = Object.fromEntries(STATE_KEYS.map((state) => [state, timbreProfileForState(plan, state)]));
  return blendProfiles(profiles, weights, ["chipBits", "hatFilterHz", "noiseAccentFilterHz"]);
}

export function engineControlsForFrame(frame = {}) {
  const guard = scorePlanGuardForFrame(frame);
  if (!guard.active) {
    return Object.freeze({
      buildId: ATLAS_APU_ENGINE_CONTROLS_BUILD_ID,
      guard,
      movement: null,
      sampleFree: false,
      themeWeights: null,
      buses: null,
      timbre: null,
    });
  }
  const plan = frame.scorePlan;
  const themeWeights = normalizedThemeWeights(plan);
  return Object.freeze({
    buildId: ATLAS_APU_ENGINE_CONTROLS_BUILD_ID,
    guard,
    movement: plan.movement,
    sampleFree: true,
    themeWeights,
    buses: busScalesFor(plan, themeWeights),
    timbre: timbreFor(plan, themeWeights),
  });
}
