import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ui = readFileSync("static/js/sonify/ui.js", "utf8");
const css = readFileSync("static/css/system-symphony.css", "utf8");
const pageCss = readFileSync("lab/system-symphony/system-symphony-page.css", "utf8");
const navigationCss = readFileSync("lab/system-symphony/system-symphony-navigation.css", "utf8");
const bridgeCss = readFileSync("lab/system-symphony/trace-role-bridge.css", "utf8");
const bridge = readFileSync("lab/system-symphony/trace-role-bridge.js", "utf8");
const pageAdapter = readFileSync("lab/system-symphony/system-symphony-page.js", "utf8");
const page = readFileSync("lab/system-symphony/index.html", "utf8");
const board = readFileSync("static/js/sonify/trace-board.js", "utf8");

test("the TRACE board keeps the selector contract the bridge and smokes depend on", () => {
  assert.ok(ui.includes('class="symphony-topology" data-topology'));
  assert.ok(ui.includes("group.dataset.node = voice.name"));
  assert.ok(ui.includes("path.dataset.from = edge.from"));
  assert.ok(ui.includes("path.dataset.to = edge.to"));
  assert.ok(ui.includes("data-service-table"));
  assert.ok(ui.includes('class: `symphony-node status-${presentation.key}'));
  assert.ok(ui.includes('class: `symphony-edge${to.external ? " is-external" : ""}`'));
});

test("chips are focusable buttons carrying state beyond colour", () => {
  assert.ok(ui.includes('tabindex: "0"'));
  assert.ok(ui.includes('role: "button"'));
  // The label must name the service, its state, its kind, its APU role and
  // the source that produced the reading.
  assert.ok(ui.includes("APU role ${role}"));
  assert.ok(ui.includes("source ${source.label}"));
  assert.ok(ui.includes('event.key === "Enter" || event.key === " "'));
  assert.ok(ui.includes("group.dataset.status"));
  assert.ok(ui.includes("group.dataset.evidence"));
});

test("the renderer draws chips and copper, not circles", () => {
  assert.ok(ui.includes("symphony-chip__frame"));
  assert.ok(ui.includes("symphony-chip__die"));
  assert.ok(ui.includes("symphony-chip__led"));
  assert.ok(ui.includes("chamferedPath"));
  assert.doesNotMatch(ui, /svgElement\("circle", \{ r: 13 \}\)/);
  assert.doesNotMatch(ui, /symphony-node__core/);
  // No canvas is introduced for the board; the existing analyser canvases are
  // untouched.
  assert.equal((ui.match(/<canvas/g) ?? []).length, 2);
});

test("unmeasured sockets carry no LED and no fabricated metric", () => {
  assert.ok(board.includes("const showLed = !unmeasured"));
  assert.ok(board.includes('const latency = unmeasured ? "" : compactLatency'));
  assert.ok(ui.includes("symphony-chip__cavity"));
  assert.ok(ui.includes("symphony-chip__holes"));
  assert.ok(css.includes(".symphony-node.status-unmeasured .symphony-chip__frame"));
});

test("source truth survives the redesign", () => {
  // Fixture and demo frames are framed and plated, never silently live.
  assert.ok(ui.includes("NOT LIVE — ${source.label}"));
  assert.ok(ui.includes("symphony-board__fixture"));
  assert.ok(ui.indexOf("Source frame.") < ui.indexOf("Copper traces."));
  assert.ok(ui.includes('topologySvg.dataset.source = source.key'));
  assert.ok(css.includes('.symphony-topology[data-source="stale"]'));
  // Stale desaturates and stops flow rather than hiding the component.
  assert.ok(css.includes("saturate(0.35)"));
  assert.ok(ui.includes('if (source.key === "stale")'));
});

test("motion means signal and every state has a still equivalent", () => {
  assert.ok(css.includes("@keyframes symphony-trace-flow"));
  assert.ok(css.includes("@keyframes symphony-trace-jitter"));
  assert.ok(css.includes("@keyframes symphony-trace-clip"));
  assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"));
  assert.ok(css.includes('.symphony-edge.is-lit[data-status="degraded"]'));
  assert.ok(css.includes('.symphony-edge.is-lit[data-status="down"]'));
  // A lit trace is tied to a sounding voice, never to a running transport.
  assert.ok(ui.includes('for (const path of lit) path.classList.add("is-lit")'));
  assert.doesNotMatch(css, /\[data-running="1"\] \.symphony-edge \{\s*animation: symphony/);
});

test("the role bridge styling follows the chip vocabulary", () => {
  assert.ok(bridgeCss.includes(".symphony-node.is-role-highlight"));
  assert.ok(bridgeCss.includes(".symphony-edge.is-role-route"));
  assert.ok(bridgeCss.includes(".symphony-role-board button.is-role-empty"));
  assert.ok(bridgeCss.includes('[data-trace-role="clock"]'));
  assert.ok(bridgeCss.includes("prefers-reduced-motion: reduce"));
  assert.ok(bridgeCss.includes("symphony-chip__frame"));
  assert.doesNotMatch(bridgeCss, /circle:first-of-type/);
});

test("the narrow board is recomposed rather than scaled", () => {
  assert.ok(ui.includes('const NARROW_BOARD_QUERY = "(max-width: 700px)"'));
  assert.ok(ui.includes("narrowBoard.matches ? \"mobile\" : \"desktop\""));
  assert.ok(ui.includes('narrowBoard.addEventListener("change"'));
  assert.ok(css.includes('.symphony-topology[data-layout="mobile"]'));
});

test("TRACE opens as a readable board-first surface with comparison on demand", () => {
  assert.ok(page.includes('data-apu-role-highlight=""'));
  assert.ok(page.includes('data-trace-source-dock'));
  assert.ok(pageCss.includes("trace board-first pass"));
  assert.ok(pageCss.includes(".symphony-trace-source-dock"));
  assert.ok(pageCss.includes(".symphony-trace-source-dock .symphony-source-panel"));
  assert.ok(pageCss.includes(".symphony-trace-source-dock .symphony-performance.is-collapsed"));
  assert.ok(css.includes(".symphony-performance__collapse"));
  assert.ok(ui.includes("data-performance-collapse"));
  assert.ok(pageAdapter.includes("sourcePanelHome"));
  assert.ok(pageAdapter.includes("sourcePanel.dataset.traceDocked"));
  assert.ok(ui.includes('data-inspector-close'));
  assert.ok(ui.includes("function control(selector)"));
  assert.ok(ui.includes('host.dataset.traceSelection = String(activeSelection)'));
  assert.doesNotMatch(pageCss, /calc\(100svh - 270px\)/);
  assert.doesNotMatch(pageCss, /calc\(100svh - 380px\)/);
  assert.ok(pageCss.includes('.system-symphony[data-trace-selection="true"] .symphony-inspector'));
  assert.ok(pageCss.includes('grid-template-columns: repeat(8, minmax(0, 1fr))'));
  assert.ok(pageCss.includes('position: sticky'));
  assert.ok(pageCss.includes('.symphony-page-host .symphony-analyser-grid'));
  assert.ok(pageCss.includes('.symphony-page-host .symphony-modulation-inspector'));
  assert.ok(pageCss.includes('body[data-symphony-mode="trace"] .symphony-boot'));
  assert.ok(navigationCss.includes('padding: clamp(12px, 1.6vw, 20px) !important'));
  assert.doesNotMatch(navigationCss, /body\[data-symphony-mode="trace"\] \.symphony-flagship__top/);
  assert.ok(bridge.includes("updateRoleControls"));
  assert.ok(bridge.includes("host.dataset.traceRoleEmpty"));
  assert.ok(pageAdapter.includes("syncTraceSourceDock"));
  assert.ok(pageAdapter.includes("data-trace-source-dock"));
  assert.ok(pageAdapter.includes("score law only in this frame"));
});
