"use strict";

/* PROTOTYPE — FERROSPHERE (development only).
 *
 * One glossy ferrofluid body, like the studio reference: smooth hemisphere
 * turning into a dense spike field. Not a waveform, not a trough, not tiles.
 *
 * The 3:1 stage is a photograph of the specimen, not a dashboard around a
 * small ball. Light well behind the sphere so black liquid can actually read.
 * Overlay type stays on the dark left.
 *
 * Driven only by deriveFieldGeometry. Selected route = a longitude gore with
 * taller spikes and amber tip glints.
 */

import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { transitionMix } from "../spectral-field-state.js";
import { PALETTE, canvasSize, clamp, mixColour, rgba, routeBand, unit } from "./proto-core.js";

const CANDIDATES = 380;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function pool(renderer) {
  if (!renderer._ferroPool || renderer._ferroPool.length !== CANDIDATES) {
    renderer._ferroPool = Array.from({ length: CANDIDATES }, () => ({
      x: 0, y: 0, z: 0, h: 0, px: 0, py: 0, field: 0, detail: 0, selected: false, spiked: false, live: false,
    }));
  }
  return renderer._ferroPool;
}

export function draw(timestamp = performance.now()) {
  if (!this.context || !this.state) return;
  this.canvas.dataset.fieldRenderer = "proto-ferrosphere";
  const { width, height, ratio } = canvasSize(this.canvas);
  const context = this.context;
  const { selectedMapping } = this.state;
  const g = deriveFieldGeometry(this.state, this.visualTime, width, height);
  const mix = transitionMix.call(this, timestamp);
  const band = routeBand(selectedMapping);
  const px = (v) => Math.max(1, v * ratio);

  context.globalCompositeOperation = "source-over";
  context.fillStyle = "#0a0a0f";
  context.fillRect(0, 0, width, height);
  context.save();
  context.globalAlpha = 0.4 + mix * 0.6;

  const aspect = width / Math.max(1, height);
  const radius = height * (aspect > 1.8 ? 0.46 : 0.39) * (0.94 + g.mapped.bodyStrength * 0.1 + g.breathing * 0.02);
  const cx = width * (aspect > 1.8 ? 0.61 : 0.52) + g.art.direction * width * 0.018 - g.health.severity * width * 0.025;
  const cy = height * 0.49 + g.art.compression * height * 0.018;
  const rx = radius * (1 + g.mapped.lateralSpread * 0.13 + g.health.severity * 0.13);
  const ry = radius * (1 - g.art.stretch * 0.08 - g.deformation * 0.1);
  const damage = clamp(g.health.severity * 0.78 + g.deformation * 0.28 + g.art.fractureBias * 0.18);

  /* Studio light well — black fluid only reads against this. Left stays dark for type. */
  const well = context.createRadialGradient(cx, cy, rx * 0.2, cx, cy, Math.max(width, height) * 0.72);
  well.addColorStop(0, "#eee8dd");
  well.addColorStop(0.24, "#d2cabd");
  well.addColorStop(0.52, "#46454d");
  well.addColorStop(1, "#0a0a0f");
  context.fillStyle = well;
  context.fillRect(0, 0, width, height);

  /* Contact shadow. */
  context.save();
  context.fillStyle = "rgba(8,8,10,0.38)";
  context.beginPath();
  context.ellipse(cx - rx * 0.12, cy + ry * 1.08, rx * 0.72, ry * 0.16, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();

  const yaw = g.torsion * 0.8 + g.phase * 0.04;
  const cyaw = Math.cos(yaw);
  const syaw = Math.sin(yaw);
  const terminator = 0.08 + g.mapped.aperture * 0.54 - damage * 0.74 - g.mapped.displacement * 0.08;
  const maxH = radius * (0.2 + g.mapped.displacement * 0.42 + damage * 0.18);
  const spikes = pool(this);
  let liveN = 0;

  for (let i = 0; i < CANDIDATES; i += 1) {
    const y0 = 1 - (i + 0.5) / CANDIDATES * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y0 * y0));
    const th = GOLDEN * i;
    let x = Math.cos(th) * rad;
    const y = y0;
    let z = Math.sin(th) * rad;
    const rxr = x * cyaw - z * syaw;
    const rz = x * syaw + z * cyaw;
    x = rxr;
    z = rz;

    const spikeBias = (x + 1) * 0.5;
    const jitter = (unit(g.seedPhase, i) - 0.5) * g.mapped.phaseDisagreement * 0.45;
    const field = spikeBias + jitter + g.art.disturbance * 0.12 * Math.sin(i * 0.7 + g.phase * 0.5);
    const gate = terminator + (1 - g.mapped.emissionRate) * 0.07;
    const s = spikes[i];
    if (field < gate - (0.045 + damage * 0.07)) {
      s.live = false;
      continue;
    }
    let h = (field - gate) / Math.max(0.08, 1 - gate);
    const mound = clamp((field - (gate - (0.045 + damage * 0.07))) / 0.18);
    h = Math.pow(clamp(h), 1.18) * maxH + mound * radius * (0.012 + damage * 0.018);
    h *= 0.78 + g.breathing * 0.12;
    if (g.signature.fracturePlane && unit(g.seedPhase, i + 3) > 0.72) h *= 0.15;
    const lon = (x * 0.5 + 0.5);
    const selected = !!(band && lon >= band.x0 && lon <= band.x1);
    if (selected) h *= 1.22;
    const lean = g.mapped.phaseDisagreement * 0.22 * (unit(g.seedPhase, i + 9) - 0.5);
    s.x = x + lean;
    s.y = y;
    s.z = z;
    s.h = h;
    s.field = field;
    s.detail = unit(g.seedPhase, i + 14);
    s.selected = selected;
    s.spiked = field >= gate;
    s.live = true;
    const depth = 1 + s.z * 0.22;
    s.px = cx + s.x * rx / depth;
    s.py = cy - s.y * ry / depth;
    liveN += 1;
  }

  spikes.sort((a, b) => a.z - b.z);

  const dark = "#050509";
  const flank = "#171922";
  const flankLit = "#242838";
  const indigo = "#111322";

  function bodyPath(extra = 0) {
    const dent = damage * rx * 0.1;
    const swell = damage * rx * 0.08;
    context.beginPath();
    context.moveTo(cx - rx - extra, cy);
    context.bezierCurveTo(cx - rx - extra, cy - ry * 0.64, cx - rx * 0.42, cy - ry - extra, cx + rx * 0.08, cy - ry - extra);
    context.bezierCurveTo(cx + rx * 0.62 + swell, cy - ry * (1.02 + damage * 0.04), cx + rx + extra - dent, cy - ry * 0.48, cx + rx + extra, cy - ry * 0.02);
    context.bezierCurveTo(cx + rx * (0.98 + damage * 0.04), cy + ry * 0.54, cx + rx * 0.46, cy + ry + extra, cx - rx * 0.06, cy + ry + extra);
    context.bezierCurveTo(cx - rx * 0.58, cy + ry * 0.98, cx - rx - extra, cy + ry * 0.58, cx - rx - extra, cy);
    context.closePath();
  }

  function drawSpike(s) {
    if (!s.live || !s.spiked) return;
    const depth = 1 + s.z * 0.22;
    const bx = cx + s.x * rx / depth;
    const by = cy - s.y * ry / depth;
    const tx = cx + s.x * (rx + s.h) / depth;
    const ty = cy - s.y * (ry + s.h * 0.92) / depth;
    const vx = tx - bx;
    const vy = ty - by;
    const vlen = Math.hypot(vx, vy) || 1;
    const nx = -vy / vlen;
    const ny = vx / vlen;
    const strength = clamp(s.h / Math.max(1, maxH));
    const wide = (7 + (1 - strength) * 15) * (rx / 190) * (ratio > 1.5 ? 1 : 0.86);
    const lit = clamp(0.18 + (-s.x * 0.16 + s.y * 0.48 + s.z * 0.18 + 0.38));
    if (s.h < maxH * 0.16) {
      context.beginPath();
      context.ellipse(bx + vx * 0.22, by + vy * 0.22, wide * (1.1 + damage * 0.25), Math.max(px(2), s.h * 0.55), Math.atan2(vy, vx), 0, Math.PI * 2);
      context.fillStyle = lit > 0.58 ? flankLit : flank;
      context.fill();
      if (lit > 0.62) {
        context.fillStyle = rgba(PALETTE.pale, 0.12 + g.mapped.brilliance * 0.18);
        context.beginPath();
        context.ellipse(bx + vx * 0.14 - wide * 0.14, by + vy * 0.14 - wide * 0.2, wide * 0.42, Math.max(px(1.2), s.h * 0.11), Math.atan2(vy, vx) - 0.35, 0, Math.PI * 2);
        context.fill();
      }
      return;
    }
    context.beginPath();
    context.moveTo(tx, ty);
    context.quadraticCurveTo(bx + nx * wide * 0.9 + vx * 0.22, by + ny * wide * 0.9 + vy * 0.22, bx + nx * wide, by + ny * wide);
    context.quadraticCurveTo(bx + vx * 0.08, by + vy * 0.08, bx - nx * wide * 0.82, by - ny * wide * 0.82);
    context.quadraticCurveTo(bx - nx * wide * 0.7 + vx * 0.24, by - ny * wide * 0.7 + vy * 0.24, tx, ty);
    context.closePath();
    context.fillStyle = lit > 0.68 ? flankLit : (lit > 0.44 ? flank : dark);
    context.fill();
    if (lit > 0.52) {
      context.strokeStyle = rgba(s.selected ? PALETTE.amber : PALETTE.pale, 0.13 + g.mapped.brilliance * 0.32);
      context.lineWidth = px(0.75 + strength * 0.45);
      context.beginPath();
      context.moveTo(bx + nx * wide * 0.18 + vx * 0.08, by + ny * wide * 0.18 + vy * 0.08);
      context.quadraticCurveTo(bx + vx * 0.62 + nx * wide * 0.15, by + vy * 0.62 + ny * wide * 0.15, tx, ty);
      context.stroke();
    }
    if (s.z > -0.1 && s.h > maxH * 0.36) {
      context.fillStyle = rgba(s.selected ? PALETTE.amber : PALETTE.pale, (s.selected ? 0.34 : 0.22) + g.mapped.brilliance * 0.34);
      context.beginPath();
      context.ellipse(tx, ty, px(1.2 + strength * 1.8), px(0.75 + strength), Math.atan2(vy, vx) - 0.4, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawMound(s) {
    if (!s.live || s.z < -0.28 || s.detail < 0.43 || s.field < terminator - (0.012 + damage * 0.06)) return;
    const depth = 1 + s.z * 0.22;
    const bx = cx + s.x * rx / depth;
    const by = cy - s.y * ry / depth;
    const strength = clamp(s.h / Math.max(1, maxH));
    const angle = Math.atan2(-s.y, s.x) + 0.2;
    const w = (10 + strength * 18) * (rx / 210);
    const hh = Math.max(px(2.2), w * (0.36 + strength * 0.4));
    const valleyAlpha = 0.18 + strength * 0.3;
    context.fillStyle = rgba([0, 0, 0], valleyAlpha);
    context.beginPath();
    context.ellipse(bx + w * 0.14, by + hh * 0.24, w * 0.72, hh * 0.58, angle, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = rgba(s.selected ? PALETTE.amber : PALETTE.pale, s.selected ? 0.12 : 0.08 + g.mapped.brilliance * 0.09);
    context.beginPath();
    context.ellipse(bx - w * 0.18, by - hh * 0.24, w * 0.52, hh * 0.24, angle - 0.45, 0, Math.PI * 2);
    context.fill();
  }

  for (let i = 0; i < CANDIDATES; i += 1) {
    if (spikes[i].live && spikes[i].z < -0.05) drawSpike(spikes[i]);
  }

  /* Glossy body. */
  bodyPath();
  const body = context.createRadialGradient(
    cx - rx * 0.38,
    cy - ry * 0.42,
    rx * 0.04,
    cx,
    cy,
    rx * 1.05,
  );
  body.addColorStop(0, rgba([238, 242, 248], 0.72 + g.mapped.brilliance * 0.2));
  body.addColorStop(0.055, rgba([58, 62, 78], 0.96));
  body.addColorStop(0.19, indigo);
  body.addColorStop(0.58, "#07080d");
  body.addColorStop(0.86, "#030306");
  body.addColorStop(1, rgba(mixColour(PALETTE.pale, [20, 22, 30], 0.7), 0.18));
  context.fillStyle = body;
  context.fill();

  context.save();
  bodyPath();
  context.clip();
  for (let i = 0; i < CANDIDATES; i += 1) drawMound(spikes[i]);

  const rim = context.createLinearGradient(cx - rx, cy, cx + rx, cy);
  rim.addColorStop(0, "rgba(255,255,255,0.05)");
  rim.addColorStop(0.35, "rgba(255,255,255,0)");
  rim.addColorStop(0.76, "rgba(10,12,18,0.18)");
  rim.addColorStop(1, "rgba(255,255,255,0.2)");
  context.fillStyle = rim;
  bodyPath();
  context.fill();
  context.restore();

  /* Specular on the smooth side. */
  context.beginPath();
  context.ellipse(cx - rx * 0.43, cy - ry * 0.36, rx * 0.18, ry * 0.33, -0.42, 0, Math.PI * 2);
  const spec = context.createRadialGradient(cx - rx * 0.43, cy - ry * 0.36, 0, cx - rx * 0.43, cy - ry * 0.36, rx * 0.2);
  spec.addColorStop(0, rgba(PALETTE.pale, 0.72 + g.mapped.brilliance * 0.22));
  spec.addColorStop(0.38, rgba(PALETTE.pale, 0.28));
  spec.addColorStop(0.72, rgba(PALETTE.pale, 0.06));
  spec.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = spec;
  context.fill();

  for (let i = 0; i < CANDIDATES; i += 1) {
    if (spikes[i].live && spikes[i].z >= -0.05) drawSpike(spikes[i]);
  }

  /* Cascade satellites — the body shedding droplets. */
  if (damage > 0.45) {
    const n = 2 + Math.floor(damage * 5);
    for (let d = 0; d < n; d += 1) {
      const ang = (unit(g.seedPhase, 20 + d) - 0.5) * 2.4;
      const dist = rx * (1.0 + unit(g.seedPhase, 40 + d) * 0.6);
      const dx = cx + Math.cos(ang) * dist + rx * 0.18;
      const dy = cy + Math.sin(ang) * dist * 0.55 + ry * 0.15;
      const rr = rx * (0.035 + unit(g.seedPhase, 60 + d) * 0.06) * damage;
      context.beginPath();
      context.arc(dx, dy, rr, 0, Math.PI * 2);
      const drop = context.createRadialGradient(dx - rr * 0.3, dy - rr * 0.35, rr * 0.1, dx, dy, rr);
      drop.addColorStop(0, rgba([40, 44, 58], 0.9));
      drop.addColorStop(0.55, "#07080c");
      drop.addColorStop(1, "#050508");
      context.fillStyle = drop;
      context.fill();
      context.fillStyle = rgba(PALETTE.pale, 0.28);
      context.beginPath();
      context.ellipse(dx - rr * 0.28, dy - rr * 0.32, rr * 0.22, rr * 0.12, -0.4, 0, Math.PI * 2);
      context.fill();
    }
  }

  context.restore();
  void liveN;
}
