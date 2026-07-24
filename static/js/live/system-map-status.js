"use strict";

const HEALTH_ALIASES = Object.freeze({
  "atlas-api-index": "registry",
  "atlas-badges": "atlas_badges",
  "atlas-blackbox": "atlas_blackbox",
  "atlas-dep-audit": "atlas_dep_audit",
  "atlas-doc-viewer": "atlas_doc_viewer",
  "atlas-journey-watch": "atlas_journey_watch",
  "atlas-quota-watch": "atlas_quota_watch",
  "atlas-systems": "atlas_systems",
  "atlas-corpus": "corpus",
  "atlas-notify": "notify",
  "github-pulse": "github_pulse",
  "ramone-edge": "ramone_edge",
  "ramone-memory": "machine",
  "ramone-trigger": "ramone_trigger",
  "site-pulse": "site_pulse",
  "specular-edge": "specular_edge",
  "specular-telemetry": "specular",
  status: "status_surface",
  ollama: "machine",
  "home-assistant": "machine",
});

export function mapHealthState(value) {
  const state = String(value || "").trim().toLowerCase();

  if (["healthy", "live", "ok", "online", "operational", "up"].includes(state)) {
    return "live";
  }

  if (["degraded", "partial", "warning"].includes(state)) {
    return "degraded";
  }

  if (["critical", "down", "failed", "offline", "unhealthy"].includes(state)) {
    return "down";
  }

  return "unknown";
}

export function healthStatusForNode(nodeId, stats) {
  const componentKey = HEALTH_ALIASES[nodeId] || nodeId.replaceAll("-", "_");
  const detail = stats?.estate?.component_details?.[componentKey];

  if (detail && typeof detail.status === "string") {
    return mapHealthState(detail.status);
  }

  const componentState = stats?.estate?.components?.[componentKey];
  if (componentState === true) return "live";
  if (componentState === false) return "down";
  return null;
}

export function applyHealthEvidence(nodes, stats) {
  return nodes.map((node) => {
    const status = healthStatusForNode(node.id, stats);
    return status ? { ...node, status } : node;
  });
}

export { HEALTH_ALIASES };
