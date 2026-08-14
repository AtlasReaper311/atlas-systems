"use strict";

/* PROTOTYPE B - DIMENSIONAL SIGNAL ORGANISM (development only).
 *
 * Grammar: a single soft-bodied organism made of stacked membrane cross-sections.
 * Volume comes from many closely spaced translucent membranes rather than
 * facets, so the body reads as continuous tissue. Pressure and latency visibly
 * deform the membranes; signals travel as thick conduits between distributed
 * nodes.
 */

import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { transitionMix } from "../spectral-field-state.js";
import { PALETTE, SIGNAL_CHANNELS, backdrop, canvasSize, clamp, makeCamera, mixColour, paintFaces, rgba, signalAmplitude, unit } from "./proto-core.js";

const MEMBRANES = 26;
const MEMBRANE_POINTS = 44;
const NODES = 11;
const CONDUIT_STEPS = 34;

/* One membrane cross-section. The radial profile is where the organism gets its
 * anatomy: a waist, two lobes, and a deformation field driven by pressure.
 */
function membranePoint(g, project, slice, i, apertureGap) {
  const zt = (slice / (MEMBRANES - 1)) * 2 - 1;
  const a = (i / MEMBRANE_POINTS) * Math.PI * 2;

  const body = Math.pow(Math.cos(zt * Math.PI * 0.5), 0.62);
  const lobes = 1 + Math.cos(zt * Math.PI * 2.1) * 0.14 * (1 - g.art.compression * 0.6);
  const aperturePinch = 1 - apertureGap * 0.3 * Math.exp(-Math.pow(zt * 2.4, 2));

  // Membranes bulge where pressure accumulates and stretch under latency.
  const bulge = 1
    + g.art.upstreamPressure * 0.16 * Math.cos(a - 1.9)
    + g.art.downstreamPressure * 0.15 * Math.cos(a + 1.4)
    + Math.sin(a * 3 + zt * 2 + g.phase * 0.35) * g.mapped.displacement * 0.09;

  const decohere = g.mapped.phaseDisagreement * 0.14 * Math.sin(a * 5 - g.phase * 0.6 + zt * 3);
  const breathe = 0.9 + g.breathing * 0.16;
  const stretch = 1 + g.art.stretch * 0.22 * Math.abs(zt);

  const r = (0.42 + g.mapped.lateralSpread * 0.12) * body * lobes * aperturePinch * bulge * breathe * (1 + decohere);
  return project(Math.cos(a) * r * stretch, Math.sin(a) * r * 0.78, zt * 0.92);
}

export function draw(timestamp = performance.now()) {
  if (!this.context || !this.state) return;
  this.canvas.dataset.fieldRenderer = "proto-b-organism";
  const { width, height } = canvasSize(this.canvas);
  const context = this.context;
  const { frame, selectedMapping, routeFocus } = this.state;
  const g = deriveFieldGeometry(this.state, this.visualTime, width, height);
  const mix = transitionMix.call(this, timestamp);
  const project = makeCamera(g, width, height);
  const aperture = clamp(g.mapped.aperture * 0.75 + g.coherence * 0.25);

  backdrop(context, g, width, height);
  context.save();
  context.globalAlpha = 0.3 + mix * 0.7;

  const faces = [];

  // Tissue: quad bands between neighbouring membranes.
  for (let slice = 0; slice < MEMBRANES - 1; slice += 1) {
    const zt = (slice / (MEMBRANES - 1)) * 2 - 1;
    const tint = mixColour(
      mixColour(PALETTE.blue, PALETTE.ice, 0.5 + zt * 0.5),
      PALETTE.violet,
      g.art.disturbance * 0.7,
    );
    for (let i = 0; i < MEMBRANE_POINTS; i += 1) {
      const p0 = membranePoint(g, project, slice, i, aperture);
      const p1 = membranePoint(g, project, slice, i + 1, aperture);
      const p2 = membranePoint(g, project, slice + 1, i + 1, aperture);
      const p3 = membranePoint(g, project, slice + 1, i, aperture);
      const depth = (p0.depth + p1.depth + p2.depth + p3.depth) / 4;
      const front = clamp((depth + 1) / 2);
      // Rim lighting: bands facing away stay dim, giving a rounded read.
      const rim = Math.pow(1 - Math.abs(Math.cos((i / MEMBRANE_POINTS) * Math.PI * 2)), 1.4);
      const alpha = (0.055 + g.coherence * 0.065) * (0.25 + front * 1.05) * (0.55 + rim * 0.9);
      faces.push({ points: [p0, p1, p2, p3], depth, fill: rgba(tint, alpha) });
    }
  }

  paintFaces(context, faces);

  // Internal light source inside the organism.
  const c = project(0, 0, 0);
  const halo = context.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.min(width, height) * (0.14 + aperture * 0.24));
  halo.addColorStop(0, rgba(mixColour(PALETTE.pale, PALETTE.amber, g.art.bloomBias * 0.3), 0.22 + g.mapped.bodyStrength * 0.3));
  halo.addColorStop(0.45, rgba(PALETTE.ice, 0.08 * g.coherence));
  halo.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = halo;
  context.fillRect(0, 0, width, height);

  // Distributed nodes on the surface.
  const nodePts = [];
  for (let n = 0; n < NODES; n += 1) {
    const a = unit(g.seedPhase, n) * Math.PI * 2;
    const zt = unit(g.seedPhase, n + 57) * 1.6 - 0.8;
    const body = Math.pow(Math.cos(zt * Math.PI * 0.5), 0.62);
    const r = (0.42 + g.mapped.lateralSpread * 0.12) * body * (0.92 + g.breathing * 0.14);
    const p = project(Math.cos(a) * r, Math.sin(a) * r * 0.78, zt * 0.92);
    const lit = clamp(0.3 + 0.7 * Math.sin(g.phase * 0.8 + n * 1.3)) * (0.4 + g.mapped.emissionRate * 0.8);
    nodePts.push({ p, lit, a, zt });
    context.beginPath();
    context.arc(p.x, p.y, (2.6 + lit * 5) * p.k, 0, Math.PI * 2);
    context.fillStyle = rgba(mixColour(PALETTE.ice, PALETTE.pale, lit), 0.2 + lit * 0.55);
    context.shadowBlur = 14 * lit;
    context.shadowColor = rgba(PALETTE.ice, 0.5);
    context.fill();
    context.shadowBlur = 0;
  }

  // Conduits flowing through the body between nodes.
  for (const channel of SIGNAL_CHANNELS) {
    const selected = selectedMapping?.source === channel.id;
    if (routeFocus && selectedMapping && !selected) continue;
    const colour = selected ? PALETTE.amber : channel.colour;
    const value = clamp(frame.normalised[channel.id] ?? 0.5);
    context.beginPath();
    for (let s = 0; s <= CONDUIT_STEPS; s += 1) {
      const t = s / CONDUIT_STEPS;
      const amp = signalAmplitude(g, frame, channel, t);
      const zt = (t * 2 - 1) * 0.9;
      const drift = Math.sin(t * Math.PI * 2.2 + channel.phase * 6.28 + g.phase * 0.22);
      const r = (0.1 + Math.abs(channel.lane) * 0.3) * (0.5 + Math.cos(zt * Math.PI * 0.5) * 0.7) + amp.offset;
      const p = project(Math.cos(drift * 2 + channel.lane * 3) * r, Math.sin(drift * 2 + channel.lane * 3) * r * 0.78 + channel.lane * 0.1, zt);
      if (s === 0) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y);
    }
    context.strokeStyle = rgba(colour, selected ? 0.94 : 0.48 + value * 0.42);
    context.lineWidth = (selected ? 4.4 : 2.8) * (0.7 + g.mapped.brilliance * 0.6);
    context.shadowBlur = selected ? 20 : 10;
    context.shadowColor = rgba(colour, 0.45);
    context.stroke();
    context.shadowBlur = 0;
  }

  // Bounded afterimage: mapped delay leaves a persistence outline, never trails.
  if (g.mapped.afterimage > 0.15) {
    const ghosts = Math.round(1 + g.mapped.afterimage * 2);
    for (let ghost = 1; ghost <= ghosts; ghost += 1) {
      const back = ghost * (0.05 + g.mapped.afterimage * 0.06);
      context.beginPath();
      for (let i = 0; i <= MEMBRANE_POINTS; i += 1) {
        const a = (i / MEMBRANE_POINTS) * Math.PI * 2;
        const r = (0.42 + g.mapped.lateralSpread * 0.12) * (0.92 + g.breathing * 0.14) * (1 - back);
        const p = project(Math.cos(a) * r, Math.sin(a) * r * 0.78, 0);
        if (i === 0) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y);
      }
      context.strokeStyle = rgba(PALETTE.violet, 0.1 * g.mapped.afterimage / ghost);
      context.lineWidth = 1.2;
      context.stroke();
    }
  }

  // Propagation front travelling through the tissue.
  if (g.signature.propagationWave) {
    const frontZ = ((g.phase * 0.24) % 2) - 1;
    context.beginPath();
    for (let i = 0; i <= MEMBRANE_POINTS; i += 1) {
      const a = (i / MEMBRANE_POINTS) * Math.PI * 2;
      const body = Math.pow(Math.cos(frontZ * Math.PI * 0.5), 0.62);
      const r = (0.42 + g.mapped.lateralSpread * 0.12) * body * 1.06;
      const p = project(Math.cos(a) * r, Math.sin(a) * r * 0.78, frontZ * 0.92);
      if (i === 0) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y);
    }
    context.strokeStyle = rgba(mixColour(PALETTE.pale, PALETTE.violet, 0.5), 0.12 + g.art.propagation * 0.4);
    context.lineWidth = 1.6 + g.art.propagation * 2.4;
    context.stroke();
  }

  // Granular contamination where errors bite into the tissue.
  if (g.mapped.granularFracture > 0.12) {
    const grains = Math.round(70 * g.mapped.granularFracture);
    for (let i = 0; i < grains; i += 1) {
      const a = unit(g.seedPhase, i + 733) * Math.PI * 2;
      const zt = unit(g.seedPhase, i + 811) * 1.7 - 0.85;
      const body = Math.pow(Math.cos(zt * Math.PI * 0.5), 0.62);
      const r = (0.42 + g.mapped.lateralSpread * 0.12) * body * (0.85 + unit(g.seedPhase, i + 907) * 0.3);
      const p = project(Math.cos(a) * r, Math.sin(a) * r * 0.78, zt * 0.92);
      context.fillStyle = rgba(PALETTE.violet, 0.12 + g.mapped.granularFracture * 0.4);
      context.fillRect(p.x, p.y, 1.6 * p.k, 1.6 * p.k);
    }
  }

  context.restore();
}
