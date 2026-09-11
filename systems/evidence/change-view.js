import { RESULT, projectChangeChain } from "./change-chain.js";
import { SPECIMEN_256_RECORD } from "./change-chain-specimen.js";
import {
  DEFAULT_CHANGE_CLAIM,
  bindLadderKeyboard,
  claimElementId,
  parseEvidenceClaim,
  projectEvidenceDetail,
  renderAnswerFirst,
  renderEvidenceDetail,
  renderLadderItem,
  syncEvidenceClaimUrl,
} from "./evidence-detail.js";

const byId = (id) => document.getElementById(id);

function resultLabel(result) {
  return result === RESULT.OBSERVED ? "Observed" : result;
}

export function isPublicSafeHref(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
  if (parsed.hostname === "github.com") {
    return parsed.pathname === "/AtlasReaper311" || parsed.pathname.startsWith("/AtlasReaper311/");
  }
  return parsed.hostname === "atlas-systems.uk";
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
    if (line.scope) {
      appendText(item, "p", "systems-change-scope", line.scope);
    }
    list.appendChild(item);
  }
}

function renderSummary(chain) {
  const proven = chain.reading.provenStage ?? "No observed delivery stage";
  const next = chain.nextGap;
  renderAnswerFirst(byId("change-summary"), {
    proven,
    provenResult: chain.reading.provenStage ? RESULT.OBSERVED : RESULT.UNKNOWN_NOT_OBSERVED,
    nextGap: next ? `${next.label} — ${next.result}` : "none remaining",
    nextGapResult: next?.result ?? null,
    evidence: "Recorded public projection",
  });
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

function changeSubject(chain) {
  return {
    repository: chain.subject.repository ?? "AtlasReaper311/atlas-systems",
    pullRequest: chain.subject.pullRequest ?? 256,
    label: chain.subject.pullRequest
      ? `${chain.subject.repository ?? "AtlasReaper311/atlas-systems"}#${chain.subject.pullRequest}`
      : (chain.subject.repository ?? "AtlasReaper311/atlas-systems"),
  };
}

export function detailForChangeStage(chain, stageName) {
  const stage = chain.stages.find((item) => item.stage === stageName) ?? chain.stages[0];
  return projectEvidenceDetail({
    view: "change",
    subject: changeSubject(chain),
    stage: stage.stage,
    result: stage.result,
    evidenceType: "recorded-public-projection",
    classification: chain.classification,
    identifier: stage.identifier,
    observedAt: stage.observedAt,
    recordedAt: chain.recordedAt,
    provenance: stage.provenance,
    scope: stage.scope ?? stage.gap,
    evidenceMode: stage.evidenceMode,
    sourceUrl: stage.sourceUrl,
    nextGap: chain.nextGap,
  });
}

function renderLadder(chain, selectedStage) {
  const list = byId("change-chain");
  if (!list) return;
  list.replaceChildren();
  list.className = "systems-change-chain systems-evidence-ladder";
  if (typeof list.setAttribute === "function") {
    list.setAttribute("role", "list");
  }
  for (const stage of chain.stages) {
    list.appendChild(renderLadderItem({
      id: stage.stage,
      label: stage.stage,
      result: stage.result,
      elementId: claimElementId(stage.stage, "change"),
    }, {
      selected: stage.stage === selectedStage,
      controlsId: "change-detail",
    }));
  }
}

function hideFallback() {
  const fallback = byId("change-detail-fallback");
  if (!fallback) return;
  fallback.hidden = true;
  const specimen = typeof fallback.querySelector === "function"
    ? fallback.querySelector("#claim-merged")
    : null;
  if (specimen && typeof specimen.removeAttribute === "function") specimen.removeAttribute("id");
}

function renderSelectedDetail(chain, selectedStage) {
  const detail = detailForChangeStage(chain, selectedStage);
  renderEvidenceDetail(byId("change-detail"), detail, { titleId: "change-detail-title" });
  return detail;
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
  const unknownStages = chain.stages.some((stage) => stage.result === RESULT.UNKNOWN_NOT_OBSERVED);
  const unknownLater = chain.reading.lines.some((line) => line.result === RESULT.UNKNOWN_NOT_OBSERVED);
  const failed = chain.stages.some((stage) => stage.result === RESULT.FAILED);
  const proven = chain.reading.provenStage ?? "none";
  status.dataset.state = failed ? "failure" : (unknownStages || unknownLater) ? "warning" : "healthy";
  status.textContent = failed
    ? `Recorded chain contains FAILED evidence. Proven stage ${proven}.`
    : `Recorded public projection for atlas-systems#256. Proven stage ${proven}. Later missing facts remain UNKNOWN / NOT OBSERVED.`;
}

function selectedStageName(chain, requested) {
  if (requested && chain.stages.some((stage) => stage.stage === requested)) return requested;
  if (chain.stages.some((stage) => stage.stage === DEFAULT_CHANGE_CLAIM)) return DEFAULT_CHANGE_CLAIM;
  return chain.stages[0]?.stage ?? DEFAULT_CHANGE_CLAIM;
}

function bindChangeLadder(chain, selected) {
  const list = byId("change-chain");
  if (!list || typeof list.addEventListener !== "function") return;
  if (list.dataset.ladderBound === "true") return;
  list.dataset.ladderBound = "true";
  const select = (claim, persist = true) => {
    if (!claim) return;
    const next = selectedStageName(chain, claim);
    renderLadder(chain, next);
    renderSelectedDetail(chain, next);
    const focused = [...list.querySelectorAll("[data-claim]")].find((node) => node.dataset.claim === next);
    focused?.focus?.();
    if (persist) {
      syncEvidenceClaimUrl(
        "change",
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
      const claim = parseEvidenceClaim(window.location, chain.stages.map((stage) => stage.stage), DEFAULT_CHANGE_CLAIM);
      renderLadder(chain, claim);
      renderSelectedDetail(chain, claim);
    });
  }
  void selected;
}

export function renderChangeView(record = SPECIMEN_256_RECORD, options = {}) {
  const chain = projectChangeChain(record);
  const requested = options.claim
    ?? parseEvidenceClaim(
      options.location ?? (typeof window !== "undefined" ? window.location : {}),
      chain.stages.map((stage) => stage.stage),
      DEFAULT_CHANGE_CLAIM,
    );
  const selected = selectedStageName(chain, requested);
  const list = byId("change-chain");
  if (!list) return chain;
  hideFallback();
  renderLadder(chain, selected);
  renderSelectedDetail(chain, selected);
  renderSummary(chain);
  renderReading(chain.reading);
  renderReview(chain.review);
  renderProvenance(chain);
  renderStatus(chain);
  if (options.bind !== false) bindChangeLadder(chain, selected);
  return chain;
}

if (typeof document !== "undefined") renderChangeView();
