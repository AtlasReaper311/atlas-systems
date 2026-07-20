import assert from "node:assert/strict";
import test from "node:test";

import { computeFrame } from "./mapping.js";
import {
  DEPLOYMENT_AFTERGLOW_MS,
  STALE_UNKNOWN_MS,
  applyContinuousTelemetryModulation,
  createPersistentTelemetryModulator,
  deploymentAfterglowEnergy,
  deriveContinuousModulation,
} from "./modulation.js";

const START = Date.parse("2026-07-20T00:00:00.000Z");

function service(overrides = {}) {
  return {
    name: "atlas-api-index",
    status: "healthy",
    latency_ms: 0,
    uptime_pct: 100,
    error_rate: 0,
    measured: true,
    ...overrides,
  };
}

function payload(overrides = {}) {
  return {
    timestamp: new Date(START).toISOString(),
    lastSuccessfulAt: new Date(START).toISOString(),
    estate: {
      overall_health: 1,
      active_incidents: 0,
      known_service_ratio: 1,
    },
    services: [service()],
    stale: false,
    topologyAvailable: true,
    ...overrides,
  };
}

test("perfectly healthy telemetry is acoustically neutral to the H1-H8 frame", () => {
  const input = payload();
  const base = computeFrame(input);
  const modulation = deriveContinuousModulation(input);
  const output = applyContinuousTelemetryModulation(base, modulation);

  assert.equal(modulation.pressure, 0);
  assert.equal(output.bpm, base.bpm);
  assert.equal(output.density, base.density);
  assert.equal(output.masterGainDb, base.masterGainDb);
  assert.equal(output.masterFilterHz, base.masterFilterHz);
  assert.equal(output.scoreState, base.scoreState);
  assert.deepEqual(output.scale, base.scale);
  assert.equal(output.voices[0].filterHz, base.voices[0].filterHz);
  assert.equal(output.voices[0].detuneCents, base.voices[0].detuneCents);
  assert.equal(output.voices[0].noteConfidence, base.voices[0].noteConfidence);
  assert.equal(output.voices[0].density, base.voices[0].density);
  assert.equal(output.voices[0].voiceGain, base.voices[0].voiceGain);
  assert.equal(output.voices[0].velocity, base.voices[0].velocity);
});

test("pressure adds bounded energy without slowing or globally dulling the score", () => {
  const input = payload({
    estate: {
      overall_health: 0.62,
      active_incidents: 1,
      known_service_ratio: 1,
    },
    services: [service({
      status: "degraded",
      latency_ms: 800,
      uptime_pct: 98.5,
      error_rate: 0.04,
    })],
  });
  const base = computeFrame(input);
  const modulation = deriveContinuousModulation(input);
  const output = applyContinuousTelemetryModulation(base, modulation);

  assert.ok(modulation.pressure > 0);
  assert.ok(output.bpm >= base.bpm);
  assert.ok(output.bpm <= base.bpm + 5);
  assert.ok(output.density >= base.density);
  assert.ok(output.masterGainDb >= base.masterGainDb);
  assert.equal(output.masterFilterHz, base.masterFilterHz);
  assert.equal(output.voices[0].filterHz, base.voices[0].filterHz);
  assert.equal(output.voices[0].detuneCents, base.voices[0].detuneCents);
  assert.equal(output.voices[0].noteConfidence, base.voices[0].noteConfidence);
});

test("latency and error pressure are monotonic and all control values stay bounded", () => {
  let previousLatency = -1;
  for (const latency of [0, 20, 100, 300, 800, 1500, 5000]) {
    const modulation = deriveContinuousModulation(payload({
      services: [service({ latency_ms: latency })],
    }));
    assert.ok(Number.isFinite(modulation.latencyPressure));
    assert.ok(modulation.latencyPressure >= previousLatency);
    assert.ok(modulation.latencyPressure >= 0 && modulation.latencyPressure <= 1);
    previousLatency = modulation.latencyPressure;
  }

  let previousError = -1;
  for (const errorRate of [0, 0.0001, 0.001, 0.01, 0.1, 0.5, 1]) {
    const modulation = deriveContinuousModulation(payload({
      services: [service({ error_rate: errorRate })],
    }));
    assert.ok(Number.isFinite(modulation.errorPressure));
    assert.ok(modulation.errorPressure >= previousError);
    assert.ok(modulation.errorPressure >= 0 && modulation.errorPressure <= 1);
    previousError = modulation.errorPressure;
  }

  for (const health of [0, 0.25, 0.5, 0.75, 1]) {
    const modulation = deriveContinuousModulation(payload({
      estate: {
        overall_health: health,
        active_incidents: health === 0 ? 4 : 0,
        known_service_ratio: health,
      },
    }));
    for (const key of [
      "pressure",
      "healthPressure",
      "coverage",
      "coveragePressure",
      "latencyPressure",
      "uptimePressure",
      "errorPressure",
      "incidentPressure",
      "deploymentPressure",
      "deploymentEnergy",
      "componentLoad",
      "spectralOpenness",
    ]) {
      assert.ok(Number.isFinite(modulation[key]), `${key} must be finite`);
      assert.ok(modulation[key] >= 0 && modulation[key] <= 1, `${key} must be bounded`);
    }
  }
});

test("successful deployment afterglow starts full and decays to zero", () => {
  assert.equal(deploymentAfterglowEnergy(START, START), 1);
  const halfway = deploymentAfterglowEnergy(START, START + DEPLOYMENT_AFTERGLOW_MS / 2);
  assert.ok(halfway > 0 && halfway < 1);
  assert.equal(
    deploymentAfterglowEnergy(START, START + DEPLOYMENT_AFTERGLOW_MS),
    0,
  );
});

test("persistent live controller retains last honest score during a brief stale gap", () => {
  const controller = createPersistentTelemetryModulator();
  const livePayload = payload();
  const liveFrame = computeFrame(livePayload);

  const live = controller.update({
    frame: liveFrame,
    payload: livePayload,
    at: START,
  });
  assert.equal(live.frame.scoreState, "healthy");
  assert.equal(live.retainedLastGood, false);

  const stalePayload = {
    ...livePayload,
    stale: true,
  };
  const staleBase = computeFrame(stalePayload);
  assert.equal(staleBase.scoreState, "unknown");

  const retained = controller.update({
    frame: staleBase,
    payload: stalePayload,
    at: START + 15_000,
  });
  assert.equal(retained.retainedLastGood, true);
  assert.equal(retained.frame.scoreState, "healthy");
  assert.equal(retained.frame.stale, true);
  assert.ok(retained.frame.modulation.staleDecay > 0);

  const expired = controller.update({
    frame: staleBase,
    payload: stalePayload,
    at: START + STALE_UNKNOWN_MS + 1,
  });
  assert.equal(expired.retainedLastGood, false);
  assert.equal(expired.frame.scoreState, "unknown");
});

test("continuous pressure releases more slowly than it attacks", () => {
  const controller = createPersistentTelemetryModulator();
  const pressuredPayload = payload({
    estate: {
      overall_health: 0.55,
      active_incidents: 1,
      known_service_ratio: 1,
    },
    services: [service({
      status: "degraded",
      latency_ms: 1000,
      error_rate: 0.08,
    })],
  });
  const pressured = controller.update({
    frame: computeFrame(pressuredPayload),
    payload: pressuredPayload,
    at: START,
  });
  assert.ok(pressured.modulation.pressure > 0.2);

  const recoveredPayload = payload({
    timestamp: new Date(START + 4000).toISOString(),
    lastSuccessfulAt: new Date(START + 4000).toISOString(),
  });
  const recovered = controller.update({
    frame: computeFrame(recoveredPayload),
    payload: recoveredPayload,
    at: START + 4000,
  });
  assert.ok(recovered.modulation.pressure > 0);
  assert.ok(recovered.modulation.pressure < pressured.modulation.pressure);
});

test("deployment afterglow is additive and never changes harmony or global filtering", () => {
  const controller = createPersistentTelemetryModulator();
  const input = payload();
  const base = computeFrame(input);
  const deployment = {
    status: "success",
    deployId: "deploy-2",
    commitSha: "abc123",
  };

  controller.update({
    frame: base,
    payload: input,
    deployment,
    at: START,
  });
  const active = controller.update({
    frame: base,
    payload: input,
    deployment,
    deploymentEvent: deployment,
    at: START + 1000,
  });

  assert.equal(active.frame.scoreState, base.scoreState);
  assert.deepEqual(active.frame.scale, base.scale);
  assert.equal(active.frame.masterFilterHz, base.masterFilterHz);
  assert.ok(active.frame.bpm > base.bpm);
  assert.ok(active.frame.modulation.deploymentEnergy > 0);
});
