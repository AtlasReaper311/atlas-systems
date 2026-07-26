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
} from "./atlas-apu-score-plan.js?v=20260726-atlas-apu-score-plan-v2";

export const ATLAS_APU_ENGINE_CONTROLS_BUILD_ID = "20260726-atlas-apu-engine-controls-v1";

const STATE_CHIP_COLOR = Object.freeze({
  healthy: Object.freeze({ bits: 12, wet: 0.07, hum: 0 }),
  warning: Object.freeze({ bits: 10, wet: 0.13, hum: 0.006 }),
  critical: Object.freeze({ bits: 8, wet: 0.2, hum: 0.012 }),
  unknown: Object.freeze({ bits: 9, wet: 0.11, hum: 0.052 }),
});

function round(value, places = 4) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function hasAllRoles(plan = {}) {
  const roles = plan.roles && typeof plan.roles === "object" ? plan.roles : {};
  return ATLAS_APU_ROLE_KEYS.every((role) => roles[role] && typeof roles[role] === "object");
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

function busScalesFor(plan = {}) {
  const state = plan.dominantState;
  const range = plan.theme?.range ?? {};
  const beauty = clamp(Number(range.beauty) || 0, 0, 1);
  const urgency = clamp(Number(range.urgency) || 0, 0, 1);
  const confidence = clamp(Number(plan.confidence) || 0, 0, 1);
  const recoveryActive = plan.roles?.recovery?.active === true;

  if (state === "critical") {
    return Object.freeze({
      primary: 0.92,
      secondary: 0.92,
      services: 0.78,
      bass: 1.12,
      drums: 1.14,
      pad: 0.42,
      accent: recoveryActive ? 1.24 : 1.14,
    });
  }

  if (state === "warning") {
    return Object.freeze({
      primary: 0.95,
      secondary: 1.12,
      services: 1.08,
      bass: 1.04,
      drums: 1.08,
      pad: 0.74,
      accent: recoveryActive ? 1.18 : 1,
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

function timbreFor(plan = {}) {
  const state = plan.dominantState;
  const range = plan.theme?.range ?? {};
  const beauty = clamp(Number(range.beauty) || 0, 0, 1);
  const urgency = clamp(Number(range.urgency) || 0, 0, 1);
  const confidence = clamp(Number(plan.confidence) || 0, 0, 1);
  const chipColor = STATE_CHIP_COLOR[state] ?? STATE_CHIP_COLOR.unknown;
  const noiseDensity = clamp(Number(plan.roles?.signal?.density) || 0, 0, 1);
  const thermalPressure = clamp(Number(plan.roles?.thermal?.pressure) || 0, 0, 1);

  return Object.freeze({
    chipBits: chipColor.bits,
    chipWet: round(chipColor.wet + urgency * 0.018),
    masterFilterScale: round(clamp(0.72 + beauty * 0.38 - thermalPressure * 0.08, 0.42, 1.18)),
    masterHighpassScale: round(clamp(0.82 + urgency * 0.42, 0.7, 1.32)),
    leadFilterScale: round(clamp(0.82 + beauty * 0.28 + urgency * 0.08, 0.58, 1.18)),
    counterFilterScale: round(clamp(0.72 + urgency * 0.32 + confidence * 0.1, 0.42, 1.16)),
    padFilterScale: round(clamp(0.7 + beauty * 0.32 - urgency * 0.16, 0.42, 1.12)),
    delayGain: round(clamp(0.045 + beauty * 0.06 + (1 - confidence) * 0.04, 0.03, 0.17)),
    reverbGain: round(clamp(0.055 + beauty * 0.09 + (state === "unknown" ? 0.08 : 0), 0.04, 0.22)),
    hatFilterHz: Math.round(clamp(3000 + noiseDensity * 3900 + urgency * 900, 2600, 7600)),
    telemetryHumGain: round(clamp(chipColor.hum + (1 - confidence) * 0.018, 0, 0.07)),
    primaryDutyCycle: clamp(Number(plan.motif?.dutyCycle) || 0.5, 0.08, 0.75),
    counterDutyCycle: clamp(Number(plan.roles?.contention?.alerts) > 0 ? 0.125 : 0.25, 0.08, 0.75),
  });
}

export function engineControlsForFrame(frame = {}) {
  const guard = scorePlanGuardForFrame(frame);
  if (!guard.active) {
    return Object.freeze({
      buildId: ATLAS_APU_ENGINE_CONTROLS_BUILD_ID,
      guard,
      movement: null,
      sampleFree: false,
      buses: null,
      timbre: null,
    });
  }
  const plan = frame.scorePlan;
  return Object.freeze({
    buildId: ATLAS_APU_ENGINE_CONTROLS_BUILD_ID,
    guard,
    movement: plan.movement,
    sampleFree: true,
    buses: busScalesFor(plan),
    timbre: timbreFor(plan),
  });
}
