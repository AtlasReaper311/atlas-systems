import { RESULT } from "./change-chain.js";
import { isPublicSafeHref } from "./public-safe-href.js";
import {
  bindLadderKeyboard,
  claimElementId,
  parseEvidenceClaim,
  projectEvidenceDetail,
  renderAnswerFirst,
  renderEvidenceDetail,
  renderLadderItem,
  syncEvidenceClaimUrl,
} from "./evidence-detail.js";
import {
  observationsFromPublicSources,
  projectServiceView,
  serviceViewStatus,
} from "./service-profile.js";
import { SERVICE_SPECIMEN } from "./service-specimen.js";

export { isPublicSafeHref };

const FETCH_TIMEOUT_MS = 6000;
const SERVICE_STYLE_HREF = "/static/css/systems-evidence-service-view.css?v=20260911-recovery";
const DEFAULT_SERVICE_CLAIM = "RUNTIME VERIFIED";
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

function appendText(parent, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  parent.appendChild(node);
  return node;
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

function latestObservedFact(facts) {
  let latest = null;
  for (const fact of facts) {
    if (fact.result === RESULT.OBSERVED) latest = fact.fact;
  }
  return latest;
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

const SERVICE_MAP_FACTS = Object.freeze([
  Object.freeze({ fact: "LIVE VERIFIED", label: "Live behaviour" }),
  Object.freeze({ fact: "RUNTIME VERIFIED", label: "Runtime contract" }),
  Object.freeze({ fact: "DEPLOYED", label: "Deployment id" }),
]);

function renderServiceMap(projection) {
  const target = byId("service-map");
  if (!target) return;
  target.replaceChildren();
  const heading = document.createElement("div");
  heading.className = "systems-evidence-service-identity";
  appendText(heading, "strong", null, projection.subject.id ?? SERVICE_SPECIMEN.id);
  appendText(heading, "span", null, projection.profile?.subjectType ?? "Profile not supplied");
  target.appendChild(heading);
  const list = document.createElement("dl");
  list.className = "systems-evidence-service-map-list";
  for (const item of SERVICE_MAP_FACTS) {
    const fact = projection.facts.find((entry) => entry.fact === item.fact);
    const wrap = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = item.label;
    dd.textContent = fact?.result ?? RESULT.UNKNOWN_NOT_OBSERVED;
    dd.dataset.result = dd.textContent;
    wrap.append(dt, dd);
    list.appendChild(wrap);
  }
  target.appendChild(list);
}

function renderSummary(projection) {
  const proven = latestObservedFact(projection.facts);
  const next = projection.nextGap;
  renderAnswerFirst(byId("service-summary"), {
    proven: proven ?? "No observed service fact",
    provenResult: proven ? RESULT.OBSERVED : RESULT.UNKNOWN_NOT_OBSERVED,
    nextGap: next ? `${next.label} — ${next.result}` : "none remaining",
    nextGapResult: next?.result ?? null,
    evidence: "Live public projection",
  });
  renderServiceMap(projection);
}

export function detailForServiceFact(projection, factName) {
  const fact = projection.facts.find((item) => item.fact === factName) ?? projection.facts[0];
  return projectEvidenceDetail({
    view: "service",
    subject: {
      id: projection.subject.id,
      repository: projection.subject.repository,
      label: projection.subject.id ?? SERVICE_SPECIMEN.id,
    },
    stage: fact.fact,
    result: fact.result,
    evidenceType: "live-public-projection",
    classification: projection.classification,
    identifier: fact.identifier,
    observedAt: fact.observedAt,
    provenance: fact.provenance,
    scope: fact.scope ?? fact.gap,
    evidenceMode: fact.evidenceMode,
    sourceUrl: fact.sourceUrl,
    nextGap: projection.nextGap,
  });
}

function selectedFactName(projection, requested) {
  if (requested && projection.facts.some((fact) => fact.fact === requested)) return requested;
  if (projection.facts.some((fact) => fact.fact === DEFAULT_SERVICE_CLAIM)) return DEFAULT_SERVICE_CLAIM;
  return projection.facts[0]?.fact ?? DEFAULT_SERVICE_CLAIM;
}

function renderLadder(projection, selectedFact) {
  const list = byId("service-facts");
  if (!list) return;
  list.replaceChildren();
  list.className = "systems-change-chain systems-evidence-ladder";
  for (const fact of projection.facts) {
    list.appendChild(renderLadderItem({
      id: fact.fact,
      label: fact.fact,
      result: fact.result,
      elementId: claimElementId(fact.fact, "service"),
    }, {
      selected: fact.fact === selectedFact,
      controlsId: "service-detail",
    }));
  }
}

function renderSelectedDetail(projection, selectedFact) {
  renderEvidenceDetail(byId("service-detail"), detailForServiceFact(projection, selectedFact), {
    titleId: "service-detail-title",
    siblingIdentifiers: projection.facts.map((fact) => fact.identifier).filter(Boolean),
  });
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
    const link = isPublicSafeHref(item) ? document.createElement("a") : null;
    if (link) {
      link.href = item;
      link.target = "_blank";
      link.rel = "noopener";
      link.className = "systems-service-source";
      link.textContent = item;
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

function bindServiceLadder(projection) {
  const list = byId("service-facts");
  if (!list || typeof list.addEventListener !== "function") return;
  if (list.dataset.ladderBound === "true") return;
  list.dataset.ladderBound = "true";
  const names = projection.facts.map((fact) => fact.fact);
  const select = (claim, persist = true) => {
    if (!claim) return;
    const next = selectedFactName(projection, claim);
    renderLadder(projection, next);
    renderSelectedDetail(projection, next);
    const focused = [...list.querySelectorAll("[data-claim]")].find((node) => node.dataset.claim === next);
    focused?.focus?.();
    if (persist) {
      syncEvidenceClaimUrl(
        "service",
        next,
        typeof window !== "undefined" ? window.history : null,
        typeof window !== "undefined" ? window.location : null,
      );
    }
  };
  list.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-claim]");
    if (!button || !list.contains(button)) return;
    select(button.dataset.claim);
  });
  bindLadderKeyboard(list, (claim) => select(claim));
  if (typeof window !== "undefined") {
    window.addEventListener("popstate", () => {
      const claim = parseEvidenceClaim(window.location, names, DEFAULT_SERVICE_CLAIM);
      renderLadder(projection, claim);
      renderSelectedDetail(projection, claim);
    });
  }
}

export function renderServiceView(record, options = {}) {
  ensureServiceViewStyles();
  const projection = projectServiceView(record);
  const list = byId("service-facts");
  if (!list) return projection;
  const requested = options.claim
    ?? parseEvidenceClaim(
      options.location ?? (typeof window !== "undefined" ? window.location : {}),
      projection.facts.map((fact) => fact.fact),
      DEFAULT_SERVICE_CLAIM,
    );
  const selected = selectedFactName(projection, requested);
  renderLadder(projection, selected);
  renderSelectedDetail(projection, selected);
  renderSummary(projection);
  renderReading(projection.reading);
  renderProvenance(projection);
  renderStatus(projection);
  if (options.bind !== false) bindServiceLadder(projection);
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
