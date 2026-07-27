import { subscribe as subscribeRegistry } from "./atlas-registry.js?v=20260720-esm-live";

const TOPOLOGY_URL = "https://api.atlas-systems.uk/v1/topology";
const DEPLOY_URL = "https://api.atlas-systems.uk/deploy-watch/latest";
const HOMEPAGE_FIELD_CSS = "/css/home-v2-base.css?v=20260727-atlas-field-production-v2";
const HOMEPAGE_FIELD_MODULE = "/static/js/atlas-field.js?v=20260727-atlas-field-production-v2";
const POLL_MS = 60_000;

const state = {
  topology: null,
  registry: null,
  deploy: null,
  timer: null,
};

function setStateText(id, text, semanticState = "available") {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = text;
  element.dataset.state = semanticState;
}

function ensureHomepageFieldStyles() {
  if (document.head.querySelector('link[data-atlas-home-field="styles"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = HOMEPAGE_FIELD_CSS;
  link.dataset.atlasHomeField = "styles";
  document.head.appendChild(link);
}

async function initHomepageFieldFallback() {
  const hero = document.querySelector(".hero");
  if (!hero) return;

  const existing = hero.querySelector(":scope > canvas.atlas-field-canvas");
  if (existing) {
    hero.dataset.atlasFieldState = "ready";
    return;
  }

  ensureHomepageFieldStyles();

  try {
    const { createAtlasField } = await import(HOMEPAGE_FIELD_MODULE);
    const controller = createAtlasField(hero, { preset: "hero" });
    hero.dataset.atlasFieldState = controller ? "ready" : "unavailable";
  } catch (error) {
    hero.dataset.atlasFieldState = "unavailable";
    console.warn("AtlasField fallback could not initialise", error);
  }
}

function declaredWorkers() {
  const components = Array.isArray(state.topology?.components)
    ? state.topology.components
    : [];
  return components.filter(
    (component) => component?.kind === "worker" && component.source_only !== true,
  );
}

function coverage() {
  const declared = declaredWorkers();
  const declaredIds = new Set(declared.map((component) => component.id));
  const hasDeclaredTopology = declared.length > 0;
  const observed = Array.isArray(state.registry?.workers)
    ? state.registry.workers.filter(
        (worker) => !hasDeclaredTopology || declaredIds.has(worker.name),
      )
    : [];
  const observedIds = new Set(observed.map((worker) => worker.name));
  const documented = observed.filter((worker) => worker.documented);
  const missing = declared
    .filter((component) => !observedIds.has(component.id))
    .map((component) => component.id)
    .sort();

  return {
    declared: hasDeclaredTopology ? declared.length : state.registry?.counts?.workers || 0,
    observed: hasDeclaredTopology ? observed.length : state.registry?.counts?.workers || 0,
    documented: hasDeclaredTopology ? documented.length : state.registry?.counts?.documented || 0,
    workers: observed,
    missing,
  };
}

function workerState(name) {
  const worker = coverage().workers.find((candidate) => candidate.name === name);
  if (!worker) {
    return { text: "not observed by registry", state: "warning" };
  }
  if (!worker.documented) {
    return { text: "observed · metadata missing", state: "warning" };
  }
  return { text: "observed · metadata live", state: "ok" };
}

function renderCoverage() {
  const current = coverage();
  const complete = current.declared > 0 && current.observed === current.declared;
  const semanticState = complete ? "ok" : "warning";
  const missingText = current.missing.length > 0
    ? `Not observed: ${current.missing.join(", ")}`
    : "All declared Workers are observed.";

  setStateText("evidence-declared", current.declared > 0 ? String(current.declared) : "—", "available");

  setStateText("evidence-observed", current.declared > 0 ? String(current.observed) : "—", semanticState);
  const observedElement = document.getElementById("evidence-observed");
  if (observedElement) observedElement.title = missingText;

  setStateText("evidence-documented", current.declared > 0 ? String(current.documented) : "—", semanticState);

  setStateText(
    "ops-registry-value",
    current.declared > 0 ? `${current.observed}/${current.declared} observed` : "registry unavailable",
    semanticState,
  );
  setStateText(
    "map-preview-state",
    current.declared > 0 ? `${current.observed}/${current.declared} components observed` : "architecture unavailable",
    semanticState,
  );

  const blackbox = workerState("atlas-blackbox");
  const ramone = workerState("ramone-edge");
  setStateText("ops-blackbox-value", blackbox.text, blackbox.state);
  setStateText("ops-ramone-value", ramone.text, ramone.state);

  const strip = document.getElementById("truth-strip");
  const stripText = document.getElementById("truth-strip-text");
  if (strip && stripText) {
    strip.dataset.state = state.registry?.stale ? "stale" : semanticState;
    stripText.textContent = current.declared > 0
      ? `architecture coverage ${current.observed}/${current.declared}${state.registry?.stale ? " · last snapshot" : ""}`
      : "estate coverage unavailable";
    strip.title = missingText;
    strip.hidden = false;
  }
}

function renderDeploy() {
  if (!state.deploy?.commitSha) {
    setStateText("estate-latest-deploy", "unavailable", "warning");
    setStateText("ops-deploy-value", "deploy evidence unavailable", "warning");
    return;
  }

  const when = state.deploy.endedOn || state.deploy.createdOn;
  const displayWhen = when
    ? `${new Date(when).toISOString().slice(0, 16).replace("T", " ")} UTC`
    : "available";
  const deployState = state.deploy.status === "success"
    ? "success"
    : state.deploy.status === "failure"
      ? "failure"
      : "pending";

  setStateText("estate-latest-deploy", displayWhen, deployState);
  setStateText(
    "ops-deploy-value",
    deployState === "success" ? "latest deploy passing" : `latest deploy ${state.deploy.status || "pending"}`,
    deployState,
  );
}

function render() {
  renderCoverage();
  renderDeploy();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function refresh() {
  const [topologyResult, deployResult] = await Promise.allSettled([
    fetchJson(TOPOLOGY_URL),
    fetchJson(DEPLOY_URL),
  ]);

  if (topologyResult.status === "fulfilled") {
    state.topology = topologyResult.value;
  }
  if (deployResult.status === "fulfilled") {
    state.deploy = deployResult.value;
  }

  render();
  schedule();
}

function schedule() {
  if (state.timer !== null) window.clearTimeout(state.timer);
  if (document.hidden) return;
  state.timer = window.setTimeout(() => {
    state.timer = null;
    void refresh();
  }, POLL_MS);
}

function init() {
  void initHomepageFieldFallback();

  subscribeRegistry((snapshot) => {
    state.registry = snapshot;
    render();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (state.timer !== null) window.clearTimeout(state.timer);
      state.timer = null;
      return;
    }
    void refresh();
  });

  void refresh();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
