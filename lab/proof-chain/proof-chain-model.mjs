const INDEX_SCHEMA = "atlas-public-trace-index/v1";
const DETAIL_SCHEMA = "atlas-public-trace-service/v1";
const ALLOWED_RELATIONS = new Set(["SOURCE_OF", "GOVERNED_BY"]);
const ALLOWED_NODE_KINDS = new Set(["repository", "service", "adr"]);

export function normalizeTraceIndex(value) {
  if (!value || typeof value !== "object" || value.schema !== INDEX_SCHEMA) {
    throw new Error("unsupported public Trace index");
  }
  if (!Array.isArray(value.services)) {
    throw new Error("public Trace index has no service list");
  }

  const services = value.services
    .filter(
      (service) =>
        service &&
        typeof service === "object" &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(service.service_id || "")) &&
        /^AtlasReaper311\/[A-Za-z0-9._-]+$/.test(String(service.repository || "")) &&
        Number.isInteger(service.governance_count) &&
        service.governance_count >= 0,
    )
    .map((service) => ({
      serviceId: service.service_id,
      repository: service.repository,
      kind: String(service.kind || "runtime"),
      lifecycle: String(service.lifecycle || "unknown"),
      governanceCount: service.governance_count,
      proofChain: String(service.proof_chain || ""),
    }))
    .sort((left, right) => left.serviceId.localeCompare(right.serviceId));

  return {
    schema: value.schema,
    authority: String(value.authority || ""),
    classificationFingerprint: String(value.classification_fingerprint || ""),
    liveTopology: normalizeLiveTopology(value.live_topology),
    services,
  };
}

function normalizeLiveTopology(value) {
  const state = String(value?.state || "unavailable");
  return {
    state,
    producer: String(value?.producer || "unknown"),
    reason: String(value?.reason || "No live topology evidence is available."),
  };
}

function normalizeNode(node) {
  if (!node || typeof node !== "object" || !ALLOWED_NODE_KINDS.has(node.kind)) {
    return null;
  }
  const nodeId = String(node.node_id || "");
  if (!/^node:sha256:[0-9a-f]{64}$/.test(nodeId)) return null;
  const identity = node.identity && typeof node.identity === "object" ? node.identity : {};
  return {
    nodeId,
    kind: node.kind,
    key: String(identity.key || ""),
    repository: String(identity.repository || ""),
    serviceId: String(identity.service_id || ""),
    externalId: String(identity.external_id || ""),
    evidenceState: String(node.evidence_state || "unknown"),
    evidence: Array.isArray(node.evidence) ? node.evidence : [],
  };
}

function normalizeEdge(edge) {
  if (!edge || typeof edge !== "object" || !ALLOWED_RELATIONS.has(edge.relation)) {
    return null;
  }
  const edgeId = String(edge.edge_id || "");
  if (!/^edge:sha256:[0-9a-f]{64}$/.test(edgeId)) return null;
  return {
    edgeId,
    from: String(edge.from_node || ""),
    to: String(edge.to_node || ""),
    relation: edge.relation,
    rationale: String(edge.basis?.rationale || "Verified relationship."),
    evidence: Array.isArray(edge.evidence) ? edge.evidence : [],
  };
}

export function normalizeTraceDetail(value) {
  if (!value || typeof value !== "object" || value.schema !== DETAIL_SCHEMA) {
    throw new Error("unsupported public Trace service document");
  }
  const subject = value.subject;
  if (!subject || typeof subject !== "object") {
    throw new Error("Trace service has no subject");
  }
  const serviceId = String(subject.service_id || "");
  const repository = String(subject.repository || "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(serviceId)) {
    throw new Error("Trace service identity is invalid");
  }
  if (!/^AtlasReaper311\/[A-Za-z0-9._-]+$/.test(repository)) {
    throw new Error("Trace repository identity is invalid");
  }

  const nodes = (value.graph?.nodes || []).map(normalizeNode).filter(Boolean);
  const nodeIds = new Set(nodes.map((node) => node.nodeId));
  const edges = (value.graph?.edges || [])
    .map(normalizeEdge)
    .filter((edge) => edge && nodeIds.has(edge.from) && nodeIds.has(edge.to));

  const serviceNode = nodes.find(
    (node) => node.kind === "service" && node.serviceId === serviceId,
  );
  const repositoryNode = nodes.find(
    (node) => node.kind === "repository" && node.repository === repository,
  );
  if (!serviceNode || !repositoryNode) {
    throw new Error("Trace service is missing its verified source nodes");
  }

  const sourceEdge = edges.find(
    (edge) =>
      edge.relation === "SOURCE_OF" &&
      edge.from === repositoryNode.nodeId &&
      edge.to === serviceNode.nodeId,
  );
  if (!sourceEdge) {
    throw new Error("Trace service is missing its SOURCE_OF proof");
  }

  const governance = edges
    .filter(
      (edge) => edge.relation === "GOVERNED_BY" && edge.from === serviceNode.nodeId,
    )
    .map((edge) => ({
      edge,
      node: nodes.find((node) => node.nodeId === edge.to && node.kind === "adr"),
    }))
    .filter((item) => item.node)
    .sort((left, right) => left.node.externalId.localeCompare(right.node.externalId));

  return {
    subject: {
      serviceId,
      repository,
      kind: String(subject.kind || "runtime"),
      layer: String(subject.layer || "unknown"),
      lifecycle: String(subject.lifecycle || "unknown"),
      publicSurface: String(subject.public_surface || ""),
      metadataUrl: String(subject.metadata_url || ""),
    },
    serviceNode,
    repositoryNode,
    sourceEdge,
    governance,
    liveTopology: normalizeLiveTopology(value.live_topology),
    sources: value.sources && typeof value.sources === "object" ? value.sources : {},
  };
}

export function filterServices(services, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return [...services];
  return services.filter((service) =>
    `${service.serviceId} ${service.repository} ${service.kind} ${service.lifecycle}`
      .toLowerCase()
      .includes(needle),
  );
}

export function topologyLabel(liveTopology) {
  const state = String(liveTopology?.state || "unavailable").toLowerCase();
  if (state === "verified" || state === "healthy") return "verified";
  if (state === "stale") return "stale";
  return "unavailable";
}
