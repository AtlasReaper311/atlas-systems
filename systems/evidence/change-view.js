import { RESULT, projectChangeChain } from "./change-chain.js";
import { SPECIMEN_256_RECORD } from "./change-chain-specimen.js";

const byId = (id) => document.getElementById(id);
const PUBLIC_HREF = /^(https:\/\/github\.com\/AtlasReaper311\/|https:\/\/atlas-systems\.uk\/)/i;

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
  if (!url || !PUBLIC_HREF.test(url)) return null;
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = label;
  return link;
}

function renderReading(reading) {
  const list = byId("change-reading");
  if (!list) return;
  list.replaceChildren();
  for (const line of reading.lines) {
    const item = document.createElement("li");
    item.className = `systems-change-reading-line systems-change-reading-line--${line.kind}`;
    item.dataset.result = line.result;
    if (line.kind === "proven") {
      item.textContent = line.label;
      list.appendChild(item);
      continue;
    }
    const label = document.createElement("span");
    label.textContent = `${line.label}: `;
    const value = document.createElement("strong");
    value.textContent = line.result;
    item.append(label, value);
    list.appendChild(item);
  }
}

function renderReview(review) {
  const node = byId("change-review");
  if (!node) return;
  node.replaceChildren();
  const badge = evidenceBadge(
    review.existed ? (review.approved ? RESULT.OBSERVED : "COMMENTED") : RESULT.UNKNOWN_NOT_OBSERVED,
    review.approved ? "recorded-replay" : "unknown",
  );
  badge.textContent = review.existed
    ? (review.approved ? "Approved" : "Review existed, not approved")
    : "UNKNOWN / NOT OBSERVED";
  node.appendChild(badge);
  appendText(node, "p", "systems-change-scope", review.scope);
  if (review.identifier) {
    appendText(node, "p", "systems-change-meta", `Identifier: ${review.identifier}`);
  }
  if (review.observedAt) {
    appendText(node, "p", "systems-change-meta", `Observed at: ${review.observedAt}`);
  }
}

function renderStage(stage) {
  const item = document.createElement("li");
  item.className = "systems-change-stage";
  item.dataset.stage = stage.stage;
  item.dataset.result = stage.result;
  item.dataset.evidenceMode = stage.evidenceMode;

  const header = document.createElement("div");
  header.className = "systems-change-stage-head";
  const title = document.createElement("p");
  title.className = "systems-change-stage-name";
  title.textContent = stage.stage;
  header.append(title, evidenceBadge(stage.result, stage.evidenceMode));
  item.appendChild(header);

  const facts = document.createElement("dl");
  facts.className = "systems-change-facts";
  const rows = [
    ["Result", stage.result],
    ["Identifier", stage.identifier ?? "not supplied"],
    ["Provenance", stage.provenance ?? "not supplied"],
    ["Observed at", stage.observedAt ?? "timestamp unavailable"],
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

  if (stage.scope) appendText(item, "p", "systems-change-scope", stage.scope);
  if (stage.gap) appendText(item, "p", "systems-change-gap", stage.gap);

  const link = safeLink(stage.sourceUrl, "Open public evidence source");
  if (link) {
    link.className = "systems-change-source";
    item.appendChild(link);
  }
  return item;
}

function renderProvenance(chain) {
  const source = byId("source-change-chain");
  if (source) {
    const age = chain.recordedAt ? `recorded ${chain.recordedAt}` : "recording time unavailable";
    source.textContent = `${chain.classification}; not a live feed; ${age}; ${chain.stages.length} ADR-0013 stages`;
  }
  const note = byId("change-provenance");
  if (!note) return;
  note.replaceChildren();
  appendText(
    note,
    "p",
    null,
    "This Change View is a recorded public-safe projection of one named change. It is not a live authoritative feed and does not replace the bounded deployment, pipeline, activity, availability, or assurance records below.",
  );
  const from = document.createElement("ul");
  from.className = "systems-change-sources";
  for (const item of chain.recordedFrom) {
    const entry = document.createElement("li");
    entry.textContent = item;
    from.appendChild(entry);
  }
  note.appendChild(from);
}

function renderStatus(chain) {
  const status = byId("change-view-status");
  if (!status) return;
  const unknown = chain.stages.filter((stage) => stage.result === RESULT.UNKNOWN_NOT_OBSERVED).length;
  const failed = chain.stages.some((stage) => stage.result === RESULT.FAILED);
  const proven = chain.reading.provenStage ?? "none";
  status.dataset.state = failed ? "failure" : unknown ? "warning" : "healthy";
  status.textContent = failed
    ? `Recorded chain contains FAILED evidence. Proven stage ${proven}.`
    : `Recorded public projection for atlas-systems#256. Proven stage ${proven}. Later missing facts remain UNKNOWN / NOT OBSERVED.`;
}

export function renderChangeView(record = SPECIMEN_256_RECORD) {
  const chain = projectChangeChain(record);
  const list = byId("change-chain");
  if (!list) return chain;
  list.replaceChildren();
  for (const stage of chain.stages) list.appendChild(renderStage(stage));
  renderReading(chain.reading);
  renderReview(chain.review);
  renderProvenance(chain);
  renderStatus(chain);
  return chain;
}

if (typeof document !== "undefined") renderChangeView();
