import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  PASS_D0_BASELINE_IDS,
  createBaselineJourney,
  createPassD0Baseline,
  createPassD0BaselineManifest,
} from "./apu-score-trace-baselines.js";

const SINGLE_STATE_IDS = Object.freeze([
  "explorer-64-bars",
  "grid-pressure-64-bars",
  "boss-protocol-64-bars",
  "lost-signal-64-bars",
]);

test("D0 baseline contains every required journey", () => {
  const expected = [
    ...SINGLE_STATE_IDS,
    "explorer-to-grid-pressure",
    "grid-pressure-to-boss-protocol",
    "boss-protocol-to-grid-pressure",
    "boss-protocol-to-explorer-recovery",
    "active-to-lost-signal",
    "lost-signal-to-explorer",
    "deployment-during-explorer",
    "incident-during-grid-pressure",
    "replay-incomplete-evidence",
    "replay-confirmed-recovery",
  ];
  assert.deepEqual(PASS_D0_BASELINE_IDS, expected);
});

test("single-state journeys cover 64 bars and two complete form cycles", () => {
  for (const id of SINGLE_STATE_IDS) {
    const journey = createBaselineJourney(id);
    assert.equal(journey.phraseCount, 32);
    assert.equal(journey.barCount, 64);
    assert.deepEqual([...new Set(journey.entries.map((entry) => entry.cycleNumber))], [0, 1]);
    assert.equal(journey.entries.length, journey.entries.filter((entry) => entry.deterministicSignature).length);
  }
});

test("identical baseline generation is byte equivalent", () => {
  const first = createPassD0Baseline();
  const second = createPassD0Baseline();
  assert.equal(first.digest, second.digest);
  assert.deepEqual(first, second);
  assert.equal(first.journeys[0].serialized, second.journeys[0].serialized);
});

test("state transitions are recorded at phrase boundaries", () => {
  const journey = createBaselineJourney("explorer-to-grid-pressure");
  const transition = journey.entries.find((entry) => entry.stateTransition);
  assert.deepEqual(transition.stateTransition, { boundary: "phrase", from: "healthy", to: "warning" });
  assert.equal(transition.phraseIndex, 8);
});

test("event journeys retain bounded event context", () => {
  const deployment = createBaselineJourney("deployment-during-explorer");
  const incident = createBaselineJourney("incident-during-grid-pressure");
  assert.equal(deployment.entries.find((entry) => entry.eventContext)?.eventContext.type, "deployment");
  assert.equal(incident.entries.find((entry) => entry.eventContext)?.eventContext.type, "incident");
});

test("incomplete replay never records recovery or resolved movement", () => {
  const journey = createBaselineJourney("replay-incomplete-evidence");
  const kinds = journey.entries.map((entry) => entry.evidenceSource.movement?.kind).filter(Boolean);
  assert.ok(kinds.includes("failure"));
  assert.ok(!kinds.includes("recovery"));
  assert.ok(!kinds.includes("resolved"));
});

test("confirmed replay records evidence-backed recovery", () => {
  const journey = createBaselineJourney("replay-confirmed-recovery");
  const recovery = journey.entries.find((entry) => entry.evidenceSource.movement?.kind === "recovery");
  assert.ok(recovery);
  assert.equal(recovery.evidenceSource.movement.fromEvidence, true);
});

test("baseline manifest carries compact signatures for later comparisons", () => {
  const manifest = createPassD0BaselineManifest();
  assert.equal(manifest.journeys.length, PASS_D0_BASELINE_IDS.length);
  assert.ok(manifest.journeys.every((journey) => journey.signatures.length === journey.phraseCount));
  assert.match(manifest.digest, /^[0-9a-f]{8}$/);
});

test("D0 sources contain no runtime randomness, wall-clock decisions or audio APIs", () => {
  const paths = [
    "static/js/sonify/apu-score-trace.js",
    "static/js/sonify/apu-score-trace-baselines.js",
  ];
  for (const path of paths) {
    const source = fs.readFileSync(path, "utf8");
    assert.doesNotMatch(source, /Math\.random/);
    assert.doesNotMatch(source, /Date\.now/);
    assert.doesNotMatch(source, /AudioContext|OfflineAudioContext|Tone\./);
  }
});
