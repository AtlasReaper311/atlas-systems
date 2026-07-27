import "../../shared/shell.js";
import { LorenzFmEngine } from "./lorenz-fm-engine.js";

const startButton = document.querySelector("#start-audio");
const stopButton = document.querySelector("#stop-audio");
const resetButton = document.querySelector("#reset-system");
const status = document.querySelector("#audio-status");
const volumeInput = document.querySelector("#master-volume");
const volumeOutput = document.querySelector("#master-volume-output");
const rateInput = document.querySelector("#chaos-rate");
const rateOutput = document.querySelector("#chaos-rate-output");
const depthInput = document.querySelector("#fm-depth");
const depthOutput = document.querySelector("#fm-depth-output");
const canvas = document.querySelector("#lorenz-scope");
const context2d = canvas?.getContext("2d");

const readouts = {
  x: document.querySelector("#val-x"),
  y: document.querySelector("#val-y"),
  z: document.querySelector("#val-z"),
  carrier: document.querySelector("#val-carrier"),
  modulator: document.querySelector("#val-modulator"),
  cutoff: document.querySelector("#val-cutoff"),
  pan: document.querySelector("#val-pan"),
  elapsed: document.querySelector("#val-elapsed"),
};

let engine = null;
let telemetryTimer = null;
let animationFrame = null;
let canvasWidth = 900;
let canvasHeight = 675;
const trail = [];
const MAX_TRAIL_POINTS = 1100;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function setStatus(label, state = "") {
  status.textContent = label;
  status.dataset.state = state;
}

function format(value, digits = 4) {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.0000";
}

function updateControls() {
  volumeOutput.value = `${Math.round(Number(volumeInput.value))}%`;
  rateOutput.value = `${Number(rateInput.value).toFixed(2)}×`;
  depthOutput.value = `${Math.round(Number(depthInput.value))} Hz`;
}

function resizeCanvas() {
  if (!canvas || !context2d) return;
  const rectangle = canvas.getBoundingClientRect();
  const scale = Math.min(2, window.devicePixelRatio || 1);
  canvasWidth = Math.max(1, rectangle.width);
  canvasHeight = Math.max(1, rectangle.height);
  canvas.width = Math.round(canvasWidth * scale);
  canvas.height = Math.round(canvasHeight * scale);
  context2d.setTransform(scale, 0, 0, scale, 0, 0);
}

function project([x, , z]) {
  return {
    x: canvasWidth * 0.5 + (x / 24) * canvasWidth * 0.42,
    y: canvasHeight * 0.9 - (z / 52) * canvasHeight * 0.78,
  };
}

function renderScope() {
  if (!context2d) return;
  context2d.fillStyle = "rgba(10,10,15,0.22)";
  context2d.fillRect(0, 0, canvasWidth, canvasHeight);

  context2d.strokeStyle = "rgba(255,255,255,0.035)";
  context2d.lineWidth = 1;
  for (let division = 1; division < 8; division += 1) {
    const x = (canvasWidth / 8) * division;
    const y = (canvasHeight / 8) * division;
    context2d.beginPath();
    context2d.moveTo(x, 0);
    context2d.lineTo(x, canvasHeight);
    context2d.stroke();
    context2d.beginPath();
    context2d.moveTo(0, y);
    context2d.lineTo(canvasWidth, y);
    context2d.stroke();
  }

  if (trail.length > 1) {
    context2d.lineWidth = 1.35;
    context2d.beginPath();
    trail.forEach((state, index) => {
      const point = project(state);
      if (index === 0) context2d.moveTo(point.x, point.y);
      else context2d.lineTo(point.x, point.y);
    });
    context2d.strokeStyle = "rgba(245,166,35,0.72)";
    context2d.stroke();

    const head = project(trail.at(-1));
    context2d.beginPath();
    context2d.arc(head.x, head.y, 4, 0, Math.PI * 2);
    context2d.fillStyle = "rgba(232,232,224,0.95)";
    context2d.fill();
  }
}

function animateScope() {
  renderScope();
  animationFrame = requestAnimationFrame(animateScope);
}

function updateTelemetry() {
  if (!engine) return;
  const snapshot = engine.snapshot();
  const [x, y, z] = snapshot.state;
  readouts.x.textContent = format(x);
  readouts.y.textContent = format(y);
  readouts.z.textContent = format(z);
  readouts.carrier.textContent = `${format(snapshot.mapped.carrier, 2)} Hz`;
  readouts.modulator.textContent = `${format(snapshot.mapped.modulator, 2)} Hz`;
  readouts.cutoff.textContent = `${format(snapshot.mapped.cutoff, 2)} Hz`;
  readouts.pan.textContent = format(snapshot.mapped.pan, 3);
  readouts.elapsed.textContent = `${format(snapshot.elapsed, 2)} s`;
  trail.push(snapshot.state);
  if (trail.length > MAX_TRAIL_POINTS) trail.splice(0, trail.length - MAX_TRAIL_POINTS);
  if (reducedMotion.matches) renderScope();
}

function beginTelemetry() {
  if (telemetryTimer !== null) return;
  updateTelemetry();
  telemetryTimer = window.setInterval(updateTelemetry, 100);
  if (!reducedMotion.matches && animationFrame === null) animateScope();
}

function endTelemetry() {
  if (telemetryTimer !== null) window.clearInterval(telemetryTimer);
  telemetryTimer = null;
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);
  animationFrame = null;
}

async function startAudio() {
  if (engine?.running) return;
  startButton.disabled = true;
  setStatus("starting");

  try {
    if (!engine || engine.destroyed) {
      engine = new LorenzFmEngine({
        volume: Number(volumeInput.value) / 1000,
        rate: Number(rateInput.value),
        fmDepth: Number(depthInput.value),
      });
    }
    await engine.start();
    stopButton.disabled = false;
    resetButton.disabled = false;
    setStatus("running", "normal");
    beginTelemetry();
  } catch (error) {
    console.error(error);
    setStatus(`failed: ${error.message}`, "error");
    await engine?.destroy().catch(() => {});
    engine = null;
    startButton.disabled = false;
  }
}

async function stopAudio() {
  stopButton.disabled = true;
  setStatus("stopping");
  endTelemetry();
  await engine?.destroy();
  engine = null;
  startButton.disabled = false;
  resetButton.disabled = true;
  setStatus("idle");
}

function resetSystem() {
  if (!engine) return;
  engine.reset();
  trail.length = 0;
  updateTelemetry();
}

startButton?.addEventListener("click", startAudio);
stopButton?.addEventListener("click", stopAudio);
resetButton?.addEventListener("click", resetSystem);

volumeInput?.addEventListener("input", () => {
  updateControls();
  engine?.setVolume(Number(volumeInput.value) / 1000);
});
rateInput?.addEventListener("input", () => {
  updateControls();
  engine?.setRate(Number(rateInput.value));
});
depthInput?.addEventListener("input", () => {
  updateControls();
  engine?.setFmDepth(Number(depthInput.value));
});

window.addEventListener("resize", resizeCanvas);
window.addEventListener("pagehide", () => {
  endTelemetry();
  void engine?.destroy();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && engine?.running) setStatus("running // tab hidden", "watch");
  else if (engine?.running) setStatus("running", "normal");
});

updateControls();
resizeCanvas();
renderScope();
