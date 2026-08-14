"use strict";

/* PROTOTYPE — LIQUID (development only). The decision object.
 *
 * Ferrofluid is the body. A milled trough is the frame. Schlieren-quality
 * light (one key, hard speculars, most of the volume in darkness) is how
 * you see it. Not a hill, not tiles, not traces.
 *
 * Anatomy: far wall, floor, near lip, contact line, spike ridge, islands.
 */

import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { transitionMix } from "../spectral-field-state.js";
import { PALETTE, canvasSize, clamp, mixColour, rgba, routeBand, unit } from "./proto-core.js";

const SAMPLES = 168;
const BAYS = 5;

function pts(renderer) {
  if (!renderer._liquidPts || renderer._liquidPts.length !== SAMPLES + 1) {
    renderer._liquidPts = Array.from({ length: SAMPLES + 1 }, () => ({
      x: 0, y: 0, nx: 0, h: 0, selected: false,
    }));
  }
  return renderer._liquidPts;
}

export function draw(timestamp = performance.now()) {
  if (!this.context || !this.state) return;
  this.canvas.dataset.fieldRenderer = "proto-liquid";
  const { width, height, ratio } = canvasSize(this.canvas);
  const context = this.context;
  const { selectedMapping } = this.state;
  const g = deriveFieldGeometry(this.state, this.visualTime, width, height);
  const mix = transitionMix.call(this, timestamp);
  const band = routeBand(selectedMapping);
  const px = (v) => Math.max(1, v * ratio);

  context.globalCompositeOperation = "source-over";
  context.fillStyle = "#05060a";
  context.fillRect(0, 0, width, height);
  context.save();
  context.globalAlpha = 0.4 + mix * 0.6;

  const left = width * 0.035;
  const right = width * 0.965;
  const farY = height * 0.16;
  const floorY = height * 0.74;
  const nearY = height * 0.86;
  const inset = width * 0.018;

  /* ---- Trough: medium metal so black fluid can read against it. ---- */
  context.beginPath();
  context.moveTo(left + inset, farY);
  context.lineTo(right - inset, farY);
  context.lineTo(right, nearY);
  context.lineTo(left, nearY);
  context.closePath();
  const metal = context.createLinearGradient(0, farY, 0, nearY);
  metal.addColorStop(0, "#3a3c48");
  metal.addColorStop(0.55, "#2a2c36");
  metal.addColorStop(1, "#1c1d26");
  context.fillStyle = metal;
  context.fill();

  /* Far lip — machined highlight. */
  context.strokeStyle = rgba(PALETTE.pale, 0.38 + g.mapped.brilliance * 0.2);
  context.lineWidth = px(1.4);
  context.beginPath();
  context.moveTo(left + inset, farY);
  context.lineTo(right - inset, farY);
  context.stroke();

  /* Bay divisions on the far wall only. Recessive frame, not tiles. */
  const bayTop = farY + height * 0.02;
  const bayBot = floorY - height * 0.08;
  for (let b = 0; b < BAYS; b += 1) {
    const x0 = left + ((b + 0.08) / BAYS) * (right - left);
    const x1 = left + ((b + 0.92) / BAYS) * (right - left);
    const mid = (x0 + x1) / 2 / width;
    const selected = band && mid >= band.x0 && mid <= band.x1;
    context.fillStyle = rgba(
      selected ? mixColour([48, 50, 60], PALETTE.amber, 0.22) : [48, 50, 60],
      selected ? 0.28 : 0.12,
    );
    context.fillRect(x0, bayTop, x1 - x0, bayBot - bayTop);
    context.strokeStyle = rgba(PALETTE.pale, selected ? 0.22 : 0.08);
    context.lineWidth = px(0.8);
    context.strokeRect(x0, bayTop, x1 - x0, bayBot - bayTop);
  }

  /* Floor strip — the channel the liquid sits in. */
  context.fillStyle = "#32343e";
  context.beginPath();
  context.moveTo(left + width * 0.01, floorY);
  context.lineTo(right - width * 0.01, floorY);
  context.lineTo(right, nearY - height * 0.02);
  context.lineTo(left, nearY - height * 0.02);
  context.closePath();
  context.fill();
  context.strokeStyle = rgba(PALETTE.pale, 0.12);
  context.lineWidth = px(1);
  context.beginPath();
  context.moveTo(left + width * 0.01, floorY);
  context.lineTo(right - width * 0.01, floorY);
  context.stroke();

  /* ---- Ferrofluid surface. Spikes are half-wave cones off a puddle. ---- */
  const bulkY = floorY - height * (0.045 + g.mapped.bodyStrength * 0.05);
  const spikeH = height * (0.28 + g.mapped.displacement * 0.22 + g.mapped.aperture * 0.1);
  const center = 0.5 + g.art.direction * 0.07;
  const spread = 0.22 + g.mapped.lateralSpread * 0.16;
  const count = 16 + g.mapped.emissionRate * 14;
  const sharp = 2.4 + g.mapped.brilliance * 2.6;
  const sev = g.health.severity;
  const islandN = sev > 0.42 ? 2 + Math.floor(g.art.fractureBias * 3) : 1;
  const surface = pts(this);

  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = i / SAMPLES;
    const nx = 0.05 + t * 0.9;
    const dx = nx - center;
    let env = Math.exp(-(dx * dx) / (2 * spread * spread));
    env *= 0.72 + g.breathing * 0.14;
    env *= 1 + g.art.compression * 0.12 * (1 - Math.abs(dx) * 2);
    if (islandN > 1) {
      const gap = Math.abs(Math.sin(nx * Math.PI * islandN + g.art.propagation));
      env *= Math.pow(gap, 1.35);
    }
    const wave = Math.sin(nx * count * Math.PI * 2 - g.phase * 0.45);
    const cone = Math.pow(Math.max(0, wave), sharp);
    const selected = !!(band && nx >= band.x0 && nx <= band.x1);
    const boost = selected ? 1.28 : 1;
    const wobble = g.mapped.phaseDisagreement * height * 0.025 * Math.sin(nx * 31 + g.phase * 0.8);
    const h = spikeH * env * (0.06 + 0.94 * cone) * boost;
    const p = surface[i];
    p.nx = nx;
    p.x = nx * width + g.art.direction * width * 0.008 + wobble * 0.15;
    p.y = bulkY - h;
    p.h = h;
    p.selected = selected;
  }

  /* Wetting at the ends — meniscus down to the floor. */
  context.beginPath();
  context.moveTo(left + inset, floorY);
  context.lineTo(surface[0].x, bulkY);
  for (let i = 0; i <= SAMPLES; i += 1) context.lineTo(surface[i].x, surface[i].y);
  context.lineTo(surface[SAMPLES].x, bulkY);
  context.lineTo(right - inset, floorY);
  context.lineTo(right - inset, nearY - height * 0.03);
  context.lineTo(left + inset, nearY - height * 0.03);
  context.closePath();
  const fluid = context.createLinearGradient(0, farY, 0, nearY);
  fluid.addColorStop(0, "#14151c");
  fluid.addColorStop(0.42, "#0a0b10");
  fluid.addColorStop(1, "#050508");
  context.fillStyle = fluid;
  context.fill();

  /* Contact line — the wet edge against the near floor. */
  context.strokeStyle = rgba(PALETTE.pale, 0.28 + g.coherence * 0.2);
  context.lineWidth = px(1.2);
  context.beginPath();
  context.moveTo(left + inset, floorY);
  context.lineTo(right - inset, floorY);
  context.stroke();

  /* Hard speculars: only faces that look at the upper-left key light. */
  for (let i = 1; i <= SAMPLES; i += 1) {
    const a = surface[i - 1];
    const b = surface[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nxn = -dy / len;
    const nyn = dx / len;
    const lit = clamp(nxn * -0.55 + nyn * -0.84);
    if (lit < 0.55 || Math.max(a.h, b.h) < spikeH * 0.2) continue;
    const colour = a.selected || b.selected ? PALETTE.amber : PALETTE.pale;
    context.strokeStyle = rgba(colour, 0.35 + (lit - 0.55) * 1.1 * (0.45 + g.mapped.brilliance * 0.55));
    context.lineWidth = px(1.1 + lit);
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }

  /* Tip glints. */
  for (let i = 2; i < SAMPLES; i += 1) {
    const p = surface[i];
    if (p.h < spikeH * 0.55) continue;
    if (!(surface[i - 1].h < p.h && surface[i + 1].h <= p.h)) continue;
    context.fillStyle = rgba(p.selected ? PALETTE.amber : PALETTE.pale, 0.55 + g.mapped.brilliance * 0.35);
    context.fillRect(p.x - px(1.2), p.y - px(1.2), px(2.4), px(2.4));
  }

  /* Shed droplets when the ridge tears. */
  if (g.signature.fracturePlane || sev > 0.5) {
    const drops = Math.round(4 + g.art.fractureBias * 8);
    for (let d = 0; d < drops; d += 1) {
      const nx = 0.1 + unit(g.seedPhase, 40 + d) * 0.8;
      const r = px(4 + unit(g.seedPhase, 90 + d) * 9);
      const x = nx * width;
      const y = floorY + height * 0.02 + unit(g.seedPhase, 140 + d) * height * 0.05;
      context.beginPath();
      context.arc(x, y, r, 0, Math.PI * 2);
      context.fillStyle = "#07080c";
      context.fill();
      context.strokeStyle = rgba(PALETTE.pale, 0.18);
      context.lineWidth = px(0.8);
      context.stroke();
      context.fillStyle = rgba(PALETTE.pale, 0.35);
      context.beginPath();
      context.arc(x - r * 0.3, y - r * 0.3, Math.max(px(1), r * 0.22), 0, Math.PI * 2);
      context.fill();
    }
  }

  /* Near lip in front — the milled edge you could run a thumb along. */
  context.fillStyle = "#4a4c58";
  context.fillRect(left, nearY - height * 0.018, right - left, height * 0.04);
  context.strokeStyle = rgba(PALETTE.pale, 0.5 + g.mapped.brilliance * 0.25);
  context.lineWidth = px(1.6);
  context.beginPath();
  context.moveTo(left, nearY - height * 0.018);
  context.lineTo(right, nearY - height * 0.018);
  context.stroke();

  context.restore();
}
