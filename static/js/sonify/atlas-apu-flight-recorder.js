/**
 * Atlas APU black-box flight recorder.
 *
 * Phase 9 keeps persistence static and local: a cartridge is a normalized,
 * replayable proof object derived from a bounded System SYMPHONY frame.
 */

import { buildAtlasApuScorePlan } from "./atlas-apu-score-plan.js?v=20260726-atlas-apu-score-plan-v3";

export const ATLAS_APU_BLACK_BOX_SCHEMA_VERSION = "atlas-apu-black-box/v1";
export const ATLAS_APU_BLACK_BOX_BUILD_ID = "20260726-atlas-apu-black-box-v1";
export const ATLAS_APU_ARCHIVE_BUILD_ID = "20260726-atlas-apu-static-archive-v1";

const STATE_KEYS = Object.freeze(["healthy", "warning", "critical", "unknown"]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function compactCommit(value) {
  const textValue = String(value ?? "").trim();
  return /^[0-9a-f]{40}$/i.test(textValue) ? textValue.slice(0, 7) : textValue || "unavailable";
}

function formatIsoTime(value) {
  if (!value) return "pending";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function normaliseSource(value) {
  const source = String(value ?? "").toLowerCase();
  if (source === "preview") return "fixture";
  if (source === "demo") return "replay";
  if (["fixture", "live", "live stale", "replay", "stale"].includes(source)) return source;
  return "unknown";
}

function normaliseRouteMode(value) {
  const mode = String(value ?? "PLAY").toUpperCase();
  return ["PLAY", "TRACE", "REPLAY"].includes(mode) ? mode : "PLAY";
}

function normaliseReplaySeed(value) {
  const seed = String(value ?? "").trim().toUpperCase();
  return /^[0-9A-F]{4,8}$/.test(seed) ? seed : "A7A5";
}

function percentage(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.round(numeric * 100)}%` : "unknown";
}

function stateVectorFrom(plan = {}, frame = {}) {
  const source = plan.stateVector ?? frame.stateVector ?? {};
  return Object.freeze(Object.fromEntries(STATE_KEYS.map((state) => [
    state,
    Number.isFinite(Number(source[state])) ? Number(source[state]) : 0,
  ])));
}

function telemetryVoice(voice = {}) {
  const dependsOn = Object.freeze([...(voice.depends_on ?? voice.dependsOn ?? [])].map(String));
  return Object.freeze({
    name: String(voice.name ?? "unknown"),
    displayName: String(voice.displayName ?? voice.name ?? "unknown"),
    status: String(voice.status ?? "unknown"),
    measured: Boolean(voice.measured),
    evidenceState: voice.evidenceState ?? null,
    evidenceSource: voice.evidence_source ?? voice.evidenceSource ?? null,
    evidence_source: voice.evidence_source ?? voice.evidenceSource ?? null,
    measuredAt: voice.measured_at ?? voice.measuredAt ?? null,
    measured_at: voice.measured_at ?? voice.measuredAt ?? null,
    latencyMs: Number.isFinite(Number(voice.latency_ms ?? voice.latencyMs))
      ? Number(voice.latency_ms ?? voice.latencyMs)
      : null,
    latency_ms: Number.isFinite(Number(voice.latency_ms ?? voice.latencyMs))
      ? Number(voice.latency_ms ?? voice.latencyMs)
      : null,
    uptimePct: Number.isFinite(Number(voice.uptime_pct ?? voice.uptimePct))
      ? Number(voice.uptime_pct ?? voice.uptimePct)
      : null,
    uptime_pct: Number.isFinite(Number(voice.uptime_pct ?? voice.uptimePct))
      ? Number(voice.uptime_pct ?? voice.uptimePct)
      : null,
    errorRate: Number.isFinite(Number(voice.error_rate ?? voice.errorRate))
      ? Number(voice.error_rate ?? voice.errorRate)
      : null,
    error_rate: Number.isFinite(Number(voice.error_rate ?? voice.errorRate))
      ? Number(voice.error_rate ?? voice.errorRate)
      : null,
    dependsOn,
    depends_on: dependsOn,
  });
}

export function telemetrySnapshotForFrame(frame = {}) {
  return Object.freeze({
    frameTime: formatIsoTime(frame.timestamp ?? frame.lastSuccessfulAt ?? frame.frameId),
    timestamp: frame.timestamp ?? null,
    lastSuccessfulAt: frame.lastSuccessfulAt ?? null,
    stale: Boolean(frame.stale),
    evidenceMode: frame.evidenceMode ?? (frame.previewEstateDerived ? "preview" : null),
    previousScoreState: frame.previousScoreState ?? null,
    scoreState: frame.scoreState ?? "unknown",
    scoreLabel: frame.scoreLabel ?? "Unknown",
    stateVector: clone(frame.stateVector ?? {}),
    totalComponents: Number(frame.totalComponents) || 0,
    measuredComponents: Number(frame.measuredComponents) || 0,
    warningCount: Number(frame.warningCount) || 0,
    failureCount: Number(frame.failureCount) || 0,
    unknownCount: Number(frame.unknownCount) || 0,
    unmeasuredCount: Number(frame.unmeasuredCount) || 0,
    activeIncidents: Number(frame.activeIncidents) || 0,
    knownServiceRatio: Number.isFinite(Number(frame.knownServiceRatio))
      ? Number(frame.knownServiceRatio)
      : null,
    dominantStateReason: frame.dominantStateReason ?? null,
    modulation: clone(frame.modulation ?? {}),
    voices: Object.freeze((Array.isArray(frame.voices) ? frame.voices : []).map(telemetryVoice)),
  });
}

export function replayUrlForBlackBoxCartridge({
  origin = "https://atlas-systems.uk",
  cartridgeId,
  frameSeed,
  replaySeed = "A7A5",
  dominantState = "unknown",
  source = "fixture",
} = {}) {
  const url = new URL("/lab/system-symphony/replay/", origin);
  if (cartridgeId) url.searchParams.set("cartridge", cartridgeId);
  url.searchParams.set("frame", frameSeed ?? "pending");
  url.searchParams.set("seed", normaliseReplaySeed(replaySeed));
  url.searchParams.set("state", dominantState ?? "unknown");
  url.searchParams.set("source", normaliseSource(source));
  return url.href;
}

function sampleFreeGuardLabel(value, fallbackSampleFree = "yes") {
  const text = String(value ?? "").trim();
  if (text) return text;
  return `${fallbackSampleFree} / score-plan`;
}

export function createAtlasApuBlackBoxCartridge({
  frame,
  scorePlan,
  source = "fixture",
  routeMode = "PLAY",
  replaySeed = "A7A5",
  replayUrl,
  engineVersion = "unknown",
  commit = "unavailable",
  build = null,
  sampleFreeGuardStatus,
  origin = "https://atlas-systems.uk",
} = {}) {
  const plan = scorePlan ?? buildAtlasApuScorePlan(frame, { sourceMode: source });
  const snapshot = telemetrySnapshotForFrame(frame);
  const frameSeed = plan.seed ?? "pending";
  const resolvedSource = normaliseSource(source ?? plan.source);
  const resolvedRouteMode = normaliseRouteMode(routeMode);
  const resolvedReplaySeed = normaliseReplaySeed(replaySeed);
  const resolvedReplayUrl = replayUrl ?? replayUrlForBlackBoxCartridge({
    origin,
    cartridgeId: frameSeed,
    frameSeed,
    replaySeed: resolvedReplaySeed,
    dominantState: plan.dominantState,
    source: resolvedSource,
  });
  const sampleFree = plan.sampleFreeTarget === true ? "yes" : "no";
  const guardStatus = sampleFreeGuardLabel(sampleFreeGuardStatus, sampleFree);
  const stateVector = stateVectorFrom(plan, frame);

  return Object.freeze({
    schemaVersion: ATLAS_APU_BLACK_BOX_SCHEMA_VERSION,
    buildId: ATLAS_APU_BLACK_BOX_BUILD_ID,
    title: "ATLAS APU BLACK BOX CARTRIDGE",
    cartridgeId: frameSeed,
    frameId: String(plan.frameId ?? frameSeed),
    frameTime: snapshot.frameTime,
    telemetrySnapshot: snapshot,
    stateVector,
    dominantState: plan.dominantState ?? frame?.scoreState ?? "unknown",
    dominantLabel: plan.dominantLabel ?? frame?.scoreLabel ?? "Unknown",
    transition: clone(plan.transition ?? {}),
    movementName: plan.movement ?? "Unknown Drift",
    movement: plan.movement ?? "Unknown Drift",
    scorePlan: clone(plan),
    seed: frameSeed,
    frameSeed,
    source: resolvedSource,
    routeMode: resolvedRouteMode,
    replaySeed: resolvedReplaySeed,
    replayUrl: resolvedReplayUrl,
    engineVersion,
    scorePlanVersion: plan.buildId ?? "unknown",
    engineControlsVersion: build?.engineControlsVersion ?? "pending",
    commit: compactCommit(commit),
    commitBuild: Object.freeze({
      commit: compactCommit(commit),
      fullCommit: String(commit ?? "unavailable"),
      engineVersion,
      scorePlanVersion: plan.buildId ?? "unknown",
      recorderBuildId: ATLAS_APU_BLACK_BOX_BUILD_ID,
      archiveBuildId: build?.archiveBuildId ?? null,
    }),
    sampleFree,
    sampleFreeGuard: guardStatus,
    sampleFreeGuardStatus: guardStatus,
    evidence: clone(plan.evidence ?? {}),
    tempo: `${plan.tempo?.bpm ?? frame?.bpm ?? 100} BPM`,
    grid: plan.tempo?.grid ?? "16-step",
  });
}

export function createAtlasApuBlackBoxCartridgeFromArchiveEntry(entry = {}, {
  origin = "https://atlas-systems.uk",
  archiveBuildId = null,
} = {}) {
  return createAtlasApuBlackBoxCartridge({
    frame: entry.frame ?? entry.telemetrySnapshot,
    source: entry.source ?? "fixture",
    routeMode: entry.routeMode ?? "REPLAY",
    replaySeed: entry.replaySeed ?? "A7A5",
    replayUrl: entry.replayUrl,
    engineVersion: entry.engineVersion ?? "unknown",
    commit: entry.commit ?? "unavailable",
    origin,
    build: {
      archiveBuildId,
      engineControlsVersion: entry.engineControlsVersion ?? "pending",
    },
  });
}

export function materializeBlackBoxArchive(archive = {}, {
  origin = "https://atlas-systems.uk",
} = {}) {
  const entries = Array.isArray(archive.cartridges)
    ? archive.cartridges
    : Array.isArray(archive.frames)
      ? archive.frames
      : [];
  const cartridges = entries.map((entry) => {
    if (entry?.scorePlan && entry?.telemetrySnapshot) return Object.freeze(clone(entry));
    return createAtlasApuBlackBoxCartridgeFromArchiveEntry(entry, {
      origin,
      archiveBuildId: archive.archiveVersion ?? null,
    });
  });
  return Object.freeze({
    archiveVersion: archive.archiveVersion ?? ATLAS_APU_ARCHIVE_BUILD_ID,
    schemaVersion: archive.schemaVersion ?? ATLAS_APU_BLACK_BOX_SCHEMA_VERSION,
    generatedFrom: archive.generatedFrom ?? "unknown",
    generatedAt: archive.generatedAt ?? null,
    source: normaliseSource(archive.source ?? "fixture"),
    cartridges: Object.freeze(cartridges),
  });
}

export function frameFromBlackBoxCartridge(cartridge = {}) {
  const snapshot = cartridge.telemetrySnapshot ?? {};
  return {
    ...clone(snapshot),
    timestamp: snapshot.timestamp ?? snapshot.frameTime ?? cartridge.frameTime ?? null,
    previousScoreState: snapshot.previousScoreState ?? null,
    scoreState: snapshot.scoreState ?? cartridge.dominantState ?? "unknown",
    scoreLabel: snapshot.scoreLabel ?? cartridge.dominantLabel ?? "Unknown",
    stateVector: clone(snapshot.stateVector ?? cartridge.stateVector ?? {}),
    scorePlan: clone(cartridge.scorePlan ?? null),
  };
}

export function buildReplayScorePlanFromBlackBoxCartridge(cartridge = {}) {
  if (cartridge.scorePlan) return clone(cartridge.scorePlan);
  return buildAtlasApuScorePlan(frameFromBlackBoxCartridge(cartridge), {
    sourceMode: normaliseSource(cartridge.source),
  });
}

export function validateBlackBoxCartridge(cartridge = {}) {
  const missing = [];
  for (const key of [
    "schemaVersion",
    "frameTime",
    "telemetrySnapshot",
    "stateVector",
    "dominantState",
    "transition",
    "movementName",
    "scorePlan",
    "seed",
    "source",
    "routeMode",
    "replayUrl",
    "engineVersion",
    "commitBuild",
    "sampleFreeGuardStatus",
  ]) {
    if (cartridge[key] == null) missing.push(key);
  }
  const valid = missing.length === 0
    && cartridge.schemaVersion === ATLAS_APU_BLACK_BOX_SCHEMA_VERSION
    && typeof cartridge.replayUrl === "string"
    && cartridge.replayUrl.includes("/lab/system-symphony/replay/");
  return Object.freeze({ valid, missing: Object.freeze(missing) });
}

export function cartridgeSummary(cartridge = {}) {
  const vector = cartridge.stateVector ?? {};
  return `${cartridge.movementName ?? cartridge.movement ?? "Unknown Drift"} / ${cartridge.source ?? "unknown"} / ${cartridge.seed ?? "pending"} / H:${percentage(vector.healthy)} W:${percentage(vector.warning)} C:${percentage(vector.critical)} U:${percentage(vector.unknown)}`;
}
