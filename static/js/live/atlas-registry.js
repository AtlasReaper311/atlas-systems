const REGISTRY_ENDPOINT = "https://api.atlas-systems.uk/";
const TOPOLOGY_ENDPOINT = "https://api.atlas-systems.uk/v1/topology";
const POLL_MS = 60_000;

const subscribers = new Set();
let snapshot = null;
let lastGood = null;
let inFlight = null;
let timer = null;
let topologyPromise = null;
let visibilityBound = false;

function normalizeRegistry(data) {
  const workers = [];

  if (Array.isArray(data.workers)) {
    for (const worker of data.workers) {
      workers.push({
        name: worker.meta?.name || worker.name || "unknown",
        documented: Boolean(worker.documented),
        note: worker.note || null,
        probeUrl: worker.probe_url || "",
        via: worker.via || "",
        meta: worker.meta || null,
      });
    }
  } else if (Array.isArray(data.endpoints)) {
    const byWorker = new Map();

    for (const endpoint of data.endpoints) {
      const name = endpoint.worker || "unknown";
      if (!byWorker.has(name)) {
        byWorker.set(name, {
          name,
          documented: true,
          note: null,
          probeUrl: "",
          via: "",
          meta: {
            name,
            description: "",
            version: "",
            endpoints: [],
            source: endpoint.source || "",
          },
        });
      }

      byWorker.get(name).meta.endpoints.push({
        method: endpoint.method || "GET",
        path: endpoint.path || "",
        description: endpoint.description || "",
      });
    }

    workers.push(...byWorker.values());
  }

  return {
    generatedAt: data.generated_at || null,
    counts: data.counts || null,
    warnings: Array.isArray(data.discovery_warnings)
      ? data.discovery_warnings
      : [],
    workers,
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }

  return response.json();
}

function getTopology() {
  if (!topologyPromise) {
    topologyPromise = fetchJson(TOPOLOGY_ENDPOINT).catch((error) => {
      topologyPromise = null;
      throw error;
    });
  }

  return topologyPromise;
}

function filterToDeclaredWorkers(registry, topology) {
  const components = Array.isArray(topology?.components)
    ? topology.components
    : [];
  const allowed = new Set();

  for (const component of components) {
    if (component?.kind !== "worker") continue;
    const id = typeof component.id === "string"
      ? component.id
      : component.name;
    if (typeof id === "string" && id.length > 0) allowed.add(id);
  }

  const workers = registry.workers.filter((worker) => allowed.has(worker.name));

  return {
    generatedAt: registry.generatedAt,
    warnings: registry.warnings,
    workers,
    counts: {
      workers: workers.length,
      documented: workers.filter((worker) => worker.documented).length,
      undocumented: workers.filter((worker) => !worker.documented).length,
    },
  };
}

function emit() {
  for (const subscriber of subscribers) {
    try {
      subscriber(snapshot);
    } catch {
      // One consumer must never break registry delivery to the others.
    }
  }
}

function clearTimer() {
  if (timer === null) return;
  clearTimeout(timer);
  timer = null;
}

function scheduleNextPoll() {
  clearTimer();
  if (subscribers.size === 0 || document.hidden) return;

  timer = window.setTimeout(() => {
    timer = null;
    void poll();
  }, POLL_MS);
}

async function poll() {
  if (inFlight) return inFlight;

  clearTimer();
  inFlight = Promise.all([
    fetchJson(REGISTRY_ENDPOINT),
    getTopology(),
  ])
    .then(([registryData, topology]) => {
      const registry = normalizeRegistry(registryData);
      const filtered = filterToDeclaredWorkers(registry, topology);

      snapshot = {
        ok: true,
        stale: false,
        fetchedAt: new Date(),
        generatedAt: filtered.generatedAt,
        counts: filtered.counts,
        warnings: filtered.warnings,
        workers: filtered.workers,
      };
      lastGood = snapshot;
    })
    .catch(() => {
      snapshot = lastGood
        ? {
            ...lastGood,
            ok: false,
            stale: true,
          }
        : {
            ok: false,
            stale: false,
            fetchedAt: null,
            generatedAt: null,
            counts: null,
            warnings: [],
            workers: [],
          };
    })
    .finally(() => {
      inFlight = null;
      emit();
      scheduleNextPoll();
    });

  return inFlight;
}

function bindVisibility() {
  if (visibilityBound) return;
  visibilityBound = true;

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearTimer();
      return;
    }

    if (subscribers.size > 0) void poll();
  });
}

function ensurePolling() {
  bindVisibility();
  if (subscribers.size === 0) return;

  if (!snapshot && !inFlight) {
    void poll();
  } else {
    scheduleNextPoll();
  }
}

export function subscribe(subscriber) {
  if (typeof subscriber !== "function") {
    throw new TypeError("Atlas registry subscriber must be a function");
  }

  subscribers.add(subscriber);
  ensurePolling();

  if (snapshot) subscriber(snapshot);

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) clearTimer();
  };
}

export function refresh() {
  return poll();
}

export function getSnapshot() {
  return snapshot;
}
