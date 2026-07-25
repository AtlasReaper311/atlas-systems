import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runner = readFileSync("scripts/capture_batch_h_evidence.mjs", "utf8");
const workflow = readFileSync(".github/workflows/interface-preview.yml", "utf8");

test("Batch H browser evidence covers every focused destination", () => {
  for (const route of [
    "/systems/observability/",
    "/systems/reliability/",
    "/systems/evidence/",
    "/lab/system-symphony/",
  ]) {
    assert.ok(runner.includes(`\"${route}\"`), `missing ${route}`);
  }
  for (const width of [320, 375, 768, 1024, 1440]) {
    assert.ok(runner.includes(`width: ${width}`), `missing ${width}px viewport`);
  }
  assert.ok(runner.includes('chromium.launch({ channel: "chrome"'));
  assert.ok(runner.includes("firefox.launch"));
});

test("Batch H evidence checks the corrected headers and failure states", () => {
  assert.ok(runner.includes('waitForSelector(".atlas-header__brand"'));
  assert.ok(runner.includes('waitForSelector(".atlas-header__actions"'));
  assert.ok(runner.includes("header obscures the focused page hero"));
  assert.ok(runner.includes("global search control is missing"));
  assert.ok(runner.includes("unavailable evidence was rendered entirely healthy"));
  assert.ok(runner.includes("horizontal overflow"));
  assert.ok(runner.includes("serious accessibility findings"));
});

test("Batch H evidence verifies keyboard, no-JavaScript, motion, and audio consent boundaries", () => {
  assert.ok(runner.includes('page.keyboard.press("Tab")'));
  assert.ok(runner.includes('document.querySelector(":focus-visible")'));
  assert.ok(runner.includes("javaScriptEnabled: false"));
  assert.ok(runner.includes('reducedMotion: "reduce"'));
  assert.ok(runner.includes("audio context was created before user consent"));
  assert.ok(runner.includes('audioToggleText !== "Start"'));
  assert.ok(runner.includes("Symphony stole focus during page load"));
  assert.ok(runner.includes("Symphony is not embedded as a non-modal page region"));
});

test("the approved preview workflow reuses one pinned browser toolchain", () => {
  assert.ok(workflow.includes('contains(github.event.pull_request.labels.*.name, \'interface-preview-approved\')'));
  assert.ok(!workflow.includes("capture-batch-h-evidence:"));
  assert.ok(workflow.includes("node --check scripts/capture_batch_h_evidence.mjs"));
  assert.ok(workflow.includes("node capture_interface_evidence.mjs"));
  assert.ok(workflow.includes("node capture_batch_h_evidence.mjs"));
  assert.equal((workflow.match(/npm install --save-exact playwright@1\.61\.1 @axe-core\/playwright@4\.12\.1/g) || []).length, 1);
  assert.ok(workflow.includes("name: batch-h-preview-evidence"));
  assert.ok(workflow.includes("retention-days: 14"));
});

test("preview path filters include every Batch H implementation surface", () => {
  for (const path of [
    '"systems/**"',
    '"lab/system-symphony/**"',
    '"lab/shared/**"',
    '"static/css/systems-focus.css"',
    '"static/js/focused-systems-shell.js"',
    '"static/js/sonify/**"',
    '"js/tests/batch-h-*.test.mjs"',
    '"scripts/capture_batch_h_evidence.mjs"',
  ]) {
    assert.ok(workflow.includes(path), `missing preview trigger ${path}`);
  }
});
