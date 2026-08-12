"use strict";

import {
  BUILT_IN_PRESETS,
  POLARITIES,
  RUN_DURATION_SECONDS,
  SCENARIOS,
  SCENARIO_BY_ID,
  SIGNALS,
  SIGNAL_BY_ID,
  SMOOTHING_TYPES,
  TARGETS,
  TARGET_BY_ID,
  TRANSFORM_TYPES,
  calculateMapping,
  createFrame,
  formatTime,
  formatValue,
} from "./domain.js";
import {
  MASTER_DEFAULT,
  MASTER_MAX,
  MASTER_MIN,
  SpectralForgeAudioEngine,
  createAudioContext,
  linearToDb,
} from "./audio-engine.js";
import {
  STORAGE_KEY,
  activeMappings,
  applyPresetToCandidate,
  audibleOutputs,
  captureBaseline,
  copyBaselineToCandidate,
  createCandidateRoute,
  createComparisonState,
  createUserPreset,
  parsePreferences,
  removeCandidateRoute,
  selectedMapping,
  serialisePreferences,
  setActiveVariant,
  setAuditionMode,
  updateCandidateMapping,
} from "./state.js";
import { AudioAnalyserRenderer, SpectralFieldRenderer, TimelineRenderer } from "./visuals.js";

const HARMONIC_STATES = Object.freeze({
  STABLE: "CRYSTALLINE / OPEN FIFTH",
  PRESSURED: "COMPRESSED / TENSE FOURTH",
  DEGRADED: "ASYMMETRIC / NARROW SIXTH",
  FAILED: "FRACTURED / MINOR TENSION",
  RECOVERING: "COHERENCE RETURNING",
});

const TARGET_EXPLANATIONS = Object.freeze({
  harmonic_brightness: "changes upper harmonic energy",
  filter_cutoff: "changes how much high-frequency content remains audible",
  pulse_rate: "changes the density of the procedural pulse layer",
  pulse_intensity: "changes the strength of short procedural transients",
  instability: "changes controlled detune between harmonic voices",
  texture_density: "changes the density and band of the deterministic texture layer",
  stereo_width: "changes the actual mid/side width of the stereo bus",
  delay: "changes bounded delay wet level and feedback",
  tonal_level: "changes the continuous tonal layer before final safety processing",
  error_texture: "changes the filtered error-texture contribution",
});

const PLAY_SIGNAL_IDS = Object.freeze(["request_rate", "latency_ms", "error_rate", "cache_hit_rate"]);
const PLAY_SONIC_IDS = Object.freeze(["filter_cutoff", "pulse_rate", "instability", "stereo_width"]);

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const elements = {
  depthButtons: $$('[data-depth]'),
  depthPanels: $$('[data-depth-panel]'),
  scenarioSelect: $("#scenario-select"),
  scenarioPrev: $("#scenario-prev"),
  scenarioNext: $("#scenario-next"),
  playToggle: $("#play-toggle"),
  resetRun: $("#reset-run"),
  time: $("#simulation-time"),
  playback: $("#playback-state"),
  audioToggle: $("#audio-toggle"),
  master: $("#master-level"),
  masterLabel: $("#master-level-label"),
  notice: $("#forge-notice"),
  firstUse: $("#first-use-cue"),
  playField: $("#play-field"),
  forgeField: $("#forge-field"),
  analysisField: $("#analysis-field"),
  playTimeline: $("#play-timeline"),
  analysisTimeline: $("#analysis-signal-timeline"),
  playSignalReadout: $("#play-signal-readout"),
  playSonicReadout: $("#play-sonic-readout"),
  playRouteReadout: $("#play-route-readout"),
  phaseNumber: $("#phase-number"),
  phaseTitle: $("#phase-title"),
  phaseDescription: $("#phase-description"),
  variantA: $("#variant-a"),
  variantB: $("#variant-b"),
  fingerprintA: $("#fingerprint-a"),
  fingerprintB: $("#fingerprint-b"),
  captureBaseline: $("#capture-baseline"),
  copyBaseline: $("#copy-baseline"),
  presetSelect: $("#preset-select"),
  savePreset: $("#save-preset"),
  deletePreset: $("#delete-preset"),
  routeList: $("#route-list"),
  routeSource: $("#route-source"),
  routeTarget: $("#route-target"),
  routeCreateConfirm: $("#route-create-confirm"),
  routeFocus: $("#route-focus"),
  routeLock: $("#route-lock-state"),
  transformChain: $("#transform-chain"),
  transformCurve: $("#transform-curve-line"),
  mappingTransform: $("#mapping-transform"),
  mappingPolarity: $("#mapping-polarity"),
  mappingSmoothing: $("#mapping-smoothing"),
  mappingInputMin: $("#mapping-input-min"),
  mappingInputMax: $("#mapping-input-max"),
  mappingOutputMin: $("#mapping-output-min"),
  mappingOutputMax: $("#mapping-output-max"),
  mappingExplanation: $("#mapping-explanation"),
  mappingBypass: $("#mapping-bypass"),
  mappingRemove: $("#mapping-remove"),
  analysisButtons: $$('[data-analysis]'),
  analysisPanels: $$('[data-analysis-panel]'),
  analysisSignalSelect: $("#analysis-signal-select"),
  analysisSignalValue: $("#analysis-signal-value"),
  analysisSignalUnit: $("#analysis-signal-unit"),
  analysisSignalNormalised: $("#analysis-signal-normalised"),
  analysisScenario: $("#analysis-scenario"),
  analysisTime: $("#analysis-time"),
  analysisHealth: $("#analysis-health"),
  analysisPhase: $("#analysis-phase"),
  analysisPhaseName: $("#analysis-phase-name"),
  analysisPhaseDescription: $("#analysis-phase-description"),
  analysisChain: $("#analysis-chain"),
  signalIndex: $("#signal-index"),
  audioScope: $("#audio-scope"),
  audioParameterList: $("#audio-parameter-list"),
  audioHarmonicState: $("#audio-harmonic-state"),
  help: $("#forge-help"),
  helpDialog: $("#forge-help-dialog"),
  saveDialog: $("#save-preset-dialog"),
  saveForm: $("#save-preset-form"),
  presetName: $("#preset-name"),
};

const meterTargets = {
  play: { peak: $("#play-peak"), rms: $("#play-rms"), bar: $("#play-meter-bar"), marker: $("#play-meter-marker") },
  analysis: { peak: $("#analysis-peak"), rms: $("#analysis-rms"), bar: $("#analysis-meter-bar"), marker: $("#analysis-meter-marker") },
};

const fieldOverlays = [
  {
    sourceLabel: $("#play-route-source-label"), sourceValue: $("#play-route-source-value"),
    transformLabel: $("#play-route-transform-label"), transformValue: $("#play-route-transform-value"),
    targetLabel: $("#play-route-target-label"), targetValue: $("#play-route-target-value"),
  },
  {
    sourceLabel: $("#forge-route-source-label"), sourceValue: $("#forge-route-source-value"),
    transformLabel: $("#forge-route-transform-label"), transformValue: $("#forge-route-transform-value"),
    targetLabel: $("#forge-route-target-label"), targetValue: $("#forge-route-target-value"),
  },
];

let scenarioId = "normal";
let playback = "STOPPED";
let time = 0;
let frame = createFrame(scenarioId, time);
let history = [frame];
let depth = "PLAY";
let analysisView = "SIGNAL";
let selectedSignalId = "latency_ms";
let comparison = createComparisonState();
let userPresets = [];
let presetId = "reference";
let masterLevel = MASTER_DEFAULT;
let audioEngine = null;
let audioEnabled = false;
let audioMuted = false;
let audioError = "";
let timer = null;
let storageAvailable = true;
let lastDialogInvoker = null;

const playFieldRenderer = new SpectralFieldRenderer(elements.playField);
const forgeFieldRenderer = new SpectralFieldRenderer(elements.forgeField);
const analysisFieldRenderer = new SpectralFieldRenderer(elements.analysisField);
const playTimelineRenderer = new TimelineRenderer(elements.playTimeline);
const analysisTimelineRenderer = new TimelineRenderer(elements.analysisTimeline);
const audioRenderer = new AudioAnalyserRenderer(elements.audioScope, meterTargets.play);

function option(value, label) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

function replaceOptions(select, definitions, selectedValue) {
  select.replaceChildren(...definitions.map(([value, label]) => option(value, label)));
  if (selectedValue !== undefined) select.value = selectedValue;
}

function allPresets() {
  return [...BUILT_IN_PRESETS, ...userPresets];
}

function currentPreset() {
  return allPresets().find((preset) => preset.id === presetId) ?? null;
}

function setNotice(message) {
  elements.notice.textContent = message;
}

function isTypingTarget(target) {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function scenarioIndex() {
  return SCENARIOS.findIndex((scenario) => scenario.id === scenarioId);
}

function targetSmoothing() {
  const mappings = activeMappings(comparison);
  return Object.fromEntries(mappings.filter((mapping) => mapping.enabled).map((mapping) => [mapping.target, mapping.smoothing]));
}

function activeOutputState() {
  return audibleOutputs(frame, comparison);
}

function currentSelectedMapping() {
  return selectedMapping(comparison);
}

function currentCalculation() {
  const mapping = currentSelectedMapping();
  return mapping ? calculateMapping(mapping, frame.normalised[mapping.source]) : null;
}

function fieldState() {
  return {
    frame,
    outputs: activeOutputState(),
    scenarioId,
    playback,
    audioEnabled,
    muted: audioMuted,
    selectedMapping: currentSelectedMapping(),
    selectedCalculation: currentCalculation(),
    routeFocus: comparison.auditionMode === "ROUTE_FOCUS",
    variant: comparison.activeVariant,
  };
}

function renderDepth() {
  elements.depthButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.depth === depth)));
  elements.depthPanels.forEach((panel) => { panel.hidden = panel.dataset.depthPanel !== depth; });
  document.body.dataset.forgeDepth = depth.toLowerCase();
  audioRenderer.meterElements = depth === "ANALYSE" && analysisView === "AUDIO" ? meterTargets.analysis : meterTargets.play;
}

function renderAnalysisView() {
  elements.analysisButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.analysis === analysisView)));
  elements.analysisPanels.forEach((panel) => { panel.hidden = panel.dataset.analysisPanel !== analysisView; });
  audioRenderer.meterElements = depth === "ANALYSE" && analysisView === "AUDIO" ? meterTargets.analysis : meterTargets.play;
}

function renderScenario() {
  elements.scenarioSelect.value = scenarioId;
  elements.time.textContent = formatTime(time);
  elements.playback.textContent = playback;
  elements.playToggle.textContent = playback === "PLAYING" ? "PAUSE" : playback === "COMPLETE" ? "REPLAY" : "PLAY";
  elements.phaseNumber.textContent = `PHASE ${String(frame.phaseIndex).padStart(2, "0")} / ${String(frame.phaseCount).padStart(2, "0")}`;
  elements.phaseTitle.textContent = frame.phaseTitle;
  elements.phaseDescription.textContent = frame.phaseDescription;
}

function renderAudioControls() {
  elements.master.value = String(masterLevel);
  elements.masterLabel.textContent = `${linearToDb(masterLevel).toFixed(1)} dB`;
  if (!audioEnabled) elements.audioToggle.textContent = "ENABLE AUDIO";
  else elements.audioToggle.textContent = audioMuted ? "UNMUTE" : "MUTE";
  elements.audioToggle.classList.toggle("forge-secondary-control", audioEnabled);
  elements.audioToggle.classList.toggle("forge-primary-control", !audioEnabled);
  if (audioError) elements.audioToggle.title = audioError;
  else elements.audioToggle.removeAttribute("title");
}

function renderRibbon() {
  elements.playSignalReadout.replaceChildren(...PLAY_SIGNAL_IDS.map((id) => {
    const definition = SIGNAL_BY_ID[id];
    const span = document.createElement("span");
    span.innerHTML = `<small>${definition.label}</small><strong>${formatValue(frame.values[id], definition.decimals)} ${definition.unit}</strong>`;
    return span;
  }));
  const outputs = activeOutputState();
  elements.playSonicReadout.replaceChildren(...PLAY_SONIC_IDS.map((id) => {
    const definition = TARGET_BY_ID[id];
    const span = document.createElement("span");
    span.innerHTML = `<small>${definition.label}</small><strong>${formatValue(outputs[id], definition.decimals)} ${definition.unit}</strong>`;
    return span;
  }));
  const mapping = currentSelectedMapping();
  const calculation = currentCalculation();
  elements.playRouteReadout.replaceChildren();
  if (mapping && calculation) {
    const route = document.createElement("span");
    route.innerHTML = `<small>${comparison.activeVariant} / ${comparison.activeVariant === "A" ? "BASELINE" : "CANDIDATE"}</small><strong>${SIGNAL_BY_ID[mapping.source].label} → ${TARGET_BY_ID[mapping.target].label}</strong>`;
    const transform = document.createElement("span");
    transform.innerHTML = `<small>${mapping.transform}${mapping.polarity === "REVERSED" ? " / REVERSED" : ""}</small><strong>${calculation.transformed.toFixed(3)} → ${formatValue(calculation.output, TARGET_BY_ID[mapping.target].decimals)} ${TARGET_BY_ID[mapping.target].unit}</strong>`;
    elements.playRouteReadout.append(route, transform);
  }
}

function renderFieldOverlays() {
  const mapping = currentSelectedMapping();
  const calculation = currentCalculation();
  if (!mapping || !calculation) return;
  const source = SIGNAL_BY_ID[mapping.source];
  const target = TARGET_BY_ID[mapping.target];
  for (const overlay of fieldOverlays) {
    overlay.sourceLabel.textContent = source.label;
    overlay.sourceValue.textContent = `${formatValue(frame.values[mapping.source], source.decimals)} ${source.unit}`;
    overlay.transformLabel.textContent = mapping.transform;
    overlay.transformValue.textContent = calculation.transformed.toFixed(3);
    overlay.targetLabel.textContent = target.label;
    overlay.targetValue.textContent = `${formatValue(calculation.output, target.decimals)} ${target.unit}`;
  }
}

function renderComparison() {
  elements.variantA.setAttribute("aria-pressed", String(comparison.activeVariant === "A"));
  elements.variantB.setAttribute("aria-pressed", String(comparison.activeVariant === "B"));
  elements.fingerprintA.textContent = comparison.baselineFingerprint;
  elements.fingerprintB.textContent = comparison.candidateFingerprint;
  elements.routeFocus.setAttribute("aria-pressed", String(comparison.auditionMode === "ROUTE_FOCUS"));
}

function renderPresetControls() {
  const definitions = allPresets().map((preset) => [preset.id, `${preset.builtIn ? "BUILT-IN" : "LOCAL"} / ${preset.name}`]);
  definitions.push(["custom-session", "SESSION / UNSAVED CANDIDATE"]);
  replaceOptions(elements.presetSelect, definitions, presetId);
  const preset = currentPreset();
  elements.deletePreset.hidden = !preset || preset.builtIn;
}

function renderRouteList() {
  const mappings = activeMappings(comparison);
  elements.routeList.replaceChildren(...mappings.map((mapping, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.mappingId = mapping.id;
    button.dataset.enabled = String(mapping.enabled);
    button.setAttribute("aria-pressed", String(mapping.id === comparison.selectedMappingId));
    button.setAttribute("aria-label", `Route ${index + 1}: ${SIGNAL_BY_ID[mapping.source].label} to ${TARGET_BY_ID[mapping.target].label}; ${mapping.transform}${mapping.enabled ? "" : "; bypassed"}`);
    button.innerHTML = `<i aria-hidden="true"></i><strong>${SIGNAL_BY_ID[mapping.source].label}</strong><span aria-hidden="true">→</span><strong>${TARGET_BY_ID[mapping.target].label}</strong>`;
    return button;
  }));

  const occupied = new Set(comparison.candidate.filter((mapping) => mapping.enabled).map((mapping) => mapping.target));
  [...elements.routeTarget.options].forEach((item) => { item.disabled = occupied.has(item.value); });
}

function curvePath(mapping) {
  const points = [];
  for (let index = 0; index <= 48; index += 1) {
    const x = index / 48;
    let transformed;
    if (mapping.transform === "INVERSE") transformed = 1 - x;
    else if (mapping.transform === "EXPONENTIAL") transformed = x * x;
    else if (mapping.transform === "THRESHOLD") transformed = x >= 0.6 ? 1 : 0;
    else transformed = x;
    if (mapping.polarity === "REVERSED") transformed = 1 - transformed;
    const px = 10 + x * 200;
    const py = 110 - transformed * 100;
    points.push(`${index === 0 ? "M" : "L"}${px.toFixed(2)} ${py.toFixed(2)}`);
  }
  return points.join(" ");
}

function renderInspector() {
  const mapping = currentSelectedMapping();
  const calculation = currentCalculation();
  const editable = comparison.activeVariant === "B";
  elements.routeLock.textContent = editable ? "B / CANDIDATE EDITABLE" : "A / BASELINE LOCKED";
  const controls = [elements.mappingTransform, elements.mappingPolarity, elements.mappingSmoothing, elements.mappingInputMin, elements.mappingInputMax, elements.mappingOutputMin, elements.mappingOutputMax, elements.mappingBypass, elements.mappingRemove];
  controls.forEach((control) => { control.disabled = !editable || !mapping; });
  if (!mapping || !calculation) {
    elements.transformChain.innerHTML = '<span><small>NO ROUTE</small><strong>—</strong></span>';
    elements.mappingExplanation.textContent = "Create or select a route to inspect its transformation.";
    return;
  }
  const source = SIGNAL_BY_ID[mapping.source];
  const target = TARGET_BY_ID[mapping.target];
  elements.transformChain.innerHTML = `
    <span><small>RAW SIGNAL</small><strong>${formatValue(frame.values[mapping.source], source.decimals)} ${source.unit}</strong></span>
    <span><small>NORMALISED</small><strong>${calculation.rawNormalised.toFixed(3)}</strong></span>
    <span><small>${mapping.transform}${mapping.polarity === "REVERSED" ? " / REVERSED" : ""}</small><strong>${calculation.transformed.toFixed(3)}</strong></span>
    <span><small>BOUNDED OUTPUT</small><strong>${formatValue(calculation.output, target.decimals)} ${target.unit}</strong></span>`;
  elements.transformCurve.setAttribute("d", curvePath(mapping));
  elements.mappingTransform.value = mapping.transform;
  elements.mappingPolarity.value = mapping.polarity;
  elements.mappingSmoothing.value = mapping.smoothing;
  elements.mappingInputMin.value = String(mapping.inputMin);
  elements.mappingInputMax.value = String(mapping.inputMax);
  elements.mappingOutputMin.value = String(mapping.outputMin);
  elements.mappingOutputMax.value = String(mapping.outputMax);
  elements.mappingOutputMin.min = String(target.min);
  elements.mappingOutputMin.max = String(target.max);
  elements.mappingOutputMax.min = String(target.min);
  elements.mappingOutputMax.max = String(target.max);
  elements.mappingOutputMin.step = target.decimals > 0 ? String(10 ** -target.decimals) : "1";
  elements.mappingOutputMax.step = elements.mappingOutputMin.step;
  elements.mappingBypass.textContent = mapping.enabled ? "BYPASS" : "ENABLE ROUTE";
  const direction = mapping.transform === "INVERSE" || mapping.polarity === "REVERSED" ? "Higher source values currently tend to reduce the mapped response." : "Higher source values currently tend to increase the mapped response.";
  elements.mappingExplanation.textContent = `${source.label} is normalised, transformed and smoothed into ${target.label}. ${TARGET_EXPLANATIONS[mapping.target]}. ${direction}`;
}

function renderAnalysis() {
  const signal = SIGNAL_BY_ID[selectedSignalId];
  elements.analysisSignalSelect.value = selectedSignalId;
  elements.analysisSignalValue.textContent = formatValue(frame.values[selectedSignalId], signal.decimals);
  elements.analysisSignalUnit.textContent = signal.unit;
  elements.analysisSignalNormalised.textContent = frame.normalised[selectedSignalId].toFixed(3);
  elements.analysisScenario.textContent = SCENARIO_BY_ID[scenarioId].label;
  elements.analysisTime.textContent = formatTime(time);
  elements.analysisHealth.textContent = frame.health;
  elements.analysisPhase.textContent = `${frame.phaseIndex} / ${frame.phaseCount}`;
  elements.analysisPhaseName.textContent = frame.phaseTitle;
  elements.analysisPhaseDescription.textContent = frame.phaseDescription;

  const mapping = activeMappings(comparison).find((candidate) => candidate.source === selectedSignalId) ?? currentSelectedMapping();
  if (mapping) {
    const calc = calculateMapping(mapping, frame.normalised[mapping.source]);
    elements.analysisChain.innerHTML = `<span><small>RAW</small><strong>${formatValue(frame.values[mapping.source], SIGNAL_BY_ID[mapping.source].decimals)} ${SIGNAL_BY_ID[mapping.source].unit}</strong></span><span><small>NORMALISED</small><strong>${calc.rawNormalised.toFixed(3)}</strong></span><span><small>${mapping.transform}</small><strong>${calc.transformed.toFixed(3)}</strong></span><span><small>${TARGET_BY_ID[mapping.target].label}</small><strong>${formatValue(calc.output, TARGET_BY_ID[mapping.target].decimals)} ${TARGET_BY_ID[mapping.target].unit}</strong></span>`;
  } else {
    elements.analysisChain.innerHTML = '<span><small>MAPPING</small><strong>No active route from this signal</strong></span>';
  }

  elements.signalIndex.replaceChildren(...SIGNALS.map((definition) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.signalId = definition.id;
    button.setAttribute("aria-pressed", String(definition.id === selectedSignalId));
    button.innerHTML = `<small>${definition.label}</small><strong>${formatValue(frame.values[definition.id], definition.decimals)} ${definition.unit}</strong>`;
    return button;
  }));

  const outputs = activeOutputState();
  elements.audioParameterList.replaceChildren(...TARGETS.map((definition) => {
    const span = document.createElement("span");
    span.innerHTML = `<small>${definition.label}</small><strong>${formatValue(outputs[definition.id], definition.decimals)} ${definition.unit}</strong>`;
    return span;
  }));
  elements.audioHarmonicState.textContent = HARMONIC_STATES[frame.health];
}

function renderVisuals() {
  const state = fieldState();
  playFieldRenderer.setState(state);
  forgeFieldRenderer.setState(state);
  analysisFieldRenderer.setState(state);
  playTimelineRenderer.setState({ history, frame, scenarioId, signalId: "anomaly_score" });
  analysisTimelineRenderer.setState({ history, frame, scenarioId, signalId: selectedSignalId });
  audioRenderer.setState({ analyser: audioEngine?.analyser ?? null, active: audioEnabled, muted: audioMuted });
}

function renderAll({ updateAudio = true } = {}) {
  renderDepth();
  renderAnalysisView();
  renderScenario();
  renderAudioControls();
  renderComparison();
  renderPresetControls();
  renderRouteList();
  renderInspector();
  renderFieldOverlays();
  renderRibbon();
  renderAnalysis();
  renderVisuals();
  if (updateAudio && audioEngine && audioEnabled) audioEngine.update(activeOutputState(), targetSmoothing(), frame.health, frame.deployEvent);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

function startTimer() {
  stopTimer();
  timer = setInterval(() => {
    time = Math.min(RUN_DURATION_SECONDS, Number((time + 0.1).toFixed(1)));
    frame = createFrame(scenarioId, time);
    history = [...history, frame].slice(-601);
    if (time >= RUN_DURATION_SECONDS) {
      playback = "COMPLETE";
      stopTimer();
    }
    renderAll();
  }, 100);
}

function setPlayback(next) {
  playback = next;
  if (playback === "PLAYING") {
    elements.firstUse.classList.add("is-dismissed");
    startTimer();
  } else stopTimer();
  renderAll();
}

function togglePlayback() {
  if (playback === "COMPLETE") {
    resetScenario();
    setPlayback("PLAYING");
    return;
  }
  setPlayback(playback === "PLAYING" ? "PAUSED" : "PLAYING");
}

function resetScenario(nextScenario = scenarioId) {
  stopTimer();
  scenarioId = nextScenario;
  time = 0;
  frame = createFrame(scenarioId, 0);
  history = [frame];
  playback = "STOPPED";
  audioEngine?.safeReset();
  setNotice(`${SCENARIO_BY_ID[scenarioId].label} · deterministic run reset to 00:00.0`);
  renderAll();
}

function selectScenario(nextScenario) {
  if (!SCENARIO_BY_ID[nextScenario]) return;
  resetScenario(nextScenario);
}

function stepScenario(direction) {
  const index = (scenarioIndex() + direction + SCENARIOS.length) % SCENARIOS.length;
  selectScenario(SCENARIOS[index].id);
}

async function enableAudio() {
  if (audioEnabled || audioEngine) return;
  try {
    audioEngine = new SpectralForgeAudioEngine(createAudioContext());
    await audioEngine.activate(masterLevel);
    audioEnabled = true;
    audioMuted = false;
    audioError = "";
    elements.firstUse.classList.add("is-dismissed");
    setNotice("Audio enabled · true stereo-width stage · bounded −1 dBFS sample output · M mutes immediately");
  } catch (error) {
    audioError = error instanceof Error ? error.message : "The audio context could not be created.";
    audioEngine = null;
    audioEnabled = false;
    setNotice("Audio engine unavailable · simulation, mapping and visual analysis remain active");
  }
  renderAll();
}

function toggleAudio() {
  if (!audioEnabled) {
    void enableAudio();
    return;
  }
  audioMuted = !audioMuted;
  audioEngine?.setMuted(audioMuted);
  setNotice(audioMuted ? "Actual audio output muted · mapped sonic state remains visible" : "Audio output restored at the saved master level");
  renderAll({ updateAudio: false });
}

function setDepth(next) {
  if (!["PLAY", "FORGE", "ANALYSE"].includes(next)) return;
  depth = next;
  persistPreferences();
  renderAll({ updateAudio: false });
}

function setAnalysisView(next) {
  if (!["SIGNAL", "AUDIO"].includes(next)) return;
  analysisView = next;
  renderAll({ updateAudio: false });
}

function setMaster(value) {
  masterLevel = Math.min(MASTER_MAX, Math.max(MASTER_MIN, Number(value)));
  audioEngine?.setMasterLevel(masterLevel);
  persistPreferences();
  renderAll({ updateAudio: false });
}

function selectRoute(id) {
  const exists = activeMappings(comparison).some((mapping) => mapping.id === id);
  if (!exists) return;
  comparison = { ...comparison, selectedMappingId: id };
  const mapping = currentSelectedMapping();
  if (mapping) selectedSignalId = mapping.source;
  renderAll();
}

function editSelectedMapping(patch) {
  if (comparison.activeVariant !== "B") return;
  const mapping = currentSelectedMapping();
  if (!mapping) return;
  try {
    comparison = updateCandidateMapping(comparison, mapping.id, patch);
    presetId = "custom-session";
    setNotice(`Candidate B changed · ${comparison.candidateFingerprint} · baseline A remains ${comparison.baselineFingerprint}`);
  } catch (error) {
    setNotice(error instanceof Error ? `Mapping change rejected · ${error.message}` : "Mapping change rejected");
  }
  renderAll();
}

function createRouteFromControls() {
  try {
    comparison = createCandidateRoute(comparison, elements.routeSource.value, elements.routeTarget.value);
    presetId = "custom-session";
    setNotice(`Candidate route created · ${comparison.candidateFingerprint}`);
    $("#route-create").open = false;
  } catch (error) {
    setNotice(error instanceof Error ? `Route not created · ${error.message}` : "Route not created");
  }
  renderAll();
}

function toggleRouteFocus() {
  const mode = comparison.auditionMode === "ROUTE_FOCUS" ? "FULL" : "ROUTE_FOCUS";
  comparison = setAuditionMode(comparison, mode);
  setNotice(mode === "ROUTE_FOCUS" ? "Route Focus active · baseline context retained; selected target follows the active mapping" : "Full mapping mix restored");
  renderAll();
}

function selectVariant(variant) {
  comparison = setActiveVariant(comparison, variant);
  comparison = { ...comparison, selectedMappingId: activeMappings(comparison).find((mapping) => mapping.id === comparison.selectedMappingId)?.id ?? activeMappings(comparison)[0]?.id ?? "" };
  setNotice(`${variant === "A" ? "Baseline A" : "Candidate B"} selected · telemetry sequence unchanged`);
  renderAll();
}

function captureCandidateAsBaseline() {
  comparison = captureBaseline(comparison);
  setNotice(`Baseline A captured explicitly · fingerprint ${comparison.baselineFingerprint}`);
  renderAll();
}

function restoreCandidateFromBaseline() {
  comparison = copyBaselineToCandidate(comparison);
  presetId = "custom-session";
  setNotice(`Candidate B restored from baseline A · ${comparison.candidateFingerprint}`);
  renderAll();
}

function loadPreset(id) {
  if (id === "custom-session") return;
  const preset = allPresets().find((candidate) => candidate.id === id);
  if (!preset) return;
  try {
    comparison = applyPresetToCandidate(comparison, preset);
    presetId = id;
    setNotice(`${preset.name} loaded into candidate B · baseline A unchanged`);
    persistPreferences();
  } catch (error) {
    setNotice(error instanceof Error ? `Preset rejected · ${error.message}` : "Preset rejected");
  }
  renderAll();
}

function savePreset(name) {
  try {
    const baseId = `user-${Date.now().toString(36)}`;
    const preset = createUserPreset(name, comparison.candidate, baseId);
    userPresets = [...userPresets, preset];
    presetId = preset.id;
    persistPreferences();
    setNotice(`${preset.name} saved locally in this browser`);
    return true;
  } catch (error) {
    setNotice(error instanceof Error ? `Preset not saved · ${error.message}` : "Preset not saved");
    return false;
  }
}

function deleteCurrentPreset() {
  const preset = currentPreset();
  if (!preset || preset.builtIn) return;
  userPresets = userPresets.filter((candidate) => candidate.id !== preset.id);
  presetId = "reference";
  comparison = applyPresetToCandidate(comparison, BUILT_IN_PRESETS[0]);
  persistPreferences();
  setNotice(`${preset.name} deleted from local browser storage`);
  renderAll();
}

function persistPreferences() {
  if (!storageAvailable) return;
  try {
    localStorage.setItem(STORAGE_KEY, serialisePreferences({ userPresets, presetId, depth, masterLevel }));
  } catch {
    storageAvailable = false;
    setNotice("LOCAL PRESET STORAGE UNAVAILABLE · current-session editing remains active");
  }
}

function restorePreferences() {
  try {
    const parsed = parsePreferences(localStorage.getItem(STORAGE_KEY));
    userPresets = parsed.userPresets;
    depth = parsed.depth;
    if (parsed.masterLevel !== null) masterLevel = Math.min(MASTER_MAX, Math.max(MASTER_MIN, parsed.masterLevel));
    const preset = [...BUILT_IN_PRESETS, ...userPresets].find((candidate) => candidate.id === parsed.presetId);
    if (preset) {
      presetId = preset.id;
      comparison = applyPresetToCandidate(comparison, preset);
    }
    localStorage.setItem(`${STORAGE_KEY}:probe`, "1");
    localStorage.removeItem(`${STORAGE_KEY}:probe`);
  } catch {
    storageAvailable = false;
    setNotice("LOCAL PRESET STORAGE UNAVAILABLE · current-session editing remains active");
  }
}

function openDialog(dialog, invoker) {
  if (!dialog || dialog.open) return;
  lastDialogInvoker = invoker ?? document.activeElement;
  dialog.showModal();
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
}

function setupDialogs() {
  $$('[data-dialog-close]').forEach((button) => button.addEventListener("click", () => closeDialog(button.closest("dialog"))));
  [elements.saveDialog, elements.helpDialog].forEach((dialog) => dialog.addEventListener("close", () => {
    if (lastDialogInvoker instanceof HTMLElement && document.contains(lastDialogInvoker)) lastDialogInvoker.focus({ preventScroll: true });
    lastDialogInvoker = null;
  }));
  elements.saveDialog.addEventListener("cancel", () => setNotice("Preset save cancelled"));
  elements.helpDialog.addEventListener("cancel", () => setNotice("Help closed"));
}

function populateStaticControls() {
  replaceOptions(elements.scenarioSelect, SCENARIOS.map((scenario) => [scenario.id, `${scenario.number} / ${scenario.label}`]), scenarioId);
  replaceOptions(elements.routeSource, SIGNALS.map((signal) => [signal.id, signal.label]), "request_rate");
  replaceOptions(elements.routeTarget, TARGETS.map((target) => [target.id, target.label]), "filter_cutoff");
  replaceOptions(elements.analysisSignalSelect, SIGNALS.map((signal) => [signal.id, signal.label]), selectedSignalId);
  replaceOptions(elements.mappingTransform, TRANSFORM_TYPES.map((value) => [value, value]));
  replaceOptions(elements.mappingPolarity, POLARITIES.map((value) => [value, value]));
  replaceOptions(elements.mappingSmoothing, SMOOTHING_TYPES.map((value) => [value, value]));
}

function setupEvents() {
  elements.depthButtons.forEach((button) => button.addEventListener("click", () => setDepth(button.dataset.depth)));
  elements.analysisButtons.forEach((button) => button.addEventListener("click", () => setAnalysisView(button.dataset.analysis)));
  elements.scenarioSelect.addEventListener("change", () => selectScenario(elements.scenarioSelect.value));
  elements.scenarioPrev.addEventListener("click", () => stepScenario(-1));
  elements.scenarioNext.addEventListener("click", () => stepScenario(1));
  elements.playToggle.addEventListener("click", togglePlayback);
  elements.resetRun.addEventListener("click", () => resetScenario());
  elements.audioToggle.addEventListener("click", toggleAudio);
  elements.master.addEventListener("input", () => setMaster(elements.master.value));
  elements.variantA.addEventListener("click", () => selectVariant("A"));
  elements.variantB.addEventListener("click", () => selectVariant("B"));
  elements.captureBaseline.addEventListener("click", captureCandidateAsBaseline);
  elements.copyBaseline.addEventListener("click", restoreCandidateFromBaseline);
  elements.presetSelect.addEventListener("change", () => loadPreset(elements.presetSelect.value));
  elements.savePreset.addEventListener("click", () => { elements.presetName.value = ""; openDialog(elements.saveDialog, elements.savePreset); queueMicrotask(() => elements.presetName.focus()); });
  elements.deletePreset.addEventListener("click", deleteCurrentPreset);
  elements.routeList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mapping-id]");
    if (button) selectRoute(button.dataset.mappingId);
  });
  elements.routeCreateConfirm.addEventListener("click", createRouteFromControls);
  elements.routeFocus.addEventListener("click", toggleRouteFocus);
  elements.mappingTransform.addEventListener("change", () => editSelectedMapping({ transform: elements.mappingTransform.value }));
  elements.mappingPolarity.addEventListener("change", () => editSelectedMapping({ polarity: elements.mappingPolarity.value }));
  elements.mappingSmoothing.addEventListener("change", () => editSelectedMapping({ smoothing: elements.mappingSmoothing.value }));
  elements.mappingInputMin.addEventListener("change", () => editSelectedMapping({ inputMin: Number(elements.mappingInputMin.value) }));
  elements.mappingInputMax.addEventListener("change", () => editSelectedMapping({ inputMax: Number(elements.mappingInputMax.value) }));
  elements.mappingOutputMin.addEventListener("change", () => editSelectedMapping({ outputMin: Number(elements.mappingOutputMin.value) }));
  elements.mappingOutputMax.addEventListener("change", () => editSelectedMapping({ outputMax: Number(elements.mappingOutputMax.value) }));
  elements.mappingBypass.addEventListener("click", () => {
    const mapping = currentSelectedMapping();
    if (mapping) editSelectedMapping({ enabled: !mapping.enabled });
  });
  elements.mappingRemove.addEventListener("click", () => {
    if (comparison.activeVariant !== "B") return;
    const mapping = currentSelectedMapping();
    if (!mapping) return;
    comparison = removeCandidateRoute(comparison, mapping.id);
    presetId = "custom-session";
    setNotice("Candidate route removed · baseline A unchanged");
    renderAll();
  });
  elements.analysisSignalSelect.addEventListener("change", () => { selectedSignalId = elements.analysisSignalSelect.value; renderAll({ updateAudio: false }); });
  elements.signalIndex.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-signal-id]");
    if (!button) return;
    selectedSignalId = button.dataset.signalId;
    renderAll({ updateAudio: false });
  });
  elements.help.addEventListener("click", () => openDialog(elements.helpDialog, elements.help));
  elements.saveForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (savePreset(elements.presetName.value)) closeDialog(elements.saveDialog);
    renderAll();
  });
  window.addEventListener("keydown", (event) => {
    if (isTypingTarget(event.target) || document.querySelector("dialog[open]")) return;
    const key = event.key.toLowerCase();
    if (event.key === " ") { event.preventDefault(); togglePlayback(); }
    else if (key === "r") resetScenario();
    else if (key === "m" && audioEnabled) toggleAudio();
    else if (key === "p") setDepth("PLAY");
    else if (key === "f") setDepth("FORGE");
    else if (key === "a") setDepth("ANALYSE");
    else if (event.key === "?") openDialog(elements.helpDialog, elements.help);
    else if (/^[1-7]$/.test(event.key)) selectScenario(SCENARIOS[Number(event.key) - 1].id);
  });
  window.addEventListener("pagehide", () => {
    stopTimer();
    playFieldRenderer.destroy();
    forgeFieldRenderer.destroy();
    analysisFieldRenderer.destroy();
    playTimelineRenderer.destroy();
    analysisTimelineRenderer.destroy();
    audioRenderer.destroy();
    void audioEngine?.dispose();
  }, { once: true });
}

function init() {
  populateStaticControls();
  setupDialogs();
  restorePreferences();
  setupEvents();
  renderAll({ updateAudio: false });
}

init();
