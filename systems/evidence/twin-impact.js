const TWIN_IMPACT_ENDPOINT = "https://api.atlas-systems.uk/v1/evidence/twin-impact";
const TWIN_SCHEMA_VERSION = "atlas-control-plane/twin-impact-projection/v1";
const FETCH_TIMEOUT_MS = 6000;

const RELATION_AUTHORITIES = Object.freeze({
  repository: "atlas-infra-public-classification",
  component: "atlas-api-public-topology-exporter",
  service: "atlas-api-public-topology-exporter",
});

const RELATION_ORDER = Object.freeze([
  "changed",
  "direct-consumer",
  "indirect-consumer",
  "declared-service",
]);

const UNKNOWN_CODES = new Set([
  "private-or-unclassified-evidence",
  "public-classification-unavailable",
  "passport-source-unavailable",
  "public-topology-relationship-unavailable",
  "private-or-unknown-subject",
]);

const LIMITATION_CODES = new Set([
  "could-be-affected-only",
  "no-merge-approval",
  "no-deployment-claim",
  "no-runtime-claim",
  "no-live-claim",
  "no-publication-claim",
  "no-failure-claim",
  "no-estate-completeness-claim",
  "private-or-unclassified-evidence-may-be-unknown",
]);

const FORBIDDEN_KEYS = /merge|approval|release|publication|deployment|runtime|failure|live/i;

const byId = (id) => document.getElementById(id);

export { TWIN_IMPACT_ENDPOINT, TWIN_SCHEMA_VERSION };

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected) {
  return isRecord(value)
    && Object.keys(value).sort().join("\u0000") === [...expected].sort().join("\u0000");
}

function noForbiddenKeys(value) {
  if (Array.isArray(value)) return value.every(noForbiddenKeys);
  if (!isRecord(value)) return true;
  return Object.entries(value).every(([key, child]) => (
    !FORBIDDEN_KEYS.test(key) && noForbiddenKeys(child)
  ));
}

function timestamp(value) {
  return typeof value === "string"
    && value.endsWith("Z")
    && Number.isFinite(Date.parse(value));
}

function publicSubject(subject) {
  if (!exactKeys(subject, ["visibility", "repository", "base_oid", "head_oid"])) return false;
  if (subject.visibility === "public") {
    return /^AtlasReaper311\/[A-Za-z0-9._-]+$/.test(subject.repository || "")
      && /^[0-9a-f]{40}$/.test(subject.base_oid || "")
      && /^[0-9a-f]{40}$/.test(subject.head_oid || "");
  }
  return subject.visibility === "private-or-unknown"
    && subject.repository === null
    && subject.base_oid === null
    && subject.head_oid === null;
}

function validRelationship(item) {
  if (!exactKeys(item, ["kind", "id", "relation", "evidence_class", "identity_authority"])) return false;
  const authority = RELATION_AUTHORITIES[item.kind];
  const idPattern = item.kind === "repository"
    ? /^AtlasReaper311\/[A-Za-z0-9._-]+$/
    : /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return Boolean(authority)
    && typeof item.id === "string"
    && idPattern.test(item.id)
    && item.evidence_class === "twin-impact"
    && item.identity_authority === authority
    && RELATION_ORDER.includes(item.relation);
}

function validRelationships(value) {
  return Array.isArray(value)
    && value.length <= 100
    && new Set(value.map((item) => JSON.stringify(item))).size === value.length
    && value.every(validRelationship);
}

function validUnknowns(impact) {
  const unknowns = impact?.unknowns;
  if (!Array.isArray(unknowns) || unknowns.length > 8) return false;
  if (new Set(unknowns).size !== unknowns.length || !unknowns.every((item) => UNKNOWN_CODES.has(item))) {
    return false;
  }
  if (impact.coverage === "known-public-scope") return unknowns.length === 0;
  if (impact.coverage === "unknown") return unknowns.length > 0 && impact.relationships.length === 0;
  return unknowns.length > 0;
}

export function isValidTwinImpactProjection(document) {
  if (!exactKeys(document, [
    "schema_version",
    "projection_fingerprint",
    "generated_at",
    "subject",
    "impact",
    "analysis",
    "provenance",
    "distribution",
    "privacy",
    "limitations",
  ])) return false;

  const { impact, analysis, provenance, distribution, privacy } = document;
  const classification = provenance?.classification_source;
  const topology = provenance?.topology_source;
  const validImpact = exactKeys(impact, ["conclusion", "scope", "coverage", "relationships", "unknowns"])
    && impact.conclusion === "could-be-affected"
    && impact.scope === "public-only"
    && ["known-public-scope", "partial-public-scope", "unknown"].includes(impact.coverage)
    && validRelationships(impact.relationships)
    && validUnknowns(impact);
  const validAnalysis = exactKeys(analysis, [
    "mode",
    "passport_schema_version",
    "passport_request_fingerprint",
    "passport_generated_at",
  ])
    && analysis.mode === "offline-twin-analysis"
    && analysis.passport_schema_version === "atlas-change-passport/v1"
    && /^[0-9a-f]{64}$/.test(analysis.passport_request_fingerprint || "")
    && timestamp(analysis.passport_generated_at);
  const validProvenance = exactKeys(provenance, [
    "producer_id",
    "producer_version",
    "producer_contract",
    "authority_repository",
    "authority_commit",
    "classification_source",
    "topology_source",
    "projection_policy",
  ])
    && provenance.producer_id === "atlas-twin"
    && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(provenance.producer_version || "")
    && provenance.producer_contract === "atlas-change-passport/v1"
    && provenance.authority_repository === "AtlasReaper311/atlas-infra"
    && /^[0-9a-f]{40}$/.test(provenance.authority_commit || "")
    && exactKeys(classification, ["repository", "path", "fingerprint"])
    && classification.repository === "AtlasReaper311/atlas-infra"
    && classification.path === "policy/public-repository-classifications.json"
    && /^sha256:[0-9a-f]{64}$/.test(classification.fingerprint || "")
    && exactKeys(topology, ["repository", "path", "commit"])
    && topology.repository === "AtlasReaper311/atlas-api-public"
    && topology.path === "data/estate.manifest.json"
    && /^[0-9a-f]{40}$/.test(topology.commit || "")
    && provenance.projection_policy === "ADR-0017";
  const validDistribution = exactKeys(distribution, ["mode", "serving_repository", "path", "route"])
    && distribution.mode === "static-public-projection"
    && distribution.serving_repository === "AtlasReaper311/atlas-api-public"
    && distribution.path === "data/twin-impact-projection.json"
    && distribution.route === "/v1/evidence/twin-impact";
  const validPrivacy = exactKeys(privacy, [
    "mode",
    "redaction",
    "public_identities_only",
    "private_data_excluded",
    "unknown_data_not_inferred",
  ])
    && privacy.mode === "public-safe"
    && privacy.redaction === "drop-private-or-unclassified"
    && privacy.public_identities_only === true
    && privacy.private_data_excluded === true
    && privacy.unknown_data_not_inferred === true;
  const limitations = document.limitations;
  const validLimitations = Array.isArray(limitations)
    && limitations.length === LIMITATION_CODES.size
    && new Set(limitations).size === LIMITATION_CODES.size
    && limitations.every((item) => LIMITATION_CODES.has(item));

  return document.schema_version === TWIN_SCHEMA_VERSION
    && /^sha256:[0-9a-f]{64}$/.test(document.projection_fingerprint || "")
    && timestamp(document.generated_at)
    && publicSubject(document.subject)
    && validImpact
    && validAnalysis
    && validProvenance
    && validDistribution
    && validPrivacy
    && validLimitations
    && noForbiddenKeys(document);
}

function appendText(parent, tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = String(value ?? "");
  parent.appendChild(node);
  return node;
}

function setStatus(state, value) {
  const status = byId("twin-impact-status");
  if (!status) return;
  status.dataset.state = state;
  status.textContent = value;
}

function metric(label, value) {
  const item = document.createElement("article");
  item.className = "focus-metric systems-evidence-twin-metric";
  appendText(item, "span", null, label);
  appendText(item, "strong", null, value);
  return item;
}

function coverageLabel(coverage) {
  return {
    "known-public-scope": "Known public scope",
    "partial-public-scope": "Partial public scope",
    unknown: "Unknown public scope",
  }[coverage] ?? "Unknown public scope";
}

function relationLabel(relation) {
  return {
    changed: "Changed relationship",
    "direct-consumer": "Direct consumer",
    "indirect-consumer": "Indirect consumer",
    "declared-service": "Declared service",
  }[relation] ?? relation;
}

function unknownLabel(code) {
  return code.replaceAll("-", " ");
}

function renderRelationships(target, relationships) {
  if (!relationships.length) {
    appendText(target, "p", "systems-change-scope", "No public relationships are present in this projection. This does not prove that private or unclassified entities could not be affected.");
    return;
  }
  for (const relation of RELATION_ORDER) {
    const items = relationships.filter((item) => item.relation === relation);
    if (!items.length) continue;
    const group = document.createElement("section");
    group.className = "systems-evidence-twin-group";
    appendText(group, "h4", null, relationLabel(relation));
    const list = document.createElement("ul");
    list.className = "systems-evidence-twin-list";
    for (const item of items) {
      const row = document.createElement("li");
      appendText(row, "strong", null, item.id);
      appendText(row, "span", "systems-evidence-twin-meta", `${item.kind} · Identity authority: ${item.identity_authority}`);
      list.appendChild(row);
    }
    group.appendChild(list);
    target.appendChild(group);
  }
}

function renderProvenance(target, projection) {
  const details = document.createElement("details");
  details.className = "systems-evidence-disclosure systems-evidence-twin-provenance";
  appendText(details, "summary", null, "Projection provenance and boundary");
  appendText(details, "p", "systems-change-scope", "This is a public Twin projection generated from offline analysis. Generation is not an observation time, and the projection does not establish merge, deployment, runtime, failure, publication, or live state.");
  const facts = document.createElement("dl");
  facts.className = "systems-evidence-twin-facts";
  const entries = [
    ["Projection fingerprint", projection.projection_fingerprint],
    ["Schema", projection.schema_version],
    ["Generated at", `${projection.generated_at} · not an observation time`],
    ["Subject", `${projection.subject.repository ?? "private or unknown"} · ${projection.subject.visibility}`],
    ["Subject base OID", projection.subject.base_oid ?? "not supplied"],
    ["Subject head OID", projection.subject.head_oid ?? "not supplied"],
    ["Producer", `${projection.provenance.producer_id} ${projection.provenance.producer_version}`],
    ["Producer contract", projection.provenance.producer_contract],
    ["Projection policy", projection.provenance.projection_policy],
    ["Infra authority", `${projection.provenance.authority_repository} · ${projection.provenance.authority_commit}`],
    ["Classification authority", `${projection.provenance.classification_source.repository} · ${projection.provenance.classification_source.path} · ${projection.provenance.classification_source.fingerprint}`],
    ["Topology authority", `${projection.provenance.topology_source.repository} · ${projection.provenance.topology_source.path} · ${projection.provenance.topology_source.commit}`],
    ["Serving path", `${projection.distribution.serving_repository} · ${projection.distribution.path} · ${projection.distribution.route}`],
  ];
  for (const [label, value] of entries) {
    const row = document.createElement("div");
    appendText(row, "dt", null, label);
    appendText(row, "dd", null, value);
    facts.appendChild(row);
  }
  details.appendChild(facts);
  appendText(details, "h4", "systems-evidence-twin-limitations-title", "Contract limitations");
  const limitations = document.createElement("ul");
  limitations.className = "systems-evidence-twin-limitations";
  for (const limitation of projection.limitations) appendText(limitations, "li", null, limitation);
  details.appendChild(limitations);
  const link = document.createElement("a");
  link.className = "systems-change-source";
  link.href = TWIN_IMPACT_ENDPOINT;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Open public Twin projection source";
  details.appendChild(link);
  target.appendChild(details);
}

function hideNoJsFallback() {
  const fallback = byId("twin-impact-fallback");
  if (fallback) fallback.hidden = true;
}

export function renderTwinImpactProjection(projection) {
  const target = byId("twin-impact-content");
  if (!target || !isValidTwinImpactProjection(projection)) return false;
  target.replaceChildren();
  const summary = document.createElement("div");
  summary.className = "focus-grid cols-3 systems-evidence-twin-summary";
  summary.append(
    metric("Twin conclusion", "could be affected"),
    metric("Coverage", `${coverageLabel(projection.impact.coverage)} · not complete-estate coverage`),
    metric("Relationships", `${projection.impact.relationships.length} public relationship${projection.impact.relationships.length === 1 ? "" : "s"}`),
  );
  target.appendChild(summary);

  const subject = document.createElement("p");
  subject.className = "systems-change-scope systems-evidence-twin-subject";
  subject.textContent = `Projection subject: ${projection.subject.repository ?? "private or unknown"} (${projection.subject.visibility}). Twin context says which public identities could be affected; it does not say what was observed live.`;
  target.appendChild(subject);

  const relationships = document.createElement("div");
  relationships.className = "systems-evidence-twin-relationships";
  appendText(relationships, "h4", null, "Public relationships Twin says could be affected");
  renderRelationships(relationships, projection.impact.relationships);
  target.appendChild(relationships);

  const unknowns = document.createElement("p");
  unknowns.className = "systems-change-scope systems-evidence-twin-unknowns";
  unknowns.textContent = projection.impact.unknowns.length
    ? `Explicit unknowns: ${projection.impact.unknowns.map(unknownLabel).join(", ")}.`
    : "Explicit unknowns: none recorded in this public projection. Private or unclassified evidence may still be unknown.";
  target.appendChild(unknowns);

  renderProvenance(target, projection);
  hideNoJsFallback();
  setStatus("unknown", `Public Twin projection loaded: ${projection.impact.relationships.length} relationship${projection.impact.relationships.length === 1 ? "" : "s"} could be affected. Impact context only; live evidence is separate.`);
  return true;
}

export function renderTwinImpactUnavailable(reason = "The public projection is unavailable.") {
  const target = byId("twin-impact-content");
  if (target) {
    target.replaceChildren();
    appendText(target, "p", "systems-change-scope", `${reason} Twin impact remains UNKNOWN / NOT OBSERVED. No relationship or failure is inferred.`);
  }
  setStatus("unknown", `${reason} Twin impact is UNKNOWN / NOT OBSERVED, not FAILED.`);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const setTimer = typeof window !== "undefined" ? window.setTimeout : setTimeout;
  const clearTimer = typeof window !== "undefined" ? window.clearTimeout : clearTimeout;
  const timeout = setTimer(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimer(timeout);
  }
}

export async function loadTwinImpact() {
  try {
    const projection = await fetchJson(TWIN_IMPACT_ENDPOINT);
    if (!renderTwinImpactProjection(projection)) {
      renderTwinImpactUnavailable("The public projection did not match the accepted v1 contract.");
    }
    return projection;
  } catch {
    renderTwinImpactUnavailable("The public Twin projection could not be reached.");
    return null;
  }
}

if (typeof document !== "undefined" && typeof window !== "undefined") loadTwinImpact();
