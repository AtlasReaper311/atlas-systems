"use strict";

/* DEVELOPMENT-ONLY. Bounded living-motion helpers for the flagship final-form
 * prototype. Not imported by the shipped renderer.
 *
 * Contract:
 * - no per-frame Math.random
 * - no monotonic whole-object yaw
 * - field homes are distributed around the sphere
 * - field centres wander by reversing local oscillators, then normalise
 * - a migrating activity focus creates temporary hemispheric dominance
 * - attitude is bounded and spring-damped
 * - rare healthy gestures come from a long-horizon deterministic scheduler
 * - the scheduler is organism identity, not the selected telemetry scenario
 */

import { deterministicUnit } from "../spectral-field-model.js";

const TAU = Math.PI * 2;
export const CAMERA_DISTANCE = 4.42;
export const CAMERA_FOV_DEG = 28.5;
export const PRESENTATION_MARGIN = 0.07;
export const REST_COMFORT_EXTENT = 1.42;
export const MIN_PRESENTATION_SCALE = 0.56;
export const MAX_CAMERA_DISTANCE = CAMERA_DISTANCE * 1.12;
const FIELD_COUNT = 7;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const OCCASIONAL_FAMILIES = Object.freeze(["fold", "bloom", "inversion", "flatten", "lobe"]);
export const MAX_FISSION_DAUGHTERS = 3;
export const DEBUG_FISSION_START = 3;

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function hypot3(x, y, z) {
  return Math.hypot(x, y, z) || 1;
}

export function audioMix(audioActive) {
  if (typeof audioActive === "number") return clamp(audioActive);
  return audioActive ? 1 : 0;
}

export function normalize3(x, y, z) {
  const inv = 1 / hypot3(x, y, z);
  return { x: x * inv, y: y * inv, z: z * inv };
}

function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function audioLife(audioActive) {
  const mix = audioMix(audioActive);
  return {
    recruit: mix,
    ridge: mix,
    pulse: mix,
  };
}

function mixUnit(seedPhase, _scenarioId, lane, index) {
  return deterministicUnit(Number(seedPhase) || 0, lane + index * 17);
}

function laneFor(kind) {
  if (kind === "fission") return 8300;
  if (kind === "rare") return 8100;
  return 8200;
}

function safeFissionAxis(seedPhase, scenarioId, index) {
  let best = null;
  let bestScore = Infinity;
  for (let candidate = 0; candidate < 6; candidate += 1) {
    const u = mixUnit(seedPhase, scenarioId, 8400 + candidate, index);
    const v = mixUnit(seedPhase, scenarioId, 8410 + candidate, index);
    const yaw = (u < 0.3 ? -0.58 : 0.82 + (u - 0.3) * 0.55);
    const pitch = (v - 0.42) * 1.05;
    const axis = normalize3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch) * 0.92,
      0.22 + Math.abs(Math.cos(yaw)) * 0.18,
    );
    const screen = Math.hypot(axis.x, axis.y);
    const score = Math.abs(screen - 0.86)
      + Math.max(0, Math.abs(axis.x) - 0.82) * 2.4
      + Math.abs(axis.z - 0.28) * 0.45;
    if (score < bestScore) {
      bestScore = score;
      best = axis;
    }
  }
  return best;
}

function eventSpec(kind, index, seedPhase, scenarioId) {
  const lane = laneFor(kind);
  const a = mixUnit(seedPhase, scenarioId, lane, index);
  const b = mixUnit(seedPhase, scenarioId, lane + 1, index);
  const c = mixUnit(seedPhase, scenarioId, lane + 2, index);
  const d = mixUnit(seedPhase, scenarioId, lane + 3, index);
  if (kind === "fission") {
    const roll = mixUnit(seedPhase, scenarioId, 8320, index);
    let count = 1;
    let secondaryScale = 0;
    if (roll > 0.985) {
      count = 3;
      secondaryScale = 0.13 + b * 0.04;
    } else if (roll > 0.74) {
      count = 2;
      secondaryScale = roll > 0.94 ? 0.22 + b * 0.06 : 0.12 + b * 0.05;
    }
    return {
      kind,
      family: "fission",
      duration: 12.8 + b * 3.4,
      gap: 168 + c * 152,
      intensity: 0.88 + b * 0.12,
      axisJitter: d,
      count,
      primaryScale: 0.34 + d * 0.1 + (d > 0.84 ? 0.05 : 0),
      secondaryScale,
      peakDistance: 1.48 + a * 0.28,
      axis: safeFissionAxis(seedPhase, scenarioId, index),
    };
  }
  if (kind === "rare") {
    return {
      kind,
      family: a < 0.58 ? "neck" : "droplet",
      duration: 3.4 + b * 2.4,
      gap: 102 + c * 78,
      intensity: 0.78 + b * 0.22,
      axisJitter: d,
    };
  }
  return {
    kind,
    family: OCCASIONAL_FAMILIES[Math.floor(a * OCCASIONAL_FAMILIES.length) % OCCASIONAL_FAMILIES.length],
    duration: 1.7 + b * 2.2,
    gap: 16 + c * 26,
    intensity: 0.42 + b * 0.4,
    axisJitter: d,
  };
}

function firstEventTime(kind, seedPhase, scenarioId) {
  if (kind === "fission") return 63 + mixUnit(seedPhase, scenarioId, 8003, 0) * 34;
  if (kind === "rare") return 128 + mixUnit(seedPhase, scenarioId, 8001, 0) * 42;
  return 11 + mixUnit(seedPhase, scenarioId, 8002, 0) * 16;
}

export function iterateLifeEvents(kind, seedPhase, scenarioId, untilTime, limit = 64) {
  const events = [];
  let time = firstEventTime(kind, seedPhase, scenarioId);
  for (let index = 0; index < limit; index += 1) {
    const spec = eventSpec(kind, index, seedPhase, scenarioId);
    const gap = Math.max(spec.gap, spec.duration + 3);
    if (time > untilTime) break;
    events.push({ ...spec, index, start: time, end: time + spec.duration });
    time += gap;
  }
  return events;
}

function activeStreamEvent(kind, lifeTime, seedPhase, scenarioId) {
  const events = iterateLifeEvents(kind, seedPhase, scenarioId, lifeTime + 8, 48);
  for (const event of events) {
    if (lifeTime >= event.start && lifeTime < event.end) {
      return { ...event, progress: (lifeTime - event.start) / Math.max(0.001, event.duration) };
    }
  }
  return null;
}

export function scheduledLifeEvent(lifeTime, seedPhase, scenarioId = "") {
  const time = Number(lifeTime) || 0;
  return activeStreamEvent("fission", time, seedPhase, scenarioId)
    ?? activeStreamEvent("rare", time, seedPhase, scenarioId)
    ?? activeStreamEvent("occasional", time, seedPhase, scenarioId);
}

export function readDebugGesture(search) {
  const raw = search == null
    ? (typeof location !== "undefined" ? location.search : "")
    : String(search);
  try {
    return new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw).get("debug-gesture") || "";
  } catch {
    return "";
  }
}

function windowGain(progress, start, peak, end) {
  if (progress <= start || progress >= end) return 0;
  if (progress < peak) return smoothstep((progress - start) / Math.max(0.001, peak - start));
  return smoothstep((end - progress) / Math.max(0.001, end - peak));
}

function smoothstep(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function fissionPhaseName(progress) {
  if (progress < 0.12) return "gather";
  if (progress < 0.22) return "lobe";
  if (progress < 0.36) return "neck";
  if (progress < 0.44) return "pinch";
  if (progress < 0.52) return "detach";
  if (progress < 0.68) return "independent";
  if (progress < 0.82) return "return";
  if (progress < 0.90) return "contact";
  if (progress < 0.97) return "pour";
  return "settle";
}

function fissionDistance(progress, peak) {
  if (progress < 0.42) return 0.52 + smoothstep(progress / 0.42) * 0.78;
  if (progress < 0.68) return 1.3 + smoothstep((progress - 0.42) / 0.26) * (peak - 1.3);
  const t = clamp((progress - 0.68) / 0.32);
  return peak + (0.18 - peak) * (t * t);
}

function fissionScale(progress, size) {
  if (progress < 0.07) return 0;
  if (progress < 0.22) return (0.05 + (size * 0.52 - 0.05) * smoothstep((progress - 0.07) / 0.15));
  if (progress < 0.44) return size * (0.52 + 0.48 * smoothstep((progress - 0.22) / 0.22));
  if (progress < 0.86) return size;
  if (progress < 0.97) return size * (1 - smoothstep((progress - 0.86) / 0.11));
  return 0;
}

function tangentOf(axis) {
  const up = Math.abs(axis.y) < 0.82 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  return normalize3(
    up.y * axis.z - up.z * axis.y,
    up.z * axis.x - up.x * axis.z,
    up.x * axis.y - up.y * axis.x,
  );
}

export function idleFissionState() {
  return {
    active: false,
    debug: false,
    progress: 0,
    phase: "idle",
    start: 0,
    end: 0,
    duration: 0,
    index: -1,
    count: 0,
    gather: 0,
    pinch: 0,
    lobe: 0,
    gap: 0,
    scar: 0,
    reach: 0,
    axis: { x: 0, y: 1, z: 0 },
    daughters: [],
    extent: 0,
    lookahead: 0,
    independent: false,
  };
}

function daughterFromEvent(event, progress, delay, size, jitter) {
  const local = clamp((progress - delay) / Math.max(0.001, 1 - delay));
  const distance = fissionDistance(local, event.peakDistance * (0.86 + jitter * 0.12));
  const scale = fissionScale(local, size);
  const axis = event.axis;
  const tangent = tangentOf(axis);
  const drift = Math.sin(local * Math.PI) * (0.08 + jitter * 0.07) * (local > 0.42 && local < 0.86 ? 1 : 0.35);
  const x = axis.x * distance + tangent.x * drift;
  const y = axis.y * distance + tangent.y * drift;
  const z = axis.z * distance + tangent.z * drift;
  const independent = local >= 0.44 && local < 0.86 && scale > 0.08 && distance > 1.28;
  const contained = local >= 0.97 || scale < 0.01;
  return {
    scale,
    distance,
    x,
    y,
    z,
    size,
    independent,
    contained,
    visible: scale > 0.004 && !contained,
  };
}

export function evaluateFission(lifeTime, seedPhase, scenarioId = "", debugGesture = "") {
  const time = Number(lifeTime) || 0;
  const debug = String(debugGesture || "") === "fission";
  let event = activeStreamEvent("fission", time, seedPhase, scenarioId);
  if (debug) {
    const spec = eventSpec("fission", 0, seedPhase, scenarioId);
    event = {
      ...spec,
      index: 0,
      start: DEBUG_FISSION_START,
      end: DEBUG_FISSION_START + spec.duration,
      progress: (time - DEBUG_FISSION_START) / Math.max(0.001, spec.duration),
      debug: true,
    };
    if (time < event.start || time >= event.end) return { ...idleFissionState(), debug: true };
  } else if (!event) {
    return idleFissionState();
  }

  const progress = clamp(event.progress);
  const axis = event.axis || safeFissionAxis(seedPhase, scenarioId, event.index);
  const daughters = [
    daughterFromEvent(event, progress, 0, event.primaryScale, event.axisJitter),
  ];
  if (event.count >= 2) {
    daughters.push(daughterFromEvent(event, progress, 0.08, event.secondaryScale || 0.14, 1 - event.axisJitter));
  }
  if (event.count >= 3) {
    daughters.push(daughterFromEvent(event, progress, 0.14, Math.max(0.1, (event.secondaryScale || 0.12) * 0.72), event.axisJitter * 0.4));
  }

  let extent = 1.12;
  for (const daughter of daughters) {
    if (!daughter.visible) continue;
    extent = Math.max(extent, daughter.distance + daughter.scale * 1.12);
  }
  const lookahead = event.peakDistance + (event.primaryScale || 0.34) * 1.18;

  return {
    active: true,
    debug,
    progress,
    phase: fissionPhaseName(progress),
    start: event.start,
    end: event.end,
    duration: event.duration,
    index: event.index,
    count: event.count,
    gather: windowGain(progress, 0, 0.12, 0.3) + windowGain(progress, 0.68, 0.84, 0.93) * 0.45,
    pinch: windowGain(progress, 0.14, 0.34, 0.52),
    lobe: Math.max(windowGain(progress, 0.08, 0.24, 0.46), windowGain(progress, 0.66, 0.84, 0.94) * 0.78),
    gap: windowGain(progress, 0.42, 0.58, 0.84),
    scar: windowGain(progress, 0.88, 0.95, 1.02),
    reach: windowGain(progress, 0.66, 0.84, 0.94),
    axis,
    daughters,
    extent,
    lookahead,
    independent: daughters.some((daughter) => daughter.independent),
  };
}

export function estimateOrganismExtent(gesture, fission, activity = 0.4) {
  const parent = 1.16
    + (1 - (gesture?.cohesion ?? 1)) * 0.12
    + (gesture?.bloom ?? 0) * 0.09
    + activity * 0.07;
  const peak = 1.16 + activity * 0.22 + (gesture?.bloom ?? 0) * 0.14;
  const fissionExtent = fission?.active ? fission.extent : 0;
  const satellites = 0.32 + activity * 0.08;
  return Math.max(parent, peak, fissionExtent, satellites);
}

export function anticipateExtent(gesture, fission, activity = 0.4) {
  const now = estimateOrganismExtent(gesture, fission, activity);
  if (!fission?.active) return now;
  const lookahead = Math.max(fission.lookahead || 0, fission.extent || 0);
  const bias = clamp((fission.progress ?? 0) / 0.4 + 0.35);
  return Math.max(now, now + (lookahead - now) * bias);
}

export function restHalfHeight(distance = CAMERA_DISTANCE) {
  return distance * Math.tan((CAMERA_FOV_DEG * Math.PI / 180) / 2);
}

export function presentationTarget(extent, aspect = 1.6) {
  const desired = Math.max(extent, 0) * (1 + PRESENTATION_MARGIN);
  const overflow = Math.max(1, desired / REST_COMFORT_EXTENT);
  const extra = overflow - 1;
  const scale = clamp(1 / (1 + extra * 0.92), MIN_PRESENTATION_SCALE, 1);
  const distance = clamp(CAMERA_DISTANCE * (1 + extra * 0.22), CAMERA_DISTANCE, MAX_CAMERA_DISTANCE);
  const wide = aspect > 1.55;
  return { scale, distance, overflow, extra, wide };
}

export function projectedContainment(extent, framing, aspect = 1.6) {
  const wide = aspect > 1.55;
  const baseScale = wide ? 1.08 : 0.89;
  const scale = framing?.scale ?? 1;
  const distance = framing?.distance ?? CAMERA_DISTANCE;
  const world = extent * baseScale * scale;
  const restWorld = REST_COMFORT_EXTENT * baseScale;
  const cameraRatio = CAMERA_DISTANCE / Math.max(distance, CAMERA_DISTANCE);
  const apparent = world * cameraRatio;
  return {
    world,
    restWorld,
    apparent,
    contained: apparent <= restWorld * (1 + PRESENTATION_MARGIN),
    ratio: apparent / restWorld,
  };
}

export function createSafeFramingState() {
  return {
    distance: CAMERA_DISTANCE,
    scale: 1,
    velocity: 0,
    scaleVelocity: 0,
    lastTime: null,
    extent: 1,
    lookahead: 1,
    maxExtent: 1,
  };
}

export function stepSafeFraming(state, extent, visualTime, lookahead = extent, aspect = 1.6) {
  if (!state) return createSafeFramingState();
  const previous = state.lastTime;
  const desired = Math.max(extent, lookahead);
  state.extent = extent;
  state.lookahead = lookahead;
  state.maxExtent = Math.max(state.maxExtent, desired);
  const target = presentationTarget(desired, aspect);
  if (previous == null || rawDtUnusable(previous, visualTime)) {
    if (previous == null && desired <= REST_COMFORT_EXTENT) {
      state.distance = target.distance;
      state.scale = target.scale;
      state.velocity = 0;
      state.scaleVelocity = 0;
    }
    state.lastTime = visualTime;
    return state;
  }
  const dt = clamp(visualTime - previous, 0.001, 0.05);
  state.lastTime = visualTime;
  const expanding = target.scale < state.scale - 1e-4 || target.distance > state.distance + 1e-4;
  const omega = expanding ? 2.15 : 0.58;
  const damp = 2 * omega;
  const distanceAccel = omega * omega * (target.distance - state.distance) - damp * state.velocity;
  const scaleAccel = omega * omega * (target.scale - state.scale) - damp * state.scaleVelocity;
  state.velocity += distanceAccel * dt;
  state.scaleVelocity += scaleAccel * dt;
  state.distance += state.velocity * dt;
  state.scale += state.scaleVelocity * dt;
  state.distance = clamp(state.distance, CAMERA_DISTANCE, MAX_CAMERA_DISTANCE);
  state.scale = clamp(state.scale, MIN_PRESENTATION_SCALE, 1);
  return state;
}

function rawDtUnusable(previous, visualTime) {
  const rawDt = visualTime - previous;
  return rawDt > 0.25 || rawDt < 0;
}

function eventEnvelope(progress) {
  const rise = clamp(progress / 0.22);
  const fall = clamp((1 - progress) / 0.22);
  const edge = Math.min(rise, fall);
  return edge * edge * (3 - 2 * edge);
}

export function fieldHome(seed) {
  const { a, b, index } = seed;
  const y = 1 - ((index + 0.5) / FIELD_COUNT) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const azimuth = index * GOLDEN_ANGLE + (a - 0.5) * 0.62;
  return normalize3(
    radius * Math.cos(azimuth),
    clamp(y + (b - 0.5) * 0.18, -0.92, 0.92),
    radius * Math.sin(azimuth),
  );
}

export function activityFocus(visualTime, seedPhase) {
  const side = Math.sin(visualTime * 0.19 + seedPhase) * 0.82
    + Math.sin(visualTime * 0.31 + seedPhase * 1.37) * 0.64
    + Math.sin(visualTime * 0.47 + seedPhase * 0.41) * 0.28;
  const y = Math.sin(visualTime * 0.29 + seedPhase * 0.8) * 0.42
    + Math.sin(visualTime * 0.41 + seedPhase * 1.7) * 0.16;
  const z = Math.cos(visualTime * 0.37 + seedPhase * 1.1) * 0.62
    + Math.sin(visualTime * 0.19 + seedPhase) * 0.22;
  return normalize3(side, y, z);
}

export function focusWeight(centre, focus) {
  const align = centre.x * focus.x + centre.y * focus.y + centre.z * focus.z;
  return 0.54 + 0.46 * clamp(0.5 + 0.5 * align);
}

export function livingGesture(phase, seedPhase, audioActive, damage, visualTime, scenarioId, debugGesture) {
  const mix = audioMix(audioActive);
  const slow = 0.5 + 0.5 * Math.sin(phase * 0.241 + seedPhase);
  const slower = 0.5 + 0.5 * Math.sin(phase * 0.176 + seedPhase * 1.7);
  const beat = 0.5 + 0.5 * Math.sin(phase * 0.337 + seedPhase * 0.5);
  const alignment = clamp(slow * 0.52 + slower * 0.28 + beat * 0.2);
  const common = clamp((alignment - 0.38) / 0.44);
  const peaked = common * common;
  const opportunity = clamp(peaked * (1 + mix * 0.12) + damage * 0.05 * peaked);
  const kind = 0.5 + 0.5 * Math.sin(phase * 0.41 + seedPhase * 2.3);

  function gate(lo, hi) {
    const mid = (lo + hi) * 0.5;
    const half = Math.max(0.04, (hi - lo) * 0.5);
    return clamp(1 - Math.abs(kind - mid) / half);
  }

  let bloom = opportunity * gate(0, 0.36);
  let fold = opportunity * gate(0.22, 0.62);
  let inversion = opportunity * gate(0.48, 0.78);
  let flatten = opportunity * gate(0.82, 1.08);
  let neck = 0;
  let droplet = 0;

  const lifeTime = visualTime ?? phase;
  const fission = evaluateFission(lifeTime, seedPhase, scenarioId, debugGesture);
  const scheduled = fission.active
    ? {
        kind: "fission",
        family: "fission",
        start: fission.start,
        end: fission.end,
        duration: fission.duration,
        index: fission.index,
        progress: fission.progress,
        intensity: 1,
      }
    : scheduledLifeEvent(lifeTime, seedPhase, scenarioId);
  if (scheduled && scheduled.family !== "fission") {
    const env = eventEnvelope(scheduled.progress) * scheduled.intensity * (1 + mix * 0.08);
    if (scheduled.family === "bloom") bloom = Math.max(bloom, env);
    if (scheduled.family === "fold") fold = Math.max(fold, env);
    if (scheduled.family === "inversion") inversion = Math.max(inversion, env);
    if (scheduled.family === "flatten") flatten = Math.max(flatten, env);
    if (scheduled.family === "lobe") {
      fold = Math.max(fold, env * 0.72);
      bloom = Math.max(bloom, env * 0.4);
    }
    if (scheduled.family === "neck") neck = env;
    if (scheduled.family === "droplet") {
      neck = Math.max(neck, env * 0.62);
      droplet = env;
    }
  }
  if (fission.active) {
    const amp = 1 + mix * 0.08;
    neck = Math.max(neck, fission.pinch * amp);
    droplet = Math.max(droplet, fission.lobe * 0.55 * amp);
    bloom = Math.max(bloom, fission.lobe * 0.28 * amp);
    fold = Math.max(fold, fission.pinch * 0.22 * amp);
  }

  const cohesion = clamp(1 - neck * 0.92 - droplet * 0.18 - flatten * 0.12 - (fission.pinch || 0) * 0.08, 0.16, 1);
  const neckAxis = fission.active
    ? fission.axis
    : normalize3(
      Math.sin(phase * 0.067 + seedPhase) + 0.35 * Math.sin(phase * 0.119 + seedPhase * 0.8),
      Math.cos(phase * 0.083 + seedPhase * 1.4) + 0.28 * Math.sin(phase * 0.141 + seedPhase * 0.2),
      Math.sin(phase * 0.097 + seedPhase * 0.6) + 0.31 * Math.cos(phase * 0.053 + seedPhase * 1.9),
    );

  return {
    opportunity,
    bloom,
    fold,
    inversion,
    droplet,
    flatten,
    neck,
    cohesion,
    neckAxis,
    scheduled,
    fission,
  };
}

export function fieldCentre(phase, seed, activity, audioActive, gesture) {
  const { a, b, c, d, e, index } = seed;
  const home = fieldHome(seed);
  const up = Math.abs(home.y) < 0.82
    ? { x: 0, y: 1, z: 0 }
    : { x: 1, y: 0, z: 0 };
  const tangent = normalize3(
    up.y * home.z - up.z * home.y,
    up.z * home.x - up.x * home.z,
    up.x * home.y - up.y * home.x,
  );
  const bitangent = cross3(home, tangent);
  const medium = (0.113 + c * 0.021) * (1 + activity * 0.1);
  const event = (gesture?.bloom ?? 0) * 0.18 + (gesture?.inversion ?? 0) * 0.28;
  const amp = 1 + event;
  const u = (
    Math.sin(phase * (0.067 + c * 0.018) + a * TAU) * (0.42 + d * 0.14)
    + Math.sin(phase * medium + e * TAU) * (0.34 + b * 0.12)
    + Math.sin(phase * (0.181 + a * 0.015) + c * TAU + index) * 0.16
  ) * amp;
  const v = (
    Math.sin(phase * (0.079 + d * 0.019) + b * TAU) * (0.36 + e * 0.12)
    + Math.cos(phase * (0.141 + a * 0.016) + e * TAU) * 0.2
    + Math.sin(phase * (0.203 + c * 0.013) + index * 1.17) * 0.1
  ) * amp;
  return normalize3(
    home.x + tangent.x * u + bitangent.x * v,
    home.y + tangent.y * u + bitangent.y * v,
    home.z + tangent.z * u + bitangent.z * v,
  );
}

export function fieldLife(phase, seed, mapped, damage, audioActive, gesture) {
  const mix = audioMix(audioActive);
  const { a, b, c, d, e, index } = seed;
  const polarityHold = Math.sin(phase * (0.067 + d * 0.031) + e * TAU);
  const polarityWave = Math.sin(phase * (0.19 + d * 0.13) + e * TAU + index * 0.83);
  const inversion = gesture?.inversion ?? 0;
  const polarity = Math.tanh(polarityHold * 1.35 + polarityWave * (0.95 + inversion * 0.7));
  const slowMass = 0.5 + 0.5 * Math.sin(phase * (0.049 + e * 0.017) + a * TAU);
  const mediumPulse = 0.5 + 0.5 * Math.sin(phase * (0.21 + d * 0.09) + c * TAU);
  const twitch = 0.5 + 0.5 * Math.sin(phase * (0.47 + b * 0.11) + e * TAU);
  const flatten = 1 - (gesture?.flatten ?? 0) * 0.55;
  const bloom = 1 + (gesture?.bloom ?? 0) * 0.45;
  const life = (0.48 + 0.22 * slowMass + 0.18 * mediumPulse + 0.08 * twitch) * flatten;
  const sigma = 0.29 + c * 0.22 + (gesture?.fold ?? 0) * 0.05 + inversion * 0.04;
  return {
    polarity,
    life,
    sigma,
    strengthScale: life * bloom * (0.82 + b * 0.4),
    crestScale: bloom * (1 + (gesture?.fold ?? 0) * 0.35 + mix * 0.12),
    swirlScale: 1 + inversion * 0.55 + mix * 0.08,
    flowScale: 1 + (mapped?.displacement ?? 0) * 0.08 + mix * 0.06,
    waveRate: 1.38 + index * 0.17,
  };
}

export function mesoDrive(phase, seedPhase, audioActive, gesture, focus) {
  const mix = audioMix(audioActive);
  const travel = phase * (0.37 + (gesture?.fold ?? 0) * 0.12)
    + Math.sin(phase * 0.19 + seedPhase) * 0.8
    + mix * 0.12 * Math.sin(phase * 0.73 + seedPhase);
  const axis = normalize3(
    Math.sin(phase * 0.057 + seedPhase) + 0.4 * Math.sin(phase * 0.113 + seedPhase * 1.2),
    Math.cos(phase * 0.071 + seedPhase * 0.7) + 0.33 * Math.sin(phase * 0.149 + seedPhase),
    Math.sin(phase * 0.043 + seedPhase * 1.6) + 0.36 * Math.cos(phase * 0.101 + seedPhase * 0.4),
  );
  if (!focus) return { x: axis.x, y: axis.y, z: axis.z, w: travel };
  const blended = normalize3(
    axis.x * 0.58 + focus.x * 0.42,
    axis.y * 0.58 + focus.y * 0.42,
    axis.z * 0.58 + focus.z * 0.42,
  );
  return { x: blended.x, y: blended.y, z: blended.z, w: travel };
}

export function attitudeTarget(phase, centroid, tilt, torsion, seedPhase) {
  const yaw = Math.sin(phase * 0.047 + seedPhase) * 0.1
    + Math.sin(phase * 0.079 + seedPhase * 1.3) * 0.062
    + Math.sin(phase * 0.127 + seedPhase * 0.4) * 0.034
    + centroid.x * 0.04
    + torsion * 0.18;
  const pitch = Math.sin(phase * 0.053 + seedPhase * 0.7) * 0.072
    + Math.sin(phase * 0.091 + seedPhase * 1.9) * 0.04
    + centroid.y * 0.046
    + tilt * 0.24;
  const roll = Math.sin(phase * 0.061 + seedPhase * 1.1) * 0.048
    + Math.sin(phase * 0.103 + seedPhase * 0.2) * 0.026
    + centroid.z * 0.03;
  return {
    x: clamp(0.035 + pitch, -0.22, 0.26),
    y: clamp(-0.07 + yaw, -0.24, 0.18),
    z: clamp(-0.018 + roll, -0.14, 0.12),
  };
}

export function createAttitudeState() {
  return {
    x: 0.055,
    y: -0.08,
    z: -0.025,
    vx: 0,
    vy: 0,
    vz: 0,
    lastTime: null,
  };
}

export function stepAttitude(state, target, visualTime) {
  const previous = state.lastTime;
  const rawDt = previous == null ? 0.016 : visualTime - previous;
  if (previous == null || rawDt > 0.25 || rawDt < 0) {
    state.x = target.x;
    state.y = target.y;
    state.z = target.z;
    state.vx = 0;
    state.vy = 0;
    state.vz = 0;
    state.lastTime = visualTime;
    return state;
  }
  const dt = clamp(rawDt, 0.001, 0.05);
  state.lastTime = visualTime;
  const omega = 2.35;
  const damp = 2 * omega;
  const ax = omega * omega * (target.x - state.x) - damp * state.vx;
  const ay = omega * omega * (target.y - state.y) - damp * state.vy;
  const az = omega * omega * (target.z - state.z) - damp * state.vz;
  state.vx += ax * dt;
  state.vy += ay * dt;
  state.vz += az * dt;
  state.x += state.vx * dt;
  state.y += state.vy * dt;
  state.z += state.vz * dt;
  return state;
}

export function cameraOffset(phase, seedPhase) {
  return {
    x: Math.sin(phase * 0.043 + seedPhase) * 0.02 + Math.sin(phase * 0.097 + seedPhase * 0.5) * 0.007,
    y: 0.02 + Math.sin(phase * 0.037 + seedPhase * 0.6) * 0.01,
    z: CAMERA_DISTANCE + Math.cos(phase * 0.029 + seedPhase * 0.3) * 0.012,
  };
}

export function satelliteThreshold(damage, droplet) {
  const base = damage > 0.45 ? 0.38 : 0.86;
  return clamp(base - droplet * 0.06, 0.32, 0.92);
}
