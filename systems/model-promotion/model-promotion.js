"use strict";

const EXPECTED_MODEL_ID = "qwen3.5-mtp";
const PUBLIC_SCHEMA_VERSION = "atlas-control-plane/public-model-promotion-projection/v1";
const REGRESSION_VOCABULARY = "atlas-control-plane/model-promotion-regression-vocabulary/v1";

export const CAPABILITIES = Object.freeze([
  Object.freeze({
    id: "ramone-rag-generation",
    label: "Ramone RAG generation",
    fingerprint: "b92b3faa8d75a6869dbf72b0b9cf80c214cba272e23b3a12f859ed32c4deeba5",
  }),
  Object.freeze({
    id: "ramone-live-chat",
    label: "Ramone live chat",
    fingerprint: "9d8d70d7577eb4e307852ca5b552370d02754d5d27205097b1393277a61c074e",
  }),
  Object.freeze({
    id: "corpus-retrieval",
    label: "Corpus retrieval",
    fingerprint: "8b6ffc407bc02af7cc01596c99856dba03112c1345d2875feb587fa3c87503aa",
  }),
  Object.freeze({
    id: "daily-digest-synthesis",
    label: "Daily Digest synthesis",
    fingerprint: "3e1dbfba5a3c9c643791b91b608810651f42212a019962275895f25eba21bdf3",
  }),
  Object.freeze({
    id: "postmortem-drafting",
    label: "Postmortem drafting",
    fingerprint: "b049801c77b15a8efccf7a59bac0aaf41bae63f12bd4bb460bf5de662223053f",
  }),
]);

const ROOT_KEYS = [
  "capability", "current_model_observation", "deployment_boundary", "evaluation",
  "freshness", "gaps", "generated_at", "human_review", "model", "privacy",
  "projection_fingerprint", "promotion", "schema_version", "state",
];
const CAPABILITY_KEYS = ["id"];
const MODEL_KEYS = ["public_id"];
const EVALUATION_KEYS = ["categories", "evaluated_at", "known_regressions", "prepared_at", "result", "state", "suite"];
const SUITE_KEYS = ["revision", "version"];
const REGRESSION_KEYS = ["categories", "state", "vocabulary_version"];
const RESULT_KEYS = ["case_count", "failed_count", "minimum_pass_rate", "pass_rate", "passed_count"];
const REVIEW_KEYS = ["reviewed_at", "state"];
const PROMOTION_KEYS = ["approved_at", "state", "superseded_by_projection_fingerprint", "supersedes_projection_fingerprint"];
const FRESHNESS_KEYS = ["evidence_observed_at", "max_age_days", "state"];
const OBSERVATION_KEYS = ["observed_at", "observed_model_id", "state", "subject"];
const BOUNDARY_KEYS = ["deployed", "deployment_observed", "live_verified", "promotion_is_not_deployment", "runtime_verified"];
const PRIVACY_KEYS = ["mode", "private_evidence_uris_excluded", "private_inputs_excluded", "raw_answers_excluded", "runtime_configuration_excluded", "unknown_fields_rejected"];

const CAPABILITY_CATEGORY_LABELS = Object.freeze({
  abstention: "Abstention",
  "causal-claim": "Causal claim",
  fabrication: "Fabrication",
  "format-contract": "Format contract",
  grounding: "Grounding",
});

const REGRESSION_LABELS = Object.freeze({
  "failed-abstention": "Failed abstention",
  "format-contract-failure": "Format contract failure",
  "grounding-failure": "Grounding failure",
  "unsupported-causal-claim": "Unsupported causal claim",
  "unsupported-fabrication": "Unsupported fabrication",
});

const GAP_LABELS = Object.freeze({
  "deployment-not-applicable": "Deployment is not applicable to this receipt",
  "evaluation-failed": "Evaluation threshold was not met",
  "human-review-pending": "Human review is pending",
  "no-accepted-evaluation": "No accepted evaluation",
  "promoted-current-model-mismatch": "Promoted/current model mismatch",
  "promotion-not-observed": "Promotion is not observed",
  "runtime-model-not-represented": "Runtime model identity is not represented",
  "stale-evidence": "Evidence is stale",
  "superseded-promotion": "Promotion was superseded",
  "unknown-evidence": "Evidence is unknown",
});

const ROOT_STATE_LABELS = Object.freeze({
  "evaluated-failed": "Evaluation failed",
  "evaluated-passed": "Evaluation passed",
  "evaluation-prepared": "Evaluation prepared",
  "exempt-not-applicable": "Not applicable",
  "no-accepted-evaluation": "No accepted evaluation",
  "promoted-current-model-mismatch": "Promoted/current model mismatch",
  "promotion-approved": "Promotion approved",
  "review-pending": "Human review pending",
  "stale-evidence": "Stale evidence",
  "superseded-promotion": "Superseded promotion",
  "unknown-not-observed": "Unknown / not observed",
});

const EVALUATION_STATE_LABELS = Object.freeze({
  "evaluated-failed": "Evaluation failed",
  "evaluated-passed": "Evaluation passed",
  "exempt-not-applicable": "Evaluation not applicable",
  "no-accepted-evaluation": "Evaluation not accepted",
  prepared: "Evaluation prepared",
  "unknown-not-observed": "Evaluation unknown / not observed",
});

const REVIEW_STATE_LABELS = Object.freeze({
  "exempt-not-applicable": "Human review not applicable",
  "not-required": "Human review not required",
  pending: "Human review pending",
  reviewed: "Human reviewed",
  "unknown-not-observed": "Human review unknown / not observed",
});

const PROMOTION_STATE_LABELS = Object.freeze({
  approved: "Promotion approved",
  "exempt-not-applicable": "Promotion not applicable",
  "not-approved": "Promotion not approved",
  superseded: "Promotion superseded",
  "unknown-not-observed": "Promotion unknown / not observed",
});

const FRESHNESS_STATE_LABELS = Object.freeze({
  current: "Current evidence",
  stale: "Stale evidence",
  superseded: "Superseded evidence",
  unknown: "Evidence freshness unknown",
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  return isObject(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function isIsoDate(value) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isNullableIsoDate(value) {
  return value === null || isIsoDate(value);
}

function isSha256(value, prefix = "sha256:") {
  return typeof value === "string" && new RegExp(`^${prefix}[0-9a-f]{64}$`).test(value);
}

function isUniqueArray(value, predicate, maxItems) {
  return Array.isArray(value)
    && value.length <= maxItems
    && new Set(value).size === value.length
    && value.every(predicate);
}

function fail(reason) {
  return { ok: false, reason };
}

function pass(value) {
  return { ok: true, value };
}

function validateResult(result) {
  if (result === null) return pass(result);
  if (!hasExactKeys(result, RESULT_KEYS)) return fail("result shape is not supported");
  const integerFields = ["case_count", "passed_count", "failed_count"];
  if (!integerFields.every((key) => Number.isInteger(result[key]) && result[key] >= 0)) {
    return fail("result counts are not valid integers");
  }
  if (result.case_count < 1 || result.passed_count + result.failed_count !== result.case_count) {
    return fail("result counts are incomplete");
  }
  if (!["pass_rate", "minimum_pass_rate"].every((key) => Number.isFinite(result[key]) && result[key] >= 0 && result[key] <= 1)) {
    return fail("result rates are not bounded");
  }
  if (Math.abs(result.pass_rate - (result.passed_count / result.case_count)) > 1e-9) {
    return fail("pass rate does not match the case result");
  }
  return pass(result);
}

export function validateProjection(value, expectedFingerprint, expectedCapabilityId = null) {
  if (!hasExactKeys(value, ROOT_KEYS)) return fail("root shape is not supported");
  if (value.schema_version !== PUBLIC_SCHEMA_VERSION) return fail("schema version is not supported");
  if (!["evaluation-prepared", "evaluated-passed", "evaluated-failed", "review-pending", "promotion-approved", "no-accepted-evaluation", "stale-evidence", "superseded-promotion", "promoted-current-model-mismatch", "exempt-not-applicable", "unknown-not-observed"].includes(value.state)) return fail("root state is not supported");
  if (!isSha256(value.projection_fingerprint) || value.projection_fingerprint !== `sha256:${expectedFingerprint}`) {
    return fail("projection fingerprint does not match the receipt filename");
  }
  if (!isIsoDate(value.generated_at)) return fail("generated timestamp is not valid");

  if (!hasExactKeys(value.capability, CAPABILITY_KEYS) || typeof value.capability.id !== "string") {
    return fail("capability shape is not supported");
  }
  if (expectedCapabilityId !== null && value.capability.id !== expectedCapabilityId) {
    return fail("capability does not match the receipt identity");
  }
  if (!hasExactKeys(value.model, MODEL_KEYS) || value.model.public_id !== EXPECTED_MODEL_ID) {
    return fail("model identity is not accepted for this observatory");
  }

  if (!hasExactKeys(value.evaluation, EVALUATION_KEYS)) return fail("evaluation shape is not supported");
  if (!["prepared", "evaluated-passed", "evaluated-failed", "no-accepted-evaluation", "exempt-not-applicable", "unknown-not-observed"].includes(value.evaluation.state)) {
    return fail("evaluation state is not supported");
  }
  if (!isNullableIsoDate(value.evaluation.prepared_at) || !isNullableIsoDate(value.evaluation.evaluated_at)) {
    return fail("evaluation timestamp is not valid");
  }
  if (!isUniqueArray(value.evaluation.categories, (item) => ["grounding", "abstention", "fabrication", "causal-claim", "format-contract"].includes(item), 5)) {
    return fail("evaluation categories are not supported");
  }
  if (!hasExactKeys(value.evaluation.suite, SUITE_KEYS)) return fail("suite shape is not supported");
  if (typeof value.evaluation.suite.version !== "string" || !/^\d+\.\d+\.\d+$/.test(value.evaluation.suite.version)) return fail("suite version is not supported");
  if (!isSha256(value.evaluation.suite.revision, "suite:sha256:")) return fail("suite fingerprint is not supported");
  if (!hasExactKeys(value.evaluation.known_regressions, REGRESSION_KEYS)) return fail("regression shape is not supported");
  if (value.evaluation.known_regressions.vocabulary_version !== REGRESSION_VOCABULARY) return fail("regression vocabulary is not supported");
  if (!["none", "known", "unknown-not-observed", "not-applicable"].includes(value.evaluation.known_regressions.state)) return fail("regression state is not supported");
  if (!isUniqueArray(value.evaluation.known_regressions.categories, (item) => Object.hasOwn(REGRESSION_LABELS, item), 5)) return fail("regression categories are not supported");
  const resultCheck = validateResult(value.evaluation.result);
  if (!resultCheck.ok) return resultCheck;
  if (["evaluated-passed", "evaluated-failed"].includes(value.evaluation.state) && value.evaluation.result === null) return fail("evaluated state has no aggregate result");

  if (!hasExactKeys(value.human_review, REVIEW_KEYS) || !["pending", "reviewed", "not-required", "exempt-not-applicable", "unknown-not-observed"].includes(value.human_review.state) || !isNullableIsoDate(value.human_review.reviewed_at)) {
    return fail("human review shape is not supported");
  }
  if (!hasExactKeys(value.promotion, PROMOTION_KEYS) || !["approved", "not-approved", "superseded", "exempt-not-applicable", "unknown-not-observed"].includes(value.promotion.state) || !isNullableIsoDate(value.promotion.approved_at)) {
    return fail("promotion shape is not supported");
  }
  if (value.promotion.supersedes_projection_fingerprint !== null && !isSha256(value.promotion.supersedes_projection_fingerprint)) return fail("supersession fingerprint is not supported");
  if (value.promotion.superseded_by_projection_fingerprint !== null && !isSha256(value.promotion.superseded_by_projection_fingerprint)) return fail("superseded-by fingerprint is not supported");

  if (!hasExactKeys(value.freshness, FRESHNESS_KEYS) || !["current", "stale", "superseded", "unknown"].includes(value.freshness.state) || !isNullableIsoDate(value.freshness.evidence_observed_at) || (value.freshness.max_age_days !== null && (!Number.isInteger(value.freshness.max_age_days) || value.freshness.max_age_days < 1))) {
    return fail("freshness shape is not supported");
  }
  if (!hasExactKeys(value.current_model_observation, OBSERVATION_KEYS) || value.current_model_observation.subject !== "runtime-model-identity" || !["not-represented", "observed-match", "observed-mismatch", "unknown-not-observed"].includes(value.current_model_observation.state) || !isNullableIsoDate(value.current_model_observation.observed_at) || (value.current_model_observation.observed_model_id !== null && typeof value.current_model_observation.observed_model_id !== "string")) {
    return fail("current model observation shape is not supported");
  }
  if (!isUniqueArray(value.gaps, (item) => Object.hasOwn(GAP_LABELS, item), 8) || value.gaps.length < 1) return fail("gaps are not supported");
  if (!hasExactKeys(value.deployment_boundary, BOUNDARY_KEYS) || value.deployment_boundary.promotion_is_not_deployment !== true || value.deployment_boundary.deployment_observed !== "not-applicable" || value.deployment_boundary.deployed !== "not-applicable" || value.deployment_boundary.runtime_verified !== "not-applicable" || value.deployment_boundary.live_verified !== "not-applicable") {
    return fail("deployment boundary is not fixed safely");
  }
  if (!hasExactKeys(value.privacy, PRIVACY_KEYS) || value.privacy.mode !== "public-safe-allowlist" || !["private_evidence_uris_excluded", "private_inputs_excluded", "raw_answers_excluded", "runtime_configuration_excluded", "unknown_fields_rejected"].every((key) => value.privacy[key] === true)) return fail("privacy boundary is not fixed safely");

  const stableState = value.freshness.state === "stale" ? "stale-evidence" : value.freshness.state === "superseded" ? "superseded-promotion" : null;
  if (stableState !== null && value.state !== stableState) return fail("root state does not match freshness");
  if (value.state === "promotion-approved" && (value.evaluation.state !== "evaluated-passed" || value.human_review.state !== "reviewed" || value.promotion.state !== "approved")) return fail("approved state skips a lifecycle gate");
  if (value.state === "review-pending" && (value.evaluation.state !== "evaluated-passed" || value.human_review.state !== "pending" || value.promotion.state !== "not-approved")) return fail("pending state skips a lifecycle gate");
  if (value.state === "evaluated-failed" && (value.evaluation.state !== "evaluated-failed" || value.promotion.state === "approved")) return fail("failed evaluation has an invalid downstream state");
  return pass(value);
}

function formatTimestamp(value) {
  if (!value) return "Not observed";
  return value.replace("T", " ").replace(/\.\d+Z$/, " UTC").replace(/Z$/, " UTC");
}

function formatPercent(rate) {
  const percent = rate * 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2)}%`;
}

function thresholdText(result) {
  const required = Math.ceil(result.minimum_pass_rate * result.case_count);
  return `${required} / ${result.case_count}`;
}

function field(receipt, name) {
  return receipt.querySelector(`[data-field="${name}"]`);
}

function setField(receipt, name, value, datetime = null) {
  const target = field(receipt, name);
  if (!target) return;
  target.textContent = value;
  if (datetime !== null) target.setAttribute("datetime", datetime);
}

function renderList(receipt, name, values, emptyText, labels = {}) {
  const target = receipt.querySelector(`[data-list="${name}"]`);
  if (!target) return;
  target.replaceChildren();
  const items = values.length ? values : [emptyText];
  items.forEach((value) => {
    const item = document.createElement("li");
    item.textContent = labels[value] || value;
    target.appendChild(item);
  });
}

function trailStep(receipt, name, state, label, detail) {
  const step = receipt.querySelector(`[data-trail="${name}"]`);
  if (!step) return;
  step.dataset.trailState = state;
  step.querySelector("strong").textContent = label;
  step.querySelector("small").textContent = detail;
}

function renderTrail(receipt, projection) {
  const evaluation = projection.evaluation;
  trailStep(
    receipt,
    "prepared",
    evaluation.prepared_at ? "observed" : "unknown",
    evaluation.prepared_at ? "EVAL PREPARED" : "EVAL PREPARED UNKNOWN",
    evaluation.prepared_at ? `Observed · ${formatTimestamp(evaluation.prepared_at)}` : "Unknown / not observed",
  );
  if (evaluation.state === "evaluated-passed" || evaluation.state === "evaluated-failed") {
    const passed = evaluation.result?.passed_count ?? 0;
    const cases = evaluation.result?.case_count ?? 0;
    const threshold = evaluation.result ? thresholdText(evaluation.result) : "unknown";
    const failed = evaluation.state === "evaluated-failed";
    trailStep(receipt, "evaluated", failed ? "failed" : "observed", failed ? "EVALUATION FAILED" : "EVALUATION PASSED", `${passed} / ${cases} passed · required threshold ${threshold}`);
  } else {
    trailStep(receipt, "evaluated", "unknown", EVALUATION_STATE_LABELS[evaluation.state], "Unknown / not observed");
  }
  const review = projection.human_review;
  const reviewDetail = review.state === "reviewed" && review.reviewed_at
    ? `Observed · ${formatTimestamp(review.reviewed_at)}`
    : review.state === "pending" ? "No accepted review recorded" : review.state === "not-required" ? "Downstream promotion is not approved" : "Unknown / not observed";
  trailStep(receipt, "review", review.state === "reviewed" ? "observed" : review.state === "pending" ? "pending" : review.state === "not-required" ? "terminal" : "unknown", REVIEW_STATE_LABELS[review.state], reviewDetail);
  const promotion = projection.promotion;
  const promotionState = promotion.state === "approved" ? "observed" : projection.evaluation.state === "evaluated-failed" ? "terminal" : promotion.state === "not-approved" ? "pending" : "unknown";
  const promotionDetail = promotion.state === "approved" && promotion.approved_at
    ? `Observed · ${formatTimestamp(promotion.approved_at)}`
    : promotion.state === "not-approved" ? "No approved promotion record" : "Unknown / not observed";
  trailStep(receipt, "promotion", promotionState, PROMOTION_STATE_LABELS[promotion.state], promotionDetail);
  const note = receipt.querySelector("[data-trail-note]");
  if (note) note.textContent = projection.evaluation.state === "evaluated-failed"
    ? "Trail terminates at the failed evaluation. This is not a service outage or a pending deployment path."
    : projection.human_review.state === "pending"
      ? "The review gate is visibly pending. A passing evaluation does not imply review or promotion."
      : "The recorded lifecycle ends at the accepted promotion decision. Deployment remains a separate authority.";
}

function renderProjection(receipt, projection) {
  const result = projection.evaluation.result;
  receipt.dataset.evidenceState = projection.freshness.state;
  receipt.dataset.evaluation = projection.evaluation.state === "evaluated-failed" ? "failed" : "passed";
  receipt.querySelectorAll(".receipt-known-content").forEach((node) => { node.hidden = false; });
  receipt.querySelector(".promotion-receipt__fail-closed").hidden = true;
  setField(receipt, "model", projection.model.public_id);
  setField(receipt, "root-state", ROOT_STATE_LABELS[projection.state] || projection.state);
  setField(receipt, "evaluation-state", EVALUATION_STATE_LABELS[projection.evaluation.state]);
  setField(receipt, "human-review-state", REVIEW_STATE_LABELS[projection.human_review.state]);
  setField(receipt, "promotion-state", PROMOTION_STATE_LABELS[projection.promotion.state]);
  setField(receipt, "freshness-state", FRESHNESS_STATE_LABELS[projection.freshness.state]);
  setField(receipt, "regression-state", projection.evaluation.known_regressions.state === "none" ? "None recorded" : projection.evaluation.known_regressions.state === "known" ? "Known categories recorded" : "Unknown / not observed");
  setField(receipt, "current-model-state", projection.current_model_observation.state === "not-represented" ? "Not represented in this receipt" : projection.current_model_observation.state);
  setField(receipt, "generated-at", formatTimestamp(projection.generated_at), projection.generated_at);
  setField(receipt, "prepared-at", formatTimestamp(projection.evaluation.prepared_at), projection.evaluation.prepared_at);
  setField(receipt, "evaluated-at", formatTimestamp(projection.evaluation.evaluated_at), projection.evaluation.evaluated_at);
  setField(receipt, "reviewed-at", formatTimestamp(projection.human_review.reviewed_at), projection.human_review.reviewed_at);
  setField(receipt, "promotion-at", formatTimestamp(projection.promotion.approved_at), projection.promotion.approved_at);
  setField(receipt, "observed-at", formatTimestamp(projection.freshness.evidence_observed_at), projection.freshness.evidence_observed_at);
  setField(receipt, "suite-version", projection.evaluation.suite.version);
  setField(receipt, "suite-revision", projection.evaluation.suite.revision);
  setField(receipt, "projection-fingerprint", projection.projection_fingerprint);
  if (result) {
    setField(receipt, "case-result", `${result.passed_count} / ${result.case_count} passed`);
    setField(receipt, "threshold", `Required threshold ${thresholdText(result)}`);
    setField(receipt, "pass-rate", `${formatPercent(result.pass_rate)} (${result.passed_count} / ${result.case_count} cases)`);
    setField(receipt, "interpretation", projection.evaluation.state === "evaluated-failed"
      ? `This model did not meet the required threshold for ${projection.capability.id}. The result is an evaluation failure, not a service failure.`
      : `This model met the required threshold for ${projection.capability.id}. Suitability remains specific to this capability and evidence set.`);
  } else {
    setField(receipt, "case-result", "Unknown / not observed");
    setField(receipt, "threshold", "Required threshold unknown");
    setField(receipt, "pass-rate", "Unknown / not observed");
    setField(receipt, "interpretation", "The accepted public projection does not contain a usable aggregate result.");
  }
  renderList(receipt, "categories", projection.evaluation.categories, "None recorded", CAPABILITY_CATEGORY_LABELS);
  renderList(receipt, "regressions", projection.evaluation.known_regressions.categories, projection.evaluation.known_regressions.state === "none" ? "None recorded" : "Unknown / not observed", REGRESSION_LABELS);
  renderList(receipt, "gaps", projection.gaps, "Unknown / not observed", GAP_LABELS);
  renderTrail(receipt, projection);
  const lineage = receipt.querySelector("[data-lineage]");
  if (lineage) {
    const supersedes = projection.promotion.supersedes_projection_fingerprint;
    lineage.hidden = !supersedes;
    if (supersedes) lineage.querySelector("[data-field=previous-fingerprint]").textContent = supersedes;
  }
  const runtimeStatus = receipt.querySelector(".promotion-receipt__runtime-status");
  const stale = projection.freshness.state !== "current";
  runtimeStatus.hidden = !stale;
  runtimeStatus.dataset.state = projection.freshness.state;
  runtimeStatus.textContent = stale
    ? `${FRESHNESS_STATE_LABELS[projection.freshness.state]}. This receipt is not presented as current promotion evidence.`
    : "Receipt verified against its public-safe shape and filename fingerprint.";
}

function renderUnavailable(receipt) {
  receipt.dataset.evidenceState = "unavailable";
  receipt.querySelectorAll(".receipt-known-content").forEach((node) => { node.hidden = true; });
  const fallback = receipt.querySelector(".promotion-receipt__fail-closed");
  fallback.hidden = false;
  fallback.querySelector("span").textContent = "This public receipt could not be verified. Evaluation, review, promotion, and deployment claims are UNKNOWN / UNAVAILABLE.";
  const runtimeStatus = receipt.querySelector(".promotion-receipt__runtime-status");
  runtimeStatus.hidden = true;
}

async function loadProjection(capability) {
  try {
    const response = await fetch(new URL(`evidence/${capability.fingerprint}.json`, import.meta.url), { cache: "no-store" });
    if (!response.ok) throw new Error("receipt unavailable");
    const value = await response.json();
    const checked = validateProjection(value, capability.fingerprint, capability.id);
    if (!checked.ok) throw new Error(checked.reason);
    return checked.value;
  } catch {
    return null;
  }
}

function installSelector() {
  const buttons = [...document.querySelectorAll("[data-capability-switch]")];
  const receipts = [...document.querySelectorAll("[data-capability-receipt]")];
  const status = document.querySelector("[data-capability-status]");
  const byId = new Map(receipts.map((receipt) => [receipt.dataset.capabilityReceipt, receipt]));
  const activate = (id, focus = false) => {
    buttons.forEach((button) => {
      const active = button.dataset.capabilitySwitch === id;
      button.setAttribute("aria-pressed", String(active));
      button.dataset.active = String(active);
      if (active && focus) button.focus();
    });
    receipts.forEach((receipt) => {
      const active = receipt.dataset.capabilityReceipt === id;
      receipt.dataset.active = String(active);
      receipt.hidden = !active;
    });
    const activeButton = buttons.find((button) => button.dataset.capabilitySwitch === id);
    if (status && activeButton) status.textContent = `Showing ${activeButton.dataset.capabilityLabel} evidence receipt.`;
  };
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => activate(button.dataset.capabilitySwitch));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + buttons.length) % buttons.length;
      activate(buttons[next].dataset.capabilitySwitch, true);
    });
  });
  activate(buttons[0]?.dataset.capabilitySwitch || CAPABILITIES[0].id);
  return { buttons, receipts, byId };
}

async function init() {
  const selector = installSelector();
  document.body.dataset.modelPromotionEnhanced = "true";
  await Promise.all(CAPABILITIES.map(async (capability) => {
    const receipt = selector.byId.get(capability.id);
    if (!receipt) return;
    const projection = await loadProjection(capability);
    if (projection) renderProjection(receipt, projection);
    else renderUnavailable(receipt);
  }));
  const status = document.querySelector("[data-capability-status]");
  if (status) status.textContent = "Capability selector enhanced. Every receipt remains available from the page source.";
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void init(), { once: true });
  else void init();
}
