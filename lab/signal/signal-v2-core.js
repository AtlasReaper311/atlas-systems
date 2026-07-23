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
const masterVolumeInput = document.querySelector("#master-volume");
const masterVolumeOutput = document.querySelector("#master-volume-output");
const characterInput = document.querySelector("#character");
const characterOutput = document.querySelector("#character-output");
const ecosystemSelect = document.querySelector("#ecosystem");
const ecosystemHelp = document.querySelector("#ecosystem-help");
const modeHelp = document.querySelector("#mode-help");
const lifecycleLabel = document.querySelector("#lifecycle-label");
const lifecycleExplanation = document.querySelector("#lifecycle-explanation");
const stageState = document.querySelector("#stage-state");
const stageField = document.querySelector("#stage-field");
const stageMotion = document.querySelector("#stage-motion");
const layerBank = document.querySelector("#layer-bank");
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
const inspectLifecycle = document.querySelector("#inspect-lifecycle");
const inspectField = document.querySelector("#inspect-field");
const inspectLayers = document.querySelector("#inspect-layers");
const inspectSource = document.querySelector("#inspect-source");
const inspectSpectral = document.querySelector("#inspect-spectral");
const inspectFeedback = document.querySelector("#inspect-feedback");
const inspectQuality = document.querySelector("#inspect-quality");
const inspectOverruns = document.querySelector("#inspect-overruns");

const GRAIN_COUNT = 48;
const GRAIN_STATE_STRIDE = 4;
const GRAIN_STATE_LENGTH = GRAIN_COUNT * GRAIN_STATE_STRIDE;
const STATE_BUFFER_COUNT = 2;
const MAX_SOURCE_SECONDS = 120;
const WORKLET_URL = "/lab/signal/worklets/signal-garden-processor-v2.js?v=20260720-soundscape";
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
    description: "Bright resonant droplets, pentatonic gravity, high spectral dust, and slowly widening space.",
    field: "glass pentatonic",
    params: { density: 0.72, grainSize: 0.11, spread: 0.76, tone: 0.82, tension: 0.12, texture: 0.3, width: 0.94, feedback: 0.48, evolution: 0.78, quantize: 0.96, lushness: 0.46, shape: 0.24 },
    ratios: [0.5, 0.75, 1, 1.25, 1.5, 2],
    weights: [0.07, 0.15, 0.29, 0.22, 0.17, 0.1],
    modalRatios: [1, 1.498, 2.01, 2.67, 3.76, 5.11],
    motion: { panDrift: 0.72, pitchDrift: 0.04, orbit: 0.34, attractor: 0.86 },
    layers: { harmonic: 0.72, resonator: 0.92, transient: 0.72, noise: 0.34, fm: 0.28, sub: 0.16, air: 0.78 },
    eventRate: 0.7,
  },
  "tidal-memory": {
    label: "Tidal Memory",
    description: "Slow low-frequency tides, reverse-feeling swells, broad stereo migration, and long memory in the feedback field.",
    field: "suspended tidal fifths",
    params: { density: 0.34, grainSize: 0.52, spread: 0.58, tone: 0.38, tension: 0.28, texture: 0.38, width: 0.96, feedback: 0.7, evolution: 0.84, quantize: 0.8, lushness: 0.84, shape: 0.66 },
    ratios: [0.5, 0.75, 1, 1.125, 1.5, 2],
    weights: [0.12, 0.14, 0.3, 0.12, 0.21, 0.11],
    modalRatios: [0.5, 1, 1.5, 2.25, 3, 4.5],
    motion: { panDrift: 0.52, pitchDrift: 0.065, orbit: 0.5, attractor: 0.74 },
    layers: { harmonic: 0.78, resonator: 0.58, transient: 0.24, noise: 0.58, fm: 0.12, sub: 0.72, air: 0.5 },
    eventRate: 0.34,
  },
  "lichen-choir": {
    label: "Lichen Choir",
    description: "Organic clustered partials, formant-like resonances, subtle beating, and slow microtonal breathing.",
    field: "organic just cluster",
    params: { density: 0.5, grainSize: 0.36, spread: 0.4, tone: 0.6, tension: 0.2, texture: 0.46, width: 0.78, feedback: 0.6, evolution: 0.7, quantize: 0.9, lushness: 0.74, shape: 0.46 },
    ratios: [0.5, 0.6667, 0.8, 1, 1.2, 1.5, 2],
    weights: [0.08, 0.12, 0.13, 0.3, 0.13, 0.16, 0.08],
    modalRatios: [1, 1.2, 1.5, 2, 2.4, 3.2],
    motion: { panDrift: 0.38, pitchDrift: 0.045, orbit: 0.42, attractor: 0.68 },
    layers: { harmonic: 0.78, resonator: 0.86, transient: 0.28, noise: 0.3, fm: 0.34, sub: 0.3, air: 0.48 },
    eventRate: 0.4,
  },
  choral: {
    label: "Choral",
    description: "Consonant harmonic clusters and formant-weighted resonance that suggest voices without synthesising literal speech.",
    field: "consonant formant field",
    params: { density: 0.4, grainSize: 0.44, spread: 0.44, tone: 0.52, tension: 0.14, texture: 0.18, width: 0.88, feedback: 0.64, evolution: 0.48, quantize: 0.98, lushness: 0.94, shape: 0.52 },
    ratios: [0.5, 0.6667, 0.75, 1, 1.25, 1.3333, 1.5, 2],
    weights: [0.06, 0.09, 0.12, 0.28, 0.14, 0.11, 0.14, 0.06],
    modalRatios: [1, 1.25, 1.5, 2, 2.5, 3],
    motion: { panDrift: 0.34, pitchDrift: 0.028, orbit: 0.22, attractor: 0.62 },
    layers: { harmonic: 0.92, resonator: 0.8, transient: 0.16, noise: 0.16, fm: 0.18, sub: 0.28, air: 0.36 },
    eventRate: 0.24,
  },
  "deep-drone": {
    label: "Deep Drone",
    description: "Subharmonic weight and long resonances, interrupted by sparse high-frequency events so the low field keeps changing shape.",
    field: "subharmonic fifths",
    params: { density: 0.2, grainSize: 0.64, spread: 0.24, tone: 0.28, tension: 0.2, texture: 0.4, width: 0.66, feedback: 0.76, evolution: 0.34, quantize: 0.9, lushness: 0.9, shape: 0.58 },
    ratios: [0.25, 0.5, 0.75, 1, 1.5],
    weights: [0.14, 0.3, 0.05, 0.4, 0.11],
    modalRatios: [0.5, 1, 1.5, 2, 2.75, 4.25],
    motion: { panDrift: 0.14, pitchDrift: 0.018, orbit: 0.12, attractor: 0.42 },
    layers: { harmonic: 0.84, resonator: 0.52, transient: 0.2, noise: 0.22, fm: 0.12, sub: 0.94, air: 0.18 },
    eventRate: 0.22,
  },
  swarm: {
    label: "Anxious Swarm",
    description: "Short grains, unstable pitch clusters, FM colour, rapid spatial migration, and sharper event density on the experimental edge.",
    field: "unstable tritone cluster",
    params: { density: 0.9, grainSize: 0.14, spread: 0.96, tone: 0.58, tension: 0.86, texture: 0.8, width: 1, feedback: 0.5, evolution: 0.94, quantize: 0.4, lushness: 0.44, shape: 0.76 },
    ratios: [0.5, 0.7071, 0.75, 1, 1.0595, 1.4142, 1.5, 2],
    weights: [0.08, 0.15, 0.09, 0.2, 0.16, 0.13, 0.1, 0.09],
    modalRatios: [1, 1.4142, 1.498, 2.11, 2.828, 4.13],
    motion: { panDrift: 1, pitchDrift: 0.16, orbit: 1, attractor: 1 },
    layers: { harmonic: 0.42, resonator: 0.62, transient: 0.82, noise: 0.72, fm: 0.92, sub: 0.24, air: 0.58 },
    eventRate: 1,
  },
};

const lifecycleCopy = {
  DORMANT: "The garden is holding energy in long grains and low-density resonance before the next growth cycle.",
  GERMINATION: "New partials and resonant modes are entering slowly. Sparse events begin to seed fresh material into memory.",
  BLOOM: "The harmonic field opens, resonators become more active, and the stereo image expands into a fuller texture.",
  MIGRATION: "Pitch centres and grain trajectories are moving. The ecosystem keeps its identity while its centre of gravity shifts.",
  STORM: "Event probability, modulation, and experimental colour increase temporarily before the system releases energy again.",
  DECAY: "Density falls away while feedback memory and modal tails continue to expose what the previous state left behind.",
  REGENERATION: "Fresh excitation and harmonic material are rebuilding the circular memory for the next autonomous cycle.",
};

const weatherCopy = {
  clear: "Balanced feedback with restrained modulation and a clear stereo field.",
  mist: "Softer tone, wider diffusion, and slower modulation blur the edges of the grain field.",
  bloom: "Longer wet tails and deeper modulation let resonances spread outward without exceeding the feedback ceiling.",
  storm: "Faster read-head modulation and stronger wet energy push the delay network toward controlled turbulence.",
  void: "Dark, slow feedback holds energy for longer and leaves more empty space between audible events.",
};

const spectralCopy = {
  off: "The granular signal passes directly into the feedback network.",
  freeze: "A captured spectral magnitude field is held while current grain phase continues to move beneath it.",
  blur: "Spectral magnitudes accumulate slowly, smearing short events into a persistent tonal memory.",
  shimmer: "Energy is remapped upward before entering the feedback network, adding a restrained high spectral halo.",
};

let audioContext = null;
let workletNode = null;
let makeupGain = null;
let limiter = null;
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
let currentMode = "autonomous";
let macroX = 0.5;
let macroY = 0.5;
let sourcePCM = null;
let sourcePCMRate = 0;
let sourcePCMName = "";
let canvasWidth = 1200;
let canvasHeight = 520;
let attractorSendFrame = null;
let macroPointerActive = false;
let lastLifecycle = "DORMANT";

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
  if (parameter && audioContext) parameter.setTargetAtTime(clamped, audioContext.currentTime, timeConstant);
}

function applyControl(input) {
  setControlValue(input.id, Number(input.value), 0.05);
  currentBaseParams[input.id] = Number(input.value);
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

  const pointCount = Math.max(genomeA.ratios.length, genomeB.ratios.length);
  const ratios = [];
  const weights = [];
  for (let index = 0; index < pointCount; index += 1) {
    const normalizedIndex = pointCount === 1 ? 0 : index / (pointCount - 1);
    const ratio = lerp(
      sampleProfileArray(genomeA.ratios, normalizedIndex),
      sampleProfileArray(genomeB.ratios, normalizedIndex),
      blend,
    );
    const mutatedRatio = ratio * (2 ** (random.bipolar() * mutation * 0.08));
    ratios.push(clamp(mutatedRatio, 0.25, 2));
    weights.push(lerp(
      sampleProfileArray(genomeA.weights, normalizedIndex),
      sampleProfileArray(genomeB.weights, normalizedIndex),
      blend,
    ) * (1 + random.bipolar() * mutation * 0.35));
  }

  const modalRatios = [];
  const modalCount = Math.max(genomeA.modalRatios.length, genomeB.modalRatios.length);
  for (let index = 0; index < modalCount; index += 1) {
    const normalizedIndex = modalCount === 1 ? 0 : index / (modalCount - 1);
    const ratio = lerp(
      sampleProfileArray(genomeA.modalRatios, normalizedIndex),
      sampleProfileArray(genomeB.modalRatios, normalizedIndex),
      blend,
    );
    modalRatios.push(clamp(ratio * (2 ** (random.bipolar() * mutation * 0.035)), 0.25, 8));
  }

  const layers = {};
  for (const key of Object.keys(genomeA.layers)) {
    layers[key] = clamp(lerp(genomeA.layers[key], genomeB.layers[key], blend) + random.bipolar() * mutation * 0.08, 0, 1);
  }

  const motion = {};
  for (const key of Object.keys(genomeA.motion)) {
    motion[key] = clamp(lerp(genomeA.motion[key], genomeB.motion[key], blend) + random.bipolar() * mutation * 0.08, 0, 1.25);
  }

  return {
    label: blend < 0.02 ? genomeA.label : `${genomeA.label} × ${genomeB.label}`,
    field: blend < 0.35 ? genomeA.field : blend > 0.65 ? genomeB.field : `${genomeA.field} / ${genomeB.field}`,
    params,
    ratios,
    weights: normalizeWeights(weights),
    modalRatios,
    layers,
    motion,
    eventRate: lerp(genomeA.eventRate, genomeB.eventRate, blend),
  };
}

function applyGenome() {
  currentGenomeProfile = buildHybridProfile();
  currentBaseParams = { ...currentGenomeProfile.params };
  ecosystemLabel.textContent = currentGenomeProfile.label;
  inspectField.textContent = currentGenomeProfile.field;
  stageField.textContent = `field // ${currentGenomeProfile.field}`;
  for (const [id, value] of Object.entries(currentBaseParams)) setControlValue(id, value, 0.14);
  postGenomeProfile();
}

function postGenomeProfile() {
  if (!workletNode || !currentGenomeProfile) return;
  workletNode.port.postMessage({
    type: "genome-profile",
    ratios: currentGenomeProfile.ratios,
    weights: currentGenomeProfile.weights,
    modalRatios: currentGenomeProfile.modalRatios,
    motion: currentGenomeProfile.motion,
    layers: currentGenomeProfile.layers,
    eventRate: currentGenomeProfile.eventRate,
    field: currentGenomeProfile.field,
  });
}

function setPrimaryEcosystem(name) {
  const definition = genomeDefinitions[name] || genomeDefinitions["glass-rain"];
  genomeASelect.value = name;
  genomeBSelect.value = name;
  genomeBlendInput.value = "0";
  genomeBlendOutput.value = "0.00";
  ecosystemHelp.textContent = definition.description;
  applyGenome();
}

function applyMacro() {
  if (!currentBaseParams) return;
  const densityBias = (macroX - 0.5) * 0.42;
  const volatility = macroY;
  const modeScale = currentMode === "perform" ? 1 : 0.58;
  setControlValue("density", currentBaseParams.density + densityBias * modeScale, 0.16);
  setControlValue("spread", currentBaseParams.spread + (volatility - 0.5) * 0.24 * modeScale, 0.16);
  setControlValue("tension", currentBaseParams.tension + (volatility - 0.5) * 0.3 * modeScale, 0.16);
  setControlValue("evolution", currentBaseParams.evolution + (volatility - 0.5) * 0.24, 0.16);
  setControlValue("texture", currentBaseParams.texture + (volatility - 0.5) * 0.18 * modeScale, 0.16);
  macroCursor.style.left = `${macroX * 100}%`;
  macroCursor.style.top = `${(1 - macroY) * 100}%`;
  macroXOutput.textContent = macroX.toFixed(2);
  macroYOutput.textContent = macroY.toFixed(2);
  workletNode?.port.postMessage({ type: "macro", x: macroX, y: macroY });
}

function setMacroPosition(x, y) {
  macroX = clamp(x, 0, 1);
  macroY = clamp(y, 0, 1);
  applyMacro();
}

function setMode(mode) {
  currentMode = mode === "perform" ? "perform" : "autonomous";
  document.querySelectorAll(".mode-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === currentMode);
  });
  modeHelp.textContent = currentMode === "autonomous"
    ? "The garden moves through long-form states by itself. Your gestures still influence it without taking over."
    : "Autonomous lifecycle motion is reduced. The macro field, particle attractor, and advanced controls become the dominant influence.";
  workletNode?.port.postMessage({ type: "mode", value: currentMode });
  applyMacro();
}

function setCharacter(value) {
  const experimental = clamp(Number(value) / 100, 0, 1);
  characterOutput.textContent = `${Math.round((1 - experimental) * 100)}% ambient`;
  workletNode?.port.postMessage({ type: "character", value: experimental });
}

function setMasterVolume(value, timeConstant = 0.05) {
  const normalized = clamp(Number(value) / 100, 0, 1);
  masterVolumeOutput.textContent = `${Math.round(normalized * 100)}%`;
  if (master && audioContext) master.gain.setTargetAtTime(normalized, audioContext.currentTime, timeConstant);
}

function primeStateBuffers() {
  for (let index = 0; index < STATE_BUFFER_COUNT; index += 1) {
    const state = new Float32Array(GRAIN_STATE_LENGTH);
    workletNode.port.postMessage({ type: "grain-state-buffer", state }, [state.buffer]);
  }
}

function updateLayerBank(layers = {}) {
  const activeNames = [];
  layerBank.querySelectorAll(".word-chip").forEach((chip) => {
    const amount = Number(layers[chip.dataset.layer] || 0);
    const active = amount >= 0.22;
    chip.classList.toggle("active", active);
    chip.style.opacity = String(clamp(0.32 + amount * 0.68, 0.32, 1));
    if (active) activeNames.push(chip.textContent.trim());
  });
  inspectLayers.textContent = activeNames.length ? activeNames.join(" + ") : "minimal field";
}

function updateLifecycle(message) {
  const name = String(message.lifecycle || "DORMANT").toUpperCase();
  lastLifecycle = name;
  lifecycleLabel.textContent = name;
  lifecycleExplanation.textContent = lifecycleCopy[name] || "The autonomous engine is evolving the current ecosystem.";
  stageState.textContent = name;
  inspectLifecycle.textContent = name.toLowerCase();
  if (message.field) {
    stageField.textContent = `field // ${message.field}`;
    inspectField.textContent = message.field;
  }
  if (message.motion) stageMotion.textContent = `motion // ${message.motion}`;
  updateLayerBank(message.layers || {});
}

function handleWorkletMessage(event) {
  const message = event.data;
  if (message?.type === "grain-state" && message.state instanceof Float32Array) {
    const previousState = grainState;
    grainState = message.state;
    if (previousState && previousState.buffer.byteLength > 0 && workletNode) {
      workletNode.port.postMessage({ type: "grain-state-buffer", state: previousState }, [previousState.buffer]);
    }
    return;
  }

  if (message?.type === "lifecycle") {
    updateLifecycle(message);
    return;
  }

  if (message?.type !== "meter") return;
  rmsMeter.textContent = db(message.rms);
  peakMeter.textContent = db(message.peak);
  grainMeter.textContent = String(message.grains);
  voiceMeter.textContent = String(message.voiceLimit);
  loadMeter.textContent = `${Math.round(clamp(message.renderLoad, 0, 1.5) * 100)}%`;
  inspectOverruns.textContent = String(message.overBudgetCount);
  inspectQuality.textContent = `${adaptiveQualityInput.checked ? "adaptive" : "fixed"} // ${message.voiceLimit} voices // ${message.loadMode}`;
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
  for (const ratio of currentGenomeProfile.ratios) {
    const y = ratioToY(ratio);
    context2d.strokeStyle = "rgba(245,166,35,0.05)";
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
  context2d.fillStyle = "rgba(10,10,15,0.16)";
  context2d.fillRect(0, 0, canvasWidth, canvasHeight);
  drawPitchField();

  context2d.strokeStyle = "rgba(255,255,255,.032)";
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

function sendAttractor() {
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
  attractorSendFrame = requestAnimationFrame(() => {
    attractorSendFrame = null;
    sendAttractor();
  });
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
    workletNode = new AudioWorkletNode(audioContext, "signal-garden-v2", {
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    workletNode.port.onmessage = handleWorkletMessage;

    makeupGain = new GainNode(audioContext, { gain: 1.75 });
    limiter = new DynamicsCompressorNode(audioContext, {
      threshold: -7,
      knee: 0,
      ratio: 20,
      attack: 0.003,
      release: 0.24,
    });
    master = new GainNode(audioContext, { gain: Number(masterVolumeInput.value) / 100 });
    recordingDestination = audioContext.createMediaStreamDestination();

    workletNode.connect(makeupGain).connect(limiter).connect(master);
    master.connect(audioContext.destination);
    master.connect(recordingDestination);

    syncControlsToWorklet();
    primeStateBuffers();
    workletNode.port.postMessage({ type: "seed", value: Number(seedInput.value) || 311 });
    workletNode.port.postMessage({ type: "adaptive-quality", value: adaptiveQualityInput.checked });
    workletNode.port.postMessage({ type: "weather", value: currentWeather });
    workletNode.port.postMessage({ type: "spectral-mode", value: currentSpectralMode });
    workletNode.port.postMessage({ type: "mode", value: currentMode });
    workletNode.port.postMessage({ type: "character", value: Number(characterInput.value) / 100 });
    postGenomeProfile();
    postSourceBuffer();
    sendAttractor();
    applyMacro();

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
    if (audioContext) await audioContext.close().catch(() => {});
    audioContext = null;
    workletNode = null;
    makeupGain = null;
    limiter = null;
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
  mediaRecorder = new MediaRecorder(recordingDestination.stream, mimeType ? { mimeType } : undefined);
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
  makeupGain = null;
  limiter = null;
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
      for (let index = 0; index < maximumFrames; index += 1) mono[index] += data[index] * scale;
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

function postSourceBuffer() {
  if (!workletNode || !sourcePCM) return;
  const samples = sourcePCM.slice();
  workletNode.port.postMessage({
    type: "source-buffer",
    samples,
    sampleRate: sourcePCMRate,
    name: sourcePCMName,
  }, [samples.buffer]);
}

function restoreProceduralSource() {
  sourcePCM = null;
  sourcePCMRate = 0;
  sourcePCMName = "";
  sourceLabel.textContent = "Procedural source";
  restoreProceduralButton.disabled = true;
  inspectSource.textContent = "procedural circular memory";
  workletNode?.port.postMessage({ type: "source-procedural" });
}

function randomizeEcosystem() {
  const keys = Object.keys(genomeDefinitions);
  const values = new Uint32Array(3);
  crypto.getRandomValues(values);
  genomeASelect.value = keys[values[0] % keys.length];
  genomeBSelect.value = keys[values[1] % keys.length];
  genomeBlendInput.value = (0.18 + ((values[2] % 6500) / 10000)).toFixed(2);
  mutationInput.value = (0.08 + (((values[0] >>> 8) % 5000) / 10000)).toFixed(2);
  seedInput.value = String(values[1] || 311);
  genomeBlendOutput.value = Number(genomeBlendInput.value).toFixed(2);
  mutationOutput.value = Number(mutationInput.value).toFixed(2);
  applyGenome();
  workletNode?.port.postMessage({ type: "seed", value: Number(seedInput.value) || 311 });
}

function setWeather(name) {
  currentWeather = weatherCopy[name] ? name : "clear";
  document.querySelectorAll("[data-weather]").forEach((button) => button.classList.toggle("active", button.dataset.weather === currentWeather));
  document.querySelector("#weather-help").textContent = weatherCopy[currentWeather];
  inspectFeedback.textContent = currentWeather;
  workletNode?.port.postMessage({ type: "weather", value: currentWeather });
}

function setSpectralMode(name) {
  currentSpectralMode = spectralCopy[name] ? name : "off";
  document.querySelectorAll("[data-spectral]").forEach((button) => button.classList.toggle("active", button.dataset.spectral === currentSpectralMode));
  document.querySelector("#spectral-help").textContent = spectralCopy[currentSpectralMode];
  inspectSpectral.textContent = currentSpectralMode;
  workletNode?.port.postMessage({ type: "spectral-mode", value: currentSpectralMode });
}

function stateToQuery() {
  const params = new URLSearchParams();
  params.set("g", ecosystemSelect.value);
  params.set("a", genomeASelect.value);
  params.set("b", genomeBSelect.value);
  params.set("blend", Number(genomeBlendInput.value).toFixed(2));
  params.set("mutation", Number(mutationInput.value).toFixed(2));
  params.set("seed", String(Number(seedInput.value) || 311));
  params.set("character", String(Number(characterInput.value)));
  params.set("mode", currentMode);
  params.set("weather", currentWeather);
  params.set("spectral", currentSpectralMode);
  params.set("mx", macroX.toFixed(2));
  params.set("my", macroY.toFixed(2));
  return params;
}

async function copyShareLink() {
  const url = `${window.location.origin}${window.location.pathname}?${stateToQuery().toString()}`;
  try {
    await navigator.clipboard.writeText(url);
    shareStatus.textContent = "State link copied.";
  } catch {
    shareStatus.textContent = url;
  }
}

function restoreStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const primary = params.get("g");
  if (primary && genomeDefinitions[primary]) ecosystemSelect.value = primary;
  const a = params.get("a");
  const b = params.get("b");
  if (a && genomeDefinitions[a]) genomeASelect.value = a;
  if (b && genomeDefinitions[b]) genomeBSelect.value = b;
  if (params.has("blend")) genomeBlendInput.value = String(clamp(Number(params.get("blend")), 0, 1));
  if (params.has("mutation")) mutationInput.value = String(clamp(Number(params.get("mutation")), 0, 0.7));
  if (params.has("seed")) seedInput.value = String(Math.max(1, Number(params.get("seed")) || 311));
  if (params.has("character")) characterInput.value = String(clamp(Number(params.get("character")), 0, 100));
  setMode(params.get("mode") || "autonomous");
  setWeather(params.get("weather") || "clear");
  setSpectralMode(params.get("spectral") || "off");
  macroX = clamp(Number(params.get("mx")) || 0.5, 0, 1);
  macroY = clamp(Number(params.get("my")) || 0.5, 0, 1);
  genomeBlendOutput.value = Number(genomeBlendInput.value).toFixed(2);
  mutationOutput.value = Number(mutationInput.value).toFixed(2);
  setCharacter(characterInput.value);
}

function populateGenomeSelects() {
  for (const [key, definition] of Object.entries(genomeDefinitions)) {
    genomeASelect.add(new Option(definition.label, key));
    genomeBSelect.add(new Option(definition.label, key));
  }
  genomeASelect.value = "glass-rain";
  genomeBSelect.value = "glass-rain";
}

startButton.addEventListener("click", startAudio);
stopButton.addEventListener("click", stopAudio);
recordButton.addEventListener("click", startRecording);
stopRecordingButton.addEventListener("click", stopRecording);
masterVolumeInput.addEventListener("input", () => setMasterVolume(masterVolumeInput.value));
characterInput.addEventListener("input", () => setCharacter(characterInput.value));
ecosystemSelect.addEventListener("change", () => setPrimaryEcosystem(ecosystemSelect.value));
document.querySelectorAll(".mode-btn").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
genomeBlendInput.addEventListener("input", () => { genomeBlendOutput.value = Number(genomeBlendInput.value).toFixed(2); });
mutationInput.addEventListener("input", () => { mutationOutput.value = Number(mutationInput.value).toFixed(2); });
document.querySelector("#apply-genome").addEventListener("click", applyGenome);
document.querySelector("#randomize-ecosystem").addEventListener("click", randomizeEcosystem);
document.querySelector("#apply-seed").addEventListener("click", () => {
  workletNode?.port.postMessage({ type: "seed", value: Number(seedInput.value) || 311 });
  applyGenome();
});
document.querySelector("#random-seed").addEventListener("click", () => {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  seedInput.value = String(values[0] || 311);
  workletNode?.port.postMessage({ type: "seed", value: Number(seedInput.value) || 311 });
  applyGenome();
});
document.querySelector("#copy-share-link").addEventListener("click", copyShareLink);
document.querySelectorAll("[data-weather]").forEach((button) => button.addEventListener("click", () => setWeather(button.dataset.weather)));
document.querySelectorAll("[data-spectral]").forEach((button) => button.addEventListener("click", () => setSpectralMode(button.dataset.spectral)));
adaptiveQualityInput.addEventListener("change", () => workletNode?.port.postMessage({ type: "adaptive-quality", value: adaptiveQualityInput.checked }));
restoreProceduralButton.addEventListener("click", restoreProceduralSource);
audioFileInput.addEventListener("change", () => decodeAudioFile(audioFileInput.files?.[0]));
dropZone.addEventListener("dragover", (event) => { event.preventDefault(); dropZone.classList.add("dragging"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  decodeAudioFile(event.dataTransfer?.files?.[0]);
});

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  updateAttractorFromPointer(event);
});
canvas.addEventListener("pointermove", (event) => {
  if (canvas.hasPointerCapture(event.pointerId)) updateAttractorFromPointer(event);
});
canvas.addEventListener("pointerup", (event) => {
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  releaseAttractor();
});
canvas.addEventListener("pointercancel", releaseAttractor);

macroPad.addEventListener("pointerdown", (event) => {
  macroPointerActive = true;
  macroPad.setPointerCapture(event.pointerId);
  updateMacroFromPointer(event);
});
macroPad.addEventListener("pointermove", (event) => {
  if (macroPointerActive) updateMacroFromPointer(event);
});
macroPad.addEventListener("pointerup", (event) => {
  macroPointerActive = false;
  if (macroPad.hasPointerCapture(event.pointerId)) macroPad.releasePointerCapture(event.pointerId);
});
macroPad.addEventListener("pointercancel", () => { macroPointerActive = false; });
window.addEventListener("resize", resizeCanvas);

populateGenomeSelects();
restoreStateFromUrl();
bindControls();
const initialQuery = new URLSearchParams(window.location.search);
if (initialQuery.has("a") || initialQuery.has("b") || initialQuery.has("blend")) {
  ecosystemHelp.textContent = genomeDefinitions[ecosystemSelect.value].description;
  applyGenome();
} else {
  setPrimaryEcosystem(ecosystemSelect.value);
}
setMode(currentMode);
setCharacter(characterInput.value);
setMasterVolume(masterVolumeInput.value);
setWeather(currentWeather);
setSpectralMode(currentSpectralMode);
setMacroPosition(macroX, macroY);
updateLifecycle({ lifecycle: lastLifecycle, field: genomeDefinitions[ecosystemSelect.value].field, motion: "drifting", layers: genomeDefinitions[ecosystemSelect.value].layers });
