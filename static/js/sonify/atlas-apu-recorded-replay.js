/**
 * Public-safe historical System SYMPHONY replay contract.
 *
 * The JSON artifact is a sealed presentation record, not a telemetry frame.
 * This module is deliberately pure: callers provide the artifact and receive
 * validation, text, and deterministic APU interpretation state. It never
 * fetches Blackbox or any other endpoint.
 */

import { buildAtlasApuScorePlan } from "./atlas-apu-score-plan.js?v=20260726-atlas-apu-score-plan-v3";

export const RECORDED_REPLAY_SCHEMA = "atlas-system-symphony/recorded-replay/v1";
export const RECORDED_REPLAY_EVIDENCE_MODE = "recorded-replay";
export const RECORDED_REPLAY_ID = "recorded-inc-20260705-234935";
export const RECORDED_REPLAY_PRESENTATION_STEP_MS = 2400;
export const RECORDED_REPLAY_EVENT_CLASSES = Object.freeze([
  "adjacent-public-event",
  "validation-failure-reported",
  "blackbox-capture",
  "validation-publication-success-reported",
]);

const TOP_LEVEL_KEYS = Object.freeze([
  "schema",
  "evidenceMode",
  "replayId",
  "incident",
  "source",
  "time",
  "events",
  "claims",
  "metrics",
  "presentation",
]);
const EVENT_KEYS = Object.freeze([
  "timestamp",
  "class",
  "label",
  "text",
  "causalRelation",
]);
const EXPECTED_EVENT_ORDER = Object.freeze([
  {
    timestamp: "2026-07-05T23:48:50.649Z",
    class: "adjacent-public-event",
    label: "Public push observed",
    causalRelation: "not-established",
  },
  {
    timestamp: "2026-07-05T23:49:08.770Z",
    class: "validation-failure-reported",
    label: "HTML or link validation failure reported",
    causalRelation: "observed-reported",
  },
  {
    timestamp: "2026-07-05T23:49:35.670Z",
    class: "blackbox-capture",
    label: "Blackbox captured the incident",
    causalRelation: "observed",
  },
  {
    timestamp: "2026-07-05T23:51:03.675Z",
    class: "validation-publication-success-reported",
    label: "Validation and publication success reported",
    causalRelation: "follow-up-success-observed-not-live-verified",
  },
]);
const EVENT_SCORE_STATES = Object.freeze({
  "adjacent-public-event": "unknown",
  "validation-failure-reported": "critical",
  "blackbox-capture": "unknown",
  "validation-publication-success-reported": "warning",
});
const EVENT_APU_ROLES = Object.freeze({
  "adjacent-public-event": "context-cue",
  "validation-failure-reported": "failure-vocabulary",
  "blackbox-capture": "record-marker",
  "validation-publication-success-reported": "follow-up-success",
});
const FORBIDDEN_PUBLIC_TERMS = Object.freeze([
  /gpu/i,
  /cpu/i,
  /vram/i,
  /ollama/i,
  /localhost/i,
  /127\.0\.0\.1/i,
  /private endpoint/i,
  /secret/i,
  /token/i,
  /password/i,
  /request count/i,
  /error rate/i,
  /latency/i,
  /traffic/i,
  /blast radius/i,
  /severity/i,
  /ip address/i,
  /windows path/i,
  /wsl/i,
  /specular-core/i,
  /runtime/i,
  /model/i,
  /sha(?:256)?/i,
  /hash/i,
  /\\/,
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, path, errors) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.join("|") !== wanted.join("|")) {
    errors.push(`${path} has unexpected or missing fields`);
    return false;
  }
  return true;
}

function validUtcTimestamp(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function scanPublicStrings(value, path, errors) {
  if (typeof value === "string") {
    for (const pattern of FORBIDDEN_PUBLIC_TERMS) {
      if (pattern.test(value)) {
        errors.push(`${path} contains a forbidden private or telemetry term`);
        break;
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanPublicStrings(entry, `${path}[${index}]`, errors));
    return;
  }
  if (isRecord(value)) {
    Object.entries(value).forEach(([key, entry]) => {
      scanPublicStrings(key, `${path}.${key}`, errors);
      scanPublicStrings(entry, `${path}.${key}`, errors);
    });
  }
}

function pushExpected(errors, actual, expected, path) {
  if (actual !== expected) errors.push(`${path} must be ${expected}`);
}

function validateEvent(event, index, errors) {
  const path = `events[${index}]`;
  if (!exactKeys(event, EVENT_KEYS, path, errors)) return;
  const expected = EXPECTED_EVENT_ORDER[index];
  if (!expected) {
    errors.push(`${path} is outside the approved four-event sequence`);
    return;
  }
  if (!validUtcTimestamp(event.timestamp)) errors.push(`${path}.timestamp must be an absolute UTC timestamp`);
  pushExpected(errors, event.timestamp, expected.timestamp, `${path}.timestamp`);
  pushExpected(errors, event.class, expected.class, `${path}.class`);
  pushExpected(errors, event.label, expected.label, `${path}.label`);
  pushExpected(errors, event.causalRelation, expected.causalRelation, `${path}.causalRelation`);
  if (typeof event.text !== "string" || event.text.trim().length === 0) {
    errors.push(`${path}.text must contain a safe text equivalent`);
  }
}

function validateArtifactShape(artifact, errors) {
  if (!exactKeys(artifact, TOP_LEVEL_KEYS, "artifact", errors)) return;
  pushExpected(errors, artifact.schema, RECORDED_REPLAY_SCHEMA, "schema");
  pushExpected(errors, artifact.evidenceMode, RECORDED_REPLAY_EVIDENCE_MODE, "evidenceMode");
  pushExpected(errors, artifact.replayId, RECORDED_REPLAY_ID, "replayId");

  if (exactKeys(artifact.incident, ["id", "title", "component"], "incident", errors)) {
    pushExpected(errors, artifact.incident.id, "inc-20260705-234935", "incident.id");
    pushExpected(errors, artifact.incident.title, "Blocked: atlas-systems.uk", "incident.title");
    pushExpected(errors, artifact.incident.component, "atlas-systems.uk", "incident.component");
  }

  if (exactKeys(artifact.source, ["authority", "reference", "classification"], "source", errors)) {
    pushExpected(errors, artifact.source.authority, "atlas-blackbox", "source.authority");
    pushExpected(errors, artifact.source.classification, "public-sealed-incident", "source.classification");
    try {
      const reference = new URL(artifact.source.reference);
      if (reference.origin !== "https://api.atlas-systems.uk"
        || reference.pathname !== "/blackbox/incidents/inc-20260705-234935"
        || reference.search
        || reference.hash) {
        errors.push("source.reference must be the bounded public incident reference");
      }
    } catch {
      errors.push("source.reference must be a valid public incident reference");
    }
  }

  if (exactKeys(artifact.time, ["basis", "incidentDuration", "recordingWindow"], "time", errors)) {
    pushExpected(errors, artifact.time.basis, "absolute-utc", "time.basis");
    pushExpected(errors, artifact.time.incidentDuration, "unknown-not-observed", "time.incidentDuration");
    pushExpected(errors, artifact.time.recordingWindow, "observed-blackbox-window-only", "time.recordingWindow");
  }

  if (!Array.isArray(artifact.events) || artifact.events.length !== EXPECTED_EVENT_ORDER.length) {
    errors.push("events must contain exactly the approved four events");
  } else {
    artifact.events.forEach((event, index) => validateEvent(event, index, errors));
  }

  if (exactKeys(artifact.claims, ["rootCause", "impact", "liveHealth", "recovery"], "claims", errors)) {
    pushExpected(errors, artifact.claims.rootCause, "unknown-not-observed", "claims.rootCause");
    pushExpected(errors, artifact.claims.impact, "unknown-not-observed", "claims.impact");
    pushExpected(errors, artifact.claims.liveHealth, "unknown-not-observed", "claims.liveHealth");
    pushExpected(errors, artifact.claims.recovery, "follow-up-success-observed-not-live-verified", "claims.recovery");
  }

  if (exactKeys(artifact.metrics, ["status", "values"], "metrics", errors)) {
    pushExpected(errors, artifact.metrics.status, "unknown-not-observed", "metrics.status");
    if (!isRecord(artifact.metrics.values) || Object.keys(artifact.metrics.values).length !== 0) {
      errors.push("metrics.values must remain empty");
    }
  }

  if (exactKeys(artifact.presentation, ["seed", "timing", "audioIsInterpretation"], "presentation", errors)) {
    pushExpected(errors, artifact.presentation.seed, "phase5-inc-20260705-234935", "presentation.seed");
    pushExpected(errors, artifact.presentation.timing, "fixed-presentation-timing", "presentation.timing");
    if (artifact.presentation.audioIsInterpretation !== true) {
      errors.push("presentation.audioIsInterpretation must be true");
    }
  }
}

export function validateRecordedReplayArtifact(artifact) {
  const errors = [];
  if (!isRecord(artifact)) {
    errors.push("artifact must be an object");
  } else {
    validateArtifactShape(artifact, errors);
    scanPublicStrings(artifact, "artifact", errors);
  }
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
}

export function parseRecordedReplayArtifact(input) {
  let artifact = input;
  if (typeof input === "string") {
    try {
      artifact = JSON.parse(input);
    } catch {
      throw new Error("Recorded replay JSON is malformed");
    }
  }
  const validation = validateRecordedReplayArtifact(artifact);
  if (!validation.valid) throw new Error(`Invalid recorded replay: ${validation.errors.join("; ")}`);
  return freezeDeep(clone(artifact));
}

export function textEquivalentForRecordedEvent(event) {
  const expected = EXPECTED_EVENT_ORDER.find((candidate) => candidate.class === event?.class);
  if (!expected || event.timestamp !== expected.timestamp || event.label !== expected.label) {
    throw new Error("Event is not part of the approved recorded replay");
  }
  if (typeof event.text !== "string" || !event.text.trim()) {
    throw new Error("Event has no text equivalent");
  }
  return event.text;
}

function vectorForState(state) {
  return Object.freeze({
    healthy: 0,
    warning: state === "warning" ? 1 : 0,
    critical: state === "critical" ? 1 : 0,
    unknown: state === "unknown" ? 1 : 0,
  });
}

export function adaptRecordedReplayEvents(artifactInput) {
  const artifact = parseRecordedReplayArtifact(artifactInput);
  return Object.freeze(artifact.events.map((event, index) => Object.freeze({
    index,
    timestamp: event.timestamp,
    class: event.class,
    label: event.label,
    text: event.text,
    causalRelation: event.causalRelation,
    scoreState: EVENT_SCORE_STATES[event.class],
    apuRole: EVENT_APU_ROLES[event.class],
    presentationMs: index * RECORDED_REPLAY_PRESENTATION_STEP_MS,
  })));
}

export function buildRecordedReplayPresentation(artifactInput, position = 0) {
  const artifact = parseRecordedReplayArtifact(artifactInput);
  const events = adaptRecordedReplayEvents(artifact);
  const index = Number.isInteger(position) ? position : Number(position);
  if (!Number.isInteger(index) || index < 0 || index >= events.length) {
    throw new RangeError("Recorded replay position must identify an event");
  }
  const event = events[index];
  const previous = events[index - 1]?.scoreState ?? "unknown";
  const scorePlan = buildAtlasApuScorePlan({
    timestamp: event.timestamp,
    evidenceMode: RECORDED_REPLAY_EVIDENCE_MODE,
    replay: true,
    scoreState: event.scoreState,
    previousScoreState: previous,
    stateVector: vectorForState(event.scoreState),
    totalComponents: 0,
    measuredComponents: 0,
    warningCount: 0,
    failureCount: 0,
    unknownCount: 0,
    unmeasuredCount: 0,
    activeIncidents: 0,
    stale: false,
    dominantStateReason: "Recorded replay interpretation; no live health claim is made.",
  }, { sourceMode: RECORDED_REPLAY_EVIDENCE_MODE, previousState: previous });
  return Object.freeze({
    replayId: artifact.replayId,
    incidentId: artifact.incident.id,
    evidenceMode: artifact.evidenceMode,
    position: index,
    eventCount: events.length,
    presentationMs: event.presentationMs,
    historicalTimestamp: event.timestamp,
    event,
    scorePlan,
    audioIsInterpretation: artifact.presentation.audioIsInterpretation,
  });
}
