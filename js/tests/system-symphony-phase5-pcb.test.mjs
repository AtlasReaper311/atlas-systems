import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync("lab/shared/shell.js", "utf8");
const board = readFileSync("lab/system-symphony/pcb-instrument.js", "utf8");
const boardCss = readFileSync("lab/system-symphony/pcb-instrument.css", "utf8");
const ui = readFileSync("static/js/sonify/ui.js", "utf8");

test("Phase 5 loads only on the canonical System Symphony instrument", () => {
  assert.ok(shell.includes("if (currentPath() !== SYSTEM_SYMPHONY_ROUTE) return;"));
  assert.ok(shell.includes("pcb-instrument.js?v=20260726-phase5-pcb-v1"));
  assert.ok(shell.indexOf("trace-role-bridge.js") < shell.indexOf("pcb-instrument.js"));
});

test("the topology becomes a central seven-bus Atlas APU motherboard", () => {
  for (const token of [
    "ATLAS SYSTEMS // APU-01 DIAGNOSTIC MAINBOARD",
    "ATLAS APU",
    "ROM CARTRIDGE SLOT",
    "pcb-edge-connector",
    "pcb-heatsink",
    "pcb-test-point",
    "pcb-role-bus",
    "pcb-role-socket",
  ]) {
    assert.ok(board.includes(token), `missing ${token}`);
  }
  for (const role of ["clock", "pulse", "memory", "thermal", "signal", "contention", "recovery"]) {
    assert.ok(board.includes(`${role}:`), `missing ${role} zone`);
  }
});

test("every rendered estate node remains an interactive service chip", () => {
  assert.ok(board.includes('topology.querySelectorAll("[data-node]:not(.symphony-node--external)")'));
  assert.ok(board.includes("chipGeometry"));
  assert.ok(board.includes("pcb-chip__body"));
  assert.ok(board.includes("pcb-chip__pins"));
  assert.ok(board.includes("pcb-chip__led"));
  assert.ok(board.includes("node.classList.add(\"pcb-chip\")"));
  assert.ok(ui.includes('group.addEventListener("click", () => selectService(voice.name))'));
  assert.ok(ui.includes('event.key === "Enter" || event.key === " "'));
});

test("declared dependencies become routed copper without claiming traffic", () => {
  assert.ok(board.includes("replaceDependencyLines"));
  assert.ok(board.includes("routePath"));
  assert.ok(board.includes('"data-from": line.dataset.from'));
  assert.ok(board.includes('"data-to": line.dataset.to'));
  assert.ok(boardCss.includes(".has-pcb-instrument .symphony-edge"));
  assert.ok(boardCss.includes(".symphony-edge.is-role-route"));
});

test("the board exposes diagnostic screens and deliberate comparison controls", () => {
  assert.ok(board.includes("Pin chip"));
  assert.ok(board.includes("Solo chip"));
  assert.ok(board.includes("Mute chip"));
  assert.ok(board.includes("Comparison bus"));
  assert.ok(board.includes("data-demo-solo"));
  assert.ok(board.includes("data-demo-mute"));
  assert.ok(boardCss.includes(".symphony-analyser-grid"));
  assert.ok(boardCss.includes("DIAGNOSTIC PROBE // CHIP INSPECTOR"));
});

test("mobile and reduced-motion users retain the full board information", () => {
  assert.ok(board.includes("createMobileModules"));
  assert.ok(board.includes("Atlas APU role modules"));
  assert.ok(boardCss.includes("@media (max-width: 760px)"));
  assert.ok(boardCss.includes(".pcb-mobile-modules"));
  assert.ok(boardCss.includes("@media (prefers-reduced-motion: reduce)"));
  assert.ok(boardCss.includes("animation: none !important"));
  assert.ok(ui.includes("Service role score"));
  assert.ok(ui.includes("data-service-table"));
});
