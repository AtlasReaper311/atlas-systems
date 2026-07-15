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

let audioContext = null;
let workletNode = null;
let analyser = null;
let master = null;
let animationFrame = null;
let timeData = null;
let frequencyData = null;

function db(value) {
  return value > 0 ? `${(20 * Math.log10(value)).toFixed(1)} dBFS` : "-∞ dBFS";
}

function setStatus(label, state = "") {
  status.textContent = label;
  status.dataset.state = state;
}

function draw() {
  if (!analyser) return;
  analyser.getFloatTimeDomainData(timeData);
  analyser.getByteFrequencyData(frequencyData);
  const width = canvas.width;
  const height = canvas.height;
  context2d.clearRect(0, 0, width, height);
  context2d.fillStyle = "#0a0a0f";
  context2d.fillRect(0, 0, width, height);

  context2d.strokeStyle = "rgba(255,255,255,.08)";
  context2d.lineWidth = 1;
  for (let line = 1; line < 4; line += 1) {
    const y = height * line / 4;
    context2d.beginPath();
    context2d.moveTo(0, y);
    context2d.lineTo(width, y);
    context2d.stroke();
  }

  context2d.strokeStyle = "#f5a623";
  context2d.lineWidth = 1.5;
  context2d.beginPath();
  timeData.forEach((value, index) => {
    const x = index / (timeData.length - 1) * width;
    const y = height * 0.34 + value * height * 0.2;
    if (index === 0) context2d.moveTo(x, y);
    else context2d.lineTo(x, y);
  });
  context2d.stroke();

  context2d.fillStyle = "rgba(245,166,35,.35)";
  const bins = Math.min(180, frequencyData.length);
  for (let index = 0; index < bins; index += 1) {
    const magnitude = frequencyData[index] / 255;
    const barWidth = width / bins;
    const barHeight = magnitude * height * 0.34;
    context2d.fillRect(index * barWidth, height - barHeight, Math.max(1, barWidth - 1), barHeight);
  }
  animationFrame = requestAnimationFrame(draw);
}

function bindControls() {
  document.querySelectorAll("#controls input[type=range]").forEach((input) => {
    const output = document.querySelector(`output[for="${input.id}"]`);
    const update = () => {
      const value = Number(input.value);
      output.value = input.id === "grainSize" ? `${value.toFixed(2)} s` : value.toFixed(2);
      const parameter = workletNode?.parameters.get(input.id);
      if (parameter && audioContext) parameter.setTargetAtTime(value, audioContext.currentTime, 0.05);
    };
    input.addEventListener("input", update);
    update();
  });
}

async function startAudio() {
  if (!("AudioWorkletNode" in window)) {
    setStatus("AudioWorklet unsupported", "error");
    return;
  }
  startButton.disabled = true;
  setStatus("starting");
  try {
    audioContext = new AudioContext({ latencyHint: "interactive" });
    await audioContext.audioWorklet.addModule("/lab/signal/worklets/signal-garden-processor.js");
    workletNode = new AudioWorkletNode(audioContext, "signal-garden", {
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    analyser = new AnalyserNode(audioContext, { fftSize: 2048, smoothingTimeConstant: 0.75 });
    master = new GainNode(audioContext, { gain: 0.32 });
    workletNode.connect(analyser).connect(master).connect(audioContext.destination);
    timeData = new Float32Array(analyser.fftSize);
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    workletNode.port.onmessage = (event) => {
      if (event.data?.type !== "meter") return;
      rmsMeter.textContent = db(event.data.rms);
      peakMeter.textContent = db(event.data.peak);
      grainMeter.textContent = String(event.data.grains);
    };
    bindControls();
    workletNode.port.postMessage({ type: "seed", value: Number(seedInput.value) });
    await audioContext.resume();
    sampleRate.textContent = `${audioContext.sampleRate.toLocaleString()} Hz`;
    stopButton.disabled = false;
    setStatus("running", "normal");
    draw();
  } catch (error) {
    console.error(error);
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
  analyser = null;
  master = null;
  rmsMeter.textContent = "-∞ dBFS";
  peakMeter.textContent = "-∞ dBFS";
  grainMeter.textContent = "0";
  sampleRate.textContent = "not started";
  startButton.disabled = false;
  setStatus("idle");
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
bindControls();
