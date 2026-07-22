import {
  filterServices,
  normalizeTraceDetail,
  normalizeTraceIndex,
  topologyLabel,
} from "./proof-chain-model.mjs";

const TRACE_INDEX_URL = "https://api.atlas-systems.uk/v1/trace";
const elements = {
  serviceCount: document.getElementById("proof-service-count"),
  governedCount: document.getElementById("proof-governed-count"),
  topologyState: document.getElementById("proof-topology-state"),
  apiStatus: document.getElementById("proof-api-status"),
  fingerprint: document.getElementById("proof-fingerprint"),
  filter: document.getElementById("proof-filter"),
  serviceList: document.getElementById("proof-service-list"),
  detailEmpty: document.getElementById("proof-detail-empty"),
  detailContent: document.getElementById("proof-detail-content"),
  serviceTitle: document.getElementById("proof-service-title"),
  serviceMeta: document.getElementById("proof-service-meta"),
  apiLink: document.getElementById("proof-api-link"),
  evidenceBanner: document.getElementById("proof-evidence-banner"),
  chain: document.getElementById("proof-chain"),
  sources: document.getElementById("proof-sources"),
};

let indexState = null;
let selectedServiceId = null;
let detailRequest = 0;

function text(element, value) {
  if (element) element.textContent = String(value ?? "");
}

function setApiState(state, label) {
  elements.apiStatus.dataset.state = state;
  text(elements.apiStatus, label);
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    const error = new Error(`Trace API returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function selectedFromLocation(services) {
  const requested = new URL(window.location.href).searchParams.get("service");
  if (requested && services.some((service) => service.serviceId === requested)) {
    return requested;
  }
  return services[0]?.serviceId || null;
}

function updateLocation(serviceId) {
  const url = new URL(window.location.href);
  if (serviceId) url.searchParams.set("service", serviceId);
  else url.searchParams.delete("service");
  window.history.replaceState({}, "", url);
}

function renderIndexMetrics(index) {
  text(elements.serviceCount, index.services.length);
  text(
    elements.governedCount,
    index.services.filter((service) => service.governanceCount > 0).length,
  );
  text(elements.topologyState, topologyLabel(index.liveTopology));
  text(
    elements.fingerprint,
    index.classificationFingerprint
      ? `classification ${index.classificationFingerprint}`
      : "classification fingerprint unavailable",
  );
}

function serviceButton(service) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "proof-service-button";
  button.setAttribute("aria-pressed", String(service.serviceId === selectedServiceId));

  const name = document.createElement("span");
  name.className = "proof-service-name";
  name.textContent = service.serviceId;

  const count = document.createElement("span");
  count.className = "proof-service-count";
  count.textContent = `${service.governanceCount} ADR${service.governanceCount === 1 ? "" : "s"}`;

  const repo = document.createElement("span");
  repo.className = "proof-service-repo";
  repo.textContent = service.repository;

  button.append(name, count, repo);
  button.addEventListener("click", () => selectService(service.serviceId));
  return button;
}

function renderServiceList() {
  const services = filterServices(indexState?.services || [], elements.filter.value);
  elements.serviceList.replaceChildren();
  if (!services.length) {
    const empty = document.createElement("p");
    empty.className = "proof-empty";
    empty.textContent = "No public Trace services match that filter.";
    elements.serviceList.appendChild(empty);
    return;
  }
  for (const service of services) {
    elements.serviceList.appendChild(serviceButton(service));
  }
}

function nodeTitle(node) {
  if (node.kind === "repository") return node.repository || node.key;
  if (node.kind === "service") return node.serviceId || node.key;
  return node.externalId || node.key;
}

function nodeMeta(node) {
  const evidence = node.evidence?.[0];
  if (node.kind === "adr") {
    return evidence?.uri || "accepted architecture decision";
  }
  if (node.kind === "repository") return "public source repository";
  return "public runtime service";
}

function renderNode(node) {
  const card = document.createElement("article");
  card.className = "proof-node";
  card.dataset.kind = node.kind;

  const type = document.createElement("span");
  type.className = "proof-node-type";
  type.textContent = node.kind;

  const title = document.createElement("strong");
  title.className = "proof-node-title";
  title.textContent = nodeTitle(node);

  const meta = document.createElement("span");
  meta.className = "proof-node-meta";
  meta.textContent = nodeMeta(node);

  const state = document.createElement("span");
  state.className = "proof-node-state";
  state.textContent = node.evidenceState;

  card.append(type, title, meta, state);
  return card;
}

function renderEdge(edge) {
  const row = document.createElement("div");
  row.className = "proof-edge";

  const line = document.createElement("span");
  line.className = "proof-edge-line";
  line.setAttribute("aria-hidden", "true");

  const copy = document.createElement("span");
  copy.className = "proof-edge-copy";

  const relation = document.createElement("strong");
  relation.className = "proof-edge-relation";
  relation.textContent = edge.relation;

  const rationale = document.createElement("span");
  rationale.className = "proof-edge-rationale";
  rationale.textContent = edge.rationale;

  copy.append(relation, rationale);
  row.append(line, copy);
  return row;
}

function renderGovernance(governance) {
  const group = document.createElement("div");
  group.className = "proof-governance-group";
  for (const item of governance) {
    const wrapper = document.createElement("div");
    wrapper.append(renderEdge(item.edge), renderNode(item.node));
    group.appendChild(wrapper);
  }
  return group;
}

function renderSources(sources) {
  elements.sources.replaceChildren();
  const entries = Object.entries(sources || {}).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (!entries.length) {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = "state";
    dd.textContent = "No source references supplied.";
    row.append(dt, dd);
    elements.sources.appendChild(row);
    return;
  }

  for (const [label, value] of entries) {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = label.replaceAll("_", " ");
    const dd = document.createElement("dd");
    const textValue = String(value || "");
    if (/^https:\/\//.test(textValue)) {
      const link = document.createElement("a");
      link.href = textValue;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = textValue;
      dd.appendChild(link);
    } else {
      dd.textContent = textValue || "unavailable";
    }
    row.append(dt, dd);
    elements.sources.appendChild(row);
  }
}

function renderDetail(detail) {
  elements.detailEmpty.hidden = true;
  elements.detailContent.hidden = false;
  text(elements.serviceTitle, detail.subject.serviceId);
  text(
    elements.serviceMeta,
    `${detail.subject.repository} · ${detail.subject.kind} · ${detail.subject.layer} · ${detail.subject.lifecycle}`,
  );
  elements.apiLink.href = `${TRACE_INDEX_URL}/services/${encodeURIComponent(detail.subject.serviceId)}`;

  const topologyState = topologyLabel(detail.liveTopology);
  elements.evidenceBanner.dataset.state = topologyState;
  elements.evidenceBanner.textContent =
    topologyState === "verified"
      ? `Live topology evidence verified by ${detail.liveTopology.producer}.`
      : `Live topology evidence ${topologyState}: ${detail.liveTopology.reason}`;

  elements.chain.replaceChildren();
  elements.chain.append(
    renderNode(detail.repositoryNode),
    renderEdge(detail.sourceEdge),
    renderNode(detail.serviceNode),
  );
  if (detail.governance.length) {
    elements.chain.appendChild(renderGovernance(detail.governance));
  } else {
    const empty = document.createElement("p");
    empty.className = "proof-empty";
    empty.textContent =
      "No accepted ADR currently declares governance over this public service or source repository.";
    elements.chain.appendChild(empty);
  }
  renderSources(detail.sources);
}

function renderDetailError(message) {
  elements.detailContent.hidden = true;
  elements.detailEmpty.hidden = false;
  elements.detailEmpty.replaceChildren();
  const kicker = document.createElement("div");
  kicker.className = "proof-kicker";
  kicker.textContent = "02 // evidence unavailable";
  const heading = document.createElement("h2");
  heading.textContent = "Proof chain unavailable.";
  const copy = document.createElement("p");
  copy.textContent = message;
  elements.detailEmpty.append(kicker, heading, copy);
}

async function selectService(serviceId) {
  selectedServiceId = serviceId;
  updateLocation(serviceId);
  renderServiceList();
  const requestId = ++detailRequest;
  renderDetailError("Loading the selected public proof chain.");

  try {
    const payload = await getJson(
      `${TRACE_INDEX_URL}/services/${encodeURIComponent(serviceId)}`,
    );
    if (requestId !== detailRequest) return;
    renderDetail(normalizeTraceDetail(payload));
  } catch (error) {
    if (requestId !== detailRequest) return;
    if (error.status === 404) {
      renderDetailError(
        "The selected identifier is not part of the bounded public Trace surface.",
      );
      return;
    }
    renderDetailError(
      "The public Trace detail endpoint is unavailable. No relationship is inferred from cached source or the browser.",
    );
  }
}

async function init() {
  try {
    indexState = normalizeTraceIndex(await getJson(TRACE_INDEX_URL));
    renderIndexMetrics(indexState);
    setApiState("pass", "public Trace authority verified");
    selectedServiceId = selectedFromLocation(indexState.services);
    renderServiceList();
    if (selectedServiceId) await selectService(selectedServiceId);
    else renderDetailError("No public Trace services are currently published.");
  } catch {
    indexState = { services: [] };
    renderServiceList();
    text(elements.serviceCount, "unavailable");
    text(elements.governedCount, "unavailable");
    text(elements.topologyState, "unavailable");
    text(elements.fingerprint, "classification evidence unavailable");
    setApiState("error", "public Trace API unavailable");
    renderDetailError(
      "The bounded Trace API is not available from this environment yet. This page will not construct proof chains from the existing system map as a fallback.",
    );
  }
}

elements.filter.addEventListener("input", renderServiceList);
init();
