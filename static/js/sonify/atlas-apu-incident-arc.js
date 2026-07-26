/**
 * Atlas APU incident arc recorder.
 *
 * Phase 10 groups saved black-box cartridges into deterministic movements.
 * Storage remains static fixture JSON; no live persistence is introduced here.
 */

import {
  ATLAS_APU_BLACK_BOX_SCHEMA_VERSION,
  createAtlasApuBlackBoxCartridgeFromArchiveEntry,
  validateBlackBoxCartridge,
} from "./atlas-apu-flight-recorder.js?v=20260726-atlas-apu-black-box-v1";

export const ATLAS_APU_INCIDENT_ARC_SCHEMA_VERSION = "atlas-apu-incident-arc/v1";
export const ATLAS_APU_INCIDENT_ARC_BUILD_ID = "20260726-atlas-apu-incident-arc-v1";
export const ATLAS_APU_INCIDENT_ARC_ARCHIVE_BUILD_ID = "20260726-atlas-apu-incident-arc-static-v1";

const AFFECTED_STATUSES = new Set(["degraded", "down", "critical", "warning", "unknown"]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normaliseSource(value) {
  const source = String(value ?? "").toLowerCase();
  if (source === "preview") return "fixture";
  if (source === "demo") return "replay";
  if (["fixture", "live", "live stale", "replay", "stale"].includes(source)) return source;
  return "unknown";
}

function normaliseReplaySeed(value) {
  const seed = String(value ?? "").trim().toUpperCase();
  return /^[0-9A-F]{4,8}$/.test(seed) ? seed : "A7A5";
}

function formatIsoTime(value) {
  if (!value) return "pending";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function affectedServicesFrom(cartridges) {
  const services = new Map();
  for (const cartridge of cartridges) {
    const voices = cartridge.telemetrySnapshot?.voices ?? [];
    for (const voice of voices) {
      const status = String(voice.status ?? "unknown").toLowerCase();
      const affected = AFFECTED_STATUSES.has(status) || voice.measured === false;
      if (!affected) continue;
      const existing = services.get(voice.name) ?? {
        name: voice.name,
        displayName: voice.displayName ?? voice.name,
        statuses: new Set(),
        firstSeen: cartridge.frameTime,
        lastSeen: cartridge.frameTime,
        measured: voice.measured !== false,
      };
      existing.statuses.add(status);
      existing.lastSeen = cartridge.frameTime;
      existing.measured = existing.measured && voice.measured !== false;
      services.set(voice.name, existing);
    }
  }
  return Object.freeze([...services.values()].map((service) => Object.freeze({
    name: service.name,
    displayName: service.displayName,
    statuses: Object.freeze([...service.statuses]),
    firstSeen: service.firstSeen,
    lastSeen: service.lastSeen,
    measured: service.measured,
  })));
}

function recoveryMarkerFrom(cartridges) {
  const firstCritical = cartridges.findIndex((cartridge) => cartridge.dominantState === "critical");
  const healthyIndex = cartridges.findIndex((cartridge, index) => (
    index > firstCritical && cartridge.dominantState === "healthy"
  ));
  const warningIndex = cartridges.findIndex((cartridge, index) => (
    index > firstCritical && cartridge.dominantState === "warning"
  ));
  const recoveryIndex = healthyIndex >= 0 ? healthyIndex : warningIndex;
  if (firstCritical < 0 || recoveryIndex < 0) return null;
  const cartridge = cartridges[recoveryIndex];
  return Object.freeze({
    index: recoveryIndex,
    cartridgeId: cartridge.cartridgeId,
    frameTime: cartridge.frameTime,
    state: cartridge.dominantState,
    label: cartridge.dominantState === "healthy" ? "Recovered" : "Recovering",
  });
}

export function replayUrlForIncidentArc({
  origin = "https://atlas-systems.uk",
  incidentId,
  replaySeed = "A7A5",
  source = "fixture",
} = {}) {
  const url = new URL("/lab/system-symphony/replay/", origin);
  url.searchParams.set("incident", incidentId ?? "pending");
  url.searchParams.set("seed", normaliseReplaySeed(replaySeed));
  url.searchParams.set("source", normaliseSource(source));
  return url.href;
}

export function createAtlasApuIncidentArc(entry = {}, {
  origin = "https://atlas-systems.uk",
  archiveBuildId = null,
} = {}) {
  const source = normaliseSource(entry.source ?? "fixture");
  const replaySeed = normaliseReplaySeed(entry.replaySeed);
  const frames = Array.isArray(entry.frames) ? entry.frames : [];
  const frameCartridges = Object.freeze(frames.map((frameEntry, index) => {
    const cartridge = createAtlasApuBlackBoxCartridgeFromArchiveEntry({
      ...frameEntry,
      source: frameEntry.source ?? source,
      routeMode: frameEntry.routeMode ?? "REPLAY",
      replaySeed: frameEntry.replaySeed ?? replaySeed,
      engineVersion: frameEntry.engineVersion ?? entry.engineVersion,
      commit: frameEntry.commit ?? entry.commit,
    }, {
      origin,
      archiveBuildId,
    });
    return Object.freeze({
      ...cartridge,
      incidentFrame: Object.freeze({
        index,
        phase: frameEntry.phase ?? `stage-${index + 1}`,
        label: frameEntry.label ?? cartridge.movementName,
      }),
    });
  }));
  const startTime = formatIsoTime(entry.startTime ?? frameCartridges[0]?.frameTime);
  const endTime = formatIsoTime(entry.endTime ?? frameCartridges.at(-1)?.frameTime);
  const stateTransitionPath = Object.freeze(
    Array.isArray(entry.stateTransitionPath) && entry.stateTransitionPath.length
      ? entry.stateTransitionPath.map(String)
      : frameCartridges.map((cartridge) => cartridge.dominantState),
  );

  return Object.freeze({
    schemaVersion: ATLAS_APU_INCIDENT_ARC_SCHEMA_VERSION,
    buildId: ATLAS_APU_INCIDENT_ARC_BUILD_ID,
    archiveBuildId,
    cartridgeSchemaVersion: ATLAS_APU_BLACK_BOX_SCHEMA_VERSION,
    incidentId: String(entry.incidentId ?? entry.id ?? "incident-pending"),
    title: String(entry.title ?? "Atlas APU Incident Arc"),
    movementName: String(entry.movementName ?? entry.title ?? "Incident Replay"),
    startTime,
    endTime,
    source,
    routeMode: "REPLAY",
    replaySeed,
    replayUrl: entry.replayUrl ?? replayUrlForIncidentArc({
      origin,
      incidentId: entry.incidentId ?? entry.id,
      replaySeed,
      source,
    }),
    stateTransitionPath,
    affectedServices: affectedServicesFrom(frameCartridges),
    recoveryMarker: recoveryMarkerFrom(frameCartridges),
    frameCartridges,
    frameCount: frameCartridges.length,
    sampleFreeGuardStatus: frameCartridges.every((cartridge) => cartridge.sampleFree === "yes")
      ? "yes / cartridge-sequence"
      : "no / cartridge-sequence",
    notes: clone(entry.notes ?? []),
  });
}

export function materializeIncidentArcArchive(archive = {}, {
  origin = "https://atlas-systems.uk",
} = {}) {
  const arcs = (Array.isArray(archive.incidentArcs) ? archive.incidentArcs : [])
    .map((entry) => createAtlasApuIncidentArc(entry, {
      origin,
      archiveBuildId: archive.archiveVersion ?? ATLAS_APU_INCIDENT_ARC_ARCHIVE_BUILD_ID,
    }));
  return Object.freeze({
    archiveVersion: archive.archiveVersion ?? ATLAS_APU_INCIDENT_ARC_ARCHIVE_BUILD_ID,
    schemaVersion: archive.schemaVersion ?? ATLAS_APU_INCIDENT_ARC_SCHEMA_VERSION,
    generatedFrom: archive.generatedFrom ?? "unknown",
    generatedAt: archive.generatedAt ?? null,
    source: normaliseSource(archive.source ?? "fixture"),
    incidentArcs: Object.freeze(arcs),
  });
}

export function validateIncidentArc(arc = {}) {
  const missing = [];
  for (const key of [
    "schemaVersion",
    "incidentId",
    "title",
    "startTime",
    "endTime",
    "stateTransitionPath",
    "affectedServices",
    "recoveryMarker",
    "replayUrl",
    "frameCartridges",
  ]) {
    if (arc[key] == null) missing.push(key);
  }
  const cartridges = Array.isArray(arc.frameCartridges) ? arc.frameCartridges : [];
  const invalidCartridges = cartridges
    .map((cartridge, index) => ({ index, validation: validateBlackBoxCartridge(cartridge) }))
    .filter(({ validation }) => !validation.valid);
  const valid = missing.length === 0
    && arc.schemaVersion === ATLAS_APU_INCIDENT_ARC_SCHEMA_VERSION
    && cartridges.length > 1
    && invalidCartridges.length === 0
    && typeof arc.replayUrl === "string"
    && arc.replayUrl.includes("/lab/system-symphony/replay/");
  return Object.freeze({
    valid,
    missing: Object.freeze(missing),
    invalidCartridges: Object.freeze(invalidCartridges),
  });
}

export function incidentArcSummary(arc = {}) {
  const path = Array.isArray(arc.stateTransitionPath) ? arc.stateTransitionPath.join(" -> ") : "unknown";
  return `${arc.title ?? "Incident Arc"} / ${arc.source ?? "unknown"} / ${path} / ${arc.frameCount ?? 0} frames`;
}
