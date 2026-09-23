import {
  buildRecordedReplayPresentation,
  parseRecordedReplayArtifact,
  RECORDED_REPLAY_PRESENTATION_STEP_MS,
} from "../../../static/js/sonify/atlas-apu-recorded-replay.js?v=20260923-phase5-recorded-replay-v1";

const RECORDED_REPLAY_DATA_URL = "/lab/system-symphony/black-box/recorded-replays.json?v=20260923-phase5-recorded-replay-v1";
const AUDIO_FREQUENCIES = Object.freeze({
  "context-cue": 146.83,
  "failure-vocabulary": 73.42,
  "record-marker": 220,
  "follow-up-success": 174.61,
});

const state = {
  artifact: null,
  position: 0,
  playing: false,
  audioConsent: false,
  muted: true,
  timer: null,
  audio: null,
};

const bySelector = (selector) => document.querySelector(selector);

function setText(selector, value) {
  const node = bySelector(selector);
  if (node) node.textContent = String(value ?? "unknown");
}

function formatTimestamp(value) {
  return String(value).replace("T", " ").replace("Z", " UTC");
}

function currentPresentation() {
  return state.artifact ? buildRecordedReplayPresentation(state.artifact, state.position) : null;
}

function stopTimer() {
  if (state.timer !== null) window.clearTimeout(state.timer);
  state.timer = null;
}

function updateButtons() {
  const hasArtifact = Boolean(state.artifact);
  const start = bySelector("[data-recorded-replay-start-audio]");
  const play = bySelector("[data-recorded-replay-play]");
  const pause = bySelector("[data-recorded-replay-pause]");
  const reset = bySelector("[data-recorded-replay-reset]");
  const mute = bySelector("[data-recorded-replay-mute]");
  if (start) {
    start.disabled = !hasArtifact;
    start.textContent = state.audioConsent ? "Audio Ready" : "Start Audio";
    start.setAttribute("aria-pressed", String(state.audioConsent));
  }
  if (play) play.disabled = !hasArtifact || !state.audioConsent || state.playing;
  if (pause) pause.disabled = !hasArtifact || !state.playing;
  if (reset) reset.disabled = !hasArtifact;
  if (mute) {
    mute.disabled = !hasArtifact || !state.audioConsent;
    mute.textContent = state.muted ? "Unmute" : "Mute";
    mute.setAttribute("aria-pressed", String(state.muted));
  }
  const root = bySelector("[data-recorded-replay]");
  if (root) {
    root.dataset.audioConsent = String(state.audioConsent);
    root.dataset.playing = String(state.playing);
    root.dataset.muted = String(state.muted);
  }
}

function renderEventList() {
  const list = bySelector("[data-recorded-replay-events]");
  if (!list || !state.artifact) return;
  list.replaceChildren();
  state.artifact.events.forEach((event, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const time = document.createElement("time");
    const label = document.createElement("strong");
    const relation = document.createElement("span");
    button.type = "button";
    button.className = "recorded-replay-event";
    button.dataset.replayPosition = String(index);
    button.setAttribute("aria-label", `Replay event ${index + 1}: ${event.label}`);
    time.dateTime = event.timestamp;
    time.textContent = formatTimestamp(event.timestamp);
    label.textContent = event.label;
    relation.textContent = event.causalRelation;
    button.append(time, label, relation);
    button.addEventListener("click", () => {
      state.playing = false;
      stopTimer();
      state.position = index;
      render();
    });
    item.appendChild(button);
    list.appendChild(item);
  });
}

function render() {
  if (!state.artifact) return;
  const presentation = currentPresentation();
  const event = presentation.event;
  setText("[data-recorded-replay-position]", `${presentation.position + 1} / ${presentation.eventCount}`);
  setText("[data-recorded-replay-historical-time]", formatTimestamp(presentation.historicalTimestamp));
  setText("[data-recorded-replay-current-label]", event.label);
  setText("[data-recorded-replay-current-text]", event.text);
  setText("[data-recorded-replay-role]", `${event.apuRole} / ${presentation.scorePlan.dominantState}`);
  setText("[data-recorded-replay-status]", state.playing
    ? `Playing event ${presentation.position + 1} of ${presentation.eventCount}; presentation timing is fixed and historical elapsed time is not represented.`
    : `Event ${presentation.position + 1} of ${presentation.eventCount} selected. Audio is interpretation only.`
  );
  for (const button of document.querySelectorAll("[data-replay-position]")) {
    const selected = Number(button.dataset.replayPosition) === presentation.position;
    button.setAttribute("aria-current", selected ? "step" : "false");
    button.classList.toggle("is-current", selected);
  }
  renderEventList();
  updateButtons();
}

function ensureAudio() {
  if (state.audio) return state.audio;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("This browser does not expose Web Audio");
  const context = new AudioContextClass();
  const output = context.createGain();
  output.gain.value = state.muted ? 0 : 0.18;
  output.connect(context.destination);
  state.audio = { context, output };
  return state.audio;
}

function playInterpretation(presentation) {
  if (!state.audio || state.muted) return;
  const frequency = AUDIO_FREQUENCIES[presentation.event.apuRole] ?? 146.83;
  const { context, output } = state.audio;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  const start = context.currentTime;
  oscillator.type = presentation.event.apuRole === "failure-vocabulary" ? "sawtooth" : "sine";
  oscillator.frequency.setValueAtTime(frequency, start);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(0.12, start + 0.025);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
  oscillator.connect(envelope).connect(output);
  oscillator.start(start);
  oscillator.stop(start + 0.45);
}

function scheduleNext() {
  stopTimer();
  if (!state.playing) return;
  state.timer = window.setTimeout(() => {
    if (state.position >= state.artifact.events.length - 1) {
      state.playing = false;
      render();
      return;
    }
    state.position += 1;
    playInterpretation(currentPresentation());
    render();
    scheduleNext();
  }, RECORDED_REPLAY_PRESENTATION_STEP_MS);
}

async function startAudio() {
  try {
    const audio = ensureAudio();
    if (audio.context.state === "suspended") await audio.context.resume();
    state.audioConsent = true;
    setText("[data-recorded-replay-audio-note]", "Audio is unlocked. Press Play to hear the bounded interpretation.");
  } catch (error) {
    setText("[data-recorded-replay-audio-note]", `Audio unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  updateButtons();
}

function play() {
  if (!state.audioConsent || !state.artifact) return;
  if (state.position >= state.artifact.events.length - 1 && !state.playing) state.position = 0;
  state.playing = true;
  playInterpretation(currentPresentation());
  render();
  scheduleNext();
}

function pause() {
  state.playing = false;
  stopTimer();
  render();
}

function reset() {
  state.playing = false;
  stopTimer();
  state.position = 0;
  render();
}

function toggleMute() {
  state.muted = !state.muted;
  if (state.audio) state.audio.output.gain.value = state.muted ? 0 : 0.18;
  setText("[data-recorded-replay-audio-note]", state.muted
    ? "Muted. Text and current replay position remain available."
    : "Unmuted. Audio remains a bounded interpretation, not incident authority.");
  updateButtons();
}

function movePosition(delta) {
  if (!state.artifact) return;
  state.playing = false;
  stopTimer();
  state.position = Math.max(0, Math.min(state.artifact.events.length - 1, state.position + delta));
  render();
}

async function loadArtifact() {
  try {
    const response = await fetch(RECORDED_REPLAY_DATA_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    state.artifact = parseRecordedReplayArtifact(await response.json());
    setText("[data-recorded-replay-incident]", `${state.artifact.incident.id} / ${state.artifact.incident.title}`);
    setText("[data-recorded-replay-source]", `${state.artifact.source.authority} / ${state.artifact.source.classification}`);
    setText("[data-recorded-replay-claims]", "Root cause, impact, and live health: unknown / not observed.");
    const sourceLink = bySelector("[data-recorded-replay-source-link]");
    if (sourceLink) sourceLink.href = state.artifact.source.reference;
    render();
  } catch (error) {
    setText("[data-recorded-replay-status]", `Recorded replay unavailable: ${error instanceof Error ? error.message : String(error)}`);
    updateButtons();
  }
}

function bind() {
  bySelector("[data-recorded-replay-start-audio]")?.addEventListener("click", startAudio);
  bySelector("[data-recorded-replay-play]")?.addEventListener("click", play);
  bySelector("[data-recorded-replay-pause]")?.addEventListener("click", pause);
  bySelector("[data-recorded-replay-reset]")?.addEventListener("click", reset);
  bySelector("[data-recorded-replay-mute]")?.addEventListener("click", toggleMute);
  bySelector("[data-recorded-replay-events]")?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      movePosition(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      movePosition(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      reset();
    } else if (event.key === "End" && state.artifact) {
      event.preventDefault();
      state.playing = false;
      stopTimer();
      state.position = state.artifact.events.length - 1;
      render();
    }
  });
  window.addEventListener("pagehide", () => {
    stopTimer();
    state.audio?.context.close();
  }, { once: true });
}

if (typeof window !== "undefined" && window.document) {
  bind();
  loadArtifact();
}
