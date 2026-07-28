/**
 * Atlas APU deterministic score-plan contract.
 *
 * This pure module turns a bounded System SYMPHONY frame into the auditable
 * "cartridge" metadata that future UI panels and replay links can display.
 * It does not schedule audio or alter telemetry truth.
 */

import {
  LOCKED_TRANSPORT_BPM,
  SCORE_STATES,
  clamp,
  stableHash,
} from "./mapping.js?v=20260720-system-symphony-loop-production-v2";
import { normalizedStateIdentity } from "./apu-state-identities.js?v=20260728-system-symphony-state-identities-v7";
import {
  ATLAS_APU_STATE_THEMES_BUILD_ID,
  themeForState,
  themeForTransition,
} from "./atlas-apu-state-themes.js?v=20260726-atlas-apu-state-themes-v1";
import {
  APU_TRANSITION_LANGUAGE_BUILD_ID,
  transitionForStates,
} from "./apu-transition-language.js?v=20260728-system-symphony-transition-language-v1";

export const ATLAS_APU_SCORE_PLAN_BUILD_ID = "20260726-atlas-apu-score-plan-v3";
export const ATLAS_APU_CHIP_ID = "ATLAS-APU-01";
export const ATLAS_APU_GRID = "16-step";

export const ATLAS_APU_ROLE_KEYS = Object.freeze([
  "clock",
  "pulse",
  "memory",
  "thermal",
  "signal",
  "contention",
  "recovery",
]);

function round(value, places = 4) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function stateKey(value) {
  return SCORE_STATES[value] ? value : "unknown";
}

function sourceMode(frame = {}, options = {}) {
  if (options.sourceMode) return String(options.sourceMode);
  if (frame.replay === true) return "replay";
  if (frame.evidenceMode === "preview") return "fixture";
  if (frame.evidenceMode) return String(frame.evidenceMode);
  if (frame.previewEstateDerived) return "fixture";
  return "live";
}

function stateWeights(frame = {}) {
  const vector = frame.stateVector && typeof frame.stateVector === "object"
    ? frame.stateVector
    : {};
  const raw = {
    healthy: Number(vector.healthy),
    warning: Number(vector.warning),
    critical: Number(vector.critical),
    unknown: Number(vector.unknown),
  };
  if (Object.values(raw).every(Number.isFinite)) {
    return Object.freeze(Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, round(clamp(value, 0, 1))]),
    ));
  }
  const dominant = stateKey(frame.scoreState);
  return Object.freeze({
    healthy: dominant === "healthy" ? 1 : 0,
    warning: dominant === "warning" ? 1 : 0,
    critical: dominant === "critical" ? 1 : 0,
    unknown: dominant === "unknown" ? 1 : 0,
  });
}

function evidenceConfidence(frame = {}) {
  if (frame.stale) return 0;
  const total = Math.max(0, Number(frame.totalComponents) || 0);
  const measured = Math.max(0, Number(frame.measuredComponents) || 0);
  const knownRatio = Number.isFinite(Number(frame.knownServiceRatio))
    ? clamp(Number(frame.knownServiceRatio), 0, 1)
    : total > 0
      ? clamp(measured / total, 0, 1)
      : 0;
  const unknownPressure = total > 0
    ? clamp(((Number(frame.unknownCount) || 0) + (Number(frame.unmeasuredCount) || 0)) / total, 0, 1)
    : 1;
  return round(clamp(knownRatio * (1 - unknownPressure * 0.28), 0, 1));
}

function affectedServiceRatio(frame = {}) {
  const total = Math.max(1, Number(frame.totalComponents) || 0);
  const affected = (Number(frame.warningCount) || 0)
    + (Number(frame.failureCount) || 0)
    + (Number(frame.unknownCount) || 0)
    + (Number(frame.unmeasuredCount) || 0) * 0.5;
  return clamp(affected / total, 0, 1);
}

function frameSeed(frame = {}, weights, source) {
  const sourceText = [
    frame.timestamp ?? frame.lastSuccessfulAt ?? "no-time",
    frame.scoreState ?? "unknown",
    source,
    frame.totalComponents ?? 0,
    frame.measuredComponents ?? 0,
    frame.warningCount ?? 0,
    frame.failureCount ?? 0,
    frame.unknownCount ?? 0,
    frame.unmeasuredCount ?? 0,
    weights.healthy,
    weights.warning,
    weights.critical,
    weights.unknown,
  ].join("|");
  return `APU-${stableHash(sourceText).toString(16).padStart(8, "0").toUpperCase()}`;
}

export function transitionSignatureForStates(previousState, nextState) {
  const plan = transitionForStates(previousState, nextState);
  return Object.freeze({
    from: plan.from,
    to: plan.to,
    id: plan.id,
    label: plan.label,
    gesture: plan.id === "steady-state"
      ? "no transition signature; current movement continues"
      : plan.gesture,
  });
}

function transitionHandoverForStates(previousState, nextState) {
  const plan = transitionForStates(previousState, nextState);
  return Object.freeze({
    buildId: APU_TRANSITION_LANGUAGE_BUILD_ID,
    key: plan.key,
    phase: plan.phase,
    durationBars: plan.durationBars,
    durationSteps: plan.durationSteps,
    mixPolicy: plan.mixPolicy,
    outgoingTail: plan.outgoingTail,
    harmonicAuthority: plan.harmonicAuthority,
    accent: plan.accent,
  });
}

function rolePlans(frame, language, identity, confidence, density, transition, handover) {
  const warnings = Number(frame.warningCount) || 0;
  const failures = Number(frame.failureCount) || 0;
  const unknown = Number(frame.unknownCount) || 0;
  const unmeasured = Number(frame.unmeasuredCount) || 0;
  const incidents = Number(frame.activeIncidents) || 0;
  const latencyPressure = clamp(Number(frame.modulation?.latencyPressure) || 0, 0, 1);
  const dependencyAlerts = (Array.isArray(frame.voices) ? frame.voices : []).filter((voice) => (
    Array.isArray(voice.depends_on)
    && voice.depends_on.length > 0
    && (voice.status === "degraded" || voice.status === "down")
  )).length;

  return Object.freeze({
    clock: Object.freeze({
      role: "Clock",
      lane: "strict pulse ostinato",
      grid: ATLAS_APU_GRID,
      bpm: LOCKED_TRANSPORT_BPM,
      state: frame.stale ? "carrier-clock" : "steady",
    }),
    pulse: Object.freeze({
      role: "Pulse",
      lane: "melodic lead",
      motif: language.motif.name,
      dutyCycle: identity.primaryDutyCycle,
      gate: identity.leadGate,
    }),
    memory: Object.freeze({
      role: "Memory",
      lane: "pad/chord arps",
      evidence: unknown + unmeasured,
      state: frame.stale ? "stale takeover" : unknown + unmeasured > 0 ? "partial carrier" : "historical support",
    }),
    thermal: Object.freeze({
      role: "Thermal",
      lane: "triangle bass",
      pattern: language.bassPattern,
      pressure: round(latencyPressure),
    }),
    signal: Object.freeze({
      role: "Signal",
      lane: "noise percussion",
      pattern: language.noisePattern,
      density: round(clamp(density * 0.58 + warnings * 0.04 + failures * 0.1 + incidents * 0.08, 0, 1)),
    }),
    contention: Object.freeze({
      role: "Contention",
      lane: "detuned counter-pulse",
      alerts: dependencyAlerts,
      counterline: language.counterline,
    }),
    recovery: Object.freeze({
      role: "Recovery",
      lane: "bright accent voice",
      active: handover.phase === "recovery" || transition.id.includes("resolve"),
      confidence,
    }),
  });
}

export function buildAtlasApuScorePlan(frame = {}, options = {}) {
  const dominantState = stateKey(frame.scoreState);
  const score = SCORE_STATES[dominantState];
  const identity = normalizedStateIdentity(dominantState);
  const theme = themeForState(dominantState);
  const source = sourceMode(frame, options);
  const weights = stateWeights(frame);
  const seed = frameSeed(frame, weights, source);
  const confidence = evidenceConfidence(frame);
  const affectedRatio = affectedServiceRatio(frame);
  const density = round(clamp((Number(frame.density) || score.density) + theme.densityBias + affectedRatio * 0.22, 0.08, 1));
  const previousState = options.previousState ?? frame.previousScoreState;
  const transition = transitionSignatureForStates(previousState, dominantState);
  const transitionHandover = transitionHandoverForStates(previousState, dominantState);
  const transitionTheme = themeForTransition(transition, dominantState);
  const register = affectedRatio > 0.34 && dominantState !== "healthy"
    ? `${theme.register}, compressed by ${Math.round(affectedRatio * 100)}% affected services`
    : theme.register;
  const mastering = confidence < 0.5
    ? `${theme.mastering}, narrowed confidence`
    : theme.mastering;

  return Object.freeze({
    buildId: ATLAS_APU_SCORE_PLAN_BUILD_ID,
    themesBuildId: ATLAS_APU_STATE_THEMES_BUILD_ID,
    transitionLanguageBuildId: APU_TRANSITION_LANGUAGE_BUILD_ID,
    chip: ATLAS_APU_CHIP_ID,
    engine: "Atlas APU",
    sampleFreeTarget: true,
    frameId: frame.timestamp ?? frame.lastSuccessfulAt ?? seed,
    timestamp: frame.timestamp ?? null,
    source,
    seed,
    dominantState,
    dominantLabel: score.label,
    movement: theme.movement,
    theme,
    transitionTheme,
    transitionHandover,
    stateVector: weights,
    confidence,
    tempo: Object.freeze({
      bpm: LOCKED_TRANSPORT_BPM,
      grid: ATLAS_APU_GRID,
      lockedTransport: true,
    }),
    motif: Object.freeze({
      name: theme.motif.name,
      degrees: Object.freeze([...theme.motif.degrees]),
      dutyCycle: identity.primaryDutyCycle,
      gate: identity.leadGate,
    }),
    bassPattern: theme.bassPattern,
    noisePattern: theme.noisePattern,
    counterline: theme.counterline,
    transition,
    density,
    register,
    mastering,
    evidence: Object.freeze({
      totalComponents: Number(frame.totalComponents) || 0,
      measuredComponents: Number(frame.measuredComponents) || 0,
      warningCount: Number(frame.warningCount) || 0,
      failureCount: Number(frame.failureCount) || 0,
      unknownCount: Number(frame.unknownCount) || 0,
      unmeasuredCount: Number(frame.unmeasuredCount) || 0,
      activeIncidents: Number(frame.activeIncidents) || 0,
      stale: Boolean(frame.stale),
      reason: frame.dominantStateReason ?? null,
    }),
    roles: rolePlans(frame, theme, identity, confidence, density, transition, transitionHandover),
  });
}
