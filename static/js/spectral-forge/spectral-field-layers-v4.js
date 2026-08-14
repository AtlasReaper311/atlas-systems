"use strict";

import { clamp } from "./domain.js";
import { deterministicUnit } from "./spectral-field-model.js";

const FILAMENTS = Object.freeze([
  Object.freeze({ id: "request_rate", colour: [116, 208, 255], lane: -0.34, phase: 0.11 }),
  Object.freeze({ id: "latency_ms", colour: [127, 136, 255], lane: -0.12, phase: 0.29 }),
  Object.freeze({ id: "error_rate", colour: [211, 203, 255], lane: 0.08, phase: 0.47 }),
  Object.freeze({ id: "cache_hit_rate", colour: [159, 221, 255], lane: 0.27, phase: 0.63 }),
  Object.freeze({ id: "anomaly_score", colour: [184, 180, 255], lane: 0.42, phase: 0.81 }),
]);

function contourPoint(centerX, centerY, radiusX, radiusY, angle, layer, mapped, art, phase) {
  const lobes = 6 + layer;
  const interference = Math.sin(angle * lobes + phase * (0.17 + layer * 0.014)) * (0.018 + mapped.phaseDisagreement * 0.06 + art.disturbance * 0.026);
  const aperture = 0.78 + mapped.aperture * 0.34;
  const compression = 1 - art.compression * art.disturbance * 0.11 * Math.max(0, Math.cos(angle));
  const stretch = 1 + art.stretch * 0.14 * Math.abs(Math.sin(angle));
  const x = centerX + Math.cos(angle) * radiusX * aperture * compression * (1 + interference);
  const y = centerY + Math.sin(angle) * radiusY * stretch * (1 - interference * 0.55);
  return [x, y];
}

function drawContour(context, state, layer, scale, alpha) {
  const { centerX, centerY, radiusX, radiusY, mapped, art, phase, ratio } = state;
  const points = 96;
  context.beginPath();
  for (let index = 0; index <= points; index += 1) {
    const angle = index / points * Math.PI * 2;
    const [x, y] = contourPoint(centerX, centerY, radiusX * scale, radiusY * scale, angle, layer, mapped, art, phase);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.strokeStyle = `rgba(211,230,255,${alpha})`;
  context.lineWidth = Math.max(1, ratio * (0.44 + layer * 0.025));
  context.stroke();
}

export function drawBackdrop(context, { width, height, centerX, centerY, baseRadius, mapped, pressure, art }) {
  const spectralGlow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius * (1.72 + mapped.lateralSpread * 0.28));
  spectralGlow.addColorStop(0, `rgba(232,246,255,${0.025 + mapped.bodyStrength * 0.045})`);
  spectralGlow.addColorStop(0.18, `rgba(116,208,255,${0.05 + mapped.brilliance * 0.08 + art.recovery * 0.025})`);
  spectralGlow.addColorStop(0.48, `rgba(127,136,255,${0.018 + mapped.phaseDisagreement * 0.055})`);
  spectralGlow.addColorStop(0.74, `rgba(211,203,255,${0.008 + mapped.afterimage * 0.026})`);
  spectralGlow.addColorStop(1, "rgba(7,7,12,0)");
  context.fillStyle = spectralGlow;
  context.fillRect(0, 0, width, height);

  context.save();
  context.strokeStyle = `rgba(116,208,255,${0.018 + mapped.aperture * 0.014})`;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(width * 0.08, centerY);
  context.lineTo(width * 0.92, centerY);
  context.moveTo(centerX, height * 0.1);
  context.lineTo(centerX, height * 0.9);
  context.stroke();
  context.restore();

  const vignette = context.createRadialGradient(centerX, centerY, Math.min(width, height) * 0.22, centerX, centerY, Math.max(width, height) * 0.74);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, `rgba(0,0,0,${0.4 + pressure * 0.12})`);
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

export function drawAfterimages(context, state) {
  const { centerX, centerY, radiusX, radiusY, mapped, phase, ratio, art } = state;
  if (mapped.afterimage < 0.025) return;
  const count = 2 + Math.round(mapped.afterimage * 5);
  context.save();
  context.globalCompositeOperation = "screen";
  for (let index = count; index >= 1; index -= 1) {
    const drift = index * (3 + mapped.afterimage * 8) * ratio;
    const alpha = mapped.afterimage * (0.032 / index) + art.recovery * 0.008;
    context.save();
    context.translate(-Math.cos(phase * 0.11) * drift, Math.sin(phase * 0.09) * drift * 0.48);
    drawContour(context, { centerX, centerY, radiusX, radiusY, mapped, art, phase, ratio }, index % 4, 0.56 + index * 0.04, alpha);
    context.restore();
  }
  context.restore();
}

export function drawSpectralBody(context, state) {
  const { centerX, centerY, radiusX, radiusY, mapped, coherence, pressure, phase, ratio, art } = state;
  context.save();
  context.globalCompositeOperation = "screen";
  const coreRadius = Math.min(radiusX, radiusY) * (0.16 + mapped.bodyStrength * 0.08);
  const core = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreRadius * 2.4);
  core.addColorStop(0, `rgba(244,250,255,${0.12 + mapped.bodyStrength * 0.18})`);
  core.addColorStop(0.22, `rgba(116,208,255,${0.08 + mapped.brilliance * 0.12})`);
  core.addColorStop(0.68, `rgba(127,136,255,${0.02 + pressure * 0.06})`);
  core.addColorStop(1, "rgba(7,7,12,0)");
  context.fillStyle = core;
  context.fillRect(centerX - coreRadius * 2.5, centerY - coreRadius * 2.5, coreRadius * 5, coreRadius * 5);

  const layers = 9;
  for (let layer = layers; layer >= 1; layer -= 1) {
    const depth = layer / layers;
    const scale = 0.23 + depth * 0.68;
    const alpha = (0.018 + mapped.bodyStrength * 0.045 + mapped.brilliance * 0.018) * (0.45 + coherence * 0.55) / Math.sqrt(layer);
    drawContour(context, state, layer, scale, alpha);
  }

  const irisCount = 8;
  for (let blade = 0; blade < irisCount; blade += 1) {
    const angle = blade / irisCount * Math.PI * 2 + phase * 0.025;
    const inner = 0.14 + mapped.aperture * 0.05;
    const outer = 0.35 + mapped.aperture * 0.2;
    const skew = art.direction * art.propagation * 0.04;
    context.beginPath();
    context.moveTo(centerX + Math.cos(angle + skew) * radiusX * inner, centerY + Math.sin(angle) * radiusY * inner);
    context.quadraticCurveTo(centerX + Math.cos(angle + 0.2) * radiusX * (inner + outer) * 0.55, centerY + Math.sin(angle + 0.2) * radiusY * (inner + outer) * 0.55, centerX + Math.cos(angle + 0.34) * radiusX * outer, centerY + Math.sin(angle + 0.34) * radiusY * outer);
    context.strokeStyle = `rgba(190,226,255,${0.035 + mapped.aperture * 0.055 + coherence * 0.025})`;
    context.lineWidth = Math.max(1, ratio * 0.55);
    context.stroke();
  }
  context.restore();
}

export function drawLattice(context, state) {
  const { centerX, centerY, radiusX, radiusY, pressure, asymmetry, coherence, phase, seedPhase, ratio, mapped, art } = state;
  context.save();
  context.translate(centerX, centerY);
  context.rotate(asymmetry * 0.09 * Math.sin(phase * 0.31));
  context.translate(-centerX, -centerY);
  const spokes = 18;
  for (let ring = 1; ring <= 6; ring += 1) {
    context.beginPath();
    for (let index = 0; index <= spokes; index += 1) {
      const angle = index / spokes * Math.PI * 2;
      const crystalline = Math.sin(angle * (5 + ring % 3) + seedPhase + this.visualTime * 0.045) * (pressure * 0.04 + mapped.granularFracture * 0.035);
      const propagationBias = art.direction * art.propagation * Math.cos(angle) * 0.05;
      const x = centerX + Math.cos(angle) * radiusX * (ring / 6) * (1 + crystalline - propagationBias);
      const y = centerY + Math.sin(angle) * radiusY * (ring / 6) * (1 + asymmetry * Math.cos(angle) * 0.075 + art.stretch * 0.035);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.strokeStyle = `rgba(190,226,255,${0.016 + coherence * 0.052 - ring * 0.0015})`;
    context.lineWidth = Math.max(1, ratio * 0.45);
    context.stroke();
  }
  for (let spoke = 0; spoke < 9; spoke += 1) {
    const angle = seedPhase + spoke / 9 * Math.PI * 2;
    const reach = 0.94 - art.disturbance * deterministicUnit(seedPhase * 9000, spoke) * 0.13;
    context.beginPath();
    context.moveTo(centerX + Math.cos(angle) * radiusX * 0.11, centerY + Math.sin(angle) * radiusY * 0.11);
    context.lineTo(centerX + Math.cos(angle) * radiusX * reach, centerY + Math.sin(angle) * radiusY * reach);
    context.strokeStyle = `rgba(116,208,255,${0.01 + coherence * 0.024})`;
    context.stroke();
  }
  context.restore();
}

export function drawSignalFilaments(context, state) {
  const { width, centerY, radiusY, pressure, coherence, phase, ratio, mapped, selectedMapping, frame, art } = state;
  const startX = width * 0.06;
  const endX = width * 0.94;
  for (let trace = 0; trace < FILAMENTS.length; trace += 1) {
    const definition = FILAMENTS[trace];
    const value = clamp(frame.normalised[definition.id]);
    const selected = selectedMapping?.source === definition.id;
    const opacity = selectedMapping ? (selected ? 0.9 : 0.09) : 0.16 + coherence * 0.18 + mapped.brilliance * 0.08;
    const amplitude = radiusY * (0.08 + value * 0.12 + mapped.phaseDisagreement * 0.08);
    const lane = centerY + definition.lane * radiusY * 0.82;
    const steps = 96;
    context.beginPath();
    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      const x = startX + (endX - startX) * t;
      const bodyPull = Math.exp(-Math.pow((t - 0.5) / 0.24, 2));
      const routeY = lane * (1 - bodyPull * 0.58) + centerY * bodyPull * 0.58;
      const wave = Math.sin(t * Math.PI * (4.5 + trace * 0.45) + phase * (0.18 + definition.phase)) * amplitude * (0.38 + bodyPull * 0.62);
      const pressureDeflection = art.direction * art.propagation * bodyPull * radiusY * (trace - 2) * 0.018;
      const y = routeY + wave + pressureDeflection + Math.sin(t * Math.PI) * pressure * radiusY * 0.025 * (trace % 2 ? 1 : -1);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    const [r, g, b] = definition.colour;
    context.strokeStyle = `rgba(${r},${g},${b},${opacity})`;
    context.lineWidth = Math.max(1, ratio * (selected ? 1.35 : 0.66));
    context.shadowBlur = this.reducedMotion ? 0 : ratio * (selected ? 11 : 3 + mapped.brilliance * 5);
    context.shadowColor = `rgba(${r},${g},${b},${selected ? 0.42 : 0.18})`;
    context.stroke();
  }
  context.shadowBlur = 0;
}

export function drawMicrostructure(context, state) {
  const { width, height, centerX, centerY, radiusX, radiusY, mapped, pressure, seedPhase, ratio, art } = state;
  const count = Math.min(150, 22 + Math.round(mapped.microstructure * 86 + mapped.granularFracture * 36 + art.disturbance * 18));
  context.save();
  context.globalCompositeOperation = "screen";
  for (let index = 0; index < count; index += 1) {
    const u = deterministicUnit(seedPhase * 10000, index * 2);
    const v = deterministicUnit(seedPhase * 17000, index * 2 + 1);
    const angle = u * Math.PI * 2;
    const radius = Math.sqrt(v);
    const x = centerX + Math.cos(angle) * radiusX * radius * (0.48 + mapped.lateralSpread * 0.44);
    const y = centerY + Math.sin(angle) * radiusY * radius * 0.7;
    if (x < 0 || x > width || y < 0 || y > height) continue;
    const size = ratio * (0.7 + deterministicUnit(seedPhase * 31000, index + 9) * 1.35 + mapped.granularFracture * 0.9);
    const alpha = 0.028 + mapped.microstructure * 0.075 + pressure * 0.028;
    context.save();
    context.translate(x, y);
    context.rotate(Math.PI * 0.25 + angle * 0.08);
    context.fillStyle = index % 5 === 0 ? `rgba(211,203,255,${alpha})` : `rgba(116,208,255,${alpha})`;
    context.fillRect(-size * 0.5, -size * 0.5, size, size);
    context.restore();
  }
  context.restore();
}

export function drawCausalPropagation(context, state) {
  const { width, centerY, radiusY, mapped, art, ratio, phase } = state;
  if (art.propagation < 0.05) return;
  const originX = width * (0.08 + art.origin * 0.34);
  const reach = clamp(0.18 + art.propagation * 0.72);
  const endX = originX + (width * 0.88 - originX) * reach;
  const amplitude = radiusY * (0.045 + mapped.displacement * 0.08 + art.disturbance * 0.055);
  context.save();
  context.beginPath();
  for (let index = 0; index <= 64; index += 1) {
    const p = index / 64;
    const x = originX + (endX - originX) * p;
    const envelope = Math.sin(p * Math.PI);
    const y = centerY + Math.sin(p * Math.PI * (4 + art.disturbance * 3) + phase * 0.22) * amplitude * envelope;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.strokeStyle = `rgba(211,203,255,${0.06 + art.disturbance * 0.22})`;
  context.lineWidth = Math.max(1, ratio * 0.72);
  context.shadowBlur = this.reducedMotion ? 0 : ratio * 7 * art.disturbance;
  context.shadowColor = "rgba(127,136,255,0.34)";
  context.stroke();
  context.shadowBlur = 0;
  const nodeCount = 3 + Math.round(art.disturbance * 3);
  for (let index = 0; index < nodeCount; index += 1) {
    const p = nodeCount === 1 ? 0 : index / (nodeCount - 1);
    const localProgress = clamp(art.propagation * 1.45 - p * 0.42);
    if (localProgress <= 0.02) continue;
    const x = originX + (endX - originX) * p;
    context.beginPath();
    context.arc(x, centerY, ratio * (2.5 + localProgress * 5.5), 0, Math.PI * 2);
    context.strokeStyle = `rgba(116,208,255,${0.07 + localProgress * 0.2})`;
    context.stroke();
  }
  context.restore();
}

export function drawPulseEmissions(context, state) {
  const { centerX, centerY, radiusX, radiusY, mapped, phase, ratio } = state;
  const cycle = (phase / (Math.PI * 2)) % 1;
  const rings = 2 + Math.round(mapped.emissionRate * 3);
  context.save();
  for (let ring = 0; ring < rings; ring += 1) {
    const progress = (cycle + ring / rings) % 1;
    const alpha = (1 - progress) * (0.018 + mapped.displacement * 0.1);
    if (alpha < 0.006) continue;
    context.beginPath();
    context.ellipse(centerX, centerY, radiusX * (0.16 + progress * 0.78), radiusY * (0.13 + progress * 0.64), 0, 0, Math.PI * 2);
    context.strokeStyle = `rgba(116,208,255,${alpha})`;
    context.lineWidth = Math.max(1, ratio * 0.5);
    context.stroke();
  }
  context.restore();
}

export function drawFracture(context, state) {
  const { centerX, centerY, radiusX, radiusY, pressure, cacheDisruption, mapped, phase, ratio, seedPhase, fractureScale, art } = state;
  const fracture = clamp((pressure * 0.52 + cacheDisruption * 0.22 + mapped.granularFracture * 0.34 + art.fractureBias * 0.58) * fractureScale);
  if (fracture < 0.08) return;
  const count = 3 + Math.round(fracture * 13);
  context.save();
  context.lineWidth = Math.max(1, ratio * 0.55);
  for (let index = 0; index < count; index += 1) {
    const angle = seedPhase + index / count * Math.PI * 2 + Math.sin(phase * 0.11 + index) * 0.11;
    const inner = 0.3 + deterministicUnit(seedPhase * 23000, index) * 0.22;
    const outer = inner + 0.11 + fracture * 0.22;
    const fork = (deterministicUnit(seedPhase * 41000, index) - 0.5) * fracture * 0.25;
    context.beginPath();
    context.moveTo(centerX + Math.cos(angle) * radiusX * inner, centerY + Math.sin(angle) * radiusY * inner);
    context.lineTo(centerX + Math.cos(angle + fork) * radiusX * ((inner + outer) * 0.55), centerY + Math.sin(angle + fork) * radiusY * ((inner + outer) * 0.55));
    context.lineTo(centerX + Math.cos(angle + fracture * 0.07) * radiusX * outer, centerY + Math.sin(angle - fracture * 0.06) * radiusY * outer);
    context.strokeStyle = `rgba(211,203,255,${0.045 + fracture * 0.24})`;
    context.stroke();
  }
  context.restore();
}

export function drawSelectedRoute(context, state) {
  const { width, centerY, radiusY, selectedMapping, selectedCalculation, frame, routeFocus, ratio, mapped } = state;
  const source = clamp(frame.normalised[selectedMapping.source]);
  const targetY = centerY + (selectedCalculation.transformed - 0.5) * radiusY * 0.42;
  const sourceY = centerY + (source - 0.5) * radiusY * 0.62;
  context.shadowBlur = routeFocus ? 16 * ratio : 8 * ratio;
  context.shadowColor = "rgba(245,166,35,0.54)";
  context.strokeStyle = `rgba(245,166,35,${routeFocus ? 0.96 : 0.68})`;
  context.lineWidth = Math.max(1, ratio * (routeFocus ? 1.55 : 1));
  context.beginPath();
  context.moveTo(width * 0.035, sourceY);
  context.bezierCurveTo(width * 0.25, sourceY, width * 0.38, centerY, width * 0.5, centerY);
  context.bezierCurveTo(width * 0.62, centerY, width * 0.75, targetY, width * 0.965, targetY);
  context.stroke();
  context.shadowBlur = 0;
  context.beginPath();
  context.arc(width * 0.5, centerY, ratio * (3 + mapped.displacement * 4), 0, Math.PI * 2);
  context.strokeStyle = "rgba(245,166,35,0.42)";
  context.stroke();
  context.beginPath();
  context.arc(width * 0.965, targetY, ratio * (3 + mapped.displacement * 3), 0, Math.PI * 2);
  context.strokeStyle = "rgba(245,166,35,0.86)";
  context.stroke();
}