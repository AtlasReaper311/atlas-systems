import { arrangementForPhrase } from "./apu-arranger.js?v=20260726-system-symphony-atlas-chip-laws-v3";
import { ornamentInstructionsForPhrase } from "./apu-performance-conductor.js?v=20260727-apu-performance-conductor-v2";
import { createPerformanceDirector } from "./apu-performance-director-v4.js?v=20260727-apu-performance-director-v4";
import {
  createReplaySongPlan,
  performancePlanForReplayMovement,
  replayFrameForMovement,
} from "./apu-replay-song.js?v=20260727-apu-replay-song-v3";
import { createCompositionDirector } from "./composition-director.js?v=20260720-system-symphony-loop-production-v2";
import {
  APU_SCORE_TRACE_BUILD_ID,
  createScoreTraceEntry,
  deepFreeze,
  scoreTraceDigest,
  serializeScoreTrace,
} from "./apu-score-trace.js?v=20260727-system-symphony-pass-d0-score-trace-v1";

export const APU_SCORE_TRACE_BASELINE_BUILD_ID = "20260727-system-symphony-pass-d0-baselines-v1";
export const PASS_D0_BASE_COMMIT = "fe4cde86f82ad40a7e56a5d77221bfc6cb32a4bd";

const STATE_PROFILES = Object.freeze({
  healthy: Object.freeze({ tension: 0.14, pressure: 0.12, confidence: 0.96, incidents: 0, warnings: 0, failures: 0 }),
  warning: Object.freeze({ tension: 0.52, pressure: 0.58, confidence: 0.82, incidents: 1, warnings: 4, failures: 0 }),
  critical: Object.freeze({ tension: 0.94, pressure: 0.94, confidence: 0.76, incidents: 2, warnings: 3, failures: 2 }),
  unknown: Object.freeze({ tension: 0.28, pressure: 0.32, confidence: 0.28, incidents: 0, warnings: 0, failures: 0 }),
});

function frameForState(state, overrides = {}) {
  const profile = STATE_PROFILES[state] ?? STATE_PROFILES.unknown;
  const unknown = state === "unknown";
  return deepFreeze({
    scoreState: state,
    scoreLabel: state,
    stale: unknown,
    evidenceMode: overrides.evidenceMode ?? "fixture",
    sourceLabel: overrides.sourceLabel ?? "pass-d0-baseline",
    totalComponents: 21,
    measuredComponents: unknown ? 0 : 21,
    knownServiceRatio: unknown ? 0 : profile.confidence,
    activeIncidents: profile.incidents,
    warningCount: profile.warnings,
    failureCount: profile.failures,
    tension: profile.tension,
    overallHealth: state === "healthy" ? 0.96 : state === "warning" ? 0.72 : state === "critical" ? 0.34 : 0,
    modulation: {
      pressure: profile.pressure,
      incidentPressure: profile.incidents ? Math.min(1, profile.incidents * 0.42) : 0,
      errorPressure: state === "critical" ? 0.9 : state === "warning" ? 0.45 : 0.05,
      latencyPressure: state === "critical" ? 0.82 : state === "warning" ? 0.52 : 0.08,
      healthPressure: state === "healthy" ? 0.04 : state === "warning" ? 0.36 : state === "critical" ? 0.82 : 0.5,
      coveragePressure: unknown ? 1 : 1 - profile.confidence,
      deploymentEnergy: overrides.deploymentEnergy ?? 0,
      spectralOpenness: state === "healthy" ? 0.92 : state === "warning" ? 0.62 : state === "critical" ? 0.38 : 0.28,
      staleDecay: unknown ? 1 : 0,
    },
    ...overrides,
  });
}

function repeatFrames(state, phrases, overridesForIndex = null) {
  return Object.freeze(Array.from({ length: phrases }, (_, index) => (
    frameForState(state, overridesForIndex?.(index) ?? {})
  )));
}

function joinedFrames(...groups) {
  return Object.freeze(groups.flat());
}

function replayDefinition(id, incident) {
  const plan = createReplaySongPlan(incident, { seed: `PASS-D0:${id}` });
  const movements = [];
  for (const movement of plan.movements) {
    const phraseCount = Math.max(1, Math.ceil(movement.bars / 2));
    for (let index = 0; index < phraseCount; index += 1) movements.push(movement);
  }
  return Object.freeze({ id, kind: "replay", replayPlan: plan, movements: Object.freeze(movements) });
}

export const PASS_D0_BASELINE_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "explorer-64-bars", frames: repeatFrames("healthy", 32) }),
  Object.freeze({ id: "grid-pressure-64-bars", frames: repeatFrames("warning", 32) }),
  Object.freeze({ id: "boss-protocol-64-bars", frames: repeatFrames("critical", 32) }),
  Object.freeze({ id: "lost-signal-64-bars", frames: repeatFrames("unknown", 32) }),
  Object.freeze({ id: "explorer-to-grid-pressure", frames: joinedFrames(repeatFrames("healthy", 8), repeatFrames("warning", 8)) }),
  Object.freeze({ id: "grid-pressure-to-boss-protocol", frames: joinedFrames(repeatFrames("warning", 8), repeatFrames("critical", 8)) }),
  Object.freeze({ id: "boss-protocol-to-grid-pressure", frames: joinedFrames(repeatFrames("critical", 8), repeatFrames("warning", 8)) }),
  Object.freeze({ id: "boss-protocol-to-explorer-recovery", frames: joinedFrames(repeatFrames("critical", 8), repeatFrames("healthy", 12)) }),
  Object.freeze({ id: "active-to-lost-signal", frames: joinedFrames(repeatFrames("healthy", 8), repeatFrames("unknown", 8)) }),
  Object.freeze({ id: "lost-signal-to-explorer", frames: joinedFrames(repeatFrames("unknown", 8), repeatFrames("healthy", 12)) }),
  Object.freeze({
    id: "deployment-during-explorer",
    frames: repeatFrames("healthy", 16, (index) => index === 6 ? {
      deploymentEnergy: 0.88,
      eventContext: { type: "deployment", identity: "fixture-deploy-001", fromEvidence: true },
    } : {}),
  }),
  Object.freeze({
    id: "incident-during-grid-pressure",
    frames: repeatFrames("warning", 16, (index) => index === 6 ? {
      activeIncidents: 2,
      eventContext: { type: "incident", count: 2, fromEvidence: true },
    } : {}),
  }),
  replayDefinition("replay-incomplete-evidence", {
    id: "pass-d0-incomplete",
    sourceLabel: "fixture",
    stateSpans: [
      { state: "healthy", durationMs: 8000 },
      { state: "warning", durationMs: 16000 },
      { state: "critical", durationMs: 24000 },
    ],
  }),
  replayDefinition("replay-confirmed-recovery", {
    id: "pass-d0-recovery",
    sourceLabel: "fixture",
    stateSpans: [
      { state: "healthy", durationMs: 8000 },
      { state: "warning", durationMs: 16000 },
      { state: "critical", durationMs: 24000 },
      { state: "healthy", durationMs: 16000 },
    ],
  }),
]);

export const PASS_D0_BASELINE_IDS = Object.freeze(PASS_D0_BASELINE_DEFINITIONS.map((item) => item.id));

function definitionById(id) {
  return PASS_D0_BASELINE_DEFINITIONS.find((definition) => definition.id === id) ?? null;
}

function runFrameJourney(definition) {
  const director = createCompositionDirector({ seed: `PASS-D0:${definition.id}:COMPOSITION` });
  const performanceDirector = createPerformanceDirector({ seed: `PASS-D0:${definition.id}:PERFORMANCE` });
  const entries = [];
  let previousState = null;

  definition.frames.forEach((frame, phraseIndex) => {
    director.observe(frame);
    performanceDirector.observe(frame);
    const directorPlan = director.advancePhrase();
    const performancePlan = performanceDirector.advancePhrase();
    const arrangement = arrangementForPhrase(frame, directorPlan, phraseIndex);
    const ornaments = ornamentInstructionsForPhrase(performancePlan);
    const stateTransition = previousState && previousState !== frame.scoreState
      ? { from: previousState, to: frame.scoreState, boundary: "phrase" }
      : null;
    entries.push(createScoreTraceEntry({
      frame,
      directorPlan,
      performancePlan,
      arrangement,
      ornaments,
      transition: stateTransition,
      evidenceSource: {
        mode: frame.evidenceMode,
        sourceLabel: frame.sourceLabel,
        stale: frame.stale,
      },
      eventContext: frame.eventContext ?? null,
    }));
    previousState = frame.scoreState;
  });

  return entries;
}

function runReplayJourney(definition) {
  const director = createCompositionDirector({ seed: `PASS-D0:${definition.id}:COMPOSITION` });
  const performanceDirector = createPerformanceDirector({ seed: `PASS-D0:${definition.id}:PERFORMANCE` });
  const baseFrame = frameForState("healthy", { evidenceMode: "replay", sourceLabel: definition.replayPlan.sourceLabel });
  const entries = [];
  let previousState = null;

  definition.movements.forEach((movement, phraseIndex) => {
    const frame = replayFrameForMovement(baseFrame, movement, definition.replayPlan.sourceLabel);
    director.observe(frame);
    performanceDirector.observe(frame);
    const directorPlan = director.advancePhrase();
    const basePerformancePlan = performanceDirector.advancePhrase();
    const performancePlan = performancePlanForReplayMovement(basePerformancePlan, movement);
    const arrangement = arrangementForPhrase(frame, directorPlan, phraseIndex);
    const ornaments = ornamentInstructionsForPhrase(performancePlan);
    const stateTransition = previousState && previousState !== frame.scoreState
      ? { from: previousState, to: frame.scoreState, boundary: "phrase" }
      : null;
    entries.push(createScoreTraceEntry({
      frame,
      directorPlan,
      performancePlan,
      arrangement,
      ornaments,
      transition: stateTransition,
      replayMovement: movement,
      evidenceSource: {
        mode: "replay",
        sourceLabel: definition.replayPlan.sourceLabel,
        stale: false,
      },
      eventContext: {
        type: "replay-movement",
        incidentId: definition.replayPlan.incidentId,
        evidenceHash: definition.replayPlan.evidenceHash,
        warnings: definition.replayPlan.warnings,
      },
    }));
    previousState = frame.scoreState;
  });

  return entries;
}

export function createBaselineJourney(id) {
  const definition = definitionById(id);
  if (!definition) throw new RangeError(`apu-score-trace-baselines: unknown journey ${id}`);
  const entries = definition.kind === "replay" ? runReplayJourney(definition) : runFrameJourney(definition);
  const serialized = serializeScoreTrace(entries);
  return deepFreeze({
    schemaVersion: 1,
    traceBuildId: APU_SCORE_TRACE_BUILD_ID,
    baselineBuildId: APU_SCORE_TRACE_BASELINE_BUILD_ID,
    baseCommit: PASS_D0_BASE_COMMIT,
    id,
    phraseCount: entries.length,
    barCount: entries.length * 2,
    digest: scoreTraceDigest(entries),
    entries,
    serialized,
  });
}

export function createPassD0Baseline() {
  const journeys = PASS_D0_BASELINE_IDS.map((id) => createBaselineJourney(id));
  return deepFreeze({
    schemaVersion: 1,
    baselineBuildId: APU_SCORE_TRACE_BASELINE_BUILD_ID,
    traceBuildId: APU_SCORE_TRACE_BUILD_ID,
    baseCommit: PASS_D0_BASE_COMMIT,
    generatedFrom: "pure deterministic score authorities",
    journeys,
    digest: scoreTraceDigest(journeys.map((journey) => ({ id: journey.id, digest: journey.digest }))),
  });
}

export function createPassD0BaselineManifest() {
  const baseline = createPassD0Baseline();
  return deepFreeze({
    schemaVersion: baseline.schemaVersion,
    baselineBuildId: baseline.baselineBuildId,
    traceBuildId: baseline.traceBuildId,
    baseCommit: baseline.baseCommit,
    digest: baseline.digest,
    journeys: baseline.journeys.map((journey) => ({
      id: journey.id,
      phraseCount: journey.phraseCount,
      barCount: journey.barCount,
      digest: journey.digest,
      signatures: journey.entries.map((entry) => entry.deterministicSignature),
    })),
  });
}
