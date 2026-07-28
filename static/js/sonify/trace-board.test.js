import assert from "node:assert/strict";
import test from "node:test";

import {
  MOBILE_BOARD,
  TRACE_BOARD_DISTRICTS,
  boardGeometry,
  chamferedPath,
  chipKindToken,
  chipStateForVoice,
  compactLatency,
  copperRoute,
  districtIndexForLayer,
  routeOffsets,
} from "./trace-board.js";

function voice(overrides = {}) {
  return {
    name: "atlas-notify",
    layer: "observability",
    kind: "worker",
    measured: true,
    latency_ms: 39,
    evidenceState: "measured",
    ...overrides,
  };
}

test("districts regroup existing layers without inventing a second truth", () => {
  assert.equal(TRACE_BOARD_DISTRICTS.length, 5);
  assert.equal(districtIndexForLayer("local-ai"), 0);
  assert.equal(districtIndexForLayer("edge"), 1);
  assert.equal(districtIndexForLayer("observability"), 2);
  assert.equal(districtIndexForLayer("infra"), 2);
  assert.equal(districtIndexForLayer("public-api"), 3);
  // An unrecognised layer lands on measured surfaces rather than the external
  // boundary, so a real component is never labelled as somebody else's system.
  assert.equal(districtIndexForLayer("something-new"), 3);
  assert.equal(districtIndexForLayer(undefined), 3);
});

test("an unmeasured component gets no LED and no substituted metric", () => {
  const state = chipStateForVoice(
    voice({ measured: false, latency_ms: null, evidenceState: "topology-only" }),
    { key: "unmeasured", label: "Unmeasured" },
  );
  assert.equal(state.showLed, false);
  assert.equal(state.showMetric, false);
  assert.equal(state.code, "NO MEAS");
  assert.ok(!state.meta.includes("ms"));
});

test("a measured component with no latency still refuses a fabricated metric", () => {
  const state = chipStateForVoice(
    voice({ latency_ms: null }),
    { key: "unknown", label: "Unknown" },
  );
  assert.equal(state.showLed, true);
  assert.equal(state.showMetric, false);
  assert.equal(state.code, "UNKN");
});

test("stale is distinct from unknown and says last known", () => {
  const stale = chipStateForVoice(
    voice({ evidenceState: "stale" }),
    { key: "unknown", label: "Unknown" },
  );
  const unknown = chipStateForVoice(
    voice({ evidenceState: "reported-unknown" }),
    { key: "unknown", label: "Unknown" },
  );

  assert.equal(stale.code, "LAST KNOWN");
  assert.equal(stale.stale, true);
  assert.equal(unknown.code, "UNKN");
  assert.equal(unknown.stale, false);
  assert.notEqual(stale.code, unknown.code);
  // Stale keeps the component inspectable rather than blanking its reading.
  assert.equal(stale.showMetric, true);
});

test("no measured state is ever promoted to healthy", () => {
  for (const key of ["degraded", "down", "unknown", "unmeasured"]) {
    const state = chipStateForVoice(voice(), { key, label: key });
    assert.notEqual(state.code, "OK");
  }
  assert.equal(chipStateForVoice(voice(), { key: "healthy", label: "Healthy" }).code, "OK");
});

test("chip kind falls back to the layer when the merge supplies a placeholder", () => {
  assert.equal(chipKindToken(voice({ kind: "worker" })), "worker");
  assert.equal(chipKindToken(voice({ kind: "measured-service", layer: "surface" })), "site");
  assert.equal(chipKindToken(voice({ kind: "component", layer: "local-ai" })), "local");
  assert.equal(chipKindToken({ kind: "", layer: "unknown" }), "node");
});

test("latency formatting stays honest about missing readings", () => {
  assert.equal(compactLatency(412), "412ms");
  assert.equal(compactLatency(null), "");
  assert.equal(compactLatency(Number.NaN), "");
});

test("desktop geometry places districts in columns and skips empty ones", () => {
  const board = boardGeometry({
    voices: [
      voice({ name: "ollama", layer: "local-ai" }),
      voice({ name: "specular-edge", layer: "edge" }),
      voice({ name: "atlas-notify", layer: "observability" }),
      voice({ name: "atlas-blackbox", layer: "observability" }),
    ],
    externalNodes: ["github"],
    layout: "desktop",
  });

  assert.equal(board.layout, "desktop");
  assert.equal(board.width, 1360);
  // local-ai, edge, observability and the boundary are populated; the
  // measured-surfaces district is empty and must not leave a gap.
  assert.equal(board.districts.length, 4);
  assert.deepEqual(board.districts.map((d) => d.column), [0, 1, 2, 3]);
  assert.equal(board.chips.get("github").external, true);
  assert.equal(board.chips.get("atlas-notify").column, board.chips.get("atlas-blackbox").column);
  assert.notEqual(board.chips.get("atlas-notify").y, board.chips.get("atlas-blackbox").y);
});

test("a deep district spills sideways instead of stretching the board", () => {
  const voices = Array.from({ length: 12 }, (unused, index) =>
    voice({ name: `worker-${String(index).padStart(2, "0")}`, layer: "edge" }));
  const board = boardGeometry({ voices, layout: "desktop" });

  const lowest = Math.max(...[...board.chips.values()].map((chip) => chip.y + chip.h));
  assert.equal(board.height, 584, "the board keeps its designed height");
  assert.ok(lowest < board.height, "no chip may fall outside the board");

  // Twelve components at six rows per column occupy two balanced columns.
  const [district] = board.districts;
  assert.equal(district.span, 2);
  const columns = new Set([...board.chips.values()].map((chip) => chip.column));
  assert.deepEqual([...columns].sort(), [0, 1]);
  const perColumn = [...columns].map(
    (column) => [...board.chips.values()].filter((chip) => chip.column === column).length,
  );
  assert.deepEqual(perColumn, [6, 6]);
});

test("the board widens rather than clipping when every district is deep", () => {
  const voices = TRACE_BOARD_DISTRICTS.flatMap((district, index) =>
    Array.from({ length: 8 }, (unused, item) =>
      voice({ name: `svc-${index}-${item}`, layer: district.layers[0] ?? "public-api" })));
  const board = boardGeometry({ voices, layout: "desktop" });

  const rightmost = Math.max(...[...board.chips.values()].map((chip) => chip.x + chip.w));
  assert.ok(board.width > 1360, "an overfull board must widen");
  assert.ok(rightmost < board.width, "no chip may fall off the right edge");
});

test("mobile recomposes into stacked bands with 44px-plus touch targets", () => {
  const board = boardGeometry({
    voices: [
      voice({ name: "ollama", layer: "local-ai" }),
      voice({ name: "specular-edge", layer: "edge" }),
    ],
    layout: "mobile",
  });

  assert.equal(board.layout, "mobile");
  assert.equal(board.width, MOBILE_BOARD.width);
  const chips = [...board.chips.values()];
  for (const chip of chips) {
    // The board is scaled to fit a phone-width container, so the authored
    // height needs headroom above 44 rather than sitting exactly on it.
    assert.ok(chip.h >= 44, `chip height ${chip.h} is below the 44px minimum`);
    const scaledToNarrowestPhone = chip.h * (320 / MOBILE_BOARD.width);
    assert.ok(
      scaledToNarrowestPhone >= 44,
      `chip height ${chip.h} drops below 44px once scaled to a 320px container`,
    );
  }
  // Bands stack vertically: every chip sits on its own row.
  const ys = chips.map((chip) => chip.y);
  assert.equal(new Set(ys).size, ys.length);
  assert.deepEqual(board.districts.map((d) => d.count), [1, 1]);
  assert.equal(board.districts[0].measured, 1);
});

test("copper routes are orthogonal and long hops leave the chip rows", () => {
  const from = { x: 80, y: 90, w: 170, h: 46, column: 0 };
  const near = { x: 340, y: 168, w: 170, h: 46, column: 1 };
  const far = { x: 1140, y: 168, w: 170, h: 46, column: 4 };

  const shortHop = copperRoute(from, near, { topBus: 64, bottomBus: 546 });
  for (let index = 1; index < shortHop.length; index += 1) {
    const previous = shortHop[index - 1];
    const point = shortHop[index];
    const orthogonal =
      Math.abs(previous.x - point.x) < 0.01 || Math.abs(previous.y - point.y) < 0.01;
    assert.ok(orthogonal, "every routed segment must be horizontal or vertical");
  }

  const longHop = copperRoute(from, far, { topBus: 64, bottomBus: 546 });
  assert.ok(
    longHop.some((point) => Math.abs(point.y - 64) < 20),
    "a hop across two or more districts must use the bus channel",
  );
});

test("parallel traces into one chip are separated", () => {
  const offsets = routeOffsets([
    { from: "a", to: "z" },
    { from: "b", to: "z" },
    { from: "c", to: "z" },
  ]);
  const values = [...offsets.values()];
  assert.equal(new Set(values).size, 3);
  assert.deepEqual(values, [-12, 0, 12]);
});

test("chamfered paths cut corners instead of turning square", () => {
  const path = chamferedPath([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ], 9);

  assert.ok(path.startsWith("M 0 0"));
  assert.ok(path.includes("L 91 0"), "corner must be cut before the bend");
  assert.ok(path.includes("L 100 9"), "corner must resume after the bend");
  assert.ok(path.endsWith("L 100 100"));
});

test("a degenerate route produces no path rather than a stray mark", () => {
  assert.equal(chamferedPath([]), "");
  assert.equal(chamferedPath([{ x: 4, y: 4 }]), "");
});
