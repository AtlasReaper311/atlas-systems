const startButton = document.querySelector("#start-audio");
const stopButton = document.querySelector("#stop-audio");
const status = document.querySelector("#audio-status");
const canvas = document.querySelector("#scope");
const context2d = canvas.getContext("2d");
const rmsMeter = document.querySelector("#rms-meter");
const peakMeter = document.querySelector("#peak-meter");
const grainMeter = document.querySelector("#grain-meter");
const sampleRate = document.querySelector("#sample-rate");
const seedInput = document.querySelector("#seed");

const GRAIN_COUNT = 48;
const GRAIN_STATE_STRIDE = 4;
const GRAIN_STATE_LENGTH = GRAIN_COUNT * GRAIN_STATE_STRIDE;
const STATE_BUFFER_COUNT = 2;

let audioContext = null;
let workletNode = null;
let master = null;
let animationFrame = null;
let grainState = null;

const genomes = {
  "glass-rain": { density: 0.8, grainSize: 0.05, spread: 0.8, tone: 0.9, tension: 0.1, texture: 0.3, width: 0.9, feedback: 0.4, evolution: 0.8, quantize: 1.0, lushness: 0.3, shape: 0.1 },
  "deep-drone": { density: 0.2, grainSize: 0.6, spread: 0.2, tone: 0.2, tension: 0.7, texture: 0.5, width: 0.6, feedback: 0.8, evolution: 0.2, quantize: 0.0, lushness: 0.9, shape: 0.6 },
  "swarm": { density: 0.9, grainSize: 0.15, spread: 1.0, tone: 0.5, tension: 0.9, texture: 0.8, width: 1.0, feedback: 0.5, evolution: 0.9, quantize: 0.2, lushness: 0.5, shape: 0.8 },
  "choral": { density: 0.4, grainSize: 0.4, spread: 0.5, tone: 0.4, tension: 0.2, texture: 0.2, width: 0.8, feedback: 0.7, evolution: 0.4, quantize: 1.0, lushness: 1.0, shape: 0.5 }
};

function db(value) {
  return value > 0 ? `${(20 * Math.log10(value)).toFixed(1)} dBFS` : "-∞ dBFS";
}

function setStatus(label, state = "") {
  status.textContent = label;
  status.dataset.state = state;
}

function draw() {
  const width = canvas.width;
  const height = canvas.height;

  context2d.fillStyle = "rgba(10, 10, 15, 0.25)";
  context2d.fillRect(0, 0, width, height);

  context2d.strokeStyle = "rgba(255,255,255,.05)";
  context2d.lineWidth = 1;
  context2d.beginPath();
  context2d.moveTo(0, height / 2);
  context2d.lineTo(width, height / 2);
  context2d.stroke();

  if (grainState) {
    context2d.fillStyle = "#f5a623";

    for (let index = 0; index < GRAIN_COUNT; index += 1) {
      const offset = index * GRAIN_STATE_STRIDE;
      const active = grainState[offset];
      if (active !== 1) continue;

      const pan = grainState[offset + 1];
      const ratio = grainState[offset + 2];
      const phase = grainState[offset + 3];
      const envelope = Math.sin(phase * Math.PI);
      const x = (pan + 1) * 0.5 * width;
      const y = height - (((ratio - 0.25) / 1.75) * height * 0.8 + height * 0.1);
      const size = envelope * 12;

      context2d.beginPath();
      context2d.arc(x, y, Math.max(1, size), 0, Math.PI * 2);
      context2d.globalAlpha = envelope * 0.8;
      context2d.fill();
    }

    context2d.globalAlpha = 1;
  }

  animationFrame = requestAnimationFrame(draw);
}

function applyControl(input) {
  const value = Number(input.value);
  const output = document.querySelector(`output[for="${input.id}"]`);
  if (output) output.value = input.id === "grainSize" ? `${value.toFixed(2)} s` : value.toFixed(2);

  const parameter = workletNode?.parameters.get(input.id);
  if (parameter && audioContext) {
    parameter.setTargetAtTime(value, audioContext.currentTime, 0.05);
  }
}

function bindControls() {
  document.querySelectorAll("#controls input[type=range]").forEach((input) => {
    input.addEventListener("input", () => applyControl(input));
    applyControl(input);
  });
}

function syncControlsToWorklet() {
  document.querySelectorAll("#controls input[type=range]").forEach(applyControl);
}

function loadGenome(name) {
  const settings = genomes[name];
  if (!settings) return;

  Object.entries(settings).forEach(([key, value]) => {
    const input = document.getElementById(key);
    if (!input) return;
    input.value = value;
    input.dispatchEvent(new Event("input"));
  });
}

function primeStateBuffers() {
  for (let index = 0; index < STATE_BUFFER_COUNT; index += 1) {
    const state = new Float32Array(GRAIN_STATE_LENGTH);
    workletNode.port.postMessage(
      { type: "grain-state-buffer", state },
      [state.buffer],
    );
  }
}

function handleWorkletMessage(event) {
  const message = event.data;

  if (message?.type === "grain-state" && message.state instanceof Float32Array) {
    const previousState = grainState;
    grainState = message.state;

    if (previousState && previousState.buffer.byteLength > 0 && workletNode) {
      workletNode.port.postMessage(
        { type: "grain-state-buffer", state: previousState },
        [previousState.buffer],
      );
    }
    return;
  }

  if (message?.type !== "meter") return;
  rmsMeter.textContent = db(message.rms);
  peakMeter.textContent = db(message.peak);
  grainMeter.textContent = String(message.grains);
}

async function startAudio() {
  if (!("AudioWorkletNode" in window)) {
    setStatus("AudioWorklet unsupported", "error");
    return;
  }

  startButton.disabled = true;
  setStatus("starting");
  grainState = null;

  try {
    audioContext = new AudioContext({ latencyHint: "interactive" });
    await audioContext.audioWorklet.addModule("/lab/signal/worklets/signal-garden-processor.js");

    workletNode = new AudioWorkletNode(audioContext, "signal-garden", {
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    workletNode.port.onmessage = handleWorkletMessage;

    master = new GainNode(audioContext, { gain: 0.32 });
    workletNode.connect(master).connect(audioContext.destination);

    syncControlsToWorklet();
    primeStateBuffers();
    workletNode.port.postMessage({ type: "seed", value: Number(seedInput.value) });

    await audioContext.resume();
    sampleRate.textContent = `${audioContext.sampleRate.toLocaleString()} Hz`;
    stopButton.disabled = false;
    setStatus("running", "normal");

    context2d.clearRect(0, 0, canvas.width, canvas.height);
    draw();
  } catch (error) {
    console.error(error);

    if (audioContext) {
      await audioContext.close().catch(() => {});
    }

    audioContext = null;
    workletNode = null;
    master = null;
    grainState = null;
    setStatus(`failed: ${error.message}`, "error");
    startButton.disabled = false;
  }
}

async function stopAudio() {
  stopButton.disabled = true;

  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = null;

  if (audioContext) await audioContext.close();

  audioContext = null;
  workletNode = null;
  master = null;
  grainState = null;
  rmsMeter.textContent = "-∞ dBFS";
  peakMeter.textContent = "-∞ dBFS";
  grainMeter.textContent = "0";
  sampleRate.textContent = "not started";
  startButton.disabled = false;
  setStatus("idle");
  context2d.globalAlpha = 1;
  context2d.clearRect(0, 0, canvas.width, canvas.height);
}

startButton.addEventListener("click", startAudio);
stopButton.addEventListener("click", stopAudio);
document.querySelector("#apply-seed").addEventListener("click", () => {
  workletNode?.port.postMessage({ type: "seed", value: Number(seedInput.value) });
});
document.querySelector("#random-seed").addEventListener("click", () => {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  seedInput.value = String(values[0] || 311);
  workletNode?.port.postMessage({ type: "seed", value: Number(seedInput.value) });
});
document.querySelectorAll(".genome-btn").forEach((button) => {
  button.addEventListener("click", (event) => loadGenome(event.currentTarget.dataset.genome));
});

bindControls();
