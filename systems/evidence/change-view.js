import {
  ARTICLE_SPECIMEN_SUBJECT_ID,
  CHANGE_SUBJECTS,
  DEFAULT_CHANGE_SUBJECT,
  articleStageLabel,
  parseEvidenceSubject,
  projectArticleSpecimen,
} from "./article-profile.js";
import { ARTICLE_SPECIMEN_RECORD } from "./article-specimen.js";
import { RESULT, projectChangeChain } from "./change-chain.js";
import { SPECIMEN_256_RECORD } from "./change-chain-specimen.js";
import { parseEvidenceView } from "./estate-profile.js";
import {
  DEFAULT_CHANGE_CLAIM,
  bindLadderKeyboard,
  claimElementId,
  focusClaimControl,
  parseEvidenceClaim,
  projectEvidenceDetail,
  renderAnswerFirst,
  renderEvidenceDetail,
  renderLadderItem,
  renderProfileIdentity,
  syncEvidenceClaimUrl,
} from "./evidence-detail.js";
import { projectProfileIdentity } from "./lifecycle-profile.js";

const byId = (id) => document.getElementById(id);

const current = {
  subjectId: DEFAULT_CHANGE_SUBJECT,
  chain: null,
};
let popstateBound = false;

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

function catalogEntry(subjectId) {
  return CHANGE_SUBJECTS.find((item) => item.id === subjectId) ?? CHANGE_SUBJECTS[0];
}

function chainFromRecord(record) {
  if (record?.profile === "article-publication") return projectArticleSpecimen(record);
  return projectChangeChain(record);
}

function resolveSubjectId(record, options, locationLike) {
  if (options.subject && CHANGE_SUBJECTS.some((item) => item.id === options.subject)) {
    return options.subject;
  }
  if (record?.profile === "article-publication") return ARTICLE_SPECIMEN_SUBJECT_ID;
  if (record) return DEFAULT_CHANGE_SUBJECT;
  return parseEvidenceSubject(
    locationLike,
    CHANGE_SUBJECTS.map((item) => item.id),
    DEFAULT_CHANGE_SUBJECT,
  );
}

function resolveRecord(subjectId, explicitRecord) {
  if (explicitRecord) return explicitRecord;
  if (subjectId === ARTICLE_SPECIMEN_SUBJECT_ID) return ARTICLE_SPECIMEN_RECORD;
  return SPECIMEN_256_RECORD;
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

function renderProfile(chain) {
  const subject = changeSubject(chain);
  renderProfileIdentity(byId("change-profile"), projectProfileIdentity({
    subject: subject.label,
    profileId: chain.profile?.id,
    classificationNote: chain.profile?.id === "article-publication"
      ? "Recorded public-safe article specimen. atlas-article-gen authors and validates. atlas-scheduler is the only authorised write path into atlas-systems. Generation is not publication. Queue sync is not publication. Scheduler execution is not live verification."
      : null,
  }));
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
  if (chain.profile?.id === "article-publication" || chain.subject?.slug) {
    const title = chain.subject.title ?? chain.subject.slug ?? "Unnamed article";
    const wNumber = chain.subject.wNumber;
    return {
      repository: chain.subject.repository ?? "AtlasReaper311/atlas-systems",
      slug: chain.subject.slug ?? ARTICLE_SPECIMEN_SUBJECT_ID,
      label: wNumber ? `${title} (${wNumber})` : String(title),
    };
  }
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
  const domain = chain.domainLabels?.[stage.stage];
  return projectEvidenceDetail({
    view: "change",
    subject: changeSubject(chain),
    assertion: domain
      ? `${stage.stage} (${domain}) for ${changeSubject(chain).label}`
      : undefined,
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
  list.className = "systems-change-chain systems-evidence-ladder systems-evidence-chain";
  if (typeof list.setAttribute === "function") {
    list.setAttribute("role", "list");
  }
  for (const stage of chain.stages) {
    list.appendChild(renderLadderItem({
      id: stage.stage,
      label: chain.domainLabels ? articleStageLabel(stage.stage) : stage.stage,
      result: stage.result,
      elementId: claimElementId(stage.stage, "change"),
    }, {
      selected: stage.stage === selectedStage,
      controlsId: "change-detail",
    }));
  }
}

function hideFallback() {
  for (const id of ["change-detail-fallback", "change-article-fallback"]) {
    const fallback = byId(id);
    if (!fallback) continue;
    fallback.hidden = true;
    const specimen = typeof fallback.querySelector === "function"
      ? fallback.querySelector("[id^='claim-']")
      : null;
    if (specimen && typeof specimen.removeAttribute === "function") specimen.removeAttribute("id");
  }
}

function renderSelectedDetail(chain, selectedStage) {
  const detail = detailForChangeStage(chain, selectedStage);
  renderEvidenceDetail(byId("change-detail"), detail, {
    titleId: "change-detail-title",
    siblingIdentifiers: chain.stages.map((stage) => stage.identifier).filter(Boolean),
  });
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
    chain.profile?.id === "article-publication"
      ? "This Change View can show the recorded static-site chain or the recorded Article Publication specimen. Both are public-safe projections, not live feeds. atlas-scheduler owns the only authorised production article write path into atlas-systems. Generation is not publication. Queue sync is not publication. Scheduler execution is not live verification."
      : "This Change View is a recorded public-safe projection of one named change. It is not a live authoritative feed and does not replace the bounded deployment, pipeline, activity, availability, or assurance records below.",
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

function renderStatus(chain, subjectId) {
  const status = byId("change-view-status");
  if (!status) return;
  const unknownStages = chain.stages.some((stage) => stage.result === RESULT.UNKNOWN_NOT_OBSERVED);
  const unknownLater = chain.reading.lines.some((line) => line.result === RESULT.UNKNOWN_NOT_OBSERVED);
  const failed = chain.stages.some((stage) => stage.result === RESULT.FAILED);
  const proven = chain.reading.provenStage ?? "none";
  const label = catalogEntry(subjectId).label;
  status.dataset.state = failed ? "failure" : (unknownStages || unknownLater) ? "warning" : "healthy";
  status.textContent = failed
    ? `Recorded chain contains FAILED evidence. Proven stage ${proven}.`
    : `Recorded public projection for ${label}. Proven stage ${proven}. Later missing facts remain UNKNOWN / NOT OBSERVED.`;
}

function renderSubjects(selectedId) {
  const target = byId("change-subjects");
  if (!target) return;
  target.replaceChildren();
  for (const item of CHANGE_SUBJECTS) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "systems-evidence-profile-card";
    card.dataset.subject = item.id;
    card.setAttribute("aria-pressed", String(selectedId === item.id));
    appendText(card, "span", null, item.profileLabel);
    appendText(card, "strong", null, item.label);
    target.appendChild(card);
  }
}

function selectedStageName(chain, requested, subjectId) {
  const fallback = catalogEntry(subjectId).defaultClaim;
  if (requested && chain.stages.some((stage) => stage.stage === requested)) return requested;
  if (chain.stages.some((stage) => stage.stage === fallback)) return fallback;
  if (chain.stages.some((stage) => stage.stage === DEFAULT_CHANGE_CLAIM)) return DEFAULT_CHANGE_CLAIM;
  return chain.stages[0]?.stage ?? DEFAULT_CHANGE_CLAIM;
}

function persistUrl(subjectId, claim) {
  syncEvidenceClaimUrl(
    "change",
    claim,
    typeof window !== "undefined" ? window.history : null,
    typeof window !== "undefined" ? window.location : null,
    { subject: subjectId === DEFAULT_CHANGE_SUBJECT ? null : subjectId },
  );
}

function bindChangeControls() {
  const list = byId("change-chain");
  const subjects = byId("change-subjects");
  if (list && typeof list.addEventListener === "function" && list.dataset.ladderBound !== "true") {
    list.dataset.ladderBound = "true";
    list.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-claim]");
      if (!button || !list.contains(button)) return;
      const chain = current.chain;
      if (!chain) return;
      const next = selectedStageName(chain, button.dataset.claim, current.subjectId);
      renderLadder(chain, next);
      renderSelectedDetail(chain, next);
      focusClaimControl(list, next);
      persistUrl(current.subjectId, next);
    });
    bindLadderKeyboard(list, (claim) => {
      const chain = current.chain;
      if (!chain) return;
      const next = selectedStageName(chain, claim, current.subjectId);
      renderLadder(chain, next);
      renderSelectedDetail(chain, next);
      focusClaimControl(list, next);
      persistUrl(current.subjectId, next);
    });
  }
  if (subjects && typeof subjects.addEventListener === "function" && subjects.dataset.subjectsBound !== "true") {
    subjects.dataset.subjectsBound = "true";
    subjects.addEventListener("click", (event) => {
      const card = event.target?.closest?.("[data-subject]");
      if (!card || !subjects.contains(card)) return;
      renderChangeView(null, {
        subject: card.dataset.subject,
        claim: catalogEntry(card.dataset.subject).defaultClaim,
        persistFocus: true,
      });
    });
  }
  if (typeof window !== "undefined" && !popstateBound) {
    popstateBound = true;
    window.addEventListener("popstate", () => {
      if (parseEvidenceView(window.location) !== "change") return;
      renderChangeView(null, { persistFocus: false, persist: false, location: window.location });
    });
  }
}

export function renderChangeView(record = null, options = {}) {
  const locationLike = options.location ?? (typeof window !== "undefined" ? window.location : {});
  const subjectId = resolveSubjectId(record, options, locationLike);
  const resolved = resolveRecord(subjectId, record);
  const chain = chainFromRecord(resolved);
  current.subjectId = subjectId;
  current.chain = chain;
  const requested = options.claim
    ?? parseEvidenceClaim(
      locationLike,
      chain.stages.map((stage) => stage.stage),
      catalogEntry(subjectId).defaultClaim,
    );
  const selected = selectedStageName(chain, requested, subjectId);
  const list = byId("change-chain");
  if (!list) return chain;
  hideFallback();
  renderSubjects(subjectId);
  renderProfile(chain);
  renderLadder(chain, selected);
  renderSelectedDetail(chain, selected);
  renderSummary(chain);
  renderReading(chain.reading);
  renderReview(chain.review);
  renderProvenance(chain);
  renderStatus(chain, subjectId);
  if (options.bind !== false) bindChangeControls();
  if (options.persistFocus) {
    const nav = byId("change-subjects");
    const selectedCard = nav?.querySelector?.(`[data-subject="${subjectId}"]`);
    if (selectedCard && typeof selectedCard.focus === "function") selectedCard.focus();
  }
  if (options.persist) persistUrl(subjectId, selected);
  return chain;
}

if (typeof document !== "undefined") renderChangeView();
