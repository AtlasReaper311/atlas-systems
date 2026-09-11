import { RESULT } from "./change-chain.js";
import { isPublicSafeHref } from "./public-safe-href.js";
import {
  observationsFromPublicSources,
  projectServiceView,
  serviceViewStatus,
} from "./service-profile.js";
import { SERVICE_SPECIMEN } from "./service-specimen.js";

export { isPublicSafeHref };

const FETCH_TIMEOUT_MS = 6000;
const SERVICE_STYLE_HREF = "/static/css/systems-evidence-service-view.css?v=20260911-recovery";
const byId = (id) => document.getElementById(id);

function ensureServiceViewStyles() {
  if (typeof document === "undefined" || !document.head) return;
  if (document.querySelector(`link[data-service-view-styles][href="${SERVICE_STYLE_HREF}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = SERVICE_STYLE_HREF;
  link.dataset.serviceViewStyles = "true";
  document.head.appendChild(link);
}

function resultLabel(result) {
  return result === RESULT.OBSERVED ? "Observed" : result;
}

function appendText(parent, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

function evidenceBadge(result, evidenceMode) {
  const badge = document.createElement("span");
  badge.className = "atlas-evidence-mode";
  badge.dataset.evidenceMode = evidenceMode;
  badge.textContent = resultLabel(result);
  return badge;
}

function safeLink(url, label) {
  if (!isPublicSafeHref(url)) return null;
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = label;
  return link;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

function renderReading(reading) {
  const list = byId("service-reading");
  if (!list) return;
  list.replaceChildren();
  for (const line of reading.lines) {
    const item = document.createElement("li");
    item.className = `systems-change-reading-line systems-change-reading-line--${line.kind}`;
    item.dataset.result = line.result;
    const label = document.createElement("span");
    label.textContent = `${line.label}: `;
    const value = document.createElement("strong");
    value.textContent = line.result;
    item.append(label, value);
    if (line.scope) appendText(item, "span", "systems-service-reading-scope", ` ${line.scope}`);
    list.appendChild(item);
  }
}

function renderFact(fact) {
  const item = document.createElement("li");
  item.className = "systems-change-stage";
  item.dataset.fact = fact.fact;
  item.dataset.result = fact.result;
  item.dataset.evidenceMode = fact.evidenceMode;

  const header = document.createElement("div");
  header.className = "systems-change-stage-head";
  const title = document.createElement("p");
  title.className = "systems-change-stage-name";
  title.textContent = fact.fact;
  header.append(title, evidenceBadge(fact.result, fact.evidenceMode));
  item.appendChild(header);

  const facts = document.createElement("dl");
  facts.className = "systems-change-facts";
  const rows = [
    ["Result", fact.result],
    ["Identifier", fact.identifier ?? "not supplied"],
    ["Provenance", fact.provenance ?? "not supplied"],
    ["Observed at", fact.observedAt ?? "timestamp unavailable"],
  ];
  for (const [term, value] of rows) {
    const wrap = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = value;
    wrap.append(dt, dd);
    facts.appendChild(wrap);
  }
  item.appendChild(facts);

  if (fact.scope) appendText(item, "p", "systems-change-scope", fact.scope);
  if (fact.gap) appendText(item, "p", "systems-change-gap", fact.gap);

  const link = safeLink(fact.sourceUrl, "Open public evidence source");
  if (link) {
    link.className = "systems-change-source";
    item.appendChild(link);
  }
  return item;
}

function renderProvenance(projection) {
  const source = byId("source-service-view");
  if (source) {
    const age = projection.observedAt ? `observed ${projection.observedAt}` : "observation time unavailable";
    source.textContent = `${projection.classification}; live public projection; ${age}; ${projection.facts.length} service facts`;
  }
  const note = byId("service-provenance");
  if (!note) return;
  note.replaceChildren();
  appendText(
    note,
    "p",
    null,
    "This Service View reads current public-safe contracts for one named runtime service. Topology and registry are not deployment authority. /_meta is runtime metadata, not live proof. GET /v1 is public behaviour at this observation time only. Missing later facts stay UNKNOWN / NOT OBSERVED.",
  );
  const from = document.createElement("ul");
  from.className = "systems-change-sources systems-service-sources";
  for (const item of projection.recordedFrom) {
    const entry = document.createElement("li");
    const link = safeLink(item, item);
    if (link) {
      link.className = "systems-service-source";
      entry.appendChild(link);
    } else {
      entry.textContent = item;
    }
    from.appendChild(entry);
  }
  note.appendChild(from);
}

function renderStatus(projection) {
  const status = byId("service-view-status");
  if (!status) return;
  const state = serviceViewStatus(projection);
  status.dataset.state = state;
  const serviceId = projection.subject.id ?? SERVICE_SPECIMEN.id;
  if (state === "failure") {
    status.textContent = `Live public projection for ${serviceId} contains FAILED evidence. Missing later facts remain UNKNOWN / NOT OBSERVED.`;
    return;
  }
  status.textContent = `Live public projection for ${serviceId}. Partial evidence is not a healthy service badge. Missing later facts remain UNKNOWN / NOT OBSERVED.`;
}

export function renderServiceView(record) {
  ensureServiceViewStyles();
  const projection = projectServiceView(record);
  const list = byId("service-facts");
  if (!list) return projection;
  list.replaceChildren();
  for (const fact of projection.facts) list.appendChild(renderFact(fact));
  renderReading(projection.reading);
  renderProvenance(projection);
  renderStatus(projection);
  return projection;
}

export async function loadServiceView(specimen = SERVICE_SPECIMEN, fetchImpl = fetchJson) {
  ensureServiceViewStyles();
  const [topology, registry, meta, live, reliability] = await Promise.allSettled([
    fetchImpl(specimen.endpoints.topology),
    fetchImpl(specimen.endpoints.registry),
    fetchImpl(specimen.endpoints.meta),
    fetchImpl(specimen.endpoints.live),
    fetchImpl(specimen.endpoints.reliability),
  ]);
  const record = observationsFromPublicSources(
    { topology, registry, meta, live, reliability },
    specimen,
  );
  return renderServiceView(record);
}

if (typeof window !== "undefined" && window.document) {
  ensureServiceViewStyles();
  loadServiceView().catch(() => {
    const status = byId("service-view-status");
    if (!status) return;
    status.dataset.state = "failure";
    status.textContent = "The Service View could not load public evidence. FAILED is distinct from UNKNOWN / NOT OBSERVED.";
  });
}
