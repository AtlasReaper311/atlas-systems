/**
 * System SYMPHONY telemetry-to-score mapping.
 *
 * This module is deliberately pure: no DOM, Tone.js, network, clock, or
 * mutable module state. The same telemetry and topology payloads always
 * produce the same score frame.
 */

export const ROOT_MIDI = 38; // D2
export const MAX_COMPONENTS = 32;
export const MAX_EXPECTED_LATENCY_MS = 1500;
export const NEUTRAL_LATENCY_FILTER_HZ = 2400;

export const SCALE_AEOLIAN = [0, 2, 3, 5, 7, 8, 10, 12];
export const SCALE_PHRYGIAN = [0, 1, 3, 5, 7, 8, 10, 12];
export const SCALE_PHRYGIAN_DOMINANT = [0, 1, 4, 5, 7, 8, 10, 12];
export const SCALE_UNKNOWN = [0, 2, 5, 7, 10, 12];

export const SCORE_STATES = Object.freeze({
  healthy: Object.freeze({
    label: "Healthy",
    mode: "D Aeolian",
    bpm: 72,
    scale: SCALE_AEOLIAN,
    density: 0.72,
    tension: 0.12,
    masterGainDb: -8,
    masterFilterHz: 4800,
    transitionSeconds: 10,
    persistentRhythm: true,
  }),
  warning: Object.freeze({
    label: "Warning",
    mode: "D Phrygian",
    bpm: 82,
    scale: SCALE_PHRYGIAN,
    density: 0.8,
    tension: 0.44,
    masterGainDb: -7,
    masterFilterHz: 4000,
    transitionSeconds: 8,
    persistentRhythm: true,
  }),
  critical: Object.freeze({
    label: "Critical",
    mode: "D Phrygian dominant",
    bpm: 96,
    scale: SCALE_PHRYGIAN_DOMINANT,
    density: 0.9,
    tension: 0.92,
    masterGainDb: -5,
    masterFilterHz: 3300,
    transitionSeconds: 0.8,
    persistentRhythm: true,
  }),
  unknown: Object.freeze({
    label: "Unknown",
    mode: "D suspended",
    bpm: 60,
    scale: SCALE_UNKNOWN,
    density: 0.48,
    tension: 0.28,
    masterGainDb: -11,
    masterFilterHz: 2600,
    transitionSeconds: 8,
    persistentRhythm: true,
  }),
});

export const STATUS_PARAMETERS = Object.freeze({
  healthy: Object.freeze({
    articulation: "legato",
    gain: 0.72,
    density: 1,
    stability: 1,
    brightnessBias: 1,
  }),
  degraded: Object.freeze({
    articulation: "tenuto",
    gain: 0.6,
    density: 0.82,
    stability: 0.68,
    brightnessBias: 0.72,
  }),
  down: Object.freeze({
    articulation: "urgent",
    gain: 0.68,
    density: 1.22,
    stability: 0.26,
    brightnessBias: 0.46,
  }),
  unknown: Object.freeze({
    articulation: "suspended",
    gain: 0.34,
    density: 0.56,
    stability: 0.5,
    brightnessBias: 0.5,
  }),
});

export const DEMO_PROFILES = Object.freeze({
  healthy: Object.freeze({
    label: "All healthy",
    status: "healthy",
    latency_ms: 45,
    uptime_pct: 99.99,
    error_rate: 0,
  }),
  warning: Object.freeze({
    label: "All warning",
    status: "degraded",
    latency_ms: 280,
    uptime_pct: 99,
    error_rate: 0.01,
  }),
  critical: Object.freeze({
    label: "All critical",
    status: "down",
    latency_ms: null,
    uptime_pct: 95,
    error_rate: 0.05,
  }),
  unknown: Object.freeze({
    label: "All unknown",
    status: "unknown",
    latency_ms: null,
    uptime_pct: null,
    error_rate: null,
  }),
});

const LAYER_ORDER = [
  "surface",
  "public-api",
  "observability",
  "edge",
  "local-ai",
  "infra",
  "reusable-kit",
  "unknown",
];

const FAMILY_VARIANTS = Object.freeze({
  "analog-pad": ["detuned terminal pad", "CRT phosphor haze", "tape-worn poly pad"],
  "data-sequence": ["packet sequencer", "modem arpeggio", "protocol pulse"],
  "industrial-pulse": ["industrial telemetry pulse", "relay percussion", "machine-room knock"],
  "edge-saw": ["corroded edge saw", "tunnel voltage", "cold gateway lead"],
  "sub-drone": ["sub-core drone", "memory undertow", "neural power rail"],
  "relay-bass": ["relay bass", "mainframe low voice", "deployment motor"],
  "tape-signal": ["tape signal", "terminal carrier", "damaged data tone"],
});

const FAMILY_REGISTERS = Object.freeze({
  "analog-pad": 40,
  "data-sequence": 45,
  "industrial-pulse": 38,
  "edge-saw": 40,
  "sub-drone": 33,
  "relay-bass": 33,
  "tape-signal": 43,
});

export const FAMILY_MIDI_RANGES = Object.freeze({
  "analog-pad": Object.freeze({ minimum: 33, maximum: 57 }),
  "data-sequence": Object.freeze({ minimum: 38, maximum: 62 }),
  "industrial-pulse": Object.freeze({ minimum: 33, maximum: 57 }),
  "edge-saw": Object.freeze({ minimum: 33, maximum: 60 }),
  "sub-drone": Object.freeze({ minimum: 26, maximum: 50 }),
  "relay-bass": Object.freeze({ minimum: 28, maximum: 52 }),
  "tape-signal": Object.freeze({ minimum: 36, maximum: 60 }),
});

const MOTIF_SHAPES = Object.freeze([
  [0, 2, 4, 1],
  [0, 3, 1, 5],
  [4, 2, 0, 3],
  [0, 4, 5, 2],
  [2, 0, 4, 6],
  [0, 1, 4, 3],
  [5, 3, 1, 0],
  [0, 4, 2, 7],
]);

export function clamp(value, minimum, maximum) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

export function stableHash(value) {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function midiToFrequencyHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function canonicalStatus(status) {
  const normalized = String(status ?? "unknown").toLowerCase();
  if (["healthy", "ok", "up", "success"].includes(normalized)) {
    return "healthy";
  }
  if (["warning", "degraded", "partial"].includes(normalized)) {
    return "degraded";
  }
  if (["critical", "down", "failed", "failure"].includes(normalized)) {
    return "down";
  }
  return "unknown";
}

export function inferLayer(name, kind = "") {
  const value = `${name ?? ""} ${kind ?? ""}`.toLowerCase();
  if (/ramone|corpus|ollama|memory/.test(value)) return "local-ai";
  if (/telemetry|watch|notify|pulse|blackbox|sonify|observ/.test(value)) {
    return "observability";
  }
  if (/edge|tunnel|cloudflared|sentinel/.test(value)) return "edge";
  if (/api|registry|index|worker/.test(value)) return "public-api";
  if (/site|status|surface|viewer/.test(value)) return "surface";
  if (/infra|deploy|bootstrap|github-actions/.test(value)) return "infra";
  return "unknown";
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function measuredRecord(service, topologyComponent = null) {
  const name = String(service?.name ?? service?.id ?? topologyComponent?.id ?? "unknown");
  const layer = String(topologyComponent?.layer ?? service?.layer ?? inferLayer(name, topologyComponent?.kind));
  return {
    name,
    displayName: String(topologyComponent?.label ?? service?.displayName ?? name),
    layer,
    kind: String(topologyComponent?.kind ?? service?.kind ?? "measured-service"),
    lifecycle: topologyComponent?.lifecycle ?? service?.lifecycle ?? null,
    description: topologyComponent?.description ?? service?.description ?? null,
    depends_on: Array.isArray(topologyComponent?.depends_on)
      ? [...topologyComponent.depends_on]
      : Array.isArray(service?.depends_on)
        ? [...service.depends_on]
        : [],
    sourceOnly: topologyComponent?.source_only === true,
    measured: true,
    demoSimulated: service?.demoSimulated === true,
    evidence_source: service?.evidence_source ?? null,
    health_detail: service?.health_detail ?? null,
    measured_at: service?.measured_at ?? null,
    status: canonicalStatus(service?.status),
    latency_ms: finiteOrNull(service?.latency_ms),
    uptime_pct: finiteOrNull(service?.uptime_pct),
    error_rate: finiteOrNull(service?.error_rate),
    last_deploy_secs_ago: finiteOrNull(service?.last_deploy_secs_ago),
  };
}

function unknownTopologyRecord(component) {
  const name = String(component?.id ?? component?.name ?? "unknown");
  return {
    name,
    displayName: String(component?.label ?? name),
    layer: String(component?.layer ?? inferLayer(name, component?.kind)),
    kind: String(component?.kind ?? "component"),
    lifecycle: component?.lifecycle ?? null,
    description: component?.description ?? null,
    depends_on: Array.isArray(component?.depends_on) ? [...component.depends_on] : [],
    sourceOnly: component?.source_only === true,
    measured: false,
    demoSimulated: false,
    evidence_source: null,
    health_detail: null,
    measured_at: null,
    status: "unknown",
    latency_ms: null,
    uptime_pct: null,
    error_rate: null,
    last_deploy_secs_ago: null,
  };
}

function compareComponents(left, right) {
  const leftLayer = LAYER_ORDER.indexOf(left.layer);
  const rightLayer = LAYER_ORDER.indexOf(right.layer);
  const layerDifference = (leftLayer < 0 ? 99 : leftLayer) - (rightLayer < 0 ? 99 : rightLayer);
  return layerDifference || left.name.localeCompare(right.name);
}

/**
 * Merge the live contracts honestly. Measured health always wins, topology
 * only supplies identity and dependencies, and unmeasured source-only
 * repositories never become pretend live components.
 */
export function mergeTelemetryAndTopology(telemetry = {}, topology = null) {
  const measured = Array.isArray(telemetry?.services) ? telemetry.services : [];
  const measuredByName = new Map(
    measured.map((service) => [String(service?.name ?? service?.id ?? ""), service]),
  );
  const mergedByName = new Map();
  const topologyComponents = Array.isArray(topology?.components)
    ? topology.components
    : [];

  for (const component of topologyComponents) {
    const name = String(component?.id ?? component?.name ?? "");
    if (!name) continue;
    const measurement = measuredByName.get(name);
    if (component?.source_only === true && !measurement) continue;
    mergedByName.set(
      name,
      measurement
        ? measuredRecord(measurement, component)
        : unknownTopologyRecord(component),
    );
  }

  for (const service of measured) {
    const name = String(service?.name ?? service?.id ?? "");
    if (!name || mergedByName.has(name)) continue;
    mergedByName.set(name, measuredRecord(service));
  }

  const services = [...mergedByName.values()]
    .sort(compareComponents)
    .slice(0, MAX_COMPONENTS);

  return {
    timestamp: typeof telemetry?.timestamp === "string" ? telemetry.timestamp : null,
    estate: telemetry?.estate && typeof telemetry.estate === "object"
      ? { ...telemetry.estate }
      : {},
    stale: Boolean(telemetry?.stale),
    lastSuccessfulAt:
      typeof telemetry?.lastSuccessfulAt === "string"
        ? telemetry.lastSuccessfulAt
        : null,
    topologyAvailable: topologyComponents.length > 0,
    services,
  };
}

export function filterVoices(voices = [], filter = "all") {
  if (filter === "measured") {
    return voices.filter((voice) => Boolean(voice?.measured));
  }
  if (filter === "unmeasured") {
    return voices.filter((voice) => !voice?.measured);
  }
  return [...voices];
}

export function buildDependencyGraph(visibleVoices = [], allVoices = visibleVoices) {
  const visibleNames = new Set(visibleVoices.map((voice) => voice.name));
  const allNames = new Set(allVoices.map((voice) => voice.name));
  const internalEdges = [];
  const externalEdges = [];
  const externalNodes = new Set();
  const seen = new Set();

  for (const voice of visibleVoices) {
    const dependencies = Array.isArray(voice?.depends_on) ? voice.depends_on : [];
    for (const dependency of dependencies) {
      const key = `${voice.name}\u0000${dependency}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (visibleNames.has(dependency)) {
        internalEdges.push({ from: voice.name, to: dependency });
      } else if (!allNames.has(dependency)) {
        externalEdges.push({ from: voice.name, to: dependency });
        externalNodes.add(dependency);
      }
    }
  }

  return {
    internalEdges,
    externalEdges,
    externalNodes: [...externalNodes].sort((left, right) => left.localeCompare(right)),
  };
}

export function applyDemoProfileToServices(services = [], profileName) {
  const profile = DEMO_PROFILES[profileName];
  if (!profile) throw new Error(`system-symphony: unknown demo profile ${profileName}`);
  return services.map((service) => ({
    ...service,
    status: profile.status,
    latency_ms: profile.latency_ms,
    uptime_pct: profile.uptime_pct,
    error_rate: profile.error_rate,
    demoSimulated: true,
    health_detail: `Preview profile: ${profile.label}`,
  }));
}

export function deriveScoreState(payload = {}) {
  const services = Array.isArray(payload?.services) ? payload.services : [];
  const known = services.filter(
    (service) => canonicalStatus(service?.status) !== "unknown",
  );
  if (payload?.stale || known.length === 0) return "unknown";

  const health = Number.isFinite(payload?.estate?.overall_health)
    ? clamp(payload.estate.overall_health, 0, 1)
    : null;
  const incidents = Number.isFinite(payload?.estate?.active_incidents)
    ? Math.max(0, Math.trunc(payload.estate.active_incidents))
    : 0;

  if (
    incidents > 0 ||
    known.some((service) => canonicalStatus(service.status) === "down") ||
    (health !== null && health < 0.5)
  ) {
    return "critical";
  }
  if (
    known.some((service) => canonicalStatus(service.status) === "degraded") ||
    (health !== null && health < 0.95)
  ) {
    return "warning";
  }
  return "healthy";
}

export function instrumentFamilyFor(service = {}) {
  const name = String(service?.name ?? "").toLowerCase();
  const layer = String(service?.layer ?? inferLayer(name, service?.kind)).toLowerCase();

  if (layer === "surface") return "analog-pad";
  if (layer === "public-api") return "data-sequence";
  if (layer === "observability") return "industrial-pulse";
  if (layer === "edge") return "edge-saw";
  if (layer === "local-ai") return "sub-drone";
  if (layer === "infra") return "relay-bass";
  return "tape-signal";
}

export function deriveServiceIdentity(service = {}) {
  const name = String(service?.name ?? "unknown");
  const hash = stableHash(name);
  const instrumentFamily = instrumentFamilyFor(service);
  const variants = FAMILY_VARIANTS[instrumentFamily];
  const instrumentLabel = variants[hash % variants.length];
  const motifBase = MOTIF_SHAPES[(hash >>> 4) % MOTIF_SHAPES.length];
  const motifRotation = (hash >>> 9) % motifBase.length;
  const motif = motifBase.map(
    (_, index) => motifBase[(index + motifRotation) % motifBase.length],
  );
  const registerOffset = ((hash >>> 13) % 3 - 1) * 5;
  const registerMidi = FAMILY_REGISTERS[instrumentFamily] + registerOffset;
  const pan = -0.72 + ((hash >>> 17) % 145) / 100;

  return {
    hash,
    instrumentFamily,
    instrumentLabel,
    motif,
    motifLabel: `degrees ${motif.join("-")} around D`,
    pan: clamp(pan, -0.72, 0.72),
    registerMidi,
    registerLabel:
      registerMidi < 40 ? "low" : registerMidi < 55 ? "middle" : "upper-middle",
  };
}

export function boundVoiceMidi(params = {}, midi) {
  const range = FAMILY_MIDI_RANGES[params.instrumentFamily]
    ?? FAMILY_MIDI_RANGES["tape-signal"];
  return clamp(midi, range.minimum, range.maximum);
}

export function normalizeLatency(latencyMs) {
  if (!Number.isFinite(latencyMs)) return null;
  const normalized =
    1 -
    Math.log(Math.max(0, latencyMs) + 1) /
      Math.log(MAX_EXPECTED_LATENCY_MS + 1);
  return clamp(normalized, 0, 1);
}

export function latencyToFilterHz(latencyMs) {
  const normalized = normalizeLatency(latencyMs);
  if (normalized === null) return NEUTRAL_LATENCY_FILTER_HZ;
  return 550 + normalized * 4650;
}

export function uptimeToBrightness(uptimePct) {
  if (!Number.isFinite(uptimePct)) return 0.62;
  return 0.22 + 0.78 * clamp(uptimePct / 100, 0, 1);
}

export function errorRateToInstability(errorRate) {
  if (!Number.isFinite(errorRate)) return 0;
  return clamp(errorRate, 0, 1);
}

export function computeVoiceParams(service, scoreState) {
  const status = canonicalStatus(service?.status);
  const statusParameters = STATUS_PARAMETERS[status];
  const identity = deriveServiceIdentity(service);
  const scale = SCORE_STATES[scoreState].scale;
  const latency = finiteOrNull(service?.latency_ms);
  const uptime = finiteOrNull(service?.uptime_pct);
  const errorRate = finiteOrNull(service?.error_rate);
  const brightness = clamp(
    uptimeToBrightness(uptime) * statusParameters.brightnessBias,
    0.12,
    1,
  );
  const instability = clamp(
    Math.max(
      errorRateToInstability(errorRate),
      status === "down" ? 0.72 : status === "degraded" ? 0.26 : 0,
    ),
    0,
    1,
  );
  const detuneDirection = identity.hash % 2 === 0 ? 1 : -1;
  const detuneCents = detuneDirection * instability * SCORE_STATES[scoreState].tension * 19;
  const noteConfidence = clamp(1 - instability * 0.7, 0.2, 1);
  const motifMidi = identity.motif.map((degree) => {
    const scaleOffset = scale[degree % scale.length];
    return boundVoiceMidi(identity, identity.registerMidi + scaleOffset);
  });

  return {
    name: String(service?.name ?? "unknown"),
    displayName: String(service?.displayName ?? service?.name ?? "unknown"),
    layer: String(service?.layer ?? inferLayer(service?.name, service?.kind)),
    kind: String(service?.kind ?? "component"),
    description: service?.description ?? null,
    depends_on: Array.isArray(service?.depends_on) ? [...service.depends_on] : [],
    measured: Boolean(service?.measured),
    demoSimulated: Boolean(service?.demoSimulated),
    evidence_source: service?.evidence_source ?? null,
    health_detail: service?.health_detail ?? null,
    measured_at: service?.measured_at ?? null,
    sourceOnly: Boolean(service?.sourceOnly),
    status,
    latency_ms: latency,
    uptime_pct: uptime,
    error_rate: errorRate,
    last_deploy_secs_ago: finiteOrNull(service?.last_deploy_secs_ago),
    ...identity,
    articulation: statusParameters.articulation,
    voiceGain: statusParameters.gain,
    density: statusParameters.density,
    stability: statusParameters.stability,
    brightness,
    filterHz: latencyToFilterHz(latency),
    instability,
    detuneCents,
    noteConfidence,
    velocity: clamp(0.22 + noteConfidence * 0.34, 0.18, 0.58),
    motifMidi,
    motifFrequenciesHz: motifMidi.map(midiToFrequencyHz),
  };
}

export function deriveDemoEstate(services = []) {
  const known = services.filter(
    (service) => canonicalStatus(service?.status) !== "unknown",
  );
  const score = { healthy: 1, degraded: 0.78, down: 0.2 };
  const overallHealth = known.length
    ? known.reduce(
        (total, service) => total + score[canonicalStatus(service.status)],
        0,
      ) / known.length
    : null;
  return {
    overall_health: overallHealth,
    active_incidents: known.filter(
      (service) => canonicalStatus(service.status) === "down",
    ).length,
  };
}

export function computeFrame(payload = {}) {
  const services = Array.isArray(payload?.services) ? payload.services : [];
  const scoreState = deriveScoreState(payload);
  const score = SCORE_STATES[scoreState];
  const overallHealth = Number.isFinite(payload?.estate?.overall_health)
    ? clamp(payload.estate.overall_health, 0, 1)
    : null;
  const activeIncidents = Number.isFinite(payload?.estate?.active_incidents)
    ? Math.max(0, Math.trunc(payload.estate.active_incidents))
    : 0;
  const voices = services.slice(0, MAX_COMPONENTS).map(
    (service) => computeVoiceParams(service, scoreState),
  );

  return {
    timestamp: typeof payload?.timestamp === "string" ? payload.timestamp : null,
    lastSuccessfulAt:
      typeof payload?.lastSuccessfulAt === "string"
        ? payload.lastSuccessfulAt
        : null,
    stale: Boolean(payload?.stale),
    topologyAvailable: Boolean(payload?.topologyAvailable),
    scoreState,
    scoreLabel: score.label,
    mode: score.mode,
    bpm: score.bpm,
    scale: [...score.scale],
    density: score.density,
    tension: score.tension,
    masterGainDb: score.masterGainDb,
    masterFilterHz: score.masterFilterHz,
    transitionSeconds: score.transitionSeconds,
    persistentRhythm: score.persistentRhythm,
    overallHealth,
    activeIncidents,
    totalComponents: voices.length,
    measuredComponents: voices.filter((voice) => voice.measured).length,
    warningCount: voices.filter((voice) => voice.status === "degraded").length,
    failureCount: voices.filter((voice) => voice.status === "down").length,
    unknownCount: voices.filter(
      (voice) => voice.measured && voice.status === "unknown",
    ).length,
    unmeasuredCount: voices.filter((voice) => !voice.measured).length,
    voices,
  };
}
