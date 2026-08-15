"use strict";

import * as THREE from "/lab/vendor/three/three.module.min.js";
import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { transitionMix } from "../spectral-field-state.js";
import { canvasSize, clamp, routeBand, unit } from "./proto-core.js";

const RENDERER_ID = "proto-flagship-anatomy-f2";
const WEBGL_CLASS = "spectral-field-proto-webgl";
const FIELD_COUNT = 7;
const SATELLITE_COUNT = 14;
const WIDTH_SEGMENTS = 96;
const HEIGHT_SEGMENTS = 64;
const NORMAL_STRIDE = 2;
const COLOUR_STRIDE = 2;
const PLATE_STRIDE = 4;
const WEBGL_DPR_CAP = 1.75;
const TAU = Math.PI * 2;

function smooth(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function studioPlate(context, g, width, height, ratio, band, damage, activity) {
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
  floor.addColorStop(0, `rgba(0,0,0,${0.58 + damage * 0.16 + activity * 0.05})`);
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

function createVertexCache(position, seedPhase) {
  const count = position.count;
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);
  const identity = new Float32Array(count);
  const conflictArg = new Float32Array(count);
  const counterArgA = new Float32Array(count);
  const counterArgB = new Float32Array(count);
  const slipArg = new Float32Array(count);
  const routeCoord = new Float32Array(count);

  const identitySeed = unit(seedPhase, 1091) * TAU;
  for (let i = 0; i < count; i += 1) {
    const px = position.getX(i);
    const py = position.getY(i);
    const pz = position.getZ(i);
    const invLength = 1 / (Math.hypot(px, py, pz) || 1);
    const nx = px * invLength;
    const ny = py * invLength;
    const nz = pz * invLength;

    x[i] = nx;
    y[i] = ny;
    z[i] = nz;
    identity[i] = Math.sin(nx * 2.1 + ny * 1.7 - nz * 1.35 + identitySeed) * 0.018
      + Math.cos(nx * 1.15 - ny * 2.35 + nz * 1.8 - identitySeed * 0.7) * 0.013;
    conflictArg[i] = nx * 5.0 - ny * 4.1 + nz * 3.6 + identitySeed;
    counterArgA[i] = nx * 2.0 - ny * 1.35 + nz * 1.62 + identitySeed * 0.4;
    counterArgB[i] = nx * 1.12 + ny * 2.28 - nz * 1.34 + identitySeed * 0.8;
    slipArg[i] = nx * 4.4 - ny * 3.6 + nz * 3.1 + identitySeed;
    routeCoord[i] = nx * 0.5 + 0.5;
  }

  return { x, y, z, identity, conflictArg, counterArgA, counterArgB, slipArg, routeCoord };
}

function createFieldSeeds(seedPhase) {
  return Array.from({ length: FIELD_COUNT }, (_, index) => ({
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
  webgl.toneMappingExposure = 1.2;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28.5, 1, 0.1, 20);
  camera.position.set(0, 0.02, 4.42);

  const group = new THREE.Group();
  scene.add(group);

  const geometry = new THREE.SphereGeometry(1, WIDTH_SEGMENTS, HEIGHT_SEGMENTS);
  const position = geometry.getAttribute("position");
  const colours = new Float32Array(position.count * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  const vertex = createVertexCache(position, seedPhase);

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    metalness: 0.54,
    roughness: 0.185,
    clearcoat: 1,
    clearcoatRoughness: 0.052,
    reflectivity: 0.94,
    sheen: 0.018,
    sheenColor: new THREE.Color(0x2f2b45),
    side: THREE.DoubleSide,
  });
  const body = new THREE.Mesh(geometry, material);
  body.frustumCulled = false;
  group.add(body);

  scene.add(new THREE.HemisphereLight(0xe8e8ee, 0x010102, 1.1));

  const key = new THREE.DirectionalLight(0xffffff, 6.3);
  key.position.set(-4.4, 5.7, 5.6);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x746d99, 1.5);
  rim.position.set(5.2, 2.0, 2.8);
  scene.add(rim);

  const low = new THREE.DirectionalLight(0x363640, 1.5);
  low.position.set(-2.2, -3.4, 3.2);
  scene.add(low);

  const edge = new THREE.PointLight(0xffffff, 1.3, 8, 2);
  edge.position.set(1.5, 2.55, 3.4);
  scene.add(edge);

  const satelliteGeometry = new THREE.SphereGeometry(0.042, 12, 9);
  const satelliteMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x060608,
    metalness: 0.56,
    roughness: 0.17,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  const satellites = new THREE.InstancedMesh(satelliteGeometry, satelliteMaterial, SATELLITE_COUNT);
  satellites.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  satellites.frustumCulled = false;
  group.add(satellites);

  const satelliteDummy = new THREE.Object3D();
  const fields = Array.from({ length: FIELD_COUNT }, () => ({}));
  const fieldSeeds = createFieldSeeds(seedPhase);
  const satelliteSeeds = createSatelliteSeeds(seedPhase);

  const perf = {
    vertices: position.count,
    fields: FIELD_COUNT,
    dprCap: WEBGL_DPR_CAP,
    normalStride: NORMAL_STRIDE,
    plateStride: PLATE_STRIDE,
    lastMs: 0,
    emaMs: 0,
    maxMs: 0,
    samples: 0,
  };
  canvas.__atlasPerf = perf;

  const state = {
    canvas,
    webgl,
    scene,
    camera,
    group,
    geometry,
    material,
    body,
    vertex,
    satelliteGeometry,
    satelliteMaterial,
    satellites,
    satelliteDummy,
    satelliteSeeds,
    fieldSeeds,
    fields,
    cssWidth: 0,
    cssHeight: 0,
    disposed: false,
    frameIndex: 0,
    normalFrame: -1,
    colourFrame: -1,
    lastWide: null,
    lastOpacity: "",
    perf,
  };

  canvas.__atlasDispose = () => disposeState(renderer, state);
  renderer._flagshipAnatomyF2Webgl = state;
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
  if (renderer._flagshipAnatomyF2Webgl === state) renderer._flagshipAnatomyF2Webgl = null;
}

export function disposeFlagshipAnatomyF2(renderer) {
  const state = renderer?._flagshipAnatomyF2Webgl;
  if (state) disposeState(renderer, state);
}

function ensureState(renderer, seedPhase) {
  const current = renderer._flagshipAnatomyF2Webgl;
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
  for (let i = 0; i < FIELD_COUNT; i += 1) {
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
    field.strength = (0.105 + g.mapped.displacement * 0.105 + g.pressure * 0.036 + g.mapped.phaseDisagreement * 0.032 + damage * 0.055)
      * life * (0.82 + b * 0.4);
    field.invExtent = 1 / (1.8 * sigma * sigma);
    field.flow = (0.065 + g.mapped.displacement * 0.055 + activity * 0.024) * (0.82 + d * 0.42);
    field.swirl = (0.028 + g.mapped.phaseDisagreement * 0.052 + damage * 0.025) * (0.8 + e * 0.4);
    field.crest = 0.09 + g.mapped.microstructure * 0.12 + g.mapped.brilliance * 0.055 + damage * 0.08;
    field.waveFrequency = 9.8 + index * 1.05;
    field.wavePhase = -g.phase * (1.34 + index * 0.17) + a * TAU + index * 1.71;
    field.crestGate = smooth(clamp((polarity - 0.18) / 0.82));
  }
}

function deformBody(state, renderer, g, band, damage, activity, updateColour) {
  const position = state.geometry.getAttribute("position");
  const colour = state.geometry.getAttribute("color");
  const vertex = state.vertex;
  updateFields(state, g, activity, damage);

  const audioActive = Boolean(renderer.state?.audioEnabled && !renderer.state?.muted);
  const audioEnergy = audioActive ? 1.34 : 1;
  const coherenceLoss = 1 - g.coherence;
  const routeCenter = band ? (band.x0 + band.x1) * 0.5 : 0.5;
  const routeWidth = band ? Math.max(0.06, (band.x1 - band.x0) * 0.55) : 0.1;
  const breath = (g.breathing - 0.5) * (0.012 + g.mapped.displacement * 0.012);
  const conflictTime = g.phase * 1.33;
  const counterTimeA = g.phase * 0.78;
  const counterTimeB = -g.phase * 0.53;
  const slipTime = g.phase * 1.72;
  const routeLatitudeTime = g.phase * 0.18;
  const routePulseTime = g.phase * (2.1 + g.mapped.emissionRate * 2.7);
  const flowScale = 0.92 + activity * 0.22 + damage * 0.16;
  const scaleX = 1.07 + g.mapped.lateralSpread * 0.045 + damage * 0.02;
  const scaleY = 0.91 - g.art.compression * 0.025 + g.art.stretch * 0.02;
  const scaleZ = 0.96 + g.mapped.afterimage * 0.018;
  const counterScale = (0.026 + g.mapped.displacement * 0.032 + activity * 0.018) * audioEnergy;
  const ridgeScale = (0.015 + g.mapped.displacement * 0.022 + damage * 0.018) * audioEnergy;

  for (let i = 0; i < position.count; i += 1) {
    const x = vertex.x[i];
    const y = vertex.y[i];
    const z = vertex.z[i];

    let radial = vertex.identity[i] + breath;
    let flowX = 0;
    let flowY = 0;
    let flowZ = 0;
    let gradient = 0;
    let overlap = 0;
    let sourceEnergy = 0;
    let sinkEnergy = 0;

    for (let fieldIndex = 0; fieldIndex < FIELD_COUNT; fieldIndex += 1) {
      const field = state.fields[fieldIndex];
      let dot = x * field.x + y * field.y + z * field.z;
      if (dot > 1) dot = 1;
      else if (dot < -1) dot = -1;

      const distance2 = Math.max(0, 2 - 2 * dot);
      const q = 1 - distance2 * field.invExtent;
      if (q <= 0) continue;

      const q2 = q * q;
      const influence = q2 * (3 - 2 * q);
      const ring = influence * (1 - influence) * 4;
      const absolute = influence * field.strength;
      const signed = absolute * field.polarity;

      radial += signed * audioEnergy;
      gradient += ring * field.strength;
      overlap += influence * influence;
      if (field.polarity > 0) sourceEnergy += absolute * field.polarity;
      else sinkEnergy += absolute * -field.polarity;

      if (ring > 0.0005) {
        const tangentSq = Math.max(0.0001, 1 - dot * dot);
        const invTangent = 1 / Math.sqrt(tangentSq);
        const tx = (field.x - x * dot) * invTangent;
        const ty = (field.y - y * dot) * invTangent;
        const tz = (field.z - z * dot) * invTangent;
        const pull = ring * field.flow * field.polarity * audioEnergy;
        flowX += tx * pull;
        flowY += ty * pull;
        flowZ += tz * pull;

        const sx = y * field.z - z * field.y;
        const sy = z * field.x - x * field.z;
        const sz = x * field.y - y * field.x;
        const wave = Math.sin(dot * field.waveFrequency + field.wavePhase);
        const swirl = influence * field.swirl * wave * audioEnergy;
        flowX += sx * swirl;
        flowY += sy * swirl;
        flowZ += sz * swirl;
        radial += ring * wave * ridgeScale;

        if (field.crestGate > 0.001 && field.polarity > 0) {
          const crestBase = 0.5 + 0.5 * wave;
          const crest2 = crestBase * crestBase;
          const crestPulse = crest2 * crest2 * Math.sqrt(Math.max(0, crestBase));
          const influence3 = influence * influence * influence;
          radial += influence3 * field.crestGate * crestPulse * field.crest * audioEnergy;
        }
      }
    }

    const conflict = clamp(overlap / FIELD_COUNT * 2.25);
    const gatherDelta = (sourceEnergy - sinkEnergy) * 4.2;
    const gather = gatherDelta / (1 + Math.abs(gatherDelta));
    const conflictWave = Math.sin(vertex.conflictArg[i] + conflictTime);
    radial += conflict * conflictWave * (0.026 + g.mapped.phaseDisagreement * 0.044 + damage * 0.04) * audioEnergy;
    radial += gather * conflict * (0.022 + g.mapped.displacement * 0.036);

    const counter = Math.sin(vertex.counterArgA[i] + counterTimeA)
      * Math.cos(vertex.counterArgB[i] + counterTimeB) * counterScale;
    radial += counter;

    const radius = 1 + radial;
    let px = x * radius * scaleX;
    let py = y * radius * scaleY;
    let pz = z * radius * scaleZ;
    px += flowX * flowScale;
    py += flowY * flowScale;
    pz += flowZ * flowScale;

    const slip = Math.sin(vertex.slipArg[i] + slipTime)
      * coherenceLoss * gradient * (0.65 + g.mapped.phaseDisagreement * 1.7) * audioEnergy;
    px += -y * slip;
    py += x * slip;
    pz += (x - z) * slip * 0.25;

    let route = 0;
    if (band) {
      const routeDistance = Math.abs(vertex.routeCoord[i] - routeCenter);
      const falloff = clamp(1 - routeDistance / routeWidth);
      if (falloff > 0) {
        const latitudeOffset = (y + Math.sin(z * 2.2 + routeLatitudeTime) * 0.11) * 1.85;
        const latitudeSq = latitudeOffset * latitudeOffset;
        const latitude = 1 / (1 + latitudeSq * 2.6 + latitudeSq * latitudeSq * 0.8);
        route = falloff * falloff * latitude;
        const routePulse = 0.5 + 0.5 * Math.sin(routePulseTime + z * 5.3);
        px += -y * route * (0.012 + routePulse * 0.01);
        py += x * route * (0.008 + routePulse * 0.012);
      }
    }

    position.setXYZ(i, px, py, pz);

    if (updateColour) {
      const cool = clamp(0.055 + Math.max(0, z) * 0.055 + g.mapped.brilliance * 0.052 + gradient * 0.48 + conflict * 0.12);
      let r = 0.008 + cool * 0.027;
      let gg = 0.0085 + cool * 0.028;
      let bl = 0.012 + cool * 0.046 + damage * 0.003;
      const violet = clamp(Math.max(0, -x * 0.24 + z * 0.18) * 0.045 + g.mapped.afterimage * 0.014 + conflict * 0.018);
      r += violet * 0.32;
      bl += violet * 0.62;
      if (route > 0) {
        const wound = clamp(route * (0.12 + activity * 0.16));
        r += wound * 0.72;
        gg += wound * 0.29;
        bl += wound * 0.015;
      }
      colour.setXYZ(i, clamp(r), clamp(gg), clamp(bl));
    }
  }

  position.needsUpdate = true;
  if (updateColour) colour.needsUpdate = true;
}

function updateSurfaceNormals(state, force) {
  if (!force && state.frameIndex % NORMAL_STRIDE !== 0) return;
  state.geometry.computeVertexNormals();
  const normals = state.geometry.getAttribute("normal");
  if (normals) normals.needsUpdate = true;
  state.normalFrame = state.frameIndex;
}

function updateSatellites(state, renderer, g, damage, activity) {
  const audioActive = Boolean(renderer.state?.audioEnabled && !renderer.state?.muted);
  const fields = state.fields;
  const normalBudget = 2 + Math.floor(activity * 2) + (audioActive ? 1 : 0);
  const activeBudget = Math.min(SATELLITE_COUNT, normalBudget + Math.floor(damage * 7));
  const dummy = state.satelliteDummy;

  for (let i = 0; i < SATELLITE_COUNT; i += 1) {
    const seed = state.satelliteSeeds[i];
    if (!fields.length || i >= activeBudget) {
      dummy.position.set(0, 0, 0);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      state.satellites.setMatrixAt(i, dummy.matrix);
      continue;
    }

    const field = fields[i % fields.length];
    const rate = seed.rateBase + damage * 0.04;
    const cycle = (g.phase * rate + seed.phase37) % 1;
    const event = 0.5 + 0.5 * Math.sin(g.phase * seed.eventRate + seed.phase);
    const threshold = damage > 0.45 ? 0.38 : 0.68;
    if (event < threshold) {
      dummy.position.set(0, 0, 0);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      state.satellites.setMatrixAt(i, dummy.matrix);
      continue;
    }

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

    dummy.position.set(field.x * radial + tx * orbit, field.y * radial + ty * orbit, field.z * radial + tz * orbit);
    const scale = Math.max(0.12, arc * (0.38 + seed.seed * 0.48) * (0.78 + damage * 0.45));
    dummy.scale.set(scale * (1 + arc * 0.38), scale * (0.76 + (1 - arc) * 0.24), scale * (0.82 + seed.seed * 0.24));
    dummy.updateMatrix();
    state.satellites.setMatrixAt(i, dummy.matrix);
  }
  state.satellites.instanceMatrix.needsUpdate = true;
}

function updateObject(state, g, damage, activity, aspect, mix) {
  const wide = aspect > 1.55;
  const baseScale = wide ? 1.08 : 0.89;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let weight = 0;
  for (let i = 0; i < FIELD_COUNT; i += 1) {
    const field = state.fields[i];
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

function updatePerf(state, elapsed) {
  const perf = state.perf;
  perf.lastMs = elapsed;
  perf.samples += 1;
  perf.emaMs = perf.samples === 1 ? elapsed : perf.emaMs * 0.94 + elapsed * 0.06;
  perf.maxMs = Math.max(perf.maxMs, elapsed);
}

export function drawFlagshipAnatomyF2(renderer, timestamp = performance.now()) {
  if (!renderer.context || !renderer.state) return;
  renderer.canvas.dataset.fieldRenderer = RENDERER_ID;
  renderer.canvas.dataset.fieldBackend = "webgl";

  const frameStart = performance.now();
  const { width, height, ratio } = canvasSize(renderer.canvas);
  const g = deriveFieldGeometry(renderer.state, renderer.visualTime, width, height);
  const mix = transitionMix.call(renderer, timestamp);
  const band = routeBand(renderer.state.selectedMapping);
  const damage = clamp(g.health.severity * 0.66 + g.deformation * 0.32 + g.art.fractureBias * 0.18);
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
    renderer._flagshipAnatomyF2WebglFailure = error;
    throw error;
  }

  const resized = resize(state, renderer.canvas);
  state.frameIndex += 1;
  const updateColour = resized || state.colourFrame < 0 || state.frameIndex % COLOUR_STRIDE === 0;
  const aspect = state.cssWidth / Math.max(1, state.cssHeight);

  deformBody(state, renderer, g, band, damage, activity, updateColour);
  if (updateColour) state.colourFrame = state.frameIndex;
  updateSurfaceNormals(state, resized || state.normalFrame < 0);
  updateSatellites(state, renderer, g, damage, activity);
  updateObject(state, g, damage, activity, aspect, mix);
  state.webgl.render(state.scene, state.camera);

  if (state.webgl.info.render.triangles <= 0) {
    throw new Error("Flagship anatomy F2 WebGL mesh produced no rendered triangles.");
  }
  if (resized || state.frameIndex % PLATE_STRIDE === 0 || mix < 0.999) {
    studioPlate(renderer.context, g, width, height, ratio, band, damage, activity);
  }
  updatePerf(state, performance.now() - frameStart);
}
