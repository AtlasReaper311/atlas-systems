import {
  applyDemoProfileToServices,
  computeFrame,
  deriveDemoEstate,
} from "../../static/js/sonify/mapping.js?v=20260720-system-symphony-loop-production-v2";
import { createPoller } from "../../static/js/sonify/poller.js?v=20260720-system-symphony-loop-production-v2";
import {
  channelSummary,
  chipIdentityForVoice,
  sceneForFrame,
} from "../../static/js/sonify/apu-palette.js?v=20260725-system-symphony-atlas-apu-preview-v1";
import {
  ATLAS_APU_TRACK_BUILD_ID,
  arrangementTimeline,
} from "../../static/js/sonify/apu-arranger.js?v=20260726-system-symphony-state-identities-v2";
import { createApuTrackEngine } from "../../static/js/sonify/apu-track-engine-v2.js?v=20260726-system-symphony-atlas-apu-track-v2";
import {
  APU_HYBRID_STATE_BUILD_ID,
  APU_HYBRID_STATE_KEYS,
  buildHybridFrame,
} from "../../static/js/sonify/apu-hybrid-state.js?v=20260726-system-symphony-evidence-hybrid-v1";

const root = document.querySelector("[data-apu-root]");
if (!root) throw new Error("system-symphony-apu: page root is missing");

const statusNode = root.querySelector("[data-status]");
const audioButton = root.querySelector("[data-audio-toggle]");
const volumeInput = root.querySelector("[data-volume]");
const serviceTable = root.querySelector("[data-service-table]");
const formTimeline = root.querySelector("[data-form-timeline]");
const waveformCanvas = root.querySelector("[data-waveform]");
const spectrumCanvas = root.querySelector("[data-spectrum]");
const waveformContext = waveformCanvas.getContext("2d");
const spectrumContext = spectrumCanvas.getContext("2d");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const previewBanner = root.querySelector("[data-preview-fixture-banner]");
const dominantReason = root.querySelector("[data-dominant-reason]");

let latestFrame = null;
let latestMerged = null;
let currentFrame = null;
let currentArrangement = null;
let mode = "live";
let animationFrame = null;
let lastDrawAt = 0;
let lastVoiceTimer = null;

function setMetric(name, value) {
  const node = root.querySelector(`[data-metric="${name}"]`);
  if (node) node.textContent = String(value ?? "unknown");
}

function setStatus(message, source = root.dataset.source ?? "connecting") {
  root.dataset.source = source;
  statusNode.textContent = message;
}

function formatStatus(status) {
  if (status === "healthy") return "Healthy";
  if (status === "degraded") return "Warning";
  if (status === "down") return "Critical";
  return "Unknown";
}

function sourceLabel(frame) {
  if (mode !== "live") return "simulated";
  if (frame?.evidenceMode === "preview" || window.__ATLAS_SYMPHONY_PREVIEW_DATA__) return "preview";
  if (frame?.stale) return "stale";
  return "live";
}

function sourceMessage(frame) {
  if (mode !== "live") {
    return `Browser-only ${mode} audition. The profile is simulated, no estate state is changed, and the live frame remains available.`;
  }
  if (frame?.evidenceMode === "preview" || window.__ATLAS_SYMPHONY_PREVIEW_DATA__) {
    return "A bounded preview fixture is driving the soundtrack. It demonstrates the scoring contract and does not claim to be the current live estate.";
  }
  if (frame?.stale) {
    return "Live telemetry is stale. Unknown now overrides the score while the last successful evidence remains inspectable.";
  }
  return "Live read-only estate evidence is driving the hybrid soundtrack.";
}

function clearNode(node) {
  while (node?.firstChild) node.removeChild(node.firstChild);
}

function makeCell(row, value) {
  const cell = document.createElement("td");
  cell.textContent = String(value ?? "unknown");
  row.append(cell);
  return cell;
}

function evidenceSourceText(voice) {
  if (voice.evidenceState === "simulated") return "browser-only profile";
  if (voice.evidence_source) return voice.evidence_source;
  if (voice.evidenceState === "topology-only") return "topology contract";
  if (voice.evidenceState === "reported-unknown") return "no current measurement";
  return voice.evidenceMode ?? "unknown source";
}

function renderServiceTable(frame) {
  clearNode(serviceTable);
  const voices = Array.isArray(frame?.voices) ? frame.voices : [];
  if (!voices.length) {
    const row = document.createElement("tr");
    const cell = makeCell(row, "No service voices in this frame.");
    cell.colSpan = 6;
    serviceTable.append(row);
    return;
  }

  for (const voice of voices) {
    const identity = chipIdentityForVoice(voice);
    const row = document.createElement("tr");
    row.dataset.service = voice.name;
    row.dataset.evidenceState = voice.evidenceState ?? "unknown";

    const nameCell = document.createElement("td");
    const name = document.createElement("strong");
    name.textContent = voice.displayName ?? voice.name;
    nameCell.append(name);
    row.append(nameCell);

    makeCell(row, voice.layer);
    const statusCell = document.createElement("td");
    const status = document.createElement("span");
    status.className = "apu-status-pill";
    status.dataset.status = voice.status;
    status.textContent = formatStatus(voice.status);
    statusCell.append(status);
    row.append(statusCell);

    makeCell(row, `${identity.channel} / ${identity.label}`);
    makeCell(row, voice.registerLabel ?? `${Math.round(voice.registerMidi ?? 0)} MIDI`);

    const evidenceCell = document.createElement("td");
    const evidenceLabel = document.createElement("strong");
    evidenceLabel.className = "apu-evidence-label";
    evidenceLabel.textContent = voice.evidenceLabel ?? "Unknown evidence";
    const evidenceSource = document.createElement("small");
    evidenceSource.textContent = evidenceSourceText(voice);
    evidenceCell.append(evidenceLabel, evidenceSource);
    row.append(evidenceCell);
    serviceTable.append(row);
  }
}

function renderChannelCounts(frame) {
  for (const [channel, count] of Object.entries(channelSummary(frame))) {
    const node = root.querySelector(`[data-channel-count="${channel}"]`);
    if (node) node.textContent = `${count} ${count === 1 ? "service" : "services"}`;
  }
}

function renderStateVector(frame) {
  const weights = frame?.stateVector ?? {};
  for (const state of APU_HYBRID_STATE_KEYS) {
    const weight = Math.max(0, Math.min(1, Number(weights[state]) || 0));
    const node = root.querySelector(`[data-state-vector="${state}"]`);
    if (!node) continue;
    node.style.setProperty("--state-weight", `${(weight * 100).toFixed(1)}%`);
    const value = node.querySelector("[data-state-vector-value]");
    if (value) value.textContent = `${Math.round(weight * 100)}%`;
    node.dataset.dominant = String(frame?.scoreState === state);
  }
  if (dominantReason) dominantReason.textContent = frame?.dominantStateReason ?? "Waiting for the first evidence frame.";
}

function renderEvidenceBoundary(frame) {
  if (!previewBanner) return;
  const preview = frame?.evidenceMode === "preview";
  const simulated = frame?.evidenceMode === "demo";
  previewBanner.hidden = !(preview || simulated);
  previewBanner.dataset.mode = simulated ? "demo" : "preview";
  const heading = previewBanner.querySelector("strong");
  const text = previewBanner.querySelector("span");
  if (simulated) {
    if (heading) heading.textContent = "Simulated audition profile";
    if (text) text.textContent = "Every service row has been transformed in the browser for listening comparison. No estate state or provider data is changed.";
  } else if (preview) {
    if (heading) heading.textContent = "Preview fixture, not live estate data";
    if (text) text.textContent = "This numbered Pages deployment uses a bounded 21-service fixture. Production uses the read-only public telemetry and topology endpoints.";
  }
}

function buildFormTimeline() {
  clearNode(formTimeline);
  for (const section of arrangementTimeline()) {
    const item = document.createElement("li");
    item.className = "apu-form-section";
    item.dataset.formSection = section.id;
    item.style.setProperty("--section-bars", String(section.endBar - section.startBar + 1));

    const label = document.createElement("strong");
    label.textContent = section.label;
    const bars = document.createElement("span");
    bars.textContent = `${section.startBar}-${section.endBar}`;
    item.append(label, bars);
    formTimeline.append(item);
  }
}

function renderArrangement(arrangement, scene = null) {
  if (!arrangement) return;
  currentArrangement = arrangement;
  root.dataset.section = arrangement.section;
  setMetric("section", arrangement.sectionLabel);
  setMetric("position", `Bars ${arrangement.cycleBarStart}-${arrangement.cycleBarEnd} / 32`);
  setMetric("phase", arrangement.directorPhase);
  setMetric("bpm", `${Math.round(arrangement.targetBpm ?? scene?.bpm ?? 100)} BPM`);
  for (const item of root.querySelectorAll("[data-form-section]")) {
    const active = item.dataset.formSection === arrangement.section;
    item.dataset.active = String(active);
    if (active) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  }
}

function renderFrame(frame) {
  currentFrame = frame;
  const scene = engine.getScene() ?? sceneForFrame(frame);
  const arrangement = engine.getArrangement();
  root.dataset.state = frame.scoreState ?? "unknown";
  root.dataset.build = ATLAS_APU_TRACK_BUILD_ID;
  root.dataset.hybridBuild = APU_HYBRID_STATE_BUILD_ID;
  root.dataset.ready = "true";
  document.documentElement.dataset.atlasApuBuild = ATLAS_APU_TRACK_BUILD_ID;
  document.documentElement.dataset.atlasApuHybridBuild = APU_HYBRID_STATE_BUILD_ID;

  setMetric("state", frame.scoreLabel ?? formatStatus(frame.scoreState));
  setMetric("scene", scene.label);
  setMetric("components", frame.totalComponents ?? frame.voices?.length ?? 0);
  setMetric("measured", frame.measuredComponents ?? 0);
  setMetric("known", `${Math.round((frame.knownServiceRatio ?? 0) * 100)}%`);
  setMetric("warnings", frame.warningCount ?? 0);
  setMetric("failures", `${frame.failureCount ?? 0} / ${frame.activeIncidents ?? 0}`);
  if (arrangement) renderArrangement(arrangement, scene);
  renderStateVector(frame);
  renderEvidenceBoundary(frame);
  renderChannelCounts(frame);
  renderServiceTable(frame);
  setStatus(sourceMessage(frame), sourceLabel(frame));
}

function simulatedFrame(profileName) {
  if (!latestMerged?.services?.length) return null;
  const services = applyDemoProfileToServices(latestMerged.services, profileName);
  const merged = {
    ...latestMerged,
    stale: false,
    services,
    estate: {
      ...latestMerged.estate,
      ...deriveDemoEstate(services),
    },
  };
  return buildHybridFrame(computeFrame(merged), merged);
}

function setMode(nextMode) {
  mode = nextMode;
  for (const button of root.querySelectorAll("[data-mode]")) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  }
  const frame = mode === "live" ? latestFrame : simulatedFrame(mode);
  if (!frame) {
    setStatus("The first evidence frame has not arrived yet.", "connecting");
    return;
  }
  engine.applyFrame(frame);
  renderFrame(frame);
}

function markVoice(event) {
  if (lastVoiceTimer !== null) window.clearTimeout(lastVoiceTimer);
  for (const node of root.querySelectorAll("[data-channel][data-active], [data-service][data-active]")) {
    delete node.dataset.active;
  }
  const channel = root.querySelector(`[data-channel="${event.channel}"]`);
  const service = root.querySelector(`[data-service="${CSS.escape(event.name)}"]`);
  if (channel) channel.dataset.active = "true";
  if (service) service.dataset.active = "true";
  lastVoiceTimer = window.setTimeout(() => {
    if (channel) delete channel.dataset.active;
    if (service) delete service.dataset.active;
    lastVoiceTimer = null;
  }, reducedMotion.matches ? 40 : 180);
}

const engine = createApuTrackEngine({
  onArrangement: ({ arrangement, scene }) => {
    renderArrangement(arrangement, scene);
    setMetric("scene", scene.label);
  },
  onVoice: markVoice,
  onRunningChange: (running) => {
    root.dataset.running = String(running);
    audioButton.textContent = running ? "Pause audio" : "Start audio";
    root.querySelector("[data-waveform-label]").textContent = running ? "running" : "silent";
  },
  onError: (error) => {
    console.error("system-symphony-apu-track: audio engine failed", error);
    setStatus(`Audio engine error: ${error.message}`, "stale");
  },
});

const poller = createPoller({
  onFrame(frame, info) {
    latestMerged = info.merged;
    latestFrame = buildHybridFrame(frame, latestMerged);
    if (mode !== "live") return;
    engine.applyFrame(latestFrame);
    renderFrame(latestFrame);
    if (info.newIncidents > 0) engine.queueIncident(info.newIncidents);
  },
  onStatus(status) {
    if (mode === "live" && status.stale) setStatus(sourceMessage({ stale: true }), "stale");
  },
  onDeployment(deployment) {
    engine.queueDeployment(deployment);
  },
});

async function toggleAudio() {
  audioButton.disabled = true;
  try {
    if (engine.isRunning()) engine.pause();
    else {
      await engine.start();
      if (currentFrame) renderFrame(currentFrame);
    }
  } catch (error) {
    setStatus(`Audio could not start: ${error.message}`, "stale");
  } finally {
    audioButton.disabled = false;
  }
}

function drawWaveform(values) {
  const width = waveformCanvas.width;
  const height = waveformCanvas.height;
  waveformContext.clearRect(0, 0, width, height);
  waveformContext.fillStyle = "#08080d";
  waveformContext.fillRect(0, 0, width, height);
  waveformContext.strokeStyle = "rgba(245,166,35,0.18)";
  waveformContext.beginPath();
  waveformContext.moveTo(0, height / 2);
  waveformContext.lineTo(width, height / 2);
  waveformContext.stroke();
  waveformContext.strokeStyle = "#f5a623";
  waveformContext.lineWidth = 2;
  waveformContext.beginPath();
  const count = Math.max(1, values.length - 1);
  values.forEach((value, index) => {
    const x = index / count * width;
    const y = height / 2 + Number(value || 0) * height * 0.42;
    if (index === 0) waveformContext.moveTo(x, y);
    else waveformContext.lineTo(x, y);
  });
  waveformContext.stroke();
}

function drawSpectrum(values) {
  const width = spectrumCanvas.width;
  const height = spectrumCanvas.height;
  spectrumContext.clearRect(0, 0, width, height);
  spectrumContext.fillStyle = "#08080d";
  spectrumContext.fillRect(0, 0, width, height);
  const visible = Array.from(values).slice(0, 32);
  const gap = 4;
  const barWidth = Math.max(2, width / Math.max(1, visible.length) - gap);
  visible.forEach((value, index) => {
    const normalized = Math.max(0, Math.min(1, (Number(value) + 100) / 100));
    const barHeight = Math.max(2, normalized * height * 0.9);
    spectrumContext.fillStyle = index % 4 === 0 ? "#f5a623" : "rgba(232,232,224,0.58)";
    spectrumContext.fillRect(index * (barWidth + gap), height - barHeight, barWidth, barHeight);
  });
}

function animate(at) {
  const interval = reducedMotion.matches ? 240 : 50;
  if (at - lastDrawAt >= interval) {
    drawWaveform(engine.getWaveform());
    drawSpectrum(engine.getSpectrum());
    lastDrawAt = at;
  }
  animationFrame = window.requestAnimationFrame(animate);
}

audioButton.addEventListener("click", toggleAudio);
volumeInput.addEventListener("input", () => engine.setVolume(Number(volumeInput.value) / 100));
for (const button of root.querySelectorAll("[data-mode]")) {
  button.addEventListener("click", () => setMode(button.dataset.mode));
}

window.addEventListener("pagehide", () => {
  poller.stop();
  engine.dispose();
  if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
  if (lastVoiceTimer !== null) window.clearTimeout(lastVoiceTimer);
}, { once: true });

root.dataset.apuNoSamples = "true";
window.__ATLAS_APU__ = Object.freeze({
  buildId: ATLAS_APU_TRACK_BUILD_ID,
  hybridBuildId: APU_HYBRID_STATE_BUILD_ID,
  getFrame: () => currentFrame,
  getScene: () => engine.getScene(),
  getArrangement: () => currentArrangement ?? engine.getArrangement(),
  getTimeline: () => arrangementTimeline(),
  getStateVector: () => currentFrame?.stateVector ?? null,
  getDominantReason: () => currentFrame?.dominantStateReason ?? null,
  getDiagnostics: () => engine.getDiagnostics(),
  isRunning: () => engine.isRunning(),
});

buildFormTimeline();
poller.start();
animationFrame = window.requestAnimationFrame(animate);
