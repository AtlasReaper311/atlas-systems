"use strict";

import { deriveFieldGeometry } from "../spectral-field-geometry.js";
import { transitionMix } from "../spectral-field-state.js";
import { PALETTE, canvasSize, clamp, mixColour, rgba, routeBand, unit } from "./proto-core.js";

const POINTS = 300;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const PRESETS = Object.freeze({
  living: Object.freeze({
    kind: "living",
    renderer: "proto-living-organism",
    camera: 0.6,
    crop: 1.28,
    bodyScale: 0.5,
    roundness: 0.46,
    tide: 0.36,
    spikes: 0.92,
    nerves: 0.74,
    wound: 0.78,
    plate: "organic",
  }),
  flagship: Object.freeze({
    kind: "flagship",
    renderer: "proto-flagship-organism",
    camera: 0.58,
    crop: 1.16,
    bodyScale: 0.48,
    roundness: 0.54,
    tide: 0.34,
    spikes: 0.92,
    nerves: 0.66,
    wound: 0.84,
    liquid: 0.45,
    plate: "flagship",
  }),
  specimen: Object.freeze({
    kind: "specimen",
    renderer: "proto-specimen-core",
    camera: 0.55,
    crop: 0.92,
    bodyScale: 0.42,
    roundness: 0.82,
    tide: 0.22,
    spikes: 0.72,
    nerves: 0.5,
    wound: 0.58,
    plate: "specimen",
  }),
  monolith: Object.freeze({
    kind: "monolith",
    renderer: "proto-signal-monolith",
    camera: 0.52,
    crop: 1.74,
    bodyScale: 0.62,
    roundness: 0.16,
    tide: 0.28,
    spikes: 1.12,
    nerves: 0.82,
    wound: 0.92,
    plate: "monolith",
  }),
});

function pointPool(renderer) {
  if (!renderer._organismPoints || renderer._organismPoints.length !== POINTS) {
    renderer._organismPoints = Array.from({ length: POINTS }, () => ({
      x: 0, y: 0, z: 0, px: 0, py: 0, h: 0, field: 0, selected: false, live: false, spike: false, detail: 0,
    }));
  }
  return renderer._organismPoints;
}

function renderPlate(context, g, preset, width, height, cx, cy, rx, ry) {
  context.fillStyle = "#07070c";
  context.fillRect(0, 0, width, height);

  if (preset.plate === "monolith") {
    const wall = context.createLinearGradient(0, 0, width, height);
    wall.addColorStop(0, "#0a0a10");
    wall.addColorStop(0.44, "#181820");
    wall.addColorStop(0.72, "#2d2c31");
    wall.addColorStop(1, "#08080d");
    context.fillStyle = wall;
    context.fillRect(0, 0, width, height);
    context.fillStyle = "rgba(255,255,255,0.025)";
    for (let i = 0; i < 5; i += 1) {
      const x = width * (0.28 + i * 0.14);
      context.fillRect(x, 0, 1, height);
    }
  } else {
    const well = context.createRadialGradient(cx, cy - ry * 0.08, rx * 0.1, cx, cy, Math.max(width, height) * 0.72);
    well.addColorStop(0, preset.plate === "specimen" || preset.plate === "flagship" ? "#f0eadf" : "#e5ded3");
    well.addColorStop(0.24, preset.plate === "specimen" || preset.plate === "flagship" ? "#cdc7bb" : "#bbb6ac");
    well.addColorStop(0.55, "#434249");
    well.addColorStop(1, "#0a0a0f");
    context.fillStyle = well;
    context.fillRect(0, 0, width, height);
  }

  const uiBand = context.createLinearGradient(0, 0, width * 0.48, 0);
  uiBand.addColorStop(0, "rgba(10,10,15,0.96)");
  uiBand.addColorStop(0.56, "rgba(10,10,15,0.68)");
  uiBand.addColorStop(1, "rgba(10,10,15,0)");
  context.fillStyle = uiBand;
  context.fillRect(0, 0, width * 0.54, height);

  context.fillStyle = "rgba(3,3,5,0.34)";
  context.beginPath();
  context.ellipse(cx - rx * 0.06, cy + ry * 1.02, rx * 0.66, ry * 0.13, 0, 0, Math.PI * 2);
  context.fill();

  if (preset.kind === "specimen" || preset.kind === "flagship") {
    context.save();
    context.strokeStyle = preset.kind === "flagship" ? "rgba(245,166,35,0.09)" : "rgba(245,166,35,0.12)";
    context.lineWidth = Math.max(1, width / 1800);
    for (let i = 0; i < (preset.kind === "flagship" ? 2 : 3); i += 1) {
      context.beginPath();
      context.ellipse(cx, cy, rx * (0.62 + i * 0.18), ry * (0.62 + i * 0.18), 0, 0, Math.PI * 2);
      context.stroke();
    }
    context.strokeStyle = "rgba(226,238,255,0.08)";
    context.beginPath();
    context.moveTo(cx - rx * 1.08, cy);
    context.lineTo(cx + rx * 1.08, cy);
    context.moveTo(cx, cy - ry * 1.08);
    context.lineTo(cx, cy + ry * 1.08);
    context.stroke();
    context.restore();
  }
}

function bodyPath(context, cx, cy, rx, ry, g, preset, shock, extra = 0) {
  if (preset.kind === "monolith") {
    context.beginPath();
    context.moveTo(cx - rx * 1.06 - extra, cy - ry * 0.82);
    context.lineTo(cx - rx * 0.18, cy - ry * (1.12 + shock * 0.08) - extra);
    context.lineTo(cx + rx * 0.72 + extra, cy - ry * 0.82);
    context.lineTo(cx + rx * 1.04 + extra, cy - ry * 0.12);
    context.lineTo(cx + rx * 0.72, cy + ry * (0.86 + shock * 0.12) + extra);
    context.lineTo(cx - rx * 0.42, cy + ry * (1.02 + shock * 0.08) + extra);
    context.lineTo(cx - rx * 1.12 - extra, cy + ry * 0.34);
    context.closePath();
    return;
  }

  if (preset.kind === "living" || preset.kind === "flagship") {
    const t1 = Math.sin(g.phase * 0.73) * 0.08 + shock * 0.12;
    const t2 = Math.cos(g.phase * 0.57) * 0.09 - shock * 0.08;
    const restraint = preset.kind === "flagship" ? 0.68 : 1;
    context.beginPath();
    context.moveTo(cx - rx * (0.98 + t1 * restraint) - extra, cy - ry * 0.1);
    context.bezierCurveTo(cx - rx * (1.08 + 0.02 * restraint) - extra, cy - ry * (0.55 + t2 * restraint), cx - rx * 0.46, cy - ry * (1.06 + t1 * restraint) - extra, cx + rx * 0.02, cy - ry * (0.94 + t2 * restraint) - extra);
    context.bezierCurveTo(cx + rx * 0.42, cy - ry * (1.22 + shock * 0.14 * restraint), cx + rx * (1.08 + t1 * restraint) + extra, cy - ry * 0.54, cx + rx * (0.98 + shock * 0.1 * restraint) + extra, cy - ry * 0.02);
    context.bezierCurveTo(cx + rx * (1.08 + t2 * restraint), cy + ry * 0.44, cx + rx * 0.44, cy + ry * (1.16 + shock * 0.12 * restraint) + extra, cx - rx * 0.08, cy + ry * (1.0 + t1 * restraint) + extra);
    context.bezierCurveTo(cx - rx * 0.58, cy + ry * (1.1 + t2 * restraint), cx - rx * (1.06 + shock * 0.08 * restraint) - extra, cy + ry * 0.52, cx - rx * (0.98 + t1 * restraint) - extra, cy - ry * 0.1);
    context.closePath();
    return;
  }

  context.beginPath();
  context.ellipse(cx, cy, rx + extra, ry + extra, 0, 0, Math.PI * 2);
}

function buildField(renderer, g, preset, band, cx, cy, rx, ry) {
  const points = pointPool(renderer);
  const damage = clamp(g.health.severity * 0.72 + g.deformation * 0.36 + g.art.fractureBias * 0.22);
  const audioDrive = clamp(g.mapped.emissionRate * 0.46 + g.mapped.displacement * 0.34 + g.mapped.brilliance * 0.2);
  const yaw = g.torsion * 1.1 + g.phase * 0.055;
  const cyaw = Math.cos(yaw);
  const syaw = Math.sin(yaw);
  const gate = 0.34 + g.mapped.aperture * 0.26 - damage * 0.36 - audioDrive * 0.12;
  const maxH = rx * (0.09 + g.mapped.displacement * 0.2 + damage * 0.12) * preset.spikes;

  for (let i = 0; i < POINTS; i += 1) {
    const y0 = 1 - (i + 0.5) / POINTS * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y0 * y0));
    const th = GOLDEN * i;
    let x = Math.cos(th) * rad;
    const y = y0;
    let z = Math.sin(th) * rad;
    const rxr = x * cyaw - z * syaw;
    z = x * syaw + z * cyaw;
    x = rxr;

    let magnetic = 0.5 + 0.5 * Math.sin(x * 4.2 + y * 2.7 + g.phase * (0.8 + audioDrive));
    const tide = Math.sin((x * 1.8 - y * 2.1) + g.phase * (0.62 + audioDrive * 0.8));
    if (preset.kind === "living" || preset.kind === "flagship") magnetic = 0.5 + 0.5 * Math.sin((x * x - y * 1.6) * 4.4 + g.phase * (1.05 + audioDrive));
    if (preset.kind === "monolith") magnetic = clamp(1 - Math.abs(x * 0.85 + y * 0.24 - 0.18) * 1.45);
    const bias = preset.kind === "living" || preset.kind === "flagship" ? Math.abs(Math.sin(x * 2.2 + y * 3.1)) : (x * 0.5 + 0.5);
    const field = magnetic * 0.48 + bias * 0.34 + tide * preset.tide * 0.12 + (unit(g.seedPhase, i) - 0.5) * g.mapped.phaseDisagreement * 0.34;
    const live = field > gate - 0.12 || unit(g.seedPhase, i + 4) > 0.86 - damage * 0.2;
    const p = points[i];
    if (!live) {
      p.live = false;
      continue;
    }

    const strength = clamp((field - gate + 0.12) / 0.42);
    const selected = !!(band && x * 0.5 + 0.5 >= band.x0 && x * 0.5 + 0.5 <= band.x1);
    const pulse = 0.86 + Math.sin(g.phase * (2.1 + g.mapped.emissionRate * 3.2) + i * 0.09) * 0.14 * audioDrive;
    const woundBoost = selected ? 1.28 : 1;
    const h = Math.pow(strength, preset.kind === "flagship" ? 1.95 : 1.6) * maxH * pulse * woundBoost;
    const depth = 1 + z * 0.22;
    p.x = x;
    p.y = y;
    p.z = z;
    p.h = h;
    p.field = field;
    p.selected = selected;
    p.spike = field > gate && h > maxH * (preset.kind === "flagship" ? 0.2 : 0.12);
    p.detail = unit(g.seedPhase, i + 17);
    p.px = cx + x * rx / depth;
    p.py = cy - y * ry / depth;
    p.live = true;
  }
  points.sort((a, b) => a.z - b.z);
  return { points, damage, audioDrive, maxH };
}

function drawMound(context, p, g, preset, maxH, ratio) {
  if (!p.live || p.z < -0.32 || p.detail < (preset.kind === "flagship" ? 0.5 : 0.56)) return;
  const strength = clamp(p.h / Math.max(1, maxH));
  if (preset.kind === "flagship" && strength < 0.16) return;
  const liquid = preset.liquid ?? 0;
  const w = (7 + strength * (18 + liquid * 6)) * ratio * preset.crop;
  const h = Math.max(2 * ratio, w * (0.18 + strength * (0.28 + liquid * 0.04)));
  const angle = Math.atan2(-p.y, p.x) + 0.16;
  context.fillStyle = `rgba(0,0,0,${0.18 + strength * (0.3 + liquid * 0.12)})`;
  context.beginPath();
  context.ellipse(p.px + w * 0.08, p.py + h * 0.22, w * (0.5 + liquid * 0.04), h * (0.38 + liquid * 0.04), angle, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = rgba(p.selected ? PALETTE.amber : PALETTE.pale, p.selected ? 0.13 * preset.wound : 0.07 + g.mapped.brilliance * (0.11 + liquid * 0.05));
  context.beginPath();
  context.ellipse(p.px - w * 0.18, p.py - h * 0.22, w * (0.26 + liquid * 0.03), h * 0.1, angle - 0.45, 0, Math.PI * 2);
  context.fill();
}

function drawSpike(context, p, g, preset, cx, cy, rx, ry, maxH, ratio) {
  if (!p.live || !p.spike) return;
  const depth = 1 + p.z * 0.22;
  const bx = cx + p.x * rx / depth;
  const by = cy - p.y * ry / depth;
  const tx = cx + p.x * (rx + p.h) / depth;
  const ty = cy - p.y * (ry + p.h * 0.88) / depth;
  const vx = tx - bx;
  const vy = ty - by;
  const len = Math.hypot(vx, vy) || 1;
  const nx = -vy / len;
  const ny = vx / len;
  const strength = clamp(p.h / Math.max(1, maxH));
  const liquid = preset.liquid ?? 0;
  const wide = (5 + liquid * 4 + (1 - strength) * (13 + liquid * 8)) * ratio * preset.crop;
  const lit = clamp(0.16 + p.z * 0.22 - p.x * 0.1 + p.y * 0.44 + g.mapped.brilliance * 0.28);

  if (preset.kind === "flagship" && strength < 0.42) {
    context.beginPath();
    const stub = 0.42 + strength * 0.34;
    context.moveTo(bx + vx * stub, by + vy * stub);
    context.quadraticCurveTo(bx + nx * wide * 0.7 + vx * 0.18, by + ny * wide * 0.7 + vy * 0.18, bx + nx * wide * 0.86, by + ny * wide * 0.86);
    context.quadraticCurveTo(bx, by, bx - nx * wide * 0.74, by - ny * wide * 0.74);
    context.quadraticCurveTo(bx - nx * wide * 0.44 + vx * 0.2, by - ny * wide * 0.44 + vy * 0.2, bx + vx * stub, by + vy * stub);
    context.closePath();
    context.fillStyle = lit > 0.54 ? "#202434" : "#06070d";
    context.fill();
    context.fillStyle = rgba(PALETTE.pale, 0.08 + g.mapped.brilliance * 0.16);
    context.beginPath();
    context.ellipse(bx + vx * 0.2 + nx * wide * 0.1, by + vy * 0.2 + ny * wide * 0.1, wide * 0.2, Math.max(1 * ratio, wide * 0.055), Math.atan2(vy, vx) - 0.45, 0, Math.PI * 2);
    context.fill();
    return;
  }

  context.beginPath();
  context.moveTo(tx, ty);
  context.quadraticCurveTo(bx + nx * wide * (0.9 + liquid * 0.25) + vx * 0.28, by + ny * wide * (0.9 + liquid * 0.25) + vy * 0.28, bx + nx * wide * (1.08 + liquid * 0.18), by + ny * wide * (1.08 + liquid * 0.18));
  context.quadraticCurveTo(bx + vx * (0.06 + liquid * 0.05), by + vy * (0.06 + liquid * 0.05), bx - nx * wide * (0.84 + liquid * 0.16), by - ny * wide * (0.84 + liquid * 0.16));
  context.quadraticCurveTo(bx - nx * wide * 0.66 + vx * 0.29, by - ny * wide * 0.66 + vy * 0.29, tx, ty);
  context.closePath();
  context.fillStyle = lit > 0.64 ? "#2a2e3d" : lit > 0.42 ? "#151824" : "#030306";
  context.fill();

  if (lit > 0.48 || p.selected) {
    context.strokeStyle = rgba(p.selected ? PALETTE.amber : PALETTE.pale, (p.selected ? 0.34 : 0.12) + g.mapped.brilliance * 0.28);
    context.lineWidth = Math.max(1, ratio * (0.45 + strength * 0.55));
    context.beginPath();
    context.moveTo(bx + nx * wide * 0.12 + vx * 0.1, by + ny * wide * 0.12 + vy * 0.1);
    context.quadraticCurveTo(bx + vx * 0.62 + nx * wide * 0.12, by + vy * 0.62 + ny * wide * 0.12, tx, ty);
    context.stroke();
  }

  if (p.z > -0.12 && strength > 0.34) {
    context.fillStyle = rgba(p.selected ? PALETTE.amber : PALETTE.pale, p.selected ? 0.64 : 0.3 + g.mapped.brilliance * 0.3);
    context.beginPath();
    context.ellipse(tx, ty, ratio * (0.9 + strength * 1.9), ratio * (0.65 + strength), Math.atan2(vy, vx) - 0.4, 0, Math.PI * 2);
    context.fill();
  }
}

function drawLiquidSkin(context, points, g, preset, maxH, ratio) {
  if (preset.kind !== "flagship") return;
  void context;
  void points;
  void g;
  void maxH;
  void ratio;
}

function drawNerves(context, points, g, preset, maxH, ratio) {
  context.save();
  context.globalCompositeOperation = "screen";
  for (let i = 0; i < points.length; i += 23) {
    const p = points[i];
    if (!p.live || p.z < -0.05 || p.detail < 0.44) continue;
    const q = points[(i + 37) % points.length];
    if (!q?.live || Math.abs(p.x - q.x) > 0.55 || Math.abs(p.y - q.y) > 0.55) continue;
    const selected = p.selected || q.selected;
    const alpha = (selected ? 0.17 : 0.04) * preset.nerves + g.mapped.afterimage * 0.06;
    context.strokeStyle = rgba(selected ? PALETTE.amber : mixColour(PALETTE.violet, PALETTE.pale, 0.45), alpha);
    context.lineWidth = Math.max(1, ratio * (selected ? 1.1 : 0.45));
    context.beginPath();
    context.moveTo(p.px, p.py);
    context.quadraticCurveTo((p.px + q.px) * 0.5, (p.py + q.py) * 0.5 - maxH * 0.08, q.px, q.py);
    context.stroke();
  }
  context.restore();
}

function drawWound(context, g, preset, band, cx, cy, rx, ry, damage) {
  if (!band) return;
  const lon = (band.x0 + band.x1) * 0.5;
  const x = cx + (lon - 0.5) * rx * 1.55;
  const y = cy + Math.sin(g.phase * 0.7 + lon * 5.8) * ry * 0.22;
  const pulse = 0.5 + Math.sin(g.phase * (2.4 + g.mapped.emissionRate * 2.2)) * 0.5;
  const glow = context.createRadialGradient(x, y, 0, x, y, rx * (0.16 + damage * 0.08));
  glow.addColorStop(0, rgba(PALETTE.amber, (0.22 + pulse * 0.12) * preset.wound));
  glow.addColorStop(0.35, rgba([128, 79, 38], 0.08 * preset.wound));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = glow;
  context.beginPath();
  context.ellipse(x, y, rx * (0.17 + damage * 0.05), ry * 0.38, 0.38, 0, Math.PI * 2);
  context.fill();
}

function drawPressureRipples(context, g, preset, band, cx, cy, rx, ry, damage, ratio) {
  if (!band) return;
  const lon = (band.x0 + band.x1) * 0.5;
  const originX = cx + (lon - 0.5) * rx * 1.45;
  const originY = cy + Math.sin(g.phase * 0.6 + lon * 5.8) * ry * 0.24;
  const beat = 0.5 + Math.sin(g.phase * (2.4 + g.mapped.emissionRate * 2.6)) * 0.5;
  context.save();
  context.globalCompositeOperation = "screen";
  for (let i = 0; i < 4; i += 1) {
    const t = (i + beat) / 4;
    const alpha = (0.13 - t * 0.08 + damage * 0.04) * preset.wound;
    context.strokeStyle = rgba(i === 0 ? PALETTE.amber : mixColour(PALETTE.amber, PALETTE.pale, 0.38), alpha);
    context.lineWidth = Math.max(1, ratio * (0.8 - t * 0.25));
    context.beginPath();
    context.ellipse(originX + rx * 0.12 * t, originY, rx * (0.12 + t * 0.34), ry * (0.1 + t * 0.46), 0.36, -Math.PI * 0.62, Math.PI * 0.72);
    context.stroke();
  }
  context.restore();
}

function drawMonolithRidges(context, g, preset, cx, cy, rx, ry, damage, ratio) {
  if (preset.kind !== "monolith") return;
  context.save();
  context.globalCompositeOperation = "screen";
  for (let i = 0; i < 9; i += 1) {
    const u = -0.72 + i * 0.18;
    const wobble = Math.sin(g.phase * 0.7 + i * 1.8) * 0.04;
    context.strokeStyle = i % 3 === 0 ? rgba(PALETTE.amber, 0.08 + damage * 0.08) : "rgba(226,238,255,0.065)";
    context.lineWidth = Math.max(1, ratio * (1.0 + damage * 1.4));
    context.beginPath();
    context.moveTo(cx + rx * (u - 0.28), cy - ry * 0.82);
    context.lineTo(cx + rx * (u + wobble), cy - ry * 0.18);
    context.lineTo(cx + rx * (u - 0.18), cy + ry * 0.78);
    context.stroke();
  }
  context.restore();
}

function drawDroplets(context, g, preset, cx, cy, rx, ry, damage) {
  if (damage < 0.38) return;
  const n = 2 + Math.floor(damage * 7);
  for (let i = 0; i < n; i += 1) {
    const angle = (unit(g.seedPhase, i + 60) - 0.42) * Math.PI * 1.3;
    const distance = rx * (0.82 + unit(g.seedPhase, i + 77) * 0.7) * preset.crop;
    const x = cx + Math.cos(angle) * distance + rx * 0.16;
    const y = cy + Math.sin(angle) * distance * 0.58 + ry * 0.08;
    const r = rx * (0.016 + unit(g.seedPhase, i + 92) * 0.04) * damage;
    const drop = context.createRadialGradient(x - r * 0.28, y - r * 0.34, r * 0.1, x, y, r);
    drop.addColorStop(0, rgba([70, 75, 92], 0.86));
    drop.addColorStop(0.58, "#07080d");
    drop.addColorStop(1, "#030306");
    context.fillStyle = drop;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }
}

export function drawOrganism(kind, renderer, timestamp = performance.now()) {
  if (!renderer.context || !renderer.state) return;
  const preset = PRESETS[kind] ?? PRESETS.living;
  renderer.canvas.dataset.fieldRenderer = preset.renderer;
  const { width, height, ratio } = canvasSize(renderer.canvas);
  const context = renderer.context;
  const g = deriveFieldGeometry(renderer.state, renderer.visualTime, width, height);
  const mix = transitionMix.call(renderer, timestamp);
  const band = routeBand(renderer.state.selectedMapping);
  const aspect = width / Math.max(1, height);
  const damage = clamp(g.health.severity * 0.72 + g.deformation * 0.36 + g.art.fractureBias * 0.22);
  const audioDrive = clamp(g.mapped.emissionRate * 0.46 + g.mapped.displacement * 0.34 + g.mapped.brilliance * 0.2);
  const shock = damage * (0.42 + 0.58 * Math.max(0, Math.sin(g.phase * (2.6 + damage * 2.2))));
  const base = height * preset.bodyScale * (0.96 + g.mapped.bodyStrength * 0.08 + g.breathing * 0.035 + audioDrive * 0.025);
  const cx = width * (aspect > 1.8 ? preset.camera : 0.52) - damage * width * 0.035 + g.art.direction * width * 0.016;
  const cy = height * (preset.plate === "monolith" ? 0.51 : 0.49) + g.art.compression * height * 0.018;
  const rx = base * (1.12 + g.mapped.lateralSpread * 0.18 + damage * 0.14) * preset.crop;
  const ry = base * (0.78 + preset.roundness * 0.22 - g.art.stretch * 0.08 - damage * 0.05);

  context.globalCompositeOperation = "source-over";
  context.save();
  context.globalAlpha = 0.45 + mix * 0.55;
  renderPlate(context, g, preset, width, height, cx, cy, rx, ry);

  const field = buildField(renderer, g, preset, band, cx, cy, rx, ry);
  const { points, maxH } = field;
  for (const p of points) if (p.live && p.z < -0.08) drawSpike(context, p, g, preset, cx, cy, rx, ry, maxH, ratio);

  bodyPath(context, cx, cy, rx, ry, g, preset, shock * 0.18);
  const body = context.createRadialGradient(cx - rx * 0.4, cy - ry * 0.38, rx * 0.04, cx, cy, rx * 1.06);
  body.addColorStop(0, rgba([236, 241, 248], 0.62 + g.mapped.brilliance * 0.26));
  body.addColorStop(0.05, rgba([58, 64, 84], 0.98));
  body.addColorStop(0.18, rgba(mixColour(PALETTE.violet, [12, 13, 22], 0.72), 0.9));
  body.addColorStop(0.6, "#06070c");
  body.addColorStop(0.88, "#020204");
  body.addColorStop(1, "#0f1017");
  context.fillStyle = body;
  context.fill();

  context.save();
  bodyPath(context, cx, cy, rx, ry, g, preset, shock * 0.18);
  context.clip();
  drawWound(context, g, preset, band, cx, cy, rx, ry, damage);
  drawPressureRipples(context, g, preset, band, cx, cy, rx, ry, damage, ratio);
  drawMonolithRidges(context, g, preset, cx, cy, rx, ry, damage, ratio);
  for (const p of points) drawMound(context, p, g, preset, maxH, ratio);
  drawLiquidSkin(context, points, g, preset, maxH, ratio);
  drawNerves(context, points, g, preset, maxH, ratio);
  const rim = context.createLinearGradient(cx - rx, cy, cx + rx, cy);
  rim.addColorStop(0, "rgba(255,255,255,0.055)");
  rim.addColorStop(0.34, "rgba(255,255,255,0)");
  rim.addColorStop(0.78, "rgba(4,5,8,0.24)");
  rim.addColorStop(1, "rgba(235,242,255,0.18)");
  context.fillStyle = rim;
  bodyPath(context, cx, cy, rx, ry, g, preset, shock * 0.18);
  context.fill();
  context.restore();

  context.beginPath();
  context.ellipse(cx - rx * 0.42, cy - ry * 0.36, rx * (0.12 + preset.roundness * 0.05), ry * 0.26, -0.44, 0, Math.PI * 2);
  const spec = context.createRadialGradient(cx - rx * 0.42, cy - ry * 0.36, 0, cx - rx * 0.42, cy - ry * 0.36, rx * 0.18);
  spec.addColorStop(0, rgba(PALETTE.pale, 0.68 + g.mapped.brilliance * 0.22));
  spec.addColorStop(0.42, rgba(PALETTE.pale, 0.2));
  spec.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = spec;
  context.fill();

  if (preset.kind === "flagship") {
    context.beginPath();
    context.ellipse(cx - rx * 0.32, cy - ry * 0.18, rx * 0.11, ry * 0.045, -0.18, 0, Math.PI * 2);
    context.fillStyle = rgba(PALETTE.pale, 0.16 + g.mapped.brilliance * 0.16);
    context.fill();
  }

  for (const p of points) if (p.live && p.z >= -0.08) drawSpike(context, p, g, preset, cx, cy, rx, ry, maxH, ratio);
  drawDroplets(context, g, preset, cx, cy, rx, ry, damage);
  context.restore();
}
