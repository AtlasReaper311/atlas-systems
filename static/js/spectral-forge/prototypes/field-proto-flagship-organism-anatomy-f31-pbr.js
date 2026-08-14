"use strict";

import * as THREE from "/lab/vendor/three/three.module.min.js";
import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { transitionMix } from "../spectral-field-state.js";
import { canvasSize, clamp, routeBand, unit } from "./proto-core.js";
import {
  F31_FIELD_COUNT,
  configureF31Material,
  createF31UniformState,
} from "./field-proto-flagship-organism-anatomy-f31-shader.js";

const RENDERER_ID = "proto-flagship-anatomy-f31";
const WEBGL_CLASS = "spectral-field-proto-webgl";
const SATELLITE_COUNT = 14;
const WIDTH_SEGMENTS = 144;
const HEIGHT_SEGMENTS = 96;
const WEBGL_DPR_CAP = 1.6;
const PLATE_STRIDE = 4;
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
  return Array.from({ length: F31_FIELD_COUNT }, (_, index) => ({
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
  webgl.toneMappingExposure = 1.24;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28.5, 1, 0.1, 20);
  camera.position.set(0, 0.02, 4.42);

  const group = new THREE.Group();
  scene.add(group);

  const geometry = new THREE.SphereGeometry(1, WIDTH_SEGMENTS, HEIGHT_SEGMENTS);
  const uniforms = createF31UniformState();
  uniforms.identitySeed.value = unit(seedPhase, 1091) * TAU;

  const perf = {
    architecture: "gpu-f2-port",
    gpuDeformation: true,
    macroModel: "f2-seven-field",
    microModel: "clustered-ferrofluid",
    smoothNormals: false,
    vertices: geometry.getAttribute("position").count,
    fields: F31_FIELD_COUNT,
    dprCap: WEBGL_DPR_CAP,
    shaderCompiled: false,
    lastCpuMs: 0,
    emaCpuMs: 0,
    maxCpuMs: 0,
    samples: 0,
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: 0x24242d,
    metalness: 0.5,
    roughness: 0.19,
    clearcoat: 1,
    clearcoatRoughness: 0.052,
    reflectivity: 0.94,
    sheen: 0.022,
    sheenColor: new THREE.Color(0x353149),
    side: THREE.DoubleSide,
  });
  configureF31Material(material, uniforms, perf);

  const body = new THREE.Mesh(geometry, material);
  body.frustumCulled = false;
  group.add(body);

  scene.add(new THREE.HemisphereLight(0xe8e8ee, 0x010102, 1.12));
  const key = new THREE.DirectionalLight(0xffffff, 5.6);
  key.position.set(-4.4, 5.7, 5.6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x746d99, 1.42);
  rim.position.set(5.2, 2.0, 2.8);
  scene.add(rim);
  const low = new THREE.DirectionalLight(0x44434d, 1.62);
  low.position.set(-2.2, -3.4, 3.2);
  scene.add(low);
  const edge = new THREE.PointLight(0xffffff, 1.05, 8, 2);
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
    fields: Array.from({ length: F31_FIELD_COUNT }, () => ({})),
    fieldSeeds: createFieldSeeds(seedPhase),
    satellites,
    satelliteGeometry,
    satelliteMaterial,
    satelliteDummy: new THREE.Object3D(),
    satelliteZeroMatrix: new THREE.Matrix4().makeScale(0, 0, 0),
    satelliteSeeds: createSatelliteSeeds(seedPhase),
    cssWidth: 0,
    cssHeight: 0,
    disposed: false,
    frameIndex: 0,
    lastWide: null,
    lastOpacity: "",
    perf,
  };

  canvas.__atlasPerf = perf;
  canvas.__atlasDispose = () => disposeState(renderer, state);
  renderer._flagshipAnatomyF31Webgl = state;
  return state;
}

function disposeState(renderer, state) {
  if (!state || state.disposed) return;
  state.disposed = true;
  state.geometry.dispose();
  state.material.dispose();
  state.satelliteGeometry.dispose();
  state.satelliteMaterial.dispose();
  state.webgl.dispose();
  if (state.canvas.isConnected) state.canvas.remove();
  if (renderer._flagshipAnatomyF31Webgl === state) renderer._flagshipAnatomyF31Webgl = null;
}

export function disposeFlagshipAnatomyF31(renderer) {
  const state = renderer?._flagshipAnatomyF31Webgl;
  if (state) disposeState(renderer, state);
}

function ensureState(renderer, seedPhase) {
  const current = renderer._flagshipAnatomyF31Webgl;
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

function updateFields(state, g, activity, damage) {
  for (let i = 0; i < F31_FIELD_COUNT; i += 1) {
    const seed = state.fieldSeeds[i];
    const field = state.fields[i];
    const { a, b, c, d, e, index } = seed;

    const azimuth = g.phase * (0.29 + a * 0.22 + activity * 0.07)
      + a * TAU
      + Math.sin(g.phase * (0.091 + b * 0.073) + c * TAU) * (0.72 + d * 0.38)
      + Math.sin(g.phase * (0.047 + d * 0.041) + e * TAU) * 0.42;
    const elevation = Math.sin(
      g.phase * (0.17 + c * 0.11 + activity * 0.025) + b * TAU,
    ) * (0.5 + d * 0.17)
      + Math.cos(g.phase * (0.061 + a * 0.052) + c * TAU) * 0.19;

    const cosElevation = Math.cos(elevation);
    const polarityWave = Math.sin(g.phase * (0.21 + d * 0.17) + e * TAU + index * 0.83);
    const polarity = Math.tanh(polarityWave * 2.2);
    const lifeWave = Math.sin(g.phase * (0.25 + e * 0.17) + a * TAU);
    const life = 0.62 + 0.38 * lifeWave * lifeWave;
    const sigma = 0.38 + c * 0.22;

    field.x = Math.cos(azimuth) * cosElevation;
    field.y = Math.sin(elevation);
    field.z = Math.sin(azimuth) * cosElevation;
    field.polarity = polarity;
    field.strength = (
      0.105
      + g.mapped.displacement * 0.105
      + g.pressure * 0.036
      + g.mapped.phaseDisagreement * 0.032
      + damage * 0.055
    ) * life * (0.82 + b * 0.4);
    field.invExtent = 1 / (1.8 * sigma * sigma);
    field.flow = (0.065 + g.mapped.displacement * 0.055 + activity * 0.024) * (0.82 + d * 0.42);
    field.swirl = (0.028 + g.mapped.phaseDisagreement * 0.052 + damage * 0.025) * (0.8 + e * 0.4);
    field.crest = 0.09 + g.mapped.microstructure * 0.12 + g.mapped.brilliance * 0.055 + damage * 0.08;
    field.waveFrequency = 9.8 + index * 1.05;
    field.wavePhase = -g.phase * (1.34 + index * 0.17) + a * TAU + index * 1.71;
    field.crestGate = smooth(clamp((polarity - 0.18) / 0.82));

    state.uniforms.fields[i].set(field.x, field.y, field.z, field.polarity);
    state.uniforms.fieldParamsA[i].set(field.strength, field.invExtent, field.flow, field.swirl);
    state.uniforms.fieldParamsB[i].set(field.crest, field.waveFrequency, field.wavePhase, field.crestGate);
  }
}

function updateUniforms(state, renderer, g, band, damage, activity) {
  const audioActive = Boolean(renderer.state.audioEnabled && !renderer.state.muted);
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
  state.uniforms.microstructure.value = g.mapped.microstructure;
  state.uniforms.brilliance.value = g.mapped.brilliance;
  state.uniforms.emission.value = g.mapped.emissionRate;
  state.uniforms.audioEnergy.value = audioActive ? 1.34 : 1;

  if (band) {
    state.uniforms.routeEnabled.value = 1;
    state.uniforms.routeCenter.value = (band.x0 + band.x1) * 0.5;
    state.uniforms.routeWidth.value = Math.max(0.06, (band.x1 - band.x0) * 0.55);
  } else {
    state.uniforms.routeEnabled.value = 0;
  }

  updateFields(state, g, activity, damage);
}

function updateSatellites(state, renderer, g, damage, activity) {
  const audioActive = Boolean(renderer.state.audioEnabled && !renderer.state.muted);
  const normalBudget = 2 + Math.floor(activity * 2) + (audioActive ? 1 : 0);
  const activeBudget = Math.min(SATELLITE_COUNT, normalBudget + Math.floor(damage * 7));
  const dummy = state.satelliteDummy;
  let visible = 0;

  for (let i = 0; i < activeBudget; i += 1) {
    const seed = state.satelliteSeeds[i];
    const field = state.fields[i % state.fields.length];
    const rate = seed.rateBase + damage * 0.04;
    const cycle = (g.phase * rate + seed.phase37) % 1;
    const event = 0.5 + 0.5 * Math.sin(g.phase * seed.eventRate + seed.phase);
    const threshold = damage > 0.45 ? 0.38 : 0.68;
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

function updateObject(state, g, damage, activity, aspect, mix) {
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

  state.group.scale.set(
    baseScale * (1.02 + g.mapped.lateralSpread * 0.04 + activity * 0.016),
    baseScale * (1.0 - g.art.compression * 0.018 + Math.abs(cy) * 0.018),
    baseScale * (0.99 + damage * 0.015 + Math.abs(cz) * 0.012),
  );
  state.group.position.x = wide ? 0.6 + cx * 0.045 : cx * 0.018;
  state.group.position.y = cy * 0.035 - g.art.compression * 0.015;
  state.group.position.z = 0;
  state.group.rotation.x = 0.055 + cy * 0.06 + g.tilt * 0.05;
  state.group.rotation.y = -0.15 + cx * 0.09 + g.torsion * 0.14;
  state.group.rotation.z = -0.025 + cz * 0.055;

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

function recordCpuPerf(state, startedAt) {
  const elapsed = performance.now() - startedAt;
  const perf = state.perf;
  perf.lastCpuMs = Number(elapsed.toFixed(3));
  perf.emaCpuMs = perf.samples === 0 ? elapsed : perf.emaCpuMs * 0.92 + elapsed * 0.08;
  perf.maxCpuMs = Math.max(perf.maxCpuMs, elapsed);
  perf.samples += 1;
}

export function drawFlagshipAnatomyF31(renderer, timestamp = performance.now()) {
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
  const activity = clamp(
    0.38
    + g.mapped.displacement * 0.28
    + g.mapped.phaseDisagreement * 0.18
    + g.mapped.brilliance * 0.1
    + g.mapped.emissionRate * 0.06
    + damage * 0.2
    + (audioActive ? 0.12 : 0),
  );

  let state;
  try {
    state = ensureState(renderer, g.seedPhase);
  } catch (error) {
    renderer._flagshipAnatomyF31WebglFailure = error;
    throw error;
  }

  const resized = resize(state, renderer.canvas);
  updateUniforms(state, renderer, g, band, damage, activity);
  updateSatellites(state, renderer, g, damage, activity);
  updateObject(state, g, damage, activity, state.cssWidth / Math.max(1, state.cssHeight), mix);
  state.webgl.render(state.scene, state.camera);

  if (state.webgl.info.render.triangles <= 0) {
    throw new Error("Flagship anatomy F3.1 WebGL mesh produced no rendered triangles.");
  }

  if (resized || state.frameIndex % PLATE_STRIDE === 0 || state.frameIndex < 2) {
    studioPlate(renderer.context, g, width, height, band, damage, activity);
  }
  state.frameIndex += 1;
  recordCpuPerf(state, startedAt);
}
