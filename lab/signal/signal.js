const startButton = document.querySelector("#start-audio");
const stopButton = document.querySelector("#stop-audio");
const recordButton = document.querySelector("#record-audio");
const stopRecordingButton = document.querySelector("#stop-recording");
const status = document.querySelector("#audio-status");
const canvas = document.querySelector("#scope");
const gardenStage = document.querySelector("#garden-stage");
const context2d = canvas.getContext("2d");
const rmsMeter = document.querySelector("#rms-meter");
const peakMeter = document.querySelector("#peak-meter");
const grainMeter = document.querySelector("#grain-meter");
const voiceMeter = document.querySelector("#voice-meter");
const loadMeter = document.querySelector("#load-meter");
const sampleRateLabel = document.querySelector("#sample-rate");
const seedInput = document.querySelector("#seed");
const genomeASelect = document.querySelector("#genome-a");
const genomeBSelect = document.querySelector("#genome-b");
const genomeBlendInput = document.querySelector("#genome-blend");
const genomeBlendOutput = document.querySelector("#genome-blend-output");
const mutationInput = document.querySelector("#mutation");
const mutationOutput = document.querySelector("#mutation-output");
const ecosystemLabel = document.querySelector("#ecosystem-label");
const macroPad = document.querySelector("#macro-pad");
const macroCursor = document.querySelector("#macro-cursor");
const macroXOutput = document.querySelector("#macro-x-output");
const macroYOutput = document.querySelector("#macro-y-output");
const audioFileInput = document.querySelector("#audio-file");
const dropZone = document.querySelector("#drop-zone");
const sourceLabel = document.querySelector("#source-label");
const restoreProceduralButton = document.querySelector("#restore-procedural");
const adaptiveQualityInput = document.querySelector("#adaptive-quality");
const recordingLink = document.querySelector("#recording-link");
const shareStatus = document.querySelector("#share-status");
const inspectSource = document.querySelector("#inspect-source");
const inspectPitch = document.querySelector("#inspect-pitch");
const inspectEnvelope = document.querySelector("#inspect-envelope");
const inspectFeedback = document.querySelector("#inspect-feedback");
const inspectSpectral = document.querySelector("#inspect-spectral");
const inspectQuality = document.querySelector("#inspect-quality");
const inspectOverruns = document.querySelector("#inspect-overruns");

const GRAIN_COUNT = 48;
const GRAIN_STATE_STRIDE = 4;
const GRAIN_STATE_LENGTH = GRAIN_COUNT * GRAIN_STATE_STRIDE;
const STATE_BUFFER_COUNT = 2;
const MAX_SOURCE_SECONDS = 120;
const WORKLET_URL = "/lab/signal/worklets/signal-garden-processor.js?v=20260719-vnext";
const PARAMETER_IDS = [
  "density",
  "grainSize",
  "spread",
  "tone",
  "tension",
  "texture",
  "width",
  "feedback",
  "evolution",
  "quantize",
  "lushness",
  "shape",
];

const genomeDefinitions = {
  "glass-rain": {
    label: "Glass Rain",
    params: { density: 0.78, grainSize: 0.07, spread: 0.82, tone: 0.88, tension: 0.12, texture: 0.28, width: 0.92, feedback: 0.42, evolution: 0.72, quantize: 0.96, lushness: 0.34, shape: 0.18 },
    ratios: [0.5, 0.75, 1, 1.25, 1.5, 2],
    weights: [0.08, 0.16, 0.27, 0.22, 0.17, 0.1],
    motion: { panDrift: 0.72, pitchDrift: 0.04, orbit: 0.34, attractor: 0.86 },
  },
  "deep-drone": {
    label: "Deep Drone",
    params: { density: 0.18, grainSize: 0.64, spread: 0.22, tone: 0.2, tension: 0.24, texture: 0.42, width: 0.62, feedback: 0.76, evolution: 0.24, quantize: 0.9, lushness: 0.88, shape: 0.54 },
    ratios: [0.25, 0.5, 0.75, 1, 1.5],
    weights: [0.14, 0.3, 0.05, 0.4, 0.11],
    motion: { panDrift: 0.14, pitchDrift: 0.018, orbit: 0.12, attractor: 0.42 },
  },
  swarm: {
    label: "Anxious Swarm",
    params: { density: 0.92, grainSize: 0.14, spread: 0.96, tone: 0.54, tension: 0.88, texture: 0.82, width: 1, feedback: 0.52, evolution: 0.94, quantize: 0.42, lushness: 0.46, shape: 0.78 },
    ratios: [0.5, 0.7071, 0.75, 1, 1.0595, 1.4142, 1.5, 2],
    weights: [0.08, 0.15, 0.09, 0.2, 0.16, 0.13, 0.1, 0.09],
    motion: { panDrift: 1, pitchDrift: 0.16, orbit: 1, attractor: 1 },
  },
  choral: {
    label: "Choral",
    params: { density: 0.42, grainSize: 0.42, spread: 0.46, tone: 0.48, tension: 0.16, texture: 0.18, width: 0.86, feedback: 0.66, evolution: 0.42, quantize: 0.98, lushness: 0.96, shape: 0.5 },
    ratios: [0.5, 0.6667, 0.75, 1, 1.25, 1.3333, 1.5, 2],
    weights: [0.06, 0.09, 0.12, 0.28, 0.14, 0.11, 0.14, 0.06],
    motion: { panDrift: 0.34, pitchDrift: 0.028, orbit: 0.22, attractor: 0.62 },
  },
  "tidal-memory": {
    label: "Tidal Memory",
    params: { density: 0.34, grainSize: 0.5, spread: 0.58, tone: 0.38, tension: 0.3, texture: 0.36, width: 0.94, feedback: 0.7, evolution: 0.78, quantize: 0.78, lushness: 0.82, shape: 0.62 },
    ratios: [0.5, 0.75, 1, 1.125, 1.5, 2],
    weights: [0.1, 0.14, 0.32, 0.13, 0.2, 0.11],
    motion: { panDrift: 0.52, pitchDrift: 0.065, orbit: 0.5, attractor: 0.74 },
  },
  "lichen-choir": {
    label: "Lichen Choir",
    params: { density: 0.54, grainSize: 0.34, spread: 0.38, tone: 0.62, tension: 0.22, texture: 0.5, width: 0.72, feedback: 0.6, evolution: 0.64, quantize: 0.9, lushness: 0.72, shape: 0.44 },
    ratios: [0.5, 0.6667, 0.8, 1, 1.2, 1.5, 2],
    weights: [0.08, 0.12, 0.13, 0.3, 0.13, 0.16, 0.08],
    motion: { panDrift: 0.38, pitchDrift: 0.045, orbit: 0.42, attractor: 0.68 },
  },
};

const weatherProfiles = {
  clear: { label: "Clear", feedbackScale: 1, lushnessScale: 1, toneOffset: 0, widthScale: 1 },
  mist: { label: "Mist", feedbackScale: 1.04, lushnessScale: 1.12, toneOffset: -0.08, widthScale: 1.04 },
  bloom: { label: "Bloom", feedbackScale: 1.12, lushnessScale: 1.18, toneOffset: 0.08, widthScale: 1.08 },
  storm: { label: "Storm", feedbackScale: 1.22, lushnessScale: 1.06, toneOffset: -0.2, widthScale: 1.12 },
  void: { label: "Void", feedbackScale: 1.26, lushnessScale: 1.2, toneOffset: -0.3, widthScale: 1.02 },
};

let audioContext = null;
let workletNode = null;
let master = null;
let recordingDestination = null;
let mediaRecorder = null;
let recordingChunks = [];
let recordingUrl = null;
let animationFrame = null;
let grainState = null;
let currentGenomeProfile = null;
let currentBaseParams = { ...genomeDefinitions["glass-rain"].params };
let currentWeather = "clear";
let currentSpectralMode = "off";
let macroX = 0.5;
let macroY = 0.5;
let sourcePCM = null;
let sourcePCMRate = 0;
let sourcePCMName = "";
let canvasWidth = 1000;
let canvasHeight = 420;
let attractorSendFrame = null;
let macroPointerActive = false;

const attractor = {
  active: false,
  x: 0.5,
  y: 0.5,
  strength: 0,
  velocity: 0,
  lastX: 0.5,
  lastY: 0.5,
  lastTime: 0,
};

class Lcg {
  constructor(seed = 311) {
    this.state = seed >>> 0 || 311;
  }

  next() {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  bipolar() {
    return this.next() * 2 - 1;
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function db(value) {
  return value > 0 ? `${(20 * Math.log10(value)).toFixed(1)} dBFS` : "-∞ dBFS";
}

function setStatus(label, state = "") {
  status.textContent = label;
  status.dataset.state = state;
}

function getControl(id) {
  return document.getElementById(id);
}

function formatControlValue(id, value) {
  if (id === "grainSize") return `${value.toFixed(2)} s`;
  return value.toFixed(2);
}

function setControlValue(id, value, timeConstant = 0.08) {
  const input = getControl(id);
  if (!input) return;

  const minimum = Number(input.min);
  const maximum = Number(input.max);
  const clamped = clamp(value, minimum, maximum);
  input.value = String(clamped);

  const output = document.querySelector(`output[for="${id}"]`);
  if (output) output.value = formatControlValue(id, clamped);

  const parameter = workletNode?.parameters.get(id);
  if (parameter && audioContext) {
    parameter.setTargetAtTime(clamped, audioContext.currentTime, timeConstant);
  }
}

function applyControl(input) {
  setControlValue(input.id, Number(input.value), 0.05);
}

function bindControls() {
  document.querySelectorAll("#controls input[type=range]").forEach((input) => {
    input.addEventListener("input", () => applyControl(input));
    applyControl(input);
  });
}

function syncControlsToWorklet() {
  PARAMETER_IDS.forEach((id) => setControlValue(id, Number(getControl(id).value), 0.03));
}

function sampleProfileArray(values, normalizedIndex) {
  if (values.length === 1) return values[0];
  const position = normalizedIndex * (values.length - 1);
  const left = Math.floor(position);
  const right = Math.min(values.length - 1, left + 1);
  return lerp(values[left], values[right], position - left);
}

function normalizeWeights(weights) {
  let sum = 0;
  for (const weight of weights) sum += Math.max(0.0001, weight);
  return weights.map((weight) => Math.max(0.0001, weight) / sum);
}

function buildHybridProfile() {
  const genomeA = genomeDefinitions[genomeASelect.value] || genomeDefinitions["glass-rain"];
  const genomeB = genomeDefinitions[genomeBSelect.value] || genomeDefinitions.swarm;
  const blend = Number(genomeBlendInput.value);
  const mutation = Number(mutationInput.value);
  const seed = Number(seedInput.value) || 311;
  const random = new Lcg(seed ^ hashString(genomeASelect.value) ^ hashString(genomeBSelect.value));
  const params = {};

  for (const id of PARAMETER_IDS) {
    const base = lerp(genomeA.params[id], genomeB.params[id], blend);
    const mutationDepth = id === "feedback" ? 0.035 : 0.075;
    params[id] = clamp(base + random.bipolar() * mutation * mutationDepth, 0, id === "feedback" ? 0.82 : 1);
  }
  params.grainSize = clamp(params.grainSize, 0.03, 0.75);
  params.density = clamp(params.density, 0.02, 1);

  const ratioCount = Math.max(genomeA.ratios.length, genomeB.ratios.length);
  const ratios = [];
  const weights = [];
  for (let index = 0; index < ratioCount; index += 1) {
    const position = ratioCount === 1 ? 0 : index / (ratioCount - 1);
    const ratio = lerp(
      sampleProfileArray(genomeA.ratios, position),
      sampleProfileArray(genomeB.ratios, position),
      blend,
    );
    const detune = 2 ** (random.bipolar() * mutation * 0.09);
    ratios.push(clamp(ratio * detune, 0.25, 2));
    const weight = lerp(
      sampleProfileArray(genomeA.weights, position),
      sampleProfileArray(genomeB.weights, position),
      blend,
    );
    weights.push(Math.max(0.001, weight * (1 + random.bipolar() * mutation * 0.7)));
  }

  const motion = {};
  for (const key of ["panDrift", "pitchDrift", "orbit", "attractor"]) {
    const value = lerp(genomeA.motion[key], genomeB.motion[key], blend);
    motion[key] = clamp(value * (1 + random.bipolar() * mutation * 0.3), 0, key === "pitchDrift" ? 0.3 : 1.25);
  }

  let label = genomeA.label;
  if (blend >= 0.02 && blend <= 0.98) label = `${genomeA.label} × ${genomeB.label}`;
  if (blend > 0.98) label = genomeB.label;
  if (mutation > 0.25) label = `${label} // MUTATED`;

  return {
    label,
    params,
    ratios: ratios.sort((a, b) => a - b),
    weights: normalizeWeights(weights),
    motion,
  };
}

function postGenomeProfile() {
  if (!workletNode || !currentGenomeProfile) return;
  workletNode.port.postMessage({
    type: "genome-profile",
    ratios: currentGenomeProfile.ratios,
    weights: currentGenomeProfile.weights,
    motion: currentGenomeProfile.motion,
  });
}

function applyMacroFromBase() {
  const density = clamp(currentBaseParams.density * (0.55 + macroX * 0.9), 0.02, 1);
  const grainSize = clamp(currentBaseParams.grainSize * (1.28 - macroX * 0.52), 0.03, 0.75);
  const spread = clamp(currentBaseParams.spread + (macroX - 0.5) * 0.18 + (macroY - 0.5) * 0.28, 0, 1);
  const tension = clamp(currentBaseParams.tension + (macroY - 0.5) * 0.56, 0, 1);
  const texture = clamp(currentBaseParams.texture + (macroY - 0.5) * 0.26, 0, 1);
  const evolution = clamp(currentBaseParams.evolution + (macroY - 0.5) * 0.42, 0, 1);

  setControlValue("density", density);
  setControlValue("grainSize", grainSize);
  setControlValue("spread", spread);
  setControlValue("tension", tension);
  setControlValue("texture", texture);
  setControlValue("evolution", evolution);
}

function applyWeather(name, updateUrl = true) {
  const profile = weatherProfiles[name] || weatherProfiles.clear;
  currentWeather = name in weatherProfiles ? name : "clear";

  setControlValue("feedback", clamp(currentBaseParams.feedback * profile.feedbackScale, 0, 0.82), 0.16);
  setControlValue("lushness", clamp(currentBaseParams.lushness * profile.lushnessScale, 0, 1), 0.16);
  setControlValue("tone", clamp(currentBaseParams.tone + profile.toneOffset, 0, 1), 0.16);
  setControlValue("width", clamp(currentBaseParams.width * profile.widthScale, 0, 1), 0.16);

  document.querySelectorAll(".weather-btn").forEach((button) => {
    const active = button.dataset.weather === currentWeather;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  inspectFeedback.textContent = `${profile.label} // 4-line Hadamard FDN`;
  workletNode?.port.postMessage({ type: "weather", value: currentWeather });
  if (updateUrl) syncUrl();
}

function applySpectralMode(mode, updateUrl = true) {
  const validModes = new Set(["off", "freeze", "blur", "shimmer"]);
  currentSpectralMode = validModes.has(mode) ? mode : "off";

  document.querySelectorAll(".spectral-btn").forEach((button) => {
    const active = button.dataset.spectral === currentSpectralMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  inspectSpectral.textContent = currentSpectralMode;
  workletNode?.port.postMessage({ type: "spectral-mode", value: currentSpectralMode });
  if (updateUrl) syncUrl();
}

function applyGenome(updateUrl = true) {
  currentGenomeProfile = buildHybridProfile();
  currentBaseParams = { ...currentGenomeProfile.params };

  for (const [id, value] of Object.entries(currentBaseParams)) {
    setControlValue(id, value, 0.12);
  }

  applyMacroFromBase();
  applyWeather(currentWeather, false);
  ecosystemLabel.textContent = currentGenomeProfile.label.toUpperCase();
  inspectPitch.textContent = currentGenomeProfile.label;
  document.querySelectorAll(".genome-quick-btn").forEach((button) => {
    const exactSnapshot = genomeASelect.value === genomeBSelect.value
      && Number(genomeBlendInput.value) === 0
      && Number(mutationInput.value) === 0;
    button.classList.toggle("active", exactSnapshot && button.dataset.genome === genomeASelect.value);
  });
  postGenomeProfile();

  if (updateUrl) syncUrl();
}

function setMacroPosition(x, y, updateUrl = true) {
  macroX = clamp(x, 0, 1);
  macroY = clamp(y, 0, 1);
  macroCursor.style.left = `${macroX * 100}%`;
  macroCursor.style.top = `${(1 - macroY) * 100}%`;
  macroXOutput.textContent = `${Math.round(macroX * 100)}%`;
  macroYOutput.textContent = `${Math.round(macroY * 100)}%`;
  applyMacroFromBase();
  if (updateUrl) syncUrl();
}

function syncUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("ga", genomeASelect.value);
  url.searchParams.set("gb", genomeBSelect.value);
  url.searchParams.set("mix", Number(genomeBlendInput.value).toFixed(2));
  url.searchParams.set("mut", Number(mutationInput.value).toFixed(2));
  url.searchParams.set("seed", String(Number(seedInput.value) || 311));
  url.searchParams.set("mx", macroX.toFixed(2));
  url.searchParams.set("my", macroY.toFixed(2));
  url.searchParams.set("weather", currentWeather);
  url.searchParams.set("spectral", currentSpectralMode);
  history.replaceState(null, "", url);
}

function restoreStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("ga") && genomeDefinitions[params.get("ga")]) genomeASelect.value = params.get("ga");
  if (params.has("gb") && genomeDefinitions[params.get("gb")]) genomeBSelect.value = params.get("gb");
  if (params.has("mix")) genomeBlendInput.value = String(clamp(Number(params.get("mix")), 0, 1));
  if (params.has("mut")) mutationInput.value = String(clamp(Number(params.get("mut")), 0, 1));
  if (params.has("seed")) seedInput.value = String(clamp(Number(params.get("seed")) || 311, 1, 4294967295));
  if (params.has("mx")) macroX = clamp(Number(params.get("mx")), 0, 1);
  if (params.has("my")) macroY = clamp(Number(params.get("my")), 0, 1);
  if (params.has("weather") && weatherProfiles[params.get("weather")]) currentWeather = params.get("weather");
  if (["off", "freeze", "blur", "shimmer"].includes(params.get("spectral"))) currentSpectralMode = params.get("spectral");

  genomeBlendOutput.value = Number(genomeBlendInput.value).toFixed(2);
  mutationOutput.value = Number(mutationInput.value).toFixed(2);
  setMacroPosition(macroX, macroY, false);
  applyGenome(false);
  applySpectralMode(currentSpectralMode, false);
  syncUrl();
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

function postSourceBuffer() {
  if (!workletNode || !sourcePCM) return;
  const samples = sourcePCM.slice();
  workletNode.port.postMessage(
    {
      type: "source-buffer",
      samples,
      sampleRate: sourcePCMRate,
      name: sourcePCMName,
    },
    [samples.buffer],
  );
}

function sendAttractor() {
  attractorSendFrame = null;
  workletNode?.port.postMessage({
    type: "attractor",
    active: attractor.active,
    x: attractor.x,
    y: attractor.y,
    strength: attractor.strength,
    velocity: attractor.velocity,
  });
}

function queueAttractorMessage() {
  if (attractorSendFrame !== null) return;
  attractorSendFrame = requestAnimationFrame(sendAttractor);
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
  voiceMeter.textContent = String(message.voiceLimit ?? GRAIN_COUNT);
  loadMeter.textContent = `${Math.round(clamp(message.renderLoad ?? 0, 0, 4) * 100)}%`;
  inspectOverruns.textContent = String(message.overBudgetCount ?? 0);
  const loadMode = message.loadMode === "measured" ? "measured" : "estimated";
  const quality = message.voiceLimit < GRAIN_COUNT ? `reduced ${message.voiceLimit}/${GRAIN_COUNT}` : "full";
  inspectQuality.textContent = `${adaptiveQualityInput.checked ? "adaptive" : "fixed"} // ${quality} // ${loadMode}`;
}

function resizeCanvas() {
  const rectangle = gardenStage.getBoundingClientRect();
  const deviceScale = Math.min(2, window.devicePixelRatio || 1);
  canvasWidth = Math.max(1, rectangle.width);
  canvasHeight = Math.max(1, rectangle.height);
  canvas.width = Math.round(canvasWidth * deviceScale);
  canvas.height = Math.round(canvasHeight * deviceScale);
  context2d.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
}

function ratioToY(ratio) {
  return canvasHeight - (((clamp(ratio, 0.25, 2) - 0.25) / 1.75) * canvasHeight * 0.76 + canvasHeight * 0.12);
}

function drawPitchField() {
  if (!currentGenomeProfile) return;
  context2d.lineWidth = 1;

  for (let index = 0; index < currentGenomeProfile.ratios.length; index += 1) {
    const ratio = currentGenomeProfile.ratios[index];
    const y = ratioToY(ratio);
    context2d.strokeStyle = "rgba(245,166,35,0.055)";
    context2d.beginPath();
    context2d.moveTo(0, y);
    context2d.lineTo(canvasWidth, y);
    context2d.stroke();
  }
}

function drawAttractor() {
  if (!attractor.active) return;
  const x = attractor.x * canvasWidth;
  const y = attractor.y * canvasHeight;
  const radius = 24 + attractor.strength * 52;

  context2d.strokeStyle = `rgba(245,166,35,${0.25 + attractor.strength * 0.45})`;
  context2d.lineWidth = 1;
  context2d.beginPath();
  context2d.arc(x, y, radius, 0, Math.PI * 2);
  context2d.stroke();

  context2d.beginPath();
  context2d.arc(x, y, 3 + attractor.velocity * 5, 0, Math.PI * 2);
  context2d.fillStyle = "rgba(245,166,35,0.9)";
  context2d.fill();
}

function draw() {
  context2d.fillStyle = "rgba(10,10,15,0.2)";
  context2d.fillRect(0, 0, canvasWidth, canvasHeight);
  drawPitchField();

  context2d.strokeStyle = "rgba(255,255,255,.035)";
  context2d.lineWidth = 1;
  context2d.beginPath();
  context2d.moveTo(canvasWidth / 2, 0);
  context2d.lineTo(canvasWidth / 2, canvasHeight);
  context2d.stroke();

  if (grainState) {
    for (let index = 0; index < GRAIN_COUNT; index += 1) {
      const offset = index * GRAIN_STATE_STRIDE;
      if (grainState[offset] !== 1) continue;

      const pan = grainState[offset + 1];
      const ratio = grainState[offset + 2];
      const phase = grainState[offset + 3];
      const envelope = Math.max(0, Math.sin(phase * Math.PI));
      const x = (pan + 1) * 0.5 * canvasWidth;
      const y = ratioToY(ratio);
      const size = 1.5 + envelope * 10;

      if (attractor.active) {
        const ax = attractor.x * canvasWidth;
        const ay = attractor.y * canvasHeight;
        const distance = Math.hypot(ax - x, ay - y);
        if (distance < 180) {
          context2d.strokeStyle = `rgba(245,166,35,${(1 - distance / 180) * 0.08})`;
          context2d.beginPath();
          context2d.moveTo(x, y);
          context2d.lineTo(ax, ay);
          context2d.stroke();
        }
      }

      context2d.beginPath();
      context2d.arc(x, y, size, 0, Math.PI * 2);
      context2d.fillStyle = `rgba(245,166,35,${0.12 + envelope * 0.72})`;
      context2d.fill();

      context2d.beginPath();
      context2d.arc(x, y, Math.max(1, size * 0.28), 0, Math.PI * 2);
      context2d.fillStyle = `rgba(232,232,224,${0.15 + envelope * 0.5})`;
      context2d.fill();
    }
  }

  drawAttractor();
  animationFrame = requestAnimationFrame(draw);
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
    await audioContext.audioWorklet.addModule(WORKLET_URL);

    workletNode = new AudioWorkletNode(audioContext, "signal-garden", {
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    workletNode.port.onmessage = handleWorkletMessage;

    master = new GainNode(audioContext, { gain: 0.32 });
    recordingDestination = audioContext.createMediaStreamDestination();
    workletNode.connect(master);
    master.connect(audioContext.destination);
    master.connect(recordingDestination);

    syncControlsToWorklet();
    primeStateBuffers();
    workletNode.port.postMessage({ type: "seed", value: Number(seedInput.value) || 311 });
    workletNode.port.postMessage({ type: "adaptive-quality", value: adaptiveQualityInput.checked });
    workletNode.port.postMessage({ type: "weather", value: currentWeather });
    workletNode.port.postMessage({ type: "spectral-mode", value: currentSpectralMode });
    postGenomeProfile();
    postSourceBuffer();
    sendAttractor();

    await audioContext.resume();
    sampleRateLabel.textContent = `${audioContext.sampleRate.toLocaleString()} Hz`;
    stopButton.disabled = false;
    recordButton.disabled = !("MediaRecorder" in window);
    setStatus("running", "normal");

    resizeCanvas();
    context2d.clearRect(0, 0, canvasWidth, canvasHeight);
    draw();
  } catch (error) {
    console.error(error);

    if (audioContext) {
      await audioContext.close().catch(() => {});
    }

    audioContext = null;
    workletNode = null;
    master = null;
    recordingDestination = null;
    grainState = null;
    setStatus(`failed: ${error.message}`, "error");
    startButton.disabled = false;
  }
}

function chooseRecordingMimeType() {
  if (!("MediaRecorder" in window)) return "";
  const types = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function startRecording() {
  if (!recordingDestination || !("MediaRecorder" in window)) return;

  recordingChunks = [];
  const mimeType = chooseRecordingMimeType();
  const options = mimeType ? { mimeType } : undefined;
  mediaRecorder = new MediaRecorder(recordingDestination.stream, options);

  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) recordingChunks.push(event.data);
  });

  mediaRecorder.addEventListener("stop", () => {
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    const blob = new Blob(recordingChunks, { type: mediaRecorder.mimeType || "audio/webm" });
    recordingUrl = URL.createObjectURL(blob);
    recordingLink.href = recordingUrl;
    recordingLink.hidden = false;
    recordingChunks = [];
  }, { once: true });

  mediaRecorder.start(500);
  recordButton.disabled = true;
  stopRecordingButton.disabled = false;
  recordButton.textContent = "Recording";
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return;
  mediaRecorder.stop();
  stopRecordingButton.disabled = true;
  recordButton.disabled = false;
  recordButton.textContent = "Record";
}

async function stopAudio() {
  stopButton.disabled = true;

  if (mediaRecorder && mediaRecorder.state !== "inactive") stopRecording();
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  if (attractorSendFrame !== null) cancelAnimationFrame(attractorSendFrame);
  attractorSendFrame = null;

  if (audioContext) await audioContext.close();

  audioContext = null;
  workletNode = null;
  master = null;
  recordingDestination = null;
  mediaRecorder = null;
  grainState = null;
  rmsMeter.textContent = "-∞ dBFS";
  peakMeter.textContent = "-∞ dBFS";
  grainMeter.textContent = "0";
  voiceMeter.textContent = String(GRAIN_COUNT);
  loadMeter.textContent = "0%";
  sampleRateLabel.textContent = "not started";
  recordButton.disabled = true;
  stopRecordingButton.disabled = true;
  recordButton.textContent = "Record";
  startButton.disabled = false;
  setStatus("idle");
  context2d.clearRect(0, 0, canvasWidth, canvasHeight);
}

function updateAttractorFromPointer(event) {
  const rectangle = canvas.getBoundingClientRect();
  const now = performance.now();
  const x = clamp((event.clientX - rectangle.left) / rectangle.width, 0, 1);
  const y = clamp((event.clientY - rectangle.top) / rectangle.height, 0, 1);
  const elapsed = Math.max(8, now - attractor.lastTime);
  const distance = Math.hypot(x - attractor.lastX, y - attractor.lastY);
  const velocity = clamp((distance / elapsed) * 120, 0, 1);

  attractor.active = true;
  attractor.x = x;
  attractor.y = y;
  attractor.velocity = velocity;
  attractor.strength = clamp(0.32 + velocity * 0.68, 0, 1);
  attractor.lastX = x;
  attractor.lastY = y;
  attractor.lastTime = now;
  queueAttractorMessage();
}

function releaseAttractor() {
  attractor.active = false;
  attractor.strength = 0;
  attractor.velocity = 0;
  queueAttractorMessage();
}

function updateMacroFromPointer(event) {
  const rectangle = macroPad.getBoundingClientRect();
  const x = clamp((event.clientX - rectangle.left) / rectangle.width, 0, 1);
  const y = 1 - clamp((event.clientY - rectangle.top) / rectangle.height, 0, 1);
  setMacroPosition(x, y);
}

async function decodeAudioFile(file) {
  if (!file || !file.type.startsWith("audio/")) {
    shareStatus.textContent = "Choose a browser-decodable audio file.";
    return;
  }

  sourceLabel.textContent = "Decoding local audio…";
  const temporaryContext = audioContext || new AudioContext();
  const shouldClose = temporaryContext !== audioContext;

  try {
    const bytes = await file.arrayBuffer();
    const decoded = await temporaryContext.decodeAudioData(bytes);
    const maximumFrames = Math.min(decoded.length, Math.floor(decoded.sampleRate * MAX_SOURCE_SECONDS));
    const mono = new Float32Array(maximumFrames);

    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const data = decoded.getChannelData(channel);
      const scale = 1 / decoded.numberOfChannels;
      for (let index = 0; index < maximumFrames; index += 1) {
        mono[index] += data[index] * scale;
      }
    }

    sourcePCM = mono;
    sourcePCMRate = decoded.sampleRate;
    sourcePCMName = file.name;
    sourceLabel.textContent = file.name;
    restoreProceduralButton.disabled = false;
    inspectSource.textContent = `local sample // ${file.name}`;
    postSourceBuffer();
  } catch (error) {
    console.error(error);
    sourceLabel.textContent = "Procedural source";
    shareStatus.textContent = `Could not decode ${file.name}.`;
  } finally {
    if (shouldClose) await temporaryContext.close().catch(() => {});
  }
}

function restoreProceduralSource() {
  sourcePCM = null;
  sourcePCMRate = 0;
  sourcePCMName = "";
  sourceLabel.textContent = "Procedural source";
  restoreProceduralButton.disabled = true;
  inspectSource.textContent = "procedural circular buffer";
  workletNode?.port.postMessage({ type: "source-procedural" });
}

function randomizeEcosystem() {
  const keys = Object.keys(genomeDefinitions);
  const values = new Uint32Array(3);
  crypto.getRandomValues(values);
  genomeASelect.value = keys[values[0] % keys.length];
  genomeBSelect.value = keys[values[1] % keys.length];
  genomeBlendInput.value = (0.18 + ((values[2] % 6500) / 10000)).toFixed(2);
  mutationInput.value = (0.08 + (((values[0] >>> 8) % 6200) / 10000)).toFixed(2);
  seedInput.value = String(values[1] || 311);
  genomeBlendOutput.value = Number(genomeBlendInput.value).toFixed(2);
  mutationOutput.value = Number(mutationInput.value).toFixed(2);
  applyGenome();
  workletNode?.port.postMessage({ type: "seed", value: Number(seedInput.value) || 311 });
}

async function copyShareLink() {
  syncUrl();
  try {
    await navigator.clipboard.writeText(window.location.href);
    shareStatus.textContent = "Share link copied. Opening it recreates this deterministic ecosystem state.";
  } catch {
    shareStatus.textContent = "The ecosystem URL is ready in the address bar.";
  }
}

startButton.addEventListener("click", startAudio);
stopButton.addEventListener("click", stopAudio);
recordButton.addEventListener("click", startRecording);
stopRecordingButton.addEventListener("click", stopRecording);

document.querySelector("#apply-seed").addEventListener("click", () => {
  const seed = Number(seedInput.value) || 311;
  workletNode?.port.postMessage({ type: "seed", value: seed });
  applyGenome();
});

document.querySelector("#random-seed").addEventListener("click", () => {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  seedInput.value = String(values[0] || 311);
  workletNode?.port.postMessage({ type: "seed", value: Number(seedInput.value) });
  applyGenome();
});

document.querySelector("#apply-genome").addEventListener("click", () => applyGenome());
document.querySelectorAll(".genome-quick-btn").forEach((button) => {
  button.addEventListener("click", () => {
    genomeASelect.value = button.dataset.genome;
    genomeBSelect.value = button.dataset.genome;
    genomeBlendInput.value = "0";
    mutationInput.value = "0";
    genomeBlendOutput.value = "0.00";
    mutationOutput.value = "0.00";
    applyGenome();
  });
});
document.querySelector("#random-ecosystem").addEventListener("click", randomizeEcosystem);
document.querySelector("#share-ecosystem").addEventListener("click", copyShareLink);

genomeBlendInput.addEventListener("input", () => {
  genomeBlendOutput.value = Number(genomeBlendInput.value).toFixed(2);
  applyGenome();
});

mutationInput.addEventListener("input", () => {
  mutationOutput.value = Number(mutationInput.value).toFixed(2);
  applyGenome();
});

genomeASelect.addEventListener("change", () => applyGenome());
genomeBSelect.addEventListener("change", () => applyGenome());

document.querySelectorAll(".weather-btn").forEach((button) => {
  button.addEventListener("click", () => applyWeather(button.dataset.weather));
});

document.querySelectorAll(".spectral-btn").forEach((button) => {
  button.addEventListener("click", () => applySpectralMode(button.dataset.spectral));
});

adaptiveQualityInput.addEventListener("change", () => {
  workletNode?.port.postMessage({ type: "adaptive-quality", value: adaptiveQualityInput.checked });
});

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  attractor.lastTime = performance.now();
  attractor.lastX = clamp((event.offsetX || 0) / Math.max(1, canvas.clientWidth), 0, 1);
  attractor.lastY = clamp((event.offsetY || 0) / Math.max(1, canvas.clientHeight), 0, 1);
  updateAttractorFromPointer(event);
});
canvas.addEventListener("pointermove", (event) => {
  if (event.buttons === 0 && event.pointerType === "mouse") return;
  updateAttractorFromPointer(event);
});
canvas.addEventListener("pointerup", releaseAttractor);
canvas.addEventListener("pointercancel", releaseAttractor);
canvas.addEventListener("lostpointercapture", releaseAttractor);

macroPad.addEventListener("pointerdown", (event) => {
  macroPointerActive = true;
  macroPad.setPointerCapture(event.pointerId);
  updateMacroFromPointer(event);
});
macroPad.addEventListener("pointermove", (event) => {
  if (macroPointerActive) updateMacroFromPointer(event);
});
macroPad.addEventListener("pointerup", () => {
  macroPointerActive = false;
});
macroPad.addEventListener("pointercancel", () => {
  macroPointerActive = false;
});
macroPad.addEventListener("keydown", (event) => {
  const step = event.shiftKey ? 0.1 : 0.03;
  if (event.key === "ArrowLeft") setMacroPosition(macroX - step, macroY);
  else if (event.key === "ArrowRight") setMacroPosition(macroX + step, macroY);
  else if (event.key === "ArrowDown") setMacroPosition(macroX, macroY - step);
  else if (event.key === "ArrowUp") setMacroPosition(macroX, macroY + step);
  else return;
  event.preventDefault();
});

audioFileInput.addEventListener("change", () => decodeAudioFile(audioFileInput.files?.[0]));
restoreProceduralButton.addEventListener("click", restoreProceduralSource);

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  decodeAudioFile(event.dataTransfer?.files?.[0]);
});

window.addEventListener("resize", resizeCanvas);
window.addEventListener("beforeunload", () => {
  if (recordingUrl) URL.revokeObjectURL(recordingUrl);
});

bindControls();
restoreStateFromUrl();
resizeCanvas();
