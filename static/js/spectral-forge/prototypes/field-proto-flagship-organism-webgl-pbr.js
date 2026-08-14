"use strict";

import * as THREE from "/lab/vendor/three/three.module.min.js";
import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { transitionMix } from "../spectral-field-state.js";
import { canvasSize, clamp, routeBand, unit } from "./proto-core.js";

const RENDERER_ID = "proto-flagship-organism";
const WEBGL_CLASS = "spectral-field-proto-webgl";
const DROPLET_COUNT = 12;
const TAU = Math.PI * 2;

function studioPlate(context, g, width, height, ratio, band, damage, shock) {
  context.globalCompositeOperation = "source-over";
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#07070c";
  context.fillRect(0, 0, width, height);

  const aspect = width / Math.max(1, height);
  const cx = width * (aspect > 1.8 ? 0.6 : 0.5);
  const cy = height * 0.5;
  const radius = Math.max(width, height) * 0.7;
  const well = context.createRadialGradient(cx, cy - height * 0.04, height * 0.045, cx, cy, radius);
  well.addColorStop(0, "#e9e3d8");
  well.addColorStop(0.17, "#bcb7af");
  well.addColorStop(0.42, "#4b4a50");
  well.addColorStop(0.7, "#191921");
  well.addColorStop(1, "#08080d");
  context.fillStyle = well;
  context.fillRect(0, 0, width, height);

  const banding = context.createLinearGradient(0, 0, width * 0.52, 0);
  banding.addColorStop(0, "rgba(10,10,15,0.98)");
  banding.addColorStop(0.54, "rgba(10,10,15,0.73)");
  banding.addColorStop(1, "rgba(10,10,15,0)");
  context.fillStyle = banding;
  context.fillRect(0, 0, width * 0.56, height);

  context.save();
  context.strokeStyle = "rgba(226,238,255,0.09)";
  context.lineWidth = Math.max(1, ratio * 0.55);
  for (let i = 0; i < 3; i += 1) {
    context.beginPath();
    context.ellipse(
      cx,
      cy,
      height * (0.235 + i * 0.085),
      height * (0.195 + i * 0.07),
      0,
      0,
      TAU,
    );
    context.stroke();
  }
  context.strokeStyle = "rgba(226,238,255,0.055)";
  context.beginPath();
  context.moveTo(cx - height * 0.48, cy);
  context.lineTo(cx + height * 0.48, cy);
  context.moveTo(cx, cy - height * 0.41);
  context.lineTo(cx, cy + height * 0.41);
  context.stroke();
  context.restore();

  const floorShadow = context.createRadialGradient(
    cx + height * 0.06,
    cy + height * 0.28,
    0,
    cx + height * 0.06,
    cy + height * 0.28,
    height * (0.34 + damage * 0.08),
  );
  floorShadow.addColorStop(0, `rgba(0,0,0,${0.34 + damage * 0.17 + shock * 0.08})`);
  floorShadow.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = floorShadow;
  context.fillRect(0, 0, width, height);

  if (band) {
    const routeCenter = (band.x0 + band.x1) * 0.5;
    const pulse = 0.5 + 0.5 * Math.sin(g.phase * (3.6 + g.mapped.emissionRate * 2.8));
    const x = cx + (routeCenter - 0.5) * height * 0.56;
    const y = cy + Math.sin(g.phase * 0.7 + routeCenter * 5.8) * height * 0.08;
    const glow = context.createRadialGradient(x, y, 0, x, y, height * 0.15);
    glow.addColorStop(0, `rgba(245,166,35,${0.055 + pulse * 0.035})`);
    glow.addColorStop(1, "rgba(245,166,35,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
  }
}

function createWebglState(renderer) {
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
  webgl.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 20);
  camera.position.set(0, 0, 4.25);

  const group = new THREE.Group();
  scene.add(group);

  const geometry = new THREE.SphereGeometry(1, 80, 52);
  const position = geometry.getAttribute("position");
  const basePositions = new Float32Array(position.array);
  const colours = new Float32Array(position.count * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    metalness: 0.72,
    roughness: 0.13,
    clearcoat: 1,
    clearcoatRoughness: 0.055,
    reflectivity: 0.88,
    sheen: 0.12,
    sheenColor: new THREE.Color(0x34395f),
    side: THREE.DoubleSide,
  });
  const body = new THREE.Mesh(geometry, material);
  body.frustumCulled = false;
  group.add(body);

  const hemisphere = new THREE.HemisphereLight(0xdde5ff, 0x020205, 1.45);
  scene.add(hemisphere);
  const key = new THREE.DirectionalLight(0xffffff, 7.2);
  key.position.set(-3.4, 4.6, 5.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8598ff, 4.3);
  rim.position.set(4.2, 1.4, 3.0);
  scene.add(rim);
  const low = new THREE.DirectionalLight(0x313852, 1.6);
  low.position.set(-1.8, -3.2, 2.1);
  scene.add(low);

  const dropletGeometry = new THREE.SphereGeometry(0.045, 14, 10);
  const dropletMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x070912,
    metalness: 0.8,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  const droplets = [];
  for (let i = 0; i < DROPLET_COUNT; i += 1) {
    const drop = new THREE.Mesh(dropletGeometry, dropletMaterial);
    drop.visible = false;
    group.add(drop);
    droplets.push(drop);
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
    dropletGeometry,
    dropletMaterial,
    droplets,
    cssWidth: 0,
    cssHeight: 0,
    disposed: false,
  };

  canvas.__atlasDispose = () => disposeWebglState(renderer, state);
  renderer._flagshipWebgl = state;
  return state;
}

function disposeWebglState(renderer, state) {
  if (!state || state.disposed) return;
  state.disposed = true;
  state.geometry.dispose();
  state.material.dispose();
  state.dropletGeometry.dispose();
  state.dropletMaterial.dispose();
  state.webgl.dispose();
  if (state.canvas.isConnected) state.canvas.remove();
  if (renderer._flagshipWebgl === state) renderer._flagshipWebgl = null;
}

export function disposeFlagshipOrganism(renderer) {
  const state = renderer?._flagshipWebgl;
  if (state) disposeWebglState(renderer, state);
}

function ensureWebglState(renderer) {
  const current = renderer._flagshipWebgl;
  if (current && !current.disposed && current.canvas.isConnected) return current;
  return createWebglState(renderer);
}

function resizeWebgl(state, sourceCanvas) {
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

function magneticField(x, y, z, phase, mapped, seed) {
  const living = 0.5 + 0.5 * Math.sin(
    (x * x - y * 1.62) * (4.15 + seed[0] * 0.7)
    + z * (1.4 + seed[1] * 0.9)
    + phase * (1.02 + mapped.emissionRate * 0.92)
    + seed[2] * TAU,
  );
  const tide = 0.5 + 0.5 * Math.sin(
    x * (2.0 + seed[1] * 0.6)
    - y * (2.25 + seed[2] * 0.5)
    + z * 1.35
    + phase * (0.64 + mapped.emissionRate * 0.76),
  );
  const needlesA = 0.5 + 0.5 * Math.sin(
    x * (11.5 + seed[3] * 2.4)
    + Math.sin(y * 7.2 + seed[0] * 4.0) * 1.7
    - z * 8.4
    + phase * (0.92 + mapped.emissionRate * 1.8),
  );
  const needlesB = 0.5 + 0.5 * Math.cos(
    z * (12.7 + seed[2] * 2.0)
    - y * 9.6
    + x * 4.1
    - phase * (0.72 + mapped.emissionRate * 1.35)
    + seed[1] * 5.2,
  );
  const disagreement = Math.sin(
    x * 8.2 - y * 5.6 + z * 6.4
    + phase * (1.45 + mapped.phaseDisagreement * 1.8),
  ) * mapped.phaseDisagreement * 0.08;
  return clamp(living * 0.42 + tide * 0.18 + needlesA * needlesB * 0.46 + disagreement);
}

function deformSurface(state, g, band, damage, audioDrive, shock) {
  const position = state.geometry.getAttribute("position");
  const colour = state.geometry.getAttribute("color");
  const base = state.basePositions;
  const seed = [
    unit(g.seedPhase, 201),
    unit(g.seedPhase, 202),
    unit(g.seedPhase, 203),
    unit(g.seedPhase, 204),
  ];
  const routeCenter = band ? (band.x0 + band.x1) * 0.5 : 0.5;
  const routeWidth = band ? Math.max(0.05, (band.x1 - band.x0) * 0.56) : 0.1;
  const hasRoute = Boolean(band);

  for (let i = 0; i < position.count; i += 1) {
    const offset = i * 3;
    let x = base[offset];
    let y = base[offset + 1];
    let z = base[offset + 2];
    const length = Math.hypot(x, y, z) || 1;
    x /= length;
    y /= length;
    z /= length;

    const field = magneticField(x, y, z, g.phase, g.mapped, seed);
    const gate = 0.48 + g.mapped.aperture * 0.08 - damage * 0.17 - audioDrive * 0.06;
    const mound = clamp((field - (gate - 0.14)) / 0.195);
    const moundSmooth = mound * mound * (3 - 2 * mound);
    const peakBase = clamp((field - (gate - 0.015)) / Math.max(0.001, 0.975 - gate));
    const peak = Math.pow(peakBase, 2.75);

    const routeCoord = x * 0.5 + 0.5;
    const routeDistance = Math.abs(routeCoord - routeCenter);
    const routeFalloff = hasRoute ? clamp(1 - routeDistance / routeWidth) : 0;
    const routeLatitude = Math.exp(-Math.pow(y * 1.65 + 0.12, 2));
    const route = routeFalloff * routeFalloff * routeLatitude;

    const beat = 0.5 + 0.5 * Math.sin(
      g.phase * (3.0 + g.mapped.emissionRate * 5.2)
      + x * 3.2 - y * 1.7 + z * 2.6,
    );
    const tide = Math.sin(
      x * 2.3 - y * 2.8 + z * 1.5
      + g.phase * (1.25 + g.mapped.emissionRate * 2.6),
    );
    const audioTide = tide * audioDrive * (0.012 + g.mapped.displacement * 0.028);

    const shockTravel = Math.sin(
      (x * 0.86 - y * 0.22 + z * 0.46) * 5.3
      - g.phase * (4.0 + damage * 3.2),
    );
    const shockFront = Math.pow(Math.max(0, shockTravel), 7) * shock * damage;

    const pressure = moundSmooth * (0.035 + damage * 0.055 + g.mapped.displacement * 0.028);
    let spikes = peak * (
      0.035
      + g.mapped.displacement * 0.22
      + damage * 0.24
      + g.mapped.granularFracture * 0.075
    );
    spikes *= 0.82 + beat * audioDrive * 0.46;

    const routeWound = route * (
      -0.022
      + Math.sin(g.phase * (3.8 + g.mapped.emissionRate * 3.8) + y * 8.0) * 0.018
    );
    const radius = 1 + pressure + spikes + audioTide + shockFront * 0.17 + routeWound;

    let px = x * radius;
    let py = y * radius;
    let pz = z * radius;
    px *= 1 + damage * 0.075 + g.art.stretch * 0.045;
    py *= 0.92 - g.art.compression * 0.035 - damage * 0.035;
    pz *= 0.94 + damage * 0.03;
    px += (g.art.direction * 0.05 - 0.025) * damage + 0.09 * shockFront;
    py += -0.025 * g.art.compression - 0.035 * shockFront;
    pz += 0.045 * shockFront;

    position.setXYZ(i, px, py, pz);

    const ridge = clamp(moundSmooth * 0.4 + peak * 0.8);
    const indigo = clamp(0.24 + field * 0.26 + Math.max(0, -y) * 0.12 + g.mapped.afterimage * 0.1);
    let r = 0.012 + indigo * 0.035 + ridge * 0.012;
    let gg = 0.014 + indigo * 0.041 + ridge * 0.014;
    let b = 0.024 + indigo * 0.07 + ridge * 0.026 + damage * 0.016;
    if (route > 0) {
      const woundPulse = 0.52 + 0.48 * Math.sin(
        g.phase * (3.9 + g.mapped.emissionRate * 3.2) + y * 8,
      );
      const wound = clamp(route * (0.18 + woundPulse * 0.34 + audioDrive * 0.18));
      r += 0.72 * wound;
      gg += 0.31 * wound;
      b += 0.025 * wound;
    }
    colour.setXYZ(i, clamp(r), clamp(gg), clamp(b));
  }

  position.needsUpdate = true;
  colour.needsUpdate = true;
  state.geometry.computeVertexNormals();
  const normals = state.geometry.getAttribute("normal");
  if (normals) normals.needsUpdate = true;
}

function updateDroplets(state, g, damage, shock) {
  const active = damage < 0.38 ? 0 : Math.min(
    DROPLET_COUNT,
    2 + Math.floor(damage * 6 + shock * 4),
  );

  for (let i = 0; i < DROPLET_COUNT; i += 1) {
    const drop = state.droplets[i];
    if (i >= active) {
      drop.visible = false;
      continue;
    }

    const azimuth = (unit(g.seedPhase, i + 61) - 0.5) * Math.PI * 1.7;
    const elevation = (unit(g.seedPhase, i + 79) - 0.38) * Math.PI * 0.7;
    const speed = 0.13 + unit(g.seedPhase, i + 93) * 0.18;
    const age = (g.phase * speed + unit(g.seedPhase, i + 107)) % 1;
    const launch = 1 + damage * 0.12;
    const travel = age * (0.35 + damage * 0.82 + shock * 0.22);
    const radial = launch + travel;
    const cosElevation = Math.cos(elevation);
    const x = Math.cos(azimuth) * cosElevation * radial;
    const z = Math.sin(azimuth) * cosElevation * radial * 0.84;
    const yBase = Math.sin(elevation) * radial;
    const y = yBase + age * 0.42 - age * age * 0.74;
    const scale = (0.42 + unit(g.seedPhase, i + 121) * 0.86) * damage * (1 - age * 0.42);

    drop.visible = true;
    drop.position.set(x, y, z);
    drop.scale.setScalar(Math.max(0.22, scale));
  }
}

function updateObject(state, g, damage, shock, aspect, mix) {
  const wide = aspect > 1.55;
  const baseScale = wide ? 1.04 : 0.88;
  state.group.scale.set(
    baseScale * (1.14 + g.mapped.lateralSpread * 0.07 + damage * 0.055),
    baseScale * (0.92 - g.art.compression * 0.035),
    baseScale * (0.96 + damage * 0.025),
  );
  state.group.position.x = wide ? 0.58 - damage * 0.1 + g.art.direction * 0.04 : 0;
  state.group.position.y = -0.02 - g.art.compression * 0.035;
  state.group.position.z = 0;
  state.group.rotation.x = 0.04 + Math.sin(g.phase * 0.23) * 0.018;
  state.group.rotation.y = g.torsion * 0.34 + Math.sin(g.phase * 0.17) * 0.06;
  state.group.rotation.z = -0.035 + g.art.direction * damage * 0.045 + shock * 0.045;
  state.canvas.style.opacity = String(0.55 + mix * 0.45);
  state.canvas.style.webkitMaskImage = wide
    ? "linear-gradient(90deg, transparent 0%, rgba(0,0,0,.30) 12%, #000 31%, #000 100%)"
    : "none";
  state.canvas.style.maskImage = state.canvas.style.webkitMaskImage;
}

export function drawFlagshipOrganism(renderer, timestamp = performance.now()) {
  if (!renderer.context || !renderer.state) return;
  renderer.canvas.dataset.fieldRenderer = RENDERER_ID;
  renderer.canvas.dataset.fieldBackend = "webgl";

  const { width, height, ratio } = canvasSize(renderer.canvas);
  const g = deriveFieldGeometry(renderer.state, renderer.visualTime, width, height);
  const mix = transitionMix.call(renderer, timestamp);
  const band = routeBand(renderer.state.selectedMapping);
  const damage = clamp(
    g.health.severity * 0.72
    + g.deformation * 0.36
    + g.art.fractureBias * 0.22,
  );
  const audioDrive = clamp(
    g.mapped.emissionRate * 0.46
    + g.mapped.displacement * 0.34
    + g.mapped.brilliance * 0.2,
  );
  const shockCarrier = Math.max(
    0,
    Math.sin(g.phase * (3.0 + damage * 3.1) + g.art.direction * 1.7),
  );
  const shock = damage * Math.pow(shockCarrier, 5);

  let state;
  try {
    state = ensureWebglState(renderer);
  } catch (error) {
    renderer._flagshipWebglFailure = error;
    throw error;
  }

  resizeWebgl(state, renderer.canvas);
  const aspect = state.cssWidth / Math.max(1, state.cssHeight);
  deformSurface(state, g, band, damage, audioDrive, shock);
  updateObject(state, g, damage, shock, aspect, mix);
  updateDroplets(state, g, damage, shock);
  state.webgl.render(state.scene, state.camera);

  if (state.webgl.info.render.triangles <= 0) {
    throw new Error("Flagship organism WebGL mesh produced no rendered triangles.");
  }

  studioPlate(renderer.context, g, width, height, ratio, band, damage, shock);
}
