import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILT_IN_PRESETS,
  SCENARIOS,
  SIGNALS,
  TARGETS,
  calculateMapping,
  cloneMappings,
  createFrame,
  createMapping,
  fingerprintMappings,
  formatTime,
  mappingOutputs,
  scenarioSamples,
  transformValue,
  validateMapping,
  validatePreset,
} from "../../static/js/spectral-forge/domain.js";

test("all seven deterministic scenarios reproduce exact frames", () => {
  assert.equal(SCENARIOS.length, 7);
  for (const scenario of SCENARIOS) {
    for (const time of [0, 7.3, 12, 18.7, 31.2, 46.4, 59.9, 60]) {
      assert.deepEqual(createFrame(scenario.id, time), createFrame(scenario.id, time), `${scenario.id} @ ${time}`);
    }
  }
});

test("all scenario samples stay finite and inside declared signal bounds", () => {
  for (const scenario of SCENARIOS) {
    for (const frame of scenarioSamples(scenario.id, 0.5)) {
      for (const signal of SIGNALS) {
        const value = frame.values[signal.id];
        const normalised = frame.normalised[signal.id];
        assert.equal(Number.isFinite(value), true, `${scenario.id}/${signal.id} finite`);
        assert.ok(value >= signal.min && value <= signal.max, `${scenario.id}/${signal.id} bounded`);
        assert.ok(normalised >= 0 && normalised <= 1, `${scenario.id}/${signal.id} normalized`);
      }
    }
  }
});

test("cache collapse preserves causal ordering", () => {
  const baseline = createFrame("cache", 10);
  const cacheLoss = createFrame("cache", 16);
  const downstream = createFrame("cache", 30);
  assert.ok(cacheLoss.values.cache_hit_rate < baseline.values.cache_hit_rate - 15, "cache moves first");
  assert.ok(cacheLoss.values.latency_ms < downstream.values.latency_ms, "latency escalates later");
  assert.ok(downstream.values.queue_depth > baseline.values.queue_depth + 100, "queue escalates downstream");
});

test("cascading failure reaches dependencies in declared order", () => {
  const baseline = createFrame("cascade", 8);
  const cache = createFrame("cascade", 16);
  const compute = createFrame("cascade", 26);
  const queue = createFrame("cascade", 36);
  const errors = createFrame("cascade", 44);
  const failed = createFrame("cascade", 48);
  assert.ok(cache.values.cache_hit_rate < baseline.values.cache_hit_rate - 20);
  assert.ok(compute.values.cpu_load > cache.values.cpu_load + 15);
  assert.ok(compute.values.latency_ms > cache.values.latency_ms + 200);
  assert.ok(queue.values.queue_depth > compute.values.queue_depth + 100);
  assert.ok(errors.values.error_rate > queue.values.error_rate + 1);
  assert.equal(failed.health, "FAILED");
});

test("deployment event is discrete and bounded", () => {
  assert.equal(createFrame("deploy", 11.9).deployEvent, false);
  assert.equal(createFrame("deploy", 12).deployEvent, true);
  assert.equal(createFrame("deploy", 12.1).deployEvent, true);
  assert.equal(createFrame("deploy", 12.2).deployEvent, false);
});

test("mapping transforms remain bounded", () => {
  assert.equal(transformValue(0.25, "LINEAR"), 0.25);
  assert.equal(transformValue(0.25, "INVERSE"), 0.75);
  assert.equal(transformValue(0.5, "EXPONENTIAL"), 0.25);
  assert.equal(transformValue(0.59, "THRESHOLD"), 0);
  assert.equal(transformValue(0.6, "THRESHOLD"), 1);
});

test("mapping calculation honours polarity and output range", () => {
  const mapping = createMapping({ id: "test", source: "latency_ms", target: "filter_cutoff", transform: "INVERSE", outputMin: 400, outputMax: 7400 });
  const result = calculateMapping(mapping, 0.25);
  assert.equal(result.rangedInput, 0.25);
  assert.equal(result.transformed, 0.75);
  assert.equal(result.output, 5650);
});

test("mapping validation rejects non-finite and out-of-bounds values", () => {
  const invalid = { id: "bad", source: "latency_ms", target: "filter_cutoff", transform: "LINEAR", inputMin: 0, inputMax: 1, outputMin: Number.NaN, outputMax: 9000, polarity: "NORMAL", smoothing: "MEDIUM", enabled: true };
  const result = validateMapping(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("outputMin must be finite")));
  assert.ok(result.errors.some((error) => error.includes("outputMax is outside target bounds")));
});

test("mapping outputs reject enabled target collisions", () => {
  const first = createMapping({ id: "a", source: "latency_ms", target: "filter_cutoff" });
  const second = createMapping({ id: "b", source: "anomaly_score", target: "filter_cutoff" });
  assert.throws(() => mappingOutputs(createFrame("normal", 0), [first, second]), /Multiple enabled mappings target filter_cutoff/);
});

test("built-in presets validate and stay inside target bounds", () => {
  for (const preset of BUILT_IN_PRESETS) {
    assert.equal(validatePreset(preset).valid, true, preset.name);
    const outputs = mappingOutputs(createFrame("normal", 25), cloneMappings(preset.mappings));
    for (const target of TARGETS) assert.ok(outputs[target.id] >= target.min && outputs[target.id] <= target.max, `${preset.name}/${target.id}`);
  }
});

test("mapping fingerprints are deterministic and change with configuration", () => {
  const mappings = cloneMappings(BUILT_IN_PRESETS[0].mappings);
  const baseline = fingerprintMappings(mappings);
  assert.equal(baseline, fingerprintMappings(cloneMappings(mappings)));
  mappings[0].outputMax += 0.1;
  assert.notEqual(baseline, fingerprintMappings(mappings));
});

test("time formatting crosses the minute boundary correctly", () => {
  assert.equal(formatTime(0), "00:00.0");
  assert.equal(formatTime(59.9), "00:59.9");
  assert.equal(formatTime(60), "01:00.0");
});
