import test from "node:test";
import assert from "node:assert/strict";
import {
  FIXED_SERVICES,
  NARROW_BREAKPOINT,
  ROLE_META,
  ROLE_ORDER,
  cordPath,
  estateStateKey,
  normaliseStatus,
  roleFromText,
  routesForSelection,
  sourceKey,
} from "../../lab/system-symphony/rack-model.js";

test("the seven APU roles exist once and keep honest lane kinds", () => {
  assert.deepEqual(ROLE_ORDER, ["clock", "pulse", "memory", "thermal", "signal", "contention", "recovery"]);
  assert.equal(new Set(ROLE_ORDER).size, 7);
  assert.match(ROLE_META.clock[1], /Timing/);
  assert.match(ROLE_META.recovery[1], /Event/);
});

test("role mapping mirrors established APU labels", () => {
  assert.equal(roleFromText("Pulse clock"), "pulse");
  assert.equal(roleFromText("Memory field"), "memory");
  assert.equal(roleFromText("Thermal rail"), "thermal");
  assert.equal(roleFromText("Signal noise"), "signal");
  assert.equal(roleFromText("Contention bus"), "contention");
  assert.equal(roleFromText("Recovery bus"), "recovery");
  assert.equal(roleFromText("unmapped"), "signal");
});

test("status and evidence quality never promote absence to healthy", () => {
  assert.equal(normaliseStatus("healthy"), "healthy");
  assert.equal(normaliseStatus("warning"), "degraded");
  assert.equal(normaliseStatus("critical"), "down");
  assert.equal(normaliseStatus("unknown"), "unknown");
  assert.equal(normaliseStatus("topology only"), "unmeasured");
  assert.notEqual(normaliseStatus("unknown"), "healthy");
  assert.equal(sourceKey("preview"), "fixture");
  assert.equal(sourceKey("demo"), "replay");
  assert.equal(sourceKey("stale"), "stale");
  assert.equal(estateStateKey("Unknown / F Aeolian"), "unknown");
  assert.equal(estateStateKey("Healthy / F Aeolian"), "healthy");
});

test("the fixed sonification frame stays at the exact 21 identities", () => {
  assert.equal(FIXED_SERVICES.length, 21);
  assert.equal(new Set(FIXED_SERVICES).size, 21);
  assert.equal(FIXED_SERVICES[0], "ramone-memory");
  assert.equal(FIXED_SERVICES.at(-1), "status");
  assert.ok(Object.isFrozen(FIXED_SERVICES));
});

test("cord geometry is deterministic and visibly bowed", () => {
  const path = cordPath({ x: 100, y: 10 }, { x: 400, y: 200 });
  assert.equal(path, cordPath({ x: 100, y: 10 }, { x: 400, y: 200 }));
  assert.match(path, /^M 100\.0 10\.0 C /);
  assert.equal((path.match(/C/g) ?? []).length, 1);
});

const estate = [
  { id: "atlas-systems", role: "pulse", deps: ["github-pulse", "deploy-watch"], dependents: ["atlas-journey-watch"] },
  { id: "github-pulse", role: "contention", deps: [], dependents: ["atlas-systems"] },
  { id: "deploy-watch", role: "contention", deps: [], dependents: ["atlas-systems"] },
  { id: "atlas-journey-watch", role: "contention", deps: ["atlas-systems"], dependents: [] },
];

test("service selection yields directed inbound and outbound declared routes", () => {
  const routes = routesForSelection(estate, "atlas-systems", "");
  assert.equal(routes.filter((route) => route.direction === "out").length, 2);
  assert.equal(routes.filter((route) => route.direction === "in").length, 1);
});

test("role selection yields only that lane's outbound routes", () => {
  const routes = routesForSelection(estate, "", "contention");
  assert.ok(routes.length > 0);
  for (const route of routes) assert.equal(estate.find((item) => item.id === route.from).role, "contention");
  assert.deepEqual(routesForSelection(estate, "", "clock"), []);
});

test("the responsive breakpoint is a deliberate mobile transformation", () => {
  assert.ok(NARROW_BREAKPOINT >= 600 && NARROW_BREAKPOINT <= 900);
});
