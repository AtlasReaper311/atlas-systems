"use strict";

const PUBLIC_SCHEMA_VERSION = "atlas-control-plane/public-model-promotion-projection/v1";
const REGRESSION_VOCABULARY = "atlas-control-plane/model-promotion-regression-vocabulary/v1";

export const COMPARISON_CANDIDATES = Object.freeze(["qwen3.5-mtp", "qwen3:14b"]);
export const SUPPORTED_MODEL_IDS = COMPARISON_CANDIDATES;

const CANDIDATE_FINGERPRINTS = Object.freeze({
  "qwen3.5-mtp": Object.freeze({
    "ramone-rag-generation": "b92b3faa8d75a6869dbf72b0b9cf80c214cba272e23b3a12f859ed32c4deeba5",
    "ramone-live-chat": "9d8d70d7577eb4e307852ca5b552370d02754d5d27205097b1393277a61c074e",
    "corpus-retrieval": "8b6ffc407bc02af7cc01596c99856dba03112c1345d2875feb587fa3c87503aa",
    "daily-digest-synthesis": "3e1dbfba5a3c9c643791b91b608810651f42212a019962275895f25eba21bdf3",
    "postmortem-drafting": "b049801c77b15a8efccf7a59bac0aaf41bae63f12bd4bb460bf5de662223053f",
  }),
  "qwen3:14b": Object.freeze({
    "ramone-rag-generation": "78eac8ff3e2e0aedc4ad6c8442c9d17d2d73890f06e914481d6d4e577ed9d83f",
    "ramone-live-chat": "ae8fd23f04ae11f8d617aabc981a955180384e06f901d090bf64d7eed799e665",
    "corpus-retrieval": "79c2b00ce3c3ab2c6759481f63b1a3bf9b6eef1194bd72d715f0b40a318d79c3",
    "daily-digest-synthesis": "9756936d47899afab0a2718ef4eb34d2a0239cb56da3675ad19a368e1950cb14",
    "postmortem-drafting": "acfce7f868020a9c0b633b92494f1825bcd52f2eddb1f429481da56ecf69837a",
  }),
});

export const CAPABILITIES = Object.freeze([
  Object.freeze({
    id: "ramone-rag-generation",
    label: "Ramone RAG generation",
    fingerprint: CANDIDATE_FINGERPRINTS["qwen3.5-mtp"]["ramone-rag-generation"],
    candidates: Object.freeze({
      "qwen3.5-mtp": Object.freeze({ model: "qwen3.5-mtp", fingerprint: CANDIDATE_FINGERPRINTS["qwen3.5-mtp"]["ramone-rag-generation"] }),
      "qwen3:14b": Object.freeze({ model: "qwen3:14b", fingerprint: CANDIDATE_FINGERPRINTS["qwen3:14b"]["ramone-rag-generation"] }),
    }),
  }),
  Object.freeze({
    id: "ramone-live-chat",
    label: "Ramone live chat",
    fingerprint: CANDIDATE_FINGERPRINTS["qwen3.5-mtp"]["ramone-live-chat"],
    candidates: Object.freeze({
      "qwen3.5-mtp": Object.freeze({ model: "qwen3.5-mtp", fingerprint: CANDIDATE_FINGERPRINTS["qwen3.5-mtp"]["ramone-live-chat"] }),
      "qwen3:14b": Object.freeze({ model: "qwen3:14b", fingerprint: CANDIDATE_FINGERPRINTS["qwen3:14b"]["ramone-live-chat"] }),
    }),
  }),
  Object.freeze({
    id: "corpus-retrieval",
    label: "Corpus retrieval",
    fingerprint: CANDIDATE_FINGERPRINTS["qwen3.5-mtp"]["corpus-retrieval"],
    candidates: Object.freeze({
      "qwen3.5-mtp": Object.freeze({ model: "qwen3.5-mtp", fingerprint: CANDIDATE_FINGERPRINTS["qwen3.5-mtp"]["corpus-retrieval"] }),
      "qwen3:14b": Object.freeze({ model: "qwen3:14b", fingerprint: CANDIDATE_FINGERPRINTS["qwen3:14b"]["corpus-retrieval"] }),
    }),
  }),
  Object.freeze({
    id: "daily-digest-synthesis",
    label: "Daily Digest synthesis",
    fingerprint: CANDIDATE_FINGERPRINTS["qwen3.5-mtp"]["daily-digest-synthesis"],
    candidates: Object.freeze({
      "qwen3.5-mtp": Object.freeze({ model: "qwen3.5-mtp", fingerprint: CANDIDATE_FINGERPRINTS["qwen3.5-mtp"]["daily-digest-synthesis"] }),
      "qwen3:14b": Object.freeze({ model: "qwen3:14b", fingerprint: CANDIDATE_FINGERPRINTS["qwen3:14b"]["daily-digest-synthesis"] }),
    }),
  }),
  Object.freeze({
    id: "postmortem-drafting",
    label: "Postmortem drafting",
    fingerprint: CANDIDATE_FINGERPRINTS["qwen3.5-mtp"]["postmortem-drafting"],
    candidates: Object.freeze({
      "qwen3.5-mtp": Object.freeze({ model: "qwen3.5-mtp", fingerprint: CANDIDATE_FINGERPRINTS["qwen3.5-mtp"]["postmortem-drafting"] }),
      "qwen3:14b": Object.freeze({ model: "qwen3:14b", fingerprint: CANDIDATE_FINGERPRINTS["qwen3:14b"]["postmortem-drafting"] }),
    }),
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

export const CAPABILITY_CATEGORY_LABELS = Object.freeze({
  abstention: "Abstention",
  "causal-claim": "Causal claim",
  fabrication: "Fabrication",
  "format-contract": "Format contract",
  grounding: "Grounding",
});

export const REGRESSION_LABELS = Object.freeze({
  "failed-abstention": "Failed abstention",
  "format-contract-failure": "Format contract failure",
  "grounding-failure": "Grounding failure",
  "unsupported-causal-claim": "Unsupported causal claim",
  "unsupported-fabrication": "Unsupported fabrication",
});

const REGRESSION_STATE_LABELS = Object.freeze({
  known: "Known regression",
  none: "None recorded",
  "unknown-not-observed": "UNKNOWN / NOT OBSERVED",
  "not-applicable": "NOT APPLICABLE",
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

export function candidateFor(capability, model) {
  return capability?.candidates?.[model] || null;
}

export function validateProjection(value, expectedFingerprint, expectedCapabilityId = null, expectedModelId = null) {
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
  if (!hasExactKeys(value.model, MODEL_KEYS) || !SUPPORTED_MODEL_IDS.includes(value.model.public_id)) {
    return fail("model identity is not accepted for this observatory");
  }
  if (expectedModelId !== null && value.model.public_id !== expectedModelId) {
    return fail("model identity does not match the candidate binding");
  }

  if (!hasExactKeys(value.evaluation, EVALUATION_KEYS)) return fail("evaluation shape is not supported");
  if (!["prepared", "evaluated-passed", "evaluated-failed", "no-accepted-evaluation", "exempt-not-applicable", "unknown-not-observed"].includes(value.evaluation.state)) {
    return fail("evaluation state is not supported");
  }
  if (!isNullableIsoDate(value.evaluation.prepared_at) || !isNullableIsoDate(value.evaluation.evaluated_at)) {
    return fail("evaluation timestamp is not valid");
  }
  if (!isUniqueArray(value.evaluation.categories, (item) => Object.hasOwn(CAPABILITY_CATEGORY_LABELS, item), 5)) {
    return fail("evaluation categories are not supported");
  }
  if (!hasExactKeys(value.evaluation.suite, SUITE_KEYS)) return fail("suite shape is not supported");
  if (typeof value.evaluation.suite.version !== "string" || !/^\d+\.\d+\.\d+$/.test(value.evaluation.suite.version)) return fail("suite version is not supported");
  if (!isSha256(value.evaluation.suite.revision, "suite:sha256:")) return fail("suite fingerprint is not supported");
  if (!hasExactKeys(value.evaluation.known_regressions, REGRESSION_KEYS)) return fail("regression shape is not supported");
  if (value.evaluation.known_regressions.vocabulary_version !== REGRESSION_VOCABULARY) return fail("regression vocabulary is not supported");
  if (!Object.hasOwn(REGRESSION_STATE_LABELS, value.evaluation.known_regressions.state)) return fail("regression state is not supported");
  if (!isUniqueArray(value.evaluation.known_regressions.categories, (item) => Object.hasOwn(REGRESSION_LABELS, item), 5)) return fail("regression categories are not supported");
  if (value.evaluation.known_regressions.state === "known" && value.evaluation.known_regressions.categories.length === 0) return fail("known regression state has no public category");
  if (value.evaluation.known_regressions.state !== "known" && value.evaluation.known_regressions.categories.length !== 0) return fail("non-known regression state has categories");
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

export function validateCandidateProjection(value, capability, model) {
  const candidate = candidateFor(capability, model);
  if (!candidate) return fail("candidate is not configured for this capability");
  return validateProjection(value, candidate.fingerprint, capability.id, candidate.model);
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

function field(card, name) {
  return card.querySelector(`[data-field="${name}"]`);
}

function setField(card, name, value, datetime = null) {
  const target = field(card, name);
  if (!target) return;
  target.textContent = value;
  if (datetime !== null) target.setAttribute("datetime", datetime);
}

function renderList(card, name, values, emptyText, labels = {}) {
  const target = card.querySelector(`[data-list="${name}"]`);
  if (!target) return;
  target.replaceChildren();
  const items = values.length ? values : [emptyText];
  items.forEach((value) => {
    const item = document.createElement("li");
    item.textContent = labels[value] || value;
    target.appendChild(item);
  });
}

function trailStep(card, name, state, label, detail) {
  const step = card.querySelector(`[data-trail="${name}"]`);
  if (!step) return;
  step.dataset.trailState = state;
  step.querySelector("strong").textContent = label;
  step.querySelector("small").textContent = detail;
}

function renderTrail(card, projection) {
  const evaluation = projection.evaluation;
  trailStep(card, "prepared", evaluation.prepared_at ? "observed" : "unknown", evaluation.prepared_at ? "EVAL PREPARED" : "EVAL PREPARED UNKNOWN", evaluation.prepared_at ? `Observed · ${formatTimestamp(evaluation.prepared_at)}` : "Unknown / not observed");
  if (["evaluated-passed", "evaluated-failed"].includes(evaluation.state)) {
    const result = evaluation.result;
    const failed = evaluation.state === "evaluated-failed";
    trailStep(card, "evaluated", failed ? "failed" : "observed", failed ? "EVALUATION FAILED" : "EVALUATION PASSED", `${result.passed_count} / ${result.case_count} passed · required threshold ${thresholdText(result)}`);
  } else {
    trailStep(card, "evaluated", "unknown", EVALUATION_STATE_LABELS[evaluation.state], "Unknown / not observed");
  }
  const review = projection.human_review;
  const reviewDetail = review.state === "reviewed" && review.reviewed_at
    ? `Observed · ${formatTimestamp(review.reviewed_at)}`
    : review.state === "pending" ? "No accepted review recorded" : review.state === "not-required" ? "Downstream promotion is not approved" : "Unknown / not observed";
  trailStep(card, "review", review.state === "reviewed" ? "observed" : review.state === "pending" ? "pending" : review.state === "not-required" ? "terminal" : "unknown", REVIEW_STATE_LABELS[review.state], reviewDetail);
  const promotion = projection.promotion;
  const promotionState = promotion.state === "approved" ? "observed" : projection.evaluation.state === "evaluated-failed" ? "terminal" : promotion.state === "not-approved" ? "pending" : "unknown";
  const promotionDetail = promotion.state === "approved" && promotion.approved_at
    ? `Observed · ${formatTimestamp(promotion.approved_at)}`
    : promotion.state === "not-approved" ? "No approved promotion record" : "Unknown / not observed";
  trailStep(card, "promotion", promotionState, PROMOTION_STATE_LABELS[promotion.state], promotionDetail);
}

function renderProjection(card, projection) {
  const result = projection.evaluation.result;
  card.dataset.evidenceState = projection.freshness.state;
  card.dataset.evaluation = projection.evaluation.state === "evaluated-failed" ? "failed" : "passed";
  card.querySelectorAll(".candidate-known-content").forEach((node) => { node.hidden = false; });
  card.querySelector(".candidate-fail-closed").hidden = true;
  setField(card, "model", projection.model.public_id);
  setField(card, "evaluation-state", EVALUATION_STATE_LABELS[projection.evaluation.state]);
  setField(card, "human-review-state", REVIEW_STATE_LABELS[projection.human_review.state]);
  setField(card, "promotion-state", PROMOTION_STATE_LABELS[projection.promotion.state]);
  setField(card, "freshness-state", FRESHNESS_STATE_LABELS[projection.freshness.state]);
  setField(card, "regression-state", REGRESSION_STATE_LABELS[projection.evaluation.known_regressions.state]);
  setField(card, "runtime-state", projection.current_model_observation.state === "not-represented" ? "Not represented in this receipt" : projection.current_model_observation.state);
  setField(card, "generated-at", formatTimestamp(projection.generated_at), projection.generated_at);
  setField(card, "prepared-at", formatTimestamp(projection.evaluation.prepared_at), projection.evaluation.prepared_at);
  setField(card, "evaluated-at", formatTimestamp(projection.evaluation.evaluated_at), projection.evaluation.evaluated_at);
  setField(card, "reviewed-at", formatTimestamp(projection.human_review.reviewed_at), projection.human_review.reviewed_at);
  setField(card, "promotion-at", formatTimestamp(projection.promotion.approved_at), projection.promotion.approved_at);
  setField(card, "observed-at", formatTimestamp(projection.freshness.evidence_observed_at), projection.freshness.evidence_observed_at);
  setField(card, "suite-version", projection.evaluation.suite.version);
  setField(card, "suite-revision", projection.evaluation.suite.revision);
  setField(card, "projection-fingerprint", projection.projection_fingerprint);
  if (result) {
    setField(card, "case-result", `${result.passed_count} / ${result.case_count} passed`);
    setField(card, "threshold", `Required threshold ${thresholdText(result)}`);
    setField(card, "pass-rate", `${formatPercent(result.pass_rate)} (${result.passed_count} / ${result.case_count} cases)`);
    setField(card, "interpretation", projection.evaluation.state === "evaluated-failed"
      ? `This candidate did not meet the required threshold for ${projection.capability.id}. The result is an evaluation failure, not a service failure.`
      : `This candidate met the required threshold for ${projection.capability.id}. Suitability remains specific to this capability and evidence set.`);
  } else {
    setField(card, "case-result", "UNKNOWN / NOT OBSERVED");
    setField(card, "threshold", "Required threshold unknown");
    setField(card, "pass-rate", "UNKNOWN / NOT OBSERVED");
    setField(card, "interpretation", "The accepted public projection does not contain a usable aggregate result.");
  }
  renderList(card, "categories", projection.evaluation.categories, "None recorded", CAPABILITY_CATEGORY_LABELS);
  renderList(card, "regressions", projection.evaluation.known_regressions.categories, REGRESSION_STATE_LABELS[projection.evaluation.known_regressions.state], REGRESSION_LABELS);
  renderList(card, "gaps", projection.gaps, "UNKNOWN / NOT OBSERVED", GAP_LABELS);
  renderTrail(card, projection);
  const runtimeStatus = card.querySelector(".candidate-runtime-status");
  const stale = projection.freshness.state !== "current";
  runtimeStatus.hidden = !stale;
  runtimeStatus.dataset.state = projection.freshness.state;
  runtimeStatus.textContent = stale
    ? `${FRESHNESS_STATE_LABELS[projection.freshness.state]}. This receipt is not presented as current comparison evidence.`
    : "Receipt verified against its public-safe shape and candidate fingerprint.";
}

function renderUnavailable(card) {
  card.dataset.evidenceState = "unavailable";
  card.querySelectorAll(".candidate-known-content").forEach((node) => { node.hidden = true; });
  const fallback = card.querySelector(".candidate-fail-closed");
  fallback.hidden = false;
  fallback.querySelector("span").textContent = "This public receipt could not be verified. Evaluation, review, promotion, regression, and deployment claims are UNKNOWN / UNAVAILABLE.";
  card.querySelector(".candidate-runtime-status").hidden = true;
}

async function loadProjection(capability, model) {
  const candidate = candidateFor(capability, model);
  if (!candidate) return null;
  try {
    const response = await fetch(new URL(`evidence/${candidate.fingerprint}.json`, import.meta.url), { cache: "no-store" });
    if (!response.ok) throw new Error("receipt unavailable");
    const value = await response.json();
    const checked = validateCandidateProjection(value, capability, model);
    if (!checked.ok) throw new Error(checked.reason);
    return checked.value;
  } catch {
    return null;
  }
}

function installSelector() {
  const buttons = [...document.querySelectorAll("[data-capability-switch]")];
  const comparisons = [...document.querySelectorAll("[data-capability-comparison]")];
  const microscopeEntries = [...document.querySelectorAll("[data-microscope-entry]")];
  const status = document.querySelector("[data-capability-status]");
  const activate = (id, focus = false) => {
    buttons.forEach((button) => {
      const active = button.dataset.capabilitySwitch === id;
      button.setAttribute("aria-pressed", String(active));
      button.dataset.active = String(active);
      if (active && focus) button.focus();
    });
    comparisons.forEach((comparison) => {
      const active = comparison.dataset.capabilityComparison === id;
      comparison.dataset.active = String(active);
      comparison.hidden = !active;
    });
    microscopeEntries.forEach((entry) => {
      entry.hidden = entry.dataset.microscopeCapability !== id;
    });
    const activeButton = buttons.find((button) => button.dataset.capabilitySwitch === id);
    if (status && activeButton) status.textContent = `Showing ${activeButton.dataset.capabilityLabel} comparison evidence.`;
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
  return { comparisons, microscopeEntries };
}

async function init() {
  const selector = installSelector();
  document.body.dataset.modelPromotionEnhanced = "true";
  await Promise.all(CAPABILITIES.flatMap((capability) => COMPARISON_CANDIDATES.map(async (model) => {
    const card = document.querySelector(`[data-candidate-certificate="${model}"][data-capability-id="${capability.id}"]`);
    if (!card) return;
    const projection = await loadProjection(capability, model);
    if (projection) renderProjection(card, projection);
    else renderUnavailable(card);
  })));
  selector.microscopeEntries.forEach((entry) => {
    const capability = CAPABILITIES.find(({ id }) => id === entry.dataset.microscopeCapability);
    const model = entry.dataset.microscopeModel;
    const candidate = candidateFor(capability, model);
    if (!candidate) return;
    const card = document.querySelector(`[data-candidate-certificate="${model}"][data-capability-id="${capability.id}"]`);
    const state = card?.dataset.evidenceState === "unavailable" ? "unknown-not-observed" : card?.querySelector('[data-field="regression-state"]')?.textContent;
    if (state) entry.dataset.microscopeRenderedState = state;
  });
  const status = document.querySelector("[data-capability-status]");
  if (status) status.textContent = "Capability comparison enhanced. Every candidate certificate remains available from the page source.";
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void init(), { once: true });
  else void init();
}
