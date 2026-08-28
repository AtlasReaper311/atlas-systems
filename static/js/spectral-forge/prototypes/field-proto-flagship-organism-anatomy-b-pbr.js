"use strict";

import * as THREE from "/lab/vendor/three/three.module.min.js";
import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { transitionMix } from "../spectral-field-state.js";
import { canvasSize, clamp, routeBand, unit } from "./proto-core.js";

const RENDERER_ID = "proto-flagship-anatomy-b";
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
  context.fillStyle = "#06060a";
  context.fillRect(0, 0, width, height);

  const aspect = width / Math.max(1, height);
  const cx = width * (aspect > 1.8 ? 0.61 : 0.5);
  const cy = height * 0.49;
  const radius = Math.max(width, height) * 0.72;

  const well = context.createRadialGradient(
    cx - height * 0.055,
    cy - height * 0.12,
    height * 0.035,
    cx,
    cy,
    radius,
  );
  well.addColorStop(0, "#67636d");
  well.addColorStop(0.10, "#45424c");
  well.addColorStop(0.25, "#292832");
  well.addColorStop(0.52, "#14141b");
  well.addColorStop(0.78, "#0a0a0f");
  well.addColorStop(1, "#050509");
  context.fillStyle = well;
  context.fillRect(0, 0, width, height);

  const leftBand = context.createLinearGradient(0, 0, width * 0.6, 0);
  leftBand.addColorStop(0, "rgba(5,5,9,0.995)");
  leftBand.addColorStop(0.53, "rgba(7,7,12,0.86)");
  leftBand.addColorStop(0.8, "rgba(7,7,12,0.34)");
  leftBand.addColorStop(1, "rgba(7,7,12,0)");
  context.fillStyle = leftBand;
  context.fillRect(0, 0, width * 0.62, height);

  const verticalFalloff = context.createLinearGradient(0, 0, 0, height);
  verticalFalloff.addColorStop(0, "rgba(0,0,0,0.20)");
  verticalFalloff.addColorStop(0.28, "rgba(0,0,0,0)");
  verticalFalloff.addColorStop(0.72, "rgba(0,0,0,0.02)");
  verticalFalloff.addColorStop(1, "rgba(0,0,0,0.48)");
  context.fillStyle = verticalFalloff;
  context.fillRect(0, 0, width, height);

  const floorShadow = context.createRadialGradient(
    cx + height * 0.08,
    cy + height * 0.31,
    height * 0.02,
    cx + height * 0.08,
    cy + height * 0.31,
    height * (0.33 + damage * 0.08),
  );
  floorShadow.addColorStop(0, `rgba(0,0,0,${0.58 + damage * 0.16 + shock * 0.08})`);
  floorShadow.addColorStop(0.42, "rgba(0,0,0,0.30)");
  floorShadow.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = floorShadow;
  context.fillRect(0, 0, width, height);

  context.save();
  context.strokeStyle = "rgba(232,236,246,0.018)";
  context.lineWidth = Math.max(1, ratio * 0.42);
  for (let i = 0; i < 2; i += 1) {
    context.beginPath();
    context.ellipse(
      cx,
      cy,
      height * (0.31 + i * 0.1),
      height * (0.255 + i * 0.082),
      -0.045,
      0,
      TAU,
    );
    context.stroke();
  }
  context.restore();

  if (band) {
    const routeCenter = (band.x0 + band.x1) * 0.5;
    const pulse = 0.5 + 0.5 * Math.sin(g.phase * (2.55 + g.mapped.emissionRate * 2.9));
    const x = cx + (routeCenter - 0.5) * height * 0.52;
    const y = cy - height * 0.015 + Math.sin(g.phase * 0.38 + routeCenter * 5.4) * height * 0.06;
    const glow = context.createRadialGradient(x, y, 0, x, y, height * 0.11);
    glow.addColorStop(0, `rgba(245,166,35,${0.03 + pulse * 0.024})`);
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
  webgl.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(29, 1, 0.1, 20);
  camera.position.set(0, 0.02, 4.32);

  const group = new THREE.Group();
  scene.add(group);

  const geometry = new THREE.SphereGeometry(1, 104, 70);
  const position = geometry.getAttribute("position");
  const basePositions = new Float32Array(position.array);
  const colours = new Float32Array(position.count * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    metalness: 0.54,
    roughness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    reflectivity: 0.94,
    sheen: 0.026,
    sheenColor: new THREE.Color(0x2d2b43),
    side: THREE.DoubleSide,
  });
  const body = new THREE.Mesh(geometry, material);
  body.frustumCulled = false;
  group.add(body);

  const hemisphere = new THREE.HemisphereLight(0xe0e3ec, 0x010103, 0.82);
  scene.add(hemisphere);

  const key = new THREE.DirectionalLight(0xffffff, 6.35);
  key.position.set(-3.9, 5.0, 5.7);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x77729b, 2.05);
  rim.position.set(4.6, 1.8, 3.1);
  scene.add(rim);

  const low = new THREE.DirectionalLight(0x31323e, 1.02);
  low.position.set(-1.8, -3.5, 2.8);
  scene.add(low);

  const edge = new THREE.PointLight(0xffffff, 1.35, 7.7, 2);
  edge.position.set(1.8, 2.2, 3.2);
  scene.add(edge);

  const dropletGeometry = new THREE.SphereGeometry(0.04, 14, 10);
  const dropletMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x050507,
    metalness: 0.58,
    roughness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.045,
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
  renderer._flagshipAnatomyBWebgl = state;
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
  if (renderer._flagshipAnatomyBWebgl === state) renderer._flagshipAnatomyBWebgl = null;
}

export function disposeFlagshipAnatomyB(renderer) {
  const state = renderer?._flagshipAnatomyBWebgl;
  if (state) disposeWebglState(renderer, state);
}

function ensureWebglState(renderer) {
  const current = renderer._flagshipAnatomyBWebgl;
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
  const slowPhase = g.phase * (0.07 + g.mapped.emissionRate * 0.07);
  const macroA = Math.sin(
    x * (1.72 + seed[0] * 0.24)
    - y * 1.12
    + z * 1.38
    + seed[1] * 4.7
    + slowPhase,
  );
  const macroB = Math.cos(
    x * 1.08
    + y * (1.96 + seed[2] * 0.28)
    - z * 1.14
    + seed[3] * 5.4
    - slowPhase * 0.68,
  );
  const foldA = Math.sin(
    x * 3.3
    - y * 2.35
    + z * 1.85
    + Math.sin((x + z) * 1.4 + seed[0] * 3.1) * 0.48
    + g.phase * 0.12,
  );
  const foldB = Math.cos(
    x * 2.15
    + y * 3.65
    - z * 2.8
    + seed[2] * 3.8
    - g.phase * 0.105,
  );
  return { macroA, macroB, foldA, foldB };
}

function seamField(x, y, z, g, seed) {
  const along = x * 1.05 + z * 0.78;
  const targetY = 0.17
    + Math.sin(along * 1.82 + seed[1] * 3.8 + g.phase * 0.046) * 0.12
    + Math.cos((x - z) * 1.35 + seed[3] * 2.7) * 0.052;
  const distance = y - targetY;
  const visibleArc = 0.42 + 0.58 * smoothPulse((z + 0.88) * 0.57);
  const dorsal = smoothPulse((y + 0.13) * 1.16 + 0.44);
  const submerge = 0.28 + 0.72 * smoothPulse(
    0.5 + 0.5 * Math.sin(along * 2.55 + seed[0] * 4.2 + g.phase * 0.058),
  );
  const crest = Math.exp(-Math.pow(distance / 0.115, 2)) * dorsal * visibleArc * submerge;
  const inner = Math.exp(-Math.pow(distance / 0.045, 2)) * dorsal * visibleArc * submerge;
  const shoulder = Math.exp(-Math.pow((distance - 0.075) / 0.09, 2)) * dorsal * visibleArc;
  return { crest, inner, shoulder, distance, along, submerge };
}

function microField(x, y, z, g, seed) {
  const a = 0.5 + 0.5 * Math.sin(
    x * (9.8 + seed[0] * 1.8)
    + y * 6.0
    - z * 7.6
    + g.phase * (0.68 + g.mapped.emissionRate * 1.35),
  );
  const b = 0.5 + 0.5 * Math.cos(
    x * 4.8
    - y * (10.7 + seed[2] * 1.9)
    + z * 8.7
    - g.phase * (0.57 + g.mapped.emissionRate * 1.02)
    + seed[3] * 4.3,
  );
  return a * b;
}

function deformSurface(state, g, band, damage, audioDrive, shock) {
  const position = state.geometry.getAttribute("position");
  const colour = state.geometry.getAttribute("color");
  const base = state.basePositions;
  const seed = [
    unit(g.seedPhase, 401),
    unit(g.seedPhase, 402),
    unit(g.seedPhase, 403),
    unit(g.seedPhase, 404),
  ];

  const routeCenter = band ? (band.x0 + band.x1) * 0.5 : 0.5;
  const routeWidth = band ? Math.max(0.055, (band.x1 - band.x0) * 0.48) : 0.1;
  const hasRoute = Boolean(band);
  const coherenceLoss = 1 - g.coherence;
  const pumpPhase = g.phase * (0.31 + g.mapped.emissionRate * 0.42);
  const pumpA = Math.sin(pumpPhase);
  const pumpB = Math.sin(pumpPhase + Math.PI * 0.92);
  const globalBreath = (g.breathing - 0.5) * (0.007 + g.mapped.displacement * 0.007);

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
    const seam = seamField(x, y, z, g, seed);
    const micro = microField(x, y, z, g, seed);

    const core = gaussian3(x, y, z, -0.05, -0.03, 0.05, 0.76, 0.68, 0.9);
    const pressureShoulder = gaussian3(x, y, z, -0.47, 0.28, 0.13, 0.36, 0.34, 0.6);
    const trailingMass = gaussian3(x, y, z, 0.50, -0.13, -0.13, 0.43, 0.45, 0.72);
    const lowerMass = gaussian3(x, y, z, 0.06, -0.48, 0.08, 0.55, 0.28, 0.72);
    const upperCrestMass = gaussian3(x, y, z, 0.08, 0.51, -0.02, 0.48, 0.27, 0.68);
    const neckNotch = gaussian3(x, y, z, 0.18, 0.22, 0.58, 0.34, 0.29, 0.34);
    const undersideNotch = gaussian3(x, y, z, -0.28, -0.35, 0.55, 0.38, 0.24, 0.34);

    const pumpTransfer = (
      pressureShoulder * pumpA
      + trailingMass * pumpB * 0.88
      - core * (pumpA + pumpB) * 0.12
    ) * (0.014 + g.mapped.displacement * 0.026 + audioDrive * 0.01);

    const macroMass = (
      core * 0.018
      + pressureShoulder * 0.092
      + trailingMass * 0.07
      + lowerMass * 0.035
      + upperCrestMass * 0.048
      - neckNotch * 0.05
      - undersideNotch * 0.025
      + anatomy.macroA * 0.018
      + anatomy.macroB * 0.012
      + pumpTransfer
    );

    const foldPositive = Math.max(0, anatomy.foldA) * (
      0.011
      + g.pressure * 0.012
      + g.mapped.displacement * 0.014
      + damage * 0.014
    );
    const foldNegative = Math.max(0, anatomy.foldB) * (
      -0.008
      - g.art.compression * 0.008
      - damage * 0.006
    );
    const foldEnvelope = clamp(
      pressureShoulder * 0.38
      + trailingMass * 0.34
      + upperCrestMass * 0.24
      + core * 0.18,
    );
    const folds = (foldPositive + foldNegative) * (0.45 + foldEnvelope);

    const crestLift = seam.crest * (
      0.04
      + g.mapped.displacement * 0.06
      + g.mapped.brilliance * 0.025
      + damage * 0.08
    );
    const seamCut = seam.inner * (
      -0.014
      - damage * 0.012
      + Math.sin(g.phase * (0.62 + g.mapped.emissionRate * 1.25) + seam.along * 4.0) * 0.004
    );
    const seamShoulder = seam.shoulder * (
      0.009
      + g.pressure * 0.011
      + g.mapped.displacement * 0.008
    );

    const pressureGradient = clamp(
      pressureShoulder * 0.45
      + seam.crest * 0.55
      + Math.max(0, anatomy.macroA) * 0.12
      + damage * 0.18,
    );
    const microPeak = Math.pow(clamp((micro - 0.61) / 0.39), 3.9);
    const microLift = microPeak * pressureGradient * (
      0.014
      + g.mapped.microstructure * 0.042
      + g.mapped.displacement * 0.046
      + damage * 0.095
    );

    const tide = Math.sin(
      x * 1.85
      - y * 1.5
      + z * 1.16
      + g.phase * (0.47 + g.mapped.emissionRate * 0.78),
    );
    const liquidTide = tide * (
      0.007
      + g.mapped.displacement * 0.012
      + audioDrive * 0.007
    );

    const coherenceShear = Math.sin(
      x * 3.5 - y * 4.3 + z * 2.6 + g.phase * 1.08,
    ) * coherenceLoss * (0.005 + g.mapped.phaseDisagreement * 0.02);

    const shockCarrier = Math.sin(
      (x * 0.88 - y * 0.26 + z * 0.47) * 5.0
      - g.phase * (3.15 + damage * 2.7),
    );
    const shockFront = Math.pow(Math.max(0, shockCarrier), 7) * shock * damage;

    const routeCoord = x * 0.5 + 0.5;
    const routeDistance = Math.abs(routeCoord - routeCenter);
    const routeFalloff = hasRoute ? clamp(1 - routeDistance / routeWidth) : 0;
    const routeLatitude = Math.exp(-Math.pow(
      (y + 0.05 + Math.sin(z * 2.15 + x * 0.7) * 0.085) * 1.8,
      2,
    ));
    const route = routeFalloff * routeFalloff * routeLatitude;
    const routePulse = 0.5 + 0.5 * Math.sin(
      g.phase * (2.5 + g.mapped.emissionRate * 3.0) + z * 5.2 - y * 2.0,
    );
    const routeWound = route * (-0.015 + routePulse * 0.007 - damage * 0.006);

    const radius = 1
      + globalBreath
      + macroMass
      + folds
      + crestLift
      + seamCut
      + seamShoulder
      + microLift
      + liquidTide
      + coherenceShear
      + routeWound
      + shockFront * 0.115;

    let px = x * radius;
    let py = y * radius;
    let pz = z * radius;

    px *= 1.095 + g.art.stretch * 0.055 + damage * 0.036;
    py *= 0.92 - g.art.compression * 0.04 - damage * 0.014;
    pz *= 0.97 + g.mapped.lateralSpread * 0.024 + damage * 0.02;

    px += pressureShoulder * -0.045 + trailingMass * 0.052;
    py += pressureShoulder * 0.028 + upperCrestMass * 0.025 - lowerMass * 0.018;
    pz += neckNotch * -0.025 + seam.crest * 0.01;

    px += (g.art.direction * 0.042 - 0.02) * damage + shockFront * 0.065;
    py += -0.016 * g.art.compression - shockFront * 0.024;
    pz += shockFront * 0.034;

    position.setXYZ(i, px, py, pz);

    const foldRead = clamp(
      Math.abs(folds) * 11
      + seam.crest * 0.42
      + microPeak * pressureGradient * 0.28,
    );
    const coolReflect = clamp(
      0.055
      + Math.max(0, z) * 0.055
      + g.mapped.brilliance * 0.045
      + g.mapped.afterimage * 0.025
      + foldRead * 0.055,
    );

    let r = 0.007 + coolReflect * 0.025;
    let gg = 0.0075 + coolReflect * 0.026;
    let bl = 0.0105 + coolReflect * 0.041 + damage * 0.003;

    const violetEdge = clamp(
      Math.max(0, -x * 0.31 + z * 0.19) * 0.052
      + g.mapped.afterimage * 0.012,
    );
    r += violetEdge * 0.36;
    bl += violetEdge * 0.63;

    const seamCool = seam.crest * (0.01 + g.mapped.brilliance * 0.014);
    r += seamCool * 0.18;
    gg += seamCool * 0.16;
    bl += seamCool * 0.34;

    if (route > 0) {
      const wound = clamp(route * (0.09 + routePulse * 0.34 + audioDrive * 0.11));
      r += 0.75 * wound;
      gg += 0.3 * wound;
      bl += 0.017 * wound;
    }

    colour.setXYZ(i, clamp(r), clamp(gg), clamp(bl));
  }

  position.needsUpdate = true;
  colour.needsUpdate = true;
  state.geometry.computeVertexNormals();
  const normals = state.geometry.getAttribute("normal");
  if (normals) normals.needsUpdate = true;
}

function updateDroplets(state, g, damage, shock) {
  const active = damage < 0.6 ? 0 : Math.min(
    DROPLET_COUNT,
    1 + Math.floor((damage - 0.56) * 8 + shock * 4),
  );

  for (let i = 0; i < DROPLET_COUNT; i += 1) {
    const drop = state.droplets[i];
    if (i >= active) {
      drop.visible = false;
      continue;
    }

    const azimuth = (unit(g.seedPhase, i + 261) - 0.5) * Math.PI * 1.28;
    const elevation = (unit(g.seedPhase, i + 279) - 0.34) * Math.PI * 0.5;
    const speed = 0.085 + unit(g.seedPhase, i + 293) * 0.105;
    const age = (g.phase * speed + unit(g.seedPhase, i + 307)) % 1;
    const radial = 1.03 + damage * 0.075 + age * (0.17 + damage * 0.44 + shock * 0.15);
    const cosElevation = Math.cos(elevation);
    const x = Math.cos(azimuth) * cosElevation * radial;
    const z = Math.sin(azimuth) * cosElevation * radial * 0.76;
    const y = Math.sin(elevation) * radial + age * 0.21 - age * age * 0.31;
    const scale = (0.32 + unit(g.seedPhase, i + 321) * 0.6) * damage * (1 - age * 0.48);

    drop.visible = true;
    drop.position.set(x, y, z);
    drop.scale.setScalar(Math.max(0.17, scale));
  }
}

function updateObject(state, g, damage, shock, aspect, mix) {
  const wide = aspect > 1.55;
  const baseScale = wide ? 1.1 : 0.9;

  state.group.scale.set(
    baseScale * (1.06 + g.mapped.lateralSpread * 0.052 + damage * 0.032),
    baseScale * (0.98 - g.art.compression * 0.026),
    baseScale * (0.99 + damage * 0.018),
  );
  state.group.position.x = wide ? 0.61 - damage * 0.07 + g.art.direction * 0.032 : 0;
  state.group.position.y = -0.01 - g.art.compression * 0.024;
  state.group.position.z = 0;

  state.group.rotation.x = 0.085 + Math.sin(g.phase * 0.095) * 0.012 + g.tilt * 0.08;
  state.group.rotation.y = -0.23 + g.torsion * 0.23 + Math.sin(g.phase * 0.082) * 0.028;
  state.group.rotation.z = -0.065 + g.art.direction * damage * 0.034 + shock * 0.026;

  state.canvas.style.opacity = String(0.6 + mix * 0.4);
  state.canvas.style.webkitMaskImage = wide
    ? "linear-gradient(90deg, transparent 0%, rgba(0,0,0,.14) 10%, #000 25%, #000 100%)"
    : "none";
  state.canvas.style.maskImage = state.canvas.style.webkitMaskImage;
}

export function drawFlagshipAnatomyB(renderer, timestamp = performance.now()) {
  if (!renderer.context || !renderer.state) return;
  renderer.canvas.dataset.fieldRenderer = RENDERER_ID;
  renderer.canvas.dataset.fieldBackend = "webgl";

  const { width, height, ratio } = canvasSize(renderer.canvas);
  const g = deriveFieldGeometry(renderer.state, renderer.visualTime, width, height);
  const mix = transitionMix.call(renderer, timestamp);
  const band = routeBand(renderer.state.selectedMapping);
  const damage = clamp(
    g.health.severity * 0.68
    + g.deformation * 0.31
    + g.art.fractureBias * 0.18,
  );
  const audioDrive = clamp(
    g.mapped.displacement * 0.44
    + g.mapped.phaseDisagreement * 0.23
    + g.mapped.brilliance * 0.22
    + g.mapped.emissionRate * 0.11,
  );
  const shockCarrier = Math.max(
    0,
    Math.sin(g.phase * (2.45 + damage * 2.35) + g.art.direction * 1.35),
  );
  const shock = damage * Math.pow(shockCarrier, 6);

  let state;
  try {
    state = ensureWebglState(renderer);
  } catch (error) {
    renderer._flagshipAnatomyBWebglFailure = error;
    throw error;
  }

  resizeWebgl(state, renderer.canvas);
  const aspect = state.cssWidth / Math.max(1, state.cssHeight);
  deformSurface(state, g, band, damage, audioDrive, shock);
  updateObject(state, g, damage, shock, aspect, mix);
  updateDroplets(state, g, damage, shock);
  state.webgl.render(state.scene, state.camera);

  if (state.webgl.info.render.triangles <= 0) {
    throw new Error("Flagship anatomy B WebGL mesh produced no rendered triangles.");
  }

  studioPlate(renderer.context, g, width, height, ratio, band, damage, shock);
}
