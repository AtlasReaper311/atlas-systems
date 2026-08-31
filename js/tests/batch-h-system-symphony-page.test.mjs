import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("lab/system-symphony/index.html", "utf8");
const roms = readFileSync("lab/system-symphony/roms/index.html", "utf8");
const buildLog = readFileSync("lab/system-symphony/build-log/index.html", "utf8");
const radio = readFileSync("lab/system-symphony/radio/index.html", "utf8");
const adapter = readFileSync("lab/system-symphony/system-symphony-page.js", "utf8");
const romLibrary = readFileSync("lab/system-symphony/rom-library.js", "utf8");
const pageCss = readFileSync("lab/system-symphony/system-symphony-page.css", "utf8");
const previewEndpoints = readFileSync("lab/system-symphony/preview-endpoints.js", "utf8");
const sharedCss = readFileSync("static/css/systems-focus.css", "utf8");
const labShell = readFileSync("lab/shared/shell.js", "utf8");
const headers = readFileSync("_headers", "utf8");
const ui = readFileSync("static/js/sonify/ui.js", "utf8");
const engine = readFileSync("static/js/sonify/engine.js", "utf8");

test("System Symphony has a dedicated canonical product page", () => {
  assert.ok(page.includes('<link rel="canonical" href="https://atlas-systems.uk/lab/system-symphony/">'));
  assert.ok(page.includes("System SYMPHONY"));
  assert.ok(page.includes("NOW PLAYING"));
  assert.ok(page.includes("sample-free fictional chip"));
  assert.ok(page.includes("Atlas APU-01"));
  assert.ok(page.includes("Sleeve generated from seed"));
  assert.ok(page.includes("Current frame &middot; 7 APU roles &times; 16 steps"));
  assert.ok(page.includes("Unmeasured &mdash; not silent, not healthy"));
  assert.ok(page.includes("data-symphony-page-host"));
  assert.ok(page.includes('href="/lab/system-symphony/roms/"'));
  assert.ok(page.includes('href="/lab/system-symphony/build-log/"'));
  assert.ok(page.includes('href="/lab/system-symphony/radio/"'));
  assert.ok(page.includes('href="/systems/reliability/"'));
  assert.ok(page.includes('href="https://api.atlas-systems.uk/sonify"'));
});

test("the product page uses the governed global and Lab shells", () => {
  assert.ok(page.includes('<header id="instrument" class="symphony-flagship"'));
  assert.ok(page.includes('/static/css/estate-search.css'));
  assert.ok(page.includes('/static/css/estate-shell.css?v=20260723-interface-v2'));
  assert.ok(page.includes('/lab/shared/shell.js?v=20260831-system-symphony-heading-clearance-v1'));
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
  assert.ok(page.includes("Diagnostic PCB for the score."));
  assert.ok(page.includes("Deterministic playback console."));
  assert.ok(adapter.includes("symphonyMode"));
  assert.ok(adapter.includes("symphonyScene"));
  assert.ok(adapter.includes("symphonySeed"));
});

test("the page exposes an auditable Atlas APU cartridge and proof strip", () => {
  assert.ok(page.includes("ATLAS APU CARTRIDGE"));
  assert.ok(page.includes("data-cartridge-panel"));
  assert.ok(page.includes("data-cartridge-copy"));
  assert.ok(page.includes("data-cartridge-download"));
  assert.ok(page.includes("page-proof-commit"));
  assert.ok(page.includes("page-proof-sample-free"));
  assert.ok(page.includes("data-trust-layer"));
  assert.ok(page.includes("trust-proof-source"));
  assert.ok(page.includes("trust-proof-commit"));
  assert.ok(page.includes("trust-proof-frame-time"));
  assert.ok(page.includes("trust-proof-route"));
  assert.ok(page.includes("trust-proof-frame-seed"));
  assert.ok(page.includes("trust-proof-sample-free"));
  assert.ok(page.includes("page-proof-replay"));
  assert.ok(page.includes('href="/lab/system-symphony/replay/"'));
  assert.ok(adapter.includes("buildAtlasApuScorePlan"));
  assert.ok(adapter.includes("window.__ATLAS_APU_CARTRIDGE__"));
  assert.ok(adapter.includes("makeReplayUrl"));
  assert.ok(adapter.includes("sourceHonestyMessage"));
  assert.ok(adapter.includes("setProofPair"));
  assert.ok(adapter.includes("navigator.clipboard"));
  assert.ok(adapter.includes("application/json"));
});

test("the lab route adds scoped System Symphony side routes without public cutover", () => {
  assert.ok(labShell.includes('{ label: "APU ROMs", href: "/lab/system-symphony/roms/" }'));
  for (const html of [roms, buildLog, radio]) {
    assert.ok(html.includes('<meta name="robots" content="noindex, follow">'));
    assert.ok(html.includes('/lab/shared/shell.js?v=20260831-system-symphony-heading-clearance-v1'));
    assert.ok(html.includes('/lab/system-symphony/system-symphony-page.css?v=20260728-system-symphony-trace-pr160-v1'));
    assert.ok(html.includes('href="/lab/system-symphony/'));
  }
  assert.ok(roms.includes("Atlas APU ROM Library"));
  assert.ok(roms.includes("data-rom-library"));
  assert.ok(roms.includes("data-rom-json"));
  assert.ok(romLibrary.includes("materializeBlackBoxArchive"));
  assert.ok(romLibrary.includes("materializeIncidentArcArchive"));
  assert.ok(romLibrary.includes("Fixture cartridge"));
  assert.ok(buildLog.includes("static inputs only"));
  assert.ok(buildLog.includes("No GitHub API polling is enabled"));
  assert.ok(radio.includes("fixture / replay labelled"));
  assert.ok(radio.includes("Broadcast from"));
  assert.ok(headers.includes("/lab/system-symphony/roms/*"));
  assert.ok(headers.includes("/lab/system-symphony/build-log/*"));
  assert.ok(headers.includes("/lab/system-symphony/radio/*"));
});

test("the lab page exposes the Phase 9 static black-box flight recorder", () => {
  assert.ok(page.includes("ATLAS BLACK BOX FLIGHT RECORDER"));
  assert.ok(page.includes("data-flight-recorder"));
  assert.ok(page.includes('href="/lab/system-symphony/black-box/archive.json"'));
  assert.ok(page.includes("Live persistence is not enabled."));
  assert.ok(adapter.includes("atlas-apu-flight-recorder.js"));
  assert.ok(adapter.includes("FLIGHT_RECORDER_ARCHIVE_URL"));
  assert.ok(adapter.includes("createAtlasApuBlackBoxCartridge"));
  assert.ok(adapter.includes("materializeBlackBoxArchive"));
  assert.ok(adapter.includes("validateBlackBoxCartridge"));
  assert.ok(adapter.includes("cartridgeSummary"));
  assert.ok(adapter.includes("renderFlightRecorderArchive"));
  assert.ok(adapter.includes("data-flight-recorder-inspect"));
  assert.ok(adapter.includes("symphonyCartridge"));
  assert.ok(headers.includes("/lab/system-symphony/black-box/*"));
  assert.ok(headers.includes("20260726-system-symphony-atlas-apu-black-box-v1"));
});

test("the lab page exposes the Phase 10 incident boss-track replay", () => {
  assert.ok(page.includes("INCIDENT REPLAY AS A MOVEMENT"));
  assert.ok(page.includes("data-incident-arc"));
  assert.ok(page.includes("data-incident-arc-audition"));
  assert.ok(page.includes("data-incident-arc-play"));
  assert.ok(page.includes("data-incident-arc-progress"));
  assert.ok(page.includes("data-incident-arc-timeline"));
  assert.ok(page.includes("data-incident-arc-impact"));
  assert.ok(page.includes('href="/lab/system-symphony/black-box/incident-arcs.json"'));
  assert.ok(page.includes("Incident boss tracks are static fixture evidence"));
  assert.ok(adapter.includes("atlas-apu-incident-arc.js"));
  assert.ok(adapter.includes("INCIDENT_ARC_ARCHIVE_URL"));
  assert.ok(adapter.includes("materializeIncidentArcArchive"));
  assert.ok(adapter.includes("validateIncidentArc"));
  assert.ok(adapter.includes("incidentArcSummary"));
  assert.ok(adapter.includes("playIncidentArc"));
  assert.ok(adapter.includes("INCIDENT_ARC_FRAME_MS = 10000"));
  assert.ok(adapter.includes("ensureConsoleAudioRunning"));
  assert.ok(adapter.includes("symphonyIncident"));
  assert.ok(adapter.includes("symphonyIncidentStep"));
});

test("the replay entry route canonicalizes Phase 7 replay links", () => {
  const replay = readFileSync("lab/system-symphony/replay/index.html", "utf8");
  assert.ok(replay.includes("/lab/system-symphony/"));
  assert.ok(replay.includes("symphonyMode"));
  assert.ok(replay.includes("symphonyScene"));
  assert.ok(replay.includes("symphonySeed"));
  assert.ok(replay.includes('params.get("frame")'));
  assert.ok(replay.includes('params.get("seed")'));
  assert.ok(replay.includes('params.get("cartridge")'));
  assert.ok(replay.includes("symphonyCartridge"));
  assert.ok(replay.includes('params.get("incident")'));
  assert.ok(replay.includes("symphonyIncident"));
});

test("PLAY stays minimal while TRACE and REPLAY reveal proof deliberately", () => {
  assert.ok(pageCss.includes('[data-symphony-mode="play"] .symphony-page-host .symphony-service-section'));
  assert.ok(pageCss.includes('[data-symphony-mode="play"] .symphony-page-host .symphony-inspector'));
  assert.ok(pageCss.includes('[data-symphony-mode="play"] .symphony-proof-console'));
  assert.ok(pageCss.includes("[data-proof-panel][hidden]"));
  assert.ok(page.includes("data-proof-console"));
  assert.ok(page.includes('data-proof-open="blackbox"'));
  assert.ok(page.includes("data-trust-toggle"));
  assert.ok(page.includes("Prove it"));
  assert.ok(page.includes('data-proof-tab="cartridge"'));
  assert.ok(page.includes('data-proof-tab="blackbox"'));
  assert.ok(page.includes('data-proof-tab="incident"'));
  assert.ok(page.includes("Inspect cartridge JSON"));
  assert.ok(page.includes("Inspect selected black-box JSON"));
  assert.ok(page.includes("Inspect incident arc JSON"));
  assert.ok(adapter.includes("selectProofPanel"));
  assert.ok(pageCss.includes('[data-symphony-mode="trace"] .symphony-page-host .symphony-performance'));
  assert.ok(pageCss.includes("The later PCB work changes the topology renderer"));
  assert.ok(pageCss.includes('[data-symphony-mode="replay"] .symphony-page-host .symphony-service-section'));
  assert.ok(adapter.includes("clickConsoleAudio"));
  assert.ok(adapter.includes("applyReplay"));
  assert.ok(adapter.includes("highlightApuRole"));
  assert.ok(adapter.includes("navigator.clipboard"));
  assert.ok(page.includes("preview-endpoints.js?v=20260726-phase6-cartridge-proof"));
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
  assert.ok(page.includes("data-page-audio-toggle data-audio-toggle"));
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
  assert.ok(pageCss.includes("width: min(calc(100% - 32px), 1440px)"));
  for (const width of [375, 768, 1024]) {
    assert.ok(pageCss.includes(`max-width: ${width}px`), `missing ${width}px breakpoint`);
  }
  assert.ok(pageCss.includes("@media (prefers-reduced-motion: reduce)"));
  assert.ok(pageCss.includes("min-height: 44px"));
  assert.ok(pageCss.includes("overflow-x: auto"));
  assert.ok(pageCss.includes(".symphony-stage"));
  assert.ok(pageCss.includes(".symphony-role-board"));
  assert.ok(pageCss.includes(".symphony-rom-grid"));
});
