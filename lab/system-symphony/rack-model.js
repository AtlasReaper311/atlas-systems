"use strict";

export const NARROW_BREAKPOINT = 760;
export const ROLE_ORDER = Object.freeze(["clock", "pulse", "memory", "thermal", "signal", "contention", "recovery"]);
export const ROLE_META = Object.freeze({
  clock: ["Clock", "Timing lane", "Master timing and polling cadence."],
  pulse: ["Pulse", "Service lane", "Surface and public API lead voices."],
  memory: ["Memory", "Service lane", "Local AI memory and carrier voices."],
  thermal: ["Thermal", "Service lane", "Infrastructure foundation voices."],
  signal: ["Signal", "Service lane", "Edge, gateway and noise voices."],
  contention: ["Contention", "Service lane", "Observability and diagnostic voices."],
  recovery: ["Recovery", "Event lane", "Deployment and incident accents."],
});
export const FIXED_SERVICES = Object.freeze([
  "ramone-memory", "atlas-corpus", "specular-telemetry", "atlas-api-public", "atlas-api-index",
  "atlas-notify", "ramone-trigger", "specular-edge", "github-pulse", "site-pulse", "deploy-watch",
  "atlas-badges", "atlas-blackbox", "atlas-dep-audit", "atlas-doc-viewer", "atlas-journey-watch",
  "atlas-quota-watch", "atlas-systems", "ramone-edge", "specular-sonify", "status",
]);
export const STATUS_TOKEN = Object.freeze({ healthy: "OK", degraded: "WARN", down: "CRIT", unknown: "UNK", unmeasured: "NO MEAS" });

export function roleFromText(value) {
  const text = String(value ?? "").toLowerCase();
  if (/pulse|lead|arp/.test(text)) return "pulse";
  if (/contention|counter|diagnostic|fm/.test(text)) return "contention";
  if (/thermal|bass|triangle|foundation/.test(text)) return "thermal";
  if (/signal|noise|drum|hat|rhythm/.test(text)) return "signal";
  if (/memory|pad|carrier|wavetable/.test(text)) return "memory";
  if (/recovery|event|accent|deploy|incident/.test(text)) return "recovery";
  return "signal";
}

export function normaliseStatus(value) {
  const text = String(value ?? "").toLowerCase();
  if (/unmeasured|not measured|no measurement|topology only/.test(text)) return "unmeasured";
  if (/critical|down|fail/.test(text)) return "down";
  if (/degrad|warn/.test(text)) return "degraded";
  if (/healthy|\bok\b|nominal/.test(text)) return "healthy";
  return "unknown";
}

export function sourceKey(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "live") return "live";
  if (raw === "stale" || raw === "live stale") return "stale";
  if (raw === "preview" || raw === "fixture") return "fixture";
  if (raw === "demo" || raw === "replay") return "replay";
  return "connecting";
}

export function estateStateKey(value) {
  const state = normaliseStatus(String(value ?? "").split("/")[0]);
  return state === "healthy" ? "healthy" : state === "degraded" ? "warning" : state === "down" ? "critical" : "unknown";
}

export function cordPath(from, to) {
  const sag = Math.max(26, Math.abs(to.x - from.x) * 0.16);
  return `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} C ${from.x.toFixed(1)} ${(from.y + sag).toFixed(1)}, ${to.x.toFixed(1)} ${(to.y - sag).toFixed(1)}, ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
}

export function routesForSelection(services, selected, role) {
  const byId = new Map(services.map((item) => [item.id, item]));
  const routes = [];
  if (selected && byId.has(selected)) {
    for (const to of byId.get(selected).deps) routes.push({ from: selected, to, direction: "out" });
    for (const from of byId.get(selected).dependents) routes.push({ from, to: selected, direction: "in" });
  } else if (role && role !== "clock") {
    for (const item of services.filter((entry) => entry.role === role)) {
      for (const to of item.deps) routes.push({ from: item.id, to, direction: "out" });
    }
  }
  return routes;
}

function nodeId(node) {
  return node.dataset.node || node.querySelector("title")?.textContent?.split(":", 1)[0]?.trim()
    || node.getAttribute("aria-label")?.split(",", 1)[0]?.trim() || "";
}
function nodeName(node) {
  return node.querySelector(":scope > text")?.textContent?.trim()
    || node.querySelector("title")?.textContent?.split(":", 1)[0]?.trim() || nodeId(node);
}
function nodeStatus(node) {
  return ["healthy", "degraded", "down", "unknown", "unmeasured"].find((key) => node.classList.contains(`status-${key}`)) || "unknown";
}
function cell(row, index) { return row.children[index]?.textContent?.trim() || ""; }
function tableIndexes(host) {
  const table = host.querySelector("[data-service-table]")?.closest("table");
  const heads = [...(table?.querySelectorAll("thead th") || [])].map((item) => item.textContent.trim().toLowerCase());
  const find = (...names) => names.reduce((found, name) => found >= 0 ? found : heads.findIndex((head) => head.includes(name)), -1);
  return { status: find("status", "state"), role: find("role", "voice", "channel"), evidence: find("evidence", "source") };
}

export function readEstate(host) {
  const topology = host.querySelector("[data-topology]");
  const map = new Map();
  for (const node of topology?.querySelectorAll("[data-node], .symphony-node--external") || []) {
    const id = nodeId(node);
    if (!id) continue;
    const external = node.classList.contains("symphony-node--external") || !FIXED_SERVICES.includes(id);
    const status = external ? "unmeasured" : nodeStatus(node);
    map.set(id, { id, name: nodeName(node), role: roleFromText(node.dataset.apuRole || node.getAttribute("aria-label") || id), status,
      statusText: status, evidence: "", measured: !external && status !== "unmeasured", external,
      deps: [], dependents: [], row: null, node, selected: node.classList.contains("is-selected") });
  }
  const indexes = tableIndexes(host);
  for (const row of host.querySelector("[data-service-table]")?.querySelectorAll(":scope > tr") || []) {
    const display = cell(row, 0);
    const entry = [...map.values()].find((item) => item.id === display || item.name.toLowerCase() === display.toLowerCase());
    if (!entry) continue;
    const statusText = indexes.status >= 0 ? cell(row, indexes.status) : entry.statusText;
    const evidence = indexes.evidence >= 0 ? cell(row, indexes.evidence) : "";
    entry.name = display;
    entry.status = normaliseStatus(statusText);
    entry.statusText = statusText || "unknown";
    entry.role = roleFromText(indexes.role >= 0 ? cell(row, indexes.role) : entry.role);
    entry.evidence = evidence;
    entry.measured = !entry.external && entry.status !== "unmeasured" && !/topology|unmeasured|no measurement/i.test(evidence);
    entry.row = row;
    entry.selected ||= row.classList.contains("is-selected");
  }
  for (const edge of topology?.querySelectorAll(".symphony-edge") || []) {
    const from = edge.dataset.from;
    const to = edge.dataset.to;
    if (!from || !to) continue;
    if (!map.has(to)) map.set(to, { id: to, name: to, role: "signal", status: "unmeasured", statusText: "topology only",
      evidence: "", measured: false, external: true, deps: [], dependents: [], row: null, node: null, selected: false });
    map.get(from)?.deps.push(to);
    map.get(to)?.dependents.push(from);
  }
  const source = sourceKey(host.dataset.source);
  const stateText = host.querySelector('[data-metric="state"]')?.textContent?.trim() || host.dataset.state || "unknown";
  return {
    services: [...map.values()], topology,
    source: { key: source, label: source === "stale" ? "LIVE STALE" : source === "fixture" ? "FIXTURE" : source === "replay" ? "REPLAY" : source.toUpperCase(),
      detail: source === "live" ? "CURRENT READ" : source === "stale" ? "LAST-KNOWN READ" : source === "fixture" ? "STATIC FIXTURE" : source === "replay" ? "BROWSER REPLAY" : "NO SOURCE CLAIM" },
    state: { key: estateStateKey(stateText), detail: stateText },
    running: host.dataset.running === "1", stale: source === "stale",
    selected: [...map.values()].find((item) => item.selected)?.id || "",
  };
}
