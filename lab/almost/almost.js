import "../shared/shell.js";

import {
  DEFAULT_FRAME_MS,
  TAU,
  clamp,
  createRandom,
  createTrace,
  formatDuration,
  normalizeSeed,
  pointForTrace,
  sampleLabel,
  timingSample,
} from "./almost-core.js";

const canvas = document.querySelector("#almost-canvas");
const context = canvas.getContext("2d", { alpha: false });
const holdButton = document.querySelector("#hold-button");
const newButton = document.querySelector("#new-button");
const saveButton = document.querySelector("#save-button");
const runState = document.querySelector("#run-state");
const runSeed = document.querySelector("#run-seed");
const timingState = document.querySelector("#timing-state");
const baselineOutput = document.querySelector("#baseline-output");
const delayOutput = document.querySelector("#delay-output");
const longestOutput = document.querySelector("#longest-output");
const marksOutput = document.querySelector("#marks-output");
const elapsedOutput = document.querySelector("#elapsed-output");
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const TRACE_COUNT = 112;
const TIMELINE_SLOTS = 96;
const BACKGROUND = "#07070b";

let viewWidth = 1;
let viewHeight = 1;
let pixelRatio = 1;
let traces = [];
let random = createRandom(311);
let seed = 311;
let animationFrame = null;
let lastFrameAt = null;
let startedAt = performance.now();
let previousElapsed = 0;
let baselineMs = DEFAULT_FRAME_MS;
let totalDelayMs = 0;
let longestDelayMs = 0;
let marks = 0;
let traceCursor = 0;
let timeline = [];
let signalBlooms = [];
let running = !motionPreference.matches;
let runningBeforeHide = running;
let lastReadoutAt = 0;
let lastSignalAt = 0;
let lastSample = timingSample(DEFAULT_FRAME_MS, DEFAULT_FRAME_MS);

function seedFromLocation() {
  const value = new URL(window.location.href).searchParams.get("seed");
  return normalizeSeed(value, 311);
}

function freshSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return normalizeSeed(values[0]);
  }
  return normalizeSeed(Date.now() ^ Math.floor(performance.now() * 1000));
}

function exposeSeed(nextSeed) {
  const url = new URL(window.location.href);
  url.searchParams.set("seed", String(nextSeed));
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function withCanvasScale(callback) {
  context.save();
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  callback();
  context.restore();
}

function drawFoundation() {
  withCanvasScale(() => {
    context.fillStyle = BACKGROUND;
    context.fillRect(0, 0, viewWidth, viewHeight);

    const spacing = clamp(Math.min(viewWidth, viewHeight) / 18, 26, 52);
    context.fillStyle = "rgba(236, 234, 224, 0.055)";
    for (let y = spacing / 2; y < viewHeight; y += spacing) {
      for (let x = spacing / 2; x < viewWidth; x += spacing) {
        context.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }

    const centreX = viewWidth / 2;
    const centreY = viewHeight / 2;
    const span = Math.min(viewWidth, viewHeight);
    context.lineWidth = 1;
    for (const [radius, alpha, dash] of [
      [span * 0.202, 0.11, [2, 12]],
      [span * 0.255, 0.08, [1, 16]],
      [span * 0.334, 0.045, [1, 20]],
    ]) {
      context.beginPath();
      context.setLineDash(dash);
      context.strokeStyle = `rgba(245, 166, 35, ${alpha})`;
      context.arc(centreX, centreY, radius, 0, TAU);
      context.stroke();
    }
    context.setLineDash([]);

    context.fillStyle = "rgba(245, 166, 35, 0.65)";
    context.fillRect(Math.round(centreX), Math.round(centreY), 1, 1);
  });
}

function drawStillField() {
  const sample = timingSample(DEFAULT_FRAME_MS + 1.2, DEFAULT_FRAME_MS);
  withCanvasScale(() => {
    for (let step = 0; step < 680; step += 1) {
      const trace = traces[step % traces.length];
      const point = pointForTrace(trace, step * 92, sample, viewWidth, viewHeight);
      const previous = trace.previous;
      if (previous) {
        context.beginPath();
        context.moveTo(previous.x, previous.y);
        context.lineTo(point.x, point.y);
        context.strokeStyle = `rgba(245, 166, 35, ${0.025 + (step % 7) * 0.004})`;
        context.lineWidth = 0.65;
        context.stroke();
      }
      trace.previous = point;
    }
    traces.forEach((trace) => {
      trace.previous = null;
    });
  });
}

function resizeCanvas() {
  const bounds = canvas.getBoundingClientRect();
  const nextWidth = Math.max(1, Math.round(bounds.width));
  const nextHeight = Math.max(1, Math.round(bounds.height));
  const nextRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  if (
    nextWidth === viewWidth &&
    nextHeight === viewHeight &&
    nextRatio === pixelRatio
  ) return;

  viewWidth = nextWidth;
  viewHeight = nextHeight;
  pixelRatio = nextRatio;
  canvas.width = Math.round(viewWidth * pixelRatio);
  canvas.height = Math.round(viewHeight * pixelRatio);
  drawFoundation();
  drawStillField();
}

function updateRunState(state, label) {
  runState.dataset.state = state;
  runState.textContent = label;
}

function updateControls() {
  holdButton.setAttribute("aria-pressed", String(!running));
  holdButton.textContent = running ? "Hold" : "Continue";
  if (running) updateRunState("running", "drawing");
  else updateRunState("held", motionPreference.matches ? "still by preference" : "held");
}

function renderReadout(now) {
  if (now - lastReadoutAt < 180) return;
  lastReadoutAt = now;
  const elapsed = previousElapsed + (running ? now - startedAt : 0);
  timingState.textContent = sampleLabel(lastSample);
  baselineOutput.textContent = baselineMs.toFixed(2);
  delayOutput.textContent = totalDelayMs.toFixed(2);
  longestOutput.textContent = longestDelayMs.toFixed(2);
  marksOutput.textContent = marks.toLocaleString("en-GB");
  elapsedOutput.textContent = formatDuration(elapsed / 1000);
}

function preserveVoid() {
  const centreX = viewWidth / 2;
  const centreY = viewHeight / 2;
  const radius = Math.min(viewWidth, viewHeight) * 0.118;
  const gradient = context.createRadialGradient(
    centreX,
    centreY,
    0,
    centreX,
    centreY,
    radius,
  );
  gradient.addColorStop(0, "rgba(7, 7, 11, 0.985)");
  gradient.addColorStop(0.55, "rgba(7, 7, 11, 0.82)");
  gradient.addColorStop(1, "rgba(7, 7, 11, 0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(centreX, centreY, radius, 0, TAU);
  context.fill();
  context.fillStyle = "rgba(245, 166, 35, 0.72)";
  context.fillRect(Math.round(centreX), Math.round(centreY), 1, 1);
}

function drawLiveClock(now, sample) {
  const span = Math.min(viewWidth, viewHeight);
  const centreX = viewWidth / 2;
  const centreY = viewHeight / 2;
  const radius = span * 0.142;
  const angle = (now * 0.00115) % TAU;
  const x = centreX + Math.cos(angle) * radius;
  const y = centreY + Math.sin(angle) * radius * 0.82;
  const alpha = sample.kind === "stall" ? 0.42 : sample.kind === "drag" ? 0.34 : 0.26;

  context.beginPath();
  context.arc(centreX, centreY, radius, angle - 0.42, angle + 0.42);
  context.strokeStyle = `rgba(245, 166, 35, ${alpha})`;
  context.lineWidth = sample.kind === "stall" ? 1.4 : 1;
  context.stroke();

  context.beginPath();
  context.moveTo(centreX, centreY);
  context.lineTo(x, y);
  context.strokeStyle = `rgba(236, 234, 224, ${sample.kind === "near" ? 0.18 : 0.28})`;
  context.lineWidth = 0.7;
  context.stroke();

  context.beginPath();
  context.arc(x, y, sample.kind === "stall" ? 3.8 : 2.8, 0, TAU);
  context.fillStyle = sample.kind === "stall"
    ? "rgba(226, 75, 74, 0.78)"
    : "rgba(245, 166, 35, 0.82)";
  context.fill();
}

function emitSignalBloom(now, sample) {
  if (sample.kind === "near") return;
  if (sample.kind === "drag" && now - lastSignalAt < 900) return;
  lastSignalAt = now;
  signalBlooms.push({
    bornAt: now,
    kind: sample.kind,
    weight: clamp(sample.normalized, 0.24, 1),
  });
  signalBlooms = signalBlooms.slice(-8);
}

function drawSignalBlooms(now) {
  if (!signalBlooms.length) return;

  const span = Math.min(viewWidth, viewHeight);
  const centreX = viewWidth / 2;
  const centreY = viewHeight / 2;
  signalBlooms = signalBlooms.filter((bloom) => now - bloom.bornAt < 1600);

  for (const bloom of signalBlooms) {
    const age = clamp((now - bloom.bornAt) / 1600, 0, 1);
    const ease = 1 - Math.pow(1 - age, 2.6);
    const radius = span * (0.13 + ease * 0.31);
    const alpha = (1 - age) * (bloom.kind === "stall" ? 0.24 : 0.13) * bloom.weight;
    const colour = bloom.kind === "stall" ? "226, 75, 74" : "245, 166, 35";

    context.beginPath();
    context.arc(centreX, centreY, radius, 0, TAU);
    context.strokeStyle = `rgba(${colour}, ${alpha})`;
    context.lineWidth = 1.2 + bloom.weight * 2.2;
    context.stroke();
  }
}

function recordTimingSample(sample) {
  timeline.push({
    kind: sample.kind,
    normalized: sample.normalized,
  });
  if (timeline.length > TIMELINE_SLOTS) timeline = timeline.slice(-TIMELINE_SLOTS);
}

function drawTimingStrip(now) {
  const stripWidth = clamp(viewWidth * 0.34, 240, 520);
  const slotWidth = stripWidth / TIMELINE_SLOTS;
  const x = (viewWidth - stripWidth) / 2;
  const y = viewHeight - clamp(viewHeight * 0.08, 48, 70);

  context.fillStyle = "rgba(7, 7, 11, 0.58)";
  context.fillRect(x - 10, y - 10, stripWidth + 20, 24);

  context.beginPath();
  context.moveTo(x, y + 7);
  context.lineTo(x + stripWidth, y + 7);
  context.strokeStyle = "rgba(236, 234, 224, 0.08)";
  context.lineWidth = 1;
  context.stroke();

  const emptySlots = TIMELINE_SLOTS - timeline.length;
  for (let index = 0; index < timeline.length; index += 1) {
    const sample = timeline[index];
    const age = (emptySlots + index) / TIMELINE_SLOTS;
    const height = 4 + sample.normalized * 16;
    const tickX = x + (emptySlots + index) * slotWidth;
    const alpha = 0.18 + age * 0.58;
    let colour = `rgba(245, 166, 35, ${alpha})`;
    if (sample.kind === "drag") colour = `rgba(236, 234, 224, ${alpha})`;
    if (sample.kind === "stall") colour = `rgba(226, 75, 74, ${alpha})`;

    context.fillStyle = colour;
    context.fillRect(tickX, y + 7 - height, Math.max(1, slotWidth * 0.52), height);
  }

  const head = (now * 0.006) % stripWidth;
  context.fillStyle = "rgba(245, 166, 35, 0.72)";
  context.fillRect(x + head, y - 14, 1, 25);
}

function drawTrace(trace, point, sample) {
  const previous = trace.previous;
  trace.previous = point;
  if (!previous) return;

  const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
  const maximumJoin = Math.min(viewWidth, viewHeight) * (sample.kind === "stall" ? 0.18 : 0.12);
  if (distance > maximumJoin) {
    context.fillStyle = sample.kind === "stall"
      ? "rgba(226, 75, 74, 0.56)"
      : "rgba(236, 234, 224, 0.24)";
    context.fillRect(point.x - 1, point.y - 1, 2, 2);
    return;
  }

  const baseAlpha = 0.028 + sample.normalized * 0.26;
  if (sample.kind === "stall") {
    context.strokeStyle = `rgba(226, 75, 74, ${0.22 + random() * 0.18})`;
    context.lineWidth = 0.8 + random() * 0.55;
  } else if (sample.kind === "drag") {
    context.strokeStyle = `rgba(236, 234, 224, ${baseAlpha + 0.05})`;
    context.lineWidth = 0.65 + sample.normalized * 0.72;
  } else {
    context.strokeStyle = `rgba(245, 166, 35, ${baseAlpha})`;
    context.lineWidth = 0.45 + random() * 0.55;
  }

  context.beginPath();
  context.moveTo(previous.x, previous.y);
  const bend = sample.normalized * 18 * trace.polarity;
  context.quadraticCurveTo(
    (previous.x + point.x) / 2 + bend,
    (previous.y + point.y) / 2 - bend * 0.5,
    point.x,
    point.y,
  );
  context.stroke();
}

function drawFrame(now, sample) {
  withCanvasScale(() => {
    const decay = clamp(
      1 - Math.exp(-sample.deltaMs / (sample.kind === "stall" ? 110_000 : 55_000)),
      0.00008,
      0.01,
    );
    context.fillStyle = `rgba(7, 7, 11, ${decay})`;
    context.fillRect(0, 0, viewWidth, viewHeight);

    emitSignalBloom(now, sample);
    drawSignalBlooms(now);

    const strokes = sample.kind === "stall" ? 24 : sample.kind === "drag" ? 13 : 7;
    const elapsed = previousElapsed + now - startedAt;
    for (let index = 0; index < strokes; index += 1) {
      const trace = traces[traceCursor % traces.length];
      traceCursor += 1;
      const point = pointForTrace(
        trace,
        elapsed + index * 1.7,
        sample,
        viewWidth,
        viewHeight,
      );
      drawTrace(trace, point, sample);
      marks += 1;
    }

    if (marks % 97 < strokes) {
      const span = Math.min(viewWidth, viewHeight);
      const pulse = (marks % 997) / 997;
      context.beginPath();
      context.arc(viewWidth / 2, viewHeight / 2, span * (0.2 + pulse * 0.16), 0, TAU);
      context.strokeStyle = "rgba(236, 234, 224, 0.035)";
      context.lineWidth = 0.6;
      context.stroke();
    }

    preserveVoid();
    drawLiveClock(now, sample);
    drawTimingStrip(now);
  });
}

function frame(now) {
  animationFrame = null;
  if (!running) return;
  if (lastFrameAt === null) {
    lastFrameAt = now;
    animationFrame = requestAnimationFrame(frame);
    return;
  }

  const delta = Math.min(1000, Math.max(0, now - lastFrameAt));
  lastFrameAt = now;
  if (delta > 0 && delta < 50) {
    baselineMs = clamp(Math.min(baselineMs * 1.0006, delta), 4, 100);
  }
  lastSample = timingSample(delta, baselineMs);
  totalDelayMs += lastSample.latenessMs;
  longestDelayMs = Math.max(longestDelayMs, lastSample.latenessMs);
  recordTimingSample(lastSample);
  drawFrame(now, lastSample);
  renderReadout(now);
  animationFrame = requestAnimationFrame(frame);
}

function start() {
  if (running) return;
  running = true;
  startedAt = performance.now();
  lastFrameAt = null;
  updateControls();
  animationFrame = requestAnimationFrame(frame);
}

function stop() {
  if (!running) return;
  const now = performance.now();
  previousElapsed += now - startedAt;
  running = false;
  lastFrameAt = null;
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  updateControls();
  renderReadout(now);
}

function toggleRunning() {
  if (running) stop();
  else start();
}

function reset(nextSeed, shouldExpose = true) {
  seed = normalizeSeed(nextSeed);
  random = createRandom(seed);
  traces = Array.from(
    { length: TRACE_COUNT },
    (_, index) => createTrace(index, TRACE_COUNT, random),
  );
  baselineMs = DEFAULT_FRAME_MS;
  totalDelayMs = 0;
  longestDelayMs = 0;
  marks = 0;
  traceCursor = 0;
  timeline = [];
  signalBlooms = [];
  lastSignalAt = 0;
  previousElapsed = 0;
  startedAt = performance.now();
  lastFrameAt = null;
  lastSample = timingSample(DEFAULT_FRAME_MS, DEFAULT_FRAME_MS);
  runSeed.textContent = String(seed).padStart(8, "0");
  if (shouldExpose) exposeSeed(seed);
  drawFoundation();
  drawStillField();
  renderReadout(performance.now() + 1000);
}

function saveFrame() {
  saveButton.disabled = true;
  canvas.toBlob((blob) => {
    if (!blob) {
      saveButton.disabled = false;
      return;
    }
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `atlas-almost-${seed}.png`;
    link.click();
    URL.revokeObjectURL(url);
    saveButton.disabled = false;
  }, "image/png");
}

holdButton.addEventListener("click", toggleRunning);
newButton.addEventListener("click", () => reset(freshSeed()));
saveButton.addEventListener("click", saveFrame);

window.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target;
  if (
    target instanceof HTMLButtonElement ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLAnchorElement ||
    target?.isContentEditable
  ) return;
  if (event.code === "Space") {
    event.preventDefault();
    toggleRunning();
  } else if (event.key.toLowerCase() === "n") {
    reset(freshSeed());
  } else if (event.key.toLowerCase() === "s") {
    saveFrame();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    runningBeforeHide = running;
    if (running) stop();
    updateRunState("asleep", "tab asleep");
    return;
  }
  if (runningBeforeHide && !motionPreference.matches) start();
  else updateControls();
});

motionPreference.addEventListener("change", (event) => {
  if (event.matches) stop();
  updateControls();
});

const observer = new ResizeObserver(resizeCanvas);
observer.observe(canvas);
reset(seedFromLocation(), false);
resizeCanvas();
updateControls();
if (running) animationFrame = requestAnimationFrame(frame);
