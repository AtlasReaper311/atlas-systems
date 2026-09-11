import { RESULT } from "./change-chain.js";
import { isPublicSafeHref } from "./public-safe-href.js";

export const RESULT_ASSISTANCE = Object.freeze({
  [RESULT.OBSERVED]: "Evidence was actually observed for this claim.",
  [RESULT.FAILED]: "The evidence source or check was attempted and failed.",
  [RESULT.UNKNOWN_NOT_OBSERVED]: "No approved evidence has established this claim.",
  [RESULT.NOT_APPLICABLE]: "This stage cannot exist for this subject or profile.",
});

export const DEFAULT_CHANGE_CLAIM = "MERGED";

const KNOWN_RESULTS = new Set(Object.values(RESULT));

const STAGE_DOES_NOT_PROVE = Object.freeze({
  SOURCE: "SOURCE does not prove checks, review approval, merge, deployment, or live behaviour.",
  CHECKED: "CHECKED does not mean review approval, merge, deployment, or live proof.",
  MERGED: "MERGED proves source integration only. It does not prove deployment, runtime, or live verification.",
  "DEPLOYMENT OBSERVED": "Seeing a named deploy event is not proof that the expected identity was the deployed identity.",
  DEPLOYED: "DEPLOYED does not imply runtime or live verification.",
  "RUNTIME VERIFIED": "RUNTIME VERIFIED does not imply live verification.",
  "LIVE VERIFIED": "LIVE VERIFIED proves live behaviour at that observation time for that identity only.",
  OWNERSHIP: "Ownership and classification are not a deployment event, expected deployed identity, or live proof.",
  "EXPECTED CONTRACT": "A declared contract is not a deployment event, expected deployed identity, or live proof.",
});

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeResult(value) {
  const result = String(value ?? "").trim();
  return KNOWN_RESULTS.has(result) ? result : RESULT.UNKNOWN_NOT_OBSERVED;
}

export function claimSlug(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function claimElementId(name, view = "") {
  const slug = claimSlug(name);
  if (!slug) return "";
  if (view === "change" && String(name) === DEFAULT_CHANGE_CLAIM) return "claim-merged";
  return view ? `claim-${claimSlug(view)}-${slug}` : `claim-${slug}`;
}

export function parseEvidenceClaim(locationLike = {}, allowed = [], fallback = null) {
  const names = Array.isArray(allowed) ? allowed.map((item) => String(item)) : [];
  const searchValue = locationLike.search ?? "";
  const search = new URLSearchParams(
    String(searchValue).startsWith("?") ? String(searchValue).slice(1) : String(searchValue),
  );
  const fromQuery = String(search.get("claim") ?? "").trim();
  if (fromQuery && names.includes(fromQuery)) return fromQuery;
  const hash = String(locationLike.hash ?? "").replace(/^#/, "").trim();
  const hashSlug = hash.replace(/^claim-/, "");
  const fromHash = names.find((name) => {
    const slug = claimSlug(name);
    return hashSlug === slug || hashSlug.endsWith(`-${slug}`);
  });
  if (fromHash) return fromHash;
  return names.includes(fallback) ? fallback : (fallback ?? null);
}

export function evidenceClaimHref(view, claim, pathname = "/systems/evidence/") {
  const hash = claim ? claimElementId(claim) : `view-${view}`;
  return `${pathname}?view=${view}${claim ? `&claim=${encodeURIComponent(claim)}` : ""}#${hash}`;
}

export function syncEvidenceClaimUrl(view, claim, historyImpl, locationLike) {
  if (!historyImpl || typeof historyImpl.pushState !== "function") {
    return evidenceClaimHref(view, claim);
  }
  const loc = locationLike ?? (typeof window === "undefined"
    ? { pathname: "/systems/evidence/", search: "", hash: "" }
    : window.location);
  const url = new URL(
    loc.href ?? `${loc.pathname || "/systems/evidence/"}${loc.search || ""}${loc.hash || ""}`,
    "https://atlas-systems.uk",
  );
  url.searchParams.set("view", view);
  if (claim) url.searchParams.set("claim", claim);
  else url.searchParams.delete("claim");
  url.hash = claim ? claimElementId(claim) : `view-${view}`;
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${loc.pathname || ""}${loc.search || ""}${loc.hash || ""}`;
  if (next !== current) historyImpl.pushState({ evidenceView: view, evidenceClaim: claim }, "", next);
  return next;
}

function defaultDoesNotProve(stage, result) {
  if (result === RESULT.UNKNOWN_NOT_OBSERVED) {
    return "Opening this record does not create evidence. The claim remains UNKNOWN / NOT OBSERVED.";
  }
  if (result === RESULT.FAILED) {
    return "A failed observation is not missing evidence and is not success. Opening this record does not change FAILED.";
  }
  if (result === RESULT.NOT_APPLICABLE) {
    return "NOT APPLICABLE is profile-driven. Opening this record does not make the stage apply.";
  }
  return STAGE_DOES_NOT_PROVE[stage]
    ?? "Observed evidence does not imply later ADR-0013 stages, runtime health, or live verification.";
}

function defaultProves(stage, result, scope) {
  if (result === RESULT.UNKNOWN_NOT_OBSERVED) {
    return scope
      ? String(scope)
      : "Nothing is proven. Missing later evidence remains UNKNOWN / NOT OBSERVED.";
  }
  if (result === RESULT.FAILED) {
    return scope
      ? String(scope)
      : "The named source or check was attempted and did not hold.";
  }
  if (result === RESULT.NOT_APPLICABLE) {
    return scope
      ? String(scope)
      : "This stage cannot apply to the selected ADR-0014 profile.";
  }
  return scope ? String(scope) : `${stage} was observed. Later stages are not inferred.`;
}

function freshnessLabel(input, result) {
  if (input.freshness) return String(input.freshness);
  if (input.evidenceMode === "stale-measured") {
    return `Stale measured observation. ${input.observedAt ? `Observed at ${input.observedAt}. ` : ""}Stale evidence remains stale and is not washed green.`;
  }
  if (input.evidenceType === "recorded-public-projection" || input.classification === "recorded-public-projection") {
    return input.recordedAt
      ? `Recorded public projection; not a live feed. Recorded at ${input.recordedAt}.`
      : "Recorded public projection; not a live feed. Recording time unavailable.";
  }
  if (result === RESULT.UNKNOWN_NOT_OBSERVED || result === RESULT.NOT_APPLICABLE) {
    return "No approved observation time is available for this claim.";
  }
  if (input.observedAt) return `Observed at ${input.observedAt}.`;
  return "Observation time unavailable.";
}

function subjectLabel(subject) {
  const record = asRecord(subject);
  if (record.label) return String(record.label);
  const parts = [record.repository, record.id, record.pullRequest ? `#${record.pullRequest}` : null]
    .filter(Boolean)
    .map((part) => String(part));
  if (parts.length) return parts.join(" ");
  return null;
}

export function projectEvidenceDetail(input = {}) {
  const payload = asRecord(input);
  const result = normalizeResult(payload.result);
  const stage = payload.stage ?? payload.fact ?? null;
  const identifier = payload.identifier ? String(payload.identifier) : null;
  const observedAt = payload.observedAt ? String(payload.observedAt) : null;
  const sourceTime = payload.sourceTime && String(payload.sourceTime) !== observedAt
    ? String(payload.sourceTime)
    : null;
  const nextGap = payload.nextGap && typeof payload.nextGap === "object"
    ? Object.freeze({
      label: payload.nextGap.label ? String(payload.nextGap.label) : null,
      result: normalizeResult(payload.nextGap.result ?? RESULT.UNKNOWN_NOT_OBSERVED),
      scope: payload.nextGap.scope ? String(payload.nextGap.scope) : null,
    })
    : null;

  return Object.freeze({
    schema: "atlas-systems/evidence-detail/v1",
    view: payload.view ? String(payload.view) : "change",
    subject: Object.freeze({ ...asRecord(payload.subject) }),
    subjectLabel: subjectLabel(payload.subject) ?? (payload.subjectLabel ? String(payload.subjectLabel) : null),
    assertion: payload.assertion
      ? String(payload.assertion)
      : (stage ? `${stage}${subjectLabel(payload.subject) ? ` for ${subjectLabel(payload.subject)}` : ""}` : null),
    lifecycleStage: stage ? String(stage) : null,
    observationResult: result,
    evidenceType: payload.evidenceType
      ? String(payload.evidenceType)
      : (payload.classification ? String(payload.classification) : null),
    identifier,
    observedAt,
    sourceTime,
    freshness: freshnessLabel(payload, result),
    stale: payload.evidenceMode === "stale-measured",
    provenance: payload.provenance ? String(payload.provenance) : null,
    proves: defaultProves(stage, result, payload.scope),
    doesNotProve: defaultDoesNotProve(stage, result),
    nextGap,
    sourceUrl: payload.sourceUrl ? String(payload.sourceUrl) : null,
    assistance: RESULT_ASSISTANCE[result],
    evidenceMode: payload.evidenceMode ? String(payload.evidenceMode) : null,
  });
}

export function evidenceDetailRows(detail) {
  const record = asRecord(detail);
  const nextGap = record.nextGap
    ? `${record.nextGap.label ?? "unspecified"}${record.nextGap.result ? ` — ${record.nextGap.result}` : ""}`
    : null;
  return Object.freeze([
    ["Subject", record.subjectLabel],
    ["Assertion", record.assertion],
    ["Lifecycle stage", record.lifecycleStage],
    ["Observation result", record.observationResult],
    ["Evidence type", record.evidenceType],
    ["Exact identifier", record.identifier],
    ["Observed at", record.observedAt],
    ["Source time", record.sourceTime],
    ["Freshness", record.freshness],
    ["Provenance", record.provenance],
    ["What this proves", record.proves],
    ["What this does not prove", record.doesNotProve],
    ["Next applicable evidence gap", nextGap],
  ].filter(([, value]) => value));
}

function appendText(parent, tag, className, text, createElement) {
  const node = createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

export function renderEvidenceDetail(target, detail, options = {}) {
  if (!target) return detail;
  const createElement = options.createElement
    ?? (typeof document !== "undefined" ? document.createElement.bind(document) : null);
  if (!createElement) return detail;
  const hrefSafe = options.isPublicSafeHref ?? isPublicSafeHref;
  target.replaceChildren();
  target.hidden = false;
  target.dataset.result = detail.observationResult;
  target.dataset.stage = detail.lifecycleStage ?? "";

  const kicker = appendText(target, "p", "systems-detail-kicker", "Evidence Detail", createElement);
  kicker.id = options.kickerId ?? "";
  const title = appendText(
    target,
    "h3",
    "systems-evidence-detail-title",
    detail.lifecycleStage ?? "Selected evidence",
    createElement,
  );
  title.id = options.titleId ?? "evidence-detail-title";

  const result = appendText(target, "p", "systems-evidence-detail-result", "", createElement);
  const resultLabel = appendText(result, "strong", null, detail.observationResult, createElement);
  resultLabel.dataset.result = detail.observationResult;
  appendText(result, "span", "systems-evidence-sr", `Observation result: ${detail.observationResult}. `, createElement);
  if (detail.assistance) {
    appendText(result, "span", "systems-evidence-detail-assist", detail.assistance, createElement);
  }

  const facts = createElement("dl");
  facts.className = "systems-evidence-detail-facts";
  for (const [term, value] of evidenceDetailRows(detail)) {
    const wrap = createElement("div");
    const dt = createElement("dt");
    const dd = createElement("dd");
    dt.textContent = term;
    dd.textContent = value;
    wrap.append(dt, dd);
    facts.appendChild(wrap);
  }
  target.appendChild(facts);

  const link = detail.sourceUrl && hrefSafe(detail.sourceUrl) ? createElement("a") : null;
  if (link) {
    link.href = detail.sourceUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.className = "systems-change-source systems-evidence-detail-source";
    link.textContent = "Open public evidence source";
    target.appendChild(link);
  }
  return detail;
}

export function renderAnswerFirst(target, summary, createElementImpl) {
  if (!target) return summary;
  const createElement = createElementImpl
    ?? (typeof document !== "undefined" ? document.createElement.bind(document) : null);
  if (!createElement) return summary;
  const record = asRecord(summary);
  target.replaceChildren();
  const rows = [
    ["Proven", record.proven],
    ["Next gap", record.nextGap],
    ["Evidence", record.evidence],
  ];
  for (const [term, value] of rows) {
    const wrap = createElement("div");
    const dt = createElement("dt");
    const dd = createElement("dd");
    dt.textContent = term;
    dd.textContent = value ?? "not supplied";
    if (term === "Proven" && record.provenResult) dd.dataset.result = record.provenResult;
    if (term === "Next gap" && record.nextGapResult) dd.dataset.result = record.nextGapResult;
    wrap.append(dt, dd);
    target.appendChild(wrap);
  }
  return summary;
}

export function renderLadderItem(item, options = {}) {
  const createElement = options.createElement
    ?? (typeof document !== "undefined" ? document.createElement.bind(document) : null);
  if (!createElement) return null;
  const selected = options.selected === true;
  const row = createElement("li");
  row.className = "systems-evidence-ladder-item";
  row.dataset.claim = item.id;
  row.dataset.result = item.result;
  row.dataset.selected = String(selected);
  if (item.elementId) row.id = item.elementId;

  const button = createElement("button");
  button.type = "button";
  button.className = "systems-evidence-ladder-select";
  button.dataset.claim = item.id;
  if (typeof button.setAttribute === "function") {
    button.setAttribute("aria-pressed", String(selected));
    if (options.controlsId) button.setAttribute("aria-controls", options.controlsId);
  } else {
    button["aria-pressed"] = String(selected);
  }
  if (typeof button.tabIndex === "number" || button.tabIndex === undefined) {
    button.tabIndex = selected || options.tabIndex === 0 ? 0 : -1;
  }

  const stage = createElement("span");
  stage.className = "systems-evidence-ladder-stage";
  stage.textContent = item.label;
  const result = createElement("span");
  result.className = "systems-evidence-ladder-result";
  result.dataset.result = item.result;
  result.textContent = item.result;
  const sr = createElement("span");
  sr.className = "systems-evidence-sr";
  sr.textContent = `Lifecycle stage ${item.label}. Observation result ${item.result}. ${RESULT_ASSISTANCE[item.result] ?? ""}`;
  button.append(stage, result, sr);
  row.appendChild(button);
  return row;
}

export function bindLadderKeyboard(list, onSelect) {
  if (!list || typeof list.addEventListener !== "function") return;
  list.addEventListener("keydown", (event) => {
    const current = event.target?.closest?.("[data-claim]");
    if (!current || !list.contains(current)) return;
    const items = [...list.querySelectorAll("[data-claim]")].filter((node) => node.matches?.("button, [tabindex]"));
    const buttons = [...list.querySelectorAll("button[data-claim], .systems-evidence-ladder-select")];
    const controls = buttons.length ? buttons : items;
    const index = Math.max(0, controls.findIndex((node) => node === event.target || node.contains?.(event.target) || node === current));
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      const next = controls[(index + 1) % controls.length];
      next?.focus();
      onSelect?.(next?.dataset?.claim ?? current.dataset.claim);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      const next = controls[(index - 1 + controls.length) % controls.length];
      next?.focus();
      onSelect?.(next?.dataset?.claim ?? current.dataset.claim);
    } else if (event.key === "Home") {
      event.preventDefault();
      controls[0]?.focus();
      onSelect?.(controls[0]?.dataset?.claim);
    } else if (event.key === "End") {
      event.preventDefault();
      controls[controls.length - 1]?.focus();
      onSelect?.(controls[controls.length - 1]?.dataset?.claim);
    }
  });
}
