import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("lab/system-symphony/index.html", "utf8");
const adapter = readFileSync("lab/system-symphony/system-symphony-page.js", "utf8");
const pageCss = readFileSync("lab/system-symphony/system-symphony-page.css", "utf8");
const sharedCss = readFileSync("static/css/systems-focus.css", "utf8");
const ui = readFileSync("static/js/sonify/ui.js", "utf8");
const engine = readFileSync("static/js/sonify/engine.js", "utf8");

test("System Symphony has a dedicated canonical product page", () => {
  assert.match(page, /<link rel="canonical" href="https:\/\/atlas-systems\.uk\/lab\/system-symphony\/">/);
  assert.match(page, /Hear the estate without hiding uncertainty\./);
  assert.match(page, /Audio never starts without a user gesture\./);
  assert.match(page, /data-symphony-page-host/);
  assert.match(page, /href="\/systems\/reliability\/"/);
  assert.ok(page.includes("https://api.atlas-systems.uk/sonify"));
});

test("the page reuses the current engine instead of forking audio logic", () => {
  assert.match(adapter, /import "\.\.\/\.\.\/static\/js\/sonify\/ui\.js/);
  assert.doesNotMatch(adapter, /new AudioContext|new OfflineAudioContext|createEngine\(/);
  assert.doesNotMatch(adapter, /\.start\(\)/);
  assert.match(adapter, /openButton\.click\(\)/);
  assert.match(adapter, /consolePanel\.setAttribute\("role", "region"\)/);
});

test("audio still requires the explicit Start control and supports rejection recovery", () => {
  assert.match(ui, /data-audio-toggle>Start<\/button>/);
  assert.match(ui, /AUDIO_CONTEXT_BLOCKED_CODE/);
  assert.match(ui, /Retry audio/);
  assert.match(engine, /export const AUDIO_CONTEXT_BLOCKED_CODE/);
  assert.doesNotMatch(adapter, /data-audio-toggle[^\n]*click/);
});

test("inline mode removes the modal trap and restores focus", () => {
  assert.match(adapter, /removeAttribute\("aria-modal"\)/);
  assert.match(adapter, /event\.key === "Tab"/);
  assert.match(adapter, /event\.stopImmediatePropagation\(\)/);
  assert.match(adapter, /previousFocus\.focus\(\{ preventScroll: true \}\)/);
  assert.match(adapter, /Escape/);
});

test("the page retains the topology alternative and explicit evidence counts", () => {
  assert.match(ui, /<table>/);
  assert.match(ui, /data-service-table/);
  assert.match(ui, /Measured health is authoritative\. Topology-only components remain explicitly Unmeasured\./);
  for (const id of ["page-service-count", "page-measurement-count", "page-objective-count", "page-score-state"]) {
    assert.ok(page.includes(`id="${id}"`), `missing ${id}`);
  }
});

test("the inline instrument covers governed viewport and motion contracts", () => {
  assert.match(sharedCss, /min-width:320px/);
  assert.match(pageCss, /max-width:1560px/);
  for (const width of [375, 768, 1024]) {
    assert.ok(pageCss.includes(`max-width:${width}px`), `missing ${width}px breakpoint`);
  }
  assert.match(pageCss, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(pageCss, /min-height:44px/);
  assert.match(pageCss, /overflow-x:auto/);
});
