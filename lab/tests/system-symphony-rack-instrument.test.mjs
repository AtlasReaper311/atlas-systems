import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shell = readFileSync("lab/shared/shell.js", "utf8");
const page = readFileSync("lab/system-symphony/index.html", "utf8");
const loader = readFileSync("lab/system-symphony/rack-instrument.js", "utf8");
const model = readFileSync("lab/system-symphony/rack-model.js", "utf8");
const view = readFileSync("lab/system-symphony/rack-view.js", "utf8");
const css = readFileSync("lab/system-symphony/rack-instrument.css", "utf8");

test("Version B loads after navigation and role routing on the root route only", () => {
  const guard = shell.indexOf("currentPath() !== SYSTEM_SYMPHONY_ROUTE");
  const bridge = shell.indexOf("trace-role-bridge.js");
  const rack = shell.indexOf("rack-instrument.js");
  assert.ok(guard >= 0 && bridge > guard && rack > bridge);
  assert.ok(!page.includes("rack-instrument.js"), "the shell, not the page, owns route loading");
});

test("PLAY TRACE and REPLAY remain native links", () => {
  for (const mode of ["play", "trace", "replay"]) assert.match(page, new RegExp(`<a[^>]+data-symphony-mode-tab="${mode}"`, "i"));
});

test("the rack reads established authorities without a second poller or network client", () => {
  assert.ok(model.includes('[data-topology]'));
  assert.ok(model.includes('[data-service-table]'));
  assert.ok(model.includes('.symphony-node--external'));
  assert.ok(model.includes('closest("table")'));
  assert.ok(loader.includes("MutationObserver"));
  assert.ok(!/fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|setInterval\s*\(/.test(loader + model + view));
});

test("all seven roles and all 21 fixed service identities remain explicit", () => {
  for (const role of ["clock", "pulse", "memory", "thermal", "signal", "contention", "recovery"]) assert.ok(model.includes(`"${role}"`));
  const block = model.match(/FIXED_SERVICES = Object\.freeze\(\[([\s\S]*?)\]\)/)?.[1] || "";
  assert.equal([...block.matchAll(/"([a-z0-9-]+)"/g)].length, 21);
});

test("protected states and source qualities are textual as well as coloured", () => {
  for (const token of ["OK", "WARN", "CRIT", "UNK", "NO MEAS", "FIXTURE", "REPLAY", "LIVE STALE"]) assert.ok((model + view).includes(token));
  for (const state of ["healthy", "degraded", "down", "unknown", "unmeasured"]) assert.ok(css.includes(`[data-status="${state}"]`) || model.includes(state));
  for (const source of ["live", "stale", "fixture", "replay", "connecting"]) assert.ok(css.includes(`[data-freshness="${source}"]`));
});

test("selection delegates to current nodes and table controls", () => {
  assert.ok(view.includes('new MouseEvent("click"'));
  assert.ok(view.includes('row?.querySelector("button")?.click()'));
  assert.ok(view.includes('[data-apu-role-highlight="${role}"]'));
  assert.ok(!view.includes("localStorage"));
});

test("external dependencies are non-interactive topology boundaries", () => {
  const block = view.slice(view.indexOf("function boundary"), view.indexOf("function facts"));
  assert.ok(block.includes("rack-boundary__port"));
  assert.ok(!block.includes('el("button"'));
  assert.match(block, /No health claim/);
});

test("comparison is browser-local and limited to channels A and B", () => {
  assert.ok(loader.includes('const probes = { A: "", B: "" }'));
  assert.ok(view.includes('for (const slot of ["A", "B"])'));
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(loader + view));
});

test("current Stage 2A contracts stay intact", () => {
  assert.ok(shell.includes("system-symphony-navigation.js?v=20260727-stage-2a-polish-fixes"));
  assert.ok(shell.includes("trace-role-bridge.js?v=20260726-phase-d-role-routing-v1"));
  assert.ok(view.includes('[data-metric="deployment"]'));
  assert.ok(css.includes(".has-rack-instrument .symphony-orchestra__grid"));
  assert.ok(css.includes(".has-rack-instrument [data-topology]"));
});

test("mobile keyboard and reduced motion contracts are present", () => {
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.ok(css.includes('[data-narrow="1"]'));
  assert.ok(css.includes(":focus-visible"));
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.ok(loader.includes("if (next === width) return"));
  assert.ok(view.includes("data-focus-key"));
});

test("proof replay black box and query ownership remain untouched", () => {
  for (const token of ["data-proof-tab", "data-page-replay-apply", "data-current-cartridge-cover"]) assert.ok(!loader.includes(token) && !view.includes(token));
  assert.ok(!/history\.(pushState|replaceState)|location\.(assign|replace)/.test(loader + view));
});
