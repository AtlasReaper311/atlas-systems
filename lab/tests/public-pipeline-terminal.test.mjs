import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pipeline = await readFile(new URL("../../static/js/live/public-pipeline.js", import.meta.url), "utf8");
const terminal = await readFile(new URL("../../js/atlas-terminal-card-v3.js", import.meta.url), "utf8");
const loader = await readFile(new URL("../live-section.js", import.meta.url), "utf8");

test("Lab loads the public deployment ledger", () => {
  assert.match(loader, /public-pipeline\.js/);
  assert.doesNotMatch(loader, /terminal-enhancements/);
  assert.match(pipeline, /api\.atlas-systems\.uk\/v1\/topology/);
  assert.match(pipeline, /atlas-dora/);
});

test("deployment ledger keeps deploy evidence separate from health", () => {
  assert.match(pipeline, /Deploy state only\./);
  assert.match(pipeline, /Runtime health is kept separate/);
  assert.doesNotMatch(pipeline, /registry-live/);
});

test("estate shell uses the public API for control-plane commands", () => {
  assert.match(terminal, /API_ORIGIN = "https:\/\/api\.atlas-systems\.uk"/);
  assert.match(terminal, /\/v1\/registry/);
  assert.match(terminal, /\/v1\/topology/);
  assert.match(terminal, /\/v1\/search/);
  assert.match(terminal, />_ shell/);
  assert.match(terminal, /curl api/);
  assert.match(terminal, /function cmdLsRepos\(\)/);
  assert.match(terminal, /function cmdLsWorkers\(\)/);
});
