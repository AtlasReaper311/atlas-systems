"use strict";

const MODEL_URL = "/data/failure-laboratory-model.json";
const main = document.querySelector("#failure-laboratory-main");
const scenarioInputs = [...document.querySelectorAll('input[name="scenario"][data-scenario-id]')];
const stageNavLinks = [...document.querySelectorAll("[data-stage-nav-link]")];
const stageActionLinks = [...document.querySelectorAll("[data-stage-next], [data-stage-previous]")];
const stageNodes = [...document.querySelectorAll(".failure-lab-stage[data-stage-id]")];
const stageIds = new Set(stageNodes.map((stage) => stage.dataset.stageId));
let activeModel = null;

const EVIDENCE_LABELS = Object.freeze({
  measured: "Measured",
  "stale-measured": "Stale measured",
  "recorded-replay": "Recorded replay",
  simulated: "Simulated",
  unavailable: "Unavailable",
  unknown: "Unknown",
  "not-applicable-unscored": "Not applicable / unscored",
});

const RELATIONSHIP_LABELS = Object.freeze({
  direct: "Direct",
  contextual: "Contextual",
  "cross-cutting": "Cross-cutting",
  unsupported: "Unsupported",
});

function element(tagName, className, textContent) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

function appendText(parent, tagName, className, textContent) {
  const node = element(tagName, className, textContent);
  parent.appendChild(node);
  return node;
}

function evidenceBadge(mode) {
  return element("span", "failure-lab-evidence", EVIDENCE_LABELS[mode] || mode);
}

function evidenceBadgeWithMode(mode) {
  const badge = evidenceBadge(mode);
  badge.dataset.evidenceMode = mode;
  return badge;
}

function setText(selector, textContent) {
  const node = document.querySelector(selector);
  if (node) node.textContent = textContent;
  return node;
}

function clear(node) {
  node.replaceChildren();
  return node;
}

function unique(values) {
  return [...new Set(values)];
}

function normalizedPath(pathname) {
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

function isUsableModel(model) {
  if (!model || typeof model !== "object") return false;
  if (model.schema !== "atlas-systems/failure-laboratory-model/v1" || model.version !== 1) return false;
  if (model.authority?.futureRoute !== normalizedPath(window.location.pathname)) return false;
  if (model.authority?.futureRouteStatus !== "implemented") return false;
  if (!Array.isArray(model.instruments) || !Array.isArray(model.scenarios)) return false;
  if (!Array.isArray(model.journey?.sequence) || !Array.isArray(model.journey?.stages)) return false;
  if (model.journey.sequence.length !== model.journey.stages.length) return false;
  if (model.scenarios.length !== scenarioInputs.length) return false;
  const scenarioIds = new Set(model.scenarios.map((scenario) => scenario.id));
  const stageIds = new Set(model.journey.sequence);
  const instrumentIds = new Set(model.instruments.map((instrument) => instrument.id));
  if (scenarioIds.size !== model.scenarios.length || stageIds.size !== model.journey.sequence.length) return false;
  if (scenarioInputs.some((input) => !scenarioIds.has(input.dataset.scenarioId))) return false;
  return model.journey.stages.every((stage) => stageIds.has(stage.id)
    && stage.instrumentAssociations.every((association) => instrumentIds.has(association.instrumentId)));
}

function modelScenario(model, scenarioId) {
  return model.scenarios.find((scenario) => scenario.id === scenarioId) || model.scenarios[0];
}

function scenarioIdFromUrl(model) {
  const requested = new URL(window.location.href).searchParams.get("scenario");
  const scenario = model.scenarios.find((candidate) => candidate.id === requested);
  if (requested && !scenario) {
    const url = new URL(window.location.href);
    url.searchParams.delete("scenario");
    window.history.replaceState(null, "", url);
  }
  return scenario?.id || model.scenarios[0]?.id;
}

function updateUrl(scenarioId, push = true) {
  const url = new URL(window.location.href);
  url.searchParams.set("scenario", scenarioId);
  const state = { ...(window.history.state || {}), scenario: scenarioId };
  if (push) window.history.pushState(state, "", url);
  else window.history.replaceState(state, "", url);
}

function updateScenarioControls(model, scenario) {
  const scenarioMap = new Map(model.scenarios.map((candidate) => [candidate.id, candidate]));
  for (const input of scenarioInputs) {
    const candidate = scenarioMap.get(input.dataset.scenarioId);
    if (!candidate) continue;
    input.checked = candidate.id === scenario.id;
    const label = input.closest("label");
    const title = label?.querySelector("strong");
    const description = label?.querySelector("small");
    if (title) title.textContent = candidate.label;
    if (description) description.textContent = candidate.question;
  }
}

function renderScenarioBoundary(scenario) {
  const list = clear(document.querySelector("#selected-scenario-boundary"));
  for (const claim of scenario.interpretationBoundary.neverMeans) appendText(list, "li", "", claim);
}

function createEvidenceList(modes) {
  const list = element("div", "failure-lab-evidence-list");
  for (const mode of modes) list.appendChild(evidenceBadgeWithMode(mode));
  return list;
}

function createReadingCard(model, relationship, instrument, stageAssociation) {
  const card = element("article", "failure-lab-reading");
  card.dataset.instrumentId = instrument.id;
  card.dataset.supportType = relationship.supportType;

  const header = element("header");
  const identity = element("div");
  appendText(identity, "p", "failure-lab-reading-type", `${RELATIONSHIP_LABELS[relationship.supportType]} / ${instrument.phaseRole}`);
  appendText(identity, "h4", "", instrument.label);
  header.appendChild(identity);
  header.appendChild(createEvidenceList(relationship.evidenceModes));
  card.appendChild(header);

  appendText(card, "p", "failure-lab-reading-question", instrument.question);

  const readingNames = unique(relationship.readings.map((reading) => reading.nativeScenario));
  const sourceTypes = unique(relationship.readings.map((reading) => reading.sourceType));
  const demonstrations = unique(relationship.readings.map((reading) => reading.demonstrates));
  const demonstrates = element("p", "failure-lab-reading-demonstrates");
  appendText(demonstrates, "strong", "", "It demonstrates");
  appendText(demonstrates, "span", "", demonstrations.join(" "));
  card.appendChild(demonstrates);

  const details = element("details", "failure-lab-more-details");
  appendText(details, "summary", "", "More evidence detail +");
  const facts = element("dl", "failure-lab-reading-facts");
  const factRows = [
    ["NATIVE SCENARIO", readingNames.join(" · ")],
    ["EVIDENCE SOURCE", sourceTypes.join(" · ")],
  ];
  for (const [label, value] of factRows) {
    const row = element("div");
    appendText(row, "dt", "", label);
    appendText(row, "dd", "", value);
    facts.appendChild(row);
  }
  details.appendChild(facts);
  appendText(details, "p", "failure-lab-detail-label", "What it does not prove");

  const proof = element("div", "failure-lab-proof");
  appendText(proof, "strong", "", "Proof boundary");
  appendText(proof, "p", "", relationship.proofBoundary);
  card.appendChild(proof);

  const nonClaims = unique([
    ...instrument.nonClaims,
    ...relationship.nonClaims,
    ...relationship.readings.flatMap((reading) => reading.doesNotProve),
  ]);
  const list = element("ul");
  for (const claim of nonClaims) appendText(list, "li", "", claim);
  details.appendChild(list);
  card.appendChild(details);

  const link = element("a", "failure-lab-reading-link");
  link.href = instrument.canonical.route;
  link.append(element("span", "", `Open ${instrument.label} `), element("span", "", "→"));
  link.lastChild.setAttribute("aria-hidden", "true");
  card.appendChild(link);

  if (stageAssociation?.required) card.dataset.stageAnchor = "true";
  return card;
}

function createUnmappedStage(scenario, stage) {
  const block = element("div", "failure-lab-unmapped-stage");
  block.dataset.supportType = "unsupported";
  block.appendChild(evidenceBadgeWithMode("not-applicable-unscored"));
  appendText(block, "h4", "", `No ${scenario.label.toLowerCase()} relationship is mapped here.`);
  appendText(block, "p", "", `The shared model does not assign a supported instrument relationship to the ${stage.label.toLowerCase()} question for this scenario. The gap remains explicit; no vaguely similar instrument is substituted.`);
  appendText(block, "p", "failure-lab-proof-copy", "Not applicable / unscored is a relationship boundary, not a health result or a zero score.");
  return block;
}

function createRecoveryGap(gap) {
  const block = element("div", "failure-lab-recovery-gap");
  block.dataset.recoveryGap = gap.status;
  block.appendChild(element("span", "failure-lab-gap-flag", "EVIDENCE GAP / INTENTIONAL"));
  block.appendChild(element("span", "failure-lab-context-badge", "NO SINGLE AUTHORITY"));
  appendText(block, "h4", "", gap.summary);
  appendText(block, "p", "", gap.nonClaim);
  const details = element("details", "failure-lab-more-details");
  appendText(details, "summary", "", "More evidence detail +");
  appendText(details, "p", "", `Allowed readings: ${gap.allowedEvidenceModes.map((mode) => EVIDENCE_LABELS[mode] || mode).join(", ")}.`);
  block.appendChild(details);
  return block;
}

function renderStages(model, scenario) {
  const instrumentMap = new Map(model.instruments.map((instrument) => [instrument.id, instrument]));
  const relationshipMap = new Map(scenario.relationships.map((relationship) => [relationship.instrumentId, relationship]));

  for (const stage of model.journey.stages) {
    const stageNode = document.querySelector(`[data-stage-id="${CSS.escape(stage.id)}"]`);
    const content = stageNode?.querySelector("[data-stage-content]");
    if (!stageNode || !content) continue;
    const heading = stageNode.querySelector("h3");
    const index = stageNode.querySelector(".failure-lab-stage-index");
    if (heading) heading.textContent = stage.question;
    if (index) index.textContent = stage.label;

    const associations = stage.instrumentAssociations;
    const readings = [];
    for (const association of associations) {
      const relationship = relationshipMap.get(association.instrumentId);
      const instrument = instrumentMap.get(association.instrumentId);
      if (!relationship || !instrument || relationship.supportType === "unsupported") continue;
      if (!relationship.stageIds.includes(stage.id)) continue;
      readings.push(createReadingCard(model, relationship, instrument, association));
    }
    if (stage.id === "recovery" && stage.evidenceGap) readings.unshift(createRecoveryGap(stage.evidenceGap));
    if (!readings.length) readings.push(createUnmappedStage(scenario, stage));
    content.replaceChildren(...readings);
  }
}

function createSupportingCard(relationship, instrument) {
  const card = element("article", "failure-lab-supporting-reading");
  card.dataset.instrumentId = instrument.id;
  card.dataset.supportType = relationship.supportType;
  const header = element("header");
  const identity = element("div");
  appendText(identity, "p", "failure-lab-reading-type", `${RELATIONSHIP_LABELS[relationship.supportType]} / OPTIONAL`);
  appendText(identity, "h3", "", instrument.label);
  header.appendChild(identity);
  header.appendChild(createEvidenceList(relationship.evidenceModes));
  card.appendChild(header);

  const readings = relationship.readings.map((reading) => `${EVIDENCE_LABELS[reading.evidenceMode] || reading.evidenceMode}: ${reading.demonstrates}`);
  appendText(card, "p", "", readings.join(" "));
  appendText(card, "p", "failure-lab-proof-copy", relationship.proofBoundary);
  const details = element("details", "failure-lab-more-details");
  appendText(details, "summary", "", "More evidence detail +");
  const list = element("ul");
  for (const claim of unique([
    ...instrument.nonClaims,
    ...relationship.nonClaims,
    ...relationship.readings.flatMap((reading) => reading.doesNotProve),
  ])) appendText(list, "li", "", claim);
  details.appendChild(list);
  card.appendChild(details);

  const link = element("a", "failure-lab-reading-link");
  link.href = instrument.canonical.route;
  link.append(element("span", "", `Open ${instrument.label} `), element("span", "", "→"));
  link.lastChild.setAttribute("aria-hidden", "true");
  card.appendChild(link);
  return card;
}

function renderSupporting(model, scenario) {
  const target = clear(document.querySelector("#cross-cutting-content"));
  const instrumentMap = new Map(model.instruments.map((instrument) => [instrument.id, instrument]));
  const relationships = scenario.relationships.filter((relationship) => relationship.supportType !== "unsupported" && relationship.stageIds.length === 0);
  for (const relationship of relationships) {
    const instrument = instrumentMap.get(relationship.instrumentId);
    if (instrument) target.appendChild(createSupportingCard(relationship, instrument));
  }
  if (!relationships.length) {
    const empty = element("div", "failure-lab-unmapped-stage");
    empty.appendChild(evidenceBadgeWithMode("not-applicable-unscored"));
    appendText(empty, "h3", "", `No optional interpretation relationship is mapped for ${scenario.label}.`);
    appendText(empty, "p", "", "The model keeps this scenario focused on its supported stage relationships.");
    target.appendChild(empty);
  }
}

function renderUnsupported(model, scenario) {
  const target = clear(document.querySelector("#unsupported-content"));
  const instrumentMap = new Map(model.instruments.map((instrument) => [instrument.id, instrument]));
  for (const relationship of scenario.relationships.filter((candidate) => candidate.supportType === "unsupported")) {
    const instrument = instrumentMap.get(relationship.instrumentId);
    if (!instrument) continue;
    const item = element("article", "failure-lab-unmapped-item");
    item.dataset.instrumentId = instrument.id;
    const heading = element("div");
    const title = appendText(heading, "h3", "", instrument.label);
    title.insertAdjacentElement("afterend", evidenceBadgeWithMode("not-applicable-unscored"));
    item.appendChild(heading);
    appendText(item, "p", "", relationship.unsupportedReason || relationship.proofBoundary);
    appendText(item, "p", "failure-lab-proof-copy", relationship.proofBoundary);
    const details = element("details", "failure-lab-more-details");
    appendText(details, "summary", "", "More evidence detail +");
    const list = element("ul");
    for (const claim of unique([...instrument.nonClaims, ...relationship.nonClaims])) appendText(list, "li", "", claim);
    details.appendChild(list);
    item.appendChild(details);
    target.appendChild(item);
  }
  if (!target.children.length) {
    const empty = element("p", "failure-lab-proof-copy", "The selected scenario has no unsupported relationship rows.");
    target.appendChild(empty);
  }
}

function renderNarratives(model) {
  const target = clear(document.querySelector("#narrative-content"));
  const stageMap = new Map(model.journey.stages.map((stage) => [stage.id, stage]));
  const scenarioMap = new Map(model.scenarios.map((scenario) => [scenario.id, scenario]));
  const instrumentMap = new Map(model.instruments.map((instrument) => [instrument.id, instrument]));
  for (const narrative of model.narratives) {
    const article = element("article", "failure-lab-path");
    appendText(article, "h3", "", narrative.label);
    appendText(article, "p", "", narrative.description);
    const steps = element("ol");
    for (const step of narrative.steps) {
      const stage = stageMap.get(step.stageId);
      const scenario = scenarioMap.get(step.scenarioId);
      const instrument = instrumentMap.get(step.instrumentId);
      appendText(steps, "li", "", `${stage?.label || step.stageId} / ${scenario?.label || step.scenarioId} / ${instrument?.label || step.instrumentId}`);
    }
    article.appendChild(steps);
    const omitted = narrative.omittedStageIds.map((stageId) => stageMap.get(stageId)?.label || stageId);
    appendText(article, "p", "failure-lab-omitted", `Omitted stages: ${omitted.join(", ")}. ${narrative.omissionReason}`);
    target.appendChild(article);
  }
}

function stageIdFromHash() {
  if (!window.location.hash.startsWith("#stage-")) return null;
  const stageId = window.location.hash.slice("#stage-".length);
  return stageIds.has(stageId) ? stageId : null;
}

function stageIdFromLink(link) {
  const href = link.getAttribute("href") || "";
  if (!href.startsWith("#stage-")) return null;
  const stageId = href.slice("#stage-".length);
  return stageIds.has(stageId) ? stageId : null;
}

function currentScenarioId() {
  return main?.dataset.selectedScenario
    || scenarioInputs.find((input) => input.checked)?.dataset.scenarioId
    || null;
}

function updateStageNavigation(stageId) {
  for (const link of stageNavLinks) {
    const active = stageIdFromLink(link) === stageId;
    if (active) link.setAttribute("aria-current", "step");
    else link.removeAttribute("aria-current");
    link.closest("[data-stage-nav-item]")?.toggleAttribute("data-active", active);
  }
}

function writeStageUrl(stageId, historyMethod) {
  const url = new URL(window.location.href);
  url.hash = `stage-${stageId}`;
  const state = { ...(window.history.state || {}), scenario: currentScenarioId(), stage: stageId };
  window.history[historyMethod](state, "", url);
}

function setActiveStage(stageId, { historyMethod = null, focus = false } = {}) {
  if (!stageIds.has(stageId)) return false;
  for (const stage of stageNodes) {
    stage.toggleAttribute("data-active-stage", stage.dataset.stageId === stageId);
  }
  updateStageNavigation(stageId);
  if (main) main.dataset.activeStage = stageId;
  if (historyMethod) writeStageUrl(stageId, historyMethod);
  if (focus) {
    const stage = stageNodes.find((candidate) => candidate.dataset.stageId === stageId);
    const heading = stage?.querySelector("h3");
    stage?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
    window.requestAnimationFrame(() => heading?.focus({ preventScroll: true }));
  }
  return true;
}

function syncStageFromLocation({ focus = false } = {}) {
  const stageId = stageIdFromHash();
  if (window.location.hash.startsWith("#stage-") && !stageId) {
    setActiveStage("request", { historyMethod: "replaceState", focus });
    return;
  }
  if (stageId) setActiveStage(stageId, { focus });
}

function installStageNavigation() {
  if (!main || !stageNavLinks.length || !stageNodes.length) return;
  for (const link of [...stageNavLinks, ...stageActionLinks]) {
    link.addEventListener("click", (event) => {
      const stageId = stageIdFromLink(link);
      if (!stageId) return;
      event.preventDefault();
      setActiveStage(stageId, { historyMethod: "pushState", focus: true });
    });
  }
  window.addEventListener("hashchange", () => {
    syncStageFromLocation({ focus: true });
  });
  window.addEventListener("popstate", () => {
    syncStageFromLocation({ focus: true });
    if (activeModel) renderModel(activeModel, scenarioIdFromUrl(activeModel));
  });
  const initialStage = stageIdFromHash();
  const invalidStageHash = window.location.hash.startsWith("#stage-") && !initialStage;
  setActiveStage(initialStage || "request", {
    historyMethod: invalidStageHash || !window.location.hash ? "replaceState" : null,
  });
  main.dataset.stageEnhanced = "true";
}

function renderModel(model, scenarioId, updateUrlState = false) {
  const scenario = modelScenario(model, scenarioId);
  if (!scenario) return;
  if (updateUrlState) updateUrl(scenario.id);
  activeModel = model;
  updateScenarioControls(model, scenario);
  setText("#selected-scenario-label", scenario.label);
  setText("#selected-scenario-question", scenario.question);
  setText("#hero-selected-scenario", scenario.label);
  setText("#journey-scenario-label", scenario.label);
  setText("#journey-status", "Model-approved relationships only. No instrument has been executed by this corridor.");
  renderScenarioBoundary(scenario);
  renderStages(model, scenario);
  renderSupporting(model, scenario);
  renderUnsupported(model, scenario);
  renderNarratives(model);
  main.dataset.modelState = "ready";
  main.dataset.selectedScenario = scenario.id;
}

function installSelection(model) {
  for (const input of scenarioInputs) {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      if (!activeModel) return;
      renderModel(model, input.dataset.scenarioId, true);
    });
  }
}

async function loadModel() {
  if (!main || !scenarioInputs.length) return;
  main.dataset.modelState = "loading";
  try {
    const response = await fetch(MODEL_URL, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const model = await response.json();
    if (!isUsableModel(model)) throw new Error("model does not match the route shell");
    installSelection(model);
    renderModel(model, scenarioIdFromUrl(model));
  } catch {
    main.dataset.modelState = "unavailable";
    setText("#journey-status", "The shared model is unavailable; the static Normal operation reading remains available.");
  }
}

installStageNavigation();
if (main) void loadModel();

export {
  EVIDENCE_LABELS,
  RELATIONSHIP_LABELS,
  isUsableModel,
  modelScenario,
};
