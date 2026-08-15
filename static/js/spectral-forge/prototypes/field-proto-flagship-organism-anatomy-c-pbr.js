"use strict";

import * as THREE from "/lab/vendor/three/three.module.min.js";
import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { transitionMix } from "../spectral-field-state.js";
import { canvasSize, clamp, routeBand, unit } from "./proto-core.js";

const RENDERER_ID = "proto-flagship-anatomy-c";
const WEBGL_CLASS = "spectral-field-proto-webgl";
const DROPLET_COUNT = 8;
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
  const cx = width * (aspect > 1.8 ? 0.615 : 0.5);
  const cy = height * 0.49;
  const radius = Math.max(width, height) * 0.73;

  const well = context.createRadialGradient(
    cx - height * 0.06,
    cy - height * 0.13,
    height * 0.035,
    cx,
    cy,
    radius,
  );
  well.addColorStop(0, "#7b7682");
  well.addColorStop(0.1, "#56525f");
  well.addColorStop(0.24, "#35333e");
  well.addColorStop(0.5, "#1b1a22");
  well.addColorStop(0.76, "#0d0d13");
  well.addColorStop(1, "#050509");
  context.fillStyle = well;
  context.fillRect(0, 0, width, height);

  const leftBand = context.createLinearGradient(0, 0, width * 0.61, 0);
  leftBand.addColorStop(0, "rgba(5,5,9,0.995)");
  leftBand.addColorStop(0.5, "rgba(7,7,12,0.84)");
  leftBand.addColorStop(0.79, "rgba(7,7,12,0.30)");
  leftBand.addColorStop(1, "rgba(7,7,12,0)");
  context.fillStyle = leftBand;
  context.fillRect(0, 0, width * 0.63, height);

  const verticalFalloff = context.createLinearGradient(0, 0, 0, height);
  verticalFalloff.addColorStop(0, "rgba(0,0,0,0.15)");
  verticalFalloff.addColorStop(0.28, "rgba(0,0,0,0)");
  verticalFalloff.addColorStop(0.72, "rgba(0,0,0,0.02)");
  verticalFalloff.addColorStop(1, "rgba(0,0,0,0.44)");
  context.fillStyle = verticalFalloff;
  context.fillRect(0, 0, width, height);

  const floorShadow = context.createRadialGradient(
    cx + height * 0.07,
    cy + height * 0.31,
    height * 0.02,
    cx + height * 0.07,
    cy + height * 0.31,
    height * (0.34 + damage * 0.08),
  );
  floorShadow.addColorStop(0, `rgba(0,0,0,${0.55 + damage * 0.17 + shock * 0.08})`);
  floorShadow.addColorStop(0.42, "rgba(0,0,0,0.28)");
  floorShadow.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = floorShadow;
  context.fillRect(0, 0, width, height);

  context.save();
  context.strokeStyle = "rgba(236,239,247,0.014)";
  context.lineWidth = Math.max(1, ratio * 0.4);
  for (let i = 0; i < 2; i += 1) {
    context.beginPath();
    context.ellipse(
      cx,
      cy,
      height * (0.315 + i * 0.102),
      height * (0.258 + i * 0.084),
      -0.05,
      0,
      TAU,
    );
    context.stroke();
  }
  context.restore();

  if (band) {
    const routeCenter = (band.x0 + band.x1) * 0.5;
    const pulse = 0.5 + 0.5 * Math.sin(g.phase * (2.45 + g.mapped.emissionRate * 2.8));
    const x = cx + (routeCenter - 0.5) * height * 0.53;
    const y = cy - height * 0.012 + Math.sin(g.phase * 0.36 + routeCenter * 5.2) * height * 0.06;
    const glow = context.createRadialGradient(x, y, 0, x, y, height * 0.11);
    glow.addColorStop(0, `rgba(245,166,35,${0.028 + pulse * 0.022})`);
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
  webgl.toneMappingExposure = 1.16;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28.5, 1, 0.1, 20);
  camera.position.set(0, 0.02, 4.42);

  const group = new THREE.Group();
  scene.add(group);

  const geometry = new THREE.SphereGeometry(1, 112, 76);
  const position = geometry.getAttribute("position");
  const basePositions = new Float32Array(position.array);
  const colours = new Float32Array(position.count * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    metalness: 0.5,
    roughness: 0.205,
    clearcoat: 1,
    clearcoatRoughness: 0.065,
    reflectivity: 0.92,
    sheen: 0.022,
    sheenColor: new THREE.Color(0x312e48),
    side: THREE.DoubleSide,
  });
  const body = new THREE.Mesh(geometry, material);
  body.frustumCulled = false;
  group.add(body);

  scene.add(new THREE.HemisphereLight(0xe4e5ec, 0x010103, 1.05));

  const key = new THREE.DirectionalLight(0xffffff, 5.75);
  key.position.set(-4.2, 5.4, 5.8);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x746f9c, 1.65);
  rim.position.set(4.8, 1.9, 3.0);
  scene.add(rim);

  const low = new THREE.DirectionalLight(0x363742, 1.42);
  low.position.set(-1.9, -3.4, 3.0);
  scene.add(low);

  const edge = new THREE.PointLight(0xffffff, 1.15, 7.8, 2);
  edge.position.set(1.7, 2.4, 3.4);
  scene.add(edge);

  const dropletGeometry = new THREE.SphereGeometry(0.038, 14, 10);
  const dropletMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x060608,
    metalness: 0.52,
    roughness: 0.19,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
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
  renderer._flagshipAnatomyCWebgl = state;
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
  if (renderer._flagshipAnatomyCWebgl === state) renderer._flagshipAnatomyCWebgl = null;
}

export function disposeFlagshipAnatomyC(renderer) {
  const state = renderer?._flagshipAnatomyCWebgl;
  if (state) disposeWebglState(renderer, state);
}

function ensureWebglState(renderer) {
  const current = renderer._flagshipAnatomyCWebgl;
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
  const slow = g.phase * (0.055 + g.mapped.emissionRate * 0.055);
  const foldA = Math.sin(
    x * 2.75 - y * 2.1 + z * 1.55 + seed[0] * 4.1 + slow,
  );
  const foldB = Math.cos(
    x * 1.85 + y * 3.15 - z * 2.25 + seed[2] * 4.8 - slow * 0.8,
  );
  const tide = Math.sin(
    x * 1.6 - y * 1.28 + z * 1.05 + g.phase * (0.42 + g.mapped.emissionRate * 0.7),
  );
  return { foldA, foldB, tide };
}

function seamField(x, y, z, g, seed) {
  const along = x * 0.92 + z * 0.82;
  const targetY = 0.18
    + Math.sin(along * 1.7 + seed[1] * 3.4 + g.phase * 0.04) * 0.13
    + Math.cos((x - z) * 1.18 + seed[3] * 2.5) * 0.055;
  const distance = y - targetY;
  const visibleArc = 0.36 + 0.64 * smoothPulse((z + 0.9) * 0.56);
  const dorsal = smoothPulse((y + 0.16) * 1.08 + 0.45);
  const submerge = 0.2 + 0.8 * smoothPulse(
    0.5 + 0.5 * Math.sin(along * 2.35 + seed[0] * 4 + g.phase * 0.052),
  );
  const crest = Math.exp(-Math.pow(distance / 0.125, 2)) * dorsal * visibleArc * submerge;
  const inner = Math.exp(-Math.pow(distance / 0.048, 2)) * dorsal * visibleArc * submerge;
  const shoulder = Math.exp(-Math.pow((distance - 0.09) / 0.1, 2)) * dorsal * visibleArc;
  return { crest, inner, shoulder, along };
}

function microField(x, y, z, g, seed) {
  const a = 0.5 + 0.5 * Math.sin(
    x * (9.1 + seed[0] * 1.7) + y * 5.6 - z * 7.2
    + g.phase * (0.64 + g.mapped.emissionRate * 1.2),
  );
  const b = 0.5 + 0.5 * Math.cos(
    x * 4.4 - y * (10.2 + seed[2] * 1.8) + z * 8.2
    - g.phase * (0.54 + g.mapped.emissionRate * 0.94) + seed[3] * 4.1,
  );
  return a * b;
}

function deformSurface(state, g, band, damage, audioDrive, shock) {
  const position = state.geometry.getAttribute("position");
  const colour = state.geometry.getAttribute("color");
  const base = state.basePositions;
  const seed = [
    unit(g.seedPhase, 501),
    unit(g.seedPhase, 502),
    unit(g.seedPhase, 503),
    unit(g.seedPhase, 504),
  ];

  const routeCenter = band ? (band.x0 + band.x1) * 0.5 : 0.5;
  const routeWidth = band ? Math.max(0.055, (band.x1 - band.x0) * 0.5) : 0.1;
  const hasRoute = Boolean(band);
  const coherenceLoss = 1 - g.coherence;
  const pumpPhase = g.phase * (0.29 + g.mapped.emissionRate * 0.4);
  const pumpA = Math.sin(pumpPhase);
  const pumpB = Math.sin(pumpPhase + Math.PI * 0.88);
  const breath = (g.breathing - 0.5) * (0.006 + g.mapped.displacement * 0.006);

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

    const core = gaussian3(x, y, z, -0.08, -0.02, 0.02, 0.84, 0.72, 1.15);
    const shoulder = gaussian3(x, y, z, -0.5, 0.3, 0.02, 0.4, 0.38, 1.2);
    const trailer = gaussian3(x, y, z, 0.5, -0.16, -0.02, 0.46, 0.46, 1.2);
    const crestMass = gaussian3(x, y, z, -0.08, 0.57, 0.02, 0.52, 0.25, 1.1);
    const lowerShelf = gaussian3(x, y, z, -0.22, -0.52, 0.04, 0.58, 0.24, 1.05);
    const waist = gaussian3(x, y, z, 0.12, -0.16, 0.03, 0.42, 0.3, 1.25);
    const topNotch = gaussian3(x, y, z, 0.2, 0.38, 0.03, 0.3, 0.23, 1.2);
    const lowerNotch = gaussian3(x, y, z, -0.18, -0.36, 0.04, 0.34, 0.22, 1.18);
    const frontRead = 0.42 + 0.58 * smoothPulse((z + 1) * 0.5);

    const pumpTransfer = (
      shoulder * pumpA
      + trailer * pumpB * 0.84
      - core * (pumpA + pumpB) * 0.1
    ) * (0.012 + g.mapped.displacement * 0.024 + audioDrive * 0.009);

    const radialMass = (
      core * 0.018
      + shoulder * 0.07
      + trailer * 0.052
      + crestMass * 0.035
      + lowerShelf * 0.024
      - waist * 0.07
      - topNotch * 0.038
      - lowerNotch * 0.032
      + pumpTransfer
    );

    const foldEnvelope = clamp(
      shoulder * 0.42 + trailer * 0.34 + crestMass * 0.3 + core * 0.18,
    );
    const foldA = anatomy.foldA * (
      0.01 + g.pressure * 0.009 + g.mapped.displacement * 0.012 + damage * 0.012
    ) * (0.38 + foldEnvelope);
    const foldB = anatomy.foldB * (
      0.007 + g.art.compression * 0.007 + damage * 0.006
    ) * (0.34 + foldEnvelope);

    const crestLift = seam.crest * (
      0.032 + g.mapped.displacement * 0.052 + g.mapped.brilliance * 0.022 + damage * 0.07
    );
    const seamCut = seam.inner * (
      -0.012 - damage * 0.01
      + Math.sin(g.phase * (0.58 + g.mapped.emissionRate * 1.16) + seam.along * 3.8) * 0.0035
    );

    const pressureGradient = clamp(
      shoulder * 0.44 + seam.crest * 0.58 + crestMass * 0.18 + damage * 0.16,
    );
    const microPeak = Math.pow(clamp((micro - 0.62) / 0.38), 4.1);
    const microLift = microPeak * pressureGradient * (
      0.012 + g.mapped.microstructure * 0.036 + g.mapped.displacement * 0.04 + damage * 0.082
    );

    const liquidTide = anatomy.tide * (
      0.006 + g.mapped.displacement * 0.01 + audioDrive * 0.006
    );
    const coherenceShear = Math.sin(
      x * 3.25 - y * 4.05 + z * 2.45 + g.phase * 1.02,
    ) * coherenceLoss * (0.004 + g.mapped.phaseDisagreement * 0.018);

    const shockCarrier = Math.sin(
      (x * 0.9 - y * 0.27 + z * 0.49) * 4.8 - g.phase * (3 + damage * 2.55),
    );
    const shockFront = Math.pow(Math.max(0, shockCarrier), 7) * shock * damage;

    const routeCoord = x * 0.5 + 0.5;
    const routeDistance = Math.abs(routeCoord - routeCenter);
    const routeFalloff = hasRoute ? clamp(1 - routeDistance / routeWidth) : 0;
    const routeLatitude = Math.exp(-Math.pow(
      (y + 0.04 + Math.sin(z * 2.05 + x * 0.72) * 0.09) * 1.75,
      2,
    ));
    const route = routeFalloff * routeFalloff * routeLatitude;
    const routePulse = 0.5 + 0.5 * Math.sin(
      g.phase * (2.4 + g.mapped.emissionRate * 2.9) + z * 5 - y * 1.9,
    );
    const routeWound = route * (-0.013 + routePulse * 0.006 - damage * 0.006);

    const radius = 1
      + breath
      + radialMass
      + crestLift
      + seamCut
      + microLift
      + liquidTide
      + coherenceShear
      + routeWound
      + shockFront * 0.095;

    let px = x * radius * (1.07 + g.art.stretch * 0.045 + damage * 0.03);
    let py = y * radius * (0.91 - g.art.compression * 0.034 - damage * 0.01);
    let pz = z * radius * (0.96 + g.mapped.lateralSpread * 0.02 + damage * 0.016);

    // Anatomy C deliberately moves matter through space rather than only inflating the sphere.
    // These large tangential drags establish an asymmetric body plan before surface detail.
    px += shoulder * (-0.19 - g.mapped.displacement * 0.025);
    py += shoulder * (0.16 + pumpA * 0.025 + g.pressure * 0.025);
    pz += shoulder * 0.04 * frontRead;

    px += trailer * (0.25 + g.mapped.displacement * 0.02);
    py += trailer * (-0.085 + pumpB * 0.018);
    pz += trailer * -0.075 * frontRead;

    px += crestMass * -0.045;
    py += crestMass * (0.155 + seam.crest * 0.04);
    pz += crestMass * 0.025 * frontRead;

    px += lowerShelf * -0.06;
    py += lowerShelf * -0.08;

    px += waist * 0.035;
    py += waist * 0.055;
    pz -= waist * 0.035 * frontRead;

    px += topNotch * 0.035;
    py -= topNotch * 0.075;
    px -= lowerNotch * 0.028;
    py += lowerNotch * 0.05;

    // Two local tangent directions let broad folds slide matter around the surface.
    const tangentLength = Math.hypot(-y, x) || 1;
    const t1x = -y / tangentLength;
    const t1y = x / tangentLength;
    const t1z = 0;
    const t2x = -z * t1y;
    const t2y = z * t1x;
    const t2z = x * t1y - y * t1x;

    const foldFlowA = foldA * (0.9 + shoulder * 0.65 + crestMass * 0.35);
    const foldFlowB = foldB * (0.8 + trailer * 0.55 + lowerShelf * 0.35);
    px += t1x * foldFlowA * 2.7 + t2x * foldFlowB * 2.2;
    py += t1y * foldFlowA * 2.7 + t2y * foldFlowB * 2.2;
    pz += t1z * foldFlowA * 2.7 + t2z * foldFlowB * 2.2;

    // The magnetic seam physically pulls the surface into an off-centre crest.
    px -= seam.crest * (0.055 + damage * 0.02);
    py += seam.crest * (0.07 + g.mapped.displacement * 0.025);
    pz += seam.shoulder * 0.022 * frontRead;

    px += (g.art.direction * 0.038 - 0.018) * damage + shockFront * 0.058;
    py += -0.014 * g.art.compression - shockFront * 0.022;
    pz += shockFront * 0.03;

    position.setXYZ(i, px, py, pz);

    const foldRead = clamp(
      Math.abs(foldA) * 16 + Math.abs(foldB) * 13 + seam.crest * 0.48 + microPeak * pressureGradient * 0.25,
    );
    const coolReflect = clamp(
      0.07 + Math.max(0, z) * 0.055 + g.mapped.brilliance * 0.05
      + g.mapped.afterimage * 0.025 + foldRead * 0.06,
    );

    let r = 0.009 + coolReflect * 0.027;
    let gg = 0.0095 + coolReflect * 0.028;
    let bl = 0.013 + coolReflect * 0.044 + damage * 0.003;

    const violetEdge = clamp(
      Math.max(0, -x * 0.3 + z * 0.18) * 0.05 + g.mapped.afterimage * 0.012,
    );
    r += violetEdge * 0.34;
    bl += violetEdge * 0.6;

    const seamCool = seam.crest * (0.012 + g.mapped.brilliance * 0.015);
    r += seamCool * 0.16;
    gg += seamCool * 0.15;
    bl += seamCool * 0.31;

    if (route > 0) {
      const wound = clamp(route * (0.085 + routePulse * 0.32 + audioDrive * 0.1));
      r += 0.74 * wound;
      gg += 0.295 * wound;
      bl += 0.016 * wound;
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
  const active = damage < 0.63 ? 0 : Math.min(
    DROPLET_COUNT,
    1 + Math.floor((damage - 0.59) * 7 + shock * 3),
  );

  for (let i = 0; i < DROPLET_COUNT; i += 1) {
    const drop = state.droplets[i];
    if (i >= active) {
      drop.visible = false;
      continue;
    }

    const azimuth = (unit(g.seedPhase, i + 361) - 0.5) * Math.PI * 1.22;
    const elevation = (unit(g.seedPhase, i + 379) - 0.33) * Math.PI * 0.48;
    const speed = 0.08 + unit(g.seedPhase, i + 393) * 0.1;
    const age = (g.phase * speed + unit(g.seedPhase, i + 407)) % 1;
    const radial = 1.04 + damage * 0.07 + age * (0.16 + damage * 0.4 + shock * 0.13);
    const cosElevation = Math.cos(elevation);
    const x = Math.cos(azimuth) * cosElevation * radial;
    const z = Math.sin(azimuth) * cosElevation * radial * 0.74;
    const y = Math.sin(elevation) * radial + age * 0.19 - age * age * 0.28;
    const scale = (0.3 + unit(g.seedPhase, i + 421) * 0.56) * damage * (1 - age * 0.5);

    drop.visible = true;
    drop.position.set(x, y, z);
    drop.scale.setScalar(Math.max(0.16, scale));
  }
}

function updateObject(state, g, damage, shock, aspect, mix) {
  const wide = aspect > 1.55;
  const baseScale = wide ? 1.08 : 0.89;

  state.group.scale.set(
    baseScale * (1.03 + g.mapped.lateralSpread * 0.045 + damage * 0.025),
    baseScale * (1.0 - g.art.compression * 0.022),
    baseScale * (0.99 + damage * 0.014),
  );
  state.group.position.x = wide ? 0.61 - damage * 0.06 + g.art.direction * 0.028 : 0;
  state.group.position.y = -0.005 - g.art.compression * 0.02;
  state.group.position.z = 0;

  state.group.rotation.x = 0.07 + Math.sin(g.phase * 0.085) * 0.01 + g.tilt * 0.07;
  state.group.rotation.y = -0.18 + g.torsion * 0.2 + Math.sin(g.phase * 0.072) * 0.024;
  state.group.rotation.z = -0.035 + g.art.direction * damage * 0.03 + shock * 0.022;

  state.canvas.style.opacity = String(0.63 + mix * 0.37);
  state.canvas.style.webkitMaskImage = wide
    ? "linear-gradient(90deg, transparent 0%, rgba(0,0,0,.12) 9%, #000 23%, #000 100%)"
    : "none";
  state.canvas.style.maskImage = state.canvas.style.webkitMaskImage;
}

export function drawFlagshipAnatomyC(renderer, timestamp = performance.now()) {
  if (!renderer.context || !renderer.state) return;
  renderer.canvas.dataset.fieldRenderer = RENDERER_ID;
  renderer.canvas.dataset.fieldBackend = "webgl";

  const { width, height, ratio } = canvasSize(renderer.canvas);
  const g = deriveFieldGeometry(renderer.state, renderer.visualTime, width, height);
  const mix = transitionMix.call(renderer, timestamp);
  const band = routeBand(renderer.state.selectedMapping);
  const damage = clamp(
    g.health.severity * 0.68 + g.deformation * 0.31 + g.art.fractureBias * 0.18,
  );
  const audioDrive = clamp(
    g.mapped.displacement * 0.44 + g.mapped.phaseDisagreement * 0.23
    + g.mapped.brilliance * 0.22 + g.mapped.emissionRate * 0.11,
  );
  const shockCarrier = Math.max(
    0,
    Math.sin(g.phase * (2.4 + damage * 2.3) + g.art.direction * 1.3),
  );
  const shock = damage * Math.pow(shockCarrier, 6);

  let state;
  try {
    state = ensureWebglState(renderer);
  } catch (error) {
    renderer._flagshipAnatomyCWebglFailure = error;
    throw error;
  }

  resizeWebgl(state, renderer.canvas);
  const aspect = state.cssWidth / Math.max(1, state.cssHeight);
  deformSurface(state, g, band, damage, audioDrive, shock);
  updateObject(state, g, damage, shock, aspect, mix);
  updateDroplets(state, g, damage, shock);
  state.webgl.render(state.scene, state.camera);

  if (state.webgl.info.render.triangles <= 0) {
    throw new Error("Flagship anatomy C WebGL mesh produced no rendered triangles.");
  }

  studioPlate(renderer.context, g, width, height, ratio, band, damage, shock);
}
