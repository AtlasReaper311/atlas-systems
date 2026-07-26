import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("lab/system-symphony/index.html", "utf8");
const adapter = readFileSync("lab/system-symphony/system-symphony-page.js", "utf8");
const pageCss = readFileSync("lab/system-symphony/system-symphony-page.css", "utf8");
const previewEndpoints = readFileSync("lab/system-symphony/preview-endpoints.js", "utf8");
const sharedCss = readFileSync("static/css/systems-focus.css", "utf8");
const labShell = readFileSync("lab/shared/shell.js", "utf8");
const ui = readFileSync("static/js/sonify/ui.js", "utf8");
const engine = readFileSync("static/js/sonify/engine.js", "utf8");

test("System Symphony has a dedicated canonical product page", () => {
  assert.ok(page.includes('<link rel="canonical" href="https://atlas-systems.uk/lab/system-symphony/">'));
  assert.ok(page.includes("System SYMPHONY"));
  assert.ok(page.includes("Now Playing: Atlas Estate."));
  assert.ok(page.includes("sample-free fictional chip"));
  assert.ok(page.includes("data-symphony-page-host"));
  assert.ok(page.includes('href="/systems/reliability/"'));
  assert.ok(page.includes('href="https://api.atlas-systems.uk/sonify"'));
});

test("the product page uses the governed global and Lab shells", () => {
  assert.ok(page.includes('<header id="instrument" class="symphony-flagship"'));
  assert.ok(page.includes('/static/css/estate-search.css'));
  assert.ok(page.includes('/static/css/estate-shell.css?v=20260723-interface-v2'));
  assert.ok(page.includes('/lab/shared/shell.js?v=20260725-batch-h-fixes'));
  assert.ok(!page.includes('id="symphony-page-title" class="focus-title" tabindex="-1"'));
  assert.ok(labShell.includes('{ label: "System Symphony", href: "/lab/system-symphony/" }'));
  assert.ok(labShell.includes('{ label: "Reliability", href: "/systems/reliability/" }'));
});

test("the flagship page exposes PLAY TRACE and REPLAY as first-class modes", () => {
  for (const mode of ["play", "trace", "replay"]) {
    assert.ok(page.includes(`data-symphony-mode-tab="${mode}"`), `missing ${mode} tab`);
    assert.ok(page.includes(`data-symphony-mode-panel="${mode}"`), `missing ${mode} panel`);
  }
  assert.ok(page.includes('data-symphony-mode="play"'));
  assert.ok(page.includes("Topology as instrument panel."));
  assert.ok(page.includes("Deterministic frame playback."));
  assert.ok(adapter.includes("symphonyMode"));
  assert.ok(adapter.includes("symphonyScene"));
  assert.ok(adapter.includes("symphonySeed"));
});

test("PLAY stays minimal while TRACE and REPLAY reveal proof deliberately", () => {
  assert.ok(pageCss.includes('[data-symphony-mode="play"] .symphony-page-host .symphony-service-section'));
  assert.ok(pageCss.includes('[data-symphony-mode="play"] .symphony-page-host .symphony-inspector'));
  assert.ok(pageCss.includes('[data-symphony-mode="trace"] .symphony-page-host .symphony-performance'));
  assert.ok(pageCss.includes('[data-symphony-mode="replay"] .symphony-page-host .symphony-service-section'));
  assert.ok(adapter.includes("clickConsoleAudio"));
  assert.ok(adapter.includes("applyReplay"));
  assert.ok(adapter.includes("navigator.clipboard"));
  assert.ok(page.includes("preview-endpoints.js?v=20260726-phase5-replay-preview"));
  assert.ok(previewEndpoints.includes('host.dataset.source === "demo"'));
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
  assert.ok(page.includes("data-page-audio-toggle"));
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

test("the live UI presents service mappings as APU roles, not legacy instruments", () => {
  assert.ok(ui.includes("Atlas APU live instrument"));
  assert.ok(ui.includes("APU topology panel"));
  assert.ok(ui.includes("Service role score"));
  assert.ok(ui.includes("<th>APU role</th>"));
  assert.ok(ui.includes("function apuRoleLabel"));
  assert.doesNotMatch(ui, /<th>Instrument<\/th>/);
  assert.doesNotMatch(ui, /Estate orchestra/);
  assert.doesNotMatch(ui, /voice\.instrumentLabel[),]/);
});

test("the inline instrument covers governed viewport and motion contracts", () => {
  assert.ok(sharedCss.includes("min-width: 320px"));
  assert.ok(pageCss.includes("width: min(calc(100% - 32px), 1640px)"));
  for (const width of [375, 768, 1024]) {
    assert.ok(pageCss.includes(`max-width: ${width}px`), `missing ${width}px breakpoint`);
  }
  assert.ok(pageCss.includes("@media (prefers-reduced-motion: reduce)"));
  assert.ok(pageCss.includes("min-height: 44px"));
  assert.ok(pageCss.includes("overflow-x: auto"));
});
