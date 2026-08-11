import {
  PASS_D1_BASELINE_IDS,
  createD1SongPlanJourney,
  createPassD1SongPlanManifest,
} from "../../static/js/sonify/apu-song-plan-baselines.js?v=20260727-system-symphony-pass-d1-song-plan-baselines-v1";

const root = document.querySelector("[data-song-plan-root]");
if (!root) throw new Error("system-symphony-pass-d1: song-plan root is missing");

const journeySelect = root.querySelector("[data-journey-select]");
const phraseRange = root.querySelector("[data-phrase-range]");
const currentPlan = root.querySelector("[data-current-plan]");
const planTable = root.querySelector("[data-plan-table]");
const statusNode = root.querySelector("[data-plan-status]");
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
  return id.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function appendDefinitionList(items) {
  const list = document.createElement("dl");
  for (const [term, description] of items) {
    const wrapper = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = description ?? "none";
    wrapper.append(dt, dd);
    list.append(wrapper);
  }
  return list;
}

function renderCurrentPhrase(index) {
  if (!currentJourney) return;
  const bounded = Math.max(0, Math.min(currentJourney.entries.length - 1, Math.trunc(index) || 0));
  currentPhraseIndex = bounded;
  phraseRange.value = String(bounded);
  const entry = currentJourney.entries[bounded];
  const plan = entry.songPlan;
  const memory = entry.thematicMemory;

  clearNode(currentPlan);
  currentPlan.append(appendDefinitionList([
    ["Phrase", `${plan.phraseIndex} / cycle ${plan.cycleNumber}`],
    ["State treatment", plan.themeState],
    ["Section", plan.section],
    ["Cycle role", plan.cycleRole],
    ["Phrase role", plan.phraseRole],
    ["Theme", `${plan.themeId} v${plan.themeVersion}`],
    ["Transform", plan.transform],
    ["Harmony intent", `${plan.harmonyIntent.from} → ${plan.harmonyIntent.to}`],
    ["Cadence", plan.cadenceIntent],
    ["Arp / bass / rhythm", `${plan.arpFunction} / ${plan.bassRole} / ${plan.rhythmRole}`],
    ["Foreground", `${plan.orchestrationRole.foreground} → ${plan.orchestrationRole.response ?? "none"}`],
    ["Transition", plan.transitionRole],
    ["Signature", plan.deterministicSignature],
  ]));

  const alert = document.createElement("p");
  alert.className = "song-plan-memory-alert";
  alert.dataset.resolved = String(memory.unresolvedQuestion === null);
  alert.textContent = memory.unresolvedQuestion
    ? `Unresolved question retained from phrase ${memory.unresolvedQuestion.sourcePhrase} (${memory.unresolvedQuestion.cadenceIntent}).`
    : `Memory resolved at revision ${memory.revision}; current theme state is ${memory.currentThemeState}.`;
  currentPlan.append(alert);

  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(entry, null, 2);
  currentPlan.append(pre);

  for (const row of planTable.querySelectorAll("tr[data-phrase-index]")) {
    row.dataset.selected = String(Number(row.dataset.phraseIndex) === bounded);
  }
}

function cell(row, value) {
  const node = document.createElement("td");
  node.textContent = String(value ?? "none");
  row.append(node);
}

function renderLedger() {
  clearNode(planTable);
  currentJourney.entries.forEach((entry, index) => {
    const plan = entry.songPlan;
    const memory = entry.thematicMemory;
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
    cell(row, plan.phraseIndex);
    cell(row, plan.themeState);
    cell(row, plan.section);
    cell(row, plan.cycleRole);
    cell(row, plan.phraseRole);
    cell(row, plan.transform);
    cell(row, `${plan.harmonyIntent.from} → ${plan.harmonyIntent.to}`);
    cell(row, plan.cadenceIntent);
    cell(row, `${plan.arpFunction} / ${plan.bassRole} / ${plan.rhythmRole}`);
    cell(row, memory.unresolvedQuestion ? `open @ ${memory.unresolvedQuestion.sourcePhrase}` : `resolved r${memory.revision}`);
    cell(row, entry.deterministicSignature);
    planTable.append(row);
  });
  ledgerCount.textContent = `${currentJourney.entries.length} entries`;
}

function selectJourney(id) {
  currentJourney = createD1SongPlanJourney(id);
  currentPhraseIndex = 0;
  phraseRange.max = String(Math.max(0, currentJourney.entries.length - 1));
  setMetric("journey", titleForJourney(currentJourney.id));
  setMetric("phrases", currentJourney.phraseCount);
  setMetric("bars", currentJourney.barCount);
  setMetric("digest", currentJourney.digest);
  setMetric("base", currentJourney.baseCommit.slice(0, 12));
  setMetric("build", currentJourney.buildId);
  renderLedger();
  renderCurrentPhrase(0);
  statusNode.textContent = `${titleForJourney(id)} planned from its deterministic D0 score trace.`;
}

function exportCurrentJourney() {
  if (!currentJourney) return;
  const blob = new Blob([currentJourney.serialized], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${currentJourney.id}.song-plan.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

for (const id of PASS_D1_BASELINE_IDS) {
  const option = document.createElement("option");
  option.value = id;
  option.textContent = titleForJourney(id);
  journeySelect.append(option);
}

journeySelect.addEventListener("change", () => selectJourney(journeySelect.value));
phraseRange.addEventListener("input", () => renderCurrentPhrase(Number(phraseRange.value)));
exportButton.addEventListener("click", exportCurrentJourney);

const manifest = createPassD1SongPlanManifest();
root.dataset.baselineDigest = manifest.digest;
root.dataset.baselineJourneys = String(manifest.journeys.length);
root.dataset.ready = "true";
document.documentElement.dataset.atlasApuPassD1 = "ready";
selectJourney(PASS_D1_BASELINE_IDS[0]);
