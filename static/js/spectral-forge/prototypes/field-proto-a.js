"use strict";

/* PROTOTYPE A - LIVING CRYSTALLINE ARCHITECTURE (development only).
 *
 * Grammar: nested faceted shells enclosing a central aperture body. Volume comes
 * from depth-sorted translucent faces, not from stacked wireframes. Signals run
 * as illuminated conduits through the shells. Failure splits shells along real
 * fracture planes rather than adding noise.
 */

import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { transitionMix } from "../spectral-field-state.js";
import { PALETTE, SIGNAL_CHANNELS, backdrop, canvasSize, clamp, makeCamera, mixColour, paintFaces, rgba, signalAmplitude, unit } from "./proto-core.js";

const SHELLS = 5;
const FACETS = 11;
const RINGS = 5;
const CONDUIT_STEPS = 30;
const CRYSTALS = 46;

function shellRadius(g, shell) {
  const t = shell / (SHELLS - 1);
  return 0.36 + t * 0.62 + g.mapped.lateralSpread * 0.05 * t;
}

function facetPoint(g, project, shell, facet, ring, apertureGap) {
  const radius = shellRadius(g, shell);
  const a = (facet / FACETS) * Math.PI * 2 + g.phase * 0.05 * (1 + shell * 0.1);
  const zt = (ring / (RINGS - 1)) * 2 - 1;
  // The body waists at the centre and opens toward the aperture.
  const waist = 0.55 + Math.cos(zt * Math.PI * 0.5) * 0.45;
  const breathe = 0.94 + g.breathing * 0.12 * (1 - shell / SHELLS);
  // Pressure deforms the shell where demand enters.
  const press = 1 - g.art.compression * 0.14 * Math.max(0, Math.cos(a - Math.PI * 0.5));
  const fracture = g.signature.fracturePlane
    ? Math.sin(a * 3 + zt * 2.2 + g.phase * 0.2) * g.art.fractureBias * 0.13
    : 0;
  const r = radius * waist * breathe * press * (1 + fracture) * (1 - apertureGap * 0.06 * (1 - shell / SHELLS));
  return project(Math.cos(a) * r, Math.sin(a) * r * 0.82, zt * (0.5 + g.depthSpan / 320));
}

export function draw(timestamp = performance.now()) {
  if (!this.context || !this.state) return;
  this.canvas.dataset.fieldRenderer = "proto-a-crystalline";
  const { width, height } = canvasSize(this.canvas);
  const context = this.context;
  const { frame, selectedMapping, routeFocus } = this.state;
  const g = deriveFieldGeometry(this.state, this.visualTime, width, height);
  const mix = transitionMix.call(this, timestamp);
  const project = makeCamera(g, width, height);
  const aperture = clamp(g.mapped.aperture * 0.7 + g.coherence * 0.3);

  backdrop(context, g, width, height);
  context.save();
  context.globalAlpha = 0.3 + mix * 0.7;

  const faces = [];

  // Shells: quad faces between adjacent facets and rings.
  for (let shell = 0; shell < SHELLS; shell += 1) {
    const outward = shell / (SHELLS - 1);
    const tint = mixColour(PALETTE.ice, PALETTE.violet, outward * 0.65 + g.art.disturbance * 0.3);
    for (let ring = 0; ring < RINGS - 1; ring += 1) {
      for (let facet = 0; facet < FACETS; facet += 1) {
        const p0 = facetPoint(g, project, shell, facet, ring, aperture);
        const p1 = facetPoint(g, project, shell, facet + 1, ring, aperture);
        const p2 = facetPoint(g, project, shell, facet + 1, ring + 1, aperture);
        const p3 = facetPoint(g, project, shell, facet, ring + 1, aperture);
        const depth = (p0.depth + p1.depth + p2.depth + p3.depth) / 4;
        // Front faces read brighter; rear faces sink away. That hierarchy is
        // what makes the form read as a volume.
        const front = clamp((depth + 1) / 2);
        const base = (0.1 + g.coherence * 0.1) * (1 - outward * 0.45);
        const shimmer = 0.5 + 0.5 * Math.sin(facet * 1.7 + ring * 0.9 + g.phase * 0.4 + shell);
        faces.push({
          points: [p0, p1, p2, p3],
          depth,
          fill: rgba(tint, base * (0.4 + front * 0.85) * (0.7 + shimmer * 0.5)),
          stroke: rgba(tint, (0.1 + g.mapped.brilliance * 0.24) * (0.25 + front)),
          lineWidth: 0.7,
        });
      }
    }
  }

  // Central aperture body: the system core, dilating with filter cutoff.
  const coreR = 0.1 + aperture * 0.2;
  const corePts = [];
  for (let i = 0; i <= FACETS * 2; i += 1) {
    const a = (i / (FACETS * 2)) * Math.PI * 2;
    const wobble = 1 + Math.sin(a * 3 + g.phase * 0.5) * g.mapped.phaseDisagreement * 0.16;
    corePts.push(project(Math.cos(a) * coreR * wobble, Math.sin(a) * coreR * wobble * 0.85, 0));
  }
  faces.push({ points: corePts, depth: 0.02, fill: rgba(mixColour(PALETTE.pale, PALETTE.amber, g.art.bloomBias * 0.35), 0.1 + g.mapped.bodyStrength * 0.3) });

  paintFaces(context, faces);

  // Core glow sits inside the volume rather than around every edge.
  const c = project(0, 0, 0);
  const halo = context.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.min(width, height) * (0.1 + aperture * 0.2));
  halo.addColorStop(0, rgba(PALETTE.pale, 0.18 + g.mapped.bodyStrength * 0.26));
  halo.addColorStop(0.5, rgba(PALETTE.ice, 0.07 * g.coherence));
  halo.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = halo;
  context.fillRect(0, 0, width, height);

  // Signal conduits threading through the architecture.
  for (const channel of SIGNAL_CHANNELS) {
    const selected = selectedMapping?.source === channel.id;
    if (routeFocus && selectedMapping && !selected) continue;
    const colour = selected ? PALETTE.amber : channel.colour;
    context.beginPath();
    for (let s = 0; s <= CONDUIT_STEPS; s += 1) {
      const t = s / CONDUIT_STEPS;
      const amp = signalAmplitude(g, frame, channel, t);
      const z = (t * 2 - 1) * 0.95;
      const swirl = t * Math.PI * 1.3 + channel.phase * 6.28 + g.phase * 0.1;
      const r = (0.2 + channel.lane * 0.42 + amp.offset) * (0.6 + Math.cos(z * Math.PI * 0.5) * 0.55);
      const p = project(Math.cos(swirl) * r, Math.sin(swirl) * r * 0.8 + amp.offset * 0.5, z);
      if (s === 0) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y);
    }
    context.strokeStyle = rgba(colour, selected ? 0.92 : 0.5 + amp0(frame, channel) * 0.4);
    context.lineWidth = (selected ? 4 : 2.4) * (0.7 + g.mapped.brilliance * 0.7);
    context.shadowBlur = selected ? 18 : 8;
    context.shadowColor = rgba(colour, 0.4);
    context.stroke();
    context.shadowBlur = 0;
  }

  // Junction nodes where conduits meet the shells.
  for (let n = 0; n < SIGNAL_CHANNELS.length * 2; n += 1) {
    const channel = SIGNAL_CHANNELS[n % SIGNAL_CHANNELS.length];
    const t = 0.25 + (n % 2) * 0.5;
    const amp = signalAmplitude(g, frame, channel, t);
    const swirl = t * Math.PI * 1.3 + channel.phase * 6.28 + g.phase * 0.1;
    const r = 0.2 + channel.lane * 0.42 + amp.offset;
    const p = project(Math.cos(swirl) * r, Math.sin(swirl) * r * 0.8, (t * 2 - 1) * 0.95);
    const lit = amp.pulse * amp.value;
    context.beginPath();
    context.arc(p.x, p.y, (2.4 + lit * 4.5) * p.k, 0, Math.PI * 2);
    context.fillStyle = rgba(mixColour(channel.colour, PALETTE.pale, lit), 0.25 + lit * 0.6);
    context.fill();
  }

  // Bounded crystalline microstructure inside the volume.
  const grains = Math.round(CRYSTALS * (0.35 + g.mapped.microstructure * 0.65));
  for (let i = 0; i < grains; i += 1) {
    const a = unit(g.seedPhase, i) * Math.PI * 2;
    const rr = 0.25 + unit(g.seedPhase, i + 91) * 0.7;
    const zz = unit(g.seedPhase, i + 211) * 1.8 - 0.9;
    const p = project(Math.cos(a) * rr, Math.sin(a) * rr * 0.8, zz);
    const tw = 0.5 + 0.5 * Math.sin(g.phase * 0.9 + i);
    context.fillStyle = rgba(PALETTE.pale, (0.05 + tw * 0.16) * (0.3 + g.mapped.brilliance * 0.6));
    context.fillRect(p.x, p.y, 1.5 * p.k, 1.5 * p.k);
  }

  // Fracture planes: real structural discontinuities.
  if (g.signature.fracturePlane) {
    const planes = Math.round(1 + g.art.fractureBias * 4);
    for (let i = 0; i < planes; i += 1) {
      const a = unit(g.seedPhase, i + 400) * Math.PI * 2;
      const pts = [];
      for (let s = 0; s <= 6; s += 1) {
        const t = s / 6;
        const rr = 0.4 + t * 0.7;
        const jag = Math.sin(t * 9 + i) * g.art.fractureBias * 0.1;
        pts.push(project(Math.cos(a + jag) * rr, Math.sin(a + jag) * rr * 0.8, (t * 2 - 1) * 0.9));
      }
      context.beginPath();
      context.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) context.lineTo(p.x, p.y);
      context.strokeStyle = rgba(mixColour(PALETTE.violet, PALETTE.pale, 0.4), 0.14 + g.art.fractureBias * 0.4);
      context.lineWidth = 1 + g.art.fractureBias * 2;
      context.stroke();
    }
  }

  context.restore();
}

function amp0(frame, channel) {
  return clamp(frame.normalised[channel.id] ?? 0.5);
}
