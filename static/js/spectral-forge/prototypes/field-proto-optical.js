"use strict";

/* PROTOTYPE - SPECTRAL BENCH (development only). Revision 2.
 *
 * Register:     precision optical glass.
 * Substrate:    structure revealed only by light.
 * Composition:  full-bleed field, no focal object.
 * Motion:       charged stillness that erupts.
 *
 * Revision 1 sent beams down parallel lanes, which is a line chart. Light in
 * glass does the opposite: it converges to a waist, crosses, and blooms out
 * again. So this draws many thin additive rays instead of a few thick ones, and
 * lets brightness emerge from ray DENSITY. Where rays bunch you get a caustic;
 * where they spread you get near-darkness. Nothing draws a "glow" directly.
 *
 * The glass itself is never drawn as a body. You infer it from where the light
 * bends, plus a hairline glint at the stations where it pinches.
 */

import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { transitionMix } from "../spectral-field-state.js";
import { PALETTE, SIGNAL_CHANNELS, canvasSize, clamp, mixColour, rgba, unit } from "./proto-core.js";

const STATIONS = 6;        // optical stations across the bench
const RAYS = 19;           // rays per signal bundle
const DUST = 70;

/* Focal power of a station. >1 inverts the bundle: rays cross, which is what
 * produces the bright knots. Held mostly steady, breathing slowly.
 */
function stationPower(g, k) {
  const seed = unit(g.seedPhase, k * 5);
  // Dioptric power. Around 6 refocuses within one station spacing, so the
  // bundle repeatedly pinches and blooms across the bench.
  const base = 4.6 + seed * 5.2;
  const breathe = Math.sin(g.phase * 0.11 + k * 1.3) * (0.9 + g.mapped.displacement * 1.7);
  const slip = g.mapped.phaseDisagreement * 2.4 * Math.sin(g.phase * 0.37 + k * 2.1);
  return Math.max(0.4, base + breathe + slip);
}

/* The optical axis wanders across the bench so the light snakes instead of
 * running level.
 */
function stationAxis(g, k) {
  const seed = unit(g.seedPhase, k * 5 + 2);
  return 0.5
    + (seed - 0.5) * 0.34
    + Math.sin(g.phase * 0.08 + k * 0.9) * 0.035
    + g.art.direction * g.art.propagation * 0.05;
}

function stationX(k) {
  return 0.5 / STATIONS + (k / STATIONS) * (1 - 1 / STATIONS);
}

export function draw(timestamp = performance.now()) {
  if (!this.context || !this.state) return;
  this.canvas.dataset.fieldRenderer = "proto-optical-bench";
  const { width, height, ratio } = canvasSize(this.canvas);
  const context = this.context;
  const { frame, selectedMapping, routeFocus } = this.state;
  const g = deriveFieldGeometry(this.state, this.visualTime, width, height);
  const mix = transitionMix.call(this, timestamp);
  const px = (v) => v * ratio;

  context.globalCompositeOperation = "source-over";
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#03040a";
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalAlpha = 0.3 + mix * 0.7;

  const powers = [];
  const axes = [];
  for (let k = 0; k < STATIONS; k += 1) {
    powers.push(stationPower(g, k));
    axes.push(stationAxis(g, k));
  }

  /* Trace one ray through every station. Each station pulls the ray toward its
   * axis by its focal power; power above 1 pushes it through and out the far
   * side, so bundles cross.
   */
  /* Ray transfer. Each ray carries a position and an angle. Free propagation
   * moves it; a station bends its angle toward the axis in proportion to how
   * far off-axis it is. That is what lets the bundle focus, cross, and open out
   * again instead of collapsing once and staying collapsed.
   */
  const dx = 1 / (STATIONS + 1);
  function trace(entryY, entryTheta, wobble) {
    let y = entryY;
    let theta = entryTheta;
    const pts = [{ x: 0, y }];
    for (let k = 0; k < STATIONS; k += 1) {
      y += theta * dx;
      theta -= powers[k] * (y - axes[k]);
      theta += Math.sin(g.phase * 0.19 + k * 1.7 + wobble) * (0.006 + g.mapped.phaseDisagreement * 0.05);
      pts.push({ x: stationX(k), y });
    }
    y += theta * dx;
    pts.push({ x: 1, y });
    return pts;
  }

  function strokeRay(pts, colour, alpha, lineWidth) {
    context.beginPath();
    context.moveTo(pts[0].x * width, pts[0].y * height);
    for (let i = 1; i < pts.length; i += 1) {
      context.lineTo(pts[i].x * width, pts[i].y * height);
    }
    context.strokeStyle = rgba(colour, alpha);
    context.lineWidth = lineWidth;
    context.stroke();
  }

  /* ---- Light. Additive, so density is brightness. ---- */
  context.globalCompositeOperation = "lighter";

  const spread = 0.1 + g.mapped.aperture * 0.3 + g.mapped.lateralSpread * 0.12;
  const bundles = [];

  for (let b = 0; b < SIGNAL_CHANNELS.length; b += 1) {
    const channel = SIGNAL_CHANNELS[b];
    const selected = selectedMapping?.source === channel.id;
    if (routeFocus && selectedMapping && !selected) continue;
    const value = clamp(frame.normalised[channel.id] ?? 0.5);
    const colour = selected ? PALETTE.amber : channel.colour;
    const entry = 0.5 + channel.lane * (0.1 + g.mapped.lateralSpread * 0.14);

    // Dispersion: the bundle's tint separates slightly as brilliance rises.
    const disperse = 0.002 + g.mapped.brilliance * 0.01;
    const rays = [];
    for (let r = 0; r < RAYS; r += 1) {
      const t = RAYS === 1 ? 0.5 : r / (RAYS - 1);
      const entryY = entry + (t - 0.5) * spread * 0.35;
      const entryTheta = (t - 0.5) * (0.5 + g.mapped.aperture * 1.1);
      const pts = trace(entryY, entryTheta, b * 2.1 + r * 0.4);
      rays.push(pts);
      const edge = Math.abs(t - 0.5) * 2;
      const tint = mixColour(colour, edge > 0.6 ? PALETTE.violet : PALETTE.ice, edge * 0.5);
      // Low alpha per ray: brightness must come from overlap, not from one stroke.
      strokeRay(pts, tint, (selected ? 0.13 : 0.062) + value * 0.045, px(selected ? 1.15 : 0.8));
      if (disperse > 0.006) {
        strokeRay(pts.map((p) => ({ x: p.x, y: p.y + disperse })), PALETTE.violet, 0.055, px(0.75));
        strokeRay(pts.map((p) => ({ x: p.x, y: p.y - disperse })), PALETTE.ice, 0.055, px(0.75));
      }
    }
    bundles.push({ rays, colour, value, selected, channel });
  }

  /* ---- Waist glints: a hairline where the bundle pinches. This, and the
   * bending of the light itself, is the only evidence the glass is there. ---- */
  for (let k = 0; k < STATIONS; k += 1) {
    let lo = 1;
    let hi = 0;
    for (const bundle of bundles) {
      for (const pts of bundle.rays) {
        const y = pts[k + 1].y;
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
    }
    if (hi <= lo) continue;
    const tightness = clamp(1 - (hi - lo) / 0.34);
    if (tightness < 0.15) continue;
    const x = stationX(k) * width;
    const cy = ((lo + hi) / 2) * height;
    const half = Math.max(px(6), ((hi - lo) / 2) * height + px(10));
    const glint = context.createLinearGradient(x, cy - half, x, cy + half);
    glint.addColorStop(0, "rgba(0,0,0,0)");
    glint.addColorStop(0.5, rgba(mixColour(PALETTE.pale, PALETTE.amber, g.art.bloomBias * 0.35), 0.1 + tightness * 0.5 * g.coherence));
    glint.addColorStop(1, "rgba(0,0,0,0)");
    context.strokeStyle = glint;
    context.lineWidth = px(1);
    context.beginPath();
    context.moveTo(x, cy - half);
    context.lineTo(x, cy + half);
    context.stroke();
  }

  /* ---- Eruptions: the bench is quiet until state crosses a threshold. ---- */

  // A fractured station shears its bundle and throws scatter.
  if (g.signature.fracturePlane) {
    const k = Math.floor(unit(g.seedPhase, 401) * STATIONS);
    const x = stationX(k) * width;
    const cy = axes[k] * height;
    const reach = px(30 + g.art.fractureBias * 130);
    const shards = Math.round(5 + g.art.fractureBias * 12);
    for (let s = 0; s < shards; s += 1) {
      const a = (unit(g.seedPhase, 401 + s) - 0.5) * 1.7;
      context.strokeStyle = rgba(mixColour(PALETTE.ice, PALETTE.violet, unit(g.seedPhase, s + 90)), 0.08 + g.art.fractureBias * 0.28);
      context.lineWidth = px(0.9);
      context.beginPath();
      context.moveTo(x, cy);
      context.lineTo(x + Math.cos(a) * reach, cy + Math.sin(a) * reach);
      context.stroke();
    }
  }

  // A disturbance front sweeping the bench.
  if (g.signature.propagationWave) {
    const fx = (((g.phase * 0.14) % 2.4) - 0.7) * width;
    const w = px(70);
    const front = context.createLinearGradient(fx - w, 0, fx + w, 0);
    front.addColorStop(0, "rgba(0,0,0,0)");
    front.addColorStop(0.5, rgba(mixColour(PALETTE.ice, PALETTE.violet, 0.6), 0.04 + g.art.propagation * 0.14));
    front.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = front;
    context.fillRect(fx - w, 0, w * 2, height);
  }

  /* ---- Dust, visible only inside the light. ---- */
  const motes = Math.round(DUST * (0.25 + g.mapped.microstructure * 0.75));
  for (let i = 0; i < motes; i += 1) {
    const mx = (unit(g.seedPhase, i + 11) + g.phase * 0.004 * (0.4 + unit(g.seedPhase, i + 71))) % 1;
    const my = unit(g.seedPhase, i + 151);
    const k = Math.min(STATIONS, Math.max(0, Math.round(mx * STATIONS)));
    let lit = 0;
    for (const bundle of bundles) {
      for (const pts of bundle.rays) {
        lit = Math.max(lit, clamp(1 - Math.abs(pts[k].y - my) / 0.035));
        if (lit > 0.9) break;
      }
    }
    if (lit <= 0.05) continue;
    context.fillStyle = rgba(PALETTE.pale, lit * (0.12 + g.mapped.granularFracture * 0.4));
    context.fillRect(mx * width, my * height, px(1.1), px(1.1));
  }

  context.restore();
  context.globalCompositeOperation = "source-over";
}
