import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  APU_MASTER_STAGE_PROFILES,
  APU_MASTER_STAGE_PROFILES_BUILD_ID,
  masterStageProfileForState,
  masterStageProfileSafetyEnvelope,
} from "./apu-master-stage-profiles.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(path.join(HERE, "apu-master-stage-profiles.js"), "utf-8");

test("build id is a non-empty string", () => {
  assert.equal(typeof APU_MASTER_STAGE_PROFILES_BUILD_ID, "string");
  assert.ok(APU_MASTER_STAGE_PROFILES_BUILD_ID.length > 0);
});

test("every state has drive and quantiseWet", () => {
  for (const state of ["healthy", "warning", "critical", "unknown"]) {
    const p = masterStageProfileForState(state);
    assert.ok(Number.isFinite(p.drive));
    assert.ok(Number.isFinite(p.quantiseWet));
    assert.ok(typeof p.label === "string" && p.label.length > 0);
  }
});

test("profile is within safety envelope", () => {
  const env = masterStageProfileSafetyEnvelope();
  for (const state of ["healthy", "warning", "critical", "unknown"]) {
    const p = masterStageProfileForState(state);
    assert.ok(p.drive >= env.driveMin);
    assert.ok(p.drive <= env.driveMax);
    assert.ok(p.quantiseWet >= env.wetMin);
    assert.ok(p.quantiseWet <= env.wetMax);
  }
});

test("unknown state name falls back to unknown profile", () => {
  const bad = masterStageProfileForState("nonsense-state");
  const unknown = masterStageProfileForState("unknown");
  assert.equal(bad.drive, unknown.drive);
  assert.equal(bad.quantiseWet, unknown.quantiseWet);
});

test("critical is more compressed than healthy", () => {
  const h = masterStageProfileForState("healthy");
  const c = masterStageProfileForState("critical");
  assert.ok(c.drive > h.drive);
});

test("unknown has more DAC colour than healthy", () => {
  const h = masterStageProfileForState("healthy");
  const u = masterStageProfileForState("unknown");
  assert.ok(u.quantiseWet > h.quantiseWet);
});

test("frozen profiles", () => {
  assert.ok(Object.isFrozen(APU_MASTER_STAGE_PROFILES));
  for (const state of ["healthy", "warning", "critical", "unknown"]) {
    assert.ok(Object.isFrozen(APU_MASTER_STAGE_PROFILES[state]));
  }
});

test("source has no randomness or wall-clock", () => {
  const codeOnly = SOURCE.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  assert.doesNotMatch(codeOnly, /Math\.random\s*\(/);
  assert.doesNotMatch(codeOnly, /Date\.now\s*\(/);
});
