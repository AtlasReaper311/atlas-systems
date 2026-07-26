import assert from "node:assert/strict";
import test from "node:test";

import { buildHybridFrame, deriveEstateFromServices } from "./apu-hybrid-state.js";
import {
  ATLAS_APU_ENGINE_CONTROLS_BUILD_ID,
  engineControlsForFrame,
  scorePlanGuardForFrame,
} from "./atlas-apu-engine-controls.js";
import { computeFrame } from "./mapping.js";

function service(name, status, overrides = {}) {
  return {
    name,
    status,
    measured: true,
    evidence_source: `preview:${name}`,
    measured_at: "2026-07-26T13:22:04.000Z",
    latency_ms: 35,
    uptime_pct: 99.95,
    error_rate: 0,
    ...overrides,
  };
}

function frameFor(services, overrides = {}) {
  const merged = {
    timestamp: "2026-07-26T13:22:04.000Z",
    preview: true,
    stale: false,
    estate: deriveEstateFromServices(services),
    services,
    ...overrides,
  };
  return buildHybridFrame(computeFrame(merged), merged);
}

test("valid score plans activate the guarded engine-control path", () => {
  const frame = frameFor([
    service("atlas-systems", "healthy"),
    service("atlas-api-public", "healthy"),
  ]);
  const guard = scorePlanGuardForFrame(frame);
  const controls = engineControlsForFrame(frame);

  assert.match(ATLAS_APU_ENGINE_CONTROLS_BUILD_ID, /engine-controls-v4$/);
  assert.equal(guard.active, true);
  assert.equal(guard.mode, "score-plan");
  assert.equal(guard.sampleFree, true);
  assert.deepEqual(guard.reasons, []);
  assert.equal(controls.sampleFree, true);
  assert.equal(controls.movement, "Green Clock");
  assert.ok(controls.buses.primary > 1);
  assert.equal(controls.timbre.primaryDutyCycle, frame.scorePlan.motif.dutyCycle);
});

test("missing or invalid plans fall back to legacy frame controls", () => {
  const missing = scorePlanGuardForFrame({ scoreState: "healthy" });
  assert.equal(missing.active, false);
  assert.equal(missing.mode, "legacy-frame");
  assert.match(missing.reasons.join(" "), /missing score plan/);

  const frame = frameFor([service("atlas-systems", "healthy")]);
  const invalid = {
    ...frame,
    scorePlan: {
      ...frame.scorePlan,
      sampleFreeTarget: false,
    },
  };
  const controls = engineControlsForFrame(invalid);
  assert.equal(controls.guard.active, false);
  assert.equal(controls.sampleFree, false);
  assert.equal(controls.buses, null);
  assert.match(controls.guard.reasons.join(" "), /sample-free target/);
});

test("theme controls make critical urgent and unknown carrier-led", () => {
  const critical = engineControlsForFrame(frameFor([
    service("atlas-systems", "healthy"),
    service("atlas-api-public", "down", { latency_ms: null, error_rate: 0.04 }),
  ]));
  const unknown = engineControlsForFrame(frameFor([
    service("atlas-systems", "unknown", { evidence_source: null, measured_at: null }),
    service("atlas-api-public", "unknown", { evidence_source: null, measured_at: null }),
  ]));

  assert.equal(critical.movement, "Critical Choke");
  assert.ok(critical.buses.drums > 1);
  assert.ok(critical.buses.bass > 1);
  assert.ok(critical.buses.pad < 0.5);
  assert.equal(critical.timbre.chipBits, 7);
  assert.ok(critical.timbre.chipWet <= 0.175);
  assert.ok(critical.timbre.counterFilterQ <= 2.25);
  assert.ok(critical.timbre.noiseAccentFilterHz > 2000);

  assert.equal(unknown.movement, "Unknown Drift");
  assert.ok(unknown.buses.pad > 1);
  assert.ok(unknown.buses.drums < 0.5);
  assert.ok(unknown.timbre.telemetryHumGain > critical.timbre.telemetryHumGain);
  assert.ok(unknown.timbre.reverbGain > critical.timbre.reverbGain);
  assert.ok(unknown.timbre.chipWet < critical.timbre.chipWet);
});

test("dependency contention tightens the counter-pulse duty cycle", () => {
  const frame = frameFor([
    service("atlas-systems", "healthy"),
    service("atlas-api-public", "degraded", { depends_on: ["github-pulse"] }),
  ]);
  const controls = engineControlsForFrame(frame);
  assert.equal(frame.scorePlan.roles.contention.alerts, 1);
  assert.equal(controls.timbre.counterDutyCycle, 0.125);
});
