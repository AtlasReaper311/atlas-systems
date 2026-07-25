import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("lab/system-symphony/index.html", "utf8");
const adapter = readFileSync("lab/system-symphony/system-symphony-page.js", "utf8");
const pageCss = readFileSync("lab/system-symphony/system-symphony-page.css", "utf8");
const sharedCss = readFileSync("static/css/systems-focus.css", "utf8");
const labShell = readFileSync("lab/shared/shell.js", "utf8");
const ui = readFileSync("static/js/sonify/ui.js", "utf8");
const engine = readFileSync("static/js/sonify/engine.js", "utf8");

test("System Symphony has a dedicated canonical product page", () => {
  assert.ok(page.includes('<link rel="canonical" href="https://atlas-systems.uk/lab/system-symphony/">'));
  assert.ok(page.includes("Hear the estate without hiding uncertainty."));
  assert.ok(page.includes("Audio never starts without a user gesture."));
  assert.ok(page.includes("data-symphony-page-host"));
  assert.ok(page.includes('href="/systems/reliability/"'));
  assert.ok(page.includes('href="https://api.atlas-systems.uk/sonify"'));
});

test("the product page uses the governed global and Lab shells", () => {
  assert.ok(page.includes('<header class="focus-hero">'));
  assert.ok(page.includes('/static/css/estate-search.css'));
  assert.ok(page.includes('/static/css/estate-shell.css?v=20260723-interface-v2'));
  assert.ok(page.includes('/lab/shared/shell.js?v=20260725-batch-h-fixes'));
  assert.ok(!page.includes('id="symphony-page-title" class="focus-title" tabindex="-1"'));
  assert.ok(labShell.includes('{ label: "System Symphony", href: "/lab/system-symphony/" }'));
  assert.ok(labShell.includes('{ label: "Reliability", href: "/systems/reliability/" }'));
});

test("the page reuses the current engine instead of forking audio logic", () => {
  assert.ok(adapter.includes('import "../../static/js/sonify/ui.js'));
  assert.doesNotMatch(adapter, /new AudioContext|new OfflineAudioContext|createEngine\(/);
  assert.doesNotMatch(adapter, /\.start\(\)/);
  assert.ok(adapter.includes("openButton.click()"));
  assert.ok(adapter.includes('consolePanel.setAttribute("role", "region")'));
});

test("audio still requires the explicit Start control and supports rejection recovery", () => {
  assert.ok(ui.includes("data-audio-toggle>Start</button>"));
  assert.ok(ui.includes("AUDIO_CONTEXT_BLOCKED_CODE"));
  assert.ok(ui.includes("Retry audio"));
  assert.ok(engine.includes("export const AUDIO_CONTEXT_BLOCKED_CODE"));
  assert.doesNotMatch(adapter, /data-audio-toggle[^\n]*click/);
});

test("inline mode removes the modal trap without stealing page-load focus", () => {
  assert.ok(adapter.includes('removeAttribute("aria-modal")'));
  assert.ok(adapter.includes('event.key === "Tab"'));
  assert.ok(adapter.includes("event.stopImmediatePropagation()"));
  assert.ok(adapter.includes('previousFocus.focus({ preventScroll: true })'));
  assert.ok(!adapter.includes('byId("symphony-page-title")?.focus'));
  assert.ok(adapter.includes("Escape"));
});

test("the page retains the topology alternative and explicit evidence counts", () => {
  assert.ok(ui.includes("<table>"));
  assert.ok(ui.includes("data-service-table"));
  assert.ok(ui.includes("Measured health is authoritative. Topology-only components remain explicitly Unmeasured."));
  for (const id of ["page-service-count", "page-measurement-count", "page-objective-count", "page-score-state"]) {
    assert.ok(page.includes(`id="${id}"`), `missing ${id}`);
  }
});

test("the inline instrument covers governed viewport and motion contracts", () => {
  assert.ok(sharedCss.includes("min-width: 320px"));
  assert.ok(pageCss.includes("width: min(calc(100% - 48px), 1560px)"));
  for (const width of [375, 768, 1024]) {
    assert.ok(pageCss.includes(`max-width: ${width}px`), `missing ${width}px breakpoint`);
  }
  assert.ok(pageCss.includes("@media (prefers-reduced-motion: reduce)"));
  assert.ok(pageCss.includes("min-height: 44px"));
  assert.ok(pageCss.includes("overflow-x: auto"));
});
