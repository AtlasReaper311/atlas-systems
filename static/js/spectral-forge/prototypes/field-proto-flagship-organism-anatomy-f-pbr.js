"use strict";

import * as THREE from "/lab/vendor/three/three.module.min.js";
import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { transitionMix } from "../spectral-field-state.js";
import { canvasSize, clamp, routeBand, unit } from "./proto-core.js";

const RENDERER_ID = "proto-flagship-anatomy-f";
const WEBGL_CLASS = "spectral-field-proto-webgl";
const FIELD_COUNT = 7;
const SATELLITE_COUNT = 14;
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

function createState(renderer) {
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
  webgl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  webgl.setClearColor(0x000000, 0);
  webgl.outputColorSpace = THREE.SRGBColorSpace;
  webgl.toneMapping = THREE.ACESFilmicToneMapping;
  webgl.toneMappingExposure = 1.2;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28.5, 1, 0.1, 20);
  camera.position.set(0, 0.02, 4.42);

  const group = new THREE.Group();
  scene.add(group);

  const geometry = new THREE.SphereGeometry(1, 120, 82);
  const position = geometry.getAttribute("position");
  const basePositions = new Float32Array(position.array);
  const colours = new Float32Array(position.count * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));

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

  const satelliteGeometry = new THREE.SphereGeometry(0.042, 16, 12);
  const satelliteMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x060608,
    metalness: 0.56,
    roughness: 0.17,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  const satellites = [];
  for (let i = 0; i < SATELLITE_COUNT; i += 1) {
    const item = new THREE.Mesh(satelliteGeometry, satelliteMaterial);
    item.visible = false;
    group.add(item);
    satellites.push(item);
  }

  const state = {
    canvas,
    webgl,
    scene,
    camera,
    group,
    geometry,
    material,
    body,
    basePositions,
    colours,
    satelliteGeometry,
    satelliteMaterial,
    satellites,
    cssWidth: 0,
    cssHeight: 0,
    disposed: false,
    fields: [],
  };

  canvas.__atlasDispose = () => disposeState(renderer, state);
  renderer._flagshipAnatomyFWebgl = state;
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
  if (renderer._flagshipAnatomyFWebgl === state) renderer._flagshipAnatomyFWebgl = null;
}

export function disposeFlagshipAnatomyF(renderer) {
  const state = renderer?._flagshipAnatomyFWebgl;
  if (state) disposeState(renderer, state);
}

function ensureState(renderer) {
  const current = renderer._flagshipAnatomyFWebgl;
  if (current && !current.disposed && current.canvas.isConnected) return current;
  return createState(renderer);
}

function resize(state, sourceCanvas) {
  const cssWidth = Math.max(1, sourceCanvas.clientWidth);
  const cssHeight = Math.max(1, sourceCanvas.clientHeight);
  if (state.cssWidth === cssWidth && state.cssHeight === cssHeight) return;
  state.cssWidth = cssWidth;
  state.cssHeight = cssHeight;
  state.webgl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  state.webgl.setSize(cssWidth, cssHeight, false);
  state.camera.aspect = cssWidth / cssHeight;
  state.camera.updateProjectionMatrix();
}

function fieldCentre(g, index, activity, damage) {
  const a = unit(g.seedPhase, 1001 + index * 11);
  const b = unit(g.seedPhase, 1002 + index * 11);
  const c = unit(g.seedPhase, 1003 + index * 11);
  const d = unit(g.seedPhase, 1004 + index * 11);
  const e = unit(g.seedPhase, 1005 + index * 11);

  const azimuth = g.phase * (0.29 + a * 0.22 + activity * 0.07)
    + a * TAU
    + Math.sin(g.phase * (0.091 + b * 0.073) + c * TAU) * (0.72 + d * 0.38)
    + Math.sin(g.phase * (0.047 + d * 0.041) + e * TAU) * 0.42;
  const elevation = Math.sin(
    g.phase * (0.17 + c * 0.11 + activity * 0.025) + b * TAU,
  ) * (0.5 + d * 0.17)
    + Math.cos(g.phase * (0.061 + a * 0.052) + c * TAU) * 0.19;

  const cosElevation = Math.cos(elevation);
  const polarityWave = Math.sin(
    g.phase * (0.21 + d * 0.17) + e * TAU + index * 0.83,
  );
  const polarity = Math.tanh(polarityWave * 2.2);
  const life = 0.62 + 0.38 * Math.sin(
    g.phase * (0.25 + e * 0.17) + a * TAU,
  ) ** 2;
  const strength = (
    0.105
    + g.mapped.displacement * 0.105
    + g.pressure * 0.036
    + g.mapped.phaseDisagreement * 0.032
    + damage * 0.055
  ) * life * (0.82 + b * 0.4);

  return {
    x: Math.cos(azimuth) * cosElevation,
    y: Math.sin(elevation),
    z: Math.sin(azimuth) * cosElevation,
    polarity,
    strength,
    sigma: 0.38 + c * 0.22,
    flow: (0.065 + g.mapped.displacement * 0.055 + activity * 0.024) * (0.82 + d * 0.42),
    swirl: (0.028 + g.mapped.phaseDisagreement * 0.052 + damage * 0.025) * (0.8 + e * 0.4),
    crest: 0.09 + g.mapped.microstructure * 0.12 + g.mapped.brilliance * 0.055 + damage * 0.08,
    phase: a * TAU + index * 1.71,
  };
}

function buildFields(g, activity, damage) {
  return Array.from({ length: FIELD_COUNT }, (_, index) => fieldCentre(g, index, activity, damage));
}

function deformBody(state, renderer, g, band, damage, activity) {
  const position = state.geometry.getAttribute("position");
  const colour = state.geometry.getAttribute("color");
  const base = state.basePositions;
  const fields = buildFields(g, activity, damage);
  state.fields = fields;

  const audioActive = Boolean(renderer.state?.audioEnabled && !renderer.state?.muted);
  const audioEnergy = audioActive ? 1.34 : 1;
  const coherenceLoss = 1 - g.coherence;
  const routeCenter = band ? (band.x0 + band.x1) * 0.5 : 0.5;
  const routeWidth = band ? Math.max(0.06, (band.x1 - band.x0) * 0.55) : 0.1;
  const identitySeed = unit(g.seedPhase, 1091) * TAU;

  for (let i = 0; i < position.count; i += 1) {
    const offset = i * 3;
    let x = base[offset];
    let y = base[offset + 1];
    let z = base[offset + 2];
    const length = Math.hypot(x, y, z) || 1;
    x /= length;
    y /= length;
    z /= length;

    const identity = Math.sin(x * 2.1 + y * 1.7 - z * 1.35 + identitySeed) * 0.018
      + Math.cos(x * 1.15 - y * 2.35 + z * 1.8 - identitySeed * 0.7) * 0.013;
    const breath = (g.breathing - 0.5) * (0.012 + g.mapped.displacement * 0.012);

    let radial = identity + breath;
    let flowX = 0;
    let flowY = 0;
    let flowZ = 0;
    let gradient = 0;
    let overlap = 0;
    let sourceEnergy = 0;
    let sinkEnergy = 0;

    for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
      const field = fields[fieldIndex];
      const dot = clamp(x * field.x + y * field.y + z * field.z, -1, 1);
      const distance2 = Math.max(0, 2 - 2 * dot);
      const influence = Math.exp(-distance2 / (field.sigma * field.sigma));
      const ring = influence * (1 - influence) * 4;
      const signed = influence * field.strength * field.polarity;
      const absolute = influence * field.strength;

      radial += signed * audioEnergy;
      gradient += ring * field.strength;
      overlap += influence * influence;
      if (field.polarity > 0) sourceEnergy += absolute * field.polarity;
      else sinkEnergy += absolute * -field.polarity;

      let tx = field.x - x * dot;
      let ty = field.y - y * dot;
      let tz = field.z - z * dot;
      const tangentLength = Math.hypot(tx, ty, tz) || 1;
      tx /= tangentLength;
      ty /= tangentLength;
      tz /= tangentLength;

      const pull = ring * field.flow * field.polarity * audioEnergy;
      flowX += tx * pull;
      flowY += ty * pull;
      flowZ += tz * pull;

      const sx = y * field.z - z * field.y;
      const sy = z * field.x - x * field.z;
      const sz = x * field.y - y * field.x;
      const swirlWave = Math.sin(
        g.phase * (0.95 + fieldIndex * 0.14) + field.phase + dot * 6.1,
      );
      const swirl = influence * field.swirl * swirlWave * audioEnergy;
      flowX += sx * swirl;
      flowY += sy * swirl;
      flowZ += sz * swirl;

      radial += ring * Math.sin(
        dot * (10.4 + fieldIndex * 1.2)
        - g.phase * (1.45 + fieldIndex * 0.19)
        + field.phase,
      ) * (0.015 + g.mapped.displacement * 0.022 + damage * 0.018) * audioEnergy;

      const crestGate = smooth(clamp((field.polarity - 0.18) / 0.82));
      const crestPulse = Math.pow(
        0.5 + 0.5 * Math.sin(g.phase * (1.7 + fieldIndex * 0.12) + field.phase + dot * 5.4),
        4.4,
      );
      radial += Math.pow(influence, 2.9) * crestGate * crestPulse * field.crest * audioEnergy;
    }

    const conflict = clamp(overlap / FIELD_COUNT * 2.25);
    const gather = Math.tanh((sourceEnergy - sinkEnergy) * 4.2);
    const conflictWave = Math.sin(
      x * 5.0 - y * 4.1 + z * 3.6 + g.phase * 1.33 + identitySeed,
    );
    radial += conflict * conflictWave * (
      0.026 + g.mapped.phaseDisagreement * 0.044 + damage * 0.04
    ) * audioEnergy;
    radial += gather * conflict * (0.022 + g.mapped.displacement * 0.036);

    const counterA = Math.sin(
      x * 2.0 - y * 1.35 + z * 1.62 + g.phase * 0.78 + identitySeed * 0.4,
    );
    const counterB = Math.cos(
      x * 1.12 + y * 2.28 - z * 1.34 - g.phase * 0.53 + identitySeed * 0.8,
    );
    const counter = counterA * counterB * (
      0.026 + g.mapped.displacement * 0.032 + activity * 0.018
    ) * audioEnergy;
    radial += counter;

    const radius = 1 + radial;
    let px = x * radius * (1.07 + g.mapped.lateralSpread * 0.045 + damage * 0.02);
    let py = y * radius * (0.91 - g.art.compression * 0.025 + g.art.stretch * 0.02);
    let pz = z * radius * (0.96 + g.mapped.afterimage * 0.018);

    const flowScale = 0.92 + activity * 0.22 + damage * 0.16;
    px += flowX * flowScale;
    py += flowY * flowScale;
    pz += flowZ * flowScale;

    const slip = Math.sin(
      x * 4.4 - y * 3.6 + z * 3.1 + g.phase * 1.72 + identitySeed,
    ) * coherenceLoss * gradient * (0.65 + g.mapped.phaseDisagreement * 1.7) * audioEnergy;
    px += -y * slip;
    py += x * slip;
    pz += (x - z) * slip * 0.25;

    let route = 0;
    if (band) {
      const routeCoord = x * 0.5 + 0.5;
      const routeDistance = Math.abs(routeCoord - routeCenter);
      const falloff = clamp(1 - routeDistance / routeWidth);
      const latitude = Math.exp(-Math.pow(
        (y + Math.sin(z * 2.2 + g.phase * 0.18) * 0.11) * 1.85,
        2,
      ));
      route = falloff * falloff * latitude;
      const routePulse = 0.5 + 0.5 * Math.sin(g.phase * (2.1 + g.mapped.emissionRate * 2.7) + z * 5.3);
      px += -y * route * (0.012 + routePulse * 0.01);
      py += x * route * (0.008 + routePulse * 0.012);
    }

    position.setXYZ(i, px, py, pz);

    const cool = clamp(
      0.055
      + Math.max(0, z) * 0.055
      + g.mapped.brilliance * 0.052
      + gradient * 0.48
      + conflict * 0.12,
    );
    let r = 0.008 + cool * 0.027;
    let gg = 0.0085 + cool * 0.028;
    let bl = 0.012 + cool * 0.046 + damage * 0.003;

    const violet = clamp(
      Math.max(0, -x * 0.24 + z * 0.18) * 0.045
      + g.mapped.afterimage * 0.014
      + conflict * 0.018,
    );
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

  position.needsUpdate = true;
  colour.needsUpdate = true;
  state.geometry.computeVertexNormals();
  const normals = state.geometry.getAttribute("normal");
  if (normals) normals.needsUpdate = true;
}

function updateSatellites(state, renderer, g, damage, activity) {
  const audioActive = Boolean(renderer.state?.audioEnabled && !renderer.state?.muted);
  const fields = state.fields;
  const normalBudget = 2 + Math.floor(activity * 2) + (audioActive ? 1 : 0);
  const activeBudget = Math.min(
    SATELLITE_COUNT,
    normalBudget + Math.floor(damage * 7),
  );

  for (let i = 0; i < SATELLITE_COUNT; i += 1) {
    const satellite = state.satellites[i];
    if (!fields.length || i >= activeBudget) {
      satellite.visible = false;
      continue;
    }

    const field = fields[i % fields.length];
    const seed = unit(g.seedPhase, 1201 + i * 5);
    const rate = 0.12 + seed * 0.11 + damage * 0.04;
    const cycle = (g.phase * rate + seed * 3.7) % 1;
    const event = 0.5 + 0.5 * Math.sin(g.phase * (0.31 + seed * 0.16) + seed * TAU);
    const threshold = damage > 0.45 ? 0.38 : 0.68;
    if (event < threshold) {
      satellite.visible = false;
      continue;
    }

    const arc = Math.sin(Math.PI * cycle);
    const radial = 1.02 + arc * (0.18 + activity * 0.12 + damage * 0.28);
    const tangentAngle = g.phase * (0.5 + seed * 0.4) + seed * TAU;
    let tx = -field.y;
    let ty = field.x;
    let tz = field.z * 0.25;
    const tangentLength = Math.hypot(tx, ty, tz) || 1;
    tx /= tangentLength;
    ty /= tangentLength;
    tz /= tangentLength;
    const orbit = Math.sin(tangentAngle) * arc * (0.09 + damage * 0.06);

    satellite.visible = true;
    satellite.position.set(
      field.x * radial + tx * orbit,
      field.y * radial + ty * orbit,
      field.z * radial + tz * orbit,
    );
    const scale = Math.max(0.12, arc * (0.38 + seed * 0.48) * (0.78 + damage * 0.45));
    satellite.scale.set(
      scale * (1 + arc * 0.38),
      scale * (0.76 + (1 - arc) * 0.24),
      scale * (0.82 + seed * 0.24),
    );
  }
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
  cx /= weight || 1;
  cy /= weight || 1;
  cz /= weight || 1;

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

  state.canvas.style.opacity = String(0.64 + mix * 0.36);
  state.canvas.style.webkitMaskImage = wide
    ? "linear-gradient(90deg, transparent 0%, rgba(0,0,0,.12) 9%, #000 23%, #000 100%)"
    : "none";
  state.canvas.style.maskImage = state.canvas.style.webkitMaskImage;
}

export function drawFlagshipAnatomyF(renderer, timestamp = performance.now()) {
  if (!renderer.context || !renderer.state) return;
  renderer.canvas.dataset.fieldRenderer = RENDERER_ID;
  renderer.canvas.dataset.fieldBackend = "webgl";

  const { width, height, ratio } = canvasSize(renderer.canvas);
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
    state = ensureState(renderer);
  } catch (error) {
    renderer._flagshipAnatomyFWebglFailure = error;
    throw error;
  }

  resize(state, renderer.canvas);
  const aspect = state.cssWidth / Math.max(1, state.cssHeight);
  deformBody(state, renderer, g, band, damage, activity);
  updateSatellites(state, renderer, g, damage, activity);
  updateObject(state, g, damage, activity, aspect, mix);
  state.webgl.render(state.scene, state.camera);

  if (state.webgl.info.render.triangles <= 0) {
    throw new Error("Flagship anatomy F WebGL mesh produced no rendered triangles.");
  }

  studioPlate(renderer.context, g, width, height, ratio, band, damage, activity);
}
