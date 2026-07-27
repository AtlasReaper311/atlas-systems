import { createSongPlanner } from "/static/js/sonify/apu-song-plan.js?v=20260727-system-symphony-pass-d1-song-plan-v1";
import { normalizedStateIdentity } from "/static/js/sonify/apu-state-identities.js?v=20260727-system-symphony-state-identities-v5";
import { motifMidiEventsForPlan } from "/static/js/sonify/apu-theme-grammar.js?v=20260727-system-symphony-pass-d2-theme-grammar-v1";

const STATE_LABELS = Object.freeze({
  healthy: "Explorer",
  warning: "Grid Pressure",
  critical: "Boss Protocol",
  unknown: "Lost Signal",
});

const PROFILE_INPUTS = Object.freeze({
  statement: Object.freeze({ phraseIndex: 1, cycleNumber: 0, cyclePhrase: 1, section: "establish", sectionLocalPhrase: 0 }),
  answer: Object.freeze({ phraseIndex: 2, cycleNumber: 0, cyclePhrase: 2, section: "establish", sectionLocalPhrase: 1 }),
  development: Object.freeze({ phraseIndex: 17, cycleNumber: 1, cyclePhrase: 1, section: "establish", sectionLocalPhrase: 0 }),
  reprise: Object.freeze({ phraseIndex: 49, cycleNumber: 3, cyclePhrase: 1, section: "establish", sectionLocalPhrase: 0 }),
  climax: Object.freeze({ phraseIndex: 11, cycleNumber: 0, cyclePhrase: 11, section: "peak", sectionLocalPhrase: 0 }),
});

const root = document.querySelector("[data-audition-root]");
const statusNode = document.querySelector("[data-status]");
const audioToggle = document.querySelector("[data-audio-toggle]");
const playOnceButton = document.querySelector("[data-play-once]");
const volumeInput = document.querySelector("[data-volume]");
const stepGrid = document.querySelector("[data-step-grid]");
const eventTable = document.querySelector("[data-event-table]");
const eventSummary = document.querySelector("[data-event-summary]");

let selectedState = "healthy";
let selectedProfile = "statement";
let currentPlan = null;
let currentMotif = null;
let running = false;
let initialized = false;
let master = null;
let limiter = null;
let primary = null;
let secondary = null;

function titleCase(value) {
  return String(value ?? "unknown")
    .split("-")
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part)
    .join(" ");
}

function midiName(midi) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const value = Math.round(midi);
  return `${names[((value % 12) + 12) % 12]}${Math.floor(value / 12) - 1}`;
}

function standardEvidence() {
  return Object.freeze({ mode: "preview", stale: false, recoveryConfirmed: false, movement: null });
}

function recoveryPlan(originState) {
  const fromState = originState === "healthy" ? "warning" : originState;
  const planner = createSongPlanner({ seed: `PASS-D2:AUDITION:RECOVERY:${fromState}` });
  planner.advancePhrase({
    phraseIndex: 13,
    cycleNumber: 0,
    cyclePhrase: 13,
    section: "release",
    sectionLocalPhrase: 0,
    state: fromState,
    evidence: standardEvidence(),
  });
  return planner.advancePhrase({
    phraseIndex: 14,
    cycleNumber: 0,
    cyclePhrase: 14,
    section: "recovery",
    sectionLocalPhrase: 0,
    state: "healthy",
    evidence: Object.freeze({
      mode: "preview",
      stale: false,
      recoveryConfirmed: true,
      movement: Object.freeze({ kind: "recovery", fromEvidence: true }),
    }),
  });
}

function planForSelection() {
  if (selectedProfile === "recovery") return recoveryPlan(selectedState);
  const planner = createSongPlanner({ seed: `PASS-D2:AUDITION:${selectedState}:${selectedProfile}` });
  return planner.advancePhrase({
    ...PROFILE_INPUTS[selectedProfile],
    state: selectedState,
    evidence: standardEvidence(),
  });
}

function updateSelectionButtons() {
  document.querySelectorAll("[data-state-button]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.stateButton === selectedState));
  });
  document.querySelectorAll("[data-profile-button]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.profileButton === selectedProfile));
  });
}

function renderSteps(motif) {
  const primaryByStep = new Map(motif.events.map((event) => [event.step, event]));
  const echoesByStep = new Map(motif.echoEvents.map((event) => [event.step, event]));
  const fragment = document.createDocumentFragment();
  for (let step = 0; step < 32; step += 1) {
    const cell = document.createElement("div");
    cell.className = "step-cell";
    cell.dataset.bar = step < 16 ? "1" : "2";
    const label = document.createElement("span");
    label.textContent = String(step).padStart(2, "0");
    cell.append(label);
    const primaryEvent = primaryByStep.get(step);
    const echoEvent = echoesByStep.get(step);
    if (primaryEvent) {
      cell.classList.add("has-primary");
      cell.title = `Primary ${midiName(primaryEvent.midi)}, degree ${primaryEvent.degree}`;
    }
    if (echoEvent) {
      cell.classList.add("has-echo");
      cell.title = `${cell.title ? `${cell.title}; ` : ""}Echo ${midiName(echoEvent.midi)}, degree ${echoEvent.degree}`;
    }
    fragment.append(cell);
  }
  stepGrid.replaceChildren(fragment);
}

function renderEvents(motif) {
  const events = [...motif.events, ...motif.echoEvents].sort((left, right) => left.step - right.step || left.voice.localeCompare(right.voice));
  const fragment = document.createDocumentFragment();
  for (const event of events) {
    const row = document.createElement("tr");
    const values = [
      event.voice === "primary" ? "Primary" : "Echo",
      event.step,
      event.degree,
      midiName(event.midi),
      event.duration,
      motif.preservedAnchors.includes(event.sourceIndex) ? `Anchor ${event.sourceIndex}` : `Genome ${event.sourceIndex}`,
    ];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      row.append(cell);
    }
    fragment.append(row);
  }
  eventTable.replaceChildren(fragment);
  eventSummary.textContent = `${motif.events.length} primary notes / ${motif.echoEvents.length} echoes`;
}

function setMetric(name, value) {
  const node = document.querySelector(`[data-metric="${name}"]`);
  if (node) node.textContent = value;
}

function rebuildAudition() {
  currentPlan = planForSelection();
  const identity = normalizedStateIdentity(currentPlan.state);
  currentMotif = motifMidiEventsForPlan(currentPlan, identity.scale);
  root.dataset.state = currentPlan.state;
  setMetric("theme", currentMotif.themeId);
  setMetric("state", selectedProfile === "recovery"
    ? `Recovery to ${STATE_LABELS[currentPlan.state]}`
    : STATE_LABELS[currentPlan.state]);
  setMetric("phrase-role", titleCase(currentPlan.phraseRole));
  setMetric("cycle-role", titleCase(currentPlan.cycleRole));
  setMetric("requested-transform", titleCase(currentMotif.requestedTransform));
  setMetric("transform", titleCase(currentMotif.transform));
  setMetric("cadence", titleCase(currentMotif.cadenceIntent));
  setMetric("anchors", `${currentMotif.preservedAnchors.length} / 3`);
  renderSteps(currentMotif);
  renderEvents(currentMotif);
  updateSelectionButtons();
  statusNode.textContent = running
    ? `${STATE_LABELS[currentPlan.state]} ${titleCase(currentPlan.phraseRole)} will begin at the next loop boundary.`
    : `${STATE_LABELS[currentPlan.state]} ${titleCase(currentPlan.phraseRole)} is ready.`;
}

function ensureAudioGraph() {
  if (initialized) return;
  const Tone = globalThis.Tone;
  if (!Tone) throw new Error("Theme audition cannot start because Tone.js is unavailable.");
  limiter = new Tone.Limiter(-3).toDestination();
  master = new Tone.Gain(Number(volumeInput.value) / 100 * 0.62).connect(limiter);
  primary = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 8,
    oscillator: { type: "square" },
    envelope: { attack: 0.004, decay: 0.08, sustain: 0.18, release: 0.12 },
    volume: -8,
  }).connect(master);
  secondary = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 6,
    oscillator: { type: "triangle" },
    envelope: { attack: 0.01, decay: 0.14, sustain: 0.12, release: 0.22 },
    volume: -15,
  }).connect(master);
  Tone.Transport.bpm.value = 100;
  Tone.Transport.timeSignature = 4;
  initialized = true;
}

function eventFrequency(event) {
  return globalThis.Tone.Frequency(event.midi, "midi").toFrequency();
}

function playMotifAt(time, motif = currentMotif) {
  if (!motif || !initialized) return;
  const stepSeconds = globalThis.Tone.Time("16n").toSeconds();
  for (const event of motif.events) {
    primary.triggerAttackRelease(eventFrequency(event), event.duration, time + event.step * stepSeconds, event.velocity);
  }
  for (const event of motif.echoEvents) {
    secondary.triggerAttackRelease(eventFrequency(event), event.duration, time + event.step * stepSeconds, event.velocity);
  }
}

function stopTransport() {
  if (!initialized) return;
  const Tone = globalThis.Tone;
  Tone.Transport.stop();
  Tone.Transport.cancel();
  primary.releaseAll(Tone.now());
  secondary.releaseAll(Tone.now());
}

function startLoop() {
  const Tone = globalThis.Tone;
  stopTransport();
  Tone.Transport.scheduleRepeat((time) => playMotifAt(time), "2m", 0);
  Tone.Transport.position = 0;
  Tone.Transport.start("+0.05");
}

async function toggleLoop() {
  try {
    ensureAudioGraph();
    if (!running) {
      await globalThis.Tone.start();
      startLoop();
      running = true;
      root.dataset.running = "true";
      audioToggle.textContent = "Stop looping phrase";
      statusNode.textContent = `${STATE_LABELS[currentPlan.state]} ${titleCase(currentPlan.phraseRole)} is looping at 100 BPM.`;
    } else {
      stopTransport();
      running = false;
      root.dataset.running = "false";
      audioToggle.textContent = "Start looping phrase";
      statusNode.textContent = "Audition stopped.";
    }
  } catch (error) {
    statusNode.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function playOnce() {
  try {
    ensureAudioGraph();
    await globalThis.Tone.start();
    playMotifAt(globalThis.Tone.now() + 0.05);
    statusNode.textContent = `Playing one ${STATE_LABELS[currentPlan.state]} ${titleCase(currentPlan.phraseRole)} phrase.`;
  } catch (error) {
    statusNode.textContent = error instanceof Error ? error.message : String(error);
  }
}

document.querySelectorAll("[data-state-button]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedState = button.dataset.stateButton;
    rebuildAudition();
  });
});

document.querySelectorAll("[data-profile-button]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedProfile = button.dataset.profileButton;
    rebuildAudition();
  });
});

audioToggle.addEventListener("click", toggleLoop);
playOnceButton.addEventListener("click", playOnce);
volumeInput.addEventListener("input", () => {
  if (master) master.gain.rampTo(Number(volumeInput.value) / 100 * 0.62, 0.08);
});

window.addEventListener("pagehide", () => {
  stopTransport();
  primary?.dispose();
  secondary?.dispose();
  master?.dispose();
  limiter?.dispose();
});

rebuildAudition();
