"use strict";

import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { canvasSize, clamp, unit } from "./proto-core.js";
import {
  disposeFlagshipAnatomyC,
  drawFlagshipAnatomyC,
} from "./field-proto-flagship-organism-anatomy-c-pbr.js";

const RENDERER_ID = "proto-flagship-anatomy-d";

function smoothPulse(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function gaussian3(x, y, z, cx, cy, cz, sx, sy, sz) {
  const dx = (x - cx) / sx;
  const dy = (y - cy) / sy;
  const dz = (z - cz) / sz;
  return Math.exp(-(dx * dx + dy * dy + dz * dz));
}

function applyLivingMotion(renderer, g) {
  const state = renderer._flagshipAnatomyCWebgl;
  if (!state || state.disposed) return;

  const position = state.geometry.getAttribute("position");
  const colour = state.geometry.getAttribute("color");
  const base = state.basePositions;
  const lifeRate = 0.56 + g.mapped.emissionRate * 0.78;
  const lifePhase = g.phase * lifeRate;
  const shoulderPulse = Math.sin(lifePhase);
  const crestPulse = Math.sin(lifePhase - 0.82);
  const waistPulse = Math.sin(lifePhase - 1.58);
  const trailerPulse = Math.sin(lifePhase - 2.42);
  const coherenceLoss = 1 - g.coherence;
  const audioDrive = clamp(
    g.mapped.displacement * 0.48
    + g.mapped.phaseDisagreement * 0.24
    + g.mapped.brilliance * 0.2
    + g.mapped.emissionRate * 0.08,
  );
  const motion = 0.042
    + g.mapped.displacement * 0.06
    + audioDrive * 0.028
    + g.pressure * 0.016;
  const seedA = unit(g.seedPhase, 701);
  const seedB = unit(g.seedPhase, 702);

  for (let i = 0; i < position.count; i += 1) {
    const offset = i * 3;
    let bx = base[offset];
    let by = base[offset + 1];
    let bz = base[offset + 2];
    const baseLength = Math.hypot(bx, by, bz) || 1;
    bx /= baseLength;
    by /= baseLength;
    bz /= baseLength;

    let px = position.getX(i);
    let py = position.getY(i);
    let pz = position.getZ(i);

    const shoulder = gaussian3(bx, by, bz, -0.5, 0.3, 0.02, 0.4, 0.38, 1.2);
    const trailer = gaussian3(bx, by, bz, 0.5, -0.16, -0.02, 0.46, 0.46, 1.2);
    const crest = gaussian3(bx, by, bz, -0.08, 0.57, 0.02, 0.52, 0.25, 1.1);
    const waist = gaussian3(bx, by, bz, 0.12, -0.16, 0.03, 0.42, 0.3, 1.25);
    const lowerShelf = gaussian3(bx, by, bz, -0.22, -0.52, 0.04, 0.58, 0.24, 1.05);
    const frontRead = 0.42 + 0.58 * smoothPulse((bz + 1) * 0.5);

    // Pressure travels shoulder -> crest -> waist -> trailing lobe with deliberate phase lag.
    px += shoulder * shoulderPulse * motion * -0.62;
    py += shoulder * shoulderPulse * motion * 1.34;
    pz += shoulder * shoulderPulse * motion * 0.28 * frontRead;

    px += crest * crestPulse * motion * -0.28;
    py += crest * crestPulse * motion * 1.08;
    pz += crest * crestPulse * motion * 0.22 * frontRead;

    const pinch = waistPulse * motion;
    px -= waist * pinch * 0.34;
    py += waist * pinch * 0.78;
    pz -= waist * pinch * 0.32 * frontRead;

    px += trailer * trailerPulse * motion * 1.22;
    py += trailer * trailerPulse * motion * 0.58;
    pz -= trailer * trailerPulse * motion * 0.42 * frontRead;

    py += lowerShelf * Math.sin(lifePhase - 3.12) * motion * 0.35;

    // A travelling pressure packet visibly walks along the upper seam and pulls nearby matter.
    const seamAlong = bx * 0.92 + bz * 0.82;
    const seamTargetY = 0.18
      + Math.sin(seamAlong * 1.7 + seedA * 3.4 + g.phase * 0.072) * 0.13
      + Math.cos((bx - bz) * 1.18 + seedB * 2.5) * 0.055;
    const seamDistance = by - seamTargetY;
    const seamEnvelope = Math.exp(-Math.pow(seamDistance / 0.13, 2))
      * smoothPulse((by + 0.16) * 1.08 + 0.45)
      * (0.36 + 0.64 * smoothPulse((bz + 0.9) * 0.56));
    const seamWave = Math.pow(
      0.5 + 0.5 * Math.sin(seamAlong * 4.6 - lifePhase * 3.35 + seedA * 2.2),
      2.35,
    );
    const seamMotion = seamEnvelope * seamWave * (
      0.035 + g.mapped.displacement * 0.026 + audioDrive * 0.018
    );
    px -= seamMotion * 0.44;
    py += seamMotion * 1.5;
    pz += seamMotion * 0.42 * frontRead;

    // Two low-frequency liquid tides make the silhouette breathe non-uniformly.
    const tide = Math.sin(
      bx * 1.65 - by * 1.3 + bz * 1.08 + lifePhase * 1.16,
    );
    const counterTide = Math.cos(
      bx * 1.15 + by * 1.45 - bz * 1.28 - lifePhase * 0.78,
    );
    const tideAmount = tide * (0.012 + g.mapped.displacement * 0.018 + audioDrive * 0.012)
      + counterTide * (0.006 + g.mapped.displacement * 0.009);
    px += bx * tideAmount;
    py += by * tideAmount;
    pz += bz * tideAmount;

    // Micro-spikes now form/dissolve in moving pressure zones instead of reading as static texture.
    const microA = 0.5 + 0.5 * Math.sin(
      bx * 10.2 + by * 6.1 - bz * 8.4 + lifePhase * 2.2 + seedA * 3.1,
    );
    const microB = 0.5 + 0.5 * Math.cos(
      bx * 5.0 - by * 11.0 + bz * 8.9 - lifePhase * 1.68 + seedB * 4.0,
    );
    const microPeak = Math.pow(clamp((microA * microB - 0.57) / 0.43), 3.4);
    const pressureZone = clamp(
      shoulder * 0.38 + crest * 0.42 + seamEnvelope * 0.48 + coherenceLoss * 0.22,
    );
    const microLift = microPeak * pressureZone * (
      0.018
      + g.mapped.microstructure * 0.05
      + g.mapped.displacement * 0.052
      + audioDrive * 0.02
    );
    px += bx * microLift;
    py += by * microLift;
    pz += bz * microLift;

    // Instability creates asymmetric local slip, not a global wobble.
    const slip = Math.sin(
      bx * 3.6 - by * 4.4 + bz * 2.7 + lifePhase * 1.45,
    ) * coherenceLoss * (0.007 + g.mapped.phaseDisagreement * 0.032);
    px += -by * slip;
    py += bx * slip;

    position.setXYZ(i, px, py, pz);

    // Brilliance is expressed as sharper local specular structure through restrained vertex lift.
    if (colour) {
      const glint = clamp(
        seamWave * seamEnvelope * 0.035
        + microPeak * pressureZone * g.mapped.brilliance * 0.045,
      );
      colour.setXYZ(
        i,
        clamp(colour.getX(i) + glint * 0.24),
        clamp(colour.getY(i) + glint * 0.22),
        clamp(colour.getZ(i) + glint * 0.38),
      );
    }
  }

  position.needsUpdate = true;
  if (colour) colour.needsUpdate = true;
  state.geometry.computeVertexNormals();
  const normals = state.geometry.getAttribute("normal");
  if (normals) normals.needsUpdate = true;

  // Keep camera movement restrained. Most of D's life comes from the body itself.
  state.group.position.y += Math.cos(lifePhase * 0.21) * 0.007;
  state.group.rotation.x += Math.sin(lifePhase * 0.2) * 0.011;
  state.group.rotation.y += Math.sin(lifePhase * 0.17) * 0.018;
}

export function disposeFlagshipAnatomyD(renderer) {
  disposeFlagshipAnatomyC(renderer);
}

export function drawFlagshipAnatomyD(renderer, timestamp = performance.now()) {
  drawFlagshipAnatomyC(renderer, timestamp);

  const { width, height } = canvasSize(renderer.canvas);
  const g = deriveFieldGeometry(renderer.state, renderer.visualTime, width, height);
  const state = renderer._flagshipAnatomyCWebgl;
  if (!state || state.disposed) return;

  applyLivingMotion(renderer, g);
  state.webgl.render(state.scene, state.camera);

  renderer.canvas.dataset.fieldRenderer = RENDERER_ID;
  renderer.canvas.dataset.fieldBackend = "webgl";
}
