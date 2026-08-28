"use strict";

import * as THREE from "/lab/vendor/three/three.module.min.js";
import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { transitionMix } from "../spectral-field-state.js";
import { canvasSize, clamp, routeBand, unit } from "./proto-core.js";

const RENDERER_ID = "proto-flagship-organism";
const WEBGL_CLASS = "spectral-field-proto-webgl";
const DROPLET_COUNT = 12;

const VERTEX_SHADER = `
precision highp float;

uniform float uPhase;
uniform float uDamage;
uniform float uAudioDrive;
uniform float uDisplacement;
uniform float uEmissionRate;
uniform float uBrilliance;
uniform float uAperture;
uniform float uPhaseDisagreement;
uniform float uFracture;
uniform float uShock;
uniform float uDirection;
uniform float uCompression;
uniform float uStretch;
uniform float uRouteCenter;
uniform float uRouteWidth;
uniform float uHasRoute;
uniform vec4 uSeed;

varying vec3 vWorldPosition;
varying vec3 vLocalDirection;
varying float vField;
varying float vRidge;
varying float vRoute;
varying float vShockFront;

float saturate(float value) {
  return clamp(value, 0.0, 1.0);
}

float magneticField(vec3 p) {
  float living = 0.5 + 0.5 * sin(
    (p.x * p.x - p.y * 1.62) * (4.15 + uSeed.x * 0.7)
    + p.z * (1.4 + uSeed.y * 0.9)
    + uPhase * (1.02 + uAudioDrive * 0.92)
    + uSeed.z * 6.2831853
  );
  float tide = 0.5 + 0.5 * sin(
    p.x * (2.0 + uSeed.y * 0.6)
    - p.y * (2.25 + uSeed.z * 0.5)
    + p.z * 1.35
    + uPhase * (0.64 + uAudioDrive * 0.76)
  );
  float needlesA = 0.5 + 0.5 * sin(
    p.x * (11.5 + uSeed.w * 2.4)
    + sin(p.y * 7.2 + uSeed.x * 4.0) * 1.7
    - p.z * 8.4
    + uPhase * (0.92 + uEmissionRate * 1.8)
  );
  float needlesB = 0.5 + 0.5 * cos(
    p.z * (12.7 + uSeed.z * 2.0)
    - p.y * 9.6
    + p.x * 4.1
    - uPhase * (0.72 + uEmissionRate * 1.35)
    + uSeed.y * 5.2
  );
  float micro = needlesA * needlesB;
  float disagreement = sin(
    dot(p, vec3(8.2, -5.6, 6.4))
    + uPhase * (1.45 + uPhaseDisagreement * 1.8)
  ) * uPhaseDisagreement * 0.08;
  return saturate(living * 0.42 + tide * 0.18 + micro * 0.46 + disagreement);
}

void main() {
  vec3 dir = normalize(position);
  float field = magneticField(dir);
  float gate = 0.48 + uAperture * 0.08 - uDamage * 0.17 - uAudioDrive * 0.06;
  float mound = smoothstep(gate - 0.14, gate + 0.055, field);
  float peak = pow(smoothstep(gate - 0.015, 0.96, field), 2.75);

  float routeCoord = dir.x * 0.5 + 0.5;
  float routeBand = 1.0 - smoothstep(
    uRouteWidth * 0.58,
    uRouteWidth,
    abs(routeCoord - uRouteCenter)
  );
  float routeLatitude = exp(-pow(dir.y * 1.65 + 0.12, 2.0));
  float route = routeBand * routeLatitude * uHasRoute;

  float beat = 0.5 + 0.5 * sin(
    uPhase * (3.0 + uEmissionRate * 5.2)
    + dot(dir, vec3(3.2, -1.7, 2.6))
  );
  float tide = sin(
    dot(dir, vec3(2.3, -2.8, 1.5))
    + uPhase * (1.25 + uEmissionRate * 2.6)
  );
  float audioTide = tide * uAudioDrive * (0.012 + uDisplacement * 0.028);

  float shockTravel = sin(
    dot(dir, normalize(vec3(0.86, -0.22, 0.46))) * 5.3
    - uPhase * (4.0 + uDamage * 3.2)
  );
  float shockFront = pow(max(0.0, shockTravel), 7.0) * uShock * uDamage;

  float pressure = mound * (0.035 + uDamage * 0.055 + uDisplacement * 0.028);
  float spikes = peak * (
    0.035
    + uDisplacement * 0.22
    + uDamage * 0.24
    + uFracture * 0.075
  );
  spikes *= 0.82 + beat * uAudioDrive * 0.46;

  float routeWound = route * (
    -0.022
    + sin(uPhase * (3.8 + uEmissionRate * 3.8) + dir.y * 8.0) * 0.018
  );
  float radius = 1.0 + pressure + spikes + audioTide + shockFront * 0.17 + routeWound;

  vec3 transformed = dir * radius;
  transformed.x *= 1.0 + uDamage * 0.075 + uStretch * 0.045;
  transformed.y *= 0.92 - uCompression * 0.035 - uDamage * 0.035;
  transformed.z *= 0.94 + uDamage * 0.03;

  transformed += vec3(
    (uDirection * 0.05 - 0.025) * uDamage,
    -0.025 * uCompression,
    0.0
  );
  transformed += vec3(0.09, -0.035, 0.045) * shockFront;

  vec4 world = modelMatrix * vec4(transformed, 1.0);
  vWorldPosition = world.xyz;
  vLocalDirection = dir;
  vField = field;
  vRidge = saturate(mound * 0.4 + peak * 0.8);
  vRoute = route;
  vShockFront = shockFront;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform float uPhase;
uniform float uDamage;
uniform float uAudioDrive;
uniform float uBrilliance;
uniform float uAfterimage;
uniform float uEmissionRate;
uniform float uShock;

varying vec3 vWorldPosition;
varying vec3 vLocalDirection;
varying float vField;
varying float vRidge;
varying float vRoute;
varying float vShockFront;

float saturate(float value) {
  return clamp(value, 0.0, 1.0);
}

void main() {
  vec3 dx = dFdx(vWorldPosition);
  vec3 dy = dFdy(vWorldPosition);
  vec3 normal = normalize(cross(dx, dy));
  if (!gl_FrontFacing) normal = -normal;

  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 keyDir = normalize(vec3(-0.72, 0.78, 1.0));
  vec3 rimDir = normalize(vec3(0.92, 0.18, 0.62));
  vec3 fillDir = normalize(vec3(-0.2, -0.7, 0.85));

  float keyDiffuse = max(dot(normal, keyDir), 0.0);
  float rimDiffuse = max(dot(normal, rimDir), 0.0);
  float fillDiffuse = max(dot(normal, fillDir), 0.0);

  vec3 keyHalf = normalize(keyDir + viewDir);
  vec3 rimHalf = normalize(rimDir + viewDir);
  float gloss = mix(78.0, 170.0, saturate(uBrilliance * 0.78 + vRidge * 0.22));
  float keySpec = pow(max(dot(normal, keyHalf), 0.0), gloss);
  float rimSpec = pow(max(dot(normal, rimHalf), 0.0), gloss * 0.68);
  float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.8);

  float valley = smoothstep(0.08, 0.72, vRidge);
  float valleyOcclusion = mix(0.46, 1.0, valley);
  float indigo = saturate(
    0.24
    + vField * 0.26
    + max(0.0, -vLocalDirection.y) * 0.12
    + uAfterimage * 0.1
  );

  vec3 black = vec3(0.0032, 0.0036, 0.0055);
  vec3 steel = vec3(0.045, 0.052, 0.078);
  vec3 violet = vec3(0.075, 0.055, 0.125);
  vec3 base = mix(black, steel, indigo * 0.62);
  base = mix(base, violet, indigo * 0.18 + uDamage * 0.09);
  base *= valleyOcclusion;

  vec3 pale = vec3(0.88, 0.92, 0.98);
  vec3 cold = vec3(0.34, 0.46, 0.72);
  vec3 colour = base;
  colour += pale * keySpec * (0.72 + uBrilliance * 0.42);
  colour += cold * rimSpec * (0.34 + uBrilliance * 0.3);
  colour += pale * fresnel * (0.09 + rimDiffuse * 0.08);
  colour += vec3(0.055, 0.065, 0.09) * keyDiffuse * 0.16;
  colour += vec3(0.025, 0.028, 0.04) * fillDiffuse * 0.1;

  float woundPulse = 0.52 + 0.48 * sin(
    uPhase * (3.9 + uEmissionRate * 3.2)
    + vLocalDirection.y * 8.0
  );
  float wound = vRoute * (0.22 + woundPulse * 0.34 + uAudioDrive * 0.18);
  vec3 amber = vec3(0.961, 0.651, 0.137);
  colour = mix(colour, amber, saturate(wound * 0.72));
  colour += amber * wound * 0.16;

  float shockGlint = vShockFront * (0.22 + uShock * 0.24);
  colour += pale * shockGlint;

  gl_FragColor = vec4(colour, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

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
      Math.PI * 2,
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

function makeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPhase: { value: 0 },
      uDamage: { value: 0 },
      uAudioDrive: { value: 0 },
      uDisplacement: { value: 0 },
      uEmissionRate: { value: 0 },
      uBrilliance: { value: 0 },
      uAperture: { value: 0 },
      uPhaseDisagreement: { value: 0 },
      uFracture: { value: 0 },
      uShock: { value: 0 },
      uDirection: { value: 0 },
      uCompression: { value: 0 },
      uStretch: { value: 0 },
      uRouteCenter: { value: 0.5 },
      uRouteWidth: { value: 0.1 },
      uHasRoute: { value: 0 },
      uSeed: { value: new THREE.Vector4(0.21, 0.47, 0.68, 0.83) },
      uAfterimage: { value: 0 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    side: THREE.DoubleSide,
  });
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
  webgl.toneMappingExposure = 1.02;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 20);
  camera.position.set(0, 0, 4.25);

  const group = new THREE.Group();
  scene.add(group);

  const geometry = new THREE.SphereGeometry(1, 112, 72);
  const material = makeMaterial();
  const body = new THREE.Mesh(geometry, material);
  body.frustumCulled = false;
  group.add(body);

  const hemisphere = new THREE.HemisphereLight(0xaeb8d0, 0x050509, 0.72);
  scene.add(hemisphere);
  const key = new THREE.DirectionalLight(0xf4f5ff, 4.2);
  key.position.set(-3.4, 4.6, 5.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6877bc, 2.4);
  rim.position.set(4.2, 1.4, 3.0);
  scene.add(rim);

  const dropletGeometry = new THREE.SphereGeometry(0.045, 14, 10);
  const dropletMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x05060a,
    metalness: 0.78,
    roughness: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
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
    dropletGeometry,
    dropletMaterial,
    droplets,
    cssWidth: 0,
    cssHeight: 0,
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
    const launch = 1.0 + damage * 0.12;
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

function updateSurface(state, g, band, damage, audioDrive, shock, aspect, mix) {
  const uniforms = state.material.uniforms;
  uniforms.uPhase.value = g.phase;
  uniforms.uDamage.value = damage;
  uniforms.uAudioDrive.value = audioDrive;
  uniforms.uDisplacement.value = g.mapped.displacement;
  uniforms.uEmissionRate.value = g.mapped.emissionRate;
  uniforms.uBrilliance.value = g.mapped.brilliance;
  uniforms.uAperture.value = g.mapped.aperture;
  uniforms.uPhaseDisagreement.value = g.mapped.phaseDisagreement;
  uniforms.uFracture.value = g.mapped.granularFracture;
  uniforms.uShock.value = shock;
  uniforms.uDirection.value = g.art.direction;
  uniforms.uCompression.value = g.art.compression;
  uniforms.uStretch.value = g.art.stretch;
  uniforms.uAfterimage.value = g.mapped.afterimage;
  uniforms.uSeed.value.set(
    unit(g.seedPhase, 201),
    unit(g.seedPhase, 202),
    unit(g.seedPhase, 203),
    unit(g.seedPhase, 204),
  );

  if (band) {
    uniforms.uHasRoute.value = 1;
    uniforms.uRouteCenter.value = (band.x0 + band.x1) * 0.5;
    uniforms.uRouteWidth.value = Math.max(0.05, (band.x1 - band.x0) * 0.56);
  } else {
    uniforms.uHasRoute.value = 0;
  }

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
  state.group.rotation.x = 0.04 + Math.sin(g.phase * 0.23) * 0.018 * audioDrive;
  state.group.rotation.y = g.torsion * 0.34 + Math.sin(g.phase * 0.17) * 0.06;
  state.group.rotation.z = -0.035 + (g.art.direction - 0.5) * damage * 0.09 + shock * 0.045;
  state.canvas.style.opacity = String(0.45 + mix * 0.55);
  state.canvas.style.webkitMaskImage = wide
    ? "linear-gradient(90deg, transparent 0%, rgba(0,0,0,.26) 14%, #000 34%, #000 100%)"
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
  const shock = damage * Math.pow(shockCarrier, 5.0);

  studioPlate(renderer.context, g, width, height, ratio, band, damage, shock);

  let state;
  try {
    state = ensureWebglState(renderer);
  } catch (error) {
    renderer._flagshipWebglFailure = error;
    throw error;
  }

  resizeWebgl(state, renderer.canvas);
  const aspect = state.cssWidth / Math.max(1, state.cssHeight);
  updateSurface(state, g, band, damage, audioDrive, shock, aspect, mix);
  updateDroplets(state, g, damage, shock);
  state.webgl.render(state.scene, state.camera);
}
