"use strict";

import { deterministicUnit } from "../spectral-field-model.js";
import { physicalStateSnapshot } from "../spectral-field-physical-state.js";
import { MATERIAL_SITE_COUNT, materialFissionReady, recordMaterialScar } from "../spectral-field-material.js";

const TAU = Math.PI * 2;
const COOLDOWN_SECONDS = 7;
const MAX_DAUGHTERS = 3;

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function smooth(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function normaliseInto(target, x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  target.x = x / length;
  target.y = y / length;
  target.z = z / length;
  return target;
}

function tangentInto(target, axis) {
  const upY = Math.abs(axis.y) < 0.82 ? 1 : 0;
  const upX = upY ? 0 : 1;
  return normaliseInto(
    target,
    upY * axis.z - 0 * axis.y,
    0 * axis.x - upX * axis.z,
    upX * axis.y - upY * axis.x,
  );
}

function stableAxisInto(target, seedPhase, sequence) {
  const yaw = (deterministicUnit(seedPhase, 9400 + sequence * 13) - 0.5) * 1.55;
  const pitch = (deterministicUnit(seedPhase, 9401 + sequence * 13) - 0.46) * 1.18;
  return normaliseInto(
    target,
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch) * 0.88,
    0.26 + Math.abs(Math.cos(yaw)) * 0.22,
  );
}

export function physicalFissionEnvelope(physical) {
  const p = physical ?? {};
  /* Fracture drive is already zero unless the regime permits fracture, so this
   * envelope cannot be reached by an ordinary loaded or stretched body. */
  return clamp(
    clamp(p.fractureDrive) * 0.62
      + (1 - clamp(p.cohesion, 0, 1)) * 0.14
      + clamp(p.propagation) * 0.12
      + clamp(p.memory) * 0.12,
  );
}

function recoveryDrive(physical) {
  const p = physical ?? {};
  const pull = clamp(p.material?.returnPull ?? 0);
  return clamp(
    clamp(p.recovery) * 0.4
      + clamp(p.cohesion) * 0.22
      + clamp(p.surfaceTension) * 0.18
      + pull * 0.2,
  );
}

export function createPhysicalFissionState() {
  return {
    active: false,
    sequence: 0,
    progress: 0,
    lastLifeTime: null,
    cooldownUntil: 0,
    startDrive: 0,
    axis: { x: 0, y: 1, z: 0 },
    count: 0,
    primaryScale: 0,
    secondaryScale: 0,
    tertiaryScale: 0,
    peakDistance: 0,
    scarRecorded: false,
    /* Preallocated so an active fission allocates nothing per frame. */
    daughters: [
      { x: 0, y: 0, z: 0, scale: 0, distance: 0, visible: false, independent: false },
      { x: 0, y: 0, z: 0, scale: 0, distance: 0, visible: false, independent: false },
      { x: 0, y: 0, z: 0, scale: 0, distance: 0, visible: false, independent: false },
    ],
    result: {
      active: false, stressDriven: false, progress: 0, phase: "idle", count: 0,
      gather: 0, pinch: 0, lobe: 0, gap: 0, scar: 0, reach: 0,
      axis: null, daughters: null, extent: 1.14, independent: false,
    },
    scratchTangent: { x: 1, y: 0, z: 0 },
  };
}

const IDLE_FISSION = Object.freeze({
  active: false, stressDriven: false, count: 0,
  daughters: Object.freeze([]), extent: 1.14, phase: "idle",
});

function resetForBackwardTime(state, lifeTime) {
  state.active = false;
  state.progress = 0;
  state.lastLifeTime = lifeTime;
  state.cooldownUntil = lifeTime;
  state.startDrive = 0;
  state.count = 0;
  state.scarRecorded = false;
}

function chooseAxis(state, physical, seedPhase) {
  const material = physical?.material;
  if (material?.fractureCharge > 0.4) {
    return normaliseInto(state.axis, material.fractureAxis.x, material.fractureAxis.y, material.fractureAxis.z);
  }
  return stableAxisInto(state.axis, seedPhase, state.sequence);
}

function startStressEvent(state, physical, lifeTime, seedPhase, drive) {
  state.active = true;
  state.progress = 0;
  state.lastLifeTime = lifeTime;
  state.startDrive = drive;
  state.scarRecorded = false;
  chooseAxis(state, physical, seedPhase);
  const material = physical?.material;
  /* A third mass is exceptional: it needs charge well past the fission
   * threshold together with retained damage from earlier failure. */
  const nearDisintegration = (material?.fractureCharge ?? 0) > 2.7
    && clamp(material?.damage ?? 0) > 0.85
    && clamp(physical?.propagation) > 0.55;
  state.count = nearDisintegration ? 3 : 2;
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

function writeDaughter(state, slot, progress, delay, size, jitter, drive, recovery) {
  const target = state.daughters[slot];
  const local = clamp((progress - delay) / Math.max(0.001, 1 - delay));
  const distance = daughterDistance(local, state.peakDistance * (0.94 + jitter * 0.08), drive, recovery);
  const scale = daughterScale(local, size);
  const tangent = tangentInto(state.scratchTangent, state.axis);
  const drift = Math.sin(local * Math.PI) * (0.055 + jitter * 0.055) * (0.4 + drive * 0.6);
  target.x = state.axis.x * distance + tangent.x * drift;
  target.y = state.axis.y * distance + tangent.y * drift;
  target.z = state.axis.z * distance + tangent.z * drift;
  target.scale = scale;
  target.distance = distance;
  target.visible = scale > 0.004 && local < 0.985;
  target.independent = local >= 0.45 && local < 0.88 && scale > 0.08 && distance > 1.27;
  return target;
}

function buildStressFission(state, physical, drive) {
  const progress = clamp(state.progress);
  const recovery = recoveryDrive(physical);
  writeDaughter(state, 0, progress, 0, state.primaryScale, 0.37, drive, recovery);
  if (state.count >= 2) writeDaughter(state, 1, progress, 0.07, state.secondaryScale, 0.76, drive, recovery);
  if (state.count >= 3) writeDaughter(state, 2, progress, 0.13, state.tertiaryScale, 0.19, drive, recovery);

  let extent = 1.14;
  let independent = false;
  for (let i = 0; i < state.count; i += 1) {
    const item = state.daughters[i];
    if (!item.visible) continue;
    extent = Math.max(extent, item.distance + item.scale * 1.1);
    if (item.independent) independent = true;
  }

  const result = state.result;
  result.active = true;
  result.stressDriven = true;
  result.progress = progress;
  result.phase = phaseName(progress);
  result.count = state.count;
  result.gather = windowGain(progress, 0, 0.11, 0.3) + windowGain(progress, 0.7, 0.84, 0.94) * 0.45;
  result.pinch = windowGain(progress, 0.13, 0.35, 0.56);
  result.lobe = Math.max(windowGain(progress, 0.07, 0.23, 0.48), windowGain(progress, 0.68, 0.83, 0.95) * 0.75);
  result.gap = windowGain(progress, 0.42, 0.6, 0.86);
  result.scar = Math.max(windowGain(progress, 0.84, 0.95, 1.001), clamp(physical?.scarInfluence) * 0.24);
  result.reach = windowGain(progress, 0.64, 0.82, 0.95);
  result.axis = state.axis;
  result.daughters = state.daughters;
  result.extent = extent;
  result.independent = independent;
  return result;
}

/* IMPORTANT: the returned object is frame-scoped. It is reused between frames so
 * an active separation allocates nothing inside the render loop, which is where
 * this runs. Consumers that need to retain a value across frames must copy it
 * with `readFissionEvidence` rather than holding the reference. */
export function stepPhysicalFission(state, {
  physical,
  lifeTime,
  seedPhase,
} = {}) {
  const model = state ?? createPhysicalFissionState();
  const now = Math.max(0, Number.isFinite(lifeTime) ? lifeTime : 0);
  const drive = physicalFissionEnvelope(physical);

  if (model.lastLifeTime != null && now + 0.0001 < model.lastLifeTime) resetForBackwardTime(model, now);
  /* Separation progress advances by elapsed time, not a clamped frame budget: a
   * slow renderer must not make the split itself run in slow motion. */
  const dt = model.lastLifeTime == null ? 0.016 : clamp(now - model.lastLifeTime, 0, 0.3);
  model.lastLifeTime = now;

  /* Macroscopic separation requires the material layer to have charged a
   * fracture past its threshold under a regime that permits fission. Ordinary
   * life, however long it runs, cannot reach this. */
  if (!model.active && now >= model.cooldownUntil && materialFissionReady(physical?.material)) {
    startStressEvent(model, physical, now, seedPhase, drive);
  }

  if (!model.active) return IDLE_FISSION;

  const recovery = recoveryDrive(physical);
  let rate = 0.045 + drive * 0.035;
  if (model.progress >= 0.7) rate = 0.025 + recovery * 0.085 + (1 - drive) * 0.02;
  if (model.progress >= 0.45 && model.progress < 0.7 && drive > 0.82) rate *= 0.72;
  model.progress = clamp(model.progress + dt * rate);

  const result = buildStressFission(model, physical, drive);

  /* Separation leaves retained evidence on the parent, recorded once. */
  if (!model.scarRecorded && model.progress >= 0.5) {
    recordMaterialScar(physical?.material, model.axis, clamp(0.5 + drive * 0.5), now, 16);
    model.scarRecorded = true;
  }

  if (model.progress >= 0.999) {
    model.active = false;
    model.progress = 0;
    model.cooldownUntil = now + COOLDOWN_SECONDS;
  }
  return result;
}

/* Detached copy for anything that outlives the frame - evidence capture, tests,
 * inspectors - because `stepPhysicalFission` deliberately reuses its result. */
export function readFissionEvidence(fission) {
  if (!fission) return null;
  const count = fission.count ?? 0;
  const daughters = [];
  for (let i = 0; i < count; i += 1) {
    const item = fission.daughters?.[i];
    if (!item) continue;
    daughters.push({
      x: item.x, y: item.y, z: item.z,
      scale: item.scale, distance: item.distance,
      visible: item.visible, independent: item.independent,
    });
  }
  return {
    active: Boolean(fission.active),
    stressDriven: Boolean(fission.stressDriven),
    progress: fission.progress ?? 0,
    phase: fission.phase ?? "idle",
    count,
    pinch: fission.pinch ?? 0,
    gap: fission.gap ?? 0,
    scar: fission.scar ?? 0,
    extent: fission.extent ?? 1.14,
    independent: Boolean(fission.independent),
    daughters,
  };
}

function setFissionChildren(webglState, fission) {
  const daughters = fission?.daughters;
  const children = webglState.fissionChildren;
  if (!children) return;
  for (let index = 0; index < Math.min(MAX_DAUGHTERS, children.length); index += 1) {
    const mesh = children[index];
    const item = index < (fission?.count ?? 0) ? daughters?.[index] : null;
    if (!item?.visible) {
      mesh.visible = false;
      continue;
    }
    mesh.visible = true;
    mesh.position.set(item.x, item.y, item.z);
    mesh.scale.setScalar(item.scale);
  }
}

/* Per-site field parameters. These are what make a regime legible: a support
 * collapse is a sink with no peaks, a loaded region is a dense positive crest
 * field, an elongation is one broad axial flow, a fracture is a narrow deep
 * sink. The same seven shader slots therefore express different physics rather
 * than the same blob motion at different amplitudes. */
const SITE_STYLE = Object.freeze({
  "support-loss": Object.freeze({ strength: 0.34, flow: -0.16, swirl: 0.02, crest: 0.0, crestGate: 0 }),
  "propagation-front": Object.freeze({ strength: 0.2, flow: 0.19, swirl: 0.05, crest: 0.06, crestGate: 0.24 }),
  "pressure-front": Object.freeze({ strength: 0.19, flow: 0.05, swirl: 0.02, crest: 0.26, crestGate: 0.82 }),
  domain: Object.freeze({ strength: 0.24, flow: 0.13, swirl: 0.19, crest: 0.09, crestGate: 0.3 }),
  elongation: Object.freeze({ strength: 0.2, flow: 0.2, swirl: 0.01, crest: 0.03, crestGate: 0.12 }),
  fracture: Object.freeze({ strength: 0.42, flow: -0.1, swirl: 0.04, crest: 0.0, crestGate: 0 }),
  scar: Object.freeze({ strength: 0.08, flow: 0.02, swirl: 0.03, crest: 0.14, crestGate: 0.4 }),
});

/* Material sites claim shader field slots from the end, so ordinary life keeps
 * the leading slots and a calm body is unchanged. */
function applyMaterialSites(webglState, material, phase) {
  const uniforms = webglState.uniforms;
  if (!uniforms?.fields || !material) return 0;
  const slots = uniforms.fields.length;
  const count = Math.min(material.activeSiteCount, MATERIAL_SITE_COUNT, slots);
  for (let i = 0; i < count; i += 1) {
    const site = material.sites[i];
    const style = SITE_STYLE[site.kind];
    if (!style || site.strength <= 0.004) continue;
    const slot = slots - 1 - i;
    const sigma = Math.max(0.3, site.extent);
    uniforms.fields[slot].set(site.x, site.y, site.z, site.polarity);
    uniforms.fieldParamsA[slot].set(
      style.strength * site.strength,
      1 / (1.8 * sigma * sigma),
      style.flow * site.strength,
      style.swirl * site.strength,
    );
    uniforms.fieldParamsB[slot].set(
      style.crest * site.strength,
      10.6 + i * 1.27,
      -phase * (0.34 + i * 0.09),
      style.crestGate,
    );
  }
  return count;
}

function applyPhysicalUniforms(renderer, webglState, physical, fission) {
  const uniforms = webglState.uniforms;
  if (!uniforms) return;
  const material = physical.material;

  uniforms.compression.value = clamp(Math.max(uniforms.compression.value, physical.compression * 0.86));
  uniforms.stretch.value = clamp(Math.max(uniforms.stretch.value, physical.stretch * 0.9));
  uniforms.coherenceLoss.value = clamp(Math.max(uniforms.coherenceLoss.value, (1 - physical.cohesion) * 0.92));
  uniforms.microstructure.value = clamp(uniforms.microstructure.value + physical.peakRecruitment * 0.13 + physical.instability * 0.035);
  uniforms.activity.value = clamp(Math.max(uniforms.activity.value, 0.24 + physical.peakRecruitment * 0.44 + physical.pressure * 0.2));
  uniforms.damage.value = clamp(Math.max(uniforms.damage.value, clamp(material?.damage ?? 0) * 0.8));

  const siteCount = applyMaterialSites(webglState, material, uniforms.phase.value);

  /* The dominant permitted mechanism steers the meso axis and the neck axis, so
   * the direction a viewer reads matches the mechanism actually in play. */
  let axis = null;
  let influence = 0;
  if (fission?.active) {
    axis = fission.axis;
    influence = 1;
  } else if (material) {
    if (material.supportStrength > 0.12) { axis = material.supportOrigin; influence = material.supportStrength; }
    else if (material.fractureCharge > 0.4) { axis = material.fractureAxis; influence = clamp(material.fractureCharge / 2); }
    else if (material.stretchMagnitude > 0.12) { axis = material.stretchAxis; influence = material.stretchMagnitude; }
    else if (material.domainDisagreement > 0.12) { axis = material.domainA; influence = material.domainDisagreement; }
    else if (material.pressureStrength > 0.12) { axis = material.pressureAxis; influence = material.pressureStrength; }
  }
  if (axis) {
    const weight = clamp(influence);
    const current = uniforms.mesoDrive;
    const x = current.x * (1 - weight) + axis.x * weight;
    const y = current.y * (1 - weight) + axis.y * weight;
    const z = current.z * (1 - weight) + axis.z * weight;
    const length = Math.hypot(x, y, z) || 1;
    const travel = current.w + clamp(material?.frontPosition ?? 0) * TAU * 1.4 * weight;
    current.set(x / length, y / length, z / length, travel);
    uniforms.neckAxis.set(axis.x, axis.y, axis.z);
  }

  const scarInfluence = clamp(physical.scarInfluence);
  if (fission?.active) {
    uniforms.fission.set(fission.gather ?? 0, fission.pinch ?? 0, fission.lobe ?? 0, Math.max(fission.scar ?? 0, scarInfluence * 0.22));
    uniforms.fissionGap.value = fission.gap ?? 0;
    uniforms.lifeA.x = clamp(Math.min(uniforms.lifeA.x, 1 - (fission.pinch ?? 0) * 0.82), 0.12, 1);
    setFissionChildren(webglState, fission);
  } else {
    setFissionChildren(webglState, null);
    if (scarInfluence > 0.025) uniforms.fission.w = Math.max(uniforms.fission.w, scarInfluence * 0.22);
  }

  /* Recovery is a reverse material process, not a reset: attraction rises and
   * surface tension reclaims the form while damage still reads on the surface. */
  const pull = clamp(material?.returnPull ?? 0);
  if (pull > 0.02) {
    uniforms.lifeA.x = clamp(uniforms.lifeA.x + pull * 0.16, 0.12, 1);
    uniforms.coherenceLoss.value = clamp(uniforms.coherenceLoss.value * (1 - pull * 0.3));
  }

  if (uniforms.routeEnabled.value > 0.5) {
    uniforms.routeWidth.value = clamp(uniforms.routeWidth.value * (0.92 + physical.pressure * 0.12), 0.045, 0.24);
  }
  return siteCount;
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
  const resolved = stepPhysicalFission(life.physicalFission, {
    physical,
    lifeTime: renderer.visualTime,
    seedPhase: Number(webglState.uniforms?.identitySeed?.value) || 0,
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

function strongestScar(material) {
  let best = null;
  let strength = 0;
  for (const scar of material?.scars ?? []) {
    if (!scar.active) continue;
    const current = clamp(scar.strength);
    if (current > strength) {
      strength = current;
      best = scar;
    }
  }
  return best ? { axis: { x: best.x, y: best.y, z: best.z }, influence: strength } : null;
}

function evidenceFor(renderer) {
  const life = renderer.state?.organismLife;
  const physical = physicalStateSnapshot(life?.physical ?? null);
  const material = physical.material;
  const fission = life?.fission ?? null;
  return {
    physical,
    regime: physical.regime,
    fractureDrive: physical.fractureDrive,
    fractureCharge: Number(material?.fractureCharge ?? 0),
    damage: Number(material?.damage ?? 0),
    supportStrength: Number(material?.supportStrength ?? 0),
    frontPosition: Number(material?.frontPosition ?? 0),
    domainDisagreement: Number(material?.domainDisagreement ?? 0),
    stretchMagnitude: Number(material?.stretchMagnitude ?? 0),
    pressureStrength: Number(material?.pressureStrength ?? 0),
    returnPull: Number(material?.returnPull ?? 0),
    activeSiteCount: Number(material?.activeSiteCount ?? 0),
    scarInfluence: physical.scarInfluence,
    dominantScar: strongestScar(material),
    organismLifeTime: Number(life?.time ?? 0),
    scenarioTime: Number(renderer.state?.frame?.time ?? 0),
    fissionPhase: fission?.phase ?? "idle",
    fissionCount: fission?.count ?? 0,
    fissionStressDriven: Boolean(fission?.stressDriven),
  };
}

/* Evidence publication touches the DOM, so it is throttled rather than run on
 * every frame: writing a dozen dataset attributes per frame per view was itself
 * a source of stalling under heavy deformation. */
const EVIDENCE_INTERVAL_MS = 180;

export function publishPhysicalBehaviourEvidence(renderer, timestamp = performance.now()) {
  if (!renderer?.canvas || !renderer.state?.organismLife) return null;
  const previous = renderer.canvas.__atlasPhysicalEvidencePublishedAt ?? -Infinity;
  if (timestamp - previous < EVIDENCE_INTERVAL_MS) return renderer.canvas.__atlasPhysicalEvidence ?? null;
  renderer.canvas.__atlasPhysicalEvidencePublishedAt = timestamp;

  const evidence = evidenceFor(renderer);
  renderer.canvas.__atlasPhysicalEvidence = evidence;
  const dataset = renderer.canvas.dataset;
  for (const [key, value] of Object.entries(evidence.physical)) {
    if (typeof value === "number") dataset[`physical${key[0].toUpperCase()}${key.slice(1)}`] = value.toFixed(4);
  }
  dataset.fractureDrive = Number(evidence.fractureDrive).toFixed(4);
  dataset.materialRegime = String(evidence.regime);
  dataset.materialDamage = Number(evidence.damage).toFixed(4);
  dataset.fractureCharge = Number(evidence.fractureCharge).toFixed(4);
  dataset.fissionPhase = evidence.fissionPhase;
  dataset.fissionCount = String(evidence.fissionCount);
  dataset.fissionStressDriven = String(evidence.fissionStressDriven);

  if (renderer.canvas.id === "analysis-field") {
    document.dispatchEvent(new CustomEvent("atlas-forge-physical-state", { detail: evidence }));
  }
  return evidence;
}
