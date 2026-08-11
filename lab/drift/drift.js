import "../shared/shell.js";
import { mountLabSound } from "../shared/lab-explore-sound.js?v=20260811-sound-v3";

import {
  ATTENTION_RADIUS,
  BREACH,
  CELL_COUNT,
  GRID_H,
  GRID_W,
  HELD,
  MODE_MANUAL,
  MODE_POLICY,
  POLICY_WINDOW,
  TARGET,
  attentionCoverage,
  cellLabel,
  census,
  clamp,
  createField,
  formatDuration,
  formatPercent,
  meanHealth,
  normalizeSeed,
  step,
} from "./drift-core.js";

const canvas = document.querySelector("#drift-canvas");
const context = canvas.getContext("2d", { alpha: false });
const page = document.querySelector(".drift-page");
const titleBlock = document.querySelector(".drift-title");
const rail = document.querySelector(".drift-rail");

const modeManualButton = document.querySelector("#mode-manual");
const modePolicyButton = document.querySelector("#mode-policy");
const resetButton = document.querySelector("#drift-reset");
const soundButton = document.querySelector("#sound-button");
const exploreSound = mountLabSound({ voice: "drift", button: soundButton });

const conformanceOutput = document.querySelector("#out-conformance");
const heldOutput = document.querySelector("#out-held");
const breachedOutput = document.querySelector("#out-breached");
const worstOutput = document.querySelector("#out-worst");
const coverageOutput = document.querySelector("#out-coverage");
const clockOutput = document.querySelector("#out-clock");
const liveRegion = document.querySelector("#drift-live");

const verdict = document.querySelector("#drift-verdict");
const verdictBody = document.querySelector("#verdict-body");
const verdictAccept = document.querySelector("#verdict-accept");
const verdictDecline = document.querySelector("#verdict-decline");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
// Below this width the title and rail sit outside the field, so the field does
// not need to darken its own corners to carry them.
const stacked = window.matchMedia("(max-width: 860px)");
const COVERAGE = attentionCoverage();

const STOPS = [
  { at: 0.0, rgb: [30, 14, 18] },
  { at: 0.2, rgb: [226, 75, 74] },
  { at: 0.45, rgb: [214, 118, 60] },
  { at: 0.62, rgb: [245, 166, 35] },
  { at: 0.82, rgb: [140, 200, 110] },
  { at: 1.0, rgb: [74, 222, 128] },
];

const state = {
  field: createField(normalizeSeed(null)),
  mode: MODE_MANUAL,
  attention: { x: GRID_W / 2, y: GRID_H / 2, active: false },
  pointerInside: false,
  keyboardDriving: false,
  verdictShown: false,
  verdictDismissed: false,
  lastFrame: 0,
  accumulator: 0,
  layout: { size: 8, gap: 2, offsetX: 0, offsetY: 0, width: 0, height: 0 },
  announceAt: 0,
  readoutAt: 0,
};

function colorFor(health) {
  const value = clamp(health, 0, 1);
  let low = STOPS[0];
  let high = STOPS[STOPS.length - 1];
  for (let index = 0; index < STOPS.length - 1; index += 1) {
    if (value >= STOPS[index].at && value <= STOPS[index + 1].at) {
      low = STOPS[index];
      high = STOPS[index + 1];
      break;
    }
  }
  const span = high.at - low.at || 1;
  const t = (value - low.at) / span;
  return [
    Math.round(low.rgb[0] + (high.rgb[0] - low.rgb[0]) * t),
    Math.round(low.rgb[1] + (high.rgb[1] - low.rgb[1]) * t),
    Math.round(low.rgb[2] + (high.rgb[2] - low.rgb[2]) * t),
  ];
}

function measure() {
  const rect = canvas.getBoundingClientRect();
  const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  // The title and the readout rail sit on top of the field, so the lattice
  // reserves the bands they actually occupy rather than a guessed fraction.
  // Measured every resize, so it survives the paragraph rewrapping.
  const padX = width * 0.055;
  const minPad = height * 0.06;
  let padTop = minPad;
  let padBottom = minPad;

  if (!stacked.matches) {
    const titleBottom = titleBlock.getBoundingClientRect().bottom - rect.top;
    const railTop = rect.bottom - rail.getBoundingClientRect().top;
    padTop = clamp((titleBottom + 26) * dpr, minPad, height * 0.5);
    padBottom = clamp((railTop + 14) * dpr, minPad, height * 0.3);
  }

  const usableW = width - padX * 2;
  const usableY = Math.max(GRID_H, height - padTop - padBottom);
  const pitch = Math.min(usableW / GRID_W, usableY / GRID_H);
  const gap = Math.max(1, pitch * 0.16);
  const size = pitch - gap;

  state.layout = {
    size,
    gap,
    pitch,
    offsetX: (width - pitch * GRID_W) / 2 + gap / 2,
    offsetY: padTop + (usableY - pitch * GRID_H) / 2 + gap / 2,
    width,
    height,
    dpr,
  };
}

function cellRect(index) {
  const { pitch, size, offsetX, offsetY } = state.layout;
  const row = Math.floor(index / GRID_W);
  const column = index % GRID_W;
  return { x: offsetX + column * pitch, y: offsetY + row * pitch, size };
}

function draw(time) {
  const { width, height, pitch, size, offsetX, offsetY } = state.layout;
  const { health, heat } = state.field;

  context.fillStyle = "#07070b";
  context.fillRect(0, 0, width, height);

  // Faint lattice bed, so the empty places still read as structure.
  context.strokeStyle = "rgba(255,255,255,0.035)";
  context.lineWidth = Math.max(1, state.layout.dpr * 0.5);
  context.beginPath();
  for (let column = 0; column <= GRID_W; column += 1) {
    const x = offsetX - state.layout.gap / 2 + column * pitch;
    context.moveTo(x, offsetY - state.layout.gap / 2);
    context.lineTo(x, offsetY - state.layout.gap / 2 + pitch * GRID_H);
  }
  for (let row = 0; row <= GRID_H; row += 1) {
    const y = offsetY - state.layout.gap / 2 + row * pitch;
    context.moveTo(offsetX - state.layout.gap / 2, y);
    context.lineTo(offsetX - state.layout.gap / 2 + pitch * GRID_W, y);
  }
  context.stroke();

  // Bloom pass. Failing nodes bleed into the field around them.
  context.globalCompositeOperation = "lighter";
  for (let index = 0; index < CELL_COUNT; index += 1) {
    const value = health[index];
    if (value > HELD && heat[index] < 0.2) continue;
    const rect = cellRect(index);
    const rgb = colorFor(value);
    const distress = clamp(1 - value / HELD, 0, 1);
    const glow = clamp(distress * 0.5 + heat[index] * 0.45, 0, 1);
    if (glow <= 0.02) continue;
    const pad = size * (0.5 + distress * 1.4);
    const gradient = context.createRadialGradient(
      rect.x + size / 2,
      rect.y + size / 2,
      size * 0.1,
      rect.x + size / 2,
      rect.y + size / 2,
      size / 2 + pad,
    );
    gradient.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.32 * glow})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(rect.x - pad, rect.y - pad, size + pad * 2, size + pad * 2);
  }
  context.globalCompositeOperation = "source-over";

  // The nodes themselves.
  for (let index = 0; index < CELL_COUNT; index += 1) {
    const value = health[index];
    const rect = cellRect(index);
    const rgb = colorFor(value);
    const alpha = 0.28 + value * 0.62;
    context.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
    context.fillRect(rect.x, rect.y, size, size);

    if (value < BREACH) {
      // A breached node is drawn hollow. There is nothing left in it.
      context.fillStyle = "rgba(7,7,11,0.72)";
      const inset = size * 0.3;
      context.fillRect(rect.x + inset, rect.y + inset, size - inset * 2, size - inset * 2);
    }

    if (heat[index] > 0.05) {
      context.strokeStyle = `rgba(232,232,224,${0.14 + heat[index] * 0.5})`;
      context.lineWidth = Math.max(1, state.layout.dpr);
      context.strokeRect(rect.x + 0.5, rect.y + 0.5, size - 1, size - 1);
    }
  }

  // Contagion ties. Two failing neighbours are one failure.
  context.strokeStyle = "rgba(226,75,74,0.34)";
  context.lineWidth = Math.max(1, state.layout.dpr);
  context.beginPath();
  for (let index = 0; index < CELL_COUNT; index += 1) {
    if (health[index] >= BREACH) continue;
    const row = Math.floor(index / GRID_W);
    const column = index % GRID_W;
    const rect = cellRect(index);
    const cx = rect.x + size / 2;
    const cy = rect.y + size / 2;
    if (column < GRID_W - 1 && health[index + 1] < BREACH) {
      context.moveTo(cx, cy);
      context.lineTo(cx + pitch, cy);
    }
    if (row < GRID_H - 1 && health[index + GRID_W] < BREACH) {
      context.moveTo(cx, cy);
      context.lineTo(cx, cy + pitch);
    }
  }
  context.stroke();

  drawScrims();

  if (state.mode === MODE_POLICY) drawSweep(time);
  else drawAttention(time);
}

function drawSweep(time) {
  const { pitch, offsetX, offsetY, gap, dpr } = state.layout;
  const sweepColumn = state.field.sweep - POLICY_WINDOW;
  const centre = offsetX - gap / 2 + (sweepColumn + 0.5) * pitch;
  const halfWidth = POLICY_WINDOW * pitch;
  const top = offsetY - gap / 2;
  const bottom = top + pitch * GRID_H;

  const gradient = context.createLinearGradient(centre - halfWidth, 0, centre + halfWidth, 0);
  gradient.addColorStop(0, "rgba(74,222,128,0)");
  gradient.addColorStop(0.5, "rgba(74,222,128,0.2)");
  gradient.addColorStop(1, "rgba(74,222,128,0)");
  context.fillStyle = gradient;
  context.fillRect(centre - halfWidth, top, halfWidth * 2, bottom - top);

  context.strokeStyle = "rgba(74,222,128,0.7)";
  context.lineWidth = Math.max(1, dpr);
  context.beginPath();
  context.moveTo(centre, top);
  context.lineTo(centre, bottom);
  context.stroke();

  context.fillStyle = "rgba(74,222,128,0.85)";
  context.font = `${Math.round(10 * dpr)}px "IBM Plex Mono", monospace`;
  context.textAlign = "center";
  context.fillText("policy sweep", centre, top - 10 * dpr);
  context.textAlign = "left";
}

function drawAttention(time) {
  const { pitch, offsetX, offsetY, gap, dpr } = state.layout;
  if (!state.attention.active) return;

  const cx = offsetX - gap / 2 + (state.attention.x + 0.5) * pitch;
  const cy = offsetY - gap / 2 + (state.attention.y + 0.5) * pitch;
  const radius = ATTENTION_RADIUS * pitch;

  const gradient = context.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
  gradient.addColorStop(0, "rgba(245,166,35,0.16)");
  gradient.addColorStop(0.6, "rgba(245,166,35,0.06)");
  gradient.addColorStop(1, "rgba(245,166,35,0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "rgba(245,166,35,0.55)";
  context.lineWidth = Math.max(1, dpr);
  const dash = reducedMotion.matches ? 0 : (time / 26) % (10 * dpr);
  context.setLineDash([4 * dpr, 5 * dpr]);
  context.lineDashOffset = -dash;
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);

  const tick = pitch * 0.5;
  context.strokeStyle = "rgba(245,166,35,0.9)";
  context.beginPath();
  context.moveTo(cx - tick, cy);
  context.lineTo(cx + tick, cy);
  context.moveTo(cx, cy - tick);
  context.lineTo(cx, cy + tick);
  context.stroke();

  context.fillStyle = "rgba(245,166,35,0.8)";
  context.font = `${Math.round(9 * dpr)}px "IBM Plex Mono", monospace`;
  context.fillText(
    `attention / ${formatPercent(COVERAGE, 1)} of estate`,
    cx + radius * 0.72,
    cy - radius * 0.72,
  );
}

/**
 * The field runs edge to edge and the page furniture sits on top of it, so the
 * canvas darkens itself under the places where words have to be read.
 */
function drawScrims() {
  const { width, height } = state.layout;

  const vignette = context.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.3,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.78,
  );
  vignette.addColorStop(0, "rgba(7,7,11,0)");
  vignette.addColorStop(1, "rgba(7,7,11,0.42)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);

  if (stacked.matches) return;

  // A soft plate under the top left, matched by a CSS gradient behind the
  // title itself. Both together keep the words readable without darkening a
  // quarter of the estate.
  context.save();
  context.scale(1, 0.5);
  const corner = context.createRadialGradient(0, 0, 0, 0, 0, width * 0.5);
  corner.addColorStop(0, "rgba(7,7,11,0.9)");
  corner.addColorStop(0.5, "rgba(7,7,11,0.6)");
  corner.addColorStop(1, "rgba(7,7,11,0)");
  context.fillStyle = corner;
  context.fillRect(0, 0, width, height / 0.5);
  context.restore();

  const foot = context.createLinearGradient(0, height * 0.8, 0, height);
  foot.addColorStop(0, "rgba(7,7,11,0)");
  foot.addColorStop(0.65, "rgba(7,7,11,0.62)");
  foot.addColorStop(1, "rgba(7,7,11,0.92)");
  context.fillStyle = foot;
  context.fillRect(0, height * 0.8, width, height * 0.2);
}

function updateReadout(force) {
  const now = performance.now();
  if (!force && now - state.readoutAt < 140) return;
  state.readoutAt = now;

  const conformance = meanHealth(state.field);
  const counts = census(state.field);

  conformanceOutput.textContent = formatPercent(conformance, 1);
  conformanceOutput.dataset.state =
    conformance >= TARGET ? "held" : conformance >= 0.7 ? "drifting" : "breached";

  heldOutput.textContent = `${counts.held} / ${CELL_COUNT}`;
  breachedOutput.textContent = String(counts.breached);
  breachedOutput.dataset.state = counts.breached === 0 ? "held" : "breached";
  worstOutput.textContent = `${cellLabel(counts.worstIndex)} ${counts.worstValue.toFixed(2)}`;
  coverageOutput.textContent =
    state.mode === MODE_POLICY ? "100% (swept)" : formatPercent(COVERAGE, 1);
  clockOutput.textContent = `${formatDuration(state.field.heldSeconds)} above ${Math.round(TARGET * 100)}%`;

  if (now - state.announceAt > 4000) {
    state.announceAt = now;
    liveRegion.textContent = `Estate conformance ${formatPercent(conformance, 0)}. ${counts.held} nodes held, ${counts.breached} breached.`;
  }

  if (
    state.mode === MODE_MANUAL &&
    !state.verdictShown &&
    !state.verdictDismissed &&
    conformance < 0.85 &&
    state.field.elapsed > 40
  ) {
    showVerdict(conformance);
  }
}

function showVerdict(conformance) {
  state.verdictShown = true;
  const held = formatDuration(state.field.heldSeconds);
  verdictBody.innerHTML = `
    <p>You held the line for <strong>${held}</strong>. The estate has
    <strong>${CELL_COUNT} nodes</strong>. Your attention covers
    <strong>${formatPercent(COVERAGE, 1)}</strong> of it at any instant, and
    nothing you did was wrong.</p>
    <p>Conformance is at <strong>${formatPercent(conformance, 1)}</strong> and
    still falling, because drift is not an event. It is a rate. A rate is
    beaten by another rate, never by effort.</p>
  `;
  verdict.hidden = false;
  verdictAccept.focus();
}

function setMode(mode) {
  state.mode = mode;
  modeManualButton.setAttribute("aria-pressed", String(mode === MODE_MANUAL));
  modePolicyButton.setAttribute("aria-pressed", String(mode === MODE_POLICY));
  page.dataset.mode = mode;
  page.dataset.pointer = mode === MODE_POLICY ? "off" : "on";
  updateReadout(true);
  liveRegion.textContent = mode === MODE_POLICY
    ? "Policy sweep is holding the estate."
    : "Manual attention is holding the estate.";
  exploreSound.cue(mode === MODE_POLICY ? "mark" : "tick");
}

function reset() {
  exploreSound.cue("clear");
  state.field = createField(normalizeSeed(null));
  state.verdictShown = false;
  state.verdictDismissed = false;
  verdict.hidden = true;
  updateReadout(true);
  liveRegion.textContent = "New estate generated.";
}

function dismissVerdict() {
  if (verdict.hidden) return false;
  verdict.hidden = true;
  state.verdictDismissed = true;
  liveRegion.textContent = "Verdict dismissed. Manual attention remains active.";
  canvas.focus();
  return true;
}

function pointerToCell(event) {
  const rect = canvas.getBoundingClientRect();
  const scale = state.layout.width / rect.width;
  const x = (event.clientX - rect.left) * scale;
  const y = (event.clientY - rect.top) * scale;
  const { pitch, offsetX, offsetY, gap } = state.layout;
  return {
    x: (x - offsetX + gap / 2) / pitch - 0.5,
    y: (y - offsetY + gap / 2) / pitch - 0.5,
  };
}

canvas.addEventListener("pointermove", (event) => {
  state.keyboardDriving = false;
  const cell = pointerToCell(event);
  state.attention.x = cell.x;
  state.attention.y = cell.y;
  state.attention.active = true;
  state.pointerInside = true;
});

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  const cell = pointerToCell(event);
  state.attention.x = cell.x;
  state.attention.y = cell.y;
  state.attention.active = true;
});

canvas.addEventListener("pointerleave", () => {
  state.pointerInside = false;
  if (!state.keyboardDriving) state.attention.active = false;
});

canvas.addEventListener("focus", () => {
  state.keyboardDriving = true;
  state.attention.active = true;
});

canvas.addEventListener("blur", () => {
  state.keyboardDriving = false;
  if (!state.pointerInside) state.attention.active = false;
});

canvas.addEventListener("keydown", (event) => {
  const stepSize = event.shiftKey ? 3 : 1;
  let handled = true;
  switch (event.key) {
    case "ArrowLeft": state.attention.x -= stepSize; break;
    case "ArrowRight": state.attention.x += stepSize; break;
    case "ArrowUp": state.attention.y -= stepSize; break;
    case "ArrowDown": state.attention.y += stepSize; break;
    case "p": case "P": setMode(MODE_POLICY); break;
    case "m": case "M": setMode(MODE_MANUAL); break;
    case "r": case "R": reset(); break;
    case "Escape":
      if (!dismissVerdict()) {
        state.attention.active = false;
        state.keyboardDriving = false;
        liveRegion.textContent = "Attention field cleared.";
      }
      break;
    default: handled = false;
  }
  if (handled) {
    event.preventDefault();
    state.keyboardDriving = true;
    state.attention.active = true;
    state.attention.x = clamp(state.attention.x, 0, GRID_W - 1);
    state.attention.y = clamp(state.attention.y, 0, GRID_H - 1);
  }
});

modeManualButton.addEventListener("click", () => setMode(MODE_MANUAL));
modePolicyButton.addEventListener("click", () => setMode(MODE_POLICY));
resetButton.addEventListener("click", reset);

verdictAccept.addEventListener("click", () => {
  verdict.hidden = true;
  setMode(MODE_POLICY);
  canvas.focus();
});

verdictDecline.addEventListener("click", () => {
  dismissVerdict();
});

const FIXED_STEP = 1 / 60;

function frame(time) {
  if (!state.lastFrame) state.lastFrame = time;
  let delta = (time - state.lastFrame) / 1000;
  state.lastFrame = time;
  delta = clamp(delta, 0, 0.25);
  if (reducedMotion.matches) delta *= 0.45;

  state.accumulator += delta;
  let guard = 0;
  while (state.accumulator >= FIXED_STEP && guard < 6) {
    step(state.field, FIXED_STEP, state.mode, state.attention);
    state.accumulator -= FIXED_STEP;
    guard += 1;
  }
  if (guard >= 6) state.accumulator = 0;

  draw(time);
  updateReadout(false);
  window.requestAnimationFrame(frame);
}

const observer = new ResizeObserver(() => measure());
observer.observe(canvas);

measure();
setMode(MODE_MANUAL);
updateReadout(true);
window.requestAnimationFrame(frame);
