import {
  PASS_D0_BASELINE_IDS,
  createBaselineJourney,
  createPassD0BaselineManifest,
} from "../../static/js/sonify/apu-score-trace-baselines.js?v=20260727-system-symphony-pass-d0-baselines-v1";

const root = document.querySelector("[data-trace-root]");
if (!root) throw new Error("system-symphony-pass-d0: trace root is missing");

const journeySelect = root.querySelector("[data-journey-select]");
const phraseRange = root.querySelector("[data-phrase-range]");
const currentTrace = root.querySelector("[data-current-trace]");
const traceTable = root.querySelector("[data-trace-table]");
const statusNode = root.querySelector("[data-trace-status]");
const ledgerCount = root.querySelector("[data-ledger-count]");
const exportButton = root.querySelector("[data-export-json]");

let currentJourney = null;
let currentPhraseIndex = 0;

function setMetric(name, value) {
  const node = root.querySelector(`[data-metric="${name}"]`);
  if (node) node.textContent = String(value ?? "unknown");
}

function clearNode(node) {
  while (node?.firstChild) node.removeChild(node.firstChild);
}

function titleForJourney(id) {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function harmonyLabel(entry) {
  if (!entry.harmony.length) return "not authored";
  return entry.harmony
    .map((chord) => `${chord.rootDegree ?? "?"}/${chord.quality ?? "?"}`)
    .join(" → ");
}

function appendDefinitionList(items) {
  const list = document.createElement("dl");
  for (const [term, description] of items) {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = description ?? "not authored in Pass C";
    list.append(dt, dd);
  }
  return list;
}

function renderCurrentPhrase(index) {
  if (!currentJourney) return;
  const bounded = Math.max(0, Math.min(currentJourney.entries.length - 1, Math.trunc(index) || 0));
  currentPhraseIndex = bounded;
  phraseRange.value = String(bounded);
  const entry = currentJourney.entries[bounded];

  clearNode(currentTrace);
  currentTrace.append(appendDefinitionList([
    ["Phrase", `${entry.phraseIndex} / cycle ${entry.cycleNumber}`],
    ["State", `${entry.stateTitle} (${entry.state})`],
    ["Section", entry.sectionLabel],
    ["Roles", `${entry.compositionPhase ?? "none"} / ${entry.performancePhase ?? "none"}`],
    ["Motif", `${entry.motifTransformation ?? "none"} · ${entry.motifDegrees.join(", ")}`],
    ["Harmony", harmonyLabel(entry)],
    ["Foreground", `${entry.foregroundVoice ?? "none"} → ${entry.responseVoice ?? "none"}`],
    ["Signature", entry.deterministicSignature],
  ]));

  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(entry, null, 2);
  currentTrace.append(pre);

  for (const row of traceTable.querySelectorAll("tr[data-phrase-index]")) {
    row.dataset.selected = String(Number(row.dataset.phraseIndex) === bounded);
  }
}

function cell(row, value) {
  const node = document.createElement("td");
  node.textContent = String(value ?? "none");
  row.append(node);
}

function renderLedger() {
  clearNode(traceTable);
  currentJourney.entries.forEach((entry, index) => {
    const row = document.createElement("tr");
    row.tabIndex = 0;
    row.dataset.phraseIndex = String(index);
    row.dataset.selected = String(index === currentPhraseIndex);
    row.addEventListener("click", () => renderCurrentPhrase(index));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        renderCurrentPhrase(index);
      }
    });
    cell(row, entry.phraseIndex);
    cell(row, entry.stateTitle);
    cell(row, entry.sectionLabel);
    cell(row, entry.compositionPhase);
    cell(row, entry.performancePhase);
    cell(row, entry.motifTransformation);
    cell(row, harmonyLabel(entry));
    cell(row, `${entry.bassRole ?? "none"} / ${entry.rhythmRole ?? "none"}`);
    cell(row, entry.stateTransition ? `${entry.stateTransition.from} → ${entry.stateTransition.to}` : entry.transitionIntent);
    cell(row, entry.deterministicSignature);
    traceTable.append(row);
  });
  ledgerCount.textContent = `${currentJourney.entries.length} entries`;
}

function selectJourney(id) {
  currentJourney = createBaselineJourney(id);
  currentPhraseIndex = 0;
  phraseRange.max = String(Math.max(0, currentJourney.entries.length - 1));
  setMetric("journey", titleForJourney(currentJourney.id));
  setMetric("phrases", currentJourney.phraseCount);
  setMetric("bars", currentJourney.barCount);
  setMetric("digest", currentJourney.digest);
  setMetric("base", currentJourney.baseCommit.slice(0, 12));
  setMetric("build", currentJourney.traceBuildId);
  renderLedger();
  renderCurrentPhrase(0);
  statusNode.textContent = `${titleForJourney(id)} reconstructed from deterministic Pass C authorities.`;
}

function exportCurrentJourney() {
  if (!currentJourney) return;
  const blob = new Blob([currentJourney.serialized], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${currentJourney.id}.score-trace.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

for (const id of PASS_D0_BASELINE_IDS) {
  const option = document.createElement("option");
  option.value = id;
  option.textContent = titleForJourney(id);
  journeySelect.append(option);
}

journeySelect.addEventListener("change", () => selectJourney(journeySelect.value));
phraseRange.addEventListener("input", () => renderCurrentPhrase(Number(phraseRange.value)));
exportButton.addEventListener("click", exportCurrentJourney);

const manifest = createPassD0BaselineManifest();
root.dataset.baselineDigest = manifest.digest;
root.dataset.baselineJourneys = String(manifest.journeys.length);
root.dataset.ready = "true";
document.documentElement.dataset.atlasApuPassD0 = "ready";
selectJourney(PASS_D0_BASELINE_IDS[0]);
