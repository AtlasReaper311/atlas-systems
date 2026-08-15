"use strict";

import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { canvasSize, clamp, unit } from "./proto-core.js";
import {
  disposeFlagshipAnatomyC,
  drawFlagshipAnatomyC,
} from "./field-proto-flagship-organism-anatomy-c-pbr.js";

const RENDERER_ID = "proto-flagship-anatomy-e";
const TAU = Math.PI * 2;
const FIELD_COUNT = 4;

function smoothPulse(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function centreFromAngles(azimuth, elevation) {
  const cosElevation = Math.cos(elevation);
  return {
    x: Math.cos(azimuth) * cosElevation,
    y: Math.sin(elevation),
    z: Math.sin(azimuth) * cosElevation,
  };
}

function roamingFields(g, audioBoost) {
  const fields = [];
  for (let index = 0; index < FIELD_COUNT; index += 1) {
    const seedA = unit(g.seedPhase, 801 + index * 7);
    const seedB = unit(g.seedPhase, 802 + index * 7);
    const seedC = unit(g.seedPhase, 803 + index * 7);
    const seedD = unit(g.seedPhase, 804 + index * 7);

    const driftRate = 0.17 + seedA * 0.16 + index * 0.018;
    const meanderRate = 0.073 + seedB * 0.075;
    const azimuth = g.phase * driftRate
      + seedA * TAU
      + Math.sin(g.phase * meanderRate + seedC * TAU) * (0.58 + seedD * 0.32)
      + Math.sin(g.phase * (0.041 + seedD * 0.032) + seedB * TAU) * 0.31;
    const elevation = Math.sin(
      g.phase * (0.105 + seedC * 0.092) + seedB * TAU,
    ) * (0.42 + seedD * 0.18)
      + Math.cos(g.phase * (0.052 + seedA * 0.048) + seedC * TAU) * 0.16;

    const centre = centreFromAngles(azimuth, elevation);
    const polarity = index === 1 || index === 3 ? -1 : 1;
    const life = 0.72 + 0.28 * Math.sin(
      g.phase * (0.23 + seedD * 0.19) + seedA * TAU,
    );
    const baseStrength = 0.055
      + g.mapped.displacement * 0.062
      + g.pressure * 0.018
      + g.mapped.phaseDisagreement * 0.016;

    fields.push({
      ...centre,
      polarity,
      strength: baseStrength * life * audioBoost * (0.82 + seedB * 0.42),
      sigma: 0.48 + seedC * 0.18,
      flow: (0.043 + g.mapped.displacement * 0.034 + g.mapped.emissionRate * 0.014)
        * audioBoost * (0.82 + seedD * 0.38),
      swirl: (0.018 + g.mapped.phaseDisagreement * 0.035 + g.art.disturbance * 0.012)
        * (index % 2 === 0 ? 1 : -1),
      phase: seedA * TAU + index * 1.37,
    });
  }
  return fields;
}

function applyRoamingTopology(renderer, g) {
  const state = renderer._flagshipAnatomyCWebgl;
  if (!state || state.disposed) return;

  const position = state.geometry.getAttribute("position");
  const colour = state.geometry.getAttribute("color");
  const base = state.basePositions;
  const audioActive = Boolean(renderer.state?.audioEnabled && !renderer.state?.muted);
  const audioBoost = audioActive ? 1.28 : 1;
  const fields = roamingFields(g, audioBoost);
  const coherenceLoss = 1 - g.coherence;
  const roamingEnergy = 0.78
    + g.mapped.displacement * 0.34
    + g.mapped.phaseDisagreement * 0.22
    + g.mapped.brilliance * 0.1;

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

    let radial = 0;
    let flowX = 0;
    let flowY = 0;
    let flowZ = 0;
    let ridge = 0;
    let pressureHere = 0;
    let gradientHere = 0;

    for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
      const field = fields[fieldIndex];
      const dot = clamp(bx * field.x + by * field.y + bz * field.z, -1, 1);
      const distance2 = Math.max(0, 2 - 2 * dot);
      const influence = Math.exp(-distance2 / (field.sigma * field.sigma));
      const ring = influence * (1 - influence) * 4;
      const signedPressure = influence * field.strength * field.polarity;
      pressureHere += signedPressure;
      gradientHere += ring * Math.abs(field.strength);
      radial += signedPressure;

      // Project the moving field centre into the local tangent plane. Positive fields
      // gather matter toward themselves while negative fields gently shed matter away.
      let tx = field.x - bx * dot;
      let ty = field.y - by * dot;
      let tz = field.z - bz * dot;
      const tangentLength = Math.hypot(tx, ty, tz) || 1;
      tx /= tangentLength;
      ty /= tangentLength;
      tz /= tangentLength;
      const pull = ring * field.flow * field.polarity;
      flowX += tx * pull;
      flowY += ty * pull;
      flowZ += tz * pull;

      // A bounded swirl keeps the flow liquid rather than looking like simple inflation.
      const sx = by * field.z - bz * field.y;
      const sy = bz * field.x - bx * field.z;
      const sz = bx * field.y - by * field.x;
      const swirlWave = Math.sin(
        g.phase * (0.72 + fieldIndex * 0.13) + field.phase + dot * 5.2,
      );
      flowX += sx * influence * field.swirl * swirlWave;
      flowY += sy * influence * field.swirl * swirlWave;
      flowZ += sz * influence * field.swirl * swirlWave;

      // Pressure fronts are born at the moving edge of each influence field, so folds
      // appear in different places rather than being tied to a permanent landmark.
      ridge += ring * Math.sin(
        dot * (9.4 + fieldIndex * 1.15)
        - g.phase * (1.12 + fieldIndex * 0.21)
        + field.phase,
      ) * (0.012 + g.mapped.displacement * 0.022 + g.pressure * 0.008);
    }

    // A slower counter-current prevents the entire organism from following one dominant
    // attractor and gives the black liquid a sense of internal volume transfer.
    const counter = Math.sin(
      bx * 2.15 - by * 1.55 + bz * 1.42 + g.phase * 0.63 + unit(g.seedPhase, 889) * TAU,
    ) * Math.cos(
      bx * 1.08 + by * 2.32 - bz * 1.21 - g.phase * 0.41 + unit(g.seedPhase, 890) * TAU,
    );
    const counterAmount = counter * (
      0.015 + g.mapped.displacement * 0.021 + audioBoost * 0.004
    );

    const radialAmount = (radial + ridge + counterAmount) * roamingEnergy;
    px += bx * radialAmount;
    py += by * radialAmount;
    pz += bz * radialAmount;

    px += flowX * roamingEnergy;
    py += flowY * roamingEnergy;
    pz += flowZ * roamingEnergy;

    // The field interference becomes a temporary ferrofluid crest bloom. It is not
    // anchored to a fixed shoulder or seam and therefore migrates with the pressure map.
    const bloomSeed = 0.5 + 0.5 * Math.sin(
      bx * 9.8 + by * 6.4 - bz * 8.6
      + g.phase * (1.82 + g.mapped.emissionRate * 1.35)
      + unit(g.seedPhase, 891) * TAU,
    );
    const bloomGate = smoothPulse(clamp((gradientHere - 0.018) / 0.11));
    const bloom = Math.pow(bloomSeed, 5.4) * bloomGate * (
      0.018
      + g.mapped.microstructure * 0.052
      + g.mapped.displacement * 0.05
      + coherenceLoss * 0.04
    ) * audioBoost;
    px += bx * bloom;
    py += by * bloom;
    pz += bz * bloom;

    // Instability loosens local agreement between neighbouring pressure fields. The
    // resulting slip is strongest where fields overlap, so stress develops organically.
    const slip = Math.sin(
      bx * 4.1 - by * 3.7 + bz * 3.2 + g.phase * 1.37 + unit(g.seedPhase, 892) * TAU,
    ) * coherenceLoss * gradientHere * (0.55 + g.mapped.phaseDisagreement * 1.4);
    px += -by * slip;
    py += bx * slip;
    pz += (bx - bz) * slip * 0.24;

    position.setXYZ(i, px, py, pz);

    if (colour) {
      const pressureGlow = clamp(Math.abs(pressureHere) * 1.9 + gradientHere * 0.62);
      const brilliance = pressureGlow * g.mapped.brilliance;
      colour.setXYZ(
        i,
        clamp(colour.getX(i) + brilliance * 0.022),
        clamp(colour.getY(i) + brilliance * 0.019),
        clamp(colour.getZ(i) + brilliance * 0.038),
      );
    }
  }

  position.needsUpdate = true;
  if (colour) colour.needsUpdate = true;
  state.geometry.computeVertexNormals();
  const normals = state.geometry.getAttribute("normal");
  if (normals) normals.needsUpdate = true;

  // Suspension follows the roaming pressure centroid very slightly. This is not a
  // scripted pose cycle; it is a secondary consequence of the same moving field map.
  let centroidX = 0;
  let centroidY = 0;
  let centroidZ = 0;
  let total = 0;
  for (const field of fields) {
    const weight = Math.max(0.001, Math.abs(field.strength));
    centroidX += field.x * weight;
    centroidY += field.y * weight;
    centroidZ += field.z * weight;
    total += weight;
  }
  centroidX /= total;
  centroidY /= total;
  centroidZ /= total;
  state.group.position.y += centroidY * 0.018;
  state.group.rotation.x += centroidY * 0.02;
  state.group.rotation.y += centroidX * 0.032;
  state.group.rotation.z += centroidZ * 0.012;
}

export function disposeFlagshipAnatomyE(renderer) {
  disposeFlagshipAnatomyC(renderer);
}

export function drawFlagshipAnatomyE(renderer, timestamp = performance.now()) {
  drawFlagshipAnatomyC(renderer, timestamp);

  const { width, height } = canvasSize(renderer.canvas);
  const g = deriveFieldGeometry(renderer.state, renderer.visualTime, width, height);
  const state = renderer._flagshipAnatomyCWebgl;
  if (!state || state.disposed) return;

  applyRoamingTopology(renderer, g);
  state.webgl.render(state.scene, state.camera);

  renderer.canvas.dataset.fieldRenderer = RENDERER_ID;
  renderer.canvas.dataset.fieldBackend = "webgl";
}
