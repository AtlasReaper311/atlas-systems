import { RESULT } from "./change-chain.js";
import { SERVICE_SPECIMEN } from "./service-specimen.js";

export const SERVICE_FACTS = Object.freeze([
  "OWNERSHIP",
  "EXPECTED CONTRACT",
  "DEPLOYMENT OBSERVED",
  "DEPLOYED",
  "RUNTIME VERIFIED",
  "LIVE VERIFIED",
]);

export const RUNTIME_WORKER_PROFILE = Object.freeze({
  id: "runtime-worker",
  authority: "ADR-0014",
  subjectType: "Cloudflare Worker runtime service",
  notApplicableFacts: Object.freeze([]),
});

const KNOWN_RESULTS = new Set(Object.values(RESULT));
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeResult(value) {
  const result = String(value ?? "").trim();
  return KNOWN_RESULTS.has(result) ? result : RESULT.UNKNOWN_NOT_OBSERVED;
}

function timestampMs(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

export function serviceEvidenceMode(result, observedAt, nowMs = Date.now()) {
  if (result === RESULT.NOT_APPLICABLE) return "not-applicable-unscored";
  if (result === RESULT.UNKNOWN_NOT_OBSERVED) return "unknown";
  if (result === RESULT.FAILED) return "unavailable";
  const parsed = timestampMs(observedAt);
  if (parsed === null) return "measured";
  return nowMs - parsed > STALE_AFTER_MS ? "stale-measured" : "measured";
}

export function serviceStatusState(result) {
  if (result === RESULT.FAILED) return "failure";
  if (result === RESULT.UNKNOWN_NOT_OBSERVED || result === RESULT.NOT_APPLICABLE) return "unknown";
  return "healthy";
}

function missingGap(fact) {
  return `${fact} evidence is missing. Missing later evidence remains UNKNOWN / NOT OBSERVED and is not inferred from earlier facts.`;
}

function factObservation(observations, fact) {
  const value = observations[fact];
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function projectFact(fact, observation, profile, nowMs) {
  if (profile.notApplicableFacts.includes(fact)) {
    return Object.freeze({
      fact,
      result: RESULT.NOT_APPLICABLE,
      evidenceMode: serviceEvidenceMode(RESULT.NOT_APPLICABLE),
      statusState: serviceStatusState(RESULT.NOT_APPLICABLE),
      identifier: null,
      provenance: `${profile.authority} ${profile.id} profile`,
      observedAt: null,
      sourceUrl: null,
      scope: `${fact} cannot apply to a ${profile.subjectType}. ${profile.authority} marks this fact NOT APPLICABLE.`,
      gap: null,
    });
  }

  const result = observation ? normalizeResult(observation.result) : RESULT.UNKNOWN_NOT_OBSERVED;
  const observed = result === RESULT.OBSERVED || result === RESULT.FAILED;
  return Object.freeze({
    fact,
    result,
    evidenceMode: serviceEvidenceMode(result, observation?.observedAt, nowMs),
    statusState: serviceStatusState(result),
    identifier: observation?.identifier ? String(observation.identifier) : null,
    provenance: observation?.provenance ? String(observation.provenance) : null,
    observedAt: observation?.observedAt ? String(observation.observedAt) : null,
    sourceUrl: observation?.sourceUrl ? String(observation.sourceUrl) : null,
    scope: observed && observation?.scope
      ? String(observation.scope)
      : (observation?.scope ? String(observation.scope) : null),
    gap: result === RESULT.UNKNOWN_NOT_OBSERVED
      ? String(observation?.gap ?? missingGap(fact))
      : (observation?.gap ? String(observation.gap) : null),
  });
}

function factByName(facts, name) {
  return facts.find((item) => item.fact === name) ?? null;
}

export function compactServiceReading(facts, extraGaps = []) {
  const ownership = factByName(facts, "OWNERSHIP");
  const contract = factByName(facts, "EXPECTED CONTRACT");
  const deployment = factByName(facts, "DEPLOYMENT OBSERVED");
  const deployed = factByName(facts, "DEPLOYED");
  const runtime = factByName(facts, "RUNTIME VERIFIED");
  const live = factByName(facts, "LIVE VERIFIED");
  const lines = [
    Object.freeze({
      label: "Owner / classification",
      result: ownership?.result ?? RESULT.UNKNOWN_NOT_OBSERVED,
      kind: "identity",
      scope: ownership?.identifier ?? null,
    }),
    Object.freeze({
      label: "Expected contract",
      result: contract?.result ?? RESULT.UNKNOWN_NOT_OBSERVED,
      kind: "identity",
    }),
    Object.freeze({
      label: "Deployment",
      result: deployment?.result ?? RESULT.UNKNOWN_NOT_OBSERVED,
      kind: "later",
    }),
    Object.freeze({
      label: "Expected deployed identity",
      result: deployed?.result ?? RESULT.UNKNOWN_NOT_OBSERVED,
      kind: "later",
    }),
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
  ];
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
  return Object.freeze({ lines: Object.freeze(lines) });
}

function settledValue(settled) {
  if (!settled || typeof settled !== "object") return null;
  if (settled.status === "fulfilled") return settled.value ?? null;
  return null;
}

function settledFailed(settled) {
  return Boolean(settled) && settled.status === "rejected";
}

function topologyComponent(payload, serviceId) {
  const components = asArray(asRecord(payload).components);
  return components.find((item) => String(item?.id ?? "") === serviceId) ?? null;
}

function registryWorker(payload, serviceId) {
  const workers = asArray(asRecord(payload).workers);
  return workers.find((item) => String(item?.name ?? "") === serviceId) ?? null;
}

function failedObservation(sourceUrl, provenance, scope) {
  return Object.freeze({
    result: RESULT.FAILED,
    identifier: null,
    provenance,
    observedAt: null,
    sourceUrl,
    scope,
    gap: "The public source was contacted and did not return a usable record. FAILED is distinct from UNKNOWN / NOT OBSERVED.",
  });
}

function unknownObservation(sourceUrl, provenance, gap, scope = null) {
  return Object.freeze({
    result: RESULT.UNKNOWN_NOT_OBSERVED,
    identifier: null,
    provenance,
    observedAt: null,
    sourceUrl,
    scope,
    gap,
  });
}

export function observationsFromPublicSources(sources, specimen = SERVICE_SPECIMEN, nowMs = Date.now()) {
  const observedAt = new Date(nowMs).toISOString();
  const topologySettled = sources?.topology;
  const registrySettled = sources?.registry;
  const metaSettled = sources?.meta;
  const liveSettled = sources?.live;
  const reliabilitySettled = sources?.reliability;
  const topology = asRecord(settledValue(topologySettled));
  const registry = asRecord(settledValue(registrySettled));
  const meta = asRecord(settledValue(metaSettled));
  const live = asRecord(settledValue(liveSettled));
  const reliability = asRecord(settledValue(reliabilitySettled));
  const component = topologyComponent(topology, specimen.id);
  const worker = registryWorker(registry, specimen.id);
  const extraGaps = [];

  let ownership;
  if (settledFailed(topologySettled)) {
    ownership = failedObservation(
      specimen.endpoints.topology,
      "public GET /v1/topology",
      "Topology fetch failed. Topology is a declared public map, not deployment, runtime, or live proof.",
    );
  } else if (component) {
    const owner = topology.owner ? String(topology.owner) : "not supplied";
    const authority = topology.classification_authority
      ? String(topology.classification_authority)
      : "classification authority unavailable";
    const lifecycle = component.lifecycle ? String(component.lifecycle) : "unknown lifecycle";
    const scope = component.scope ? String(component.scope) : "scope unavailable";
    ownership = Object.freeze({
      result: RESULT.OBSERVED,
      identifier: `${specimen.id} / ${specimen.repository}`,
      provenance: `public /v1/topology; classification authority ${authority}`,
      observedAt: topology.generated_at ? String(topology.generated_at) : observedAt,
      sourceUrl: specimen.endpoints.topology,
      scope: `Owner ${owner}. Declared ${component.kind || "worker"} on layer ${component.layer || "unknown"}, lifecycle ${lifecycle}, scope ${scope}, runtime_service ${String(component.runtime_service)}. Topology and classification are not deployment, runtime, or live proof.`,
    });
  } else {
    ownership = unknownObservation(
      specimen.endpoints.topology,
      "public GET /v1/topology",
      "The public topology response did not include this service. Missing topology membership remains UNKNOWN / NOT OBSERVED.",
    );
  }

  const declaredVersion = meta.version
    ? String(meta.version)
    : (worker?.version ? String(worker.version) : null);
  const endpointCount = asArray(meta.endpoints).length;
  const publicSurface = component?.public_surface ? String(component.public_surface) : specimen.endpoints.live;
  const metaNameMatches = String(meta.name ?? "") === specimen.id;

  let expectedContract;
  if (settledFailed(metaSettled)) {
    expectedContract = failedObservation(
      specimen.endpoints.meta,
      "public GET /v1/_meta",
      "The runtime metadata contract could not be retrieved. A failed metadata fetch is not live proof and is not a deployment.",
    );
  } else if (metaNameMatches && endpointCount > 0) {
    expectedContract = Object.freeze({
      result: RESULT.OBSERVED,
      identifier: `${meta.version ? `declared version ${meta.version}; ` : ""}${endpointCount} declared endpoints; public surface ${publicSurface}`,
      provenance: "public GET /v1/_meta plus topology public_surface",
      observedAt: observedAt,
      sourceUrl: specimen.endpoints.meta,
      scope: "This is the declared public/runtime contract. Declared endpoints and version metadata are not a deployment event, not the expected deployed git identity, and not live proof. The hardcoded _meta status field is ignored.",
    });
  } else {
    expectedContract = unknownObservation(
      specimen.endpoints.meta,
      "public GET /v1/_meta",
      "The metadata document did not name this service with a usable endpoint list. Missing contract evidence remains UNKNOWN / NOT OBSERVED.",
    );
  }

  const deployment = unknownObservation(
    null,
    "no public Worker deployment-event contract",
    "atlas-api-public has no public-safe Worker deploy-watch equivalent. deploy-watch/latest is a Pages deployment receipt and is not this service. Topology, registry, and metadata existence are not a named deployment event.",
    "DEPLOYMENT OBSERVED cannot be inferred from source, registry membership, or a running public hostname.",
  );

  const deployed = unknownObservation(
    specimen.endpoints.meta,
    "no public expected Worker identity contract",
    "No public contract names the expected deployed git or Worker identity for this service. A declared /_meta version is metadata, not DEPLOYED identity. Registry version is the same class of declared metadata.",
    "DEPLOYED is a stronger claim than DEPLOYMENT OBSERVED and is not inferred from a metadata version string.",
  );

  let runtime;
  if (settledFailed(metaSettled)) {
    runtime = failedObservation(
      specimen.endpoints.meta,
      "public GET /v1/_meta",
      "The runtime metadata probe was performed and did not hold. FAILED is distinct from UNKNOWN / NOT OBSERVED. This does not decide live public behaviour.",
    );
  } else if (metaNameMatches) {
    runtime = Object.freeze({
      result: RESULT.OBSERVED,
      identifier: `${specimen.id} answered GET /v1/_meta${declaredVersion ? ` with declared version ${declaredVersion}` : ""}`,
      provenance: "public GET /v1/_meta",
      observedAt,
      sourceUrl: specimen.endpoints.meta,
      scope: "The named Worker answered its /_meta contract from the public API hostname. ADR-0014 treats /_meta as runtime evidence. This does not prove expected deployed identity, a deployment event, or independent public/live behaviour. The _meta status field is ignored even when it says live.",
    });
  } else {
    runtime = unknownObservation(
      specimen.endpoints.meta,
      "public GET /v1/_meta",
      "A metadata document was not observed for this service name. Runtime verification remains UNKNOWN / NOT OBSERVED and is not inferred from topology or live index success.",
    );
  }

  const liveNameMatches = String(live.service ?? "") === specimen.id;
  let liveObservation;
  if (settledFailed(liveSettled)) {
    liveObservation = failedObservation(
      specimen.endpoints.live,
      "public GET /v1",
      "The public index probe was performed and did not hold. FAILED is distinct from UNKNOWN / NOT OBSERVED. This does not decide runtime /_meta verification.",
    );
  } else if (live.ok === true && liveNameMatches) {
    liveObservation = Object.freeze({
      result: RESULT.OBSERVED,
      identifier: `${specimen.id} public index GET /v1`,
      provenance: "public GET /v1",
      observedAt: live.generated_at ? String(live.generated_at) : observedAt,
      sourceUrl: specimen.endpoints.live,
      scope: "The public API index answered for this service at this observation time. That is independent public behaviour, not a deployment, not expected deployed identity, and not whole-estate health. /v1/stats component probes do not include atlas-api-public itself and are not this fact.",
    });
  } else {
    liveObservation = unknownObservation(
      specimen.endpoints.live,
      "public GET /v1",
      "The public index did not identify this service. Live verification remains UNKNOWN / NOT OBSERVED and is not inferred from runtime /_meta, registry membership, or _meta.status.",
    );
  }

  if (declaredVersion) {
    extraGaps.push(Object.freeze({
      label: "Declared metadata version",
      result: RESULT.OBSERVED,
      scope: `${declaredVersion} is declared /_meta or registry metadata. It is not a named deployment event and is not the expected deployed identity.`,
    }));
  }

  if (settledFailed(reliabilitySettled)) {
    extraGaps.push(Object.freeze({
      label: "Independent availability objective",
      result: RESULT.FAILED,
      scope: "The public reliability record for this service could not be retrieved. That failure is not runtime or live proof for the Worker itself.",
    }));
  } else if (String(asRecord(reliability.result).state ?? "") === "unmeasured") {
    extraGaps.push(Object.freeze({
      label: "Independent availability objective",
      result: RESULT.UNKNOWN_NOT_OBSERVED,
      scope: String(
        asArray(asRecord(reliability.result).reasons)[0]
        ?? "This service is explicitly unmeasured. Unmeasured is not healthy and is not runtime or live proof.",
      ),
    }));
  } else if (reliability.result) {
    extraGaps.push(Object.freeze({
      label: "Independent availability objective",
      result: RESULT.UNKNOWN_NOT_OBSERVED,
      scope: "A reliability record existed, but reliability is not ADR-0013 runtime or live proof. This Service View does not promote SLO state into delivery or health of the whole estate.",
    }));
  } else {
    extraGaps.push(Object.freeze({
      label: "Independent availability objective",
      result: RESULT.UNKNOWN_NOT_OBSERVED,
      scope: "No independent owner-approved availability objective was observed for this service. Unmeasured or missing SLO evidence is not runtime success.",
    }));
  }

  extraGaps.push(Object.freeze({
    label: "Estate component probes",
    result: RESULT.NOT_APPLICABLE,
    scope: "/v1/stats probes other public components from this Worker. Those component verdicts are not self-health for atlas-api-public and must not become a green service badge.",
  }));

  return Object.freeze({
    schema: "atlas-systems/runtime-service-record/v1",
    classification: "live-public-projection",
    liveFeed: true,
    profile: specimen.profile,
    subject: Object.freeze({
      id: specimen.id,
      repository: specimen.repository,
    }),
    observedAt,
    recordedFrom: Object.freeze([
      specimen.endpoints.topology,
      specimen.endpoints.registry,
      specimen.endpoints.meta,
      specimen.endpoints.live,
      specimen.endpoints.reliability,
    ]),
    observations: Object.freeze({
      OWNERSHIP: ownership,
      "EXPECTED CONTRACT": expectedContract,
      "DEPLOYMENT OBSERVED": deployment,
      DEPLOYED: deployed,
      "RUNTIME VERIFIED": runtime,
      "LIVE VERIFIED": liveObservation,
    }),
    extraGaps: Object.freeze(extraGaps),
  });
}

export function projectServiceView(record, profile = RUNTIME_WORKER_PROFILE, nowMs = Date.now()) {
  const payload = asRecord(record);
  const observations = asRecord(payload.observations);
  const extraGaps = asArray(payload.extraGaps);
  const facts = Object.freeze(
    SERVICE_FACTS.map((fact) => projectFact(fact, factObservation(observations, fact), profile, nowMs)),
  );
  return Object.freeze({
    schema: "atlas-systems/runtime-service-projection/v1",
    classification: String(payload.classification ?? "live-public-projection"),
    liveFeed: payload.liveFeed !== false,
    profile: Object.freeze({
      id: profile.id,
      authority: profile.authority,
      subjectType: profile.subjectType,
    }),
    subject: Object.freeze({ ...asRecord(payload.subject) }),
    observedAt: payload.observedAt ? String(payload.observedAt) : null,
    recordedFrom: Object.freeze(
      asArray(payload.recordedFrom).map((item) => String(item)),
    ),
    facts,
    reading: compactServiceReading(facts, extraGaps),
    extraGaps: Object.freeze(extraGaps.map((gap) => Object.freeze({ ...asRecord(gap) }))),
  });
}

export function serviceViewStatus(projection) {
  const failed = projection.facts.some((fact) => fact.result === RESULT.FAILED)
    || projection.reading.lines.some((line) => line.result === RESULT.FAILED);
  const unknown = projection.facts.some((fact) => fact.result === RESULT.UNKNOWN_NOT_OBSERVED)
    || projection.reading.lines.some((line) => line.result === RESULT.UNKNOWN_NOT_OBSERVED);
  if (failed) return "failure";
  if (unknown) return "warning";
  return "healthy";
}
