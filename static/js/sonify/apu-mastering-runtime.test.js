import assert from "node:assert/strict";
import test from "node:test";

import { requiredDestinationTrimDb } from "./apu-mastering-runtime.js";

test("adaptive mastering supplies only the missing upstream gain", () => {
  assert.equal(requiredDestinationTrimDb(-2, 4), 6);
  assert.equal(requiredDestinationTrimDb(-5, 4), 9);
  assert.equal(requiredDestinationTrimDb(4, 4), 0);
});

test("adaptive mastering clamps invalid or extreme corrections", () => {
  assert.equal(requiredDestinationTrimDb(Number.NaN, 4), 0);
  assert.equal(requiredDestinationTrimDb(-40, 10), 18);
  assert.equal(requiredDestinationTrimDb(20, -10), -18);
});
