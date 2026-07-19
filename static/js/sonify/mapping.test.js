import test from "node:test";
import assert from "node:assert/strict";

import {
  DEMO_PROFILES,
  FAMILY_MIDI_RANGES,
  NEUTRAL_LATENCY_FILTER_HZ,
  SCALE_AEOLIAN,
  SCALE_PHRYGIAN,
  SCALE_PHRYGIAN_DOMINANT,
  SCALE_UNKNOWN,
  SCORE_STATES,
  applyDemoProfileToServices,
  boundVoiceMidi,
  buildDependencyGraph,
  computeFrame,
  deriveDemoEstate,
  deriveScoreState,
  deriveServiceIdentity,
  filterVoices,
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

test("score states expose the H1-H8 tempo and master filter bands", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(SCORE_STATES).map(([state, score]) => [
      state,
      [score.bpm, score.masterFilterHz, score.masterHpHz],
    ])),
    {
      healthy: [112, 12000, 28],
      warning: [118, 10000, 32],
      critical: [128, 8000, 38],
      unknown: [96, 6000, 24],
    },
  );
});

test("healthy state uses dark D Aeolian at the healthy tempo", () => {
  const frame = computeFrame(payload());
  assert.equal(frame.scoreState, "healthy");
  assert.deepEqual(frame.scale, SCALE_AEOLIAN);
  assert.equal(frame.bpm, SCORE_STATES.healthy.bpm);
  assert.equal(frame.mode, "D Aeolian");
  assert.equal(frame.persistentRhythm, true);
});

test("warning state uses D Phrygian for degraded service or sub-0.95 health", () => {
  const degraded = computeFrame(payload({
    estate: { overall_health: 1, active_incidents: 0 },
    services: [service("atlas-api-index", { status: "degraded" })],
  }));
  const healthThreshold = computeFrame(payload({
    estate: { overall_health: 0.94, active_incidents: 0 },
  }));
  for (const frame of [degraded, healthThreshold]) {
    assert.equal(frame.scoreState, "warning");
    assert.deepEqual(frame.scale, SCALE_PHRYGIAN);
    assert.equal(frame.mode, "D Phrygian");
  }
});

test("critical state uses D Phrygian dominant and persistent rhythm", () => {
  const cases = [
    payload({ estate: { overall_health: 1, active_incidents: 1 } }),
    payload({ services: [service("atlas-api-index", { status: "down" })] }),
    payload({ estate: { overall_health: 0.49, active_incidents: 0 } }),
  ];
  for (const input of cases) {
    const frame = computeFrame(input);
    assert.equal(frame.scoreState, "critical");
    assert.deepEqual(frame.scale, SCALE_PHRYGIAN_DOMINANT);
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

test("measured unknown and topology-only unmeasured are counted separately", () => {
  const frame = computeFrame(payload({
    services: [
      service("healthy"),
      service("measured-unknown", { status: "unknown", measured: true }),
      service("topology-only", { status: "unknown", measured: false }),
    ],
  }));
  assert.equal(frame.unknownCount, 1);
  assert.equal(frame.unmeasuredCount, 1);
  assert.equal(frame.measuredComponents, 2);
});

test("service identity and motif are deterministic and layer-aware", () => {
  const api = { name: "atlas-api-public", layer: "public-api" };
  const memory = { name: "ramone-memory", layer: "local-ai" };
  assert.deepEqual(deriveServiceIdentity(api), deriveServiceIdentity(api));
  assert.equal(deriveServiceIdentity(api).instrumentFamily, "data-sequence");
  assert.equal(deriveServiceIdentity(memory).instrumentFamily, "sub-drone");
  assert.equal(deriveServiceIdentity(api).motif.length, 4);
  assert.ok(deriveServiceIdentity(api).pan >= -0.72);
  assert.ok(deriveServiceIdentity(api).pan <= 0.72);
});

test("service notes remain within family-safe registers", () => {
  assert.ok(
    Object.values(FAMILY_MIDI_RANGES).every((range) => range.maximum <= 62),
    "recurring service families must stay at or below D4",
  );
  for (const layer of [
    "surface",
    "public-api",
    "observability",
    "edge",
    "local-ai",
    "infra",
  ]) {
    const voice = computeFrame(payload({
      services: [service(`voice-${layer}`, { layer })],
    })).voices[0];
    const range = FAMILY_MIDI_RANGES[voice.instrumentFamily];
    assert.ok(voice.motifMidi.every((midi) => midi >= range.minimum));
    assert.ok(voice.motifMidi.every((midi) => midi <= range.maximum));
    assert.equal(boundVoiceMidi(voice, range.maximum + 24), range.maximum);
    assert.equal(boundVoiceMidi(voice, range.minimum - 24), range.minimum);
  }
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
      service("atlas-api-index", {
        status: "down",
        evidence_source: "atlas-api-public:/v1/stats#estate.components.registry",
        health_detail: "registry probe returned 503",
        measured_at: "2026-07-16T09:00:00.000Z",
      }),
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
  assert.equal(
    byName.get("atlas-api-index").evidence_source,
    "atlas-api-public:/v1/stats#estate.components.registry",
  );
  assert.equal(byName.get("atlas-api-index").health_detail, "registry probe returned 503");
  assert.equal(byName.get("atlas-api-index").measured_at, "2026-07-16T09:00:00.000Z");
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

test("voice filters preserve order and separate measured from unmeasured", () => {
  const voices = [
    service("measured-one", { measured: true }),
    service("unmeasured", { measured: false }),
    service("measured-two", { measured: true }),
  ];
  assert.deepEqual(filterVoices(voices, "all").map((voice) => voice.name), [
    "measured-one",
    "unmeasured",
    "measured-two",
  ]);
  assert.deepEqual(filterVoices(voices, "measured").map((voice) => voice.name), [
    "measured-one",
    "measured-two",
  ]);
  assert.deepEqual(filterVoices(voices, "unmeasured").map((voice) => voice.name), [
    "unmeasured",
  ]);
});

test("dependency graph keeps visible internal edges and identifies external boundaries", () => {
  const allVoices = [
    service("surface", { depends_on: ["api", "cloudflare-pages"] }),
    service("api", { depends_on: ["registry"] }),
    service("registry"),
  ];
  const graph = buildDependencyGraph(allVoices, allVoices);
  assert.deepEqual(graph.internalEdges, [
    { from: "surface", to: "api" },
    { from: "api", to: "registry" },
  ]);
  assert.deepEqual(graph.externalEdges, [
    { from: "surface", to: "cloudflare-pages" },
  ]);
  assert.deepEqual(graph.externalNodes, ["cloudflare-pages"]);

  const filtered = buildDependencyGraph([allVoices[0]], allVoices);
  assert.deepEqual(filtered.internalEdges, []);
  assert.deepEqual(filtered.externalEdges, [
    { from: "surface", to: "cloudflare-pages" },
  ]);
  assert.deepEqual(filtered.externalNodes, ["cloudflare-pages"]);
});

test("bulk demo profiles update every service coherently without mutating input", () => {
  const original = [service("one"), service("two", { measured: false })];
  for (const [profileName, profile] of Object.entries(DEMO_PROFILES)) {
    const updated = applyDemoProfileToServices(original, profileName);
    assert.notEqual(updated, original);
    assert.equal(updated.length, original.length);
    assert.ok(updated.every((item) => item.status === profile.status));
    assert.ok(updated.every((item) => item.latency_ms === profile.latency_ms));
    assert.ok(updated.every((item) => item.uptime_pct === profile.uptime_pct));
    assert.ok(updated.every((item) => item.error_rate === profile.error_rate));
    assert.ok(updated.every((item) => item.demoSimulated === true));
    assert.ok(updated.every((item) => item.health_detail === `Preview profile: ${profile.label}`));
  }
  assert.equal(original[0].status, "healthy");
  assert.equal(original[1].demoSimulated, undefined);
  assert.throws(() => applyDemoProfileToServices(original, "not-a-profile"), /unknown demo profile/);
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
  assert.equal(estate.known_service_ratio, 0.75);
  const unknownEstate = deriveDemoEstate([service("unknown", { status: "unknown" })]);
  assert.equal(unknownEstate.overall_health, null);
  assert.equal(unknownEstate.known_service_ratio, 0);
});

test("a lone healthy custom voice does not promote an unknown Demo estate", () => {
  const services = [
    service("healthy", { status: "healthy" }),
    service("unknown-one", { status: "unknown" }),
    service("unknown-two", { status: "unknown" }),
    service("unknown-three", { status: "unknown" }),
  ];
  const frame = computeFrame({
    services,
    estate: deriveDemoEstate(services),
  });
  assert.equal(frame.scoreState, "unknown");
  assert.equal(frame.voices[0].status, "healthy");
  assert.equal(frame.voices[0].articulation, "legato");
});

test("warning and critical custom voices still escalate an unknown Demo estate", () => {
  for (const [status, expected] of [["degraded", "warning"], ["down", "critical"]]) {
    const services = [
      service("signal", { status }),
      service("unknown-one", { status: "unknown" }),
      service("unknown-two", { status: "unknown" }),
    ];
    assert.equal(computeFrame({
      services,
      estate: deriveDemoEstate(services),
    }).scoreState, expected);
  }
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
