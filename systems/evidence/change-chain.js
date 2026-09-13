export const DELIVERY_STAGES = Object.freeze([
  "SOURCE",
  "CHECKED",
  "MERGED",
  "DEPLOYMENT OBSERVED",
  "DEPLOYED",
  "RUNTIME VERIFIED",
  "LIVE VERIFIED",
]);

export const RESULT = Object.freeze({
  OBSERVED: "OBSERVED",
  FAILED: "FAILED",
  UNKNOWN_NOT_OBSERVED: "UNKNOWN / NOT OBSERVED",
  NOT_APPLICABLE: "NOT APPLICABLE",
});

export const STATIC_PUBLIC_SITE_PROFILE = Object.freeze({
  id: "static-public-site",
  authority: "ADR-0014",
  subjectType: "Cloudflare Pages static public surface",
  notApplicableStages: Object.freeze(["RUNTIME VERIFIED"]),
});

const KNOWN_RESULTS = new Set(Object.values(RESULT));

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stageObservation(observations, stage) {
  const value = observations[stage];
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function normalizeResult(value) {
  const result = String(value ?? "").trim();
  return KNOWN_RESULTS.has(result) ? result : RESULT.UNKNOWN_NOT_OBSERVED;
}

export function evidenceModeForResult(result) {
  if (result === RESULT.NOT_APPLICABLE) return "not-applicable-unscored";
  if (result === RESULT.UNKNOWN_NOT_OBSERVED) return "unknown";
  if (result === RESULT.FAILED) return "unavailable";
  return "recorded-replay";
}

export function statusStateForResult(result) {
  if (result === RESULT.FAILED) return "failure";
  if (result === RESULT.UNKNOWN_NOT_OBSERVED) return "unknown";
  if (result === RESULT.NOT_APPLICABLE) return "unknown";
  return "healthy";
}

function stageLabel(stage) {
  return String(stage?.stage ?? stage?.fact ?? "later lifecycle stage");
}

export function enforceLifecycleChronology(stages, { startAt = null } = {}) {
  const startIndex = startAt === null
    ? 0
    : stages.findIndex((stage) => stageLabel(stage) === startAt);
  let blocker = null;

  return Object.freeze(stages.map((stage, index) => {
    if (startIndex < 0 || index < startIndex) return stage;
    if (stage.result === RESULT.NOT_APPLICABLE) return stage;

    if (blocker && stage.result === RESULT.OBSERVED) {
      const label = stageLabel(stage);
      const supportingObservation = Object.freeze({
        result: stage.result,
        identifier: stage.identifier ?? null,
        provenance: stage.provenance ?? null,
        observedAt: stage.observedAt ?? null,
        sourceUrl: stage.sourceUrl ?? null,
        scope: stage.scope ?? null,
      });
      return Object.freeze({
        ...stage,
        result: RESULT.UNKNOWN_NOT_OBSERVED,
        evidenceMode: "unknown",
        statusState: "unknown",
        gap: `${label} was observed, but ${blocker.stage} is ${blocker.result}. The later record is supporting evidence only and does not advance the lifecycle.`,
        scope: `Supporting observation retained: ${stage.scope ?? `${label} returned an observation.`} It is not promoted because ${blocker.stage} is ${blocker.result}.`,
        supportingObservation,
      });
    }

    if (!blocker && [RESULT.UNKNOWN_NOT_OBSERVED, RESULT.FAILED].includes(stage.result)) {
      blocker = Object.freeze({ stage: stageLabel(stage), result: stage.result });
    }
    return stage;
  }));
}

function missingGap(stage) {
  return `${stage} evidence is missing. Missing later evidence remains UNKNOWN / NOT OBSERVED and is not inferred from earlier stages.`;
}

function projectStage(stage, observation, profile) {
  if (profile.notApplicableStages.includes(stage)) {
    return Object.freeze({
      stage,
      result: RESULT.NOT_APPLICABLE,
      evidenceMode: evidenceModeForResult(RESULT.NOT_APPLICABLE),
      statusState: statusStateForResult(RESULT.NOT_APPLICABLE),
      identifier: null,
      provenance: `${profile.authority} ${profile.id} profile`,
      observedAt: null,
      sourceUrl: null,
      scope: `${stage} cannot apply to a ${profile.subjectType}. ${profile.authority} marks this stage NOT APPLICABLE. Production browser checks, when present, belong to LIVE VERIFIED.`,
      gap: null,
    });
  }

  const result = observation ? normalizeResult(observation.result) : RESULT.UNKNOWN_NOT_OBSERVED;
  const observed = result === RESULT.OBSERVED || result === RESULT.FAILED;
  return Object.freeze({
    stage,
    result,
    evidenceMode: evidenceModeForResult(result),
    statusState: statusStateForResult(result),
    identifier: observation?.identifier ? String(observation.identifier) : null,
    provenance: observation?.provenance ? String(observation.provenance) : null,
    observedAt: observation?.observedAt ? String(observation.observedAt) : null,
    sourceUrl: observation?.sourceUrl ? String(observation.sourceUrl) : null,
    scope: observed && observation?.scope
      ? String(observation.scope)
      : (observation?.scope ? String(observation.scope) : null),
    gap: result === RESULT.UNKNOWN_NOT_OBSERVED
      ? String(observation?.gap ?? missingGap(stage))
      : (observation?.gap ? String(observation.gap) : null),
  });
}

function projectReview(review) {
  const record = asRecord(review);
  const existed = record.existed === true;
  if (!existed) {
    return Object.freeze({
      existed: false,
      approved: false,
      githubReviewState: "UNKNOWN / NOT OBSERVED",
      identifier: null,
      observedAt: null,
      scope: "No review evidence is present in this record. Missing review is not a successful review, merge, or live proof.",
    });
  }
  return Object.freeze({
    existed: true,
    approved: record.approved === true,
    githubReviewState: String(record.githubReviewState ?? "COMMENTED"),
    identifier: record.identifier ? String(record.identifier) : null,
    observedAt: record.observedAt ? String(record.observedAt) : null,
    scope: String(record.scope ?? "Review evidence existed. Review is not merge, deployment, or live proof."),
  });
}

function stageByName(stages, name) {
  return stages.find((stage) => stage.stage === name) ?? null;
}

export function latestObservedStage(stages) {
  let latest = null;
  for (const stage of stages) {
    if (stage.result === RESULT.OBSERVED) latest = stage.stage;
  }
  return latest;
}

export function compactReading(stages, extraGaps = []) {
  const provenStage = latestObservedStage(stages);
  const deployment = stageByName(stages, "DEPLOYMENT OBSERVED");
  const deployed = stageByName(stages, "DEPLOYED");
  const runtime = stageByName(stages, "RUNTIME VERIFIED");
  const live = stageByName(stages, "LIVE VERIFIED");
  const lines = [
    Object.freeze({
      label: provenStage ?? "No observed delivery stage",
      result: provenStage ? RESULT.OBSERVED : RESULT.UNKNOWN_NOT_OBSERVED,
      kind: "proven",
    }),
    Object.freeze({
      label: "Deployment",
      result: deployment?.result ?? RESULT.UNKNOWN_NOT_OBSERVED,
      kind: "later",
    }),
  ];
  if (deployment?.result === RESULT.OBSERVED) {
    lines.push(Object.freeze({
      label: "Deployed identity",
      result: deployed?.result ?? RESULT.UNKNOWN_NOT_OBSERVED,
      kind: "later",
    }));
  }
  lines.push(
    Object.freeze({
      label: "Runtime verification",
      result: runtime?.result ?? RESULT.UNKNOWN_NOT_OBSERVED,
      kind: "later",
    }),
    Object.freeze({
      label: "Live verification",
      result: live?.result ?? RESULT.UNKNOWN_NOT_OBSERVED,
      kind: "later",
    }),
  );
  for (const gap of extraGaps) {
    const record = asRecord(gap);
    if (!record.label) continue;
    lines.push(Object.freeze({
      label: String(record.label),
      result: normalizeResult(record.result),
      kind: "gap",
      scope: record.scope ? String(record.scope) : null,
    }));
  }
  return Object.freeze({
    provenStage,
    lines: Object.freeze(lines.filter((line) => (
      line.kind === "proven"
      || line.kind === "gap"
      || line.result !== RESULT.OBSERVED
    ))),
  });
}

export function nextApplicableGap(stages, extraGaps = []) {
  const nextStage = stages.find((stage) => stage.result === RESULT.UNKNOWN_NOT_OBSERVED);
  if (nextStage) {
    return Object.freeze({
      label: nextStage.stage,
      result: nextStage.result,
      scope: nextStage.gap ? String(nextStage.gap) : null,
    });
  }
  for (const gap of extraGaps) {
    const record = asRecord(gap);
    if (!record.label) continue;
    if (normalizeResult(record.result) !== RESULT.UNKNOWN_NOT_OBSERVED) continue;
    return Object.freeze({
      label: String(record.label),
      result: RESULT.UNKNOWN_NOT_OBSERVED,
      scope: record.scope ? String(record.scope) : null,
    });
  }
  return null;
}

export function projectChangeChain(record, profile = STATIC_PUBLIC_SITE_PROFILE) {
  const payload = asRecord(record);
  const observations = asRecord(payload.observations);
  const extraGaps = Array.isArray(payload.extraGaps) ? payload.extraGaps : [];
  const stages = enforceLifecycleChronology(
    DELIVERY_STAGES.map((stage) => projectStage(stage, stageObservation(observations, stage), profile)),
  );
  return Object.freeze({
    schema: "atlas-systems/change-lifecycle-projection/v1",
    classification: String(payload.classification ?? "recorded-public-projection"),
    liveFeed: false,
    profile: Object.freeze({
      id: profile.id,
      authority: profile.authority,
      subjectType: profile.subjectType,
    }),
    subject: Object.freeze({ ...asRecord(payload.subject) }),
    recordedAt: payload.recordedAt ? String(payload.recordedAt) : null,
    recordedFrom: Object.freeze(
      Array.isArray(payload.recordedFrom) ? payload.recordedFrom.map((item) => String(item)) : [],
    ),
    stages,
    review: projectReview(payload.review),
    reading: compactReading(stages, extraGaps),
    nextGap: nextApplicableGap(stages, extraGaps),
    extraGaps: Object.freeze(extraGaps.map((gap) => Object.freeze({ ...asRecord(gap) }))),
  });
}
