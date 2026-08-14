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

const RENDERER_ID = "proto-flagship-final-form";
const WEBGL_CLASS = "spectral-field-proto-webgl";
const SATELLITE_COUNT = 14;
const SPIKE_CLUSTER_COUNT = 6;
const SPIKES_PER_CLUSTER = 13;
const MICRO_SPIKE_COUNT = SPIKE_CLUSTER_COUNT * SPIKES_PER_CLUSTER;
const WIDTH_SEGMENTS = 144;
const HEIGHT_SEGMENTS = 96;
const WEBGL_DPR_CAP = 1.55;
const PLATE_STRIDE = 4;
const TAU = Math.PI * 2;
const UNIT_Y = new THREE.Vector3(0, 1, 0);

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

function createSpikeSeeds(seedPhase) {
  return Array.from({ length: MICRO_SPIKE_COUNT }, (_, index) => {
    const cluster = index % SPIKE_CLUSTER_COUNT;
    const slot = Math.floor(index / SPIKE_CLUSTER_COUNT);
    const seed = unit(seedPhase, 1701 + index * 17);
    return {
      cluster,
      slot,
      seed,
      angle: slot * (TAU / SPIKES_PER_CLUSTER) + seed * 0.82,
      radius: 0.035 + unit(seedPhase, 1702 + index * 17) * 0.18,
      height: 0.62 + unit(seedPhase, 1703 + index * 17) * 0.92,
      width: 0.55 + unit(seedPhase, 1704 + index * 17) * 0.62,
      emergePhase: unit(seedPhase, 1705 + index * 17) * TAU,
      emergeRate: 0.42 + unit(seedPhase, 1706 + index * 17) * 0.42,
      lean: 0.12 + unit(seedPhase, 1707 + index * 17) * 0.23,
      jitter: unit(seedPhase, 1708 + index * 17) * TAU,
    };
  });
}

function createClusterSeeds(seedPhase) {
  return Array.from({ length: SPIKE_CLUSTER_COUNT }, (_, index) => ({
    a: unit(seedPhase, 1601 + index * 19),
    b: unit(seedPhase, 1602 + index * 19),
    c: unit(seedPhase, 1603 + index * 19),
    d: unit(seedPhase, 1604 + index * 19),
    e: unit(seedPhase, 1605 + index * 19),
    index,
  }));
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
  const camera = new THREE.PerspectiveCamera(28.5, 1, 0.1, 20);
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
    microModel: "shader-folds-plus-instanced-magnetic-peaks",
    smoothNormals: false,
    vertices: geometry.getAttribute("position").count,
    fields: FINAL_FIELD_COUNT,
    microSpikes: MICRO_SPIKE_COUNT,
    activeSpikes: 0,
    activeClusters: 0,
    dprCap: WEBGL_DPR_CAP,
    shaderCompiled: false,
    lastCpuMs: 0,
    emaCpuMs: 0,
    maxCpuMs: 0,
    samples: 0,
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: 0x1a1a22,
    metalness: 0.56,
    roughness: 0.235,
    clearcoat: 1,
    clearcoatRoughness: 0.072,
    reflectivity: 0.9,
    sheen: 0.018,
    sheenColor: new THREE.Color(0x29253c),
    side: THREE.DoubleSide,
  });
  configureFinalMaterial(material, uniforms, perf);

  const body = new THREE.Mesh(geometry, material);
  body.frustumCulled = false;
  group.add(body);

  scene.add(new THREE.HemisphereLight(0xf0f0f4, 0x020203, 1.48));
  const key = new THREE.DirectionalLight(0xffffff, 3.2);
  key.position.set(-4.4, 5.7, 5.6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x777198, 1.15);
  rim.position.set(5.2, 2.0, 2.8);
  scene.add(rim);
  const low = new THREE.DirectionalLight(0x5b5962, 2.65);
  low.position.set(-2.2, -3.4, 3.2);
  scene.add(low);
  const edge = new THREE.PointLight(0xffffff, 0.62, 8, 2);
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

  const spikeGeometry = new THREE.ConeGeometry(0.16, 1, 18, 7, false);
  spikeGeometry.computeVertexNormals();
  const spikeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x09090d,
    metalness: 0.62,
    roughness: 0.165,
    clearcoat: 1,
    clearcoatRoughness: 0.044,
    reflectivity: 0.96,
  });
  const spikes = new THREE.InstancedMesh(spikeGeometry, spikeMaterial, MICRO_SPIKE_COUNT);
  spikes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  spikes.frustumCulled = false;
  group.add(spikes);

  const spikeBaseGeometry = new THREE.SphereGeometry(1, 18, 10);
  const spikeBases = new THREE.InstancedMesh(spikeBaseGeometry, spikeMaterial, MICRO_SPIKE_COUNT);
  spikeBases.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  spikeBases.frustumCulled = false;
  group.add(spikeBases);

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
    spikes,
    spikeBases,
    spikeGeometry,
    spikeBaseGeometry,
    spikeMaterial,
    spikeDummy: new THREE.Object3D(),
    normalVector: new THREE.Vector3(),
    directionVector: new THREE.Vector3(),
    spikeSeeds: createSpikeSeeds(seedPhase),
    clusterSeeds: createClusterSeeds(seedPhase),
    clusters: Array.from({ length: SPIKE_CLUSTER_COUNT }, () => ({
      x: 0,
      y: 1,
      z: 0,
      tx: 1,
      ty: 0,
      tz: 0,
      bx: 0,
      by: 0,
      bz: 1,
      life: 0,
      strength: 0,
    })),
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
  state.spikeGeometry.dispose();
  state.spikeBaseGeometry.dispose();
  state.spikeMaterial.dispose();
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

function updateFields(state, g, activity, damage) {
  for (let i = 0; i < FINAL_FIELD_COUNT; i += 1) {
    const seed = state.fieldSeeds[i];
    const field = state.fields[i];
    const { a, b, c, d, e, index } = seed;

    const azimuth = g.phase * (0.31 + a * 0.24 + activity * 0.08)
      + a * TAU
      + Math.sin(g.phase * (0.098 + b * 0.076) + c * TAU) * (0.78 + d * 0.42)
      + Math.sin(g.phase * (0.051 + d * 0.044) + e * TAU) * 0.48;
    const elevation = Math.sin(
      g.phase * (0.17 + c * 0.11 + activity * 0.025) + b * TAU,
    ) * (0.5 + d * 0.17)
      + Math.cos(g.phase * (0.061 + a * 0.052) + c * TAU) * 0.19;

    const cosElevation = Math.cos(elevation);
    const polarityWave = Math.sin(g.phase * (0.21 + d * 0.17) + e * TAU + index * 0.83);
    const polarity = Math.tanh(polarityWave * 2.2);
    const lifeWave = Math.sin(g.phase * (0.25 + e * 0.17) + a * TAU);
    const life = 0.62 + 0.38 * lifeWave * lifeWave;
    const sigma = 0.31 + c * 0.23;

    field.x = Math.cos(azimuth) * cosElevation;
    field.y = Math.sin(elevation);
    field.z = Math.sin(azimuth) * cosElevation;
    field.polarity = polarity;
    field.strength = (
      0.116
      + g.mapped.displacement * 0.126
      + g.pressure * 0.044
      + g.mapped.phaseDisagreement * 0.038
      + damage * 0.06
    ) * life * (0.82 + b * 0.4);
    field.invExtent = 1 / (1.8 * sigma * sigma);
    field.flow = (0.078 + g.mapped.displacement * 0.066 + activity * 0.03) * (0.82 + d * 0.42);
    field.swirl = (0.034 + g.mapped.phaseDisagreement * 0.062 + damage * 0.03) * (0.8 + e * 0.4);
    field.crest = 0.11 + g.mapped.microstructure * 0.16 + g.mapped.brilliance * 0.06 + damage * 0.08;
    field.waveFrequency = 11.4 + index * 1.34;
    field.wavePhase = -g.phase * (1.52 + index * 0.19) + a * TAU + index * 1.71;
    field.crestGate = smooth(clamp((polarity - 0.12) / 0.76));

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

function normaliseVector(target) {
  const length = Math.hypot(target.x, target.y, target.z) || 1;
  target.x /= length;
  target.y /= length;
  target.z /= length;
  return target;
}

function updateSpikeClusters(state, g, activity, damage, audioActive) {
  let activeClusters = 0;
  for (let i = 0; i < SPIKE_CLUSTER_COUNT; i += 1) {
    const seed = state.clusterSeeds[i];
    const field = state.fields[(i * 2 + Math.floor(seed.a * FINAL_FIELD_COUNT)) % state.fields.length];
    const azimuth = g.phase * (0.17 + seed.a * 0.19 + activity * 0.035)
      + seed.b * TAU
      + Math.sin(g.phase * (0.067 + seed.c * 0.046) + seed.d * TAU) * 1.1;
    const elevation = Math.sin(g.phase * (0.12 + seed.d * 0.08) + seed.e * TAU) * 0.62;
    const cosElevation = Math.cos(elevation);
    const wander = {
      x: Math.cos(azimuth) * cosElevation,
      y: Math.sin(elevation),
      z: Math.sin(azimuth) * cosElevation,
    };
    const fieldWeight = 0.58 + Math.abs(field.polarity) * 0.16;
    const normal = normaliseVector({
      x: field.x * fieldWeight + wander.x * (1 - fieldWeight),
      y: field.y * fieldWeight + wander.y * (1 - fieldWeight),
      z: Math.abs(field.z * fieldWeight + wander.z * (1 - fieldWeight)) + 0.18,
    });

    let tx = -normal.z + normal.y * 0.22;
    let ty = normal.x * 0.34 - normal.z * 0.08;
    let tz = normal.x + normal.y * 0.18;
    const invTangent = 1 / (Math.hypot(tx, ty, tz) || 1);
    tx *= invTangent;
    ty *= invTangent;
    tz *= invTangent;
    let bx = normal.y * tz - normal.z * ty;
    let by = normal.z * tx - normal.x * tz;
    let bz = normal.x * ty - normal.y * tx;
    const invBitangent = 1 / (Math.hypot(bx, by, bz) || 1);
    bx *= invBitangent;
    by *= invBitangent;
    bz *= invBitangent;

    const recruitment = 0.5 + 0.5 * Math.sin(
      g.phase * (0.34 + seed.c * 0.23 + g.mapped.emissionRate * 0.07) + seed.a * TAU,
    );
    const dissolve = 0.5 + 0.5 * Math.cos(g.phase * (0.19 + seed.e * 0.18) + seed.b * TAU);
    const fieldEnergy = clamp(Math.abs(field.polarity) * 0.5 + field.strength * 1.4 + activity * 0.22);
    const threshold = 0.6 - g.mapped.microstructure * 0.15 - damage * 0.06 - (audioActive ? 0.065 : 0);
    const life = smooth(clamp((recruitment * 0.66 + dissolve * 0.18 + fieldEnergy * 0.32 - threshold) / 0.42));
    if (life > 0.08) activeClusters += 1;

    const cluster = state.clusters[i];
    cluster.x = normal.x;
    cluster.y = normal.y;
    cluster.z = normal.z;
    cluster.tx = tx;
    cluster.ty = ty;
    cluster.tz = tz;
    cluster.bx = bx;
    cluster.by = by;
    cluster.bz = bz;
    cluster.life = life;
    cluster.strength = fieldEnergy;
  }
  state.perf.activeClusters = activeClusters;
}

function updateMicroSpikes(state, renderer, g, damage, activity) {
  const audioActive = Boolean(renderer.state.audioEnabled && !renderer.state.muted);
  const audioLift = audioActive ? 1.28 : 1;
  const dummy = state.spikeDummy;
  const normalVector = state.normalVector;
  const directionVector = state.directionVector;
  let visible = 0;

  updateSpikeClusters(state, g, activity, damage, audioActive);

  for (let i = 0; i < MICRO_SPIKE_COUNT; i += 1) {
    const seed = state.spikeSeeds[i];
    const cluster = state.clusters[seed.cluster];
    const wave = 0.5 + 0.5 * Math.sin(g.phase * seed.emergeRate + seed.emergePhase);
    const localLife = smooth(clamp((wave + cluster.life * (audioActive ? 1.08 : 0.92) - 0.82) / 0.42));
    const rankGate = seed.slot < 5 ? 1 : seed.slot < 10 ? 0.7 : 0.38;
    const life = localLife * cluster.life * rankGate;
    if (life < 0.065) continue;

    const clusterSpin = g.phase * (0.18 + cluster.strength * 0.08) + seed.jitter;
    const ca = Math.cos(seed.angle + clusterSpin * 0.22);
    const sa = Math.sin(seed.angle + clusterSpin * 0.22);
    const ring = seed.radius * (0.42 + seed.slot / SPIKES_PER_CLUSTER);
    let nx = cluster.x + (cluster.tx * ca + cluster.bx * sa) * ring;
    let ny = cluster.y + (cluster.ty * ca + cluster.by * sa) * ring;
    let nz = cluster.z + (cluster.tz * ca + cluster.bz * sa) * ring;
    const normal = normaliseVector({ x: nx, y: ny, z: nz });

    const leanWave = Math.sin(g.phase * (0.52 + seed.seed * 0.25) + seed.jitter);
    let dx = normal.x + (cluster.tx * ca + cluster.bx * sa) * seed.lean * leanWave * life;
    let dy = normal.y + (cluster.ty * ca + cluster.by * sa) * seed.lean * leanWave * life;
    let dz = normal.z + (cluster.tz * ca + cluster.bz * sa) * seed.lean * leanWave * life;
    const direction = normaliseVector({ x: dx, y: dy, z: dz });

    const height = (0.082 + seed.height * 0.058 + g.mapped.microstructure * 0.046 + damage * 0.026)
      * life
      * audioLift;
    const radius = (0.007 + seed.width * 0.005 + life * 0.003) * (0.86 + damage * 0.18);
    const surface = 1.006 + cluster.strength * 0.035 + life * 0.012;

    dummy.position.set(
      normal.x * (surface + height * 0.42),
      normal.y * (surface + height * 0.42),
      normal.z * (surface + height * 0.42),
    );
    directionVector.set(direction.x, direction.y, direction.z);
    dummy.quaternion.setFromUnitVectors(UNIT_Y, directionVector);
    dummy.scale.set(radius * 3.9, height, radius * 3.9);
    dummy.updateMatrix();
    state.spikes.setMatrixAt(visible, dummy.matrix);

    dummy.position.set(
      normal.x * (surface - 0.006),
      normal.y * (surface - 0.006),
      normal.z * (surface - 0.006),
    );
    normalVector.set(normal.x, normal.y, normal.z);
    dummy.quaternion.setFromUnitVectors(UNIT_Y, normalVector);
    dummy.scale.set(radius * 1.35, 0.003 + life * 0.004, radius * 1.1);
    dummy.updateMatrix();
    state.spikeBases.setMatrixAt(visible, dummy.matrix);
    visible += 1;
  }

  for (let i = visible; i < MICRO_SPIKE_COUNT; i += 1) {
    state.spikes.setMatrixAt(i, state.satelliteZeroMatrix);
    state.spikeBases.setMatrixAt(i, state.satelliteZeroMatrix);
  }
  state.spikes.count = MICRO_SPIKE_COUNT;
  state.spikeBases.count = MICRO_SPIKE_COUNT;
  state.spikes.instanceMatrix.needsUpdate = true;
  state.spikeBases.instanceMatrix.needsUpdate = true;
  state.perf.activeSpikes = visible;
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
    baseScale * (1.03 + g.mapped.lateralSpread * 0.055 + activity * 0.022),
    baseScale * (0.99 - g.art.compression * 0.022 + Math.abs(cy) * 0.026),
    baseScale * (0.985 + damage * 0.018 + Math.abs(cz) * 0.018),
  );
  state.group.position.x = wide ? 0.6 + cx * 0.06 : cx * 0.026;
  state.group.position.y = cy * 0.046 - g.art.compression * 0.018;
  state.group.position.z = 0;
  state.group.rotation.x = 0.055 + cy * 0.075 + g.tilt * 0.055;
  state.group.rotation.y = -0.15 + cx * 0.12 + g.torsion * 0.15;
  state.group.rotation.z = -0.025 + cz * 0.07;

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
    renderer._flagshipFinalFormWebglFailure = error;
    throw error;
  }

  const resized = resize(state, renderer.canvas);
  updateUniforms(state, renderer, g, band, damage, activity);
  updateSatellites(state, renderer, g, damage, activity);
  updateMicroSpikes(state, renderer, g, damage, activity);
  updateObject(state, g, damage, activity, state.cssWidth / Math.max(1, state.cssHeight), mix);
  state.webgl.render(state.scene, state.camera);

  if (state.webgl.info.render.triangles <= 0) {
    throw new Error("Flagship final-form WebGL mesh produced no rendered triangles.");
  }

  if (resized || state.frameIndex % PLATE_STRIDE === 0 || state.frameIndex < 2) {
    studioPlate(renderer.context, g, width, height, band, damage, activity);
  }
  state.frameIndex += 1;
  recordCpuPerf(state, startedAt);
}
