import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  adaptRecordedReplayEvents,
  buildRecordedReplayPresentation,
  parseRecordedReplayArtifact,
  RECORDED_REPLAY_EVIDENCE_MODE,
  RECORDED_REPLAY_SCHEMA,
  textEquivalentForRecordedEvent,
  validateRecordedReplayArtifact,
} from "./atlas-apu-recorded-replay.js";

const ARTIFACT_PATH = new URL("../../../lab/system-symphony/black-box/recorded-replays.json", import.meta.url);
const FIXTURE_PATH = new URL("../../../lab/system-symphony/black-box/incident-arcs.json", import.meta.url);

function artifact() {
  return JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("the Phase 5 historical artifact parses with the exact schema and identity", () => {
  const input = artifact();
  const parsed = parseRecordedReplayArtifact(JSON.stringify(input));

  assert.equal(parsed.schema, RECORDED_REPLAY_SCHEMA);
  assert.equal(parsed.evidenceMode, RECORDED_REPLAY_EVIDENCE_MODE);
  assert.equal(parsed.replayId, "recorded-inc-20260705-234935");
  assert.deepEqual(Object.keys(parsed), [
    "schema", "evidenceMode", "replayId", "incident", "source", "time",
    "events", "claims", "metrics", "presentation",
  ]);
  assert.deepEqual(Object.keys(parsed.incident), ["id", "title", "component"]);
  assert.equal(parsed.incident.id, "inc-20260705-234935");
  assert.equal(parsed.incident.title, "Blocked: atlas-systems.uk");
  assert.equal(parsed.source.authority, "atlas-blackbox");
  assert.equal(parsed.source.classification, "public-sealed-incident");
});

test("only recorded-replay evidence mode and public-sealed source identity are accepted", () => {
  const modes = ["fixture", "drill", "simulated", "live"];
  for (const mode of modes) {
    const candidate = clone(artifact());
    candidate.evidenceMode = mode;
    assert.equal(validateRecordedReplayArtifact(candidate).valid, false, mode);
  }
  for (const classification of ["fixture", "drill", "simulated", "live"]) {
    const candidate = clone(artifact());
    candidate.source.classification = classification;
    assert.equal(validateRecordedReplayArtifact(candidate).valid, false, classification);
  }
});

test("the four approved events preserve source timestamps, order, and causality", () => {
  const parsed = parseRecordedReplayArtifact(artifact());
  assert.deepEqual(parsed.events.map((event) => event.class), [
    "adjacent-public-event",
    "validation-failure-reported",
    "blackbox-capture",
    "validation-publication-success-reported",
  ]);
  assert.deepEqual(parsed.events.map((event) => event.timestamp), [
    "2026-07-05T23:48:50.649Z",
    "2026-07-05T23:49:08.770Z",
    "2026-07-05T23:49:35.670Z",
    "2026-07-05T23:51:03.675Z",
  ]);
  assert.equal(parsed.events[0].causalRelation, "not-established");
  assert.equal(validateRecordedReplayArtifact({ ...parsed, events: [...parsed.events].reverse() }).valid, false);
  assert.equal(parsed.time.incidentDuration, "unknown-not-observed");
  assert.equal(parsed.time.recordingWindow, "observed-blackbox-window-only");
});

test("unknown claims and empty metrics remain fail-closed", () => {
  const parsed = parseRecordedReplayArtifact(artifact());
  assert.equal(parsed.claims.rootCause, "unknown-not-observed");
  assert.equal(parsed.claims.impact, "unknown-not-observed");
  assert.equal(parsed.claims.liveHealth, "unknown-not-observed");
  assert.equal(parsed.claims.recovery, "follow-up-success-observed-not-live-verified");
  assert.deepEqual(parsed.metrics.values, {});

  const metricCandidate = clone(parsed);
  metricCandidate.metrics.values.requestCount = 1;
  const result = validateRecordedReplayArtifact(metricCandidate);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /metrics\.values/);
});

test("private fields and private-looking payload terms cannot enter the artifact", () => {
  const extraField = clone(artifact());
  extraField.telemetry = { gpu: "hidden" };
  assert.equal(validateRecordedReplayArtifact(extraField).valid, false);

  const privateEventField = clone(artifact());
  privateEventField.events[0].privateEndpoint = "https://internal.invalid";
  assert.equal(validateRecordedReplayArtifact(privateEventField).valid, false);

  const privateText = clone(artifact());
  privateText.events[0].text = "GPU latency and runtime model details";
  assert.equal(validateRecordedReplayArtifact(privateText).valid, false);
});

test("the existing synthetic fixture remains unchanged and cannot share the historical identity", () => {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  assert.equal(fixture.source, "fixture");
  assert.equal(fixture.incidentArcs[0].incidentId, "INC-APU-20260726-001");
  assert.notEqual(fixture.incidentArcs[0].incidentId.toLowerCase(), artifact().incident.id);
  assert.notEqual(artifact().source.classification, "fixture");
});

test("the adapter produces deterministic fixed presentation timing and text equivalence", () => {
  const parsed = parseRecordedReplayArtifact(artifact());
  const events = adaptRecordedReplayEvents(parsed);
  assert.deepEqual(events.map((event) => event.presentationMs), [0, 2400, 4800, 7200]);
  assert.equal(textEquivalentForRecordedEvent(parsed.events[0]), parsed.events[0].text);

  const first = buildRecordedReplayPresentation(parsed, 3);
  const second = buildRecordedReplayPresentation(parsed, 3);
  assert.deepEqual(first, second);
  assert.equal(first.historicalTimestamp, "2026-07-05T23:51:03.675Z");
  assert.equal(first.presentationMs, 7200);
  assert.equal(first.evidenceMode, "recorded-replay");
  assert.equal(first.audioIsInterpretation, true);
  assert.equal(first.event.apuRole, "follow-up-success");
  assert.equal(first.scorePlan.source, "recorded-replay");
  assert.equal(first.scorePlan.dominantState, "warning");
});

test("the interpreted sequence never emits universal healthy, resolved, or live-recovered claims", () => {
  const parsed = parseRecordedReplayArtifact(artifact());
  const rendered = JSON.stringify(parsed.events.map((_, index) => buildRecordedReplayPresentation(parsed, index)));
  assert.doesNotMatch(rendered, /"dominantLabel":"Healthy"|\bresolved\b|live recovered|recovered live/i);
  assert.match(rendered, /follow-up-success/);
  assert.match(rendered, /not-live-verified/);
});
