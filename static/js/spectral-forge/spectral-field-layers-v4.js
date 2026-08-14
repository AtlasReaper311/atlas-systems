"use strict";

import { clamp } from "./domain.js";
import { deterministicUnit } from "./spectral-field-model.js";

const FILAMENTS = Object.freeze([
  Object.freeze({ id: "request_rate", colour: [116, 208, 255], lane: -0.34, depth: -0.62, phase: 0.11 }),
  Object.freeze({ id: "latency_ms", colour: [127, 136, 255], lane: -0.14, depth: -0.28, phase: 0.29 }),
  Object.freeze({ id: "error_rate", colour: [211, 203, 255], lane: 0.06, depth: 0.04, phase: 0.47 }),
  Object.freeze({ id: "cache_hit_rate", colour: [159, 221, 255], lane: 0.27, depth: 0.36, phase: 0.63 }),
  Object.freeze({ id: "anomaly_score", colour: [184, 180, 255], lane: 0.43, depth: 0.68, phase: 0.81 }),
]);

function projectPoint(state, x, y, z, index = 0) {
  const { centerX, centerY, radiusX, radiusY, depthSpan, tilt, torsion, deformation, asymmetry, phase, art } = state;
  const zScale = 1 + z * 0.09;
  const twist = torsion * z + Math.sin(phase * 0.09 + index * 0.41) * deformation * 0.018;
  const cos = Math.cos(twist);
  const sin = Math.sin(twist);
  const localX = x * cos - y * sin;
  const localY = x * sin + y * cos;
  const fracture = deformation * Math.sin((x * 2.7 + y * 3.8 + z * 2.1) * Math.PI + phase * 0.17) * 0.035;
  const pressureLean = art.direction * art.propagation * (1 - Math.abs(x)) * 0.055;
  const px = centerX
    + localX * radiusX * zScale
    + z * depthSpan * (0.46 + asymmetry * 0.08)
    + (fracture - pressureLean) * radiusX;
  const py = centerY
    + localY * radiusY * (1 - z * 0.07)
    - z * depthSpan * 0.16
    + x * tilt * radiusY * 0.42
    + fracture * radiusY * 0.72;
  return [px, py];
}

function shellPoint(state, angle, z, scale = 1, index = 0) {
  const { mapped, art, breathing, deformation } = state;
  const crystalline = Math.sin(angle * 6 + z * 2.4 + state.phase * 0.12) * (0.018 + mapped.microstructure * 0.024);
  const asymmetry = Math.cos(angle * 3 - state.phase * 0.08) * deformation * 0.028;
  const aperture = 0.9 + mapped.aperture * 0.11;
  const compression = 1 - art.compression * art.disturbance * Math.max(0, Math.cos(angle)) * 0.055;
  const stretch = 1 + art.stretch * Math.abs(Math.sin(angle)) * 0.08;
  const pulse = 1 + (breathing - 0.5) * mapped.displacement * 0.018;
  const x = Math.cos(angle) * scale * aperture * compression * pulse * (1 + crystalline);
  const y = Math.sin(angle) * scale * stretch * pulse * (1 + asymmetry);
  return projectPoint(state, x, y, z, index);
}

function drawShell(context, state, z, scale, alpha, colour = "190,226,255", lineScale = 0.52) {
  const points = 72;
  context.beginPath();
  for (let index = 0; index <= points; index += 1) {
    const angle = index / points * Math.PI * 2;
    const [x, y] = shellPoint(state, angle, z, scale, index);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.strokeStyle = `rgba(${colour},${alpha})`;
  context.lineWidth = Math.max(1, state.ratio * lineScale);
  context.stroke();
}

function drawDepthRing(context, state, xPosition, scale, alpha, colour = "116,208,255") {
  const points = 52;
  context.beginPath();
  for (let index = 0; index <= points; index += 1) {
    const angle = index / points * Math.PI * 2;
    const y = Math.sin(angle) * scale;
    const z = Math.cos(angle) * scale;
    const [x, py] = projectPoint(state, xPosition, y, z, index);
    if (index === 0) context.moveTo(x, py);
    else context.lineTo(x, py);
  }
  context.closePath();
  context.strokeStyle = `rgba(${colour},${alpha})`;
  context.lineWidth = Math.max(1, state.ratio * 0.55);
  context.stroke();
}

export function drawBackdrop(context, state) {
  const { width, height, centerX, centerY, mapped, pressure, coherence, depthSpan } = state;
  const spectralGlow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(width, height) * 0.58);
  spectralGlow.addColorStop(0, `rgba(232,246,255,${0.035 + mapped.bodyStrength * 0.055})`);
  spectralGlow.addColorStop(0.2, `rgba(116,208,255,${0.045 + mapped.brilliance * 0.075})`);
  spectralGlow.addColorStop(0.48, `rgba(127,136,255,${0.02 + mapped.phaseDisagreement * 0.055})`);
  spectralGlow.addColorStop(0.76, `rgba(211,203,255,${0.009 + mapped.afterimage * 0.025})`);
  spectralGlow.addColorStop(1, "rgba(7,7,12,0)");
  context.fillStyle = spectralGlow;
  context.fillRect(0, 0, width, height);

  context.save();
  const horizon = centerY + depthSpan * 0.54;
  context.lineWidth = 1;
  for (let column = 0; column <= 18; column += 1) {
    const p = column / 18;
    const x = width * (0.04 + p * 0.92);
    context.beginPath();
    context.moveTo(centerX, centerY - depthSpan * 0.12);
    context.lineTo(x, height * 0.95);
    context.strokeStyle = `rgba(116,208,255,${0.009 + (column % 3 === 0 ? 0.01 : 0)})`;
    context.stroke();
  }
  for (let row = 0; row <= 8; row += 1) {
    const p = row / 8;
    const y = horizon + (height * 0.46) * (p ** 1.65);
    const spread = width * (0.04 + p * 0.5);
    context.beginPath();
    context.moveTo(centerX - spread, y);
    context.lineTo(centerX + spread, y);
    context.strokeStyle = `rgba(190,226,255,${0.01 + p * 0.016})`;
    context.stroke();
  }
  context.restore();

  const vignette = context.createRadialGradient(centerX, centerY, Math.min(width, height) * 0.22, centerX, centerY, Math.max(width, height) * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, `rgba(0,0,0,${0.36 + pressure * 0.15 + (1 - coherence) * 0.08})`);
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

export function drawAfterimages(context, state) {
  const { mapped, phase, art } = state;
  if (mapped.afterimage < 0.025) return;
  const count = 2 + Math.round(mapped.afterimage * 4);
  context.save();
  context.globalCompositeOperation = "screen";
  for (let index = count; index >= 1; index -= 1) {
    const alpha = mapped.afterimage * (0.022 / index) + art.recovery * 0.004;
    const z = -0.9 + index * (1.8 / Math.max(1, count));
    context.save();
    context.translate(-Math.cos(phase * 0.1) * index * state.ratio * 4.2, Math.sin(phase * 0.08) * index * state.ratio * 2.2);
    drawShell(context, state, z, 0.9 + index * 0.018, alpha, index % 2 ? "127,136,255" : "116,208,255", 0.45);
    context.restore();
  }
  context.restore();
}

export function drawSpectralBody(context, state) {
  const { centerX, centerY, mapped, coherence, pressure, ratio, signature, deformation, phase } = state;
  context.save();
  context.globalCompositeOperation = "screen";

  const coreRadius = Math.min(state.radiusY, state.depthSpan) * (0.32 + mapped.bodyStrength * 0.12);
  const core = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreRadius * 2.8);
  core.addColorStop(0, "rgba(4,7,12,0.12)");
  core.addColorStop(0.18, `rgba(244,250,255,${0.06 + mapped.bodyStrength * 0.08})`);
  core.addColorStop(0.44, `rgba(116,208,255,${0.045 + mapped.brilliance * 0.09})`);
  core.addColorStop(0.72, `rgba(127,136,255,${0.014 + pressure * 0.045})`);
  core.addColorStop(1, "rgba(7,7,12,0)");
  context.fillStyle = core;
  context.fillRect(centerX - coreRadius * 3, centerY - coreRadius * 3, coreRadius * 6, coreRadius * 6);

  const apertureScale = 0.23 + mapped.aperture * 0.13 + (signature.apertureOpen ? 0.05 : 0);
  for (let ring = 5; ring >= 0; ring -= 1) {
    const alpha = (0.035 + mapped.aperture * 0.055 + coherence * 0.018) * (1 - ring * 0.075);
    drawDepthRing(context, state, deformation * 0.035 * Math.sin(phase * 0.21 + ring), apertureScale * (0.78 + ring * 0.052), alpha, ring % 2 ? "211,203,255" : "116,208,255");
  }

  const blades = 10;
  for (let blade = 0; blade < blades; blade += 1) {
    const angle = blade / blades * Math.PI * 2 + phase * 0.018;
    const z = Math.sin(angle * 2 + phase * 0.06) * 0.44;
    const inner = projectPoint(state, Math.cos(angle) * apertureScale * 0.12, Math.sin(angle) * apertureScale * 0.52, z, blade);
    const outer = projectPoint(state, Math.cos(angle + 0.3) * apertureScale * 0.55, Math.sin(angle + 0.3) * apertureScale * 1.65, z * 0.4, blade + 10);
    context.beginPath();
    context.moveTo(inner[0], inner[1]);
    context.quadraticCurveTo(centerX + Math.cos(angle + 0.16) * coreRadius * 1.2, centerY + Math.sin(angle + 0.16) * coreRadius * 1.5, outer[0], outer[1]);
    context.strokeStyle = `rgba(190,226,255,${0.025 + mapped.aperture * 0.055 + coherence * 0.02})`;
    context.lineWidth = Math.max(1, ratio * 0.52);
    context.stroke();
  }
  context.restore();
}

export function drawLattice(context, state) {
  const { coherence, mapped, pressure, deformation, ratio, phase } = state;
  const slices = [-1, -0.66, -0.33, 0, 0.33, 0.66, 1];
  context.save();

  slices.forEach((z, sliceIndex) => {
    const depthFade = 0.58 + (1 - Math.abs(z)) * 0.42;
    const alpha = (0.026 + coherence * 0.055 + mapped.brilliance * 0.012) * depthFade;
    drawShell(context, state, z, 0.94 - Math.abs(z) * 0.035, alpha, sliceIndex % 2 ? "190,226,255" : "116,208,255", sliceIndex === 3 ? 0.72 : 0.48);
  });

  const ribs = 18;
  for (let rib = 0; rib < ribs; rib += 1) {
    const angle = rib / ribs * Math.PI * 2 + state.seedPhase * 0.07;
    context.beginPath();
    slices.forEach((z, sliceIndex) => {
      const fractureOffset = deformation > 0.45 && rib % 5 === 0
        ? Math.sin(phase * 0.18 + rib) * deformation * 0.045 * (sliceIndex - 3)
        : 0;
      const [x, y] = shellPoint(state, angle + fractureOffset, z, 0.94 - Math.abs(z) * 0.035, rib + sliceIndex * 20);
      if (sliceIndex === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = `rgba(190,226,255,${0.012 + coherence * 0.03 + (rib % 3 === 0 ? 0.012 : 0)})`;
    context.lineWidth = Math.max(1, ratio * 0.45);
    context.stroke();
  }

  for (let brace = 0; brace < 9; brace += 1) {
    const angleA = brace / 9 * Math.PI * 2;
    const angleB = angleA + Math.PI * (0.38 + pressure * 0.05);
    const a = shellPoint(state, angleA, -0.92, 0.9, brace);
    const b = shellPoint(state, angleB, 0.92, 0.9, brace + 50);
    context.beginPath();
    context.moveTo(a[0], a[1]);
    context.lineTo(b[0], b[1]);
    context.strokeStyle = `rgba(127,136,255,${0.01 + mapped.phaseDisagreement * 0.028 + coherence * 0.012})`;
    context.stroke();
  }

  context.restore();
}

export function drawPressureMembranes(context, state) {
  const { pressure, art, mapped, deformation } = state;
  const membraneStrength = clamp(pressure * 0.56 + art.disturbance * 0.5 + mapped.phaseDisagreement * 0.2);
  if (membraneStrength < 0.08) return;

  context.save();
  context.globalCompositeOperation = "screen";
  const planes = 2 + Math.round(membraneStrength * 2);
  for (let plane = 0; plane < planes; plane += 1) {
    const xBias = -0.42 + plane * (0.84 / Math.max(1, planes - 1));
    const zBias = -0.62 + plane * 0.52;
    const lean = art.direction * art.propagation * 0.14 + deformation * 0.06 * (plane % 2 ? -1 : 1);
    const points = [
      projectPoint(state, xBias - 0.22, -0.86, zBias - 0.2, plane),
      projectPoint(state, xBias + 0.24 + lean, -0.72, zBias + 0.35, plane + 4),
      projectPoint(state, xBias + 0.18 - lean, 0.82, zBias + 0.28, plane + 8),
      projectPoint(state, xBias - 0.28, 0.74, zBias - 0.25, plane + 12),
    ];
    context.beginPath();
    points.forEach(([x, y], index) => index === 0 ? context.moveTo(x, y) : context.lineTo(x, y));
    context.closePath();
    const gradient = context.createLinearGradient(points[0][0], points[0][1], points[2][0], points[2][1]);
    gradient.addColorStop(0, "rgba(116,208,255,0)");
    gradient.addColorStop(0.45, `rgba(127,136,255,${0.008 + membraneStrength * 0.024})`);
    gradient.addColorStop(0.7, `rgba(211,203,255,${0.012 + membraneStrength * 0.035})`);
    gradient.addColorStop(1, "rgba(116,208,255,0)");
    context.fillStyle = gradient;
    context.fill();
    context.strokeStyle = `rgba(211,203,255,${0.018 + membraneStrength * 0.055})`;
    context.lineWidth = Math.max(1, state.ratio * 0.42);
    context.stroke();
  }
  context.restore();
}

export function drawSignalFilaments(context, state) {
  const { mapped, selectedMapping, frame, pressure, coherence, phase, ratio, art, deformation } = state;
  const steps = 112;
  for (let trace = 0; trace < FILAMENTS.length; trace += 1) {
    const definition = FILAMENTS[trace];
    const value = clamp(frame.normalised[definition.id]);
    const selected = selectedMapping?.source === definition.id;
    const opacity = selectedMapping ? (selected ? 0.94 : 0.065) : 0.2 + coherence * 0.2 + mapped.brilliance * 0.08;
    const amplitude = 0.06 + value * 0.09 + mapped.phaseDisagreement * 0.06;
    context.beginPath();
    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      const x = -1.04 + t * 2.08;
      const bodyPull = Math.exp(-Math.pow((t - 0.5) / 0.3, 2));
      const lane = definition.lane * (1 - bodyPull * 0.42);
      const wave = Math.sin(t * Math.PI * (4.2 + trace * 0.46) + phase * (0.16 + definition.phase)) * amplitude * (0.38 + bodyPull * 0.62);
      const localFracture = Math.sin(t * Math.PI * 7 + trace) * deformation * bodyPull * 0.045;
      const y = lane + wave + localFracture + pressure * Math.sin(t * Math.PI) * 0.035 * (trace % 2 ? 1 : -1);
      const z = definition.depth + Math.sin(t * Math.PI * 2 + phase * 0.11 + trace) * (0.14 + mapped.phaseDisagreement * 0.16) + art.direction * art.propagation * bodyPull * 0.12;
      const [px, py] = projectPoint(state, x, y, z, index + trace * 140);
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    const [r, g, b] = definition.colour;
    context.strokeStyle = `rgba(${r},${g},${b},${opacity})`;
    context.lineWidth = Math.max(1, ratio * (selected ? 1.55 : 0.72));
    context.shadowBlur = this.reducedMotion ? 0 : ratio * (selected ? 15 : 4 + mapped.brilliance * 6);
    context.shadowColor = `rgba(${r},${g},${b},${selected ? 0.5 : 0.2})`;
    context.stroke();
  }
  context.shadowBlur = 0;
}

export function drawMicrostructure(context, state) {
  const { width, height, mapped, pressure, ratio, art, deformation } = state;
  const seed = state.seedPhase * 10000 + Math.round(mapped.microstructure * 97) + Math.round(pressure * 131);
  const count = Math.min(180, 34 + Math.round(mapped.microstructure * 92 + mapped.granularFracture * 34 + art.disturbance * 24));
  context.save();
  context.globalCompositeOperation = "screen";
  for (let index = 0; index < count; index += 1) {
    const x = deterministicUnit(seed, index * 3) * 1.88 - 0.94;
    const y = deterministicUnit(seed * 1.7, index * 3 + 1) * 1.58 - 0.79;
    const z = deterministicUnit(seed * 2.3, index * 3 + 2) * 1.8 - 0.9;
    const [px, py] = projectPoint(state, x, y, z, index);
    if (px < 0 || px > width || py < 0 || py > height) continue;
    const depthScale = 0.65 + (z + 1) * 0.25;
    const size = ratio * depthScale * (0.75 + deterministicUnit(seed * 3.1, index + 9) * 1.4 + deformation * 0.65);
    const alpha = 0.024 + mapped.microstructure * 0.065 + pressure * 0.024;
    context.save();
    context.translate(px, py);
    context.rotate(Math.PI * 0.25 + z * 0.3 + index * 0.07);
    context.fillStyle = index % 5 === 0 ? `rgba(211,203,255,${alpha})` : `rgba(116,208,255,${alpha})`;
    context.fillRect(-size * 0.5, -size * 0.5, size, size);
    context.restore();
  }
  context.restore();
}

export function drawCausalPropagation(context, state) {
  const { art, mapped, ratio, phase } = state;
  if (art.propagation < 0.05) return;
  const frontCount = 2 + Math.round(art.propagation * 3);
  context.save();
  context.globalCompositeOperation = "screen";
  for (let front = 0; front < frontCount; front += 1) {
    const shift = front / Math.max(1, frontCount - 1) * 0.42;
    const progress = clamp(art.propagation * 1.28 - shift);
    if (progress <= 0.02) continue;
    const x = -0.92 + progress * 1.84;
    const scale = 0.68 + mapped.displacement * 0.13 + art.disturbance * 0.08;
    const alpha = 0.035 + art.disturbance * 0.13 * (1 - front / (frontCount + 1));
    drawDepthRing(context, state, x, scale, alpha, front % 2 ? "211,203,255" : "116,208,255");
  }
  if (!this.reducedMotion) {
    const pulseX = -0.92 + clamp(art.propagation + Math.sin(phase * 0.18) * 0.035) * 1.84;
    drawDepthRing(context, state, pulseX, 0.76, 0.04 + art.disturbance * 0.09, "127,136,255");
  }
  context.restore();
  context.shadowBlur = 0;
  context.lineWidth = Math.max(1, ratio * 0.5);
}

export function drawPulseEmissions(context, state) {
  const { mapped, phase } = state;
  const cycle = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
  const rings = 2 + Math.round(mapped.emissionRate * 3);
  context.save();
  for (let ring = 0; ring < rings; ring += 1) {
    const progress = (cycle + ring / rings) % 1;
    const alpha = (1 - progress) * (0.012 + mapped.displacement * 0.07);
    if (alpha < 0.005) continue;
    drawDepthRing(context, state, 0, 0.18 + progress * 0.72, alpha, "116,208,255");
  }
  context.restore();
}

export function drawFracture(context, state) {
  const { pressure, cacheDisruption, mapped, phase, ratio, fractureScale, art, signature } = state;
  const fracture = clamp((pressure * 0.48 + cacheDisruption * 0.24 + mapped.granularFracture * 0.32 + art.fractureBias * 0.62) * fractureScale);
  if (fracture < 0.1) return;
  const count = 2 + Math.round(fracture * 5);
  const seed = state.seedPhase * 23000 + Math.round(fracture * 1000);
  context.save();
  context.globalCompositeOperation = "screen";
  for (let plane = 0; plane < count; plane += 1) {
    const anchor = deterministicUnit(seed, plane) * 1.4 - 0.7;
    const depth = deterministicUnit(seed * 1.7, plane + 7) * 1.4 - 0.7;
    const lean = (deterministicUnit(seed * 2.1, plane + 13) - 0.5) * 0.58 * fracture;
    const steps = 7;
    context.beginPath();
    for (let step = 0; step <= steps; step += 1) {
      const p = step / steps;
      const y = -0.94 + p * 1.88;
      const fork = Math.sin(p * Math.PI * (2 + plane % 3) + phase * 0.08 + plane) * fracture * 0.08;
      const x = anchor + lean * (p - 0.5) + fork;
      const z = depth + Math.cos(p * Math.PI * 2 + plane) * fracture * 0.12;
      const [px, py] = projectPoint(state, x, y, z, step + plane * 20);
      if (step === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.strokeStyle = `rgba(211,203,255,${0.045 + fracture * 0.2})`;
    context.lineWidth = Math.max(1, ratio * (signature.fracturePlane ? 0.8 : 0.56));
    context.shadowBlur = this.reducedMotion ? 0 : ratio * fracture * 5;
    context.shadowColor = "rgba(127,136,255,0.28)";
    context.stroke();
  }
  context.restore();
  context.shadowBlur = 0;
}

export function drawSignatureMoments(context, state) {
  const { signature, mapped, coherence, deformation, phase, ratio, art } = state;
  context.save();
  context.globalCompositeOperation = "screen";

  if (signature.apertureOpen) {
    const openPulse = this.reducedMotion ? 1 : 0.88 + Math.sin(phase * 0.24) * 0.12;
    drawDepthRing(context, state, 0, 0.38 + mapped.aperture * 0.16, (0.055 + mapped.brilliance * 0.06) * openPulse, "232,246,255");
  }

  if (signature.latticeSnap) {
    const snap = Math.sin(phase * 0.31) > 0.55 ? 1 : 0.42;
    drawShell(context, state, -0.08 - deformation * 0.16, 0.98, 0.035 + deformation * 0.075 * snap, "211,203,255", 0.86);
    drawShell(context, state, 0.12 + deformation * 0.14, 0.91, 0.025 + deformation * 0.055 * snap, "127,136,255", 0.72);
  }

  if (signature.phaseSlip) {
    const slip = projectPoint(state, 0.22, -0.82, 0.74, 4);
    const slipEnd = projectPoint(state, -0.08, 0.88, -0.68, 8);
    context.beginPath();
    context.moveTo(slip[0], slip[1]);
    context.lineTo(slipEnd[0], slipEnd[1]);
    context.strokeStyle = `rgba(127,136,255,${0.035 + mapped.phaseDisagreement * 0.11})`;
    context.lineWidth = Math.max(1, ratio * 0.8);
    context.stroke();
  }

  if (signature.reformation) {
    const bloom = this.reducedMotion ? 0.72 : ((phase * 0.08) % 1 + 1) % 1;
    drawDepthRing(context, state, 0, 0.34 + bloom * 0.56, (1 - bloom) * (0.025 + art.recovery * 0.065), "232,246,255");
  }

  if (signature.propagationWave && art.disturbance > 0.25) {
    const wave = clamp(art.propagation * 1.08);
    drawDepthRing(context, state, -0.9 + wave * 1.8, 0.78, 0.02 + art.disturbance * 0.065, "211,203,255");
  }

  if (coherence < 0.42) {
    drawShell(context, state, 0.54, 0.82, 0.018 + (1 - coherence) * 0.045, "211,203,255", 0.58);
  }

  context.restore();
}

export function drawSelectedRoute(context, state) {
  const { selectedMapping, selectedCalculation, frame, routeFocus, ratio, mapped } = state;
  const source = clamp(frame.normalised[selectedMapping.source]);
  const transformed = clamp(selectedCalculation.transformed);
  const steps = 108;
  context.save();
  context.globalCompositeOperation = "screen";
  context.beginPath();
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const x = -1.04 + t * 2.08;
    const envelope = Math.sin(t * Math.PI);
    const y = (source - 0.5) * 0.9 * (1 - t) + (transformed - 0.5) * 0.9 * t + Math.sin(t * Math.PI * 3) * mapped.displacement * 0.055 * envelope;
    const z = -0.62 + t * 1.24 + Math.sin(t * Math.PI * 2) * mapped.phaseDisagreement * 0.16;
    const [px, py] = projectPoint(state, x, y, z, index + 900);
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.strokeStyle = `rgba(245,166,35,${routeFocus ? 0.96 : 0.72})`;
  context.lineWidth = Math.max(1, ratio * (routeFocus ? 1.7 : 1.08));
  context.shadowBlur = this.reducedMotion ? 0 : ratio * (routeFocus ? 17 : 9);
  context.shadowColor = "rgba(245,166,35,0.56)";
  context.stroke();
  context.shadowBlur = 0;

  const focusX = 0.25 + transformed * 0.28;
  const focusY = (transformed - 0.5) * 0.42;
  const focusZ = 0.18 + source * 0.44;
  const [fx, fy] = projectPoint(state, focusX, focusY, focusZ, 1040);
  const halo = context.createRadialGradient(fx, fy, 0, fx, fy, ratio * (22 + mapped.displacement * 30));
  halo.addColorStop(0, `rgba(245,166,35,${routeFocus ? 0.15 : 0.08})`);
  halo.addColorStop(1, "rgba(245,166,35,0)");
  context.fillStyle = halo;
  context.beginPath();
  context.arc(fx, fy, ratio * (22 + mapped.displacement * 30), 0, Math.PI * 2);
  context.fill();

  const localScale = 0.18 + mapped.displacement * 0.08;
  for (let ring = 0; ring < 4; ring += 1) {
    const depth = focusZ - 0.22 + ring * 0.14;
    const alpha = (routeFocus ? 0.14 : 0.07) * (1 - ring * 0.16);
    context.beginPath();
    for (let point = 0; point <= 28; point += 1) {
      const angle = point / 28 * Math.PI * 2;
      const x = focusX + Math.cos(angle) * localScale * (1 + ring * 0.08);
      const y = focusY + Math.sin(angle) * localScale * 0.58;
      const [px, py] = projectPoint(state, x, y, depth, point + ring * 40 + 1100);
      if (point === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.strokeStyle = `rgba(245,166,35,${alpha})`;
    context.lineWidth = Math.max(1, ratio * 0.6);
    context.stroke();
  }

  context.restore();
}