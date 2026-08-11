import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BREACH,
  CELL_COUNT,
  GRID_H,
  GRID_W,
  MODE_MANUAL,
  MODE_POLICY,
  TARGET,
  attentionCoverage,
  cellLabel,
  census,
  createField,
  createRandom,
  formatDuration,
  formatPercent,
  meanHealth,
  normalizeSeed,
  step,
} from "../drift/drift-core.js";

const html = readFileSync(new URL("../drift/index.html", import.meta.url), "utf8");
const source = readFileSync(new URL("../drift/drift.js", import.meta.url), "utf8");

const DT = 1 / 60;

function advance(field, seconds, mode, attention) {
  for (let index = 0; index < Math.round(seconds / DT); index += 1) {
    step(field, DT, mode, attention);
  }
  return meanHealth(field);
}

function parked(x, y) {
  return { x, y, active: true };
}

test("a seeded estate is deterministic and starts near conformance", () => {
  const first = createField(311);
  const second = createField(311);

  assert.deepEqual(Array.from(first.health), Array.from(second.health));
  assert.deepEqual(Array.from(first.rate), Array.from(second.rate));
  assert.equal(first.health.length, CELL_COUNT);
  assert.ok(meanHealth(first) > TARGET);
  assert.equal(census(first).breached, 0);
});

test("two estates from different seeds are not the same estate", () => {
  const first = createField(311);
  const second = createField(312);
  assert.notDeepEqual(Array.from(first.health), Array.from(second.health));
});

test("an unattended estate loses conformance and eventually breaches", () => {
  const field = createField(311);
  const after = advance(field, 90, MODE_MANUAL, { x: 0, y: 0, active: false });

  assert.ok(after < 0.7, `expected decay below 0.7, saw ${after}`);
  assert.ok(census(field).breached > 0);
});

test("attention repairs what it covers and nothing else", () => {
  const field = createField(311);
  advance(field, 20, MODE_MANUAL, parked(4, 4));

  const covered = field.health[4 * GRID_W + 4];
  const distant = field.health[12 * GRID_W + 28];

  assert.ok(covered > 0.99, `covered node should hold, saw ${covered}`);
  assert.ok(distant < 0.95, `distant node should drift, saw ${distant}`);
});

test("one operator cannot cover the estate", () => {
  const coverage = attentionCoverage();
  assert.ok(coverage > 0, "the attention field must cover something");
  assert.ok(coverage < 0.1, `coverage should stay under a tenth, saw ${coverage}`);
});

test("contagion makes a bad neighbourhood worse than an isolated node", () => {
  const clustered = createField(311);
  const isolated = createField(311);
  const rate = clustered.rate[8 * GRID_W + 16];

  // Same node, same decay rate, different surroundings.
  for (let row = 6; row <= 10; row += 1) {
    for (let column = 14; column <= 18; column += 1) {
      if (row === 8 && column === 16) continue;
      clustered.health[row * GRID_W + column] = 0.05;
    }
  }

  advance(clustered, 10, MODE_MANUAL, { x: 0, y: 0, active: false });
  advance(isolated, 10, MODE_MANUAL, { x: 0, y: 0, active: false });

  const inCluster = clustered.health[8 * GRID_W + 16];
  const alone = isolated.health[8 * GRID_W + 16];

  assert.equal(rate, isolated.rate[8 * GRID_W + 16]);
  assert.ok(inCluster < alone, `contagion should bite, ${inCluster} vs ${alone}`);
});

test("policy holds the whole estate without any attention at all", () => {
  const field = createField(311);
  const after = advance(field, 120, MODE_POLICY, { x: 0, y: 0, active: false });

  assert.ok(after > TARGET, `policy should stay above target, saw ${after}`);
  assert.equal(census(field).breached, 0);
  assert.ok(field.heldSeconds > 100);
});

test("policy recovers an estate that was lost by hand", () => {
  const field = createField(311);
  const lost = advance(field, 90, MODE_MANUAL, { x: 0, y: 0, active: false });
  const recovered = advance(field, 120, MODE_POLICY, { x: 0, y: 0, active: false });

  assert.ok(recovered > lost + 0.2, `expected recovery, ${lost} to ${recovered}`);
  assert.ok(recovered > TARGET);
});

test("the sweep visits every column", () => {
  const field = createField(311);
  const seen = new Set();
  for (let index = 0; index < Math.round(8 / DT); index += 1) {
    step(field, DT, MODE_POLICY, null);
    seen.add(Math.floor(field.sweep));
  }
  assert.ok(seen.size > GRID_W, `sweep should traverse the lattice, saw ${seen.size}`);
});

test("the census agrees with the breach threshold", () => {
  const field = createField(311);
  field.health.fill(1);
  field.health[0] = BREACH - 0.01;
  field.health[1] = BREACH + 0.01;

  const counts = census(field);
  assert.equal(counts.breached, 1);
  assert.equal(counts.worstIndex, 0);
});

test("labels and formatting stay stable", () => {
  assert.equal(cellLabel(0), "a00");
  assert.equal(cellLabel(GRID_W + 5), "b05");
  assert.equal(cellLabel(CELL_COUNT - 1), cellLabel((GRID_H - 1) * GRID_W + GRID_W - 1));
  assert.equal(formatDuration(0), "0s");
  assert.equal(formatDuration(64), "1m 04s");
  assert.equal(formatPercent(0.9312, 1), "93.1%");
});

test("seed normalisation falls back to something usable", () => {
  assert.equal(normalizeSeed("311"), 311);
  assert.ok(normalizeSeed(null) > 0);
  assert.notEqual(createRandom(1)(), createRandom(2)());
});

test("the page carries its own accessible controls", () => {
  assert.match(html, /id="drift-canvas"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="mode-manual"[^>]*aria-pressed/);
  assert.match(html, /id="mode-policy"/);
  assert.match(html, /canonical" href="https:\/\/atlas-systems\.uk\/lab\/drift\/"/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /ArrowLeft/);
});
