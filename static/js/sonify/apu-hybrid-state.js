import {
  SCORE_STATES,
  canonicalStatus,
  clamp,
  computeVoiceParams,
} from "./mapping.js?v=20260720-system-symphony-loop-production-v2";
import { buildAtlasApuScorePlan } from "./atlas-apu-score-plan.js?v=20260727-apu-critical-headroom-v1";

export const APU_HYBRID_STATE_BUILD_ID = "20260726-system-symphony-evidence-hybrid-v2";
export const APU_HYBRID_STATE_KEYS = Object.freeze(["healthy", "warning", "critical", "unknown"]);
export const APU_EVIDENCE_STATES = Object.freeze([
  "current",
  "reported-unknown",
  "topology-only",
  "stale",
  "simulated",
]);

const STATUS_SCORE = Object.freeze({ healthy: 1, degraded: 0.78, down: 0.2 });

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function round(value, places = 4) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function normalizedWeights(raw) {
  const total = APU_HYBRID_STATE_KEYS.reduce(
    (sum, key) => sum + Math.max(0, finite(raw[key])),
    0,
  );
  if (!(total > 0)) {
    return Object.freeze({ healthy: 0, warning: 0, critical: 0, unknown: 1 });
  }
  const weights = {};
  for (const key of APU_HYBRID_STATE_KEYS) {
    weights[key] = round(Math.max(0, finite(raw[key])) / total);
  }
  const roundedTotal = APU_HYBRID_STATE_KEYS.reduce((sum, key) => sum + weights[key], 0);
  const correction = round(1 - roundedTotal);
  const largest = [...APU_HYBRID_STATE_KEYS].sort((left, right) => weights[right] - weights[left])[0];
  weights[largest] = round(weights[largest] + correction);
  return Object.freeze(weights);
}

export function deriveEstateFromServices(services = []) {
  const rows = Array.isArray(services) ? services : [];
  const known = rows.filter((service) => canonicalStatus(service?.status) !== "unknown");
  const overallHealth = known.length
    ? known.reduce(
      (sum, service) => sum + STATUS_SCORE[canonicalStatus(service?.status)],
      0,
    ) / known.length
    : null;
  return Object.freeze({
    overall_health: overallHealth === null ? null : round(overallHealth, 3),
    active_incidents: known.filter((service) => canonicalStatus(service?.status) === "down").length,
    known_service_ratio: rows.length ? round(known.length / rows.length, 3) : 0,
  });
}

export function evidenceStateForService(service = {}, {
  stale = false,
  preview = false,
  simulated = false,
} = {}) {
  const status = canonicalStatus(service?.status);
  const hasEvidenceSource = typeof service?.evidence_source === "string" && service.evidence_source.length > 0;
  const hasMeasuredAt = typeof service?.measured_at === "string" && service.measured_at.length > 0;
  const telemetryRecord = service?.measured === true;
  const sourceMode = simulated || service?.demoSimulated === true
    ? "demo"
    : preview || String(service?.evidence_source ?? "").startsWith("preview:")
      ? "preview"
      : "live";

  if (simulated || service?.demoSimulated === true) {
    return Object.freeze({ id: "simulated", label: "Simulated profile", measured: false, sourceMode });
  }
  if (stale && telemetryRecord) {
    return Object.freeze({ id: "stale", label: "Stale measurement", measured: true, sourceMode });
  }
  if (!telemetryRecord) {
    return Object.freeze({ id: "topology-only", label: "Topology only", measured: false, sourceMode });
  }
  if (status === "unknown" || !hasEvidenceSource || !hasMeasuredAt) {
    return Object.freeze({ id: "reported-unknown", label: "Reported unknown", measured: false, sourceMode });
  }
  return Object.freeze({
    id: "current",
    label: sourceMode === "preview" ? "Preview fixture" : "Current measurement",
    measured: true,
    sourceMode,
  });
}

function serviceCounts(services = []) {
  const counts = { healthy: 0, warning: 0, critical: 0, unknown: 0 };
  for (const service of services) {
    const status = canonicalStatus(service?.status);
    if (status === "healthy") counts.healthy += 1;
    else if (status === "degraded") counts.warning += 1;
    else if (status === "down") counts.critical += 1;
    else counts.unknown += 1;
  }
  return Object.freeze(counts);
}

function dominantByWeight(weights) {
  const priority = Object.freeze({ healthy: 0, warning: 1, unknown: 2, critical: 3 });
  return [...APU_HYBRID_STATE_KEYS].sort((left, right) => {
    const difference = weights[right] - weights[left];
    return difference || priority[left] - priority[right];
  })[0];
}

function reasonForDominant({ dominant, counts, total, incidents, health, knownRatio, stale }) {
  if (stale) return "Unknown overrides the mix because the telemetry frame is stale.";
  if (dominant === "critical") {
    if (incidents > 0) return `Critical overrides the mix because ${incidents} active incident${incidents === 1 ? " is" : "s are"} present.`;
    if (counts.critical > 0) return `Critical overrides the mix because ${counts.critical} service${counts.critical === 1 ? " is" : "s are"} down.`;
    return `Critical overrides the mix because aggregate health is ${Math.round(health * 100)}%.`;
  }
  if (dominant === "unknown") {
    return `Unknown leads because only ${Math.round(knownRatio * 100)}% of the ${total} service records carry a known state.`;
  }
  const fragments = [
    `${counts.healthy} healthy`,
    `${counts.warning} warning`,
    `${counts.critical} critical`,
    `${counts.unknown} unknown`,
  ];
  return `${SCORE_STATES[dominant].label} supplies the harmonic grammar; ${fragments.join(", ")} remain audible as blended operational layers.`;
}

export function deriveStateVector({ services = [], estate = {}, stale = false } = {}) {
  const rows = Array.isArray(services) ? services : [];
  const counts = serviceCounts(rows);
  const total = Math.max(1, rows.length);
  const known = counts.healthy + counts.warning + counts.critical;
  const derivedEstate = deriveEstateFromServices(rows);
  const health = Number.isFinite(Number(estate?.overall_health))
    ? clamp(Number(estate.overall_health), 0, 1)
    : finite(derivedEstate.overall_health, 0);
  const knownRatio = Number.isFinite(Number(estate?.known_service_ratio))
    ? clamp(Number(estate.known_service_ratio), 0, 1)
    : clamp(derivedEstate.known_service_ratio, 0, 1);
  const incidents = Number.isFinite(Number(estate?.active_incidents))
    ? Math.max(0, Math.trunc(Number(estate.active_incidents)))
    : derivedEstate.active_incidents;

  if (stale || known === 0) {
    const weights = Object.freeze({ healthy: 0, warning: 0, critical: 0, unknown: 1 });
    return Object.freeze({
      dominant: "unknown",
      weights,
      counts,
      total: rows.length,
      known,
      health,
      knownRatio,
      incidents,
      reason: reasonForDominant({ dominant: "unknown", counts, total: rows.length, incidents, health, knownRatio, stale: true }),
    });
  }

  const raw = {
    healthy: counts.healthy,
    warning: counts.warning * 1.5 + Math.max(0, 0.97 - health) * total * 0.8,
    critical: counts.critical * 3 + incidents * 2 + Math.max(0, 0.5 - health) * total * 4,
    unknown: counts.unknown * 1.25 + Math.max(0, 0.85 - knownRatio) * total * 1.5,
  };
  const weights = normalizedWeights(raw);

  let dominant;
  if (incidents > 0 || counts.critical > 0 || health < 0.5) dominant = "critical";
  else if (knownRatio < 0.5) dominant = "unknown";
  else dominant = dominantByWeight(weights);

  return Object.freeze({
    dominant,
    weights,
    counts,
    total: rows.length,
    known,
    health,
    knownRatio,
    incidents,
    reason: reasonForDominant({ dominant, counts, total: rows.length, incidents, health, knownRatio, stale }),
  });
}

export function blendedModulation(frame = {}, weights = {}) {
  const base = frame?.modulation ?? {};
  const warning = clamp(finite(weights.warning), 0, 1);
  const critical = clamp(finite(weights.critical), 0, 1);
  const unknown = clamp(finite(weights.unknown), 0, 1);
  const healthy = clamp(finite(weights.healthy), 0, 1);
  return Object.freeze({
    ...base,
    pressure: clamp(Math.max(finite(base.pressure), warning * 0.34 + critical * 0.82), 0, 1),
    incidentPressure: clamp(Math.max(finite(base.incidentPressure), critical), 0, 1),
    errorPressure: clamp(Math.max(finite(base.errorPressure), warning * 0.22 + critical * 0.72), 0, 1),
    latencyPressure: clamp(Math.max(finite(base.latencyPressure), warning * 0.18 + critical * 0.3), 0, 1),
    healthPressure: clamp(Math.max(finite(base.healthPressure), 1 - healthy), 0, 1),
    coveragePressure: clamp(Math.max(finite(base.coveragePressure), unknown), 0, 1),
    spectralOpenness: clamp(finite(base.spectralOpenness, 1) * (1 - unknown * 0.34 - critical * 0.12), 0, 1),
    staleDecay: clamp(Math.max(finite(base.staleDecay), frame?.stale ? 1 : unknown * 0.35), 0, 1),
    hybridStateVector: Object.freeze({ healthy, warning, critical, unknown }),
  });
}

export function buildHybridFrame(frame = {}, merged = {}) {
  const rawServices = Array.isArray(merged?.services)
    ? merged.services
    : Array.isArray(frame?.voices)
      ? frame.voices
      : [];
  const preview = merged?.preview === true
    || rawServices.some((service) => String(service?.evidence_source ?? "").startsWith("preview:"));
  const simulated = rawServices.some((service) => service?.demoSimulated === true);
  const estate = preview && !simulated
    ? deriveEstateFromServices(rawServices)
    : merged?.estate && typeof merged.estate === "object"
      ? merged.estate
      : {
        overall_health: frame?.overallHealth,
        active_incidents: frame?.activeIncidents,
        known_service_ratio: frame?.knownServiceRatio,
      };
  const vector = deriveStateVector({ services: rawServices, estate, stale: Boolean(frame?.stale || merged?.stale) });
  const score = SCORE_STATES[vector.dominant];
  const voices = rawServices.map((service) => {
    const voice = computeVoiceParams(service, vector.dominant);
    const evidence = evidenceStateForService(voice, {
      stale: Boolean(frame?.stale || merged?.stale),
      preview,
      simulated,
    });
    return Object.freeze({
      ...voice,
      measured: evidence.measured,
      evidenceState: evidence.id,
      evidenceLabel: evidence.label,
      evidenceMode: evidence.sourceMode,
    });
  });
  const measuredComponents = voices.filter((voice) => voice.measured).length;

  const hybridFrame = {
    ...frame,
    scoreState: vector.dominant,
    scoreLabel: score.label,
    mode: score.mode,
    scale: Object.freeze([...score.scale]),
    density: score.density,
    tension: score.tension,
    masterGainDb: score.masterGainDb,
    masterFilterHz: score.masterFilterHz,
    masterHpHz: score.masterHpHz,
    transitionSeconds: score.transitionSeconds,
    overallHealth: vector.health,
    activeIncidents: vector.incidents,
    knownServiceRatio: vector.knownRatio,
    totalComponents: voices.length,
    measuredComponents,
    warningCount: vector.counts.warning,
    failureCount: vector.counts.critical,
    unknownCount: vector.counts.unknown,
    unmeasuredCount: voices.length - measuredComponents,
    stateVector: vector.weights,
    stateCounts: vector.counts,
    dominantStateReason: vector.reason,
    hybridLayers: Object.freeze({
      explorer: vector.weights.healthy,
      diagnostic: vector.weights.warning,
      alarm: vector.weights.critical,
      carrier: vector.weights.unknown,
    }),
    evidenceMode: simulated ? "demo" : preview ? "preview" : "live",
    previewEstateDerived: preview && !simulated,
    modulation: blendedModulation(frame, vector.weights),
    voices: Object.freeze(voices),
  };

  return Object.freeze({
    ...hybridFrame,
    scorePlan: buildAtlasApuScorePlan(hybridFrame),
  });
}
