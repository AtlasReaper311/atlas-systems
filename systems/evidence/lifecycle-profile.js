import { DELIVERY_STAGES, RESULT } from "./change-chain.js";

const KNOWN_RESULTS = new Set(Object.values(RESULT));

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeResult(value) {
  const result = String(value ?? "").trim();
  return KNOWN_RESULTS.has(result) ? result : RESULT.UNKNOWN_NOT_OBSERVED;
}

export const LIFECYCLE_PROFILE_PRESENTATION = Object.freeze({
  "static-public-site": Object.freeze({
    id: "static-public-site",
    label: "Static / Public Site",
    authority: "ADR-0014",
    subjectType: "Cloudflare Pages static public surface",
    expectedPath: "SOURCE → CHECKED → MERGED → DEPLOYMENT OBSERVED → DEPLOYED → LIVE VERIFIED",
    expectedSummary: "Static Pages have no Worker runtime probe. RUNTIME VERIFIED is NOT APPLICABLE, not missing evidence.",
    notApplicableStages: Object.freeze(["RUNTIME VERIFIED"]),
  }),
  "runtime-worker": Object.freeze({
    id: "runtime-worker",
    label: "Runtime Worker",
    authority: "ADR-0014",
    subjectType: "Cloudflare Worker runtime service",
    expectedPath: "SOURCE → CHECKED → MERGED → DEPLOYMENT OBSERVED → DEPLOYED → RUNTIME VERIFIED → LIVE VERIFIED",
    expectedSummary: "All seven ADR-0013 stages apply. Runtime or live evidence never fills a missing deployment identity.",
    notApplicableStages: Object.freeze([]),
  }),
  "library-toolkit": Object.freeze({
    id: "library-toolkit",
    label: "Library / Toolkit",
    authority: "ADR-0014",
    subjectType: "non-runtime library, kit, or template",
    expectedPath: "SOURCE → CHECKED → MERGED",
    expectedSummary: "Base evidence path is SOURCE → CHECKED → MERGED. DEPLOYMENT OBSERVED and DEPLOYED apply only when a real release contract exists for this subject. Without that contract they are NOT APPLICABLE, not missing evidence. RUNTIME VERIFIED and LIVE VERIFIED cannot apply.",
    notApplicableStages: Object.freeze([
      "DEPLOYMENT OBSERVED",
      "DEPLOYED",
      "RUNTIME VERIFIED",
      "LIVE VERIFIED",
    ]),
  }),
  "documentation-policy": Object.freeze({
    id: "documentation-policy",
    label: "Documentation / Policy",
    authority: "ADR-0014",
    subjectType: "documentation or policy source",
    expectedPath: "SOURCE → CHECKED → MERGED",
    expectedSummary: "RUNTIME VERIFIED cannot apply. LIVE VERIFIED applies only when a public consumer copy must be independently verified.",
    notApplicableStages: Object.freeze(["RUNTIME VERIFIED"]),
  }),
  "unknown-subject": Object.freeze({
    id: "unknown-subject",
    label: "Unknown subject",
    authority: "ADR-0014",
    subjectType: "unmapped public subject",
    expectedPath: "SOURCE → CHECKED → MERGED → DEPLOYMENT OBSERVED → DEPLOYED → RUNTIME VERIFIED → LIVE VERIFIED",
    expectedSummary: "No ADR-0014 profile could be chosen. Applicable stages stay UNKNOWN / NOT OBSERVED until a profile is proven.",
    notApplicableStages: Object.freeze([]),
  }),
});

const LIBRARY_RELEASE_CONTRACT_PRESENTATION = Object.freeze({
  expectedPath: "SOURCE → CHECKED → MERGED → DEPLOYMENT OBSERVED → DEPLOYED",
  expectedSummary: "This subject ships as source plus an optional GitHub Release artifact, not a runtime service. When a real release contract exists, RELEASED event maps to DEPLOYMENT OBSERVED and RELEASED identity maps to DEPLOYED. RUNTIME VERIFIED and LIVE VERIFIED are NOT APPLICABLE. A GitHub Release is not a running deployment.",
  notApplicableStages: Object.freeze(["RUNTIME VERIFIED", "LIVE VERIFIED"]),
});

export function presentLifecycleProfile(profileId, options = {}) {
  const id = String(profileId ?? "").trim();
  const known = LIFECYCLE_PROFILE_PRESENTATION[id];
  if (known && id === "library-toolkit" && options.releaseContract === true) {
    return Object.freeze({
      ...known,
      ...LIBRARY_RELEASE_CONTRACT_PRESENTATION,
      releaseContract: true,
    });
  }
  if (known) {
    return id === "library-toolkit"
      ? Object.freeze({ ...known, releaseContract: false })
      : known;
  }
  return Object.freeze({
    ...LIFECYCLE_PROFILE_PRESENTATION["unknown-subject"],
    id: id || "unknown-subject",
    chosenFrom: "unrecognised profile id",
  });
}

export function lifecycleProfileLabel(profileId) {
  return presentLifecycleProfile(profileId).label;
}

export function missingLifecycleGap(stage) {
  return `${stage} evidence is missing from the current approved public contracts for this view. Missing later evidence remains UNKNOWN / NOT OBSERVED and is not inferred from later runtime or live observations.`;
}

export function projectLifecycleStages(profileId, observations = {}, options = {}) {
  const presentation = presentLifecycleProfile(profileId, options);
  const records = asRecord(observations);
  return Object.freeze(DELIVERY_STAGES.map((stage) => {
    if (presentation.notApplicableStages.includes(stage)) {
      return Object.freeze({
        stage,
        result: RESULT.NOT_APPLICABLE,
        gap: null,
        scope: `${stage} cannot apply to a ${presentation.subjectType}. ${presentation.authority} marks this stage NOT APPLICABLE, not missing evidence.`,
      });
    }
    const observation = asRecord(records[stage]);
    const hasObservation = Object.keys(observation).length > 0;
    const result = hasObservation
      ? normalizeResult(observation.result)
      : RESULT.UNKNOWN_NOT_OBSERVED;
    return Object.freeze({
      stage,
      result,
      gap: result === RESULT.UNKNOWN_NOT_OBSERVED
        ? String(observation.gap ?? missingLifecycleGap(stage))
        : (observation.gap ? String(observation.gap) : null),
      scope: observation.scope ? String(observation.scope) : null,
    });
  }));
}

export function projectProfileIdentity({
  subject,
  profileId,
  classificationNote = null,
  releaseContract = false,
} = {}) {
  const presentation = presentLifecycleProfile(profileId, { releaseContract });
  return Object.freeze({
    subject: subject ? String(subject) : "Unnamed subject",
    profileId: presentation.id,
    profileLabel: presentation.label,
    authority: presentation.authority,
    subjectType: presentation.subjectType,
    expectedPath: presentation.expectedPath,
    expectedSummary: presentation.expectedSummary,
    classificationNote: classificationNote ? String(classificationNote) : null,
  });
}
