"use strict";

/* PROTOTYPE — FERROFLUID TROUGH (development only).
 *
 * An opaque body sitting in a machined trough. Spikes are the field made
 * physical. Speculars are hard and small. Failure breaks the ridge into
 * islands. No translucent membranes, no coloured traces.
 */

import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { transitionMix } from "../spectral-field-state.js";
import { PALETTE, canvasSize, clamp, rgba, routeBand, unit } from "./proto-core.js";

const SPIKES = 48;

export function draw(timestamp = performance.now()) {
  if (!this.context || !this.state) return;
  this.canvas.dataset.fieldRenderer = "proto-ferro";
  const { width, height, ratio } = canvasSize(this.canvas);
  const context = this.context;
  const { selectedMapping } = this.state;
  const g = deriveFieldGeometry(this.state, this.visualTime, width, height);
  const mix = transitionMix.call(this, timestamp);
  const band = routeBand(selectedMapping);
  const px = (v) => v * ratio;

  context.globalCompositeOperation = "source-over";
  context.fillStyle = "#07070c";
  context.fillRect(0, 0, width, height);
  context.save();
  context.globalAlpha = 0.35 + mix * 0.65;

  const troughTop = height * 0.18;
  const troughBot = height * 0.88;
  const troughLeft = width * 0.04;
  const troughRight = width * 0.96;

  /* Machined trough. */
  context.beginPath();
  context.moveTo(troughLeft, troughTop);
  context.lineTo(troughRight, troughTop);
  context.lineTo(troughRight - width * 0.02, troughBot);
  context.lineTo(troughLeft + width * 0.02, troughBot);
  context.closePath();
  context.fillStyle = rgba([38, 38, 48], 1);
  context.fill();
  context.strokeStyle = rgba(PALETTE.pale, 0.42 + g.mapped.brilliance * 0.22);
  context.lineWidth = px(1.3);
  context.stroke();

  const baseY = troughBot - height * (0.2 + g.mapped.bodyStrength * 0.12);
  const spikeH = height * (0.22 + g.mapped.displacement * 0.32 + g.mapped.aperture * 0.12);
  const spread = 0.12 + g.mapped.lateralSpread * 0.1;
  const disagree = g.mapped.phaseDisagreement;
  const islands = g.health.severity > 0.55 ? 1 + Math.floor(g.art.fractureBias * 3) : 1;

  const surface = [];
  for (let i = 0; i <= SPIKES; i += 1) {
    const t = i / SPIKES;
    const nx = 0.08 + t * 0.84;
    let envelope = Math.exp(-((t - 0.5) ** 2) / (spread * spread * 2.2));
    envelope *= 0.75 + g.breathing * 0.12;
    if (islands > 1) {
      envelope *= 0.35 + 0.65 * Math.abs(Math.sin(t * Math.PI * islands));
    }
    const wobble = Math.sin(t * 18 + g.phase * 0.4 + disagree * 6) * disagree * 0.35;
    const selected = band && nx >= band.x0 && nx <= band.x1 ? 1.18 : 1;
    const h = spikeH * envelope * selected * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * (9 + g.mapped.emissionRate * 10) - g.phase * 0.6)));
    const lean = g.art.direction * 0.015 * width + wobble * width * 0.02;
    surface.push({
      x: nx * width + lean,
      y: baseY - h,
      nx,
      selected: selected > 1,
      h,
    });
  }

  /* Fluid body. */
  context.beginPath();
  context.moveTo(troughLeft + width * 0.03, troughBot - px(6));
  for (const p of surface) context.lineTo(p.x, p.y);
  context.lineTo(troughRight - width * 0.03, troughBot - px(6));
  context.closePath();
  const fluid = context.createLinearGradient(0, troughTop, 0, troughBot);
  fluid.addColorStop(0, rgba([48, 52, 64], 1));
  fluid.addColorStop(0.45, rgba([16, 16, 22], 1));
  fluid.addColorStop(1, rgba([6, 6, 10], 1));
  context.fillStyle = fluid;
  context.fill();

  /* Hard speculars on spike faces that point at the key light. */
  context.fillStyle = rgba(PALETTE.pale, 0.08 + g.mapped.brilliance * 0.22);
  for (let i = 1; i < surface.length; i += 1) {
    const a = surface[i - 1];
    const b = surface[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lit = clamp((-dx * 0.4 + -dy) / (Math.hypot(dx, dy) + 0.001));
    if (lit < 0.35 || b.h < spikeH * 0.12) continue;
    const colour = b.selected || a.selected ? PALETTE.amber : PALETTE.pale;
    context.fillStyle = rgba(colour, 0.2 + (lit - 0.35) * 0.85);
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.lineTo(b.x, b.y + px(3));
    context.lineTo(a.x, a.y + px(3));
    context.fill();
  }

  /* Contact line. */
  context.strokeStyle = rgba(PALETTE.pale, 0.14);
  context.lineWidth = px(1);
  context.beginPath();
  context.moveTo(troughLeft + width * 0.03, baseY + height * 0.02);
  context.lineTo(troughRight - width * 0.03, baseY + height * 0.02);
  context.stroke();

  if (g.signature.fracturePlane) {
    const drops = Math.round(3 + g.art.fractureBias * 6);
    for (let d = 0; d < drops; d += 1) {
      const dx = troughLeft + unit(g.seedPhase, 40 + d) * (troughRight - troughLeft);
      const dy = baseY + unit(g.seedPhase, 80 + d) * height * 0.12;
      const r = px(3 + unit(g.seedPhase, 120 + d) * 7);
      context.beginPath();
      context.arc(dx, dy, r, 0, Math.PI * 2);
      context.fillStyle = rgba([6, 6, 10], 1);
      context.fill();
      context.strokeStyle = rgba(PALETTE.pale, 0.2);
      context.lineWidth = px(0.8);
      context.stroke();
    }
  }

  context.restore();
}
