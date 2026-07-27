import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  ATLAS_FIELD_PRESETS,
  chooseParticleBudget,
  createSeededRandom,
  fieldAngle,
  hashSeed,
  influencedLightPosition,
  lightPosition,
  pointerAttraction,
  resolveAtlasFieldOptions,
} from "../../static/js/atlas-field.js";

test("AtlasField exposes deterministic seeded randomness", () => {
  const first = createSeededRandom(hashSeed("atlas"));
  const second = createSeededRandom(hashSeed("atlas"));
  assert.deepEqual(
    [first(), first(), first(), first()],
    [second(), second(), second(), second()],
  );
});

test("hero preset keeps particle budgets bounded", () => {
  assert.equal(chooseParticleBudget(320, 480), 520);
  assert.equal(chooseParticleBudget(4000, 3000), 1800);
  assert.ok(chooseParticleBudget(1440, 900) > chooseParticleBudget(390, 700));
});

test("AtlasField reduces density for constrained devices", () => {
  const normal = chooseParticleBudget(1440, 900, { deviceMemory: 8 });
  const constrained = chooseParticleBudget(1440, 900, {
    coarsePointer: true,
    saveData: true,
    deviceMemory: 4,
  });
  assert.ok(constrained < normal);
  assert.ok(constrained >= 520);
});

test("field angle is stable for equal coordinates and time", () => {
  const first = fieldAngle(320, 180, 120);
  const second = fieldAngle(320, 180, 120);
  assert.equal(first, second);
  assert.ok(Number.isFinite(first));
});

test("autonomous light stays inside the host bounds and moves with time", () => {
  const first = lightPosition(1440, 900, 0);
  const second = lightPosition(1440, 900, 12000);
  for (const point of [first, second]) {
    assert.ok(point.x >= 0 && point.x <= 1440);
    assert.ok(point.y >= 0 && point.y <= 900);
  }
  assert.notDeepEqual(first, second);
});

test("pointer influence nudges rather than replaces autonomous light", () => {
  const autonomous = lightPosition(1200, 800, 5000);
  const pointer = { active: true, x: 0, y: 800 };
  const influenced = influencedLightPosition(1200, 800, 5000, pointer);

  assert.ok(influenced.x < autonomous.x);
  assert.ok(influenced.y > autonomous.y);
  assert.notEqual(influenced.x, pointer.x);
  assert.notEqual(influenced.y, pointer.y);
  assert.ok(Math.abs(influenced.x - autonomous.x) < Math.abs(pointer.x - autonomous.x) * 0.43);
  assert.ok(Math.abs(influenced.y - autonomous.y) < Math.abs(pointer.y - autonomous.y) * 0.43);
});

test("inactive pointer preserves the autonomous light path", () => {
  const influenced = influencedLightPosition(1200, 800, 5000, { active: false, x: 0, y: 0 });
  const autonomous = lightPosition(1200, 800, 5000);
  assert.deepEqual({ ...influenced }, { ...autonomous });
});

test("pointer attraction supplies bounded radial and orbital force", () => {
  const force = pointerAttraction(100, 100, { active: true, x: 180, y: 140 }, 240);
  assert.ok(force.x > 0);
  assert.ok(force.y > 0);
  assert.ok(force.influence > 0 && force.influence < 1);
  assert.ok(Math.hypot(force.x, force.y) < 0.15);
});

test("pointer attraction is zero outside the local radius", () => {
  const force = pointerAttraction(100, 100, { active: true, x: 500, y: 500 }, 120);
  assert.deepEqual({ ...force }, { x: 0, y: 0, influence: 0 });
});

test("AtlasField resolves reusable presets without mutating their defaults", () => {
  const options = resolveAtlasFieldOptions({
    preset: "ambient",
    seed: "custom-seed",
    density: { max: 700 },
  });

  assert.equal(options.preset, "ambient");
  assert.equal(options.seed, "custom-seed");
  assert.equal(options.density.max, 700);
  assert.equal(options.density.min, ATLAS_FIELD_PRESETS.ambient.density.min);
  assert.equal(ATLAS_FIELD_PRESETS.ambient.density.max, 900);
  assert.ok(Object.isFrozen(options));
  assert.ok(Object.isFrozen(options.density));
});

test("unknown AtlasField presets fail closed", () => {
  assert.throws(
    () => resolveAtlasFieldOptions({ preset: "unknown" }),
    /Unknown AtlasField preset/,
  );
});

test("homepage truth module independently restores the field and its current styles", () => {
  const source = fs.readFileSync("static/js/live/homepage-truth.js", "utf8");
  assert.match(source, /HOMEPAGE_FIELD_CSS = "\/css\/home-v2-base\.css\?v=20260727-atlas-field-production-v1"/);
  assert.match(source, /HOMEPAGE_FIELD_MODULE = "\/static\/js\/atlas-field\.js\?v=20260727-atlas-field-production-v1"/);
  assert.match(source, /querySelector\(":scope > canvas\.atlas-field-canvas"\)/);
  assert.match(source, /createAtlasField\(hero, \{ preset: "hero" \}\)/);
  assert.match(source, /void initHomepageFieldFallback\(\)/);
});

test("production deploy verifies visible homepage AtlasField pixels", () => {
  const workflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8");
  const smoke = fs.readFileSync("scripts/smoke_homepage_atlas_field_production.mjs", "utf8");
  assert.match(workflow, /node scripts\/smoke_homepage_atlas_field_production\.mjs/);
  assert.match(workflow, /homepage-atlas-field-production-smoke/);
  assert.match(smoke, /canvas\.atlas-field-canvas/);
  assert.match(smoke, /luminousPixels >= 8/);
  assert.match(smoke, /heroState, "ready"/);
});
