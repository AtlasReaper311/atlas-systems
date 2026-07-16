import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PERFORMANCE_SEED,
  PERFORMANCE_MACRO_DEFAULTS,
  PERFORMANCE_SCENES,
  createPerformanceArrangement,
  formatPerformanceSeed,
  normalizePerformanceMacros,
  normalizePerformanceSeed,
} from "./performance.js";

test("performance scenes retain health identity and add musical names", () => {
  assert.deepEqual(
    Object.values(PERFORMANCE_SCENES).map((scene) => scene.name),
    ["NIGHT DRIVE", "GRID PRESSURE", "REDLINE PROTOCOL", "GHOST SIGNAL"],
  );
  assert.equal(PERFORMANCE_SCENES.healthy.label, "Healthy // Night Drive");
  assert.equal(PERFORMANCE_SCENES.unknown.label, "Unknown // Ghost Signal");
});

test("seed formatting and replay validation are stable", () => {
  assert.equal(formatPerformanceSeed(0x7f3a), "00007F3A");
  assert.equal(normalizePerformanceSeed(" 7f3a "), "7F3A");
  assert.equal(normalizePerformanceSeed(DEFAULT_PERFORMANCE_SEED), "A71A5");
  assert.throws(() => normalizePerformanceSeed("not-music"), /hexadecimal/);
  assert.throws(() => normalizePerformanceSeed("ABC"), /hexadecimal/);
});

test("macro inputs are clamped and use intentional defaults", () => {
  assert.deepEqual(normalizePerformanceMacros(), PERFORMANCE_MACRO_DEFAULTS);
  assert.deepEqual(normalizePerformanceMacros({
    energy: 180,
    motion: -20,
    grit: "75",
    space: Number.NaN,
  }), {
    energy: 100,
    motion: 0,
    grit: 75,
    space: PERFORMANCE_MACRO_DEFAULTS.space,
  });
});

test("the same seed, state and macros always replay the same arrangement", () => {
  const first = createPerformanceArrangement("7F3A", "healthy", {
    energy: 72,
    motion: 66,
    grit: 55,
    space: 74,
  });
  const replay = createPerformanceArrangement("7f3a", "healthy", {
    energy: 72,
    motion: 66,
    grit: 55,
    space: 74,
  });
  assert.deepEqual(replay, first);
  assert.equal(first.sceneName, "NIGHT DRIVE");
  assert.equal(first.seed, "7F3A");
});

test("different seeds coherently change the whole arrangement", () => {
  const first = createPerformanceArrangement("7F3A", "warning");
  const second = createPerformanceArrangement("B10C", "warning");
  assert.notEqual(first.id, second.id);
  assert.notDeepEqual(
    [first.chordOffset, first.bassShift, first.percussionVariant, first.melodyOffset],
    [second.chordOffset, second.bassShift, second.percussionVariant, second.melodyOffset],
  );
  assert.notDeepEqual(
    [first.serviceFilterMultiplier, first.distortionWet, first.delayWet, first.reverbWet],
    [second.serviceFilterMultiplier, second.distortionWet, second.delayWet, second.reverbWet],
  );
  assert.notEqual(first.patternSignature, second.patternSignature);
});

test("random hexadecimal seeds provide broad musical pattern diversity", () => {
  for (const state of Object.keys(PERFORMANCE_SCENES)) {
    const signatures = new Set(
      Array.from({ length: 128 }, (_, value) => (
        createPerformanceArrangement(
          value.toString(16).toUpperCase().padStart(4, "0"),
          state,
        ).patternSignature
      )),
    );
    assert.ok(signatures.size >= 120, `${state} seed variation collapsed`);
  }
});

test("Demo scenes have distinct cinematic intensity and atmosphere profiles", () => {
  const healthy = createPerformanceArrangement(DEFAULT_PERFORMANCE_SEED, "healthy");
  const warning = createPerformanceArrangement(DEFAULT_PERFORMANCE_SEED, "warning");
  const critical = createPerformanceArrangement(DEFAULT_PERFORMANCE_SEED, "critical");
  const ghost = createPerformanceArrangement(DEFAULT_PERFORMANCE_SEED, "unknown");

  assert.ok(ghost.targetBpm < healthy.targetBpm);
  assert.ok(healthy.targetBpm < warning.targetBpm);
  assert.ok(warning.targetBpm < critical.targetBpm);
  assert.ok(ghost.drumMultiplier < healthy.drumMultiplier);
  assert.ok(healthy.drumMultiplier < warning.drumMultiplier);
  assert.ok(warning.drumMultiplier < critical.drumMultiplier);
  assert.ok(ghost.bassMultiplier < healthy.bassMultiplier);
  assert.ok(healthy.bassMultiplier < warning.bassMultiplier);
  assert.ok(warning.bassMultiplier < critical.bassMultiplier);
  assert.ok(ghost.terminalDensity < healthy.terminalDensity);
  assert.ok(healthy.terminalDensity < warning.terminalDensity);
  assert.ok(warning.terminalDensity < critical.terminalDensity);
  assert.ok(critical.droneMultiplier < warning.droneMultiplier);
  assert.ok(warning.droneMultiplier < healthy.droneMultiplier);
  assert.ok(healthy.droneMultiplier < ghost.droneMultiplier);
  assert.ok(critical.padMultiplier < warning.padMultiplier);
  assert.ok(warning.padMultiplier < healthy.padMultiplier);
  assert.ok(healthy.padMultiplier < ghost.padMultiplier);
  assert.ok(critical.distortionWet > warning.distortionWet);
  assert.ok(warning.distortionWet > healthy.distortionWet);
  assert.ok(ghost.reverbWet > healthy.reverbWet);
  assert.ok(healthy.reverbWet > critical.reverbWet);
});

test("all performance controls remain finite and bounded", () => {
  for (const state of Object.keys(PERFORMANCE_SCENES)) {
    for (const seed of ["0000", "7F3A", "A71A5", "FFFFFFFF"]) {
      const arrangement = createPerformanceArrangement(seed, state, {
        energy: 100,
        motion: 100,
        grit: 100,
        space: 100,
      });
      for (const [name, value] of Object.entries(arrangement)) {
        if (typeof value === "number") {
          assert.ok(Number.isFinite(value), `${state}.${name} must be finite`);
        }
      }
      assert.ok(arrangement.targetBpm >= 96 && arrangement.targetBpm <= 138);
      assert.ok(arrangement.distortionWet <= 0.48);
      assert.ok(arrangement.reverbWet <= 0.5);
    }
  }
});
