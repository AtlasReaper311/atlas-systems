import { DELIVERY_STAGES, RESULT, STATIC_PUBLIC_SITE_PROFILE } from "./change-chain.js";
import { attachLibrarySpecimen } from "./library-profile.js";
import { lifecycleProfileLabel } from "./lifecycle-profile.js";
import { RUNTIME_WORKER_PROFILE } from "./service-profile.js";

export const ESTATE_TOPOLOGY_URL = "https://api.atlas-systems.uk/v1/topology";
export const ESTATE_SCHEMA = "atlas-public-topology/v3";
export const EVIDENCE_VIEWS = Object.freeze(["change", "service", "estate"]);
export const DEFAULT_EVIDENCE_VIEW = "change";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const KNOWN_RESULTS = new Set(Object.values(RESULT));

export const LIBRARY_TOOLKIT_PROFILE = Object.freeze({
  id: "library-toolkit",
  authority: "ADR-0014",
  subjectType: "non-runtime library, kit, or template",
  notApplicableStages: Object.freeze(["RUNTIME VERIFIED", "LIVE VERIFIED"]),
});

export const DOCUMENTATION_POLICY_PROFILE = Object.freeze({
  id: "documentation-policy",
  authority: "ADR-0014",
  subjectType: "documentation or policy source",
  notApplicableStages: Object.freeze(["RUNTIME VERIFIED"]),
});

export const UNKNOWN_SUBJECT_PROFILE = Object.freeze({
  id: "unknown-subject",
  authority: "ADR-0014",
  subjectType: "unmapped public subject",
  notApplicableStages: Object.freeze([]),
});

export const ESTATE_PROFILE_ORDER = Object.freeze([
  "runtime-worker",
  "static-public-site",
  "library-toolkit",
  "documentation-policy",
  "unknown-subject",
]);

export const ESTATE_PROFILE_LABELS = Object.freeze({
  "runtime-worker": lifecycleProfileLabel("runtime-worker"),
  "static-public-site": lifecycleProfileLabel("static-public-site"),
  "library-toolkit": lifecycleProfileLabel("library-toolkit"),
  "documentation-policy": lifecycleProfileLabel("documentation-policy"),
  "unknown-subject": lifecycleProfileLabel("unknown-subject"),
});

export function estateProfileGroups(subjects = []) {
  const counts = new Map();
  for (const subject of subjects) {
    const id = subject?.profile?.id ? String(subject.profile.id) : "unknown-subject";
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const known = ESTATE_PROFILE_ORDER.filter((id) => counts.has(id));
  const extra = [...counts.keys()].filter((id) => !ESTATE_PROFILE_ORDER.includes(id)).sort();
  return Object.freeze([...known, ...extra].map((id) => Object.freeze({
    id,
    label: ESTATE_PROFILE_LABELS[id] ?? id,
    count: counts.get(id),
  })));
}

const STATIC_SITE_IDS = new Set(["atlas-systems", "status", "atlas-doc-viewer"]);
const DOCUMENTATION_REPOS = new Set(["atlas-infra", ".github", "AtlasReaper311"]);

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function timestampMs(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

export function classificationEvidenceMode(result, observedAt, nowMs = Date.now()) {
  if (result === RESULT.NOT_APPLICABLE) return "not-applicable-unscored";
  if (result === RESULT.UNKNOWN_NOT_OBSERVED) return "unknown";
  if (result === RESULT.FAILED) return "unavailable";
  const parsed = timestampMs(observedAt);
  if (parsed === null) return "measured";
  return nowMs - parsed > STALE_AFTER_MS ? "stale-measured" : "measured";
}

export function parseEvidenceView(locationLike = {}) {
  const searchValue = locationLike.search ?? "";
  const search = new URLSearchParams(
    String(searchValue).startsWith("?") ? String(searchValue).slice(1) : String(searchValue),
  );
  const fromQuery = String(search.get("view") ?? "").trim().toLowerCase();
  if (EVIDENCE_VIEWS.includes(fromQuery)) return fromQuery;
  const hash = String(locationLike.hash ?? "").replace(/^#/, "").trim().toLowerCase();
  const fromHash = hash.replace(/^view-/, "");
  if (EVIDENCE_VIEWS.includes(fromHash)) return fromHash;
  return DEFAULT_EVIDENCE_VIEW;
}

export function evidenceViewHref(view, pathname = "/systems/evidence/") {
  const name = EVIDENCE_VIEWS.includes(view) ? view : DEFAULT_EVIDENCE_VIEW;
  return `${pathname}?view=${name}#view-${name}`;
}

function repositoryName(component) {
  const explicit = component?.repo_name;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const repo = component?.repo;
  if (typeof repo !== "string") return null;
  const match = repo.match(/^https:\/\/github\.com\/AtlasReaper311\/([^/?#]+)$/i);
  return match ? match[1] : null;
}

function publicHttpsSurface(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function chooseEstateProfile(component) {
  const record = asRecord(component);
  const kind = String(record.kind ?? "").trim().toLowerCase();
  const id = String(record.id ?? "").trim();
  const repoName = repositoryName(record);
  const runtime = record.runtime_service;

  if (kind === "site" || STATIC_SITE_IDS.has(id) || STATIC_SITE_IDS.has(repoName ?? "")) {
    return Object.freeze({
      ...STATIC_PUBLIC_SITE_PROFILE,
      chosenFrom: "topology kind site / ADR-0014 static public site",
    });
  }

  if (kind === "worker" || (runtime === true && kind !== "site")) {
    return Object.freeze({
      ...RUNTIME_WORKER_PROFILE,
      chosenFrom: kind === "worker"
        ? "topology kind worker / ADR-0014 runtime worker"
        : "classified runtime_service without site kind / ADR-0014 runtime worker",
    });
  }

  if (kind === "github-actions" || DOCUMENTATION_REPOS.has(repoName ?? "")) {
    return Object.freeze({
      ...DOCUMENTATION_POLICY_PROFILE,
      chosenFrom: kind === "github-actions"
        ? "topology kind github-actions / ADR-0014 documentation or policy"
        : "classified documentation or policy repository / ADR-0014",
    });
  }

  if (kind === "tool" || kind === "repository" || record.source_only === true || runtime === false) {
    return Object.freeze({
      ...LIBRARY_TOOLKIT_PROFILE,
      chosenFrom: "non-runtime public subject / ADR-0014 library or toolkit",
    });
  }

  return Object.freeze({
    ...UNKNOWN_SUBJECT_PROFILE,
    chosenFrom: "no ADR-0014 profile could be chosen from the public topology fields",
  });
}

function notApplicableStages(profile, component) {
  const stages = new Set(profile.notApplicableStages ?? []);
  if (profile.id === "documentation-policy" && !publicHttpsSurface(component?.public_surface)) {
    stages.add("LIVE VERIFIED");
  }
  if (profile.id === "library-toolkit") {
    stages.add("RUNTIME VERIFIED");
    stages.add("LIVE VERIFIED");
  }
  return DELIVERY_STAGES.filter((stage) => stages.has(stage));
}

function missingDeliveryGap(stage, profile) {
  if (stage === "DEPLOYMENT OBSERVED" && profile.id === "library-toolkit") {
    return "No public release-event contract was observed for this subject. Topology membership is not a release. If no release contract exists, a later authorised profile decision may mark this stage NOT APPLICABLE rather than infer success.";
  }
  if (stage === "DEPLOYED" && profile.id === "library-toolkit") {
    return "No public released-identity contract was observed. A declared repository or toolkit listing is not DEPLOYED.";
  }
  if ((stage === "DEPLOYMENT OBSERVED" || stage === "DEPLOYED") && profile.id === "documentation-policy") {
    return "No public PUBLISHED/PROJECTED event contract was observed for this subject. Merged documentation is MERGED only when a named change proves it. Topology classification is not that stage.";
  }
  return `${stage} evidence is missing. Public topology and classification are not a delivery chain. Missing later evidence remains UNKNOWN / NOT OBSERVED and is not inferred from kind, lifecycle, or runtime_service.`;
}

function projectStage(stage, profile, component) {
  if (notApplicableStages(profile, component).includes(stage)) {
    return Object.freeze({
      stage,
      result: RESULT.NOT_APPLICABLE,
      evidenceMode: classificationEvidenceMode(RESULT.NOT_APPLICABLE),
      gap: null,
      scope: `${stage} cannot apply to a ${profile.subjectType}. ${profile.authority} marks this stage NOT APPLICABLE.`,
    });
  }
  return Object.freeze({
    stage,
    result: RESULT.UNKNOWN_NOT_OBSERVED,
    evidenceMode: classificationEvidenceMode(RESULT.UNKNOWN_NOT_OBSERVED),
    gap: missingDeliveryGap(stage, profile),
    scope: "No public estate-wide delivery snapshot names a proven ADR-0013 stage for this subject. Classification lifecycle is not a delivery stage.",
  });
}

export function latestProvenStage(stages) {
  let latest = null;
  for (const stage of stages) {
    if (stage.result === RESULT.OBSERVED || stage.result === RESULT.FAILED) latest = stage;
  }
  return latest;
}

export function nextApplicableMissing(stages) {
  return stages.find((stage) => stage.result === RESULT.UNKNOWN_NOT_OBSERVED) ?? null;
}

function classificationObservation(component, generatedAt, nowMs) {
  const id = String(component?.id ?? "").trim();
  if (!id) {
    return Object.freeze({
      result: RESULT.UNKNOWN_NOT_OBSERVED,
      evidenceMode: classificationEvidenceMode(RESULT.UNKNOWN_NOT_OBSERVED),
      lifecycle: null,
      scope: null,
      provenance: null,
      runtimeService: null,
      gap: "The topology row did not name a subject. Missing identity remains UNKNOWN / NOT OBSERVED.",
    });
  }
  const result = RESULT.OBSERVED;
  return Object.freeze({
    result,
    evidenceMode: classificationEvidenceMode(result, generatedAt, nowMs),
    lifecycle: component.lifecycle ? String(component.lifecycle) : "not supplied",
    scope: component.scope ? String(component.scope) : "not supplied",
    provenance: component.provenance ? String(component.provenance) : "not supplied",
    runtimeService: typeof component.runtime_service === "boolean"
      ? component.runtime_service
      : null,
    gap: "Classification lifecycle, scope, provenance, and runtime_service are Atlas Infra projection fields via public topology. They are not DEPLOYMENT OBSERVED, DEPLOYED, RUNTIME VERIFIED, LIVE VERIFIED, or an estate health badge.",
  });
}

export function projectEstateSubject(component, context = {}, nowMs = Date.now()) {
  const record = asRecord(component);
  const profile = chooseEstateProfile(record);
  const stages = Object.freeze(
    DELIVERY_STAGES.map((stage) => projectStage(stage, profile, record)),
  );
  const generatedAt = context.generatedAt ? String(context.generatedAt) : null;
  const classification = classificationObservation(record, generatedAt, nowMs);
  const proven = latestProvenStage(stages);
  const nextMissing = nextApplicableMissing(stages);
  const repoName = repositoryName(record);
  const projected = Object.freeze({
    id: record.id ? String(record.id) : "unknown-subject",
    repository: repoName ? `AtlasReaper311/${repoName}` : null,
    repositoryUrl: typeof record.repo === "string" ? record.repo : null,
    kind: record.kind ? String(record.kind) : "unknown",
    layer: record.layer ? String(record.layer) : "unknown",
    sourceOnly: record.source_only === true,
    publicSurface: publicHttpsSurface(record.public_surface),
    profile: Object.freeze({
      id: profile.id,
      authority: profile.authority,
      subjectType: profile.subjectType,
      chosenFrom: profile.chosenFrom,
      label: lifecycleProfileLabel(profile.id),
    }),
    classification,
    stages,
    latestProvenStage: proven?.stage ?? null,
    latestProvenResult: proven?.result ?? RESULT.UNKNOWN_NOT_OBSERVED,
    nextApplicableMissing: nextMissing?.stage ?? null,
    notApplicableStages: Object.freeze(notApplicableStages(profile, record)),
    observedAt: generatedAt,
    sourceUrl: context.sourceUrl ?? ESTATE_TOPOLOGY_URL,
  });
  return attachLibrarySpecimen(projected);
}

function extraGaps() {
  return Object.freeze([
    Object.freeze({
      label: "Estate-wide delivery snapshot",
      result: RESULT.UNKNOWN_NOT_OBSERVED,
      scope: "atlas-infra reports/estate-snapshot.json is generated evidence and is not published on current atlas-infra main, and atlas-api-public exposes no estate-snapshot contract. Missing aggregate delivery evidence remains UNKNOWN / NOT OBSERVED.",
    }),
    Object.freeze({
      label: "Estate health score",
      result: RESULT.NOT_APPLICABLE,
      scope: "An estate-wide green badge, percentage-complete score, or inferred success from partial topology is forbidden. Classification is not live proof.",
    }),
    Object.freeze({
      label: "Estate component probes",
      result: RESULT.NOT_APPLICABLE,
      scope: "/v1/stats probes other public components. Those verdicts are not this Estate View and must not become a fleet health badge.",
    }),
  ]);
}

export function compactEstateReading(subjects, extra = extraGaps(), options = {}) {
  const fetchFailed = options.fetchFailed === true;
  const malformed = options.malformed === true;
  let rosterResult = RESULT.UNKNOWN_NOT_OBSERVED;
  let rosterScope = "No usable public topology subjects were observed.";
  if (fetchFailed) {
    rosterResult = RESULT.FAILED;
    rosterScope = "GET /v1/topology was contacted and did not return a usable roster. FAILED is distinct from UNKNOWN / NOT OBSERVED. A failed roster is not an estate health badge.";
  } else if (subjects.length) {
    rosterResult = RESULT.OBSERVED;
    rosterScope = `${subjects.length} public subject${subjects.length === 1 ? "" : "s"} rendered from GET /v1/topology. Roster size is not a health score.`;
  } else if (malformed) {
    rosterScope = "The public topology payload was not atlas-public-topology/v3. Unusable schema remains UNKNOWN / NOT OBSERVED and is not a healthy fleet.";
  }
  const lines = [
    Object.freeze({
      label: "Public topology roster",
      result: rosterResult,
      kind: "identity",
      scope: rosterScope,
    }),
    Object.freeze({
      label: "Proven ADR-0013 delivery stage",
      result: RESULT.UNKNOWN_NOT_OBSERVED,
      kind: "later",
      scope: "Topology, registry membership, and classification lifecycle do not prove SOURCE, CHECKED, MERGED, deployment, runtime, or live verification for the fleet.",
    }),
  ];
  for (const gap of extra) {
    const record = asRecord(gap);
    if (!record.label) continue;
    const result = KNOWN_RESULTS.has(String(record.result ?? "").trim())
      ? String(record.result).trim()
      : RESULT.UNKNOWN_NOT_OBSERVED;
    lines.push(Object.freeze({
      label: String(record.label),
      result,
      kind: "gap",
      scope: record.scope ? String(record.scope) : null,
    }));
  }
  return Object.freeze({ lines: Object.freeze(lines) });
}

export function projectEstateView(record, nowMs = Date.now()) {
  const payload = asRecord(record);
  const fetchFailed = payload.fetchFailed === true;
  const generatedAt = payload.generated_at ? String(payload.generated_at) : null;
  const authority = payload.classification_authority
    ? String(payload.classification_authority)
    : null;
  const fingerprint = payload.classification_fingerprint
    ? String(payload.classification_fingerprint)
    : null;
  const schema = payload.schema ? String(payload.schema) : null;
  const usableSchema = schema === ESTATE_SCHEMA;
  const components = usableSchema && !fetchFailed ? asArray(payload.components) : [];
  const subjects = Object.freeze(
    components
      .map((component) => projectEstateSubject(component, {
        generatedAt,
        sourceUrl: ESTATE_TOPOLOGY_URL,
      }, nowMs))
      .filter((subject) => subject.id !== "unknown-subject"),
  );
  const gaps = extraGaps();
  const malformed = !fetchFailed && !usableSchema;
  return Object.freeze({
    schema: "atlas-systems/estate-overview-projection/v1",
    classification: fetchFailed ? "unavailable" : "live-public-projection",
    liveFeed: true,
    fetchFailed,
    malformed,
    topologySchema: schema,
    classificationAuthority: authority,
    classificationFingerprint: fingerprint,
    generatedAt,
    subjectCount: subjects.length,
    subjects,
    reading: compactEstateReading(subjects, gaps, { fetchFailed, malformed }),
    extraGaps: gaps,
    recordedFrom: Object.freeze([ESTATE_TOPOLOGY_URL]),
  });
}

export function estateViewStatus(projection) {
  if (projection.fetchFailed) return "failure";
  const failed = projection.subjects.some((subject) => (
    subject.classification.result === RESULT.FAILED
    || subject.stages.some((stage) => stage.result === RESULT.FAILED)
    || subject.latestProvenResult === RESULT.FAILED
  )) || projection.reading.lines.some((line) => line.result === RESULT.FAILED);
  if (failed) return "failure";
  // Topology without a public delivery snapshot is never an estate-healthy badge.
  return "warning";
}

export function topologyRecordFromSettled(settled) {
  if (!settled || typeof settled !== "object") {
    return Object.freeze({ fetchFailed: true, schema: null, components: [] });
  }
  if (settled.status === "rejected") {
    return Object.freeze({ fetchFailed: true, schema: null, components: [] });
  }
  return asRecord(settled.value);
}
