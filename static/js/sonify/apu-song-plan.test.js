import assert from "node:assert/strict";
import test from "node:test";
import { APU_THEMATIC_MEMORY_HISTORY_LIMIT, createThematicMemory } from "./apu-thematic-memory.js";
import { APU_CYCLE_ROLES, createSongPlanner } from "./apu-song-plan.js";

const arrangement = (phraseIndex, state = "healthy", section = "theme-a") => ({ phraseIndex, cycleNumber: Math.floor(phraseIndex / 16), cyclePhrase: phraseIndex % 16, scoreState: state, section, bassPattern: "anchor", drumPattern: "groove", motifMode: "theme", serviceDensity: 0.4 });

test("identical journeys produce byte-identical plans", () => {
  const run = () => { const planner = createSongPlanner(); return Array.from({ length: 40 }, (_, i) => planner.planPhrase({ frame: { scoreState: "healthy" }, arrangement: arrangement(i) })); };
  assert.equal(JSON.stringify(run()), JSON.stringify(run()));
});

test("cycle roles are explicit and later cycles develop", () => {
  const planner = createSongPlanner();
  const first = planner.planPhrase({ arrangement: arrangement(0) });
  let second;
  for (let i = 1; i <= 16; i += 1) second = planner.planPhrase({ arrangement: arrangement(i) });
  assert.equal(first.cycleRole, "statement");
  assert.equal(second.cycleRole, "development");
  assert.notEqual(first.transform, second.transform);
  assert.deepEqual(APU_CYCLE_ROLES.slice(0, 4), ["statement", "development", "contrast", "reprise"]);
});

test("memory stays bounded over thousands of phrases", () => {
  const planner = createSongPlanner();
  for (let i = 0; i < 5000; i += 1) planner.planPhrase({ arrangement: arrangement(i, i % 7 === 0 ? "warning" : "healthy") });
  const memory = planner.getMemory();
  for (const key of ["cadenceHistory", "recentPhraseRoles", "recentTransforms", "recentBassRoles", "recentRhythmRoles", "recentArpFunctions", "recentForegroundVoices", "recentServiceInfluences"]) assert.ok(memory[key].length <= APU_THEMATIC_MEMORY_HISTORY_LIMIT, key);
  assert.ok(Object.isFrozen(memory));
});

test("state changes preserve one shared theme", () => {
  const planner = createSongPlanner();
  const explorer = planner.planPhrase({ arrangement: arrangement(0, "healthy") });
  const warning = planner.planPhrase({ arrangement: arrangement(1, "warning") });
  const lost = planner.planPhrase({ arrangement: arrangement(2, "unknown") });
  assert.equal(explorer.themeId, "ATLAS_THEME");
  assert.equal(warning.themeId, explorer.themeId);
  assert.equal(lost.themeId, explorer.themeId);
  assert.equal(warning.transitionRole, "theme-preserving-transition");
});

test("recovery reprises the prior theme without inventing resolution", () => {
  const planner = createSongPlanner();
  planner.planPhrase({ arrangement: arrangement(0, "critical", "peak") });
  const criticalEnd = planner.planPhrase({ frame: { scoreState: "critical" }, arrangement: arrangement(1, "critical", "breathe") });
  const recovered = planner.planPhrase({ frame: { scoreState: "healthy", stale: false }, arrangement: arrangement(2, "healthy", "recovery") });
  assert.equal(criticalEnd.cadenceIntent, "interrupted");
  assert.equal(recovered.cadenceIntent, "recovery");
  assert.equal(recovered.transitionRole, "recovery-reprise");
  assert.equal(recovered.memoryUpdate.recoverySourceTheme, "ATLAS_THEME");
});

test("unknown or stale evidence cannot resolve", () => {
  const planner = createSongPlanner();
  const unknown = planner.planPhrase({ frame: { scoreState: "unknown", stale: true }, arrangement: arrangement(0, "unknown", "breathe") });
  assert.equal(unknown.cadenceIntent, "no-cadence");
});

test("reset returns to deterministic cycle zero", () => {
  const planner = createSongPlanner({ memory: createThematicMemory() });
  planner.planPhrase({ arrangement: arrangement(20, "warning") });
  planner.reset();
  const plan = planner.planPhrase({ arrangement: arrangement(0, "healthy") });
  assert.equal(plan.cycleNumber, 0);
  assert.equal(plan.cycleRole, "statement");
  assert.equal(planner.getMemory().phraseCount, 1);
});
