import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const labShell = readFileSync("lab/shared/shell.js", "utf8");
const bridge = readFileSync("lab/system-symphony/trace-role-bridge.js", "utf8");
const bridgeCss = readFileSync("lab/system-symphony/trace-role-bridge.css", "utf8");
const romPage = readFileSync("lab/system-symphony/roms/index.html", "utf8");
const romLibrary = readFileSync("lab/system-symphony/rom-library.js", "utf8");

function traceBridgeIsFlagshipOnly() {
  const routeEnhancementsStart = labShell.indexOf("async function installRouteEnhancements()");
  const routeEnhancementsEnd = labShell.indexOf("function installMeasuredShell", routeEnhancementsStart);
  const routeEnhancements = labShell.slice(routeEnhancementsStart, routeEnhancementsEnd);
  const earlyReturnGuard = /if \(currentPath\(\) !== SYSTEM_SYMPHONY_ROUTE\) return;\s*await import\("\/lab\/system-symphony\/trace-role-bridge\.js\?v=20260831-system-symphony-heading-clearance-v1"\);/s;
  const positiveRootGuard = /if \(currentPath\(\) === SYSTEM_SYMPHONY_ROUTE\) \{\s*await import\("\/lab\/system-symphony\/trace-role-bridge\.js\?v=20260831-system-symphony-heading-clearance-v1"\);\s*\}/s;
  return earlyReturnGuard.test(routeEnhancements) || positiveRootGuard.test(routeEnhancements);
}

test("System Symphony loads the Phase D role bridge only on the flagship route", () => {
  assert.ok(labShell.includes('const SYSTEM_SYMPHONY_ROUTE = "/lab/system-symphony/"'));
  assert.ok(traceBridgeIsFlagshipOnly());
  assert.ok(labShell.includes("trace-role-bridge.js?v=20260831-system-symphony-heading-clearance-v1"));
});

test("TRACE role selection maps service rows onto topology nodes and dependency routes", () => {
  for (const role of ["clock", "pulse", "memory", "thermal", "signal", "contention", "recovery"]) {
    assert.ok(bridge.includes(`"${role}"`), `missing ${role} role`);
  }
  assert.ok(bridge.includes("[data-service-table] tr"));
  assert.ok(bridge.includes("[data-node]"));
  assert.ok(bridge.includes("serviceRoleMap"));
  assert.ok(bridge.includes("decorateTopology"));
  assert.ok(bridge.includes("is-role-route"));
  assert.ok(bridge.includes("data-apu-role-highlight"));
  assert.ok(bridge.includes("updateRoleControls"));
  assert.ok(bridge.includes("traceRoleEmpty"));
  assert.ok(bridge.includes("SCORE_LAW_ROLES"));
  assert.ok(bridge.includes('"law"'));
  assert.ok(bridge.includes("MutationObserver"));
  assert.ok(bridge.includes("syncRoleFromSelectedService"));
});

test("TRACE role styling keeps highlighted routes legible and reduced-motion safe", () => {
  assert.ok(bridgeCss.includes(".symphony-node.is-role-highlight"));
  assert.ok(bridgeCss.includes(".symphony-edge.is-role-route"));
  assert.ok(bridgeCss.includes(".symphony-role-board button.is-role-empty"));
  assert.ok(bridgeCss.includes(".symphony-role-board button.is-score-law-only"));
  assert.ok(bridgeCss.includes('[data-trace-role="clock"]'));
  assert.ok(bridgeCss.includes("prefers-reduced-motion: reduce"));
});

test("ROM proof remains deliberate and operational state is not hidden by fixture source", () => {
  assert.ok(romPage.includes("data-rom-inspector"));
  assert.ok(!romPage.includes('class="symphony-proof-json" open'));
  assert.ok(romLibrary.includes("function sourceCategory"));
  assert.ok(romLibrary.includes("`${categoryFor(cartridge)} / ${sourceCategory(cartridge)}`"));
  assert.ok(romLibrary.includes('["Commit", cartridge.commit]'));
  assert.ok(romLibrary.includes("setJson(cartridge, { reveal: true })"));
  assert.ok(
    romLibrary.indexOf('cartridge.dominantState === "healthy"')
      < romLibrary.indexOf('cartridge.source === "fixture"'),
  );
});
