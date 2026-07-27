import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("scripts/capture_batch_h_evidence.mjs", "utf8");

test("Batch H evidence tracks audio context state rather than constructor count", () => {
  assert.match(source, /const audioContexts = \[\]/);
  assert.match(source, /__ATLAS_AUDIO_CONTEXT_STATES__/);
  assert.match(source, /audioContextStates: window\.__ATLAS_AUDIO_CONTEXT_STATES__/);
  assert.match(source, /filter\(\(state\) => state === "running"\)/);
  assert.match(source, /audio context entered running state before user consent/);
  assert.doesNotMatch(source, /audioContextCount !== 0/);
});

test("Batch H evidence accepts the current explicit-consent label without weakening it", () => {
  assert.match(source, /String\(evidence\.audioToggleText \|\| ""\)\.startsWith\("Start"\)/);
  assert.match(source, /audio control did not remain in a start state before consent/);
  assert.doesNotMatch(source, /audioToggleText !== "Start"/);
});
