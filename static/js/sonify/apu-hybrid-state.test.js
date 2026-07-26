import assert from "node:assert/strict";
import test from "node:test";

import { computeFrame } from "./mapping.js";
import {
  APU_HYBRID_STATE_BUILD_ID,
  blendedModulation,
  buildHybridFrame,
  deriveEstateFromServices,
  deriveStateVector,
  evidenceStateForService,
} from "./apu-hybrid-state.js";

function service(name, status, overrides = {}) {
  return {
    name,
    status,
    measured: true,
    evidence_source: `preview:${name}`,
    measured_at: "2026-07-25T12:15:00.000Z",
    latency_ms: 25,
    uptime_pct: 99.9,
    error_rate: 0,
    ...overrides,
  };
}

const mixedFixture = [
  ...Array.from({ length: 18 }, (_, index) => service(`healthy-${index}`, "healthy")),
  service("warning-0", "degraded", { latency_ms: 220, error_rate: 0.01 }),
  service("unknown-0", "unknown", { evidence_source: null, measured_at: null }),
  service("unknown-1", "unknown", { evidence_source: null, measured_at: null }),
];

test("preview estate totals are derived from service rows", () => {
  assert.deepEqual(deriveEstateFromServices(mixedFixture), {
    overall_health: 0.988,
    active_incidents: 0,
    known_service_ratio: 0.905,
  });
});

test("one warning and two unknown services blend under a Healthy dominant grammar", () => {
  const estate = deriveEstateFromServices(mixedFixture);
  const vector = deriveStateVector({ services: mixedFixture, estate });

  assert.equal(vector.dominant, "healthy");
  assert.deepEqual(vector.counts, { healthy: 18, warning: 1, critical: 0, unknown: 2 });
  assert.ok(vector.weights.healthy > 0.75);
  assert.ok(vector.weights.warning > 0);
  assert.ok(vector.weights.unknown > vector.weights.warning);
  assert.equal(
    Object.values(vector.weights).reduce((sum, value) => sum + value, 0),
    1,
  );
  assert.match(vector.reason, /Healthy supplies the harmonic grammar/);
});

test("down services and stale telemetry retain fail-closed overrides", () => {
  const critical = deriveStateVector({
    services: [service("healthy", "healthy"), service("down", "down")],
    estate: { overall_health: 0.6, active_incidents: 0, known_service_ratio: 1 },
  });
  assert.equal(critical.dominant, "critical");
  assert.match(critical.reason, /service is down/);

  const stale = deriveStateVector({ services: mixedFixture, stale: true });
  assert.equal(stale.dominant, "unknown");
  assert.deepEqual(stale.weights, { healthy: 0, warning: 0, critical: 0, unknown: 1 });
  assert.match(stale.reason, /telemetry frame is stale/);
});

test("evidence states do not collapse unknown records into measured", () => {
  assert.deepEqual(
    evidenceStateForService(service("current", "healthy"), { preview: true }),
    { id: "current", label: "Preview fixture", measured: true, sourceMode: "preview" },
  );
  assert.deepEqual(
    evidenceStateForService(service("unknown", "unknown", { evidence_source: null, measured_at: null }), { preview: true }),
    { id: "reported-unknown", label: "Reported unknown", measured: false, sourceMode: "preview" },
  );
  assert.deepEqual(
    evidenceStateForService({ name: "topology", status: "unknown", measured: false }),
    { id: "topology-only", label: "Topology only", measured: false, sourceMode: "live" },
  );
  assert.deepEqual(
    evidenceStateForService(service("stale", "healthy"), { stale: true }),
    { id: "stale", label: "Stale measurement", measured: true, sourceMode: "preview" },
  );
  assert.deepEqual(
    evidenceStateForService(service("demo", "healthy", { demoSimulated: true }), { simulated: true }),
    { id: "simulated", label: "Simulated profile", measured: false, sourceMode: "demo" },
  );
});

test("hybrid frame recomputes voices under the dominant grammar and exposes weighted layers", () => {
  const estate = deriveEstateFromServices(mixedFixture);
  const merged = { preview: true, stale: false, estate, services: mixedFixture };
  const frame = buildHybridFrame(computeFrame(merged), merged);

  assert.match(APU_HYBRID_STATE_BUILD_ID, /evidence-hybrid-v1$/);
  assert.equal(frame.scoreState, "healthy");
  assert.equal(frame.warningCount, 1);
  assert.equal(frame.unknownCount, 2);
  assert.equal(frame.measuredComponents, 19);
  assert.equal(frame.previewEstateDerived, true);
  assert.equal(frame.evidenceMode, "preview");
  assert.equal(frame.hybridLayers.explorer, frame.stateVector.healthy);
  assert.equal(frame.hybridLayers.diagnostic, frame.stateVector.warning);
  assert.equal(frame.hybridLayers.carrier, frame.stateVector.unknown);
  assert.ok(frame.modulation.pressure > 0);
  assert.ok(frame.modulation.coveragePressure > 0);
  assert.equal(frame.voices.filter((voice) => voice.evidenceState === "reported-unknown").length, 2);
});

test("weighted modulation changes continuous controls without averaging musical scales", () => {
  const modulation = blendedModulation(
    { modulation: { pressure: 0.05, spectralOpenness: 1 } },
    { healthy: 0.72, warning: 0.12, critical: 0.04, unknown: 0.12 },
  );
  assert.ok(modulation.pressure > 0.05);
  assert.ok(modulation.coveragePressure >= 0.12);
  assert.ok(modulation.spectralOpenness < 1);
  assert.deepEqual(modulation.hybridStateVector, {
    healthy: 0.72,
    warning: 0.12,
    critical: 0.04,
    unknown: 0.12,
  });
});
