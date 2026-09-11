import { RESULT } from "./change-chain.js";
import {
  ESTATE_TOPOLOGY_URL,
  estateViewStatus,
  projectEstateView,
  topologyRecordFromSettled,
} from "./estate-profile.js";
import { isPublicSafeHref } from "./public-safe-href.js";

const FETCH_TIMEOUT_MS = 6000;
const byId = (id) => document.getElementById(id);

function appendText(parent, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

function resultLabel(result) {
  return result === RESULT.OBSERVED ? "Observed" : result;
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
  const list = byId("estate-reading");
  if (!list) return;
  list.replaceChildren();
  for (const line of reading.lines) {
    const item = document.createElement("li");
    item.className = `systems-change-reading-line systems-change-reading-line--${line.kind}`;
    item.dataset.result = line.result;
    const label = document.createElement("span");
    label.textContent = `${line.label}: `;
    const value = document.createElement("strong");
    value.textContent = resultLabel(line.result);
    item.append(label, value);
    if (line.scope) appendText(item, "p", "systems-change-scope", line.scope);
    list.appendChild(item);
  }
}

function cell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

function subjectCell(subject) {
  const td = document.createElement("td");
  const name = document.createElement("strong");
  name.textContent = subject.id;
  td.appendChild(name);
  if (subject.repository) {
    appendText(td, "span", "systems-estate-repo", subject.repository);
  }
  if (subject.kind || subject.layer) {
    appendText(td, "span", "systems-estate-kind", `${subject.kind} · ${subject.layer}`);
  }
  const link = safeLink(subject.repositoryUrl, "Open public source");
  if (link) {
    link.className = "systems-estate-source";
    td.appendChild(link);
  }
  return td;
}

function renderSubjectRow(subject) {
  const row = document.createElement("tr");
  row.dataset.result = subject.latestProvenResult;
  row.dataset.profile = subject.profile.id;
  row.append(
    subjectCell(subject),
    cell(`${subject.profile.id} (${subject.profile.authority})`),
    cell([
      `lifecycle ${subject.classification.lifecycle ?? "unknown"}`,
      `scope ${subject.classification.scope ?? "unknown"}`,
      `runtime_service ${subject.classification.runtimeService === null ? "not supplied" : String(subject.classification.runtimeService)}`,
      resultLabel(subject.classification.result),
    ].join(" · ")),
    cell(subject.latestProvenStage ?? "UNKNOWN / NOT OBSERVED"),
    cell(resultLabel(subject.latestProvenResult)),
    cell(subject.nextApplicableMissing ?? "none remaining"),
    cell(subject.notApplicableStages.length ? subject.notApplicableStages.join(", ") : "none"),
    cell(subject.classification.evidenceMode === "stale-measured"
      ? `stale classification · ${subject.observedAt ?? "timestamp unavailable"}`
      : (subject.observedAt ?? "timestamp unavailable")),
  );
  return row;
}

function renderRows(projection) {
  const body = byId("estate-rows");
  if (!body) return;
  body.replaceChildren();
  if (projection.fetchFailed) {
    const row = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.textContent = "The public topology source was contacted and did not return a usable roster. FAILED is distinct from UNKNOWN / NOT OBSERVED. Missing delivery evidence is not inferred.";
    row.appendChild(td);
    body.appendChild(row);
    return;
  }
  if (projection.malformed) {
    const row = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.textContent = "The public topology response did not match atlas-public-topology/v3. Malformed estate data fails closed as UNKNOWN / NOT OBSERVED and is not a healthy fleet.";
    row.appendChild(td);
    body.appendChild(row);
    return;
  }
  if (!projection.subjects.length) {
    const row = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.textContent = "Public topology returned no usable subjects. Empty evidence is not a complete estate.";
    row.appendChild(td);
    body.appendChild(row);
    return;
  }
  for (const subject of projection.subjects) body.appendChild(renderSubjectRow(subject));
}

function renderProvenance(projection) {
  const source = byId("source-estate-view");
  if (source) {
    const age = projection.generatedAt ? `observed ${projection.generatedAt}` : "observation time unavailable";
    const authority = projection.classificationAuthority ?? "classification authority unavailable";
    source.textContent = `${projection.classification}; live public topology; ${age}; ${projection.subjectCount} subjects; authority ${authority}. Roster size is not health.`;
  }
  const note = byId("estate-provenance");
  if (!note) return;
  note.replaceChildren();
  appendText(
    note,
    "p",
    null,
    "This Estate View reads the current public topology projection. Atlas Infra remains classification authority. Topology lifecycle is not ADR-0013 delivery, not deployment, not runtime, and not live verification. There is no public estate-wide delivery snapshot on this path. Per-subject later stages stay UNKNOWN / NOT OBSERVED unless a named public contract proves them. Investigate a named change in Change View or a named Worker in Service View.",
  );
  const from = document.createElement("ul");
  from.className = "systems-change-sources systems-estate-sources";
  for (const item of projection.recordedFrom) {
    const entry = document.createElement("li");
    const link = safeLink(item, item);
    if (link) {
      link.className = "systems-estate-source";
      entry.appendChild(link);
    } else {
      entry.textContent = item;
    }
    from.appendChild(entry);
  }
  note.appendChild(from);
}

function renderStatus(projection) {
  const status = byId("estate-view-status");
  if (!status) return;
  const state = estateViewStatus(projection);
  status.dataset.state = state;
  if (state === "failure") {
    status.textContent = "Public topology for the estate roster FAILED. FAILED is distinct from UNKNOWN / NOT OBSERVED. Missing delivery stages are not success.";
    return;
  }
  if (projection.malformed) {
    status.textContent = "Public topology was malformed. The estate roster remains UNKNOWN / NOT OBSERVED and is not a healthy fleet.";
    return;
  }
  status.textContent = `Public topology roster for ${projection.subjectCount} subject${projection.subjectCount === 1 ? "" : "s"}. Classification is not delivery. Missing ADR-0013 stages remain UNKNOWN / NOT OBSERVED. This is not an estate health badge.`;
}

export function renderEstateView(record) {
  const projection = projectEstateView(record);
  renderReading(projection.reading);
  renderRows(projection);
  renderProvenance(projection);
  renderStatus(projection);
  return projection;
}

export async function loadEstateView(fetchImpl = fetchJson) {
  const topology = await Promise.allSettled([fetchImpl(ESTATE_TOPOLOGY_URL)]).then((results) => results[0]);
  return renderEstateView(topologyRecordFromSettled(topology));
}

if (typeof window !== "undefined" && window.document) {
  loadEstateView().catch(() => {
    const status = byId("estate-view-status");
    if (!status) return;
    status.dataset.state = "failure";
    status.textContent = "The Estate View could not load public topology. FAILED is distinct from UNKNOWN / NOT OBSERVED.";
    renderEstateView({ fetchFailed: true, components: [] });
  });
}
