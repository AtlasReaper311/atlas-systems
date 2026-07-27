import { createSongPlanner } from "/static/js/sonify/apu-song-plan.js?v=20260727-system-symphony-pass-d1-song-plan-v1";
import { normalizedStateIdentity } from "/static/js/sonify/apu-state-identities.js?v=20260727-system-symphony-state-identities-v5";
import { motifMidiEventsForPlan } from "/static/js/sonify/apu-theme-grammar.js?v=20260727-system-symphony-pass-d2-theme-grammar-v1";

const STATE_LABELS = Object.freeze({
  healthy: "Explorer",
  warning: "Grid Pressure",
  critical: "Boss Protocol",
  unknown: "Lost Signal",
});

const STATEMENT_INPUT = Object.freeze({
  phraseIndex: 1,
  cycleNumber: 0,
  cyclePhrase: 1,
  section: "establish",
  sectionLocalPhrase: 0,
});

const LISTENING_BPM = 72;
const NOTE_SPACING_SECONDS = 0.58;
const NOTE_DURATION_SECONDS = 0.36;
const COMPARISON_PAUSE_SECONDS = 1.2;

const root = document.querySelector("[data-audition-root]");
if (!root) throw new Error("system-symphony-pass-d2: audition root is missing");

const statusNode = root.querySelector("[data-status]");
const compareButton = root.querySelector("[data-compare]");
const playReferenceButton = root.querySelector("[data-play-reference]");
const playSelectedButton = root.querySelector("[data-play-selected]");
const stopButton = root.querySelector("[data-stop]");
const volumeInput = root.querySelector("[data-volume]");
const stepGrid = root.querySelector("[data-step-grid]");
const eventTable = root.querySelector("[data-event-table]");
const eventSummary = root.querySelector("[data-event-summary]");

let selectedState = "warning";
let selectedMotif = null;
let referenceMotif = null;
let initialized = false;
let playing = false;
let master = null;
let limiter = null;
let synth = null;

function midiName(midi) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const value = Math.round(midi);
  return `${names[((value % 12) + 12) % 12]}${Math.floor(value / 12) - 1}`;
}

function standardEvidence() {
  return Object.freeze({ mode: "preview", stale: false, recoveryConfirmed: false, movement: null });
}

function statementPlanFor(state) {
  const planner = createSongPlanner({ seed: `PASS-D2:CLEAR-AUDITION:${state}` });
  return planner.advancePhrase({
    ...STATEMENT_INPUT,
    state,
    evidence: standardEvidence(),
  });
}

function motifForState(state) {
  const plan = statementPlanFor(state);
  const identity = normalizedStateIdentity(state);
  return motifMidiEventsForPlan(plan, identity.scale);
}

function setMetric(name, value) {
  const node = root.querySelector(`[data-metric="${name}"]`);
  if (node) node.textContent = String(value);
}

function updateSelectionButtons() {
  root.querySelectorAll("[data-state-button]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.stateButton === selectedState));
  });
}

function renderSequence(motif) {
  const fragment = document.createDocumentFragment();
  const events = [...motif.events].sort((left, right) => left.step - right.step);
  stepGrid.style.gridTemplateColumns = `repeat(${Math.max(1, events.length)}, minmax(56px, 1fr))`;

  events.forEach((event, index) => {
    const cell = document.createElement("div");
    cell.className = "step-cell has-primary";
    cell.dataset.bar = index < Math.ceil(events.length / 2) ? "1" : "2";
    cell.title = `Note ${index + 1}: ${midiName(event.midi)}, source ${event.sourceIndex}`;

    const label = document.createElement("span");
    label.textContent = `${index + 1} · ${midiName(event.midi)}`;
    cell.append(label);
    fragment.append(cell);
  });

  stepGrid.replaceChildren(fragment);
}

function renderEvents(motif) {
  const fragment = document.createDocumentFragment();
  const events = [...motif.events].sort((left, right) => left.step - right.step);

  events.forEach((event, index) => {
    const row = document.createElement("tr");
    const values = [
      index + 1,
      event.sourceIndex,
      event.degree,
      midiName(event.midi),
      motif.preservedAnchors.includes(event.sourceIndex) ? "Retained anchor" : "Theme material",
    ];

    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      row.append(cell);
    }
    fragment.append(row);
  });

  eventTable.replaceChildren(fragment);
  eventSummary.textContent = `${events.length} notes`;
}

function rebuildComparison() {
  referenceMotif = motifForState("healthy");
  selectedMotif = motifForState(selectedState);
  root.dataset.state = selectedState;
  setMetric("state", STATE_LABELS[selectedState]);
  renderSequence(selectedMotif);
  renderEvents(selectedMotif);
  updateSelectionButtons();
  statusNode.textContent = `${STATE_LABELS[selectedState]} is selected. Explorer will play first in the comparison.`;
}

function ensureAudioGraph() {
  if (initialized) return;
  const Tone = globalThis.Tone;
  if (!Tone) throw new Error("Theme audition cannot start because Tone.js is unavailable.");

  limiter = new Tone.Limiter(-4).toDestination();
  master = new Tone.Gain(Number(volumeInput.value) / 100 * 0.72).connect(limiter);
  synth = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.008, decay: 0.08, sustain: 0.12, release: 0.1 },
    volume: -7,
  }).connect(master);

  Tone.Transport.bpm.value = LISTENING_BPM;
  Tone.Transport.timeSignature = 4;
  initialized = true;
}

function eventFrequency(event) {
  return globalThis.Tone.Frequency(event.midi, "midi").toFrequency();
}

function sequenceDuration(motif) {
  return Math.max(0, motif.events.length - 1) * NOTE_SPACING_SECONDS + NOTE_DURATION_SECONDS;
}

function scheduleStatus(message, offsetSeconds) {
  const Tone = globalThis.Tone;
  Tone.Transport.schedule((time) => {
    Tone.Draw.schedule(() => {
      statusNode.textContent = message;
    }, time);
  }, offsetSeconds);
}

function scheduleMotif(motif, offsetSeconds, label) {
  const Tone = globalThis.Tone;
  const events = [...motif.events].sort((left, right) => left.step - right.step);
  scheduleStatus(`Now playing: ${label}.`, offsetSeconds);

  events.forEach((event, index) => {
    Tone.Transport.schedule((time) => {
      synth.triggerAttackRelease(
        eventFrequency(event),
        NOTE_DURATION_SECONDS,
        time,
        Math.max(0.24, Math.min(0.48, event.velocity ?? 0.36)),
      );
    }, offsetSeconds + index * NOTE_SPACING_SECONDS);
  });

  return offsetSeconds + sequenceDuration(motif);
}

function stopPlayback({ announce = true } = {}) {
  if (!initialized) {
    if (announce) statusNode.textContent = "Audition stopped.";
    return;
  }

  const Tone = globalThis.Tone;
  Tone.Transport.stop();
  Tone.Transport.cancel();
  synth.triggerRelease(Tone.now());
  playing = false;
  root.dataset.running = "false";
  if (announce) statusNode.textContent = "Audition stopped.";
}

async function playParts(parts) {
  try {
    ensureAudioGraph();
    await globalThis.Tone.start();
    stopPlayback({ announce: false });

    const Tone = globalThis.Tone;
    let cursor = 0;
    parts.forEach((part, index) => {
      cursor = scheduleMotif(part.motif, cursor, part.label);
      if (index < parts.length - 1) {
        const nextLabel = parts[index + 1].label;
        scheduleStatus(`Pause. Next: ${nextLabel}.`, cursor + 0.1);
        cursor += COMPARISON_PAUSE_SECONDS;
      }
    });

    const finishedAt = cursor + 0.2;
    Tone.Transport.schedule((time) => {
      Tone.Draw.schedule(() => {
        Tone.Transport.stop();
        playing = false;
        root.dataset.running = "false";
        statusNode.textContent = "Comparison complete. Replay it as many times as needed.";
      }, time);
    }, finishedAt);

    Tone.Transport.position = 0;
    Tone.Transport.start("+0.05");
    playing = true;
    root.dataset.running = "true";
  } catch (error) {
    statusNode.textContent = error instanceof Error ? error.message : String(error);
  }
}

compareButton.addEventListener("click", () => {
  playParts([
    { motif: referenceMotif, label: "Explorer reference" },
    { motif: selectedMotif, label: STATE_LABELS[selectedState] },
  ]);
});

playReferenceButton.addEventListener("click", () => {
  playParts([{ motif: referenceMotif, label: "Explorer reference" }]);
});

playSelectedButton.addEventListener("click", () => {
  playParts([{ motif: selectedMotif, label: STATE_LABELS[selectedState] }]);
});

stopButton.addEventListener("click", () => stopPlayback());

root.querySelectorAll("[data-state-button]").forEach((button) => {
  button.addEventListener("click", () => {
    if (playing) stopPlayback({ announce: false });
    selectedState = button.dataset.stateButton;
    rebuildComparison();
  });
});

volumeInput.addEventListener("input", () => {
  if (master) master.gain.rampTo(Number(volumeInput.value) / 100 * 0.72, 0.08);
});

window.addEventListener("pagehide", () => {
  stopPlayback({ announce: false });
  synth?.dispose();
  master?.dispose();
  limiter?.dispose();
});

rebuildComparison();
