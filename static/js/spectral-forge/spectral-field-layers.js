"use strict";

import { clamp } from "./domain.js";
import { deterministicUnit } from "./spectral-field-model.js";

export function drawBackdrop(context, { width, height, centerX, centerY, baseRadius, mapped, pressure, art }) {
  const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius * (1.55 + mapped.lateralSpread * 0.25));
  glow.addColorStop(0, `rgba(116,208,255,${0.045 + mapped.brilliance * 0.07 + art.bloomBias * art.recovery * 0.05})`);
  glow.addColorStop(0.44, `rgba(127,136,255,${0.018 + mapped.phaseDisagreement * 0.05})`);
  glow.addColorStop(0.72, `rgba(211,203,255,${0.006 + mapped.afterimage * 0.018})`);
  glow.addColorStop(1, "rgba(7,7,12,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
  const vignette = context.createRadialGradient(centerX, centerY, Math.min(width, height) * 0.2, centerX, centerY, Math.max(width, height) * 0.68);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, `rgba(0,0,0,${0.36 + pressure * 0.12})`);
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

export function drawAfterimages(context, { centerX, centerY, radiusX, radiusY, mapped, phase, ratio }) {
  if (mapped.afterimage < 0.04) return;
  const count = 1 + Math.round(mapped.afterimage * 4);
  context.save();
  context.globalCompositeOperation = "screen";
  for (let index = count; index >= 1; index -= 1) {
    const offset = index * (4 + mapped.afterimage * 9) * ratio;
    const alpha = mapped.afterimage * (0.045 / index);
    context.beginPath();
    context.ellipse(centerX - Math.cos(phase * 0.13) * offset, centerY + Math.sin(phase * 0.17) * offset * 0.42, radiusX * (0.58 + index * 0.035), radiusY * (0.42 + index * 0.02), phase * 0.015 - index * 0.025, 0, Math.PI * 2);
    context.strokeStyle = `rgba(127,136,255,${alpha})`;
    context.lineWidth = Math.max(1, ratio * 0.55);
    context.stroke();
  }
  context.restore();
}

export function drawSpectralBody(context, { centerX, centerY, radiusX, radiusY, mapped, coherence, pressure, phase, ratio, art }) {
  context.save();
  context.globalCompositeOperation = "screen";
  for (let layer = 6; layer >= 1; layer -= 1) {
    const depth = layer / 6;
    const disagreement = mapped.phaseDisagreement * (1 - depth) * 0.24;
    const wobble = Math.sin(phase * (0.11 + layer * 0.013) + layer * 1.7) * disagreement;
    const rx = radiusX * (0.3 + depth * 0.4) * (1 + wobble * 0.18);
    const ry = radiusY * (0.26 + depth * 0.31) * (1 - wobble * 0.12);
    const rotation = Math.sin(phase * 0.05 + layer) * (0.025 + mapped.phaseDisagreement * 0.11) + art.direction * art.propagation * 0.015;
    const alpha = (0.018 + mapped.bodyStrength * 0.035 + mapped.brilliance * 0.018) * (0.45 + coherence * 0.55) / Math.sqrt(layer);
    const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(rx, ry));
    gradient.addColorStop(0, `rgba(232,246,255,${alpha * 1.5})`);
    gradient.addColorStop(0.42, `rgba(116,208,255,${alpha})`);
    gradient.addColorStop(0.74, `rgba(127,136,255,${alpha * (0.8 + pressure * 0.3)})`);
    gradient.addColorStop(1, "rgba(211,203,255,0)");
    context.save();
    context.translate(centerX, centerY);
    context.rotate(rotation);
    context.scale(1, 0.94 + mapped.aperture * 0.12);
    context.translate(-centerX, -centerY);
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(centerX, centerY, rx, ry, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = `rgba(211,230,255,${0.035 + coherence * 0.055})`;
    context.lineWidth = Math.max(1, ratio * 0.42);
    context.stroke();
    context.restore();
  }
  context.restore();
}

export function drawLattice(context, { centerX, centerY, radiusX, radiusY, pressure, asymmetry, coherence, phase, seedPhase, ratio, mapped, art }) {
  context.save();
  context.translate(centerX, centerY);
  context.rotate(asymmetry * 0.11 * Math.sin(phase * 0.37));
  context.translate(-centerX, -centerY);
  const spokes = 14;
  for (let ring = 1; ring <= 5; ring += 1) {
    context.beginPath();
    for (let index = 0; index <= spokes; index += 1) {
      const angle = (index / spokes) * Math.PI * 2;
      const crystal = Math.sin(angle * (5 + (ring % 2)) + seedPhase + this.visualTime * 0.06) * (pressure * 0.06 + mapped.granularFracture * 0.025);
      const propagationBias = art.direction * art.propagation * Math.cos(angle) * 0.055;
      const x = centerX + Math.cos(angle) * radiusX * (ring / 5) * (1 + crystal - propagationBias);
      const y = centerY + Math.sin(angle) * radiusY * (ring / 5) * (1 + asymmetry * Math.cos(angle) * 0.09 + art.stretch * 0.04);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.strokeStyle = `rgba(190,226,255,${0.025 + coherence * 0.062 - ring * 0.0025})`;
    context.lineWidth = Math.max(1, ratio * 0.48);
    context.stroke();
  }
  for (let spoke = 0; spoke < 7; spoke += 1) {
    const angle = seedPhase + (spoke / 7) * Math.PI * 2;
    context.beginPath();
    context.moveTo(centerX + Math.cos(angle) * radiusX * 0.12, centerY + Math.sin(angle) * radiusY * 0.12);
    context.lineTo(centerX + Math.cos(angle) * radiusX * 0.92, centerY + Math.sin(angle) * radiusY * 0.92);
    context.strokeStyle = `rgba(116,208,255,${0.012 + coherence * 0.026})`;
    context.stroke();
  }
  context.restore();
}

export function drawSignalFilaments(context, { centerX, centerY, radiusX, radiusY, pressure, asymmetry, coherence, phase, ratio, mapped, selectedMapping, frame, scenarioId }) {
  const colours = [[116,208,255],[127,136,255],[211,203,255],[159,221,255],[184,180,255]];
  const signals = ["request_rate","latency_ms","error_rate","cache_hit_rate","anomaly_score"];
  for (let trace = 0; trace < colours.length; trace += 1) {
    const signalId = signals[trace];
    const signal = frame.normalised[signalId];
    const points = 210 + Math.round(mapped.microstructure * 90);
    context.beginPath();
    for (let index = 0; index <= points; index += 1) {
      const t = (index / points) * Math.PI * 2;
      const crystal = 1 + Math.cos(t * (6 + trace)) * (0.025 + mapped.microstructure * 0.04);
      const disagreement = Math.sin(t * (10 + trace * 2) + phase * 0.37) * (mapped.phaseDisagreement + pressure * 0.24) * 0.07;
      const scenarioWarp = scenarioId === "creep" ? Math.sin(t) * frame.normalised.latency_ms * 0.08 : 0;
      const x = centerX + Math.cos(t * (2 + trace * 0.06) + phase * (0.13 + trace * 0.025)) * radiusX * (0.58 + trace * 0.065 + signal * 0.05) * (crystal + disagreement) + Math.sin(t * 5 + phase) * radiusX * mapped.phaseDisagreement * 0.035 - (1 - Math.cos(t)) * asymmetry * radiusX * (trace === 3 ? 0.12 : 0.05);
      const y = centerY + Math.sin(t * (2.8 + trace * 0.17) + phase * (0.09 + mapped.phaseDisagreement * 0.08)) * radiusY * (0.48 + trace * 0.055 + signal * 0.04) * (crystal - disagreement) + Math.cos(t * 7 - phase * 0.22) * radiusY * mapped.phaseDisagreement * 0.05 + scenarioWarp * radiusY;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.closePath();
    const [r,g,b] = colours[trace];
    const selected = selectedMapping?.source === signalId;
    const opacity = selectedMapping ? (selected ? 0.92 : 0.12) : 0.24 + coherence * 0.22 + mapped.brilliance * 0.12;
    context.strokeStyle = `rgba(${r},${g},${b},${opacity})`;
    context.lineWidth = Math.max(1, ratio * (selected ? 1.25 : 0.68));
    context.shadowBlur = this.reducedMotion ? 0 : ratio * (2 + mapped.brilliance * 8);
    context.shadowColor = `rgba(${r},${g},${b},0.24)`;
    context.stroke();
  }
  context.shadowBlur = 0;
}

export function drawMicrostructure(context, { width, height, centerX, centerY, radiusX, radiusY, mapped, pressure, seedPhase, ratio }) {
  const count = Math.min(120, 18 + Math.round(mapped.microstructure * 74 + mapped.granularFracture * 34));
  context.save();
  context.globalCompositeOperation = "screen";
  for (let index = 0; index < count; index += 1) {
    const u = deterministicUnit(seedPhase * 10000, index * 2);
    const v = deterministicUnit(seedPhase * 17000, index * 2 + 1);
    const angle = u * Math.PI * 2;
    const radius = Math.sqrt(v);
    const x = centerX + Math.cos(angle) * radiusX * radius * (0.55 + mapped.lateralSpread * 0.42);
    const y = centerY + Math.sin(angle) * radiusY * radius * 0.72;
    if (x < 0 || x > width || y < 0 || y > height) continue;
    const size = ratio * (0.65 + deterministicUnit(seedPhase * 31000, index + 9) * 1.15 + mapped.granularFracture * 0.8);
    const alpha = 0.035 + mapped.microstructure * 0.08 + pressure * 0.035;
    context.fillStyle = index % 5 === 0 ? `rgba(211,203,255,${alpha})` : `rgba(116,208,255,${alpha})`;
    context.fillRect(x, y, size, size);
  }
  context.restore();
}

export function drawCausalPropagation(context, { width, centerY, radiusY, mapped, art, ratio, scenarioId, phase }) {
  if (art.propagation < 0.06) return;
  const originX = width * (0.12 + art.origin * 0.22);
  const endX = clamp(originX + width * (0.62 * art.propagation), originX, width * 0.88);
  const amplitude = radiusY * (0.08 + mapped.displacement * 0.11 + art.disturbance * 0.06);
  context.save();
  context.beginPath();
  for (let index = 0; index <= 48; index += 1) {
    const p = index / 48;
    const x = originX + (endX - originX) * p;
    const y = centerY + Math.sin(p * Math.PI * (scenarioId === "cascade" ? 6 : 4) + phase * 0.3) * amplitude * Math.sin(p * Math.PI);
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.strokeStyle = `rgba(211,203,255,${0.08 + art.disturbance * 0.22})`;
  context.lineWidth = Math.max(1, ratio * 0.72);
  context.shadowBlur = this.reducedMotion ? 0 : ratio * 6 * art.disturbance;
  context.shadowColor = "rgba(127,136,255,0.32)";
  context.stroke();
  context.shadowBlur = 0;
  const nodeCount = scenarioId === "cascade" ? 5 : 3;
  for (let index = 0; index < nodeCount; index += 1) {
    const p = nodeCount === 1 ? 0 : index / (nodeCount - 1);
    const localProgress = clamp(art.propagation * 1.4 - p * 0.45);
    if (localProgress <= 0.02) continue;
    const x = originX + (endX - originX) * p;
    context.beginPath();
    context.arc(x, centerY, ratio * (3 + localProgress * 5), 0, Math.PI * 2);
    context.strokeStyle = `rgba(116,208,255,${0.08 + localProgress * 0.2})`;
    context.stroke();
  }
  context.restore();
}

export function drawPulseEmissions(context, { centerX, centerY, radiusX, radiusY, mapped, phase, ratio }) {
  const cycle = (phase / (Math.PI * 2)) % 1;
  const rings = 2 + Math.round(mapped.emissionRate * 2);
  context.save();
  for (let ring = 0; ring < rings; ring += 1) {
    const progress = (cycle + ring / rings) % 1;
    const alpha = (1 - progress) * (0.025 + mapped.displacement * 0.11);
    if (alpha < 0.008) continue;
    context.beginPath();
    context.ellipse(centerX, centerY, radiusX * (0.18 + progress * 0.78), radiusY * (0.15 + progress * 0.62), 0, 0, Math.PI * 2);
    context.strokeStyle = `rgba(116,208,255,${alpha})`;
    context.lineWidth = Math.max(1, ratio * 0.55);
    context.stroke();
  }
  context.restore();
}

export function drawFracture(context, { centerX, centerY, radiusX, radiusY, pressure, cacheDisruption, mapped, phase, ratio, seedPhase, fractureScale, art }) {
  const fracture = clamp((pressure * 0.64 + cacheDisruption * 0.28 + mapped.granularFracture * 0.42 + art.fractureBias * art.disturbance) * fractureScale);
  if (fracture < 0.1) return;
  const count = 3 + Math.round(fracture * 11);
  context.save();
  context.lineWidth = Math.max(1, ratio * 0.55);
  for (let index = 0; index < count; index += 1) {
    const angle = seedPhase + (index / count) * Math.PI * 2 + Math.sin(phase * 0.13 + index) * 0.12;
    const inner = 0.36 + deterministicUnit(seedPhase * 23000, index) * 0.18;
    const outer = inner + 0.1 + fracture * 0.19;
    context.beginPath();
    context.moveTo(centerX + Math.cos(angle) * radiusX * inner, centerY + Math.sin(angle) * radiusY * inner);
    const midAngle = angle + (deterministicUnit(seedPhase * 41000, index) - 0.5) * fracture * 0.22;
    context.lineTo(centerX + Math.cos(midAngle) * radiusX * ((inner + outer) * 0.5), centerY + Math.sin(midAngle) * radiusY * ((inner + outer) * 0.5));
    context.lineTo(centerX + Math.cos(angle + fracture * 0.08) * radiusX * outer, centerY + Math.sin(angle - fracture * 0.06) * radiusY * outer);
    context.strokeStyle = `rgba(211,203,255,${0.06 + fracture * 0.22})`;
    context.stroke();
  }
  context.restore();
}

export function drawSelectedRoute(context, { width, centerY, radiusY, selectedMapping, selectedCalculation, frame, routeFocus, ratio, mapped }) {
  const source = frame.normalised[selectedMapping.source];
  const targetY = centerY + (selectedCalculation.transformed - 0.5) * radiusY * 0.42;
  context.shadowBlur = routeFocus ? 14 * ratio : 7 * ratio;
  context.shadowColor = "rgba(245,166,35,0.52)";
  context.strokeStyle = `rgba(245,166,35,${routeFocus ? 0.94 : 0.64})`;
  context.lineWidth = Math.max(1, ratio * (routeFocus ? 1.5 : 0.95));
  context.beginPath();
  context.moveTo(width * 0.035, centerY + (source - 0.5) * radiusY * 0.58);
  context.bezierCurveTo(width * 0.25, centerY, width * 0.7, targetY, width * 0.965, targetY);
  context.stroke();
  context.shadowBlur = 0;
  context.beginPath();
  context.arc(width * 0.965, targetY, ratio * (3 + mapped.displacement * 3), 0, Math.PI * 2);
  context.strokeStyle = "rgba(245,166,35,0.82)";
  context.stroke();
}
