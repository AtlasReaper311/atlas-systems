"use strict";

import { clamp } from "./domain.js";
import { deterministicUnit } from "./spectral-field-model.js";

const SIGNALS = Object.freeze([
  Object.freeze({ id: "request_rate", colour: [116, 208, 255], lane: -0.34, depth: -0.66, phase: 0.11 }),
  Object.freeze({ id: "latency_ms", colour: [127, 136, 255], lane: -0.16, depth: -0.3, phase: 0.29 }),
  Object.freeze({ id: "error_rate", colour: [211, 203, 255], lane: 0.03, depth: 0.02, phase: 0.47 }),
  Object.freeze({ id: "cache_hit_rate", colour: [159, 221, 255], lane: 0.23, depth: 0.34, phase: 0.63 }),
  Object.freeze({ id: "anomaly_score", colour: [184, 180, 255], lane: 0.4, depth: 0.66, phase: 0.81 }),
]);

const SLICE_DEPTHS = Object.freeze([-1, -0.72, -0.44, -0.16, 0.16, 0.44, 0.72, 1]);
const BODY_SEGMENTS = 14;

function rgba(colour, alpha) {
  return `rgba(${colour[0]},${colour[1]},${colour[2]},${alpha})`;
}

function projectPoint(state, x, y, z, index = 0) {
  const { centerX, centerY, radiusX, radiusY, depthSpan, tilt, torsion, deformation, asymmetry, phase, art, breathing } = state;
  const breath = 0.965 + breathing * 0.075;
  const depthScale = 1 + z * 0.105;
  const twist = torsion * z * 1.8 + Math.sin(phase * 0.11 + index * 0.37) * deformation * 0.045;
  const cos = Math.cos(twist);
  const sin = Math.sin(twist);
  const localX = (x * cos - y * sin) * breath;
  const localY = (x * sin + y * cos) * breath;
  const fracture = deformation * Math.sin((x * 2.9 + y * 3.6 + z * 2.4) * Math.PI + phase * 0.19) * 0.065;
  const pressureLean = art.direction * art.propagation * (1 - Math.min(1, Math.abs(x))) * 0.085;
  const depthDrift = z * depthSpan * (0.5 + asymmetry * 0.11);
  const px = centerX
    + localX * radiusX * depthScale
    + depthDrift
    + (fracture - pressureLean) * radiusX;
  const py = centerY
    + localY * radiusY * (1 - z * 0.08)
    - z * depthSpan * 0.2
    + x * tilt * radiusY * 0.56
    + fracture * radiusY * 0.82;
  return [px, py];
}

function bodyPoint(state, angle, z, scale = 1, index = 0) {
  const { mapped, art, deformation, pressure, phase } = state;
  const facets = Math.sin(angle * 7 + z * 3.4 + phase * 0.07) * (0.024 + mapped.microstructure * 0.034);
  const secondary = Math.cos(angle * 3 - z * 2.1 + phase * 0.05) * deformation * 0.04;
  const aperture = 0.9 + mapped.aperture * 0.13;
  const compression = 1 - art.compression * art.disturbance * Math.max(0, Math.cos(angle)) * 0.08;
  const stretch = 1 + art.stretch * Math.abs(Math.sin(angle)) * 0.11;
  const sidePressure = 1 - pressure * 0.035 * Math.max(0, Math.sin(angle + art.direction));
  const x = Math.cos(angle) * scale * aperture * compression * sidePressure * (1 + facets);
  const y = Math.sin(angle) * scale * stretch * (1 + secondary);
  return projectPoint(state, x, y, z, index);
}

function bodySlice(state, z, scale = 1, offset = 0) {
  const points = [];
  for (let index = 0; index < BODY_SEGMENTS; index += 1) {
    const angle = index / BODY_SEGMENTS * Math.PI * 2 + offset;
    points.push(bodyPoint(state, angle, z, scale, index));
  }
  return points;
}

function polygonPath(context, points) {
  if (!points.length) return;
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) context.lineTo(points[index][0], points[index][1]);
  context.closePath();
}

function drawSlice(context, state, z, scale, alpha, colour = [116, 208, 255], lineAlpha = 0.18) {
  const points = bodySlice(state, z, scale, z * 0.08 + state.phase * 0.006);
  polygonPath(context, points);
  const gradient = context.createRadialGradient(
    state.centerX + z * state.depthSpan * 0.15,
    state.centerY - z * state.depthSpan * 0.05,
    0,
    state.centerX,
    state.centerY,
    Math.max(state.radiusX, state.radiusY) * 1.1,
  );
  gradient.addColorStop(0, rgba(colour, alpha * 1.8));
  gradient.addColorStop(0.5, rgba(colour, alpha));
  gradient.addColorStop(1, rgba(colour, alpha * 0.12));
  context.fillStyle = gradient;
  context.fill();
  context.strokeStyle = rgba(colour, lineAlpha);
  context.lineWidth = Math.max(1, state.ratio * 0.56);
  context.stroke();
  return points;
}

function drawDepthRing(context, state, xPosition, scale, alpha, colour = [116, 208, 255], width = 0.7) {
  const points = 64;
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
  context.strokeStyle = rgba(colour, alpha);
  context.lineWidth = Math.max(1, state.ratio * width);
  context.stroke();
}

function signalPoint(state, definition, value, traceIndex, t, index) {
  const bodyPull = Math.exp(-Math.pow((t - 0.5) / 0.27, 2));
  const amplitude = 0.055 + value * 0.095 + state.mapped.phaseDisagreement * 0.075;
  const x = -1.08 + t * 2.16;
  const lane = definition.lane * (1 - bodyPull * 0.5);
  const oscillation = Math.sin(t * Math.PI * (3.6 + traceIndex * 0.54) + state.phase * (0.14 + definition.phase)) * amplitude * (0.32 + bodyPull * 0.68);
  const distortion = Math.sin(t * Math.PI * 7 + traceIndex * 0.9) * state.deformation * bodyPull * 0.06;
  const y = lane + oscillation + distortion + state.pressure * Math.sin(t * Math.PI) * 0.045 * (traceIndex % 2 ? 1 : -1);
  const z = definition.depth
    + Math.sin(t * Math.PI * 2 + state.phase * 0.095 + traceIndex) * (0.13 + state.mapped.phaseDisagreement * 0.2)
    + state.art.direction * state.art.propagation * bodyPull * 0.16;
  return projectPoint(state, x, y, z, index + traceIndex * 180);
}

function signalPath(state, definition, traceIndex) {
  const value = clamp(state.frame.normalised[definition.id]);
  const points = [];
  const steps = 120;
  for (let index = 0; index <= steps; index += 1) {
    points.push(signalPoint(state, definition, value, traceIndex, index / steps, index));
  }
  return { points, value };
}

function strokePath(context, points, colour, alpha, width, blur = 0) {
  if (!points.length) return;
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) context.lineTo(points[index][0], points[index][1]);
  context.strokeStyle = rgba(colour, alpha);
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowBlur = blur;
  context.shadowColor = rgba(colour, Math.min(0.7, alpha));
  context.stroke();
  context.shadowBlur = 0;
}

export function drawBackdrop(context, state) {
  const { width, height, centerX, centerY, mapped, pressure, coherence, depthSpan } = state;
  const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(width, height) * 0.68);
  glow.addColorStop(0, `rgba(224,245,255,${0.055 + mapped.bodyStrength * 0.07})`);
  glow.addColorStop(0.24, `rgba(116,208,255,${0.06 + mapped.brilliance * 0.08})`);
  glow.addColorStop(0.52, `rgba(127,136,255,${0.026 + mapped.phaseDisagreement * 0.07})`);
  glow.addColorStop(0.82, `rgba(211,203,255,${0.012 + mapped.afterimage * 0.035})`);
  glow.addColorStop(1, "rgba(6,6,11,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  context.save();
  context.lineWidth = 1;
  const horizon = centerY + depthSpan * 0.7;
  for (let ray = 0; ray <= 20; ray += 1) {
    const p = ray / 20;
    const x = width * (0.025 + p * 0.95);
    context.beginPath();
    context.moveTo(centerX, centerY - depthSpan * 0.12);
    context.lineTo(x, height * 0.98);
    context.strokeStyle = `rgba(116,208,255,${0.008 + (ray % 4 === 0 ? 0.013 : 0)})`;
    context.stroke();
  }
  for (let row = 0; row <= 9; row += 1) {
    const p = row / 9;
    const y = horizon + height * 0.42 * (p ** 1.7);
    const spread = width * (0.05 + p * 0.51);
    context.beginPath();
    context.moveTo(centerX - spread, y);
    context.lineTo(centerX + spread, y);
    context.strokeStyle = `rgba(190,226,255,${0.009 + p * 0.018})`;
    context.stroke();
  }
  context.restore();

  const vignette = context.createRadialGradient(centerX, centerY, Math.min(width, height) * 0.24, centerX, centerY, Math.max(width, height) * 0.74);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, `rgba(0,0,0,${0.25 + pressure * 0.16 + (1 - coherence) * 0.08})`);
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

export function drawAfterimages(context, state) {
  const { mapped, phase, art } = state;
  const strength = clamp(mapped.afterimage * 0.8 + art.recovery * 0.22 + state.deformation * 0.08);
  if (strength < 0.035) return;
  const count = 2 + Math.round(strength * 3);
  context.save();
  context.globalCompositeOperation = "screen";
  for (let index = count; index >= 1; index -= 1) {
    const driftX = Math.cos(phase * 0.11) * index * state.ratio * 4.5;
    const driftY = Math.sin(phase * 0.09) * index * state.ratio * 2.8;
    context.save();
    context.translate(-driftX, driftY);
    drawSlice(context, state, -0.6 + index * 0.34, 0.97 + index * 0.014, strength * 0.014 / index, [127, 136, 255], strength * 0.04 / index);
    context.restore();
  }
  context.restore();
}

export function drawSpectralBody(context, state) {
  const { mapped, coherence, pressure, deformation, signature, centerX, centerY, radiusX, radiusY } = state;
  const slices = SLICE_DEPTHS.map((z, index) => ({
    z,
    points: bodySlice(state, z, 0.93 - Math.abs(z) * 0.035, index * 0.017 + state.phase * 0.005),
  }));

  context.save();
  context.globalCompositeOperation = "screen";

  for (let sliceIndex = 0; sliceIndex < slices.length - 1; sliceIndex += 1) {
    const near = slices[sliceIndex];
    const far = slices[sliceIndex + 1];
    for (let segment = 0; segment < BODY_SEGMENTS; segment += 1) {
      const next = (segment + 1) % BODY_SEGMENTS;
      const face = [near.points[segment], near.points[next], far.points[next], far.points[segment]];
      polygonPath(context, face);
      const depthWeight = 1 - Math.abs((near.z + far.z) * 0.5) * 0.36;
      const activity = 0.035 + mapped.bodyStrength * 0.045 + mapped.brilliance * 0.025 + pressure * 0.018;
      const colour = segment % 3 === 0 ? [127, 136, 255] : segment % 2 === 0 ? [116, 208, 255] : [211, 203, 255];
      context.fillStyle = rgba(colour, activity * depthWeight * (segment % 4 === 0 ? 1.4 : 0.72));
      context.fill();
      if (segment % 2 === 0) {
        context.strokeStyle = rgba(colour, 0.04 + coherence * 0.05 + deformation * 0.025);
        context.lineWidth = Math.max(1, state.ratio * 0.42);
        context.stroke();
      }
    }
  }

  slices.forEach(({ z }, index) => {
    const depthWeight = 0.55 + (1 - Math.abs(z)) * 0.45;
    const colour = index % 2 ? [190, 226, 255] : [116, 208, 255];
    drawSlice(context, state, z, 0.93 - Math.abs(z) * 0.035, (0.018 + mapped.bodyStrength * 0.022) * depthWeight, colour, 0.055 + coherence * 0.06);
  });

  const coreRadius = Math.min(radiusX, radiusY) * (0.34 + mapped.bodyStrength * 0.12);
  const core = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreRadius * 2.7);
  core.addColorStop(0, `rgba(238,250,255,${0.11 + mapped.bodyStrength * 0.09})`);
  core.addColorStop(0.22, `rgba(116,208,255,${0.09 + mapped.brilliance * 0.08})`);
  core.addColorStop(0.5, `rgba(127,136,255,${0.035 + deformation * 0.05})`);
  core.addColorStop(1, "rgba(7,7,12,0)");
  context.fillStyle = core;
  context.fillRect(centerX - coreRadius * 3, centerY - coreRadius * 3, coreRadius * 6, coreRadius * 6);

  const aperture = 0.42 + mapped.aperture * 0.18 + (signature.apertureOpen ? 0.08 : 0);
  for (let ring = 7; ring >= 0; ring -= 1) {
    const progress = ring / 7;
    const scale = aperture * (0.56 + progress * 0.68);
    const alpha = (0.04 + mapped.aperture * 0.065 + coherence * 0.025) * (1 - progress * 0.42);
    drawDepthRing(context, state, (progress - 0.5) * deformation * 0.08, scale, alpha, ring % 2 ? [211, 203, 255] : [116, 208, 255], ring === 0 ? 1.05 : 0.62);
  }

  context.globalCompositeOperation = "source-over";
  const voidGradient = context.createRadialGradient(centerX, centerY, coreRadius * 0.12, centerX, centerY, coreRadius * 0.88);
  voidGradient.addColorStop(0, "rgba(3,4,8,0.94)");
  voidGradient.addColorStop(0.7, "rgba(5,6,11,0.64)");
  voidGradient.addColorStop(1, "rgba(5,6,11,0)");
  context.fillStyle = voidGradient;
  context.beginPath();
  context.ellipse(centerX, centerY, coreRadius * (0.5 + mapped.aperture * 0.15), coreRadius * (0.86 + mapped.aperture * 0.2), state.tilt * 0.7, 0, Math.PI * 2);
  context.fill();

  context.restore();
}

export function drawLattice(context, state) {
  const { coherence, mapped, deformation, phase, ratio } = state;
  context.save();
  context.globalCompositeOperation = "screen";

  const slices = SLICE_DEPTHS.map((z, index) => bodySlice(state, z, 0.93 - Math.abs(z) * 0.035, index * 0.017 + phase * 0.005));
  for (let segment = 0; segment < BODY_SEGMENTS; segment += 1) {
    context.beginPath();
    for (let sliceIndex = 0; sliceIndex < slices.length; sliceIndex += 1) {
      const point = slices[sliceIndex][segment];
      const snap = deformation > 0.44 && segment % 4 === 0
        ? Math.sin(phase * 0.2 + segment) * deformation * state.ratio * 9 * (sliceIndex - slices.length / 2) / slices.length
        : 0;
      if (sliceIndex === 0) context.moveTo(point[0] + snap, point[1] - snap * 0.35);
      else context.lineTo(point[0] + snap, point[1] - snap * 0.35);
    }
    context.strokeStyle = `rgba(190,226,255,${0.035 + coherence * 0.075 + (segment % 3 === 0 ? 0.035 : 0)})`;
    context.lineWidth = Math.max(1, ratio * (segment % 3 === 0 ? 0.78 : 0.48));
    context.stroke();
  }

  for (let brace = 0; brace < 12; brace += 1) {
    const angleA = brace / 12 * Math.PI * 2;
    const angleB = angleA + Math.PI * (0.34 + state.pressure * 0.08);
    const a = bodyPoint(state, angleA, -0.98, 0.91, brace);
    const b = bodyPoint(state, angleB, 0.98, 0.91, brace + 40);
    context.beginPath();
    context.moveTo(a[0], a[1]);
    context.lineTo(b[0], b[1]);
    context.strokeStyle = `rgba(127,136,255,${0.018 + mapped.phaseDisagreement * 0.055 + coherence * 0.018})`;
    context.lineWidth = Math.max(1, ratio * 0.46);
    context.stroke();
  }

  context.restore();
}

export function drawPressureMembranes(context, state) {
  const strength = clamp(state.pressure * 0.58 + state.art.disturbance * 0.48 + state.mapped.phaseDisagreement * 0.24);
  const planes = strength < 0.08 ? 1 : 2 + Math.round(strength * 3);
  context.save();
  context.globalCompositeOperation = "screen";

  for (let plane = 0; plane < planes; plane += 1) {
    const progress = planes === 1 ? 0.5 : plane / (planes - 1);
    const xBias = -0.5 + progress;
    const zBias = -0.72 + progress * 1.44;
    const lean = state.art.direction * state.art.propagation * 0.18 + state.deformation * 0.08 * (plane % 2 ? -1 : 1);
    const points = [
      projectPoint(state, xBias - 0.3, -0.94, zBias - 0.18, plane),
      projectPoint(state, xBias + 0.3 + lean, -0.78, zBias + 0.28, plane + 3),
      projectPoint(state, xBias + 0.2 - lean, 0.88, zBias + 0.32, plane + 7),
      projectPoint(state, xBias - 0.34, 0.72, zBias - 0.24, plane + 11),
    ];
    polygonPath(context, points);
    const gradient = context.createLinearGradient(points[0][0], points[0][1], points[2][0], points[2][1]);
    const baseAlpha = planes === 1 ? 0.018 : 0.025 + strength * 0.055;
    gradient.addColorStop(0, "rgba(116,208,255,0)");
    gradient.addColorStop(0.38, `rgba(127,136,255,${baseAlpha})`);
    gradient.addColorStop(0.68, `rgba(211,203,255,${baseAlpha * 1.4})`);
    gradient.addColorStop(1, "rgba(116,208,255,0)");
    context.fillStyle = gradient;
    context.fill();
    context.strokeStyle = `rgba(211,203,255,${0.025 + strength * 0.08})`;
    context.lineWidth = Math.max(1, state.ratio * 0.52);
    context.stroke();
  }

  context.restore();
}

export function drawSignalFilaments(context, state) {
  const { selectedMapping, coherence, mapped, ratio } = state;
  context.save();
  context.globalCompositeOperation = "screen";

  SIGNALS.forEach((definition, traceIndex) => {
    const { points, value } = signalPath(state, definition, traceIndex);
    const selected = selectedMapping?.source === definition.id;
    const dimmed = Boolean(selectedMapping) && !selected;
    const baseAlpha = dimmed ? 0.3 : 0.46 + coherence * 0.18;
    const alpha = selected ? 0.92 : baseAlpha;
    const haloAlpha = selected ? 0.14 : dimmed ? 0.045 : 0.075 + mapped.brilliance * 0.035;
    const width = ratio * (2.1 + value * 2.7 + (selected ? 1.7 : 0));
    const haloWidth = ratio * (10 + value * 10 + (selected ? 7 : 0));

    strokePath(context, points, definition.colour, haloAlpha, haloWidth, this.reducedMotion ? 0 : ratio * 15);
    strokePath(context, points, definition.colour, alpha, width, this.reducedMotion ? 0 : ratio * (selected ? 12 : 7));
    strokePath(context, points, [235, 249, 255], selected ? 0.5 : dimmed ? 0.08 : 0.19, Math.max(1, ratio * 0.7));

    const nodeSteps = [0.18, 0.36, 0.54, 0.72, 0.88];
    nodeSteps.forEach((t, nodeIndex) => {
      const pointIndex = Math.min(points.length - 1, Math.round(t * (points.length - 1)));
      const [x, y] = points[pointIndex];
      const pulse = this.reducedMotion ? 0.5 : 0.5 + Math.sin(state.phase * 0.22 + traceIndex + nodeIndex * 0.7) * 0.5;
      const radius = ratio * (2.4 + value * 2.2 + pulse * 1.2 + (selected ? 1.4 : 0));
      const halo = context.createRadialGradient(x, y, 0, x, y, radius * 4.2);
      halo.addColorStop(0, rgba(definition.colour, selected ? 0.3 : 0.16));
      halo.addColorStop(1, rgba(definition.colour, 0));
      context.fillStyle = halo;
      context.beginPath();
      context.arc(x, y, radius * 4.2, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = rgba([235, 249, 255], selected ? 0.9 : 0.58);
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    });
  });

  context.restore();
}

export function drawCausalPropagation(context, state) {
  const strength = clamp(state.art.propagation * 0.92 + state.art.disturbance * 0.16);
  if (strength < 0.05) return;
  const fronts = 2 + Math.round(strength * 3);
  context.save();
  context.globalCompositeOperation = "screen";

  for (let front = 0; front < fronts; front += 1) {
    const lag = front / Math.max(1, fronts - 1) * 0.34;
    const progress = clamp(strength * 1.18 - lag);
    if (progress <= 0.02) continue;
    const x = -0.98 + progress * 1.96;
    const scale = 0.72 + state.mapped.displacement * 0.16 + state.art.disturbance * 0.1;
    drawDepthRing(context, state, x, scale, 0.055 + state.art.disturbance * 0.13, front % 2 ? [211, 203, 255] : [116, 208, 255], 0.85);
  }

  context.restore();
}

export function drawPulseEmissions(context, state) {
  const cycle = ((state.phase / (Math.PI * 2)) % 1 + 1) % 1;
  const rings = 2 + Math.round(state.mapped.emissionRate * 4);
  context.save();
  context.globalCompositeOperation = "screen";
  for (let ring = 0; ring < rings; ring += 1) {
    const progress = (cycle + ring / rings) % 1;
    const alpha = (1 - progress) * (0.02 + state.mapped.displacement * 0.08);
    if (alpha < 0.006) continue;
    drawDepthRing(context, state, 0, 0.24 + progress * 0.76, alpha, [116, 208, 255], 0.56);
  }
  context.restore();
}

export function drawMicrostructure(context, state) {
  const { width, height, mapped, pressure, ratio, art, deformation } = state;
  const seed = state.seedPhase * 10000 + Math.round(mapped.microstructure * 97) + Math.round(pressure * 131);
  const count = Math.min(190, 42 + Math.round(mapped.microstructure * 94 + mapped.granularFracture * 36 + art.disturbance * 28));
  context.save();
  context.globalCompositeOperation = "screen";

  for (let index = 0; index < count; index += 1) {
    const x = deterministicUnit(seed, index * 3) * 1.9 - 0.95;
    const y = deterministicUnit(seed * 1.7, index * 3 + 1) * 1.62 - 0.81;
    const z = deterministicUnit(seed * 2.3, index * 3 + 2) * 1.84 - 0.92;
    const [px, py] = projectPoint(state, x, y, z, index);
    if (px < 0 || px > width || py < 0 || py > height) continue;
    const depthScale = 0.6 + (z + 1) * 0.28;
    const size = ratio * depthScale * (0.8 + deterministicUnit(seed * 3.1, index + 9) * 1.7 + deformation * 0.8);
    const alpha = 0.035 + mapped.microstructure * 0.09 + pressure * 0.03;
    context.save();
    context.translate(px, py);
    context.rotate(Math.PI * 0.25 + z * 0.34 + index * 0.07);
    context.fillStyle = index % 5 === 0 ? `rgba(211,203,255,${alpha})` : `rgba(116,208,255,${alpha})`;
    context.fillRect(-size * 0.55, -size * 0.55, size, size);
    context.restore();
  }

  context.restore();
}

export function drawFracture(context, state) {
  const fracture = clamp((state.pressure * 0.46 + state.cacheDisruption * 0.24 + state.mapped.granularFracture * 0.34 + state.art.fractureBias * 0.64) * state.fractureScale);
  if (fracture < 0.11) return;
  const count = 2 + Math.round(fracture * 5);
  const seed = state.seedPhase * 23000 + Math.round(fracture * 1000);

  context.save();
  for (let plane = 0; plane < count; plane += 1) {
    const anchor = deterministicUnit(seed, plane) * 1.3 - 0.65;
    const depth = deterministicUnit(seed * 1.7, plane + 7) * 1.45 - 0.72;
    const lean = (deterministicUnit(seed * 2.1, plane + 13) - 0.5) * 0.62 * fracture;
    const top = projectPoint(state, anchor - lean * 0.5, -0.94, depth - 0.1, plane);
    const topEdge = projectPoint(state, anchor - lean * 0.34 + 0.04 + fracture * 0.035, -0.9, depth + 0.1, plane + 2);
    const bottomEdge = projectPoint(state, anchor + lean * 0.48 - 0.035, 0.92, depth + 0.14, plane + 5);
    const bottom = projectPoint(state, anchor + lean * 0.5, 0.96, depth - 0.12, plane + 7);
    const tear = [top, topEdge, bottomEdge, bottom];
    polygonPath(context, tear);
    context.fillStyle = `rgba(3,3,8,${0.38 + fracture * 0.4})`;
    context.fill();
    context.strokeStyle = `rgba(211,203,255,${0.09 + fracture * 0.28})`;
    context.lineWidth = Math.max(1, state.ratio * (state.signature.fracturePlane ? 1.1 : 0.7));
    context.shadowBlur = this.reducedMotion ? 0 : state.ratio * fracture * 9;
    context.shadowColor = "rgba(127,136,255,0.38)";
    context.stroke();
  }
  context.shadowBlur = 0;
  context.restore();
}

export function drawSignatureMoments(context, state) {
  const { signature, mapped, coherence, deformation, phase, art } = state;
  context.save();
  context.globalCompositeOperation = "screen";

  if (signature.apertureOpen) {
    const pulse = this.reducedMotion ? 1 : 0.88 + Math.sin(phase * 0.24) * 0.12;
    drawDepthRing(context, state, 0, 0.58 + mapped.aperture * 0.18, (0.08 + mapped.brilliance * 0.08) * pulse, [232, 246, 255], 1.05);
  }

  if (signature.latticeSnap) {
    const snap = this.reducedMotion ? 0.72 : Math.sin(phase * 0.31) > 0.52 ? 1 : 0.38;
    drawSlice(context, state, -0.18 - deformation * 0.18, 1.01, 0.035 + deformation * 0.08 * snap, [211, 203, 255], 0.1 + deformation * 0.12);
    drawSlice(context, state, 0.18 + deformation * 0.16, 0.94, 0.026 + deformation * 0.06 * snap, [127, 136, 255], 0.08 + deformation * 0.1);
  }

  if (signature.phaseSlip) {
    const plane = [
      projectPoint(state, -0.18, -0.9, 0.82, 1),
      projectPoint(state, 0.12, -0.82, -0.72, 4),
      projectPoint(state, 0.22, 0.9, -0.62, 7),
      projectPoint(state, -0.12, 0.82, 0.74, 10),
    ];
    polygonPath(context, plane);
    context.fillStyle = `rgba(127,136,255,${0.02 + mapped.phaseDisagreement * 0.07})`;
    context.fill();
    context.strokeStyle = `rgba(211,203,255,${0.055 + mapped.phaseDisagreement * 0.13})`;
    context.lineWidth = Math.max(1, state.ratio * 0.75);
    context.stroke();
  }

  if (signature.reformation) {
    const bloom = this.reducedMotion ? 0.58 : ((phase * 0.08) % 1 + 1) % 1;
    drawDepthRing(context, state, 0, 0.4 + bloom * 0.66, (1 - bloom) * (0.045 + art.recovery * 0.1), [232, 246, 255], 0.9);
  }

  if (signature.propagationWave && art.disturbance > 0.25) {
    const wave = clamp(art.propagation * 1.08);
    drawDepthRing(context, state, -0.94 + wave * 1.88, 0.82, 0.035 + art.disturbance * 0.09, [211, 203, 255], 0.8);
  }

  if (coherence < 0.42) {
    drawSlice(context, state, 0.62, 0.86, 0.028 + (1 - coherence) * 0.07, [211, 203, 255], 0.07 + (1 - coherence) * 0.08);
  }

  context.restore();
}

export function drawSelectedRoute(context, state) {
  const { selectedMapping, selectedCalculation, frame, routeFocus, ratio, mapped } = state;
  const source = clamp(frame.normalised[selectedMapping.source]);
  const transformed = clamp(selectedCalculation.transformed);
  const points = [];
  const steps = 120;

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const x = -1.08 + t * 2.16;
    const envelope = Math.sin(t * Math.PI);
    const y = (source - 0.5) * 0.82 * (1 - t)
      + (transformed - 0.5) * 0.82 * t
      + Math.sin(t * Math.PI * 3) * mapped.displacement * 0.08 * envelope;
    const z = -0.72 + t * 1.44 + Math.sin(t * Math.PI * 2) * mapped.phaseDisagreement * 0.2;
    points.push(projectPoint(state, x, y, z, index + 1000));
  }

  context.save();
  context.globalCompositeOperation = "screen";
  strokePath(context, points, [245, 166, 35], routeFocus ? 0.18 : 0.1, ratio * (routeFocus ? 22 : 14), this.reducedMotion ? 0 : ratio * 18);
  strokePath(context, points, [245, 166, 35], routeFocus ? 0.98 : 0.78, ratio * (routeFocus ? 4.8 : 3.2), this.reducedMotion ? 0 : ratio * 12);
  strokePath(context, points, [255, 230, 184], routeFocus ? 0.7 : 0.42, Math.max(1, ratio * 0.9));

  const focusX = 0.18 + transformed * 0.34;
  const focusY = (transformed - 0.5) * 0.38;
  const focusZ = 0.12 + source * 0.5;
  const chamber = [];
  const chamberScale = 0.2 + mapped.displacement * 0.1;
  for (let index = 0; index < 12; index += 1) {
    const angle = index / 12 * Math.PI * 2;
    chamber.push(projectPoint(
      state,
      focusX + Math.cos(angle) * chamberScale,
      focusY + Math.sin(angle) * chamberScale * 0.72,
      focusZ + Math.sin(angle * 2) * 0.16,
      index + 1300,
    ));
  }
  polygonPath(context, chamber);
  const chamberGradient = context.createRadialGradient(
    state.centerX + state.radiusX * focusX * 0.55,
    state.centerY + state.radiusY * focusY * 0.55,
    0,
    state.centerX,
    state.centerY,
    Math.max(state.radiusX, state.radiusY) * 0.5,
  );
  chamberGradient.addColorStop(0, `rgba(245,166,35,${routeFocus ? 0.18 : 0.1})`);
  chamberGradient.addColorStop(1, "rgba(245,166,35,0.01)");
  context.fillStyle = chamberGradient;
  context.fill();
  context.strokeStyle = `rgba(245,166,35,${routeFocus ? 0.58 : 0.32})`;
  context.lineWidth = Math.max(1, ratio * 0.92);
  context.stroke();

  chamber.forEach(([x, y], index) => {
    if (index % 2) return;
    context.fillStyle = `rgba(255,230,184,${routeFocus ? 0.88 : 0.52})`;
    context.beginPath();
    context.arc(x, y, ratio * (routeFocus ? 2.5 : 1.8), 0, Math.PI * 2);
    context.fill();
  });

  context.restore();
}