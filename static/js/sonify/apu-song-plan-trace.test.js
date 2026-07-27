import assert from "node:assert/strict";
import test from "node:test";
import { createScoreTraceEntry } from "./apu-score-trace.js";
import { createSongPlanner } from "./apu-song-plan.js";
import { enrichScoreTraceWithSongPlan } from "./apu-song-plan-trace.js";

const arrangement = Object.freeze({ phraseIndex: 0, cycleNumber: 0, cyclePhrase: 0, scoreState: "healthy", section: "theme-a", sectionLabel: "Theme A", motifMode: "theme", mix: { primary: 1, secondary: 0.8 }, harmony: [], bassPattern: "anchor", drumPattern: "groove", serviceDensity: 0.4 });

test("D1B enrichment is deterministic, frozen, and preserves D0 evidence", () => {
  const frame = { scoreState: "healthy", evidenceMode: "fixture", sourceLabel: "test" };
  const base = createScoreTraceEntry({ frame, arrangement });
  const plan = createSongPlanner().planPhrase({ frame, arrangement });
  const first = enrichScoreTraceWithSongPlan(base, plan);
  const second = enrichScoreTraceWithSongPlan(base, plan);
  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.thematicMemory));
  assert.equal(first.themeId, "ATLAS_THEME");
  assert.equal(first.cycleRole, "statement");
  assert.equal(first.phraseRole, "statement");
  assert.equal(first.evidenceSource.sourceLabel, "test");
  assert.match(first.deterministicSignature, /^[0-9a-f]{8}$/);
});

test("critical and unknown traces cannot claim resolution", () => {
  for (const state of ["critical", "unknown"]) {
    const frame = { scoreState: state, stale: state === "unknown" };
    const current = { ...arrangement, scoreState: state, section: "breathe" };
    const base = createScoreTraceEntry({ frame, arrangement: current });
    const plan = createSongPlanner().planPhrase({ frame, arrangement: current });
    const trace = enrichScoreTraceWithSongPlan(base, plan);
    assert.notEqual(trace.cadenceIntent, "resolved");
    assert.notEqual(trace.cadenceIntent, "recovery");
  }
});
