import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../../static/js/homepage-interactions.js", import.meta.url), "utf8");
const context = {
  __ATLAS_TEST__: true,
  console,
  document: {
    readyState: "loading",
    addEventListener() {},
  },
};
context.globalThis = context;
vm.runInNewContext(source, context, { filename: "homepage-interactions.js" });

const field = context.__atlasHomepageField;

test("homepage field exposes deterministic seeded randomness", () => {
  const first = field.createSeededRandom(field.hashSeed("atlas"));
  const second = field.createSeededRandom(field.hashSeed("atlas"));
  assert.deepEqual(
    [first(), first(), first(), first()],
    [second(), second(), second(), second()],
  );
});

test("homepage field keeps particle budgets bounded", () => {
  assert.equal(field.chooseParticleBudget(320, 480), 520);
  assert.equal(field.chooseParticleBudget(4000, 3000), 1800);
  assert.ok(field.chooseParticleBudget(1440, 900) > field.chooseParticleBudget(390, 700));
});

test("homepage field reduces density for constrained devices", () => {
  const normal = field.chooseParticleBudget(1440, 900, { deviceMemory: 8 });
  const constrained = field.chooseParticleBudget(1440, 900, {
    coarsePointer: true,
    saveData: true,
    deviceMemory: 4,
  });
  assert.ok(constrained < normal);
  assert.ok(constrained >= 520);
});

test("homepage field angle is stable for equal coordinates and time", () => {
  const first = field.fieldAngle(320, 180, 120);
  const second = field.fieldAngle(320, 180, 120);
  assert.equal(first, second);
  assert.ok(Number.isFinite(first));
});

test("homepage light stays inside the hero bounds and moves with time", () => {
  const first = field.lightPosition(1440, 900, 0);
  const second = field.lightPosition(1440, 900, 12000);
  for (const point of [first, second]) {
    assert.ok(point.x >= 0 && point.x <= 1440);
    assert.ok(point.y >= 0 && point.y <= 900);
  }
  assert.notDeepEqual(first, second);
});
