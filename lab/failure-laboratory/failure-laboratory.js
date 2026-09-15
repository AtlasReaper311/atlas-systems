"use strict";

const MODEL_URL = "/data/failure-laboratory-model.json";
const DEFAULT_SCENARIO_ID = "latency-creep";

const main = document.querySelector("#failure-laboratory-main");
const scenarioInputs = [...document.querySelectorAll('input[name="scenario"][data-scenario-id]')];
const stageNavLinks = [...document.querySelectorAll("[data-stage-nav-link]")];
const stageNavItems = [...document.querySelectorAll("[data-stage-nav-item]")];
const stageActionLinks = [...document.querySelectorAll("[data-stage-next], [data-stage-previous]")];
const stageNodes = [...document.querySelectorAll(".failure-trace-stage[data-stage-id]")];
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

function element(tagName, className = "", textContent) {
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

function clear(node) {
  node?.replaceChildren();
  return node;
}

function unique(values) {
  return [...new Set(values)];
}

function displayInstrumentLabel(label) {
  return label === "System SYMPHONY" ? "System Symphony" : label;
}

function evidenceBadge(mode) {
  const badge = element("span", "failure-trace-evidence", EVIDENCE_LABELS[mode] || mode);
  badge.dataset.evidenceMode = mode;
  return badge;
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
  const modelStageIds = new Set(model.journey.sequence);
  const instrumentIds = new Set(model.instruments.map((instrument) => instrument.id));

  if (!scenarioIds.has(DEFAULT_SCENARIO_ID)) return false;
  if (scenarioInputs.some((input) => !scenarioIds.has(input.dataset.scenarioId))) return false;

  return model.journey.stages.every((stage) =>
    modelStageIds.has(stage.id)
    && stage.instrumentAssociations.every((association) => instrumentIds.has(association.instrumentId))
  );
}

function modelScenario(model, scenarioId) {
  return model.scenarios.find((scenario) => scenario.id === scenarioId)
    || model.scenarios.find((scenario) => scenario.id === DEFAULT_SCENARIO_ID)
    || model.scenarios[0];
}

function scenarioIdFromUrl(model) {
  const url = new URL(window.location.href);
  const requested = url.searchParams.get("scenario");

  if (!requested) return DEFAULT_SCENARIO_ID;

  const scenario = model.scenarios.find((candidate) => candidate.id === requested);
  if (scenario) return scenario.id;

  url.searchParams.delete("scenario");
  window.history.replaceState(window.history.state, "", url);
  return DEFAULT_SCENARIO_ID;
}

function currentScenarioId() {
  return scenarioInputs.find((input) => input.checked)?.dataset.scenarioId || DEFAULT_SCENARIO_ID;
}

function writeScenarioUrl(scenarioId, historyMethod = "pushState") {
  const url = new URL(window.location.href);
  if (scenarioId === DEFAULT_SCENARIO_ID) url.searchParams.delete("scenario");
  else url.searchParams.set("scenario", scenarioId);

  const state = { ...(window.history.state || {}), scenario: scenarioId };
  window.history[historyMethod](state, "", url);
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

function writeStageUrl(stageId, historyMethod = "pushState") {
  const url = new URL(window.location.href);
  if (stageId === "request") url.hash = "";
  else url.hash = `stage-${stageId}`;

  const state = {
    ...(window.history.state || {}),
    scenario: currentScenarioId(),
    stage: stageId,
  };

  window.history[historyMethod](state, "", url);
}

function updateStageNavigation(stageId) {
  for (const link of stageNavLinks) {
    const active = stageIdFromLink(link) === stageId;
    if (active) link.setAttribute("aria-current", "step");
    else link.removeAttribute("aria-current");
  }
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
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    stage?.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
    window.requestAnimationFrame(() => heading?.focus({ preventScroll: true }));
  }

  return true;
}

function syncStageFromLocation({ focus = false } = {}) {
  const explicitStage = stageIdFromHash();

  if (window.location.hash.startsWith("#stage-") && !explicitStage) {
    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState(window.history.state, "", url);
    setActiveStage("request", { focus });
    return;
  }

  setActiveStage(explicitStage || "request", { focus });
}

function updateScenarioControls(model, scenario) {
  const scenarioMap = new Map(model.scenarios.map((candidate) => [candidate.id, candidate]));

  for (const input of scenarioInputs) {
    const candidate = scenarioMap.get(input.dataset.scenarioId);
    if (!candidate) continue;
    input.checked = candidate.id === scenario.id;

    const label = input.closest("label")?.querySelector("span");
    if (label) label.textContent = candidate.label;
  }
}

function renderScenarioSummary(scenario) {
  const label = document.querySelector("#selected-scenario-label");
  const stickyLabel = document.querySelector("#sticky-scenario-label");
  const question = document.querySelector("#selected-scenario-question");
  const boundary = clear(document.querySelector("#selected-scenario-boundary"));

  if (label) label.textContent = scenario.label;
  if (stickyLabel) stickyLabel.textContent = scenario.label;
  if (question) question.textContent = scenario.question;

  for (const claim of scenario.interpretationBoundary?.neverMeans || []) {
    appendText(boundary, "li", "", claim);
  }
}

function createReadingFacts(relationship) {
  const readings = relationship.readings || [];
  const nativeScenarios = unique(readings.map((reading) => reading.nativeScenario).filter(Boolean));
  const sourceTypes = unique(readings.map((reading) => reading.sourceType).filter(Boolean));
  if (!nativeScenarios.length && !sourceTypes.length) return null;

  const facts = element("dl", "failure-trace-reading-facts");
  const rows = [
    ["Native scenario", nativeScenarios.join(" · ")],
    ["Evidence source", sourceTypes.join(" · ")],
  ].filter(([, value]) => value);

  for (const [term, value] of rows) {
    const row = element("div");
    appendText(row, "dt", "", term);
    appendText(row, "dd", "", value);
    facts.appendChild(row);
  }

  return facts;
}

function createReading(relationship, instrument, stage) {
  const article = element("article", "failure-trace-reading");
  article.dataset.instrumentId = instrument.id;
  article.dataset.supportType = relationship.supportType;

  const heading = element("div", "failure-trace-reading-heading");
  const identity = element("div");
  appendText(identity, "p", "failure-trace-reading-type", `${RELATIONSHIP_LABELS[relationship.supportType] || relationship.supportType} / ${stage.label}`);
  appendText(identity, "h4", "", displayInstrumentLabel(instrument.label));
  heading.appendChild(identity);

  const evidenceModes = unique(relationship.evidenceModes || []);
  if (evidenceModes.length) {
    const badges = element("div", "failure-trace-evidence-list");
    evidenceModes.forEach((mode) => badges.appendChild(evidenceBadge(mode)));
    heading.appendChild(badges);
  }

  article.appendChild(heading);

  const demonstrations = unique((relationship.readings || []).map((reading) => reading.demonstrates).filter(Boolean));
  appendText(article, "p", "failure-trace-demonstrates", demonstrations.join(" ") || instrument.question);

  const proof = element("div", "failure-trace-proof");
  appendText(proof, "strong", "", "Proof boundary");
  appendText(proof, "p", "", relationship.proofBoundary || instrument.proofBoundary);
  article.appendChild(proof);

  const nonClaims = unique([
    ...(instrument.nonClaims || []),
    ...(relationship.nonClaims || []),
    ...(relationship.readings || []).flatMap((reading) => reading.doesNotProve || []),
  ]);
  const facts = createReadingFacts(relationship);

  if (facts || nonClaims.length) {
    const details = element("details", "failure-trace-reading-details");
    appendText(details, "summary", "", "Evidence detail");
    if (facts) details.appendChild(facts);
    if (nonClaims.length) {
      appendText(details, "p", "failure-trace-detail-label", "Does not prove");
      const list = element("ul");
      nonClaims.forEach((claim) => appendText(list, "li", "", claim));
      details.appendChild(list);
    }
    article.appendChild(details);
  }

  const link = element("a", "failure-trace-reading-link");
  link.href = instrument.canonical.route;
  link.append(document.createTextNode(`Open ${displayInstrumentLabel(instrument.label)} `), element("span", "", "↗"));
  link.lastChild.setAttribute("aria-hidden", "true");
  article.appendChild(link);

  return article;
}

function createUnmappedStage(scenario, stage) {
  const block = element("div", "failure-trace-unmapped");
  block.appendChild(evidenceBadge("not-applicable-unscored"));
  appendText(block, "h4", "", `No supported ${stage.label.toLowerCase()} relationship is mapped for ${scenario.label}.`);
  appendText(block, "p", "", "The model leaves this stage open rather than substituting a loosely related instrument.");
  return block;
}

function createRecoveryGap(gap) {
  const block = element("div", "failure-trace-recovery-gap");
  const mark = element("span", "failure-trace-gap-mark");
  mark.setAttribute("aria-hidden", "true");

  const copy = element("div");
  appendText(copy, "p", "failure-trace-reading-type", "EVIDENCE GAP / INTENTIONAL");
  appendText(copy, "h4", "", gap.summary);
  appendText(copy, "p", "", gap.nonClaim);

  block.append(mark, copy);
  return block;
}

function relationshipSupportsStage(relationship, stageId) {
  if (!relationship || relationship.supportType === "unsupported" || relationship.supportType === "cross-cutting") return false;
  return relationship.stageIds.includes(stageId);
}

function renderStageRail(model, scenario) {
  const relationshipMap = new Map(scenario.relationships.map((relationship) => [relationship.instrumentId, relationship]));
  const stageMap = new Map(model.journey.stages.map((stage) => [stage.id, stage]));

  for (const item of stageNavItems) {
    const link = item.querySelector("[data-stage-nav-link]");
    const stageId = link ? stageIdFromLink(link) : null;
    const stage = stageMap.get(stageId);
    if (!stage) continue;

    const supported = stage.instrumentAssociations.some((association) =>
      relationshipSupportsStage(relationshipMap.get(association.instrumentId), stage.id)
    );

    const supportState = stage.id === "recovery" && stage.evidenceGap
      ? "gap"
      : supported ? "supported" : "unmapped";

    item.dataset.stageSupport = supportState;
  }
}

function renderStages(model, scenario) {
  const instrumentMap = new Map(model.instruments.map((instrument) => [instrument.id, instrument]));
  const relationshipMap = new Map(scenario.relationships.map((relationship) => [relationship.instrumentId, relationship]));

  for (const stage of model.journey.stages) {
    const stageNode = document.querySelector(`[data-stage-id="${CSS.escape(stage.id)}"]`);
    const content = stageNode?.querySelector(`[data-stage-content="${CSS.escape(stage.id)}"]`);
    const heading = stageNode?.querySelector(".failure-trace-stage-header h3");
    if (!stageNode || !content) continue;

    if (heading) heading.textContent = stage.question;
    const readings = [];

    for (const association of stage.instrumentAssociations) {
      const relationship = relationshipMap.get(association.instrumentId);
      const instrument = instrumentMap.get(association.instrumentId);
      if (!relationship || !instrument) continue;
      if (relationship.supportType === "unsupported" || relationship.supportType === "cross-cutting") continue;
      if (!relationship.stageIds.includes(stage.id)) continue;
      readings.push(createReading(relationship, instrument, stage));
    }

    if (stage.id === "recovery" && stage.evidenceGap) readings.unshift(createRecoveryGap(stage.evidenceGap));
    if (!readings.length) readings.push(createUnmappedStage(scenario, stage));
    content.replaceChildren(...readings);
  }
}

function renderOptional(model, scenario) {
  const instrumentMap = new Map(model.instruments.map((instrument) => [instrument.id, instrument]));

  for (const instrumentId of ["spectral-forge", "system-symphony"]) {
    const relationship = scenario.relationships.find((candidate) => candidate.instrumentId === instrumentId && candidate.supportType === "cross-cutting");
    const instrument = instrumentMap.get(instrumentId);
    const target = document.querySelector(`#${CSS.escape(instrumentId)}-summary`);
    if (!target || !instrument) continue;

    const demonstrations = unique((relationship?.readings || []).map((reading) => reading.demonstrates).filter(Boolean));
    target.textContent = demonstrations[0] || (instrumentId === "spectral-forge" ? "Synthetic telemetry interpretation" : "Source-aware telemetry sonification");
  }
}

function renderUnsupportedReference(model, scenario) {
  const target = clear(document.querySelector("#unsupported-content"));
  if (!target) return;

  const instrumentMap = new Map(model.instruments.map((instrument) => [instrument.id, instrument]));
  const unsupported = scenario.relationships.filter((relationship) => relationship.supportType === "unsupported");

  if (!unsupported.length) {
    appendText(target, "p", "failure-trace-reference-empty", `No explicitly unsupported instrument relationships are recorded for ${scenario.label}. Unmapped stages still remain visible in the investigation rail.`);
    return;
  }

  for (const relationship of unsupported) {
    const instrument = instrumentMap.get(relationship.instrumentId);
    if (!instrument) continue;

    const article = element("article", "failure-trace-unsupported-item");
    const heading = element("div", "failure-trace-unsupported-heading");
    appendText(heading, "h3", "", displayInstrumentLabel(instrument.label));
    heading.appendChild(evidenceBadge("not-applicable-unscored"));
    article.appendChild(heading);

    appendText(article, "p", "", relationship.unsupportedReason || relationship.proofBoundary || "The shared model does not define a supported relationship for this scenario.");
    if (relationship.proofBoundary && relationship.proofBoundary !== relationship.unsupportedReason) {
      appendText(article, "p", "failure-trace-unsupported-proof", relationship.proofBoundary);
    }
    target.appendChild(article);
  }
}

function renderModel(model, scenarioId, { updateHistory = false } = {}) {
  const scenario = modelScenario(model, scenarioId);
  updateScenarioControls(model, scenario);
  renderScenarioSummary(scenario);
  renderStageRail(model, scenario);
  renderStages(model, scenario);
  renderOptional(model, scenario);
  renderUnsupportedReference(model, scenario);
  if (updateHistory) writeScenarioUrl(scenario.id);
  main.dataset.modelState = "ready";
  main.dataset.selectedScenario = scenario.id;
}

function installInteractions(model) {
  for (const input of scenarioInputs) {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      renderModel(model, input.dataset.scenarioId, { updateHistory: true });
      setActiveStage("request", { historyMethod: "replaceState", focus: false });
    });
  }

  for (const link of [...stageNavLinks, ...stageActionLinks]) {
    link.addEventListener("click", (event) => {
      const stageId = stageIdFromLink(link);
      if (!stageId) return;
      event.preventDefault();
      setActiveStage(stageId, { historyMethod: "pushState", focus: true });
    });
  }

  window.addEventListener("hashchange", () => syncStageFromLocation({ focus: true }));
  window.addEventListener("popstate", () => {
    syncStageFromLocation({ focus: false });
    if (activeModel) renderModel(activeModel, scenarioIdFromUrl(activeModel));
  });

  const initialStage = stageIdFromHash();
  setActiveStage(initialStage || "request", { focus: false });
  main.dataset.stageEnhanced = "true";
}

async function init() {
  if (!main) return;

  try {
    const response = await fetch(MODEL_URL, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const model = await response.json();
    if (!isUsableModel(model)) throw new Error("model does not match the route shell");

    activeModel = model;
    installInteractions(model);
    renderModel(model, scenarioIdFromUrl(model));
    syncStageFromLocation();
  } catch {
    main.dataset.modelState = "unavailable";
  }
}

void init();
