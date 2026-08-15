"use strict";

import { deterministicUnit } from "../spectral-field-model.js";
import { physicalStateSnapshot } from "../spectral-field-physical-state.js";

const TAU = Math.PI * 2;
const START_THRESHOLD = 0.64;
const REARM_THRESHOLD = 0.48;
const COOLDOWN_SECONDS = 7;
const MAX_DAUGHTERS = 3;

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function smooth(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function normalise3(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return Object.freeze({ x: x / length, y: y / length, z: z / length });
}

function tangentOf(axis) {
  const up = Math.abs(axis.y) < 0.82 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  return normalise3(
    up.y * axis.z - up.z * axis.y,
    up.z * axis.x - up.x * axis.z,
    up.x * axis.y - up.y * axis.x,
  );
}

function stableAxis(seedPhase, sequence) {
  const yaw = (deterministicUnit(seedPhase, 9400 + sequence * 13) - 0.5) * 1.55;
  const pitch = (deterministicUnit(seedPhase, 9401 + sequence * 13) - 0.46) * 1.18;
  return normalise3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch) * 0.88,
    0.26 + Math.abs(Math.cos(yaw)) * 0.22,
  );
}

export function physicalFissionEnvelope(physical) {
  const p = physical ?? {};
  return clamp(
    clamp(p.fractureDrive) * 0.52
      + (1 - clamp(p.cohesion, 0, 1)) * 0.12
      + clamp(p.propagation) * 0.14
      + clamp(p.pressure) * 0.08
      + clamp(p.memory) * 0.1
      + clamp(p.instability) * 0.04,
  );
}

function recoveryDrive(physical) {
  const p = physical ?? {};
  return clamp(
    clamp(p.recovery) * 0.5
      + clamp(p.cohesion) * 0.25
      + clamp(p.surfaceTension) * 0.2
      + (1 - clamp(p.pressure)) * 0.05,
  );
}

export function createPhysicalFissionState() {
  return {
    active: false,
    armed: true,
    sequence: 0,
    progress: 0,
    lastLifeTime: null,
    cooldownUntil: 0,
    startDrive: 0,
    axis: Object.freeze({ x: 0, y: 1, z: 0 }),
    count: 0,
    primaryScale: 0,
    secondaryScale: 0,
    tertiaryScale: 0,
    peakDistance: 0,
  };
}

function resetForBackwardTime(state, lifeTime) {
  state.active = false;
  state.armed = true;
  state.progress = 0;
  state.lastLifeTime = lifeTime;
  state.cooldownUntil = lifeTime;
  state.startDrive = 0;
  state.count = 0;
}

function chooseAxis(physical, seedPhase, sequence) {
  const event = physical?.dominantEvent;
  if (event?.axis && event.influence > 0.18) {
    return normalise3(event.axis.x, event.axis.y, event.axis.z);
  }
  return stableAxis(seedPhase, sequence);
}

function startStressEvent(state, physical, lifeTime, seedPhase, drive) {
  state.active = true;
  state.armed = false;
  state.progress = 0;
  state.lastLifeTime = lifeTime;
  state.startDrive = drive;
  state.axis = chooseAxis(physical, seedPhase, state.sequence);
  const rareNearDisintegration = drive > 0.91 && clamp(physical?.memory) > 0.72 && clamp(physical?.propagation) > 0.72;
  state.count = rareNearDisintegration ? 3 : drive > 0.79 ? 2 : 1;
  state.primaryScale = 0.33 + drive * 0.11;
  state.secondaryScale = 0.14 + drive * 0.09;
  state.tertiaryScale = 0.1 + drive * 0.045;
  state.peakDistance = 1.38 + drive * 0.42;
  state.sequence += 1;
}

function phaseName(progress) {
  if (progress < 0.11) return "gather";
  if (progress < 0.22) return "lobe";
  if (progress < 0.36) return "neck";
  if (progress < 0.45) return "pinch";
  if (progress < 0.55) return "detach";
  if (progress < 0.7) return "independent";
  if (progress < 0.83) return "return";
  if (progress < 0.91) return "contact";
  if (progress < 0.98) return "pour";
  return "settle";
}

function windowGain(progress, start, peak, end) {
  if (progress <= start || progress >= end) return 0;
  if (progress < peak) return smooth((progress - start) / Math.max(0.001, peak - start));
  return smooth((end - progress) / Math.max(0.001, end - peak));
}

function daughterDistance(localProgress, peakDistance, drive, recovery) {
  if (localProgress < 0.43) return 0.5 + smooth(localProgress / 0.43) * 0.82;
  if (localProgress < 0.7) {
    return 1.32 + smooth((localProgress - 0.43) / 0.27) * (peakDistance + drive * 0.12 - 1.32);
  }
  const t = clamp((localProgress - 0.7) / 0.3);
  const returnGain = smooth(clamp(t * (0.72 + recovery * 0.58)));
  return peakDistance + drive * 0.08 + (0.18 - peakDistance - drive * 0.08) * returnGain;
}

function daughterScale(localProgress, size) {
  if (localProgress < 0.06) return 0;
  if (localProgress < 0.22) return (size * 0.52) * smooth((localProgress - 0.06) / 0.16);
  if (localProgress < 0.45) return size * (0.52 + 0.48 * smooth((localProgress - 0.22) / 0.23));
  if (localProgress < 0.88) return size;
  if (localProgress < 0.985) return size * (1 - smooth((localProgress - 0.88) / 0.105));
  return 0;
}

function daughter(state, progress, delay, size, jitter, drive, recovery) {
  const local = clamp((progress - delay) / Math.max(0.001, 1 - delay));
  const distance = daughterDistance(local, state.peakDistance * (0.94 + jitter * 0.08), drive, recovery);
  const scale = daughterScale(local, size);
  const tangent = tangentOf(state.axis);
  const drift = Math.sin(local * Math.PI) * (0.055 + jitter * 0.055) * (0.4 + drive * 0.6);
  return Object.freeze({
    x: state.axis.x * distance + tangent.x * drift,
    y: state.axis.y * distance + tangent.y * drift,
    z: state.axis.z * distance + tangent.z * drift,
    scale,
    distance,
    visible: scale > 0.004 && local < 0.985,
    independent: local >= 0.45 && local < 0.88 && scale > 0.08 && distance > 1.27,
  });
}

function buildStressFission(state, physical, drive) {
  const progress = clamp(state.progress);
  const recovery = recoveryDrive(physical);
  const daughters = [daughter(state, progress, 0, state.primaryScale, 0.37, drive, recovery)];
  if (state.count >= 2) daughters.push(daughter(state, progress, 0.07, state.secondaryScale, 0.76, drive, recovery));
  if (state.count >= 3) daughters.push(daughter(state, progress, 0.13, state.tertiaryScale, 0.19, drive, recovery));
  let extent = 1.14;
  for (const item of daughters) {
    if (item.visible) extent = Math.max(extent, item.distance + item.scale * 1.1);
  }
  return Object.freeze({
    active: true,
    stressDriven: true,
    progress,
    phase: phaseName(progress),
    count: state.count,
    gather: windowGain(progress, 0, 0.11, 0.3) + windowGain(progress, 0.7, 0.84, 0.94) * 0.45,
    pinch: windowGain(progress, 0.13, 0.35, 0.56),
    lobe: Math.max(windowGain(progress, 0.07, 0.23, 0.48), windowGain(progress, 0.68, 0.83, 0.95) * 0.75),
    gap: windowGain(progress, 0.42, 0.6, 0.86),
    scar: Math.max(windowGain(progress, 0.84, 0.95, 1.001), clamp(physical?.scarInfluence) * 0.24),
    reach: windowGain(progress, 0.64, 0.82, 0.95),
    axis: state.axis,
    daughters: Object.freeze(daughters),
    extent,
    independent: daughters.some((item) => item.independent),
  });
}

function modulateScheduledFission(scheduled, physical, drive) {
  const recovery = recoveryDrive(physical);
  const stress = clamp((drive - 0.4) / 0.6);
  const daughters = (scheduled.daughters ?? []).map((item, index) => {
    const outward = 1 + stress * (index === 0 ? 0.1 : 0.065) - recovery * 0.055;
    return Object.freeze({
      ...item,
      x: item.x * outward,
      y: item.y * outward,
      z: item.z * outward,
      distance: item.distance * outward,
    });
  });
  let extent = scheduled.extent ?? 1.14;
  for (const item of daughters) {
    if (item.visible) extent = Math.max(extent, item.distance + item.scale * 1.1);
  }
  return Object.freeze({
    ...scheduled,
    stressDriven: false,
    pinch: clamp((scheduled.pinch ?? 0) + stress * 0.16),
    gap: clamp((scheduled.gap ?? 0) + stress * 0.12 - recovery * 0.08),
    scar: clamp((scheduled.scar ?? 0) + clamp(physical?.scarInfluence) * 0.18),
    daughters: Object.freeze(daughters),
    extent,
  });
}

export function stepPhysicalFission(state, {
  physical,
  lifeTime,
  seedPhase,
  scheduledFission,
} = {}) {
  const model = state ?? createPhysicalFissionState();
  const now = Math.max(0, Number.isFinite(lifeTime) ? lifeTime : 0);
  const drive = physicalFissionEnvelope(physical);

  if (model.lastLifeTime != null && now + 0.0001 < model.lastLifeTime) resetForBackwardTime(model, now);
  const dt = model.lastLifeTime == null ? 0.016 : clamp(now - model.lastLifeTime, 0, 0.05);
  model.lastLifeTime = now;

  if (!model.armed && !model.active && drive < REARM_THRESHOLD && now >= model.cooldownUntil) model.armed = true;

  if (scheduledFission?.active && !model.active) {
    return modulateScheduledFission(scheduledFission, physical, drive);
  }

  if (!model.active && model.armed && now >= model.cooldownUntil && drive >= START_THRESHOLD) {
    startStressEvent(model, physical, now, seedPhase, drive);
  }

  if (!model.active) return scheduledFission ?? Object.freeze({ active: false, stressDriven: false, count: 0, daughters: Object.freeze([]), extent: 1.14 });

  const recovery = recoveryDrive(physical);
  let rate = 0.045 + drive * 0.035;
  if (model.progress >= 0.7) rate = 0.025 + recovery * 0.085 + (1 - drive) * 0.02;
  if (model.progress >= 0.45 && model.progress < 0.7 && drive > 0.82) rate *= 0.72;
  model.progress = clamp(model.progress + dt * rate);

  const result = buildStressFission(model, physical, drive);
  if (model.progress >= 0.999) {
    model.active = false;
    model.progress = 0;
    model.cooldownUntil = now + COOLDOWN_SECONDS;
  }
  return result;
}

function strongestScar(model) {
  let best = null;
  let strength = 0;
  for (const scar of model?.scars ?? []) {
    const current = clamp(scar.current ?? scar.strength ?? 0);
    if (current > strength) {
      strength = current;
      best = scar;
    }
  }
  return best ? Object.freeze({ axis: best.axis, influence: strength }) : null;
}

function setFissionChildren(webglState, fission) {
  const daughters = fission?.daughters ?? [];
  for (let index = 0; index < Math.min(MAX_DAUGHTERS, webglState.fissionChildren?.length ?? 0); index += 1) {
    const mesh = webglState.fissionChildren[index];
    const item = daughters[index];
    if (!item?.visible) {
      mesh.visible = false;
      continue;
    }
    mesh.visible = true;
    mesh.position.set(item.x, item.y, item.z);
    mesh.scale.setScalar(item.scale);
  }
}

function applyPhysicalUniforms(renderer, webglState, physical, fission) {
  const uniforms = webglState.uniforms;
  if (!uniforms) return;
  uniforms.compression.value = clamp(Math.max(uniforms.compression.value, physical.compression * 0.86));
  uniforms.stretch.value = clamp(Math.max(uniforms.stretch.value, physical.stretch * 0.9));
  uniforms.coherenceLoss.value = clamp(Math.max(uniforms.coherenceLoss.value, (1 - physical.cohesion) * 0.92));
  uniforms.microstructure.value = clamp(uniforms.microstructure.value + physical.peakRecruitment * 0.13 + physical.instability * 0.035);
  uniforms.activity.value = clamp(Math.max(uniforms.activity.value, 0.24 + physical.peakRecruitment * 0.44 + physical.pressure * 0.2));

  const event = physical.dominantEvent;
  const scar = strongestScar(renderer.state?.organismLife?.physical);
  const local = fission?.active ? { axis: fission.axis, influence: 1 } : event?.axis ? { axis: event.axis, influence: event.influence } : scar;
  if (local?.axis) {
    const influence = clamp(local.influence ?? 0);
    const current = uniforms.mesoDrive;
    const x = current.x * (1 - influence) + local.axis.x * influence;
    const y = current.y * (1 - influence) + local.axis.y * influence;
    const z = current.z * (1 - influence) + local.axis.z * influence;
    const length = Math.hypot(x, y, z) || 1;
    const travel = current.w + (event?.progress ?? 0) * TAU * 1.8 * influence;
    current.set(x / length, y / length, z / length, travel);
    uniforms.neckAxis.set(local.axis.x, local.axis.y, local.axis.z);
  }

  const scarInfluence = clamp(physical.scarInfluence);
  if (fission?.active) {
    uniforms.fission.set(fission.gather ?? 0, fission.pinch ?? 0, fission.lobe ?? 0, Math.max(fission.scar ?? 0, scarInfluence * 0.22));
    uniforms.fissionGap.value = fission.gap ?? 0;
    uniforms.lifeA.x = clamp(Math.min(uniforms.lifeA.x, 1 - (fission.pinch ?? 0) * 0.82), 0.12, 1);
    setFissionChildren(webglState, fission);
  } else if (scarInfluence > 0.025) {
    uniforms.fission.w = Math.max(uniforms.fission.w, scarInfluence * 0.22);
  }

  if (uniforms.routeEnabled.value > 0.5) {
    uniforms.routeWidth.value = clamp(uniforms.routeWidth.value * (0.92 + physical.pressure * 0.12), 0.045, 0.24);
  }
}

function applyFramingSafety(webglState, fission) {
  const extent = fission?.extent ?? 1.14;
  if (extent <= 1.54 || !webglState.group) return;
  const safetyScale = clamp(1 / (1 + (extent - 1.54) * 0.34), 0.76, 1);
  webglState.group.scale.multiplyScalar(safetyScale);
}

function beforeRender(renderer, webglState) {
  const life = renderer.state?.organismLife;
  if (!life?.physical) return;
  const physical = physicalStateSnapshot(life.physical);
  if (!life.physicalFission) life.physicalFission = createPhysicalFissionState();
  const scheduled = life.fission;
  const resolved = stepPhysicalFission(life.physicalFission, {
    physical,
    lifeTime: renderer.visualTime,
    seedPhase: Number(webglState.uniforms?.identitySeed?.value) || 0,
    scheduledFission: scheduled,
  });
  life.fission = resolved;
  applyPhysicalUniforms(renderer, webglState, physical, resolved);
  applyFramingSafety(webglState, resolved);
}

export function installPhysicalBehaviourHook(renderer) {
  const webglState = renderer?._flagshipFinalFormWebgl;
  const webgl = webglState?.webgl;
  if (!webgl || webgl.__atlasPhysicalBehaviourHook) return Boolean(webgl);
  const originalRender = webgl.render.bind(webgl);
  webgl.render = (scene, camera) => {
    beforeRender(renderer, webglState);
    return originalRender(scene, camera);
  };
  webgl.__atlasPhysicalBehaviourHook = true;
  return true;
}

function evidenceFor(renderer) {
  const life = renderer.state?.organismLife;
  const physical = life?.physical ? physicalStateSnapshot(life.physical) : physicalStateSnapshot(null);
  const fission = life?.fission ?? null;
  const scar = strongestScar(life?.physical);
  return Object.freeze({
    physical,
    fractureDrive: physical.fractureDrive,
    dominantEvent: physical.dominantEvent,
    activeEventCount: physical.activeEventCount,
    scarInfluence: physical.scarInfluence,
    dominantScar: scar,
    organismLifeTime: Number(life?.time ?? 0),
    scenarioTime: Number(renderer.state?.frame?.time ?? 0),
    fissionPhase: fission?.phase ?? "idle",
    fissionCount: fission?.count ?? 0,
    fissionStressDriven: Boolean(fission?.stressDriven),
  });
}

export function publishPhysicalBehaviourEvidence(renderer, timestamp = performance.now()) {
  if (!renderer?.canvas || !renderer.state?.organismLife) return null;
  const evidence = evidenceFor(renderer);
  renderer.canvas.__atlasPhysicalEvidence = evidence;
  const dataset = renderer.canvas.dataset;
  for (const [key, value] of Object.entries(evidence.physical)) {
    if (typeof value === "number") dataset[`physical${key[0].toUpperCase()}${key.slice(1)}`] = value.toFixed(4);
  }
  dataset.fractureDrive = Number(evidence.fractureDrive).toFixed(4);
  dataset.fissionPhase = evidence.fissionPhase;
  dataset.fissionCount = String(evidence.fissionCount);
  dataset.fissionStressDriven = String(evidence.fissionStressDriven);

  if (renderer.canvas.id === "analysis-field") {
    const previous = renderer.canvas.__atlasPhysicalEvidencePublishedAt ?? -Infinity;
    if (timestamp - previous >= 180) {
      renderer.canvas.__atlasPhysicalEvidencePublishedAt = timestamp;
      document.dispatchEvent(new CustomEvent("atlas-forge-physical-state", { detail: evidence }));
    }
  }
  return evidence;
}
