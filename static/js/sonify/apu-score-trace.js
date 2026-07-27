/**
 * System Symphony Pass D0 score trace contract.
 *
 * This module records musical decisions after the existing composition,
 * performance and arrangement authorities have made them. It does not choose
 * notes, change evidence, schedule audio or own any Web Audio nodes.
 */

export const APU_SCORE_TRACE_SCHEMA_VERSION = 1;
export const APU_SCORE_TRACE_BUILD_ID = "20260727-system-symphony-pass-d0-score-trace-v1";
export const APU_SCORE_TRACE_HISTORY_LIMIT = 256;

const STATE_TITLES = Object.freeze({
  healthy: "Explorer",
  warning: "Grid Pressure",
  critical: "Boss Protocol",
  unknown: "Lost Signal",
});

const TRACE_STATES = Object.freeze(Object.keys(STATE_TITLES));

function safeState(value) {
  const state = String(value ?? "unknown").toLowerCase();
  return TRACE_STATES.includes(state) ? state : "unknown";
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function stringOrNull(value) {
  return typeof value === "string" && value.length ? value : null;
}

function frozenArray(value) {
  return Object.freeze(Array.isArray(value) ? value.map((item) => clonePlain(item)) : []);
}

function clonePlain(value) {
  if (Array.isArray(value)) return value.map((item) => clonePlain(item));
  if (!value || typeof value !== "object") {
    if (typeof value === "number") return finiteOrNull(value);
    if (["string", "boolean"].includes(typeof value) || value === null) return value;
    return null;
  }
  const copy = {};
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (["function", "symbol", "undefined"].includes(typeof item)) continue;
    copy[key] = clonePlain(item);
  }
  return copy;
}

export function deepFreeze(value) {
  if (!value || typeof value !== "object") return value;
  for (const child of Object.values(value)) deepFreeze(child);
  if (!Object.isFrozen(value)) Object.freeze(value);
  return value;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item));
  if (!value || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) return null;
    return value;
  }
  const canonical = {};
  for (const key of Object.keys(value).sort()) canonical[key] = canonicalValue(value[key]);
  return canonical;
}

export function stableStringify(value) {
  return JSON.stringify(canonicalValue(value));
}

export function fnv1aHex(value) {
  let hash = 2166136261;
  const source = String(value ?? "");
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function harmonyTrace(arrangement) {
  return frozenArray((arrangement?.harmony ?? []).map((chord) => ({
    rootDegree: finiteOrNull(chord?.rootDegree),
    quality: stringOrNull(chord?.quality),
    inversion: finiteOrNull(chord?.inversion),
  })));
}

function voiceHierarchy(mix = {}) {
  const ranked = Object.entries(mix)
    .filter(([, gain]) => Number.isFinite(gain) && gain > 0.02)
    .sort(([leftName, leftGain], [rightName, rightGain]) => (
      rightGain - leftGain || leftName.localeCompare(rightName)
    ));
  return Object.freeze({
    foregroundVoice: ranked[0]?.[0] ?? null,
    responseVoice: ranked[1]?.[0] ?? null,
    rankedVoices: Object.freeze(ranked.map(([name, gain]) => Object.freeze({ name, gain }))),
  });
}

function evidenceTrace(frame = {}, replayMovement = null, evidenceSource = null) {
  const movement = replayMovement ?? frame?.replayMovement ?? null;
  const source = evidenceSource && typeof evidenceSource === "object" ? evidenceSource : {};
  return deepFreeze({
    mode: stringOrNull(source.mode ?? frame?.evidenceMode) ?? "live",
    sourceLabel: stringOrNull(source.sourceLabel ?? frame?.replaySourceLabel ?? frame?.sourceLabel),
    stale: Boolean(source.stale ?? frame?.stale),
    measuredComponents: finiteOrNull(source.measuredComponents ?? frame?.measuredComponents),
    totalComponents: finiteOrNull(source.totalComponents ?? frame?.totalComponents),
    knownServiceRatio: finiteOrNull(source.knownServiceRatio ?? frame?.knownServiceRatio),
    activeIncidents: finiteOrNull(source.activeIncidents ?? frame?.activeIncidents),
    movement: movement ? {
      kind: stringOrNull(movement.kind),
      state: safeState(movement.state),
      phase: stringOrNull(movement.phase),
      label: stringOrNull(movement.label),
      fromEvidence: Boolean(movement.fromEvidence),
    } : null,
  });
}

function ornamentTrace(ornaments) {
  return frozenArray((ornaments ?? []).map((ornament) => ({
    voice: stringOrNull(ornament?.voice),
    function: stringOrNull(ornament?.function ?? ornament?.name),
    size: stringOrNull(ornament?.size),
    contour: stringOrNull(ornament?.contour),
    offsetSteps: finiteOrNull(ornament?.offsetSteps),
    midiOffset: finiteOrNull(ornament?.midiOffset),
    duration: stringOrNull(ornament?.duration),
  })));
}

export function createScoreTraceEntry({
  frame = {},
  directorPlan = null,
  performancePlan = null,
  arrangement = null,
  ornaments = [],
  transition = null,
  replayMovement = null,
  evidenceSource = null,
  eventContext = null,
} = {}) {
  if (!arrangement || typeof arrangement !== "object") {
    throw new TypeError("apu-score-trace: arrangement is required");
  }

  const state = safeState(arrangement.scoreState ?? directorPlan?.state ?? frame?.scoreState);
  const hierarchy = voiceHierarchy(arrangement.mix);
  const ornamentPlan = ornamentTrace(ornaments);
  const payload = {
    schemaVersion: APU_SCORE_TRACE_SCHEMA_VERSION,
    buildId: APU_SCORE_TRACE_BUILD_ID,
    phraseIndex: Math.max(0, Math.trunc(arrangement.phraseIndex ?? directorPlan?.phraseIndex ?? 0)),
    cycleNumber: Math.max(0, Math.trunc(arrangement.cycleNumber ?? 0)),
    cyclePhrase: Math.max(0, Math.trunc(arrangement.cyclePhrase ?? 0)),
    cycleBarStart: finiteOrNull(arrangement.cycleBarStart),
    cycleBarEnd: finiteOrNull(arrangement.cycleBarEnd),
    state,
    stateTitle: STATE_TITLES[state],
    section: stringOrNull(arrangement.section),
    sectionLabel: stringOrNull(arrangement.sectionLabel),
    sectionRole: stringOrNull(arrangement.motifMode),
    performancePhase: stringOrNull(performancePlan?.phase),
    compositionPhase: stringOrNull(directorPlan?.phase ?? arrangement.directorPhase),
    harmonicRegion: null,
    harmony: harmonyTrace(arrangement),
    cadenceIntent: null,
    motifId: stringOrNull(directorPlan?.id) ?? `pass-c:${state}:${arrangement.motifMode ?? "unknown"}`,
    motifSource: directorPlan?.id ? "composition-director+arranger" : "arranger",
    motifTransformation: stringOrNull(arrangement.motifMode),
    motifVariant: finiteOrNull(directorPlan?.motifVariant),
    motifDegrees: frozenArray(arrangement.motifDegrees ?? directorPlan?.motifDegrees),
    motifPattern: frozenArray(directorPlan?.motifPattern),
    arpFunction: ornamentPlan.find((item) => item.voice === "secondary" || item.function?.includes("arp"))?.function ?? null,
    ornaments: ornamentPlan,
    bassRole: stringOrNull(arrangement.bassPattern),
    bassContour: finiteOrNull(directorPlan?.bassPattern),
    rhythmRole: stringOrNull(arrangement.drumPattern),
    drumPattern: stringOrNull(arrangement.drumPattern),
    foregroundVoice: hierarchy.foregroundVoice,
    responseVoice: hierarchy.responseVoice,
    rankedVoices: hierarchy.rankedVoices,
    serviceInfluence: deepFreeze({
      density: finiteOrNull(arrangement.serviceDensity),
      visibleVoices: Array.isArray(frame?.voices) ? frame.voices.length : null,
    }),
    transitionIntent: stringOrNull(arrangement.transition),
    stateTransition: transition ? clonePlain(transition) : null,
    evidenceSource: evidenceTrace(frame, replayMovement, evidenceSource),
    eventContext: eventContext ? clonePlain(eventContext) : null,
    decisionSources: Object.freeze([
      "composition-director",
      "performance-director-v4",
      "apu-arranger",
      "apu-performance-conductor",
    ]),
  };

  const deterministicSignature = fnv1aHex(stableStringify(payload));
  return deepFreeze({ ...payload, deterministicSignature });
}

export function serializeScoreTrace(entries) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  return `${stableStringify(safeEntries)}\n`;
}

export function scoreTraceDigest(entries) {
  return fnv1aHex(serializeScoreTrace(entries));
}

export function createScoreTraceRecorder({
  limit = APU_SCORE_TRACE_HISTORY_LIMIT,
  onTrace = null,
} = {}) {
  const boundedLimit = Math.max(1, Math.min(4096, Math.trunc(limit) || APU_SCORE_TRACE_HISTORY_LIMIT));
  let history = [];

  return Object.freeze({
    record(input) {
      const entry = createScoreTraceEntry(input);
      history = [...history.slice(-(boundedLimit - 1)), entry];
      onTrace?.(entry);
      return entry;
    },
    getLatest() {
      return history.at(-1) ?? null;
    },
    getHistory() {
      return Object.freeze([...history]);
    },
    serialize() {
      return serializeScoreTrace(history);
    },
    reset() {
      history = [];
    },
  });
}
