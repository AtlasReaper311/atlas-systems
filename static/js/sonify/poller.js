/**
 * System SYMPHONY read-only data coordinator.
 *
 * Telemetry is frequent and authoritative, topology is slow-moving identity
 * data, and deploy-watch supplies event identity. Requests never overlap and
 * every timeout is shorter than the telemetry interval.
 */

import {
  computeFrame,
  mergeTelemetryAndTopology,
} from "./mapping.js?v=20260716-system-symphony-expanded-library";

export const SONIFY_URL = "https://api.atlas-systems.uk/sonify";
export const TOPOLOGY_URL = "https://api.atlas-systems.uk/v1/topology";
export const DEPLOYMENT_URL = "https://api.atlas-systems.uk/deploy-watch/latest";

export const POLL_INTERVAL_MS = 4000;
export const FETCH_TIMEOUT_MS = 3000;
export const TOPOLOGY_INTERVAL_MS = 5 * 60 * 1000;
export const DEPLOYMENT_INTERVAL_MS = 12000;

function incidentCount(value) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function incidentIncrease(previous, current) {
  if (previous === null) return 0;
  return Math.max(0, incidentCount(current) - incidentCount(previous));
}

export function successfulDeploymentIdentity(deployment) {
  if (!deployment || deployment.ok === false || deployment.status !== "success") {
    return null;
  }
  const identity = deployment.deployId ?? deployment.commitSha;
  return identity ? String(identity) : null;
}

export function detectDeploymentChange(previousIdentity, deployment) {
  const nextIdentity = successfulDeploymentIdentity(deployment);
  if (!nextIdentity) {
    return { nextIdentity: previousIdentity, event: null, baseline: false };
  }
  if (previousIdentity === null) {
    return { nextIdentity, event: null, baseline: true };
  }
  if (nextIdentity === previousIdentity) {
    return { nextIdentity, event: null, baseline: false };
  }
  return {
    nextIdentity,
    event: { ...deployment, identity: nextIdentity },
    baseline: false,
  };
}

async function fetchJson(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`${url} answered ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * @param {object} options
 * @param {(frame: object, info: object) => void} options.onFrame
 * @param {(status: object) => void} [options.onStatus]
 * @param {(deployment: object) => void} [options.onDeployment]
 */
export function createPoller({
  onFrame,
  onStatus,
  onDeployment,
  telemetryUrl = SONIFY_URL,
  topologyUrl = TOPOLOGY_URL,
  deploymentUrl = DEPLOYMENT_URL,
  intervalMs = POLL_INTERVAL_MS,
  topologyIntervalMs = TOPOLOGY_INTERVAL_MS,
  deploymentIntervalMs = DEPLOYMENT_INTERVAL_MS,
  timeoutMs = FETCH_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
}) {
  if (typeof onFrame !== "function") {
    throw new TypeError("createPoller requires onFrame");
  }
  if (typeof fetchImpl !== "function") {
    throw new TypeError("createPoller requires fetch");
  }

  let running = false;
  let inFlight = false;
  let timer = null;
  let topology = null;
  let latestDeployment = null;
  let deploymentIdentity = null;
  let lastTelemetry = null;
  let lastMerged = null;
  let lastSuccessfulAt = null;
  let previousIncidents = null;
  let nextTopologyAt = 0;
  let nextDeploymentAt = 0;

  const failureStreaks = new Map();

  function failSource(source, error) {
    const failures = (failureStreaks.get(source) ?? 0) + 1;
    failureStreaks.set(source, failures);
    if (failures === 1) {
      console.warn(
        `system-symphony: ${source} read failed; retaining honest fallback (${error instanceof Error ? error.message : String(error)})`,
      );
    }
    return failures;
  }

  function recoverSource(source) {
    failureStreaks.set(source, 0);
  }

  function emitStale(error) {
    const failures = failSource("telemetry", error);
    const staleMerged = {
      ...(lastMerged ?? mergeTelemetryAndTopology({}, topology)),
      stale: true,
      lastSuccessfulAt,
    };
    const frame = computeFrame(staleMerged);
    onStatus?.({
      source: "telemetry",
      failing: true,
      stale: true,
      failures,
      lastSuccessfulAt,
    });
    onFrame(frame, {
      raw: lastTelemetry,
      merged: staleMerged,
      topology,
      deployment: latestDeployment,
      deploymentEvent: null,
      newIncidents: 0,
      stale: true,
      lastSuccessfulAt,
    });
  }

  async function pollOnce() {
    if (inFlight) return false;
    inFlight = true;
    const startedAt = now();
    const topologyDue = startedAt >= nextTopologyAt;
    const deploymentDue = startedAt >= nextDeploymentAt;
    if (topologyDue) nextTopologyAt = startedAt + topologyIntervalMs;
    if (deploymentDue) nextDeploymentAt = startedAt + deploymentIntervalMs;

    const telemetryRequest = fetchJson(fetchImpl, telemetryUrl, timeoutMs);
    const topologyRequest = topologyDue
      ? fetchJson(fetchImpl, topologyUrl, timeoutMs)
      : Promise.resolve(null);
    const deploymentRequest = deploymentDue
      ? fetchJson(fetchImpl, deploymentUrl, timeoutMs)
      : Promise.resolve(null);

    const [telemetryResult, topologyResult, deploymentResult] =
      await Promise.allSettled([
        telemetryRequest,
        topologyRequest,
        deploymentRequest,
      ]);

    let deploymentEvent = null;
    try {
      if (topologyDue) {
        if (topologyResult.status === "fulfilled") {
          topology = topologyResult.value;
          recoverSource("topology");
        } else {
          failSource("topology", topologyResult.reason);
        }
      }

      if (deploymentDue) {
        if (deploymentResult.status === "fulfilled") {
          latestDeployment = deploymentResult.value;
          recoverSource("deployment");
          const detection = detectDeploymentChange(
            deploymentIdentity,
            latestDeployment,
          );
          deploymentIdentity = detection.nextIdentity;
          deploymentEvent = detection.event;
          if (deploymentEvent) onDeployment?.(deploymentEvent);
        } else {
          failSource("deployment", deploymentResult.reason);
        }
      }

      if (telemetryResult.status === "rejected") {
        emitStale(telemetryResult.reason);
        return true;
      }

      recoverSource("telemetry");
      lastTelemetry = telemetryResult.value;
      lastSuccessfulAt =
        typeof lastTelemetry?.timestamp === "string"
          ? lastTelemetry.timestamp
          : new Date(startedAt).toISOString();
      lastMerged = mergeTelemetryAndTopology(
        {
          ...lastTelemetry,
          stale: false,
          lastSuccessfulAt,
        },
        topology,
      );
      const frame = computeFrame(lastMerged);
      const newIncidents = incidentIncrease(
        previousIncidents,
        frame.activeIncidents,
      );
      previousIncidents = frame.activeIncidents;

      onStatus?.({
        source: "telemetry",
        failing: false,
        stale: false,
        failures: 0,
        lastSuccessfulAt,
      });
      onFrame(frame, {
        raw: lastTelemetry,
        merged: lastMerged,
        topology,
        deployment: latestDeployment,
        deploymentEvent,
        newIncidents,
        stale: false,
        lastSuccessfulAt,
      });
      return true;
    } finally {
      inFlight = false;
    }
  }

  function scheduleNext() {
    if (!running) return;
    timer = setTimeout(async () => {
      await pollOnce();
      scheduleNext();
    }, intervalMs);
  }

  return {
    start() {
      if (running) return;
      running = true;
      void pollOnce().finally(scheduleNext);
    },
    stop() {
      running = false;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
    pollNow: pollOnce,
    isInFlight: () => inFlight,
    getSnapshot: () => ({
      topology,
      latestDeployment,
      lastTelemetry,
      lastMerged,
      lastSuccessfulAt,
    }),
  };
}
