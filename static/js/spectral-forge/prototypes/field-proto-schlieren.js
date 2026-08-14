"use strict";

/* PROTOTYPE — SCHLIEREN TEST SECTION (development only).
 *
 * A photograph of air, not a drawing of an object. The stage is a filled
 * test-section slice: rolls, a floor, shocks. Brightness is the knife-edge
 * derivative of a density field stored in a buffer — nothing is stroked.
 */

import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { transitionMix } from "../spectral-field-state.js";
import { PALETTE, canvasSize, clamp, fieldBuffer, mixColour, routeBand, unit } from "./proto-core.js";

const GW = 280;
const GH = 96;

export function draw(timestamp = performance.now()) {
  if (!this.context || !this.state) return;
  this.canvas.dataset.fieldRenderer = "proto-schlieren";
  const { width, height } = canvasSize(this.canvas);
  const context = this.context;
  const { selectedMapping } = this.state;
  const g = deriveFieldGeometry(this.state, this.visualTime, width, height);
  const mix = transitionMix.call(this, timestamp);
  const band = routeBand(selectedMapping);
  const image = fieldBuffer(this, context, GW, GH);
  const pix = image.data;
  const dens = this._fieldDens && this._fieldDens.length === GW * GH
    ? this._fieldDens
    : (this._fieldDens = new Float32Array(GW * GH));

  const cells = 7.5 + g.mapped.emissionRate * 9;
  const rolls = 3.2 + g.mapped.aperture * 2.4;
  const amp = 0.22 + g.mapped.displacement * 0.55;
  const shockX = 0.2 + g.art.propagation * 0.5;
  const turb = g.mapped.phaseDisagreement;
  const sev = g.health.severity;
  const seed = g.seedPhase;
  const gain = 7 + g.mapped.brilliance * 10;

  for (let y = 0; y < GH; y += 1) {
    const ny = (y + 0.5) / GH;
    for (let x = 0; x < GW; x += 1) {
      const nx = (x + 0.5) / GW;
      const thermal = (1 - ny) * (0.25 + g.art.upstreamPressure * 0.4);
      const roll = Math.sin((nx - g.phase * 0.015) * cells * Math.PI * 2) * Math.sin(ny * rolls * Math.PI);
      let φ = thermal + roll * amp;
      φ += g.art.compression * 0.35 * Math.exp(-(((nx - 0.16) ** 2) + ((ny - 0.55) ** 2)) / 0.04);
      φ += g.art.stretch * 0.2 * nx * Math.sin(ny * Math.PI);
      if (sev > 0.25) {
        φ += sev * 0.55 * Math.tanh((nx - shockX) * (12 + g.art.fractureBias * 28));
        φ += g.art.fractureBias * 0.4 * Math.sin((nx - shockX) * 40) * Math.exp(-((ny - 0.5) ** 2) / 0.06);
      }
      if (turb > 0.1) {
        φ += turb * 0.22 * Math.sin(nx * 28 + ny * 22 + g.phase * 0.8) * Math.sin(nx * 11 - ny * 9);
      }
      if (band && nx >= band.x0 && nx <= band.x1) {
        φ += 0.18 * Math.sin(((nx - band.x0) / (band.x1 - band.x0)) * Math.PI);
      }
      dens[y * GW + x] = φ;
    }
  }

  const aMix = 0.35 + mix * 0.65;
  for (let y = 0; y < GH; y += 1) {
    const ny = (y + 0.5) / GH;
    for (let x = 0; x < GW; x += 1) {
      const i = y * GW + x;
      const nx = (x + 0.5) / GW;
      const ym = dens[y > 0 ? i - GW : i];
      const yp = dens[y < GH - 1 ? i + GW : i];
      const dφ = yp - ym;
      let lum = 0.07 + dφ * gain;
      lum += (unit(seed, x * 13 + y * 7) - 0.5) * g.mapped.granularFracture * 0.12;
      const floor = Math.exp(-(((ny - 0.9) ** 2) / 0.00025));
      lum = Math.max(lum, floor * 0.28);
      lum = clamp(lum);
      lum = Math.pow(lum, 0.78);

      let col = mixColour([5, 6, 10], PALETTE.pale, lum);
      if (lum > 0.45) col = mixColour(col, PALETTE.ice, (lum - 0.45) * 0.55);
      if (band && nx >= band.x0 && nx <= band.x1 && lum > 0.2) {
        col = mixColour(col, PALETTE.amber, 0.16);
      }
      if (sev > 0.55 && Math.abs(nx - shockX) < 0.05 && lum > 0.35) {
        col = mixColour(col, PALETTE.violet, 0.28);
      }

      const o = i * 4;
      pix[o] = Math.round(col[0] * aMix);
      pix[o + 1] = Math.round(col[1] * aMix);
      pix[o + 2] = Math.round(col[2] * aMix);
      pix[o + 3] = 255;
    }
  }

  context.globalCompositeOperation = "source-over";
  context.fillStyle = "#05060a";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = false;
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
