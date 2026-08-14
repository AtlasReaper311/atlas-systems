"use strict";

/* PROTOTYPE C - SPECTRAL MACHINE / APERTURE ARCHITECTURE (development only).
 *
 * Revision 2. The first pass tangled three structures inside one radial band at
 * one alpha, which read as scattered shards. This version separates them:
 *
 *   - a barrel ENCLOSURE of axial beams and hoops, dark and recessive, framing
 *     the instrument from outside;
 *   - nested IRIS STAGES receding along the axis, mid value, clearly staggered
 *     in depth so you read recession rather than overlap;
 *   - a bright THROAT at the centre that occludes what is behind it.
 *
 * Routing chambers are mounted on the enclosure beams instead of floating.
 */

import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { transitionMix } from "../spectral-field-state.js";
import { PALETTE, SIGNAL_CHANNELS, backdrop, canvasSize, clamp, makeCamera, mixColour, paintFaces, rgba, signalAmplitude, unit } from "./proto-core.js";

const BEAMS = 18;
const HOOPS = 5;
const STAGES = 4;
const BLADES = 10;
const CONDUIT_STEPS = 30;
const ENCLOSURE_R = 0.92;
const STAGE_Z = Object.freeze([-0.62, -0.21, 0.21, 0.62]);

function stageOpening(g, stage) {
  const t = stage / (STAGES - 1);
  // Cutoff drives how far the iris opens; stages nearer the throat open less.
  const base = 0.09 + g.mapped.aperture * 0.26;
  const taper = 0.62 + Math.abs(t * 2 - 1) * 0.5;
  const slip = g.mapped.phaseDisagreement * 0.055 * Math.sin(g.phase * 0.5 + stage * 1.9);
  return Math.max(0.035, base * taper * (0.9 + g.breathing * 0.16) + slip);
}

function stageSpin(g, stage) {
  // Each stage is indexed to a different rotation; disagreement pulls them apart.
  return stage * 0.28
    + g.phase * 0.07 * (1 + stage * 0.1)
    + g.mapped.phaseDisagreement * 0.42 * Math.sin(g.phase * 0.4 + stage * 1.3);
}

export function draw(timestamp = performance.now()) {
  if (!this.context || !this.state) return;
  this.canvas.dataset.fieldRenderer = "proto-c-machine";
  const { width, height } = canvasSize(this.canvas);
  const context = this.context;
  const { frame, selectedMapping, routeFocus } = this.state;
  const g = deriveFieldGeometry(this.state, this.visualTime, width, height);
  const mix = transitionMix.call(this, timestamp);

  /* Damp the camera. Full torsion/tilt skewed every structure independently,
   * which is most of what made the first pass look chaotic.
   */
  const project = makeCamera({ ...g, torsion: g.torsion * 0.4, tilt: g.tilt * 0.45 }, width, height);

  const shear = g.signature.fracturePlane ? g.art.fractureBias : 0;
  const beamAngle = (i) => (i / BEAMS) * Math.PI * 2 + g.torsion * 0.22;
  const beamRadius = (a, z) => ENCLOSURE_R
    * (1 + g.art.upstreamPressure * 0.09 * Math.cos(a - 1.9) * (1 - Math.abs(z)))
    * (1 + g.art.stretch * 0.05 * Math.abs(z));
  const beamShear = (i, z) => shear * 0.15 * Math.sin(i * 2.1) * z;

  backdrop(context, g, width, height);
  context.save();
  context.globalAlpha = 0.32 + mix * 0.68;

  const faces = [];

  /* ---- ENCLOSURE: long axial beams. Constant width, running front to back,
   * so they read as parallel structure instead of fanned shards. ---- */
  const beamW = 0.028;
  for (let i = 0; i < BEAMS; i += 1) {
    const a = beamAngle(i);
    for (let seg = 0; seg < 5; seg += 1) {
      const z0 = (seg / 5) * 2 - 1;
      const z1 = ((seg + 1) / 5) * 2 - 1;
      const r0 = beamRadius(a, z0);
      const r1 = beamRadius(a, z1);
      const s0 = beamShear(i, z0);
      const s1 = beamShear(i, z1);
      const p0 = project(Math.cos(a - beamW) * r0, Math.sin(a - beamW) * r0 * 0.78 + s0, z0);
      const p1 = project(Math.cos(a + beamW) * r0, Math.sin(a + beamW) * r0 * 0.78 + s0, z0);
      const p2 = project(Math.cos(a + beamW) * r1, Math.sin(a + beamW) * r1 * 0.78 + s1, z1);
      const p3 = project(Math.cos(a - beamW) * r1, Math.sin(a - beamW) * r1 * 0.78 + s1, z1);
      const depth = (p0.depth + p2.depth) / 2;
      const front = clamp((depth + 1) / 2);
      // Recessive: the enclosure frames, it must not compete with the iris.
      faces.push({
        points: [p0, p1, p2, p3],
        depth,
        fill: rgba(mixColour(PALETTE.blue, PALETTE.violet, g.art.disturbance * 0.5), 0.035 + front * 0.05),
        stroke: rgba(PALETTE.ice, 0.03 + front * 0.05),
        lineWidth: 0.6,
      });
    }
  }

  /* ---- ENCLOSURE HOOPS: rings that tie the beams together. ---- */
  for (let h = 0; h < HOOPS; h += 1) {
    const z = (h / (HOOPS - 1)) * 2 - 1;
    const pts = [];
    for (let i = 0; i <= BEAMS * 2; i += 1) {
      const a = (i / (BEAMS * 2)) * Math.PI * 2;
      const r = beamRadius(a, z);
      pts.push(project(Math.cos(a) * r, Math.sin(a) * r * 0.78 + shear * 0.15 * z, z));
    }
    context.beginPath();
    context.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) context.lineTo(p.x, p.y);
    context.strokeStyle = rgba(PALETTE.ice, 0.05 + g.coherence * 0.07);
    context.lineWidth = 1;
    context.stroke();
  }

  /* ---- IRIS STAGES: staggered in depth, mid value, clear recession. ---- */
  for (let stage = 0; stage < STAGES; stage += 1) {
    const z = STAGE_Z[stage];
    const open = stageOpening(g, stage);
    const spin = stageSpin(g, stage);
    const outer = 0.74 + g.mapped.lateralSpread * 0.06;
    const near = 1 - Math.abs(z);
    const tint = mixColour(PALETTE.violet, PALETTE.ice, near * 0.55);
    for (let blade = 0; blade < BLADES; blade += 1) {
      const a0 = (blade / BLADES) * Math.PI * 2 + spin;
      const a1 = ((blade + 0.82) / BLADES) * Math.PI * 2 + spin;
      const p0 = project(Math.cos(a0) * open, Math.sin(a0) * open * 0.78, z);
      const p1 = project(Math.cos(a1) * open, Math.sin(a1) * open * 0.78, z);
      const p2 = project(Math.cos(a1) * outer, Math.sin(a1) * outer * 0.78, z);
      const p3 = project(Math.cos(a0) * outer, Math.sin(a0) * outer * 0.78, z);
      const depth = (p0.depth + p2.depth) / 2;
      const front = clamp((depth + 1) / 2);
      const lit = 0.5 + 0.5 * Math.sin(g.phase * 0.55 + blade * 0.7 + stage * 1.1);
      faces.push({
        points: [p0, p1, p2, p3],
        depth,
        fill: rgba(tint, (0.1 + g.coherence * 0.11) * (0.35 + front * 0.95) * (0.72 + lit * 0.4)),
        stroke: rgba(mixColour(tint, PALETTE.pale, 0.4), (0.1 + g.mapped.brilliance * 0.26) * (0.3 + front * 0.9)),
        lineWidth: 0.9,
      });
    }
  }

  /* ---- THROAT: solid, occluding, and the brightest thing in the frame. ---- */
  const throat = stageOpening(g, 1) * 0.82;
  const throatPts = [];
  for (let i = 0; i <= 40; i += 1) {
    const a = (i / 40) * Math.PI * 2;
    const wobble = 1 + Math.sin(a * 3 + g.phase * 0.45) * g.mapped.phaseDisagreement * 0.1;
    throatPts.push(project(Math.cos(a) * throat * wobble, Math.sin(a) * throat * wobble * 0.78, 0));
  }
  faces.push({ points: throatPts, depth: 0.001, fill: "rgba(4,5,10,0.92)" });

  paintFaces(context, faces);

  // Throat rim and interior light.
  context.beginPath();
  context.moveTo(throatPts[0].x, throatPts[0].y);
  for (const p of throatPts.slice(1)) context.lineTo(p.x, p.y);
  context.closePath();
  context.strokeStyle = rgba(mixColour(PALETTE.pale, PALETTE.amber, g.art.bloomBias * 0.4), 0.4 + g.mapped.bodyStrength * 0.45);
  context.lineWidth = 1.6 + g.mapped.brilliance * 1.8;
  context.shadowBlur = 26;
  context.shadowColor = rgba(PALETTE.ice, 0.55);
  context.stroke();
  context.shadowBlur = 0;

  const c = project(0, 0, 0);
  const halo = context.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.min(width, height) * (0.05 + throat * 0.9));
  halo.addColorStop(0, rgba(mixColour(PALETTE.pale, PALETTE.amber, g.art.bloomBias * 0.45), 0.3 + g.mapped.bodyStrength * 0.3));
  halo.addColorStop(0.42, rgba(PALETTE.ice, 0.09 * g.coherence));
  halo.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = halo;
  context.fillRect(0, 0, width, height);

  /* ---- CONDUITS: hug the inner enclosure wall and converge on the throat. ---- */
  for (const channel of SIGNAL_CHANNELS) {
    const selected = selectedMapping?.source === channel.id;
    if (routeFocus && selectedMapping && !selected) continue;
    const colour = selected ? PALETTE.amber : channel.colour;
    const value = clamp(frame.normalised[channel.id] ?? 0.5);
    const seat = beamAngle(Math.round((channel.lane + 1) * 0.5 * (BEAMS - 1)));
    const point = (t) => {
      const amp = signalAmplitude(g, frame, channel, t);
      const z = (t * 2 - 1) * 0.78;
      const pull = Math.pow(1 - Math.abs(z), 1.35);
      const r = (ENCLOSURE_R * 0.82) * (1 - pull * 0.8) + amp.offset * 0.3;
      const a = seat + z * 0.34 + amp.offset * 0.4;
      return project(Math.cos(a) * r, Math.sin(a) * r * 0.78, z);
    };
    /* Drawn in segments so the ends fade into the enclosure instead of stopping
     * dead in open space. */
    const baseAlpha = selected ? 0.95 : 0.42 + value * 0.4;
    context.lineCap = "round";
    context.shadowColor = rgba(colour, 0.45);
    for (let s2 = 0; s2 < CONDUIT_STEPS; s2 += 1) {
      const t0 = s2 / CONDUIT_STEPS;
      const t1 = (s2 + 1) / CONDUIT_STEPS;
      const p0 = point(t0);
      const p1 = point(t1);
      const taper = Math.pow(Math.sin(Math.PI * ((t0 + t1) / 2)), 0.55);
      context.beginPath();
      context.moveTo(p0.x, p0.y);
      context.lineTo(p1.x, p1.y);
      context.strokeStyle = rgba(colour, baseAlpha * taper);
      context.lineWidth = (selected ? 4 : 2.2) * (0.75 + g.mapped.brilliance * 0.55) * (0.5 + taper * 0.6);
      context.shadowBlur = (selected ? 20 : 10) * taper;
      context.stroke();
    }
    context.shadowBlur = 0;
    context.lineCap = "butt";
  }

  /* ---- ROUTING CHAMBERS: mounted on the enclosure beams, in perspective. ---- */
  for (let i = 0; i < SIGNAL_CHANNELS.length; i += 1) {
    const channel = SIGNAL_CHANNELS[i];
    const selected = selectedMapping?.source === channel.id;
    const value = clamp(frame.normalised[channel.id] ?? 0.5);
    const a = beamAngle(Math.round((channel.lane + 1) * 0.5 * (BEAMS - 1)));
    const z = -0.5;
    const r = beamRadius(a, z);
    const w = 0.032 + value * 0.026;
    const dz = 0.06 + value * 0.04;
    const q = [
      project(Math.cos(a - w) * r, Math.sin(a - w) * r * 0.78, z - dz),
      project(Math.cos(a + w) * r, Math.sin(a + w) * r * 0.78, z - dz),
      project(Math.cos(a + w) * r, Math.sin(a + w) * r * 0.78, z + dz),
      project(Math.cos(a - w) * r, Math.sin(a - w) * r * 0.78, z + dz),
    ];
    context.beginPath();
    context.moveTo(q[0].x, q[0].y);
    for (const p of q.slice(1)) context.lineTo(p.x, p.y);
    context.closePath();
    context.fillStyle = rgba(selected ? PALETTE.amber : channel.colour, (selected ? 0.34 : 0.1) + value * 0.2);
    context.fill();
    context.strokeStyle = rgba(selected ? PALETTE.amber : PALETTE.ice, 0.3 + value * 0.35);
    context.lineWidth = selected ? 1.8 : 0.9;
    context.stroke();
  }

  /* ---- PHASE PLANE: one sheet, only once coherence is genuinely lost. ---- */
  if (g.mapped.phaseDisagreement > 0.3) {
    const tilt = g.mapped.phaseDisagreement * 0.42;
    const pts = [
      project(-ENCLOSURE_R, tilt - 0.04, -0.95),
      project(ENCLOSURE_R, tilt + 0.04, -0.95),
      project(ENCLOSURE_R, tilt + 0.04, 0.95),
      project(-ENCLOSURE_R, tilt - 0.04, 0.95),
    ];
    context.beginPath();
    context.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) context.lineTo(p.x, p.y);
    context.closePath();
    context.fillStyle = rgba(PALETTE.violet, 0.02 + g.mapped.phaseDisagreement * 0.035);
    context.fill();
  }

  /* ---- MICROSTRUCTURE: bounded machined grain along the enclosure wall. ---- */
  const grains = Math.round(44 * (0.3 + g.mapped.microstructure * 0.7));
  for (let i = 0; i < grains; i += 1) {
    const a = unit(g.seedPhase, i + 61) * Math.PI * 2;
    const zz = unit(g.seedPhase, i + 277) * 1.8 - 0.9;
    const rr = ENCLOSURE_R * (0.6 + unit(g.seedPhase, i + 143) * 0.34);
    const p = project(Math.cos(a) * rr, Math.sin(a) * rr * 0.78, zz);
    context.fillStyle = rgba(PALETTE.pale, 0.04 + g.mapped.brilliance * 0.12);
    context.fillRect(p.x, p.y, 1.3 * p.k, 1.3 * p.k);
  }

  context.restore();
}
