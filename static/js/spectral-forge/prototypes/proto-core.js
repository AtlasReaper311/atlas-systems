"use strict";

/* Shared deterministic renderer support retained from the Spectral Field art
 * bake-off. The approved living final-form renderer now imports this module in
 * the shipped/default graph, while historical prototypes may continue to use
 * the same helpers for comparison. Keep this module deterministic and free of
 * renderer-specific scenario choreography.
 */

import { clamp } from "../domain.js";
import { deterministicUnit } from "../spectral-field-model.js";

export const PALETTE = Object.freeze({
  ice: [150, 224, 255],
  blue: [116, 168, 255],
  violet: [156, 142, 255],
  pale: [226, 238, 255],
  amber: [245, 166, 35],
  deep: [10, 16, 34],
});

export function rgba(colour, alpha) {
  return `rgba(${colour[0]},${colour[1]},${colour[2]},${Math.max(0, Math.min(1, alpha))})`;
}

export function mixColour(a, b, t) {
  const k = clamp(t);
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

export const SIGNAL_CHANNELS = Object.freeze([
  Object.freeze({ id: "request_rate", colour: PALETTE.ice, lane: -0.62, phase: 0.11 }),
  Object.freeze({ id: "latency_ms", colour: PALETTE.blue, lane: -0.3, phase: 0.29 }),
  Object.freeze({ id: "error_rate", colour: PALETTE.violet, lane: 0.04, phase: 0.47 }),
  Object.freeze({ id: "cache_hit_rate", colour: PALETTE.pale, lane: 0.34, phase: 0.63 }),
  Object.freeze({ id: "anomaly_score", colour: PALETTE.violet, lane: 0.64, phase: 0.81 }),
]);

export function canvasSize(canvas) {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, ratio };
}

/* A real perspective camera. The shipped renderer scales depth linearly, which
 * is why it reads as flat wireframe; a focal divide gives actual volume.
 */
export function makeCamera(g, width, height) {
  /* The Field stage is roughly 3:1, so a single isotropic scale leaves the form
   * marooned in the middle. Fill the height, then stretch laterally so the
   * architecture occupies the stage without becoming a flat ribbon.
   */
  const scaleY = height * 0.47;
  const scaleX = scaleY * (1.62 + g.mapped.lateralSpread * 0.22);
  const focal = 2.6;
  const yaw = g.torsion * 0.5 + g.asymmetry * 0.16;
  const pitch = 0.2 + g.tilt * 0.5;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const originX = width * 0.5 + (g.centerX / Math.max(1, width) - 0.5) * width * 0.12;
  const originY = height * 0.52 + g.art.direction * g.art.propagation * height * 0.03;

  return function project(x, y, z) {
    const rx = x * cy - z * sy;
    const rz = x * sy + z * cy;
    const ry = y * cp - rz * sp;
    const dz = ry * 0 + (rz * cp + y * sp);
    const depth = focal + dz;
    const k = focal / Math.max(0.35, depth);
    return { x: originX + rx * scaleX * k, y: originY + ry * scaleY * k, k, depth: dz };
  };
}

/* Painter's algorithm. Faces are collected then sorted back-to-front so
 * translucent volumes occlude correctly instead of stacking additively.
 */
export function paintFaces(context, faces) {
  faces.sort((a, b) => a.depth - b.depth);
  for (const face of faces) {
    const pts = face.points;
    if (!pts || pts.length < 3) continue;
    context.beginPath();
    context.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) context.lineTo(pts[i].x, pts[i].y);
    context.closePath();
    if (face.fill) {
      context.fillStyle = face.fill;
      context.fill();
    }
    if (face.stroke) {
      context.strokeStyle = face.stroke;
      context.lineWidth = face.lineWidth ?? 1;
      context.stroke();
    }
  }
}

export function backdrop(context, g, width, height) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#05060c";
  context.fillRect(0, 0, width, height);
  const glow = context.createRadialGradient(width * 0.5, height * 0.5, 0, width * 0.5, height * 0.5, Math.max(width, height) * 0.62);
  const core = mixColour(PALETTE.blue, PALETTE.violet, g.art.disturbance);
  glow.addColorStop(0, rgba(core, 0.05 + g.mapped.bodyStrength * 0.05));
  glow.addColorStop(0.55, rgba(PALETTE.deep, 0.16));
  glow.addColorStop(1, "rgba(5,6,12,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
}

/* Signal amplitude at a normalised position along its path. Deterministic:
 * driven by the frame's own normalised telemetry plus the shared phase.
 */
export function signalAmplitude(g, frame, channel, t) {
  const value = clamp(frame.normalised[channel.id] ?? 0.5);
  const travel = Math.sin((t * 3.1 - g.phase * (0.5 + g.mapped.emissionRate * 0.9) + channel.phase * 6.28));
  return {
    value,
    pulse: 0.5 + travel * 0.5,
    offset: travel * (0.05 + value * 0.11 + g.mapped.displacement * 0.06),
  };
}

export function unit(seed, index) {
  return deterministicUnit(seed, index);
}

/* Selected route is a region of the instrument, not a coloured trace. */
export function routeBand(selectedMapping) {
  const source = selectedMapping?.source;
  if (!source) return null;
  if (source === "request_rate") return { x0: 0.06, x1: 0.28 };
  if (source === "cache_hit_rate") return { x0: 0.14, x1: 0.38 };
  if (source === "error_rate") return { x0: 0.36, x1: 0.62 };
  if (source === "anomaly_score") return { x0: 0.48, x1: 0.78 };
  if (source === "latency_ms") return { x0: 0.64, x1: 0.92 };
  return { x0: 0.3, x1: 0.7 };
}

export function fieldBuffer(renderer, context, gw, gh) {
  const key = "_fieldProtoBuffer";
  const existing = renderer[key];
  if (!existing || existing.width !== gw || existing.height !== gh) {
    renderer[key] = context.createImageData(gw, gh);
  }
  return renderer[key];
}

export { clamp };
