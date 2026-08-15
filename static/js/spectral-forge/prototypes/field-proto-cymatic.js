"use strict";

/* PROTOTYPE — RECTANGULAR CYMATIC PLATE (development only).
 *
 * Sand on a plate. The plate IS the stage, so 3:1 and near-square are just
 * different rectangular modes of the same object. Sand collects at nodes.
 * Nothing glows. Failure is the figure losing lock, not a colour change.
 */

import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { transitionMix } from "../spectral-field-state.js";
import { PALETTE, canvasSize, clamp, fieldBuffer, mixColour, routeBand, unit } from "./proto-core.js";

const GW = 320;
const GH = 108;

export function draw(timestamp = performance.now()) {
  if (!this.context || !this.state) return;
  this.canvas.dataset.fieldRenderer = "proto-cymatic";
  const { width, height } = canvasSize(this.canvas);
  const context = this.context;
  const { selectedMapping } = this.state;
  const g = deriveFieldGeometry(this.state, this.visualTime, width, height);
  const mix = transitionMix.call(this, timestamp);
  const band = routeBand(selectedMapping);
  const image = fieldBuffer(this, context, GW, GH);
  const pix = image.data;

  const m = 4.2 + g.mapped.emissionRate * 8.5 + g.mapped.microstructure * 2;
  const n = 2.1 + g.mapped.aperture * 3.2 + g.mapped.lateralSpread * 0.8;
  const m2 = m * (1.08 + g.mapped.phaseDisagreement * 0.35);
  const n2 = n * (0.92 + g.mapped.phaseDisagreement * 0.4);
  const drive = 0.25 + g.mapped.displacement * 0.75;
  const lock = clamp(g.coherence * (1 - g.mapped.phaseDisagreement * 0.7));
  const seed = g.seedPhase;
  const rim = 0.045;

  for (let y = 0; y < GH; y += 1) {
    const ny = (y + 0.5) / GH;
    for (let x = 0; x < GW; x += 1) {
      const nx = (x + 0.5) / GW;
      const onPlate = nx > rim && nx < 1 - rim && ny > rim * 1.6 && ny < 1 - rim * 1.6;
      const edge = Math.min(nx / rim, (1 - nx) / rim, ny / (rim * 1.6), (1 - ny) / (rim * 1.6));
      const rimLit = !onPlate && edge > 0 ? clamp(1 - Math.abs(edge - 0.55) * 4) : 0;

      let sand = 0;
      if (onPlate) {
        const px = (nx - rim) / (1 - 2 * rim);
        const py = (ny - rim * 1.6) / (1 - 3.2 * rim);
        const modeA = Math.sin(m * Math.PI * px) * Math.sin(n * Math.PI * py);
        const modeB = Math.sin(m2 * Math.PI * px) * Math.sin(n2 * Math.PI * py);
        const field = modeA * lock + modeB * (1 - lock) * 0.85;
        const node = Math.exp(-((Math.abs(field) / (0.035 + (1 - lock) * 0.12)) ** 2));
        sand = Math.pow(node, 0.7) * drive * (0.75 + g.mapped.bodyStrength * 0.4);
        sand *= 0.7 + unit(seed, x * 3 + y * 11) * 0.3;
        if (g.health.severity > 0.35) {
          sand *= 1 - g.health.severity * 0.45;
          sand += g.mapped.granularFracture * 0.5 * unit(seed, x * 17 + y * 29) * g.health.severity;
        }
        if (band && nx >= band.x0 && nx <= band.x1) {
          const local = Math.sin(((nx - band.x0) / Math.max(0.01, band.x1 - band.x0)) * Math.PI);
          sand *= 1 + local * 0.35;
        }
        if (g.signature.fracturePlane) {
          const crack = Math.exp(-((py - 0.5 - g.art.direction * 0.1) ** 2) / 0.002);
          sand *= 1 - crack * g.art.fractureBias * 0.85;
        }
      }

      let col;
      if (!onPlate) {
        col = mixColour([8, 8, 12], PALETTE.pale, rimLit * (0.22 + g.mapped.brilliance * 0.18));
      } else {
        const plate = mixColour([12, 12, 16], PALETTE.deep, 0.4);
        col = mixColour(plate, PALETTE.pale, clamp(sand));
        if (band && nx >= band.x0 && nx <= band.x1 && sand > 0.2) {
          col = mixColour(col, PALETTE.amber, 0.2 * sand);
        }
        if (g.health.severity > 0.6 && sand > 0.15) {
          col = mixColour(col, PALETTE.violet, (g.health.severity - 0.6) * 0.35);
        }
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
