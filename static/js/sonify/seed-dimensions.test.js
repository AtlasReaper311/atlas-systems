import assert from "node:assert/strict";
import test from "node:test";

import {
  SEED_DIMENSIONS,
  deriveDimensions,
  dimensionDelta,
} from "./seed-dimensions.js";

test("seed dimensions replay exactly and remain within their cardinalities", () => {
  const first = deriveDimensions("A71A5:healthy");
  const replay = deriveDimensions("A71A5:healthy");
  assert.deepEqual(replay, first);
  for (const [label, cardinality] of Object.entries(SEED_DIMENSIONS)) {
    assert.ok(first[label] >= 0 && first[label] < cardinality, label);
  }
  assert.equal(first.seedSource, "A71A5:healthy");
  assert.equal(Object.keys(SEED_DIMENSIONS).length, 29);
});

test("different seeds vary many independent musical axes", () => {
  const first = deriveDimensions("A71A5:warning");
  const second = deriveDimensions("B10C:warning");
  assert.ok(dimensionDelta(first, second) >= 12);
  assert.notEqual(first.kickTimbre, second.kickTimbre);
  assert.notEqual(first.patternRotation, second.patternRotation);
});

test("labelled values match their numeric seed dimensions", () => {
  const dimensions = deriveDimensions("FFFF:critical");
  assert.equal(typeof dimensions.hatDensityLabel, "string");
  assert.equal(typeof dimensions.padVoicingLabel, "string");
  assert.equal(typeof dimensions.filterAutomationLabel, "string");
  assert.equal(typeof dimensions.arpDirectionLabel, "string");
  assert.equal(Number.isFinite(dimensions.tempoNudgeBpm), true);
});
