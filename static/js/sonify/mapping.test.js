import test from "node:test";
import assert from "node:assert/strict";

import {
  NEUTRAL_LATENCY_FILTER_HZ,
  SCALE_DORIAN,
  SCALE_LYDIAN,
  SCALE_PHRYGIAN,
  SCALE_UNKNOWN,
  SCORE_STATES,
  computeFrame,
  deriveDemoEstate,
  deriveScoreState,
  deriveServiceIdentity,
  latencyToFilterHz,
  mergeTelemetryAndTopology,
} from "./mapping.js";

const service = (name, overrides = {}) => ({
  name,
  status: "healthy",
  latency_ms: 40,
  uptime_pct: 99.9,
  error_rate: 0,
  last_deploy_secs_ago: null,
  measured: true,
  ...overrides,
});

const payload = (overrides = {}) => ({
  timestamp: "2026-07-16T09:00:00.000Z",
  estate: { overall_health: 1, active_incidents: 0 },
  services: [service("atlas-api-index", { layer: "public-api" })],
  ...overrides,
});

test("healthy state uses D Lydian at the healthy tempo", () => {
  const frame = computeFrame(payload());
  assert.equal(frame.scoreState, "healthy");
  assert.deepEqual(frame.scale, SCALE_LYDIAN);
  assert.equal(frame.bpm, SCORE_STATES.healthy.bpm);
  assert.equal(frame.mode, "D Lydian");
});

test("warning state uses D Dorian for degraded service or sub-0.95 health", () => {
  const degraded = computeFrame(payload({
    estate: { overall_health: 1, active_incidents: 0 },
    services: [service("atlas-api-index", { status: "degraded" })],
  }));
  const healthThreshold = computeFrame(payload({
    estate: { overall_health: 0.94, active_incidents: 0 },
  }));
  for (const frame of [degraded, healthThreshold]) {
    assert.equal(frame.scoreState, "warning");
    assert.deepEqual(frame.scale, SCALE_DORIAN);
    assert.equal(frame.mode, "D Dorian");
  }
});

test("critical state uses D Phrygian and persistent rhythm", () => {
  const cases = [
    payload({ estate: { overall_health: 1, active_incidents: 1 } }),
    payload({ services: [service("atlas-api-index", { status: "down" })] }),
    payload({ estate: { overall_health: 0.49, active_incidents: 0 } }),
  ];
  for (const input of cases) {
    const frame = computeFrame(input);
    assert.equal(frame.scoreState, "critical");
    assert.deepEqual(frame.scale, SCALE_PHRYGIAN);
    assert.equal(frame.persistentRhythm, true);
    assert.ok(frame.transitionSeconds <= 1);
  }
});

test("unknown has its own sparse score for stale or wholly unknown data", () => {
  const stale = computeFrame(payload({ stale: true }));
  const noKnown = computeFrame(payload({
    estate: { overall_health: 1, active_incidents: 0 },
    services: [service("atlas-api-index", { status: "unknown" })],
  }));
  for (const frame of [stale, noKnown]) {
    assert.equal(frame.scoreState, "unknown");
    assert.deepEqual(frame.scale, SCALE_UNKNOWN);
    assert.ok(frame.density < SCORE_STATES.healthy.density);
  }
});

test("one unknown component does not override current known measurements", () => {
  assert.equal(deriveScoreState(payload({
    services: [
      service("atlas-api-index"),
      service("unmeasured", { status: "unknown", measured: false }),
    ],
  })), "healthy");
});

test("service identity and motif are deterministic and layer-aware", () => {
  const api = { name: "atlas-api-public", layer: "public-api" };
  const memory = { name: "ramone-memory", layer: "local-ai" };
  assert.deepEqual(deriveServiceIdentity(api), deriveServiceIdentity(api));
  assert.equal(deriveServiceIdentity(api).instrumentFamily, "woodwinds");
  assert.equal(deriveServiceIdentity(memory).instrumentFamily, "strings");
  assert.equal(deriveServiceIdentity(api).motif.length, 4);
  assert.ok(deriveServiceIdentity(api).pan >= -0.72);
  assert.ok(deriveServiceIdentity(api).pan <= 0.72);
});

test("latency controls spectral openness and null uses a neutral default", () => {
  assert.ok(latencyToFilterHz(20) > latencyToFilterHz(500));
  assert.ok(latencyToFilterHz(500) > latencyToFilterHz(1500));
  assert.equal(latencyToFilterHz(null), NEUTRAL_LATENCY_FILTER_HZ);
});

test("status changes articulation, density, stability, and brightness", () => {
  const frame = computeFrame(payload({
    estate: { overall_health: 0.4, active_incidents: 1 },
    services: [
      service("healthy"),
      service("warning", { status: "degraded" }),
      service("critical", { status: "down" }),
      service("unknown", {
        status: "unknown",
        latency_ms: null,
        uptime_pct: null,
        error_rate: null,
        measured: false,
      }),
    ],
  }));
  const byName = new Map(frame.voices.map((voice) => [voice.name, voice]));
  assert.equal(byName.get("healthy").articulation, "legato");
  assert.equal(byName.get("warning").articulation, "tenuto");
  assert.equal(byName.get("critical").articulation, "urgent");
  assert.equal(byName.get("unknown").articulation, "suspended");
  assert.ok(byName.get("critical").density > byName.get("healthy").density);
  assert.ok(byName.get("critical").stability < byName.get("warning").stability);
  assert.ok(byName.get("unknown").voiceGain < byName.get("healthy").voiceGain);
  assert.equal(byName.get("unknown").latency_ms, null);
});

test("topology merge keeps measured health authoritative and unknown honest", () => {
  const telemetry = {
    timestamp: "2026-07-16T09:00:00.000Z",
    estate: { overall_health: 1, active_incidents: 0 },
    services: [
      service("atlas-api-index", { status: "down" }),
      service("atlas-corpus"),
      service("measured-only"),
    ],
  };
  const topology = {
    components: [
      { id: "atlas-api-index", layer: "public-api", kind: "worker", source_only: false },
      { id: "atlas-corpus", layer: "local-ai", kind: "repository", source_only: true },
      { id: "source-only", layer: "infra", kind: "repository", source_only: true },
      { id: "topology-only", layer: "surface", kind: "site", source_only: false },
    ],
  };
  const merged = mergeTelemetryAndTopology(telemetry, topology);
  const byName = new Map(merged.services.map((item) => [item.name, item]));
  assert.equal(byName.get("atlas-api-index").status, "down");
  assert.equal(byName.get("atlas-api-index").layer, "public-api");
  assert.equal(byName.get("atlas-corpus").measured, true);
  assert.equal(byName.has("source-only"), false);
  assert.equal(byName.get("topology-only").status, "unknown");
  assert.equal(byName.get("topology-only").measured, false);
  assert.equal(byName.get("measured-only").measured, true);
});

test("topology failure falls back to every measured service", () => {
  const telemetry = payload({
    services: Array.from({ length: 9 }, (_, index) => service(`service-${index}`)),
  });
  const merged = mergeTelemetryAndTopology(telemetry, null);
  assert.equal(merged.topologyAvailable, false);
  assert.equal(merged.services.length, 9);
  assert.equal(merged.services.every((item) => item.measured), true);
});

test("dynamic score frames support more than the original six voices", () => {
  const topology = {
    components: Array.from({ length: 18 }, (_, index) => ({
      id: `component-${index}`,
      layer: index % 2 ? "observability" : "surface",
      kind: index % 2 ? "worker" : "site",
      source_only: false,
      depends_on: index ? [`component-${index - 1}`] : [],
    })),
  };
  const frame = computeFrame(mergeTelemetryAndTopology(payload(), topology));
  assert.equal(frame.voices.length, 19);
  assert.ok(frame.voices.length > 6);
});

test("demo rollup ignores unknowns and counts down services as incidents", () => {
  const estate = deriveDemoEstate([
    service("one"),
    service("two", { status: "degraded" }),
    service("three", { status: "down" }),
    service("four", { status: "unknown" }),
  ]);
  assert.equal(estate.active_incidents, 1);
  assert.ok(estate.overall_health < 0.95);
  assert.ok(estate.overall_health > 0);
  assert.equal(deriveDemoEstate([service("unknown", { status: "unknown" })]).overall_health, null);
});

test("all numeric score values remain finite while semantic nulls stay null", () => {
  const frame = computeFrame(payload({
    estate: { overall_health: Number.NaN, active_incidents: Number.POSITIVE_INFINITY },
    services: [service("null-service", {
      status: "unknown",
      latency_ms: null,
      uptime_pct: null,
      error_rate: null,
      last_deploy_secs_ago: null,
    })],
  }));
  const visit = (value, path = "frame") => {
    if (typeof value === "number") {
      assert.ok(Number.isFinite(value), `${path} must be finite`);
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, item]) => visit(item, `${path}.${key}`));
    }
  };
  visit(frame);
  assert.equal(frame.overallHealth, null);
  assert.equal(frame.voices[0].latency_ms, null);
  assert.equal(frame.voices[0].uptime_pct, null);
  assert.equal(frame.voices[0].error_rate, null);
});
