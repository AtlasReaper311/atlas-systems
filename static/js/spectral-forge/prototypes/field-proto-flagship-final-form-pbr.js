"use strict";

import * as THREE from "/lab/vendor/three/three.module.min.js";
import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { transitionMix } from "../spectral-field-state.js";
import { canvasSize, clamp, routeBand, unit } from "./proto-core.js";
import {
  FINAL_FIELD_COUNT,
  configureFinalMaterial,
  createFinalUniformState,
} from "./field-proto-flagship-final-form-shader.js";
import {
  activityFocus,
  attitudeTarget,
  audioLife,
  cameraOffset,
  createAttitudeState,
  createSafeFramingState,
  estimateOrganismExtent,
  anticipateExtent,
  fieldCentre,
  fieldLife,
  focusWeight,
  livingGesture,
  MAX_FISSION_DAUGHTERS,
  mesoDrive,
  readDebugGesture,
  satelliteThreshold,
  stepAttitude,
  stepSafeFraming,
} from "./field-proto-flagship-final-form-life.js";

const RENDERER_ID = "proto-flagship-final-form";
const WEBGL_CLASS = "spectral-field-proto-webgl";
const SATELLITE_COUNT = 14;
const FISSION_CHILD_WIDTH = 96;
const FISSION_CHILD_HEIGHT = 64;
const WIDTH_SEGMENTS = 288;
const HEIGHT_SEGMENTS = 176;
const WEBGL_DPR_CAP = 1.22;

/* Smoothness before complexity. The displacement shader runs per vertex over a
 * 288x176 sphere, which a capable GPU absorbs and a software rasteriser does
 * not. Rather than let the whole composition crawl, the mesh and pixel ratio
 * step down when sustained frame intervals say the machine cannot hold the
 * detail, and step back up when it comfortably can. Tiers are ordered and
 * bounded, transitions need sustained evidence in both directions so a brief
 * spike cannot thrash geometry, and the physics is untouched: only how finely
 * the same material is drawn changes. */
const QUALITY_TIERS = Object.freeze([
  Object.freeze({ name: "full", width: WIDTH_SEGMENTS, height: HEIGHT_SEGMENTS, dpr: WEBGL_DPR_CAP }),
  Object.freeze({ name: "reduced", width: 192, height: 120, dpr: 1 }),
  Object.freeze({ name: "minimal", width: 128, height: 80, dpr: 0.85 }),
]);
const QUALITY_DOWN_MS = 34;
const QUALITY_UP_MS = 20;
const QUALITY_DWELL_MS = 2200;
const MESH_FALLBACK_WIDTH = 240;
const MESH_FALLBACK_HEIGHT = 144;
const PLATE_STRIDE = 4;
const PLATE_MAX_INTERVAL_MS = 180;
const TAU = Math.PI * 2;

function smooth(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function studioPlate(context, g, width, height, band, damage, activity) {
  context.globalCompositeOperation = "source-over";
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#050509";
  context.fillRect(0, 0, width, height);

  const aspect = width / Math.max(1, height);
  const cx = width * (aspect > 1.8 ? 0.615 : 0.5);
  const cy = height * 0.49;
  const radius = Math.max(width, height) * 0.75;

  const well = context.createRadialGradient(
    cx - height * 0.035,
    cy - height * 0.11,
    height * 0.03,
    cx,
    cy,
    radius,
  );
  well.addColorStop(0, "#7b7884");
  well.addColorStop(0.09, "#57545f");
  well.addColorStop(0.23, "#35333d");
  well.addColorStop(0.49, "#1a1921");
  well.addColorStop(0.76, "#0c0c12");
  well.addColorStop(1, "#050509");
  context.fillStyle = well;
  context.fillRect(0, 0, width, height);

  const leftBand = context.createLinearGradient(0, 0, width * 0.61, 0);
  leftBand.addColorStop(0, "rgba(5,5,9,0.995)");
  leftBand.addColorStop(0.48, "rgba(7,7,12,0.88)");
  leftBand.addColorStop(0.78, "rgba(7,7,12,0.31)");
  leftBand.addColorStop(1, "rgba(7,7,12,0)");
  context.fillStyle = leftBand;
  context.fillRect(0, 0, width * 0.64, height);

  const floor = context.createRadialGradient(
    cx + height * 0.05,
    cy + height * 0.32,
    0,
    cx + height * 0.05,
    cy + height * 0.32,
    height * (0.34 + damage * 0.07),
  );
  floor.addColorStop(0, `rgba(0,0,0,${0.56 + damage * 0.16 + activity * 0.045})`);
  floor.addColorStop(0.42, "rgba(0,0,0,0.28)");
  floor.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = floor;
  context.fillRect(0, 0, width, height);

  if (band) {
    const routeCenter = (band.x0 + band.x1) * 0.5;
    const pulse = 0.5 + 0.5 * Math.sin(g.phase * (2.1 + g.mapped.emissionRate * 2.5));
    const x = cx + (routeCenter - 0.5) * height * 0.5;
    const y = cy + Math.sin(g.phase * 0.31 + routeCenter * 5.6) * height * 0.045;
    const glow = context.createRadialGradient(x, y, 0, x, y, height * 0.105);
    glow.addColorStop(0, `rgba(245,166,35,${0.024 + pulse * 0.028})`);
    glow.addColorStop(1, "rgba(245,166,35,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
  }
}

function createFieldSeeds(seedPhase) {
  return Array.from({ length: FINAL_FIELD_COUNT }, (_, index) => ({
    a: unit(seedPhase, 1001 + index * 11),
    b: unit(seedPhase, 1002 + index * 11),
    c: unit(seedPhase, 1003 + index * 11),
    d: unit(seedPhase, 1004 + index * 11),
    e: unit(seedPhase, 1005 + index * 11),
    index,
  }));
}

function createSatelliteSeeds(seedPhase) {
  return Array.from({ length: SATELLITE_COUNT }, (_, index) => {
    const seed = unit(seedPhase, 1201 + index * 5);
    return {
      seed,
      rateBase: 0.12 + seed * 0.11,
      eventRate: 0.31 + seed * 0.16,
      tangentRate: 0.5 + seed * 0.4,
      phase: seed * TAU,
      phase37: seed * 3.7,
    };
  });
}

function createState(renderer, seedPhase) {
  const host = renderer.canvas.parentElement;
  if (!host) throw new Error("Spectral Field host is unavailable.");

  const canvas = document.createElement("canvas");
  canvas.className = WEBGL_CLASS;
  canvas.setAttribute("aria-hidden", "true");
  canvas.tabIndex = -1;
  canvas.style.cssText = [
    "position:absolute",
    "inset:0",
    "width:100%",
    "height:100%",
    "z-index:3",
    "pointer-events:none",
    "background:transparent",
  ].join(";");
  host.appendChild(canvas);

  const webgl = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
    premultipliedAlpha: true,
  });
  webgl.setPixelRatio(Math.min(WEBGL_DPR_CAP, window.devicePixelRatio || 1));
  webgl.setClearColor(0x000000, 0);
  webgl.outputColorSpace = THREE.SRGBColorSpace;
  webgl.toneMapping = THREE.ACESFilmicToneMapping;
  webgl.toneMappingExposure = 0.9;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28.5, 1, 0.1, 40);
  camera.position.set(0, 0.02, 4.42);

  const group = new THREE.Group();
  scene.add(group);

  const geometry = new THREE.SphereGeometry(1, WIDTH_SEGMENTS, HEIGHT_SEGMENTS);
  const uniforms = createFinalUniformState();
  uniforms.identitySeed.value = unit(seedPhase, 1091) * TAU;

  const perf = {
    architecture: "gpu-final-form",
    gpuDeformation: true,
    macroModel: "f2-seven-field",
    microModel: "continuous-shader-surface-peaks",
    normalModel: "vertex-finite-difference-displaced-surface",
    orientationModel: "bounded-damped-attitude",
    splitModel: "visual-fission-coherent-daughters",
    meshFallback: `${MESH_FALLBACK_WIDTH}x${MESH_FALLBACK_HEIGHT}`,
    smoothNormals: false,
    vertices: geometry.getAttribute("position").count,
    fields: FINAL_FIELD_COUNT,
    continuousMicroPeaks: true,
    dprCap: WEBGL_DPR_CAP,
    qualityTier: QUALITY_TIERS[0].name,
    shaderCompiled: false,
    lastCpuMs: 0,
    emaCpuMs: 0,
    maxCpuMs: 0,
    maxExtent: 0,
    stageTimings: {
      geometryUniformMs: 0,
      microstructureCpuMs: 0,
      satellitesMs: 0,
      objectTransformMs: 0,
      studioPlateMs: 0,
      webglRenderMs: 0,
      otherCpuMs: 0,
    },
    samples: 0,
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: 0x2a2a33,
    metalness: 0.46,
    roughness: 0.39,
    clearcoat: 0.54,
    clearcoatRoughness: 0.31,
    reflectivity: 0.38,
    sheen: 0.035,
    sheenColor: new THREE.Color(0x292a3f),
    side: THREE.DoubleSide,
  });
  configureFinalMaterial(material, uniforms, perf);

  const body = new THREE.Mesh(geometry, material);
  body.frustumCulled = false;
  group.add(body);

  scene.add(new THREE.HemisphereLight(0xf2f2f6, 0x070708, 2.35));
  const key = new THREE.DirectionalLight(0xf8f8ff, 1.05);
  key.position.set(-4.4, 5.7, 5.6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x76728f, 0.76);
  rim.position.set(5.2, 2.0, 2.8);
  scene.add(rim);
  const low = new THREE.DirectionalLight(0x73717a, 3.55);
  low.position.set(-2.2, -3.4, 3.2);
  scene.add(low);
  const fill = new THREE.DirectionalLight(0xeeedf4, 0.38);
  fill.position.set(3.8, 4.4, 5.1);
  scene.add(fill);
  const edge = new THREE.PointLight(0xf3f2ff, 0.08, 8, 2);
  edge.position.set(1.5, 2.55, 3.4);
  scene.add(edge);

  const satelliteGeometry = new THREE.SphereGeometry(0.038, 10, 8);
  const satelliteMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x111116,
    metalness: 0.52,
    roughness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  const satellites = new THREE.InstancedMesh(satelliteGeometry, satelliteMaterial, SATELLITE_COUNT);
  satellites.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  satellites.frustumCulled = false;
  group.add(satellites);

  const childUniforms = createFinalUniformState();
  childUniforms.identitySeed.value = uniforms.identitySeed.value + 0.37;
  childUniforms.fissionRole.value = 1;
  const childMaterial = material.clone();
  childMaterial.polygonOffset = true;
  childMaterial.polygonOffsetFactor = 1;
  childMaterial.polygonOffsetUnits = 1;
  configureFinalMaterial(childMaterial, childUniforms, perf);
  const childGeometry = new THREE.SphereGeometry(1, FISSION_CHILD_WIDTH, FISSION_CHILD_HEIGHT);
  const fissionChildren = Array.from({ length: MAX_FISSION_DAUGHTERS }, () => {
    const mesh = new THREE.Mesh(childGeometry, childMaterial);
    mesh.frustumCulled = false;
    mesh.visible = false;
    group.add(mesh);
    return mesh;
  });

  const state = {
    canvas,
    webgl,
    scene,
    camera,
    group,
    body,
    geometry,
    material,
    uniforms,
    fields: Array.from({ length: FINAL_FIELD_COUNT }, () => ({})),
    fieldSeeds: createFieldSeeds(seedPhase),
    satellites,
    satelliteGeometry,
    satelliteMaterial,
    satelliteDummy: new THREE.Object3D(),
    satelliteZeroMatrix: new THREE.Matrix4().makeScale(0, 0, 0),
    satelliteSeeds: createSatelliteSeeds(seedPhase),
    childUniforms,
    childMaterial,
    childGeometry,
    fissionChildren,
    cssWidth: 0,
    cssHeight: 0,
    disposed: false,
    frameIndex: 0,
    lastPlateAt: 0,
    qualityTier: 0,
    qualityEmaMs: 0,
    qualityHeldSince: 0,
    lastFrameAt: 0,
    lastWide: null,
    lastOpacity: "",
    attitude: createAttitudeState(),
    audioExpression: 0,
    audioExpressionTime: null,
    perf,
  };

  canvas.__atlasPerf = perf;
  canvas.__atlasDispose = () => disposeState(renderer, state);
  renderer._flagshipFinalFormWebgl = state;
  return state;
}

function disposeState(renderer, state) {
  if (!state || state.disposed) return;
  state.disposed = true;
  state.geometry.dispose();
  state.material.dispose();
  state.satelliteGeometry.dispose();
  state.satelliteMaterial.dispose();
  state.childGeometry.dispose();
  state.childMaterial.dispose();
  state.webgl.dispose();
  if (state.canvas.isConnected) state.canvas.remove();
  if (renderer._flagshipFinalFormWebgl === state) renderer._flagshipFinalFormWebgl = null;
}

export function disposeFlagshipFinalForm(renderer) {
  const state = renderer?._flagshipFinalFormWebgl;
  if (state) disposeState(renderer, state);
}

function ensureState(renderer, seedPhase) {
  const current = renderer._flagshipFinalFormWebgl;
  if (current && !current.disposed && current.canvas.isConnected) return current;
  return createState(renderer, seedPhase);
}

function resize(state, sourceCanvas) {
  const cssWidth = Math.max(1, sourceCanvas.clientWidth);
  const cssHeight = Math.max(1, sourceCanvas.clientHeight);
  if (state.cssWidth === cssWidth && state.cssHeight === cssHeight) return false;
  state.cssWidth = cssWidth;
  state.cssHeight = cssHeight;
  state.webgl.setPixelRatio(Math.min(WEBGL_DPR_CAP, window.devicePixelRatio || 1));
  state.webgl.setSize(cssWidth, cssHeight, false);
  state.camera.aspect = cssWidth / cssHeight;
  state.camera.updateProjectionMatrix();
  return true;
}

function sharedLifeHost(renderer, state) {
  const life = renderer.state?.organismLife;
  if (!life) return state;
  if (typeof life.audioExpression !== "number") life.audioExpression = state.audioExpression ?? 0;
  if (!life.attitude) life.attitude = state.attitude ?? createAttitudeState();
  if (!life.framing) life.framing = createSafeFramingState();
  state.attitude = life.attitude;
  return life;
}

function stepAudioExpression(host, audioActive, visualTime) {
  const target = audioActive ? 1 : 0;
  const previous = host.audioExpressionTime;
  if (previous != null && visualTime + 0.0001 < previous) {
    host.audioExpressionTime = visualTime;
    return host.audioExpression;
  }
  const dt = previous == null ? 0.016 : clamp(visualTime - previous, 0.001, 0.05);
  host.audioExpressionTime = visualTime;
  const delta = target - host.audioExpression;
  host.audioExpression += Math.sign(delta) * Math.min(Math.abs(delta), 2.4 * dt);
  return host.audioExpression;
}

function updateFields(state, g, activity, damage, audioMixValue, gesture, focus) {
  for (let i = 0; i < FINAL_FIELD_COUNT; i += 1) {
    const seed = state.fieldSeeds[i];
    const field = state.fields[i];
    const { a, index } = seed;
    const centre = fieldCentre(g.phase, seed, activity, audioMixValue, gesture);
    const life = fieldLife(g.phase, seed, g.mapped, damage, audioMixValue, gesture);
    const weight = focusWeight(centre, focus);

    field.x = centre.x;
    field.y = centre.y;
    field.z = centre.z;
    field.polarity = life.polarity;
    field.strength = (
      0.122
      + g.mapped.displacement * 0.132
      + g.pressure * 0.046
      + g.mapped.phaseDisagreement * 0.04
      + damage * 0.06
      + (gesture.fold * 0.028)
    ) * life.strengthScale * weight;
    field.invExtent = 1 / (1.8 * life.sigma * life.sigma);
    field.flow = (0.082 + g.mapped.displacement * 0.07 + activity * 0.032) * life.flowScale * (0.82 + seed.d * 0.42);
    field.swirl = (0.036 + g.mapped.phaseDisagreement * 0.066 + damage * 0.03) * life.swirlScale * (0.8 + seed.e * 0.4);
    field.crest = (0.12 + g.mapped.microstructure * 0.17 + g.mapped.brilliance * 0.065 + damage * 0.08) * life.crestScale;
    field.waveFrequency = 11.4 + index * 1.34;
    field.wavePhase = -g.phase * life.waveRate + a * TAU + index * 1.71;
    field.crestGate = smooth(clamp((life.polarity - (0.08 - audioMixValue * 0.12)) / 0.78));

    state.uniforms.fields[i].set(field.x, field.y, field.z, field.polarity);
    state.uniforms.fieldParamsA[i].set(field.strength, field.invExtent, field.flow, field.swirl);
    state.uniforms.fieldParamsB[i].set(field.crest, field.waveFrequency, field.wavePhase, field.crestGate);
  }
}

function updateUniforms(state, renderer, g, band, damage, activity, gesture, audioMixValue) {
  state.uniforms.phase.value = g.phase;
  state.uniforms.activity.value = activity;
  state.uniforms.damage.value = damage;
  state.uniforms.displacement.value = g.mapped.displacement;
  state.uniforms.phaseDisagreement.value = g.mapped.phaseDisagreement;
  state.uniforms.coherenceLoss.value = 1 - g.coherence;
  state.uniforms.lateralSpread.value = g.mapped.lateralSpread;
  state.uniforms.compression.value = g.art.compression;
  state.uniforms.stretch.value = g.art.stretch;
  state.uniforms.afterimage.value = g.mapped.afterimage;
  state.uniforms.breathing.value = g.breathing;
  state.uniforms.microstructure.value = g.mapped.microstructure + gesture.bloom * 0.18;
  state.uniforms.brilliance.value = g.mapped.brilliance;
  const audio = audioLife(audioMixValue);
  const focus = activityFocus(renderer.visualTime, g.seedPhase);
  state.uniforms.emission.value = g.mapped.emissionRate * (1 + audioMixValue * 0.08);
  state.uniforms.audioEnergy.value = 1;
  state.uniforms.lifeA.set(gesture.cohesion, gesture.bloom, gesture.fold, gesture.inversion);
  state.uniforms.lifeB.set(audio.recruit, audio.ridge, gesture.droplet, audio.pulse);
  state.uniforms.neckAxis.set(gesture.neckAxis.x, gesture.neckAxis.y, gesture.neckAxis.z);
  const fission = gesture.fission;
  state.uniforms.fission.set(
    fission?.gather ?? 0,
    fission?.pinch ?? 0,
    fission?.lobe ?? 0,
    fission?.scar ?? 0,
  );
  state.uniforms.fissionRole.value = 0;
  state.uniforms.fissionGap.value = fission?.gap ?? 0;
  const drive = mesoDrive(g.phase, g.seedPhase, audioMixValue, gesture, focus);
  state.uniforms.mesoDrive.set(drive.x, drive.y, drive.z, drive.w);

  if (band) {
    state.uniforms.routeEnabled.value = 1;
    state.uniforms.routeCenter.value = (band.x0 + band.x1) * 0.5;
    state.uniforms.routeWidth.value = Math.max(0.06, (band.x1 - band.x0) * 0.55);
  } else {
    state.uniforms.routeEnabled.value = 0;
  }

  updateFields(state, g, activity, damage, audioMixValue, gesture, focus);
}

function updateSatellites(state, renderer, g, damage, activity, gesture) {
  const audioActive = Boolean(renderer.state.audioEnabled && !renderer.state.muted);
  const normalBudget = 2 + Math.floor(activity * 2) + (audioActive ? 1 : 0) + (gesture.droplet > 0.2 ? 2 : 0);
  const activeBudget = Math.min(SATELLITE_COUNT, normalBudget + Math.floor(damage * 7));
  const dummy = state.satelliteDummy;
  let visible = 0;

  for (let i = 0; i < activeBudget; i += 1) {
    const seed = state.satelliteSeeds[i];
    const field = state.fields[i % state.fields.length];
    const rate = seed.rateBase + damage * 0.04 + gesture.droplet * 0.05;
    const cycle = (g.phase * rate + seed.phase37) % 1;
    const event = 0.5 + 0.5 * Math.sin(g.phase * seed.eventRate + seed.phase);
    const threshold = satelliteThreshold(damage, gesture.droplet);
    if (event < threshold) continue;

    const arc = Math.sin(Math.PI * cycle);
    const radial = 1.02 + arc * (0.18 + activity * 0.12 + damage * 0.28);
    const tangentAngle = g.phase * seed.tangentRate + seed.phase;
    let tx = -field.y;
    let ty = field.x;
    let tz = field.z * 0.25;
    const invTangent = 1 / (Math.hypot(tx, ty, tz) || 1);
    tx *= invTangent;
    ty *= invTangent;
    tz *= invTangent;
    const orbit = Math.sin(tangentAngle) * arc * (0.09 + damage * 0.06);

    dummy.position.set(
      field.x * radial + tx * orbit,
      field.y * radial + ty * orbit,
      field.z * radial + tz * orbit,
    );
    const scale = Math.max(0.12, arc * (0.38 + seed.seed * 0.48) * (0.78 + damage * 0.45));
    dummy.scale.set(
      scale * (1 + arc * 0.38),
      scale * (0.76 + (1 - arc) * 0.24),
      scale * (0.82 + seed.seed * 0.24),
    );
    dummy.updateMatrix();
    state.satellites.setMatrixAt(visible, dummy.matrix);
    visible += 1;
  }

  for (let i = visible; i < SATELLITE_COUNT; i += 1) {
    state.satellites.setMatrixAt(i, state.satelliteZeroMatrix);
  }
  state.satellites.count = SATELLITE_COUNT;
  state.satellites.instanceMatrix.needsUpdate = true;
}

function copyUniformState(source, target) {
  for (let i = 0; i < FINAL_FIELD_COUNT; i += 1) {
    target.fields[i].copy(source.fields[i]);
    target.fieldParamsA[i].copy(source.fieldParamsA[i]);
    target.fieldParamsB[i].copy(source.fieldParamsB[i]);
  }
  target.phase.value = source.phase.value;
  target.activity.value = source.activity.value;
  target.damage.value = source.damage.value;
  target.displacement.value = source.displacement.value;
  target.phaseDisagreement.value = source.phaseDisagreement.value;
  target.coherenceLoss.value = source.coherenceLoss.value;
  target.lateralSpread.value = source.lateralSpread.value;
  target.compression.value = source.compression.value;
  target.stretch.value = source.stretch.value;
  target.afterimage.value = source.afterimage.value;
  target.breathing.value = source.breathing.value;
  target.microstructure.value = source.microstructure.value;
  target.brilliance.value = source.brilliance.value;
  target.emission.value = source.emission.value;
  target.audioEnergy.value = source.audioEnergy.value;
  target.routeEnabled.value = source.routeEnabled.value;
  target.routeCenter.value = source.routeCenter.value;
  target.routeWidth.value = source.routeWidth.value;
  target.lifeA.copy(source.lifeA);
  target.lifeB.copy(source.lifeB);
  target.neckAxis.copy(source.neckAxis);
  target.mesoDrive.copy(source.mesoDrive);
  target.fission.copy(source.fission);
  target.fissionRole.value = 1;
  target.fissionGap.value = 0;
}

function updateFissionChildren(state, fission) {
  copyUniformState(state.uniforms, state.childUniforms);
  const daughters = fission?.daughters ?? [];
  for (let i = 0; i < MAX_FISSION_DAUGHTERS; i += 1) {
    const mesh = state.fissionChildren[i];
    const daughter = daughters[i];
    if (!daughter || !daughter.visible) {
      if (state.frameIndex < 2) {
        mesh.visible = true;
        mesh.position.set(0, 0, 0);
        mesh.scale.setScalar(0.001);
      } else {
        mesh.visible = false;
      }
      continue;
    }
    mesh.visible = true;
    mesh.position.set(daughter.x, daughter.y, daughter.z);
    mesh.scale.setScalar(daughter.scale);
  }
  state.canvas.__atlasFission = {
    visible: state.fissionChildren.map((mesh) => mesh.visible),
    positions: state.fissionChildren.map((mesh) => mesh.position.toArray()),
    scales: state.fissionChildren.map((mesh) => mesh.scale.x),
  };
}

function updateObject(state, renderer, g, damage, activity, aspect, mix, gesture, framing) {
  const wide = aspect > 1.55;
  const baseScale = wide ? 1.08 : 0.89;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let weight = 0;

  for (const field of state.fields) {
    const w = Math.abs(field.strength * field.polarity) + 0.001;
    cx += field.x * w;
    cy += field.y * w;
    cz += field.z * w;
    weight += w;
  }

  const invWeight = 1 / (weight || 1);
  cx *= invWeight;
  cy *= invWeight;
  cz *= invWeight;

  const neck = 1 - gesture.cohesion;
  const target = attitudeTarget(g.phase, { x: cx, y: cy, z: cz }, g.tilt, g.torsion, g.seedPhase);
  stepAttitude(state.attitude, target, renderer.visualTime);
  const cam = cameraOffset(g.phase, g.seedPhase);
  const distance = framing?.distance ?? cam.z;
  const present = framing?.scale ?? 1;
  state.camera.position.set(cam.x, cam.y, distance + (cam.z - 4.42));

  state.group.scale.set(
    baseScale * present * (1.03 + g.mapped.lateralSpread * 0.055 + activity * 0.022 - neck * 0.08),
    baseScale * present * (0.99 - g.art.compression * 0.022 + Math.abs(cy) * 0.026 + neck * 0.09),
    baseScale * present * (0.985 + damage * 0.018 + Math.abs(cz) * 0.018 - neck * 0.06),
  );
  state.group.position.x = wide ? 0.6 + cx * 0.045 : cx * 0.02;
  state.group.position.y = cy * 0.034 - g.art.compression * 0.018;
  state.group.position.z = 0;
  state.group.rotation.x = state.attitude.x;
  state.group.rotation.y = state.attitude.y;
  state.group.rotation.z = state.attitude.z;

  const opacity = (0.64 + mix * 0.36).toFixed(3);
  if (opacity !== state.lastOpacity) {
    state.canvas.style.opacity = opacity;
    state.lastOpacity = opacity;
  }
  if (wide !== state.lastWide) {
    state.canvas.style.webkitMaskImage = wide
      ? "linear-gradient(90deg, transparent 0%, rgba(0,0,0,.12) 9%, #000 23%, #000 100%)"
      : "none";
    state.canvas.style.maskImage = state.canvas.style.webkitMaskImage;
    state.lastWide = wide;
  }
}

function markStage(stages, name, startedAt) {
  const now = performance.now();
  stages[name] = now - startedAt;
  return now;
}

/* Swaps the body mesh to the tier's tessellation. Called only on a tier change,
 * which sustained-evidence hysteresis keeps rare. */
function applyQualityTier(state, index) {
  const tier = QUALITY_TIERS[index];
  if (!tier || state.qualityTier === index) return;
  const previous = state.geometry;
  state.geometry = new THREE.SphereGeometry(1, tier.width, tier.height);
  state.body.geometry = state.geometry;
  previous?.dispose?.();
  state.webgl.setPixelRatio(Math.min(tier.dpr, window.devicePixelRatio || 1));
  state.qualityTier = index;
  state.perf.vertices = state.geometry.getAttribute("position").count;
  state.perf.qualityTier = tier.name;
  state.perf.dprCap = tier.dpr;
  state.cssWidth = 0;
  state.cssHeight = 0;
}

function stepAdaptiveQuality(state, now) {
  if (state.lastFrameAt) {
    const interval = now - state.lastFrameAt;
    if (interval > 0 && interval < 2000) {
      state.qualityEmaMs = state.qualityEmaMs === 0 ? interval : state.qualityEmaMs * 0.9 + interval * 0.1;
    }
  }
  state.lastFrameAt = now;
  if (!state.qualityHeldSince) state.qualityHeldSince = now;
  if (state.qualityEmaMs === 0 || now - state.qualityHeldSince < QUALITY_DWELL_MS) return;

  const slow = state.qualityEmaMs > QUALITY_DOWN_MS && state.qualityTier < QUALITY_TIERS.length - 1;
  const fast = state.qualityEmaMs < QUALITY_UP_MS && state.qualityTier > 0;
  if (!slow && !fast) return;
  applyQualityTier(state, state.qualityTier + (slow ? 1 : -1));
  state.qualityHeldSince = now;
  state.qualityEmaMs = 0;
}

function recordCpuPerf(state, stages, startedAt) {
  const elapsed = performance.now() - startedAt;
  const perf = state.perf;
  perf.lastCpuMs = Number(elapsed.toFixed(3));
  perf.emaCpuMs = perf.samples === 0 ? elapsed : perf.emaCpuMs * 0.92 + elapsed * 0.08;
  perf.maxCpuMs = Math.max(perf.maxCpuMs, elapsed);
  perf.stageTimings = Object.fromEntries(
    Object.entries(stages).map(([key, value]) => [key, Number(value.toFixed(3))]),
  );
  perf.stageTimings.otherCpuMs = Number(Math.max(
    0,
    elapsed
      - stages.geometryUniformMs
      - stages.microstructureCpuMs
      - stages.satellitesMs
      - stages.objectTransformMs
      - stages.studioPlateMs
      - stages.webglRenderMs,
  ).toFixed(3));
  perf.samples += 1;
}

export function drawFlagshipFinalForm(renderer, timestamp = performance.now()) {
  if (!renderer.context || !renderer.state) return;
  renderer.canvas.dataset.fieldRenderer = RENDERER_ID;
  renderer.canvas.dataset.fieldBackend = "webgl";

  const startedAt = performance.now();
  const { width, height } = canvasSize(renderer.canvas);
  const g = deriveFieldGeometry(renderer.state, renderer.visualTime, width, height);
  const mix = transitionMix.call(renderer, timestamp);
  const band = routeBand(renderer.state.selectedMapping);
  const damage = clamp(
    g.health.severity * 0.66 + g.deformation * 0.32 + g.art.fractureBias * 0.18,
  );
  const audioActive = Boolean(renderer.state.audioEnabled && !renderer.state.muted);

  let state;
  try {
    state = ensureState(renderer, g.seedPhase);
  } catch (error) {
    renderer._flagshipFinalFormWebglFailure = error;
    throw error;
  }

  const lifeHost = sharedLifeHost(renderer, state);
  const audioMixValue = stepAudioExpression(lifeHost, audioActive, renderer.visualTime);
  const activity = clamp(
    0.38
    + g.mapped.displacement * 0.28
    + g.mapped.phaseDisagreement * 0.18
    + g.mapped.brilliance * 0.1
    + g.mapped.emissionRate * 0.06
    + damage * 0.2
    + audioMixValue * 0.12,
  );

  const stages = {
    geometryUniformMs: 0,
    microstructureCpuMs: 0,
    satellitesMs: 0,
    objectTransformMs: 0,
    studioPlateMs: 0,
    webglRenderMs: 0,
    otherCpuMs: 0,
  };
  let stageStartedAt = performance.now();

  const gesture = livingGesture(
    g.phase,
    g.seedPhase,
    audioMixValue,
    damage,
    renderer.visualTime,
    renderer.state.scenarioId,
    renderer.state.debugGesture || readDebugGesture(),
  );
  /* The scheduled gesture no longer owns macroscopic separation: the physical
   * layer resolves that during `webgl.render` below. Frame the organism against
   * the value it installed on the previous frame - one frame of lag is
   * imperceptible, and it keeps daughters inside the viewport from the moment
   * they appear rather than a frame later. */
  const scheduledFission = gesture.fission;
  const previousResolved = lifeHost.fission;
  const framingFission = previousResolved?.active ? previousResolved : scheduledFission;
  lifeHost.fission = scheduledFission;
  const resized = resize(state, renderer.canvas);
  const extent = estimateOrganismExtent(gesture, framingFission, activity);
  const lookahead = anticipateExtent(gesture, framingFission, activity);
  const aspect = state.cssWidth / Math.max(1, state.cssHeight);
  stepSafeFraming(lifeHost.framing, extent, renderer.visualTime, lookahead, aspect);
  updateUniforms(state, renderer, g, band, damage, activity, gesture, audioMixValue);
  stageStartedAt = markStage(stages, "geometryUniformMs", stageStartedAt);

  // Microstructure is continuous shader displacement; no CPU cone/base update remains.
  stageStartedAt = markStage(stages, "microstructureCpuMs", stageStartedAt);

  updateSatellites(state, renderer, g, damage, activity, gesture);
  updateFissionChildren(state, scheduledFission);
  stageStartedAt = markStage(stages, "satellitesMs", stageStartedAt);

  updateObject(state, renderer, g, damage, activity, state.cssWidth / Math.max(1, state.cssHeight), mix, gesture, lifeHost.framing);
  stageStartedAt = markStage(stages, "objectTransformMs", stageStartedAt);

  state.webgl.render(state.scene, state.camera);
  stageStartedAt = markStage(stages, "webglRenderMs", stageStartedAt);

  if (state.webgl.info.render.triangles <= 0) {
    throw new Error("Flagship final-form WebGL mesh produced no rendered triangles.");
  }

  /* The studio plate refreshed every fourth rendered frame. That is a wall-time
   * cadence only while frames are quick: on a slow renderer the backdrop froze
   * for seconds at a time while the organism kept moving, which reads as the
   * composition stalling. The stride still governs fast machines; the elapsed
   * bound stops the backdrop falling behind real time on slow ones. */
  const plateNow = performance.now();
  if (resized
    || state.frameIndex % PLATE_STRIDE === 0
    || state.frameIndex < 2
    || plateNow - state.lastPlateAt >= PLATE_MAX_INTERVAL_MS) {
    studioPlate(renderer.context, g, width, height, band, damage, activity);
    state.lastPlateAt = plateNow;
  }
  markStage(stages, "studioPlateMs", stageStartedAt);
  state.frameIndex += 1;
  recordCpuPerf(state, stages, startedAt);
  stepAdaptiveQuality(state, plateNow);
  /* Publish the separation the physical layer actually resolved during render,
   * never the scheduled value captured before it. Reading the stale local here
   * reported an idle organism on every frame while a cascade was visibly
   * splitting. */
  const resolvedFission = lifeHost.fission ?? scheduledFission;
  renderer.canvas.dataset.fissionPhase = resolvedFission?.phase ?? "idle";
  renderer.canvas.dataset.fissionProgress = String(resolvedFission?.progress ?? 0);
  renderer.canvas.dataset.fissionCount = String(resolvedFission?.count ?? 0);
  renderer.canvas.dataset.organismExtent = String(Math.max(extent, resolvedFission?.extent ?? 0));
  renderer.canvas.dataset.framingDistance = String(lifeHost.framing?.distance ?? 4.42);
  renderer.canvas.dataset.framingScale = String(lifeHost.framing?.scale ?? 1);
  state.perf.maxExtent = Math.max(state.perf.maxExtent ?? 0, extent);
  state.perf.framingDistance = lifeHost.framing?.distance ?? 4.42;
  state.perf.framingScale = lifeHost.framing?.scale ?? 1;
}
