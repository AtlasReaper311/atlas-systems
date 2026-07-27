import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  PASS_D1_BASELINE_IDS,
  createD1SongPlanJourney,
  createPassD1SongPlanBaseline,
  createPassD1SongPlanManifest,
} from "./apu-song-plan-baselines.js";

const SINGLE_STATE_IDS = Object.freeze([
  "explorer-64-bars",
  "grid-pressure-64-bars",
  "boss-protocol-64-bars",
  "lost-signal-64-bars",
]);

test("D1 baseline overlays every D0 journey", () => {
  assert.equal(PASS_D1_BASELINE_IDS.length, 14);
  const manifest = createPassD1SongPlanManifest();
  assert.deepEqual(manifest.journeys.map((journey) => journey.id), PASS_D1_BASELINE_IDS);
});

test("single-state journeys cover two cycles with related but distinct plans", () => {
  for (const id of SINGLE_STATE_IDS) {
    const journey = createD1SongPlanJourney(id);
    assert.equal(journey.phraseCount, 32);
    assert.deepEqual([...new Set(journey.entries.map((entry) => entry.songPlan.themeId))], ["ATLAS_THEME"]);
    assert.deepEqual([...new Set(journey.entries.map((entry) => entry.songPlan.cycleRole))], ["statement", "development"]);
    const first = journey.entries.slice(0, 16).map((entry) => `${entry.songPlan.phraseRole}:${entry.songPlan.transform}`);
    const second = journey.entries.slice(16, 32).map((entry) => `${entry.songPlan.phraseRole}:${entry.songPlan.transform}`);
    assert.notDeepEqual(first, second, id);
  }
});

test("state transitions preserve theme identity and record transformation origin", () => {
  const journey = createD1SongPlanJourney("grid-pressure-to-boss-protocol");
  assert.deepEqual([...new Set(journey.entries.map((entry) => entry.songPlan.themeId))], ["ATLAS_THEME"]);
  const transition = journey.entries.find((entry) => entry.songPlan.transitionRole === "compress-theme");
  assert.ok(transition);
  assert.equal(transition.thematicMemory.transitionOrigin, "warning");
  assert.equal(transition.thematicMemory.transitionDestination, "critical");
});

test("incomplete replay cannot emit recovery or resolved cadence", () => {
  const journey = createD1SongPlanJourney("replay-incomplete-evidence");
  assert.ok(journey.entries.every((entry) => !["recovery", "resolved"].includes(entry.songPlan.cadenceIntent)));
  assert.ok(journey.finalMemory.unresolvedQuestion);
});

test("confirmed replay recovery reprises theme and clears unresolved memory", () => {
  const journey = createD1SongPlanJourney("replay-confirmed-recovery");
  const recovery = journey.entries.find((entry) => entry.songPlan.cadenceIntent === "recovery");
  assert.ok(recovery);
  assert.equal(recovery.songPlan.themeId, "ATLAS_THEME");
  assert.equal(recovery.songPlan.transform, "reprise");
  assert.equal(recovery.thematicMemory.unresolvedQuestion, null);
  assert.equal(recovery.thematicMemory.recoverySourceTheme.fromState, "critical");
});

test("every memory trace remains bounded", () => {
  const baseline = createPassD1SongPlanBaseline();
  for (const journey of baseline.journeys) {
    for (const entry of journey.entries) {
      for (const [name, value] of Object.entries(entry.thematicMemory)) {
        if (name.startsWith("recent") || name.endsWith("History") || name === "stateHistory") {
          assert.ok(value.length <= 8, `${journey.id}:${entry.phraseIndex}:${name}`);
        }
      }
    }
  }
});

test("baseline generation is byte equivalent", () => {
  const first = createPassD1SongPlanBaseline();
  const second = createPassD1SongPlanBaseline();
  assert.deepEqual(first, second);
  assert.equal(first.digest, second.digest);
});

test("D1 baseline sources contain no randomness, wall clock, or audio APIs", () => {
  for (const file of ["apu-song-plan-baselines.js", "apu-song-plan.js", "apu-thematic-memory.js"]) {
    const source = fs.readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /Math\.random|Date\.now|AudioContext|OfflineAudioContext|Tone\./);
  }
});
