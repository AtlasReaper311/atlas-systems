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
import { normalizedStateIdentity } from "./apu-state-identities.js?v=20260726-system-symphony-state-identities-v3";
import {
  ATLAS_APU_STATE_THEMES_BUILD_ID,
  themeForState,
  themeForTransition,
} from "./atlas-apu-state-themes.js?v=20260726-atlas-apu-state-themes-v1";

export const ATLAS_APU_SCORE_PLAN_BUILD_ID = "20260726-atlas-apu-score-plan-v2";
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

const TRANSITION_SIGNATURES = Object.freeze({
  "healthy>warning": Object.freeze({
    id: "pressure-ramp",
    label: "Healthy -> Warning",
    gesture: "duty cycle tightens, noise doubles, counterline enters",
  }),
  "warning>critical": Object.freeze({
    id: "interrupt-drop",
    label: "Warning -> Critical",
    gesture: "one-frame interrupt, bass drops an octave, pad chokes cleanly",
  }),
  "critical>healthy": Object.freeze({
    id: "recovery-bloom",
    label: "Critical -> Recovery",
    gesture: "bright rising arpeggio, noise thins, pulse opens",
  }),
  "critical>warning": Object.freeze({
    id: "pressure-release",
    label: "Critical -> Warning",
    gesture: "impact bus relaxes while diagnostic pulse remains active",
  }),
  "unknown>healthy": Object.freeze({
    id: "carrier-resolve",
    label: "Unknown -> Known",
    gesture: "carrier resolves into the main key and missing beats return",
  }),
  "unknown>warning": Object.freeze({
    id: "carrier-resolve-pressure",
    label: "Unknown -> Known pressure",
    gesture: "carrier resolves, then diagnostic counterline takes the lead",
  }),
  "unknown>critical": Object.freeze({
    id: "carrier-interrupt",
    label: "Unknown -> Critical",
    gesture: "carrier collapses into interrupt noise and octave alarm",
  }),
  "healthy>unknown": Object.freeze({
    id: "melody-dropout",
    label: "Known -> Unknown",
    gesture: "melody loses every third note and memory takes over",
  }),
  "warning>unknown": Object.freeze({
    id: "pressure-dropout",
    label: "Known -> Unknown",
    gesture: "offbeat pressure fragments into carrier gaps",
  }),
  "critical>unknown": Object.freeze({
    id: "alarm-dropout",
    label: "Known -> Unknown",
    gesture: "impact tail decays into unresolved carrier hum",
  }),
});

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
  if (frame.evidenceMode) return String(frame.evidenceMode);
  if (frame.previewEstateDerived) return "preview";
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
  const from = previousState ? stateKey(previousState) : null;
  const to = stateKey(nextState);
  if (!from || from === to) {
    return Object.freeze({
      from,
      to,
      id: "steady-state",
      label: `${SCORE_STATES[to].label} sustain`,
      gesture: "no transition signature; current movement continues",
    });
  }
  return Object.freeze({
    from,
    to,
    ...(TRANSITION_SIGNATURES[`${from}>${to}`] ?? {
      id: "state-crossfade",
      label: `${SCORE_STATES[from].label} -> ${SCORE_STATES[to].label}`,
      gesture: "bounded crossfade into the next dominant grammar",
    }),
  });
}

function rolePlans(frame, language, identity, confidence, density, transition) {
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
      active: transition.id.includes("recovery") || transition.id.includes("resolve"),
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
  const transition = transitionSignatureForStates(options.previousState ?? frame.previousScoreState, dominantState);
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
    roles: rolePlans(frame, theme, identity, confidence, density, transition),
  });
}
