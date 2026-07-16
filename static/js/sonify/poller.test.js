import test from "node:test";
import assert from "node:assert/strict";

import {
  DEPLOYMENT_URL,
  SONIFY_URL,
  TOPOLOGY_URL,
  createPoller,
  detectDeploymentChange,
  incidentIncrease,
  successfulDeploymentIdentity,
} from "./poller.js";

const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() {
    return structuredClone(body);
  },
});

const healthyTelemetry = {
  timestamp: "2026-07-16T09:00:00.000Z",
  estate: { overall_health: 1, active_incidents: 0 },
  services: [
    {
      name: "atlas-api-index",
      status: "healthy",
      latency_ms: 30,
      uptime_pct: 100,
      error_rate: 0,
      last_deploy_secs_ago: null,
    },
  ],
};

test("incident increase establishes a baseline and never repeats unchanged state", () => {
  assert.equal(incidentIncrease(null, 3), 0);
  assert.equal(incidentIncrease(3, 3), 0);
  assert.equal(incidentIncrease(3, 5), 2);
  assert.equal(incidentIncrease(5, 1), 0);
});

test("deployment detection baselines initial success and emits only a new identity", () => {
  const first = { ok: true, status: "success", deployId: "deploy-a", commitSha: "aaa" };
  const second = { ok: true, status: "success", deployId: "deploy-b", commitSha: "bbb" };
  assert.equal(successfulDeploymentIdentity(first), "deploy-a");

  const baseline = detectDeploymentChange(null, first);
  assert.equal(baseline.baseline, true);
  assert.equal(baseline.event, null);
  assert.equal(detectDeploymentChange(baseline.nextIdentity, first).event, null);

  const changed = detectDeploymentChange(baseline.nextIdentity, second);
  assert.equal(changed.event.identity, "deploy-b");
  assert.equal(changed.event.commitSha, "bbb");

  const failure = detectDeploymentChange(changed.nextIdentity, {
    ok: false,
    status: "failure",
    deployId: "deploy-c",
  });
  assert.equal(failure.event, null);
  assert.equal(failure.nextIdentity, "deploy-b");
});

test("a telemetry failure preserves last raw values but emits stale Unknown", async () => {
  let telemetryCalls = 0;
  const frames = [];
  const infos = [];
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const fetchImpl = async (url) => {
      if (url === SONIFY_URL) {
        telemetryCalls += 1;
        if (telemetryCalls === 1) return response(healthyTelemetry);
        throw new Error("offline");
      }
      if (url === TOPOLOGY_URL) {
        return response({
          components: [
            {
              id: "atlas-api-index",
              layer: "public-api",
              kind: "worker",
              source_only: false,
              depends_on: [],
            },
          ],
        });
      }
      return response({
        ok: true,
        status: "success",
        deployId: "baseline",
        commitSha: "abc",
      });
    };
    const poller = createPoller({
      onFrame(frame, info) {
        frames.push(frame);
        infos.push(info);
      },
      fetchImpl,
    });
    await poller.pollNow();
    await poller.pollNow();

    assert.equal(frames[0].scoreState, "healthy");
    assert.equal(frames[1].scoreState, "unknown");
    assert.equal(frames[1].stale, true);
    assert.deepEqual(infos[1].raw, healthyTelemetry);
    assert.equal(infos[1].merged.services[0].latency_ms, 30);
    assert.equal(infos[1].lastSuccessfulAt, healthyTelemetry.timestamp);
  } finally {
    console.warn = originalWarn;
  }
});

test("topology failure falls back to measured telemetry without blocking a frame", async () => {
  const frames = [];
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const poller = createPoller({
      onFrame(frame) {
        frames.push(frame);
      },
      fetchImpl: async (url) => {
        if (url === SONIFY_URL) return response(healthyTelemetry);
        if (url === TOPOLOGY_URL) throw new Error("topology unavailable");
        return response({ ok: true, status: "success", deployId: "baseline" });
      },
    });
    await poller.pollNow();
    assert.equal(frames.length, 1);
    assert.equal(frames[0].totalComponents, 1);
    assert.equal(frames[0].measuredComponents, 1);
    assert.equal(frames[0].topologyAvailable, false);
  } finally {
    console.warn = originalWarn;
  }
});

test("poller does not overlap an in-flight telemetry request", async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const poller = createPoller({
    onFrame() {},
    fetchImpl: async (url) => {
      if (url === SONIFY_URL) {
        await pending;
        return response(healthyTelemetry);
      }
      if (url === TOPOLOGY_URL) return response({ components: [] });
      return response({ ok: true, status: "success", deployId: "baseline" });
    },
  });
  const first = poller.pollNow();
  assert.equal(poller.isInFlight(), true);
  assert.equal(await poller.pollNow(), false);
  release();
  assert.equal(await first, true);
  assert.equal(poller.isInFlight(), false);
});

test("poller emits a new successful deployment after the initial baseline", async () => {
  let time = 0;
  let deployId = "deploy-a";
  const deployments = [];
  const poller = createPoller({
    onFrame() {},
    onDeployment(event) {
      deployments.push(event);
    },
    now: () => time,
    fetchImpl: async (url) => {
      if (url === SONIFY_URL) return response(healthyTelemetry);
      if (url === TOPOLOGY_URL) return response({ components: [] });
      if (url === DEPLOYMENT_URL) {
        return response({
          ok: true,
          status: "success",
          deployId,
          commitSha: deployId === "deploy-a" ? "aaa" : "bbb",
        });
      }
      throw new Error(`unexpected ${url}`);
    },
  });
  await poller.pollNow();
  assert.equal(deployments.length, 0);
  deployId = "deploy-b";
  time = 12001;
  await poller.pollNow();
  assert.equal(deployments.length, 1);
  assert.equal(deployments[0].identity, "deploy-b");
});
