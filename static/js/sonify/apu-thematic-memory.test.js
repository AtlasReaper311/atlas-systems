import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  APU_THEMATIC_MEMORY_HISTORY_LIMIT,
  createInitialThematicMemory,
  createThematicMemoryStore,
  updateThematicMemory,
} from "./apu-thematic-memory.js";

function plan(index, overrides = {}) {
  return {
    phraseIndex: index,
    cycleNumber: Math.floor(index / 16),
    cycleRole: index < 16 ? "statement" : "development",
    phraseRole: index % 2 ? "answer" : "statement",
    state: "healthy",
    themeId: "ATLAS_THEME",
    themeVersion: 0,
    transform: index % 2 ? "answer" : "identity",
    cadenceIntent: "open",
    harmonyIntent: { from: "home", to: "home" },
    bassRole: "walking-support",
    rhythmRole: "groove",
    arpFunction: "connector",
    orchestrationRole: { foreground: "primary", telemetryDetail: "quiet-services" },
    memoryUpdate: { unresolvedQuestion: { sourcePhrase: index }, recoverySourceTheme: null },
    ...overrides,
  };
}

test("initial memory is frozen, bounded, and serialisable", () => {
  const memory = createInitialThematicMemory();
  assert.ok(Object.isFrozen(memory));
  assert.equal(memory.historyLimit, APU_THEMATIC_MEMORY_HISTORY_LIMIT);
  assert.doesNotThrow(() => JSON.stringify(memory));
});

test("memory records statements and answers without mutating previous snapshots", () => {
  const first = createInitialThematicMemory();
  const second = updateThematicMemory(first, plan(0));
  const third = updateThematicMemory(second, plan(1));
  assert.equal(first.revision, 0);
  assert.equal(second.lastStatement.phraseIndex, 0);
  assert.equal(third.lastAnswer.phraseIndex, 1);
  assert.ok(Object.isFrozen(third.lastAnswer));
});

test("all histories remain bounded after long journeys", () => {
  const store = createThematicMemoryStore({ historyLimit: 5 });
  for (let index = 0; index < 200; index += 1) store.commit(plan(index));
  const memory = store.getSnapshot();
  for (const [name, value] of Object.entries(memory)) {
    if (name.startsWith("recent") || name.endsWith("History")) {
      assert.ok(value.length <= 5, name);
    }
  }
  assert.ok(memory.stateHistory.length <= 5);
});

test("a supported recovery clears unresolved questions and remembers origin", () => {
  const store = createThematicMemoryStore();
  store.commit(plan(0, { state: "critical", cadenceIntent: "interrupted" }));
  const recovered = store.commit(plan(1, {
    state: "healthy",
    phraseRole: "reprise",
    transform: "reprise",
    cadenceIntent: "recovery",
    memoryUpdate: {
      unresolvedQuestion: null,
      recoverySourceTheme: { themeId: "ATLAS_THEME", fromState: "critical", fromVersion: 2 },
    },
  }));
  assert.equal(recovered.unresolvedQuestion, null);
  assert.equal(recovered.recoverySourceTheme.fromState, "critical");
  assert.equal(recovered.transitionOrigin, "critical");
  assert.equal(recovered.transitionDestination, "healthy");
});

test("reset returns the exact known initial state", () => {
  const store = createThematicMemoryStore();
  const initial = store.getSnapshot();
  store.commit(plan(0));
  assert.deepEqual(store.reset(), initial);
});

test("thematic memory source contains no randomness, wall clock, or audio APIs", () => {
  const source = fs.readFileSync(new URL("./apu-thematic-memory.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Math\.random|Date\.now|AudioContext|OfflineAudioContext|Tone\./);
});
