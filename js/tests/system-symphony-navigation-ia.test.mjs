import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync("lab/shared/shell.js", "utf8");
const navigation = readFileSync("lab/system-symphony/system-symphony-navigation.js", "utf8");
const navigationCss = readFileSync("lab/system-symphony/system-symphony-navigation.css", "utf8");

test("System Symphony navigation enhancement is scoped to the product route family", () => {
  assert.ok(shell.includes("function isSystemSymphonyPath"));
  assert.ok(shell.includes("pathname.startsWith(SYSTEM_SYMPHONY_ROUTE)"));
  assert.ok(shell.includes("system-symphony-navigation.js?v=20260728-system-symphony-trace-board-v1"));
  assert.ok(shell.includes("if (currentPath() !== SYSTEM_SYMPHONY_ROUTE) return;"));
  assert.ok(shell.includes("trace-role-bridge.js?v=20260728-system-symphony-trace-board-v1"));
});

test("the product bar consolidates modes, ROMs, prototypes, state, and audio", () => {
  assert.ok(navigation.includes("installProductBar"));
  assert.ok(navigation.includes("System Symphony navigation"));
  assert.ok(navigation.includes("ROM Library"));
  assert.ok(navigation.includes("Build Log Synth"));
  assert.ok(navigation.includes("Signal Radio"));
  assert.ok(navigation.includes('meta: "Prototype"'));
  assert.ok(navigation.includes("data-page-audio-toggle"));
  assert.ok(navigation.includes("dataset.productState"));
  assert.ok(navigation.includes("dataset.productSource"));
});

test("the live status observer cannot observe the product bar that it updates", () => {
  const observerStart = navigation.indexOf("function installStatusObserver()");
  const observerEnd = navigation.indexOf("function installMenuBehavior()", observerStart);
  const observer = navigation.slice(observerStart, observerEnd);
  assert.ok(observer.includes('document.querySelector("[data-symphony-flagship]")'));
  assert.ok(!observer.includes('document.querySelector("main")'));
  assert.ok(navigation.includes("state.textContent !== stateText"));
  assert.ok(navigation.includes("status.dataset.state !== stateKey"));
});

test("PLAY TRACE and REPLAY govern complete workspace surfaces", () => {
  assert.ok(navigation.includes('host.dataset.modeSurface = "trace"'));
  assert.ok(navigation.includes('summary.dataset.modeSurface = "trace"'));
  assert.ok(navigation.includes('proofConsole.dataset.modeSurface = "trace replay"'));
  assert.ok(navigation.includes("syncModeSurfaces"));
  assert.ok(navigation.includes('mode === "replay"'));
  assert.ok(navigation.includes('selectProofTab("incident")'));
  assert.ok(navigationCss.includes("[data-mode-surface][hidden]"));
});

test("proof opens as a focus-restoring drawer instead of changing document flow", () => {
  assert.ok(navigation.includes("setTrustDrawer"));
  assert.ok(navigation.includes("trustReturnTarget"));
  assert.ok(navigation.includes('event.key !== "Escape"'));
  assert.ok(navigation.includes('focus({ preventScroll: true })'));
  assert.ok(navigationCss.includes(".symphony-trust-layer"));
  assert.ok(navigationCss.includes("position: fixed !important"));
  assert.ok(navigationCss.includes("max-height: calc(100vh - var(--symphony-shell-offset))"));
});

test("supporting explanation, keyboard, and evidence sections are collapsed together", () => {
  assert.ok(navigation.includes("collapseSupportingSections"));
  assert.ok(navigation.includes('details.id = "symphony-support"'));
  assert.ok(navigation.includes("About, accessibility & evidence"));
  assert.ok(navigationCss.includes(".symphony-support"));
  assert.ok(navigationCss.includes(".symphony-support__body"));
});

test("navigation remains responsive and reduced-motion safe", () => {
  assert.ok(navigationCss.includes("position: sticky"));
  assert.ok(navigationCss.includes("@media (max-width: 767px)"));
  assert.ok(navigationCss.includes("@media (max-width: 520px)"));
  assert.ok(navigationCss.includes("@media (prefers-reduced-motion: reduce)"));
  assert.ok(navigationCss.includes("overflow-x: auto"));
});
