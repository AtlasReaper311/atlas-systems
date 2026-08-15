"use strict";

import * as THREE from "/lab/vendor/three/three.module.min.js";
import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { transitionMix } from "../spectral-field-state.js";
import { canvasSize, clamp, routeBand, unit } from "./proto-core.js";

const RENDERER_ID = "proto-flagship-anatomy";
const WEBGL_CLASS = "spectral-field-proto-webgl";
const DROPLET_COUNT = 10;
const TAU = Math.PI * 2;

function smoothPulse(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function gaussian3(x, y, z, cx, cy, cz, sx, sy, sz) {
  const dx = (x - cx) / sx;
  const dy = (y - cy) / sy;
  const dz = (z - cz) / sz;
  return Math.exp(-(dx * dx + dy * dy + dz * dz));
}

function studioPlate(context, g, width, height, ratio, band, damage, shock) {
  context.globalCompositeOperation = "source-over";
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#050509";
  context.fillRect(0, 0, width, height);

  const aspect = width / Math.max(1, height);
  const cx = width * (aspect > 1.8 ? 0.61 : 0.5);
  const cy = height * 0.49;
  const radius = Math.max(width, height) * 0.72;

  const well = context.createRadialGradient(
    cx - height * 0.04,
    cy - height * 0.11,
    height * 0.035,
    cx,
    cy,
    radius,
  );
  well.addColorStop(0, "#44424b");
  well.addColorStop(0.12, "#292830");
  well.addColorStop(0.34, "#17171e");
  well.addColorStop(0.63, "#0b0b11");
  well.addColorStop(1, "#050509");
  context.fillStyle = well;
  context.fillRect(0, 0, width, height);

  const leftBand = context.createLinearGradient(0, 0, width * 0.58, 0);
  leftBand.addColorStop(0, "rgba(5,5,9,0.995)");
  leftBand.addColorStop(0.55, "rgba(7,7,12,0.88)");
  leftBand.addColorStop(0.82, "rgba(7,7,12,0.42)");
  leftBand.addColorStop(1, "rgba(7,7,12,0)");
  context.fillStyle = leftBand;
  context.fillRect(0, 0, width * 0.61, height);

  const upperFalloff = context.createLinearGradient(0, 0, 0, height);
  upperFalloff.addColorStop(0, "rgba(0,0,0,0.30)");
  upperFalloff.addColorStop(0.34, "rgba(0,0,0,0)");
  upperFalloff.addColorStop(0.72, "rgba(0,0,0,0.04)");
  upperFalloff.addColorStop(1, "rgba(0,0,0,0.54)");
  context.fillStyle = upperFalloff;
  context.fillRect(0, 0, width, height);

  const floorShadow = context.createRadialGradient(
    cx + height * 0.08,
    cy + height * 0.31,
    height * 0.02,
    cx + height * 0.08,
    cy + height * 0.31,
    height * (0.31 + damage * 0.08),
  );
  floorShadow.addColorStop(0, `rgba(0,0,0,${0.62 + damage * 0.16 + shock * 0.08})`);
  floorShadow.addColorStop(0.42, "rgba(0,0,0,0.34)");
  floorShadow.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = floorShadow;
  context.fillRect(0, 0, width, height);

  context.save();
  context.strokeStyle = "rgba(225,232,246,0.022)";
  context.lineWidth = Math.max(1, ratio * 0.45);
  for (let i = 0; i < 2; i += 1) {
    context.beginPath();
    context.ellipse(
      cx,
      cy,
      height * (0.29 + i * 0.095),
      height * (0.245 + i * 0.082),
      -0.035,
      0,
      TAU,
    );
    context.stroke();
  }
  context.restore();

  if (band) {
    const routeCenter = (band.x0 + band.x1) * 0.5;
    const pulse = 0.5 + 0.5 * Math.sin(g.phase * (2.8 + g.mapped.emissionRate * 3.2));
    const x = cx + (routeCenter - 0.5) * height * 0.48;
    const y = cy - height * 0.03 + Math.sin(g.phase * 0.42 + routeCenter * 5.1) * height * 0.055;
    const glow = context.createRadialGradient(x, y, 0, x, y, height * 0.105);
    glow.addColorStop(0, `rgba(245,166,35,${0.035 + pulse * 0.025})`);
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
  webgl.toneMappingExposure = 0.98;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(29, 1, 0.1, 20);
  camera.position.set(0, 0.01, 4.35);

  const group = new THREE.Group();
  scene.add(group);

  const geometry = new THREE.SphereGeometry(1, 96, 64);
  const position = geometry.getAttribute("position");
  const basePositions = new Float32Array(position.array);
  const colours = new Float32Array(position.count * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    metalness: 0.58,
    roughness: 0.17,
    clearcoat: 1,
    clearcoatRoughness: 0.045,
    reflectivity: 0.92,
    sheen: 0.035,
    sheenColor: new THREE.Color(0x25243a),
    side: THREE.DoubleSide,
  });
  const body = new THREE.Mesh(geometry, material);
  body.frustumCulled = false;
  group.add(body);

  const hemisphere = new THREE.HemisphereLight(0xd9deed, 0x010103, 0.58);
  scene.add(hemisphere);

  const key = new THREE.DirectionalLight(0xffffff, 5.7);
  key.position.set(-3.8, 4.9, 5.5);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x7670a8, 1.75);
  rim.position.set(4.5, 1.8, 2.8);
  scene.add(rim);

  const low = new THREE.DirectionalLight(0x252736, 0.72);
  low.position.set(-1.4, -3.7, 2.4);
  scene.add(low);

  const edge = new THREE.PointLight(0xffffff, 1.1, 7.5, 2);
  edge.position.set(1.9, 2.1, 3.1);
  scene.add(edge);

  const dropletGeometry = new THREE.SphereGeometry(0.042, 14, 10);
  const dropletMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x050507,
    metalness: 0.62,
    roughness: 0.16,
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
  renderer._flagshipAnatomyWebgl = state;
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
  if (renderer._flagshipAnatomyWebgl === state) renderer._flagshipAnatomyWebgl = null;
}

export function disposeFlagshipAnatomy(renderer) {
  const state = renderer?._flagshipAnatomyWebgl;
  if (state) disposeWebglState(renderer, state);
}

function ensureWebglState(renderer) {
  const current = renderer._flagshipAnatomyWebgl;
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

function anatomyField(x, y, z, g, seed) {
  const slowPhase = g.phase * (0.08 + g.mapped.emissionRate * 0.08);
  const macroA = Math.sin(
    x * (2.05 + seed[0] * 0.28)
    - y * 1.22
    + z * 1.48
    + seed[1] * 4.7
    + slowPhase,
  );
  const macroB = Math.cos(
    x * 1.28
    + y * (2.35 + seed[2] * 0.31)
    - z * 1.08
    + seed[3] * 5.4
    - slowPhase * 0.72,
  );
  const fold = Math.sin(
    x * 4.35
    - y * 3.05
    + z * 2.55
    + Math.sin((x + z) * 1.8 + seed[0] * 3.1) * 0.62
    + g.phase * 0.17,
  );
  return { macroA, macroB, fold };
}

function crestField(x, y, z, g, seed) {
  const along = x * 1.34 + z * 0.54;
  const targetY = 0.24
    + Math.sin(along * 2.15 + seed[1] * 3.8 + g.phase * 0.055) * 0.115
    + Math.sin((x - z) * 1.25 + seed[3] * 2.7) * 0.045;
  const distance = y - targetY;
  const seam = Math.exp(-Math.pow(distance / 0.095, 2));
  const dorsal = smoothPulse((y + 0.05) * 1.32 + 0.42);
  const visibleArc = 0.48 + 0.52 * smoothPulse((z + 0.86) * 0.58);
  const crest = seam * dorsal * visibleArc;
  const inner = Math.exp(-Math.pow(distance / 0.038, 2)) * dorsal * visibleArc;
  return { crest, inner, distance };
}

function microField(x, y, z, g, seed) {
  const a = 0.5 + 0.5 * Math.sin(
    x * (10.4 + seed[0] * 2.2)
    + y * 6.6
    - z * 8.1
    + g.phase * (0.75 + g.mapped.emissionRate * 1.55),
  );
  const b = 0.5 + 0.5 * Math.cos(
    x * 5.1
    - y * (11.8 + seed[2] * 2.1)
    + z * 9.4
    - g.phase * (0.62 + g.mapped.emissionRate * 1.16)
    + seed[3] * 4.3,
  );
  return a * b;
}

function deformSurface(state, g, band, damage, audioDrive, shock) {
  const position = state.geometry.getAttribute("position");
  const colour = state.geometry.getAttribute("color");
  const base = state.basePositions;
  const seed = [
    unit(g.seedPhase, 301),
    unit(g.seedPhase, 302),
    unit(g.seedPhase, 303),
    unit(g.seedPhase, 304),
  ];

  const routeCenter = band ? (band.x0 + band.x1) * 0.5 : 0.5;
  const routeWidth = band ? Math.max(0.055, (band.x1 - band.x0) * 0.48) : 0.1;
  const hasRoute = Boolean(band);
  const breath = (g.breathing - 0.5) * (0.024 + g.mapped.displacement * 0.018);
  const coherenceLoss = 1 - g.coherence;

  for (let i = 0; i < position.count; i += 1) {
    const offset = i * 3;
    let x = base[offset];
    let y = base[offset + 1];
    let z = base[offset + 2];
    const length = Math.hypot(x, y, z) || 1;
    x /= length;
    y /= length;
    z /= length;

    const anatomy = anatomyField(x, y, z, g, seed);
    const crest = crestField(x, y, z, g, seed);
    const micro = microField(x, y, z, g, seed);

    const shoulder = gaussian3(x, y, z, -0.42, 0.11, 0.12, 0.44, 0.52, 0.68);
    const counterLobe = gaussian3(x, y, z, 0.46, -0.13, -0.06, 0.46, 0.48, 0.72);
    const crown = gaussian3(x, y, z, 0.08, 0.54, 0.08, 0.58, 0.31, 0.66);
    const waist = gaussian3(x, y, z, -0.04, -0.49, 0.02, 0.62, 0.26, 0.74);

    const bodyPlan = (
      shoulder * 0.055
      + counterLobe * 0.042
      + crown * 0.032
      - waist * 0.028
      + anatomy.macroA * 0.018
      + anatomy.macroB * 0.013
    );

    const foldWave = Math.max(0, anatomy.fold) * (
      0.006
      + g.mapped.displacement * 0.012
      + g.pressure * 0.01
      + damage * 0.012
    );

    const crestLift = crest.crest * (
      0.028
      + g.mapped.displacement * 0.055
      + g.mapped.brilliance * 0.018
      + damage * 0.07
    );
    const seamCut = crest.inner * (
      -0.008
      - damage * 0.009
      + Math.sin(g.phase * (0.72 + g.mapped.emissionRate * 1.5) + x * 4.2) * 0.004
    );

    const pressureZone = smoothPulse((anatomy.macroA * 0.5 + 0.5 - 0.38) / 0.5);
    const microGate = clamp(
      crest.crest * 0.58
      + pressureZone * 0.22
      + g.mapped.microstructure * 0.18
      + damage * 0.23,
    );
    const microPeak = Math.pow(clamp((micro - 0.57) / 0.43), 3.6);
    const microLift = microPeak * microGate * (
      0.018
      + g.mapped.microstructure * 0.05
      + g.mapped.displacement * 0.055
      + damage * 0.11
    );

    const tide = Math.sin(
      x * 2.05
      - y * 1.65
      + z * 1.18
      + g.phase * (0.52 + g.mapped.emissionRate * 0.85),
    );
    const liquidTide = tide * (
      0.008
      + g.mapped.displacement * 0.012
      + audioDrive * 0.008
    );

    const coherenceShear = Math.sin(
      x * 3.8 - y * 4.6 + z * 2.9 + g.phase * 1.2,
    ) * coherenceLoss * (0.006 + g.mapped.phaseDisagreement * 0.022);

    const shockCarrier = Math.sin(
      (x * 0.9 - y * 0.28 + z * 0.43) * 5.2
      - g.phase * (3.4 + damage * 2.9),
    );
    const shockFront = Math.pow(Math.max(0, shockCarrier), 7) * shock * damage;

    const routeCoord = x * 0.5 + 0.5;
    const routeDistance = Math.abs(routeCoord - routeCenter);
    const routeFalloff = hasRoute ? clamp(1 - routeDistance / routeWidth) : 0;
    const routeLatitude = Math.exp(-Math.pow((y + 0.06 + Math.sin(z * 2.2) * 0.08) * 1.85, 2));
    const route = routeFalloff * routeFalloff * routeLatitude;
    const routePulse = 0.5 + 0.5 * Math.sin(
      g.phase * (2.6 + g.mapped.emissionRate * 3.1) + z * 5.4 - y * 2.1,
    );
    const routeWound = route * (-0.016 + routePulse * 0.008 - damage * 0.007);

    const radius = 1
      + breath
      + bodyPlan
      + foldWave
      + crestLift
      + seamCut
      + microLift
      + liquidTide
      + coherenceShear
      + routeWound
      + shockFront * 0.125;

    let px = x * radius;
    let py = y * radius;
    let pz = z * radius;

    px *= 1.075 + g.art.stretch * 0.055 + damage * 0.038;
    py *= 0.905 - g.art.compression * 0.047 - damage * 0.016;
    pz *= 0.965 + g.mapped.lateralSpread * 0.025 + damage * 0.022;

    px += (shoulder - counterLobe) * 0.027;
    py += crown * 0.018 - waist * 0.012;

    px += (g.art.direction * 0.044 - 0.021) * damage + shockFront * 0.072;
    py += -0.018 * g.art.compression - shockFront * 0.026;
    pz += shockFront * 0.038;

    position.setXYZ(i, px, py, pz);

    const ridge = clamp(crest.crest * 0.62 + foldWave * 8.2 + microPeak * microGate * 0.42);
    const coolReflect = clamp(
      0.04
      + Math.max(0, z) * 0.06
      + g.mapped.brilliance * 0.035
      + g.mapped.afterimage * 0.025
      + ridge * 0.035,
    );

    let r = 0.0055 + coolReflect * 0.022;
    let gg = 0.006 + coolReflect * 0.023;
    let b = 0.0085 + coolReflect * 0.037 + damage * 0.0035;

    const violetEdge = clamp(Math.max(0, -x * 0.34 + z * 0.22) * 0.055 + g.mapped.afterimage * 0.012);
    r += violetEdge * 0.42;
    b += violetEdge * 0.72;

    if (route > 0) {
      const wound = clamp(route * (0.10 + routePulse * 0.36 + audioDrive * 0.12));
      r += 0.76 * wound;
      gg += 0.305 * wound;
      b += 0.018 * wound;
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
  const active = damage < 0.58 ? 0 : Math.min(
    DROPLET_COUNT,
    1 + Math.floor((damage - 0.52) * 8 + shock * 4),
  );

  for (let i = 0; i < DROPLET_COUNT; i += 1) {
    const drop = state.droplets[i];
    if (i >= active) {
      drop.visible = false;
      continue;
    }

    const azimuth = (unit(g.seedPhase, i + 161) - 0.5) * Math.PI * 1.35;
    const elevation = (unit(g.seedPhase, i + 179) - 0.34) * Math.PI * 0.52;
    const speed = 0.09 + unit(g.seedPhase, i + 193) * 0.11;
    const age = (g.phase * speed + unit(g.seedPhase, i + 207)) % 1;
    const radial = 1.03 + damage * 0.08 + age * (0.18 + damage * 0.46 + shock * 0.16);
    const cosElevation = Math.cos(elevation);
    const x = Math.cos(azimuth) * cosElevation * radial;
    const z = Math.sin(azimuth) * cosElevation * radial * 0.78;
    const y = Math.sin(elevation) * radial + age * 0.23 - age * age * 0.34;
    const scale = (0.34 + unit(g.seedPhase, i + 221) * 0.62) * damage * (1 - age * 0.48);

    drop.visible = true;
    drop.position.set(x, y, z);
    drop.scale.setScalar(Math.max(0.18, scale));
  }
}

function updateObject(state, g, damage, shock, aspect, mix) {
  const wide = aspect > 1.55;
  const baseScale = wide ? 1.08 : 0.89;

  state.group.scale.set(
    baseScale * (1.08 + g.mapped.lateralSpread * 0.055 + damage * 0.035),
    baseScale * (0.96 - g.art.compression * 0.028),
    baseScale * (0.98 + damage * 0.018),
  );
  state.group.position.x = wide ? 0.61 - damage * 0.075 + g.art.direction * 0.032 : 0;
  state.group.position.y = -0.015 - g.art.compression * 0.026;
  state.group.position.z = 0;

  state.group.rotation.x = 0.07 + Math.sin(g.phase * 0.11) * 0.012 + g.tilt * 0.08;
  state.group.rotation.y = -0.18 + g.torsion * 0.24 + Math.sin(g.phase * 0.09) * 0.032;
  state.group.rotation.z = -0.055 + g.art.direction * damage * 0.036 + shock * 0.028;

  state.canvas.style.opacity = String(0.58 + mix * 0.42);
  state.canvas.style.webkitMaskImage = wide
    ? "linear-gradient(90deg, transparent 0%, rgba(0,0,0,.17) 11%, #000 27%, #000 100%)"
    : "none";
  state.canvas.style.maskImage = state.canvas.style.webkitMaskImage;
}

export function drawFlagshipAnatomy(renderer, timestamp = performance.now()) {
  if (!renderer.context || !renderer.state) return;
  renderer.canvas.dataset.fieldRenderer = RENDERER_ID;
  renderer.canvas.dataset.fieldBackend = "webgl";

  const { width, height, ratio } = canvasSize(renderer.canvas);
  const g = deriveFieldGeometry(renderer.state, renderer.visualTime, width, height);
  const mix = transitionMix.call(renderer, timestamp);
  const band = routeBand(renderer.state.selectedMapping);
  const damage = clamp(
    g.health.severity * 0.68
    + g.deformation * 0.32
    + g.art.fractureBias * 0.18,
  );
  const audioDrive = clamp(
    g.mapped.displacement * 0.43
    + g.mapped.phaseDisagreement * 0.24
    + g.mapped.brilliance * 0.21
    + g.mapped.emissionRate * 0.12,
  );
  const shockCarrier = Math.max(
    0,
    Math.sin(g.phase * (2.55 + damage * 2.45) + g.art.direction * 1.4),
  );
  const shock = damage * Math.pow(shockCarrier, 6);

  let state;
  try {
    state = ensureWebglState(renderer);
  } catch (error) {
    renderer._flagshipAnatomyWebglFailure = error;
    throw error;
  }

  resizeWebgl(state, renderer.canvas);
  const aspect = state.cssWidth / Math.max(1, state.cssHeight);
  deformSurface(state, g, band, damage, audioDrive, shock);
  updateObject(state, g, damage, shock, aspect, mix);
  updateDroplets(state, g, damage, shock);
  state.webgl.render(state.scene, state.camera);

  if (state.webgl.info.render.triangles <= 0) {
    throw new Error("Flagship anatomy WebGL mesh produced no rendered triangles.");
  }

  studioPlate(renderer.context, g, width, height, ratio, band, damage, shock);
}
