import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  APU_PERFORMANCE_DIRECTOR_V4_BUILD_ID,
  PERFORMANCE_PHASES,
  PERFORMANCE_PHASE_KEYS,
  createPerformanceDirector,
  fnv1a,
  phaseSpec,
  scheduledOrnamentsFor,
  silenceBudgetForPhase,
} from "./apu-performance-director-v4.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(path.join(HERE, "apu-performance-director-v4.js"), "utf-8");

const frame = (state) => Object.freeze({ scoreState: state });

// ---------------------------------------------------------------------------
// Metadata and constants
// ---------------------------------------------------------------------------

test("build id and constants are frozen", () => {
  assert.equal(typeof APU_PERFORMANCE_DIRECTOR_V4_BUILD_ID, "string");
  assert.ok(APU_PERFORMANCE_DIRECTOR_V4_BUILD_ID.length > 0);
  assert.ok(Object.isFrozen(PERFORMANCE_PHASES));
  assert.deepEqual(
    [...PERFORMANCE_PHASE_KEYS],
    ["intro", "groove", "pressure", "rupture", "recovery", "afterglow"],
  );
});

test("every phase has silenceBudget, density, minPhrases, and energy", () => {
  for (const key of PERFORMANCE_PHASE_KEYS) {
    const spec = PERFORMANCE_PHASES[key];
    assert.ok(spec, `${key} spec exists`);
    assert.ok(Number.isFinite(spec.silenceBudget));
    assert.ok(Number.isFinite(spec.density));
    assert.ok(Number.isInteger(spec.minPhrases));
    assert.ok(spec.minPhrases >= 1);
    assert.ok(typeof spec.energy === "string");
  }
});

test("silence budgets and densities are bounded 0..1", () => {
  for (const key of PERFORMANCE_PHASE_KEYS) {
    const spec = PERFORMANCE_PHASES[key];
    assert.ok(spec.silenceBudget >= 0 && spec.silenceBudget <= 1);
    assert.ok(spec.density >= 0 && spec.density <= 1);
  }
});

test("silence budget is highest for afterglow and lowest for rupture", () => {
  const afterglow = PERFORMANCE_PHASES.afterglow.silenceBudget;
  const rupture = PERFORMANCE_PHASES.rupture.silenceBudget;
  assert.ok(afterglow > rupture, "afterglow should breathe more than rupture");
  for (const key of PERFORMANCE_PHASE_KEYS) {
    if (key === "afterglow") continue;
    assert.ok(afterglow >= PERFORMANCE_PHASES[key].silenceBudget,
      `afterglow silence >= ${key}`);
  }
});

// ---------------------------------------------------------------------------
// Pure lookup helpers
// ---------------------------------------------------------------------------

test("phaseSpec falls back to intro for unknown phase key", () => {
  assert.equal(phaseSpec("nonsense"), PERFORMANCE_PHASES.intro);
  assert.equal(phaseSpec("groove"), PERFORMANCE_PHASES.groove);
});

test("silenceBudgetForPhase clamps to 0..1 and matches phase table", () => {
  for (const key of PERFORMANCE_PHASE_KEYS) {
    const s = silenceBudgetForPhase(key);
    assert.ok(s >= 0 && s <= 1);
    assert.equal(s, PERFORMANCE_PHASES[key].silenceBudget);
  }
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test("fnv1a is deterministic and returns non-negative integers", () => {
  const a = fnv1a("phase-3");
  const b = fnv1a("phase-3");
  assert.equal(a, b);
  assert.ok(Number.isInteger(a));
  assert.ok(a >= 0);
});

test("same seed and frame sequence produces identical phase history", () => {
  const runOne = createPerformanceDirector({ seed: "test-seed" });
  const runTwo = createPerformanceDirector({ seed: "test-seed" });
  const sequence = [
    frame("unknown"), frame("healthy"), frame("healthy"),
    frame("warning"), frame("warning"), frame("critical"),
    frame("critical"), frame("healthy"), frame("healthy"),
  ];
  const plansOne = sequence.map((f) => {
    runOne.observe(f);
    return runOne.advancePhrase();
  });
  const plansTwo = sequence.map((f) => {
    runTwo.observe(f);
    return runTwo.advancePhrase();
  });
  for (let i = 0; i < plansOne.length; i += 1) {
    assert.equal(plansOne[i].phase, plansTwo[i].phase);
    assert.equal(plansOne[i].state, plansTwo[i].state);
    assert.equal(plansOne[i].transitionReason, plansTwo[i].transitionReason);
    assert.deepEqual(plansOne[i].ornaments, plansTwo[i].ornaments);
  }
});

test("different seeds produce measurably different phase histories", () => {
  const seeds = ["a", "b", "c", "d"];
  const shapes = seeds.map((seed) => {
    const director = createPerformanceDirector({ seed, initialState: "healthy" });
    const phases = [];
    for (let i = 0; i < 20; i += 1) {
      director.observe(frame("healthy"));
      phases.push(director.advancePhrase().phase);
    }
    return phases.join(",");
  });
  const unique = new Set(shapes);
  assert.ok(unique.size >= 3,
    `expected >= 3 distinct phase histories from 4 seeds, got ${unique.size}`);
});

test("advancePhrase produces no NaN or Infinity in output", () => {
  const director = createPerformanceDirector({ seed: "test-seed" });
  for (const state of ["unknown", "healthy", "warning", "critical", "healthy"]) {
    for (let i = 0; i < 8; i += 1) {
      director.observe(frame(state));
      const plan = director.advancePhrase();
      assert.ok(Number.isFinite(plan.phraseIndex));
      assert.ok(Number.isFinite(plan.bars));
      assert.ok(Number.isFinite(plan.silenceBudget));
      assert.ok(Number.isFinite(plan.density));
    }
  }
});

// ---------------------------------------------------------------------------
// Authored transitions
// ---------------------------------------------------------------------------

test("healthy to warning triggers pressure phase", () => {
  const director = createPerformanceDirector({ seed: "test", initialState: "healthy" });
  // Warm up in healthy
  director.observe(frame("healthy"));
  director.advancePhrase();
  director.observe(frame("healthy"));
  director.advancePhrase();
  // Transition
  director.observe(frame("warning"));
  const plan = director.advancePhrase();
  assert.equal(plan.phase, "pressure");
  assert.equal(plan.state, "warning");
  assert.ok(plan.transitionReason.startsWith("authored:healthy>"));
});

test("any state to critical triggers rupture", () => {
  for (const startingState of ["healthy", "warning"]) {
    const director = createPerformanceDirector({ seed: "test", initialState: startingState });
    director.observe(frame(startingState));
    director.advancePhrase();
    director.observe(frame("critical"));
    const plan = director.advancePhrase();
    assert.equal(plan.phase, "rupture", `${startingState} → critical should rupture`);
    assert.ok(plan.transitionReason.startsWith("authored:"));
  }
});

test("critical to non-critical triggers recovery", () => {
  for (const targetState of ["healthy", "warning"]) {
    const director = createPerformanceDirector({ seed: "test", initialState: "critical" });
    director.observe(frame("critical"));
    director.advancePhrase();
    director.observe(frame(targetState));
    const plan = director.advancePhrase();
    assert.equal(plan.phase, "recovery", `critical → ${targetState} should recover`);
  }
});

test("any state to unknown triggers afterglow drift", () => {
  for (const startingState of ["healthy", "warning", "critical"]) {
    const director = createPerformanceDirector({ seed: "test", initialState: startingState });
    director.observe(frame(startingState));
    director.advancePhrase();
    director.observe(frame("unknown"));
    const plan = director.advancePhrase();
    assert.equal(plan.phase, "afterglow", `${startingState} → unknown should drift`);
  }
});

test("unknown to any known state triggers intro", () => {
  for (const targetState of ["healthy", "warning", "critical"]) {
    const director = createPerformanceDirector({ seed: "test", initialState: "unknown" });
    director.observe(frame("unknown"));
    director.advancePhrase();
    // Note: critical→rupture beats unknown→intro because the direct match wins.
    // But going unknown → target with no direct entry means intro fires.
    director.observe(frame(targetState));
    const plan = director.advancePhrase();
    if (targetState === "critical") {
      // No direct unknown>critical transition; wildcard chooses. Both intro
      // and unknown wildcards apply; direct match wins if present.
      assert.ok(["intro", "rupture", "afterglow"].includes(plan.phase),
        `unknown → critical produced unexpected phase ${plan.phase}`);
    } else {
      assert.equal(plan.phase, "intro", `unknown → ${targetState} should feel new`);
    }
  }
});

// ---------------------------------------------------------------------------
// Cycle behaviour within a stable state
// ---------------------------------------------------------------------------

test("stable state cycles through several distinct phases over 20 phrases", () => {
  const director = createPerformanceDirector({ seed: "test", initialState: "healthy" });
  const phases = new Set();
  for (let i = 0; i < 20; i += 1) {
    director.observe(frame("healthy"));
    phases.add(director.advancePhrase().phase);
  }
  assert.ok(phases.size >= 3,
    `stable healthy state should visit >= 3 phases in 20 phrases, got ${phases.size}: ${[...phases]}`);
});

test("stable critical state biases toward high-energy phases", () => {
  const director = createPerformanceDirector({ seed: "test", initialState: "critical" });
  const counts = new Map();
  for (let i = 0; i < 30; i += 1) {
    director.observe(frame("critical"));
    const phase = director.advancePhrase().phase;
    counts.set(phase, (counts.get(phase) ?? 0) + 1);
  }
  const rupture = counts.get("rupture") ?? 0;
  const afterglow = counts.get("afterglow") ?? 0;
  assert.ok(rupture > afterglow, "critical should visit rupture more than afterglow");
});

test("stable unknown state biases toward drift", () => {
  const director = createPerformanceDirector({ seed: "test", initialState: "unknown" });
  const counts = new Map();
  for (let i = 0; i < 30; i += 1) {
    director.observe(frame("unknown"));
    const phase = director.advancePhrase().phase;
    counts.set(phase, (counts.get(phase) ?? 0) + 1);
  }
  const drift = (counts.get("afterglow") ?? 0) + (counts.get("intro") ?? 0);
  const highEnergy = (counts.get("rupture") ?? 0) + (counts.get("pressure") ?? 0);
  assert.ok(drift > highEnergy, "unknown should drift more than press or rupture");
});

// ---------------------------------------------------------------------------
// Ornament schedule
// ---------------------------------------------------------------------------

test("scheduledOrnamentsFor returns empty at phrase 0", () => {
  const list = scheduledOrnamentsFor(0);
  assert.deepEqual([...list], []);
});

test("scheduledOrnamentsFor fires small ornament every 4 bars (phrase 2)", () => {
  // phrase 2 = bar 4
  const list = scheduledOrnamentsFor(2);
  assert.equal(list.length, 1);
  assert.equal(list[0].size, "small");
  assert.equal(list[0].bar, 4);
});

test("scheduledOrnamentsFor fires small and medium at 8-bar boundary", () => {
  // phrase 4 = bar 8
  const list = scheduledOrnamentsFor(4);
  const sizes = list.map((o) => o.size);
  assert.ok(sizes.includes("small"));
  assert.ok(sizes.includes("medium"));
});

test("scheduledOrnamentsFor fires small, medium, and large at 16-bar boundary", () => {
  // phrase 8 = bar 16
  const list = scheduledOrnamentsFor(8);
  const sizes = list.map((o) => o.size);
  assert.ok(sizes.includes("small"));
  assert.ok(sizes.includes("medium"));
  assert.ok(sizes.includes("large"));
});

test("scheduledOrnamentsFor is deterministic for a given seed", () => {
  for (let phrase = 1; phrase <= 24; phrase += 1) {
    const a = scheduledOrnamentsFor(phrase, "same-seed");
    const b = scheduledOrnamentsFor(phrase, "same-seed");
    assert.deepEqual(a, b);
  }
});

test("scheduledOrnamentsFor varies by seed", () => {
  const at16 = scheduledOrnamentsFor(8, "seed-a").map((o) => o.name).join(",");
  const at16b = scheduledOrnamentsFor(8, "seed-b").map((o) => o.name).join(",");
  const at16c = scheduledOrnamentsFor(8, "seed-c").map((o) => o.name).join(",");
  const unique = new Set([at16, at16b, at16c]);
  assert.ok(unique.size >= 2, `expected >= 2 distinct ornament choices across seeds, got ${unique.size}`);
});

test("director plan includes matching ornament schedule", () => {
  const director = createPerformanceDirector({ seed: "test", initialState: "healthy" });
  for (let i = 0; i < 8; i += 1) {
    director.observe(frame("healthy"));
    const plan = director.advancePhrase();
    const expected = scheduledOrnamentsFor(plan.phraseIndex, "test");
    assert.deepEqual([...plan.ornaments], [...expected]);
  }
});

// ---------------------------------------------------------------------------
// Introspection API
// ---------------------------------------------------------------------------

test("getPhase and getState reflect the last advance", () => {
  const director = createPerformanceDirector({ seed: "test", initialState: "healthy" });
  director.observe(frame("healthy"));
  director.advancePhrase();
  director.observe(frame("critical"));
  director.advancePhrase();
  assert.equal(director.getState(), "critical");
  assert.equal(director.getPhase(), "rupture");
});

test("getHistory records recent plans and caps length", () => {
  const director = createPerformanceDirector({ seed: "test", initialState: "healthy" });
  for (let i = 0; i < 200; i += 1) {
    director.observe(frame("healthy"));
    director.advancePhrase();
  }
  const history = director.getHistory();
  assert.ok(history.length <= 128, `history should cap, got ${history.length}`);
  assert.ok(history.length >= 100);
});

test("plan describe field is human-readable and includes state, phase, phrase", () => {
  const director = createPerformanceDirector({ seed: "test", initialState: "healthy" });
  director.observe(frame("healthy"));
  const plan = director.advancePhrase();
  assert.ok(plan.describe.includes(plan.state));
  assert.ok(plan.describe.includes(plan.phase));
  assert.ok(plan.describe.includes(String(plan.phraseIndex)));
});

// ---------------------------------------------------------------------------
// Source-level negative controls
// ---------------------------------------------------------------------------

test("source does not use Math.random or Date.now", () => {
  const codeOnly = SOURCE.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  assert.doesNotMatch(codeOnly, /Math\.random\s*\(/);
  assert.doesNotMatch(codeOnly, /Date\.now\s*\(/);
});

test("source does not import Tone.js or Web Audio primitives", () => {
  const codeOnly = SOURCE.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  assert.doesNotMatch(codeOnly, /\bfrom\s+["'][^"']*tone/i);
  assert.doesNotMatch(codeOnly, /\bnew\s+Tone\./);
  assert.doesNotMatch(codeOnly, /AudioContext/);
  assert.doesNotMatch(codeOnly, /createOscillator|createBufferSource|createGain\b/);
});

test("source does not reference sample assets", () => {
  assert.doesNotMatch(SOURCE, /\.wav\b/i);
  assert.doesNotMatch(SOURCE, /\.mp3\b/i);
  assert.doesNotMatch(SOURCE, /\.ogg\b/i);
});
