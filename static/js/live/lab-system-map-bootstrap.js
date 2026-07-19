import { subscribe as subscribeRegistry } from "./atlas-registry.js?v=20260720-esm-live";

const TOPOLOGY_URL = "https://api.atlas-systems.uk/v1/topology";
const MAP_URL = "/lab/system-map.js?v=20260715-route-clarity";
const BLOCKED = new Set(["simple-proxy"]);

let mounted = false;
let lastSnapshot = null;
let refreshInFlight = null;
let unsubscribeRegistry = null;

function cloneBase() {
  const topology = window.ATLAS_TOPOLOGY || {
    nodes: [],
    edges: [],
    kv: [],
  };

  return {
    nodes: (topology.nodes || []).map((node) => ({ ...node })),
    edges: (topology.edges || []).map((edge) => ({ ...edge })),
    kv: (topology.kv || []).map((entry) => ({ ...entry })),
  };
}

function statusFor(component, workerByName) {
  if (component.kind !== "worker") return "static";

  const worker = workerByName.get(component.id);
  if (!worker) return "down";
  if (worker.documented === false) return "undoc";

  const status = typeof worker.meta?.status === "string"
    ? worker.meta.status.toLowerCase()
    : "live";

  return status === "ok" || status === "operational"
    ? "live"
    : status || "live";
}

function roleFor(component) {
  if (component.kind === "worker") return "worker";
  if (component.kind === "site") return "site";
  if (component.kind === "repository") return "repo";
  return "infra";
}

function mergeNode(graph, incoming) {
  if (!incoming?.id || BLOCKED.has(incoming.id)) return;

  const index = graph.nodes.findIndex((node) => node.id === incoming.id);
  if (index === -1) {
    graph.nodes.push(incoming);
    return;
  }

  graph.nodes[index] = {
    ...graph.nodes[index],
    ...incoming,
    role:
      graph.nodes[index].role === "local" || graph.nodes[index].role === "ext"
        ? graph.nodes[index].role
        : incoming.role || graph.nodes[index].role,
  };
}

function addEdge(graph, edge) {
  if (!edge?.from || !edge?.to) return;
  if (BLOCKED.has(edge.from) || BLOCKED.has(edge.to)) return;

  const ids = new Set(graph.nodes.map((node) => node.id));
  if (!ids.has(edge.from) || !ids.has(edge.to)) return;

  const exists = graph.edges.some((candidate) =>
    candidate.from === edge.from &&
    candidate.to === edge.to &&
    candidate.kind === edge.kind,
  );

  if (!exists) graph.edges.push(edge);
}

function compile(topologyDocument, snapshot) {
  const graph = cloneBase();
  const workers = Array.isArray(snapshot?.workers) ? snapshot.workers : [];
  const workerByName = new Map(
    workers.map((worker) => [worker.name, worker]),
  );

  for (const component of topologyDocument.components || []) {
    if (!component || BLOCKED.has(component.id)) continue;

    mergeNode(graph, {
      id: component.id,
      label: component.id,
      role: roleFor(component),
      kind: component.kind,
      layer: component.layer || "reusable-kit",
      lifecycle: component.lifecycle || "production",
      status: statusFor(component, workerByName),
      sourceOnly:
        component.source_only === true ||
        component.kind === "repository" ||
        component.kind === "tool" ||
        component.kind === "github-actions",
      repo: component.repo || null,
      publicSurface: component.public_surface || null,
      description: component.description || "",
      language: component.language || null,
      topics: Array.isArray(component.topics) ? component.topics : [],
    });
  }

  for (const worker of workers) {
    if (!worker?.name || BLOCKED.has(worker.name)) continue;

    const existing = graph.nodes.find((node) => node.id === worker.name);
    const status = worker.documented === false
      ? "undoc"
      : worker.meta?.status || "live";

    mergeNode(graph, {
      id: worker.name,
      label: worker.name,
      role: existing?.role || "worker",
      kind: existing?.kind || "worker",
      layer: existing?.layer || "public-api",
      status,
      description:
        existing?.description ||
        worker.meta?.description ||
        "Discovered from the live Worker registry.",
    });
  }

  const ids = new Set(graph.nodes.map((node) => node.id));

  for (const component of topologyDocument.components || []) {
    if (!ids.has(component.id)) continue;

    for (const dependency of component.depends_on || []) {
      if (!ids.has(dependency)) continue;

      addEdge(graph, {
        from: component.id,
        to: dependency,
        kind:
          component.kind === "repository" ||
          component.kind === "github-actions" ||
          component.kind === "tool"
            ? "poll"
            : "http",
        label: "declared dependency",
        generated: true,
      });
    }
  }

  graph.nodes = graph.nodes
    .filter((node) => !BLOCKED.has(node.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  const visible = new Set(graph.nodes.map((node) => node.id));

  graph.edges = graph.edges
    .filter((edge) =>
      visible.has(edge.from) &&
      visible.has(edge.to) &&
      !BLOCKED.has(edge.from) &&
      !BLOCKED.has(edge.to),
    )
    .sort((a, b) =>
      `${a.from}|${a.to}|${a.kind}`.localeCompare(
        `${b.from}|${b.to}|${b.kind}`,
      ),
    );

  graph.kv = graph.kv
    .filter((entry) => visible.has(entry.parent))
    .sort((a, b) => a.id.localeCompare(b.id));

  return graph;
}

async function fetchTopology() {
  const response = await fetch(TOPOLOGY_URL, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`topology ${response.status}`);
  }

  return response.json();
}

function mountMap() {
  if (mounted) return;
  mounted = true;
  void import(MAP_URL);
}

function publish(graph, snapshot, topology) {
  const detail = { graph, snapshot, topology };

  // system-map.js still consumes this handoff. Removing that global belongs to
  // the system-map module boundary, not the registry migration.
  window.ATLAS_SYSTEM_MAP_DATA = detail;
  mountMap();

  window.dispatchEvent(
    new CustomEvent("atlas:system-map-data", { detail }),
  );
}

async function refresh(snapshot) {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = fetchTopology()
    .catch(() => ({
      schema: "atlas-public-topology/fallback",
      components: [],
    }))
    .then((topology) => {
      publish(compile(topology, snapshot), snapshot, topology);
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

function start() {
  unsubscribeRegistry = subscribeRegistry((snapshot) => {
    lastSnapshot = snapshot;
    void refresh(snapshot);
  });

  window.setInterval(() => {
    if (lastSnapshot && !document.hidden) void refresh(lastSnapshot);
  }, 60_000);

  window.addEventListener("pagehide", () => {
    unsubscribeRegistry?.();
    unsubscribeRegistry = null;
  }, { once: true });
}

start();
