"use strict";

/* PROTOTYPE — PHASE-CONTRAST PLATE (development only).
 *
 * A photographic interference plate. The body is the fringe field itself:
 * carrier, beat envelope, dislocations. Brightness is constructive interference,
 * not a stroke. Selecting a route locally delays phase and warps nearby fringes.
 */

import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { transitionMix } from "../spectral-field-state.js";
import { PALETTE, canvasSize, clamp, fieldBuffer, mixColour, routeBand, unit } from "./proto-core.js";

const GW = 240;
const GH = 80;

export function draw(timestamp = performance.now()) {
  if (!this.context || !this.state) return;
  this.canvas.dataset.fieldRenderer = "proto-interference";
  const { width, height } = canvasSize(this.canvas);
  const context = this.context;
  const { selectedMapping } = this.state;
  const g = deriveFieldGeometry(this.state, this.visualTime, width, height);
  const mix = transitionMix.call(this, timestamp);
  const band = routeBand(selectedMapping);
  const image = fieldBuffer(this, context, GW, GH);
  const pix = image.data;

  const carrier = 18 + g.mapped.microstructure * 28;
  const tilt = 0.08 + g.mapped.lateralSpread * 0.12;
  const envW = 0.18 + g.mapped.aperture * 0.28;
  const envY = 0.5 + g.art.direction * 0.04;
  const slip = g.mapped.phaseDisagreement;
  const body = 0.35 + g.mapped.bodyStrength * 0.65;
  const seed = g.seedPhase;
  const fractureX = 0.3 + g.art.propagation * 0.4;

  for (let y = 0; y < GH; y += 1) {
    const ny = (y + 0.5) / GH;
    for (let x = 0; x < GW; x += 1) {
      const nx = (x + 0.5) / GW;
      const envelope = Math.exp(-(((ny - envY) / envW) ** 2)) * body;
      let delay = envelope * (0.8 + g.art.compression * 1.4) * Math.sin(nx * Math.PI * 2.2 - g.phase * 0.2);
      delay += g.art.upstreamPressure * 1.1 * Math.exp(-((nx - 0.18) ** 2) / 0.02);
      delay += g.art.stretch * 0.9 * Math.max(0, nx - 0.55);
      if (band && nx >= band.x0 && nx <= band.x1) {
        delay += Math.sin(((nx - band.x0) / (band.x1 - band.x0)) * Math.PI) * 1.6;
      }
      if (g.signature.phaseSlip || slip > 0.42) {
        const jump = nx > fractureX ? Math.PI * (0.6 + slip) : 0;
        delay += jump + slip * 2.2 * Math.sin(ny * 14 + g.phase);
      }
      if (g.signature.fracturePlane) {
        delay += g.art.fractureBias * 3 * Math.sin((nx - fractureX) * 80) * Math.exp(-((nx - fractureX) ** 2) / 0.004);
      }

      const ref = Math.cos((nx + ny * tilt) * carrier * Math.PI * 2);
      const obj = Math.cos((nx + ny * tilt) * carrier * Math.PI * 2 + delay);
      let I = (ref * 0.55 + obj * (0.45 + envelope * 0.5));
      I = I * I;
      I *= 0.25 + envelope * 0.85;
      I += (unit(seed, x + y * GW) - 0.5) * g.mapped.granularFracture * 0.12;
      if (g.health.severity > 0.5) I *= 1 - (g.health.severity - 0.5) * 0.45 * (1 - envelope);
      I = clamp(I);
      I = Math.pow(I, 0.72);

      let col = mixColour([6, 7, 12], PALETTE.pale, I);
      if (I > 0.45) col = mixColour(col, PALETTE.ice, (I - 0.45) * 0.35);
      if (band && nx >= band.x0 && nx <= band.x1 && I > 0.2) {
        col = mixColour(col, PALETTE.amber, 0.18 * envelope);
      }
      if (g.health.severity > 0.6 && Math.abs(nx - fractureX) < 0.04) {
        col = mixColour(col, PALETTE.violet, 0.35);
      }

      const o = (y * GW + x) * 4;
      const a = 0.35 + mix * 0.65;
      pix[o] = Math.round(col[0] * a);
      pix[o + 1] = Math.round(col[1] * a);
      pix[o + 2] = Math.round(col[2] * a);
      pix[o + 3] = 255;
    }
  }

  context.globalCompositeOperation = "source-over";
  context.fillStyle = "#05060a";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const key = "_fieldProtoCanvas";
  let off = this[key];
  if (!off || off.width !== GW || off.height !== GH) {
    off = document.createElement("canvas");
    off.width = GW;
    off.height = GH;
    this[key] = off;
  }
  off.getContext("2d").putImageData(image, 0, 0);
  context.drawImage(off, 0, 0, width, height);
}
