"use strict";

/* PROTOTYPE — LONGITUDINAL MILLED SECTION (development only).
 *
 * A designed object, not a photograph of light. The 3:1 stage is a cut through
 * a machined instrument along its length. Material is opaque metal: one key
 * light, hard cut-edges, recessed chambers. Failure is delamination and slip,
 * not noise. This deliberately disagrees with "precision optical glass."
 */

import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { transitionMix } from "../spectral-field-state.js";
import { PALETTE, canvasSize, mixColour, rgba, routeBand, unit } from "./proto-core.js";

const CHAMBERS = Object.freeze([
  { id: "intake", y0: 0.16, y1: 0.34, x0: 0.04, span: 0.22 },
  { id: "aperture", y0: 0.22, y1: 0.48, x0: 0.24, span: 0.18 },
  { id: "lattice", y0: 0.18, y1: 0.56, x0: 0.40, span: 0.22 },
  { id: "gallery", y0: 0.28, y1: 0.62, x0: 0.60, span: 0.2 },
  { id: "exhaust", y0: 0.24, y1: 0.5, x0: 0.78, span: 0.18 },
]);

export function draw(timestamp = performance.now()) {
  if (!this.context || !this.state) return;
  this.canvas.dataset.fieldRenderer = "proto-section";
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

  const slip = g.art.fractureBias * (g.signature.fracturePlane ? 1 : 0.35);
  const open = 0.35 + g.mapped.aperture * 0.65;
  const metal = mixColour([28, 30, 38], PALETTE.ice, 0.08 + g.mapped.brilliance * 0.12);
  const cut = mixColour(PALETTE.pale, PALETTE.ice, 0.25);

  /* Block body — a milled bar occupying the stage. */
  const top = height * 0.12;
  const bot = height * 0.82;
  const left = width * 0.02;
  const right = width * 0.98;
  const skew = width * 0.018;
  context.beginPath();
  context.moveTo(left + skew, top);
  context.lineTo(right + skew * 0.2, top + height * 0.02);
  context.lineTo(right, bot);
  context.lineTo(left, bot - height * 0.02);
  context.closePath();
  const bodyGrad = context.createLinearGradient(left, top, left, bot);
  bodyGrad.addColorStop(0, rgba(mixColour(metal, PALETTE.pale, 0.18), 0.95));
  bodyGrad.addColorStop(0.12, rgba(metal, 1));
  bodyGrad.addColorStop(1, rgba(mixColour(metal, PALETTE.deep, 0.55), 1));
  context.fillStyle = bodyGrad;
  context.fill();
  context.strokeStyle = rgba(cut, 0.35 + g.mapped.brilliance * 0.25);
  context.lineWidth = px(1.2);
  context.stroke();

  /* Hatch on the cut face — microstructure. */
  context.save();
  context.beginPath();
  context.moveTo(left + skew, top);
  context.lineTo(right + skew * 0.2, top + height * 0.02);
  context.lineTo(right, bot);
  context.lineTo(left, bot - height * 0.02);
  context.clip();
  const hatch = Math.round(14 + g.mapped.microstructure * 28);
  context.strokeStyle = rgba(PALETTE.pale, 0.04 + g.mapped.microstructure * 0.05);
  context.lineWidth = px(0.7);
  for (let i = 0; i < hatch; i += 1) {
    const t = i / hatch;
    const x = left + t * (right - left);
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x - width * 0.03, bot);
    context.stroke();
  }
  context.restore();

  CHAMBERS.forEach((chamber, index) => {
    const grow = chamber.id === "aperture" ? open : 0.7 + g.mapped.bodyStrength * 0.3;
    const x0 = chamber.x0 + (index - 2) * slip * 0.025 * (g.art.direction >= 0 ? 1 : -1);
    const x1 = x0 + chamber.span * (0.85 + g.mapped.lateralSpread * 0.12);
    const mid = (chamber.y0 + chamber.y1) / 2;
    const h = (chamber.y1 - chamber.y0) * grow * (1 + g.art.stretch * 0.12 * (chamber.id === "gallery" ? 1 : 0.3));
    const y0 = mid - h / 2 + g.art.compression * 0.03 * (chamber.id === "intake" ? 1 : 0);
    const y1 = mid + h / 2;
    const gap = slip * 0.012 * index;
    const selected = band && x0 < band.x1 && x1 > band.x0;
    const rx0 = x0 * width;
    const rx1 = x1 * width;
    const ry0 = (y0 + gap) * height;
    const ry1 = (y1 + gap) * height;

    context.fillStyle = rgba(mixColour(PALETTE.deep, selected ? PALETTE.amber : PALETTE.blue, selected ? 0.35 : 0.12), 0.92);
    context.fillRect(rx0, ry0, rx1 - rx0, ry1 - ry0);

    /* Recessed lip. */
    context.strokeStyle = rgba(selected ? PALETTE.amber : cut, selected ? 0.7 : 0.28);
    context.lineWidth = px(selected ? 1.6 : 1);
    context.strokeRect(rx0, ry0, rx1 - rx0, ry1 - ry0);

    /* Interior activity — emission as a held bar, not a trace. */
    const fill = 0.15 + (chamber.id === "gallery" ? g.mapped.emissionRate : g.mapped.bodyStrength) * 0.55;
    const fx = rx0 + (rx1 - rx0) * g.art.origin;
    const fw = (rx1 - rx0) * (0.12 + g.mapped.displacement * 0.2);
    context.fillStyle = rgba(selected ? PALETTE.amber : PALETTE.ice, 0.12 + fill * 0.28);
    context.fillRect(fx, ry0 + (ry1 - ry0) * 0.35, fw, (ry1 - ry0) * 0.3);

    if (g.signature.fracturePlane && index === 2) {
      context.strokeStyle = rgba(PALETTE.violet, 0.45 + g.art.fractureBias * 0.4);
      context.lineWidth = px(1.4);
      context.beginPath();
      const cx = (rx0 + rx1) / 2;
      context.moveTo(cx, ry0);
      context.lineTo(cx + (unit(g.seedPhase, 9) - 0.5) * (rx1 - rx0) * 0.4, ry1);
      context.stroke();
    }
  });

  /* Coherence bolt line along the block — holds the chambers. */
  context.strokeStyle = rgba(PALETTE.pale, 0.08 + g.coherence * 0.18);
  context.lineWidth = px(2);
  context.beginPath();
  context.moveTo(left + width * 0.04, height * (0.7 + g.breathing * 0.01));
  context.lineTo(right - width * 0.04, height * (0.72 + g.art.stretch * 0.03));
  context.stroke();

  if (g.signature.propagationWave) {
    const fx = (((g.phase * 0.1) % 1.4) - 0.1) * width;
    const grd = context.createLinearGradient(fx - 40, 0, fx + 40, 0);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(0.5, rgba(PALETTE.ice, 0.06 + g.art.propagation * 0.1));
    grd.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = grd;
    context.fillRect(fx - 40, top, 80, bot - top);
  }

  context.restore();
}
