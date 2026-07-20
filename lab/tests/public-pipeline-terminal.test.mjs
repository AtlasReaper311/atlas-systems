import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pipeline = await readFile(
  new URL("../../static/js/live/public-pipeline.js", import.meta.url),
  "utf8",
);
const terminal = await readFile(
  new URL("../../static/js/live/terminal-enhancements.js", import.meta.url),
  "utf8",
);
const loader = await readFile(
  new URL("../live-section.js", import.meta.url),
  "utf8",
);

test("Lab compatibility loader starts the public deployment ledger", () => {
  assert.match(loader, /public-pipeline\.js\?v=20260720-public-ledger/);
  assert.match(pipeline, /https:\/\/api\.atlas-systems\.uk\/v1\/topology/);
  assert.match(pipeline, /https:\/\/api\.atlas-systems\.uk\/notify\/recent\?limit=50/);
  assert.match(pipeline, /source_only === true/);
  assert.match(pipeline, /atlas-dora/);
});

test("deployment ledger keeps runtime health separate from deploy evidence", () => {
  assert.match(pipeline, /Deploy state only\./);
  assert.match(pipeline, /Runtime health is kept separate/);
  assert.match(pipeline, /waiting for public deploy evidence/);
  assert.doesNotMatch(pipeline, /registry-live/);
});

test("estate shell curl command is public API only and bounded", () => {
  assert.match(loader, /terminal-enhancements\.js\?v=20260720-shell-curl/);
  assert.match(terminal, /PUBLIC_API_ORIGIN = "https:\/\/api\.atlas-systems\.uk"/);
  assert.match(terminal, /OUTPUT_CHAR_LIMIT = 6000/);
  assert.match(terminal, /OUTPUT_LINE_LIMIT = 80/);
  assert.match(terminal, /external origins are not available from this shell/);
  assert.match(terminal, />_ shell/);
  assert.match(terminal, /curl api/);
});
