import "../../static/js/sonify/ui.js?v=20260726-system-symphony-atlas-apu-live-v7";
import {
  DEFAULT_USER_GAIN,
  SYSTEM_SYMPHONY_BUILD_ID,
} from "../../static/js/sonify/apu-production-engine.js?v=20260726-system-symphony-atlas-apu-live-v7";
import { buildAtlasApuScorePlan } from "../../static/js/sonify/atlas-apu-score-plan.js?v=20260726-atlas-apu-score-plan-v3";
import { scorePlanGuardForFrame } from "../../static/js/sonify/atlas-apu-engine-controls.js?v=20260726-atlas-apu-engine-controls-v4";

const OBJECTIVES_URL = "https://api.atlas-systems.uk/v1/reliability/objectives";
const SHELL_FIX_STYLESHEET = "/static/css/batch-h-shell-fixes.css?v=20260725-browser-evidence";
const HOST_ID = "system-symphony-widget";
const HOST_WAIT_MS = 5000;
const PAGE_OUTPUT_GAIN_PERCENT = Math.round(DEFAULT_USER_GAIN * 100);
const PAGE_MODES = new Set(["play", "trace", "replay"]);
const REPLAY_PROFILES = new Set(["custom", "healthy", "warning", "critical", "unknown"]);
const REPLAY_ROUTE = "/lab/system-symphony/replay/";
const MOVEMENTS = Object.freeze({
  healthy: "Green Clock",
  warning: "Warning Pressure",
  critical: "Critical Choke",
  unknown: "Unknown Drift",
});

let latestCartridge = null;

const byId = (id) => document.getElementById(id);

function ensureStylesheet(href) {
  if (document.head.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function setText(id, value) {
  const node = byId(id);
  if (node) node.textContent = String(value ?? "unknown");
}

function text(selector, root = document, fallback = "unknown") {
  return root.querySelector(selector)?.textContent?.trim() || fallback;
}

function setCartridgeField(name, value) {
  const node = document.querySelector(`[data-cartridge-field="${name}"]`);
  if (node) node.textContent = String(value ?? "unknown");
}

function setProofText(id, value) {
  setText(id, value ?? "unknown");
}

function commitIdentity() {
  const value = document.querySelector('meta[name="build-commit"]')?.content
    || document.documentElement.dataset.buildCommit
    || window.__ATLAS_BUILD_COMMIT__
    || "";
  return String(value).trim() || "unavailable";
}

function compactCommit(value) {
  const textValue = String(value ?? "").trim();
  return /^[0-9a-f]{40}$/i.test(textValue) ? textValue.slice(0, 7) : textValue || "unavailable";
}

function formatIsoTime(value) {
  if (!value) return "pending";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function formatPercentValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.round(numeric * 100)}%` : "unknown";
}

function formatStateVector(vector = {}) {
  return ["healthy", "warning", "critical", "unknown"]
    .map((key) => `${key[0].toUpperCase()}:${formatPercentValue(vector[key])}`)
    .join(" ");
}

function routeModeLabel() {
  return normaliseMode(document.querySelector("[data-symphony-flagship]")?.dataset.symphonyMode).toUpperCase();
}

function telemetrySourceLabel(host, detail = {}) {
  const key = host?.dataset.source ?? detail.source?.key ?? "connecting";
  if (key === "demo") return "replay";
  if (key === "preview") return "fixture";
  if (key === "stale") return "live stale";
  if (key === "live") return "live";
  return "connecting";
}

function sampleFreeStatus(detail = {}, plan = {}) {
  const stats = detail.sampleStats;
  if (plan.sampleFreeTarget !== true) return "no";
  if (stats && stats.sampleFree === false) return "no";
  if (stats && Number(stats.totalAssets) > 0) return "no";
  return "yes";
}

function currentReplaySeed() {
  return normaliseReplaySeed(document.querySelector("[data-page-replay-seed]")?.value);
}

function normaliseMode(value) {
  const mode = String(value ?? "").toLowerCase();
  return PAGE_MODES.has(mode) ? mode : "play";
}

function normaliseReplayProfile(value) {
  const profile = String(value ?? "").toLowerCase();
  return REPLAY_PROFILES.has(profile) ? profile : "custom";
}

function normaliseReplaySeed(value) {
  const seed = String(value ?? "").trim().toUpperCase();
  return /^[0-9A-F]{4,8}$/.test(seed) ? seed : "A7A5";
}

function waitForInstrumentHost() {
  const existing = document.getElementById(HOST_ID);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      const host = document.getElementById(HOST_ID);
      if (!host) return;
      observer.disconnect();
      window.clearTimeout(timeout);
      resolve(host);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error("System Symphony host did not initialise"));
    }, HOST_WAIT_MS);
  });
}

function metricText(host, name, fallback = "unknown") {
  return host.querySelector(`[data-metric="${name}"]`)?.textContent?.trim() || fallback;
}

function stateKeyFromMetric(host) {
  const state = String(metricText(host, "state", "Unknown")).split("/")[0].trim().toLowerCase();
  if (["healthy", "warning", "critical", "unknown"].includes(state)) return state;
  return host.dataset.state ?? "unknown";
}

function syncSummary(host) {
  const stateKey = stateKeyFromMetric(host);
  const source = host.dataset.source ?? "connecting";
  const measured = metricText(host, "measured", "0");
  const unmeasured = metricText(host, "unmeasured", "0");
  const total = metricText(host, "total", "0");
  const sourceLabel = text("[data-dialog-source]", host, source).toUpperCase();
  const running = host.dataset.running === "1";
  const measurementSummary = source === "demo" ? `replay / ${total}` : `${measured} / ${unmeasured}`;
  const playMeasured = source === "demo" ? `replay / ${total}` : `${measured} / ${total}`;
  setText("page-score-state", metricText(host, "state"));
  setText("page-service-count", total);
  setText(
    "page-measurement-count",
    measurementSummary,
  );
  const movement = MOVEMENTS[stateKey] ?? MOVEMENTS.unknown;
  setProofText("page-proof-engine", SYSTEM_SYMPHONY_BUILD_ID);
  setProofText("page-proof-commit", compactCommit(commitIdentity()));
  setProofText("page-proof-source", telemetrySourceLabel(host));
  setProofText("page-proof-route", routeModeLabel());
  document.querySelector("[data-page-movement]")?.replaceChildren(document.createTextNode(movement));
  document.querySelector("[data-page-source-label]")?.replaceChildren(document.createTextNode(sourceLabel));
  document.querySelector("[data-page-now-state]")?.replaceChildren(document.createTextNode(metricText(host, "state")));
  document.querySelector("[data-page-measured-label]")?.replaceChildren(document.createTextNode(playMeasured));
  const pageAudio = document.querySelector("[data-page-audio-toggle]");
  if (pageAudio) {
    pageAudio.textContent = running ? "Stop listening" : "Start listening";
    pageAudio.setAttribute("aria-pressed", String(running));
  }
  const status = byId("page-source-status");
  status.dataset.state = stateKey === "critical" ? "failure" : stateKey === "warning" ? "warning" : stateKey === "healthy" ? "healthy" : "unknown";
  status.textContent = `Instrument ${stateKey}; source ${source}. Live mode remains read-only.`;
}

function syncMode(mode, { push = true } = {}) {
  const nextMode = normaliseMode(mode);
  const flagship = document.querySelector("[data-symphony-flagship]");
  if (!flagship) return;
  flagship.dataset.symphonyMode = nextMode;
  for (const tab of flagship.querySelectorAll("[data-symphony-mode-tab]")) {
    const selected = tab.dataset.symphonyModeTab === nextMode;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of flagship.querySelectorAll("[data-symphony-mode-panel]")) {
    panel.hidden = panel.dataset.symphonyModePanel !== nextMode;
    panel.classList.toggle("is-active", panel.dataset.symphonyModePanel === nextMode);
  }
  setProofText("page-proof-route", nextMode.toUpperCase());
  if (!push) return;
  const url = new URL(window.location.href);
  if (nextMode === "play") url.searchParams.delete("symphonyMode");
  else url.searchParams.set("symphonyMode", nextMode);
  window.history.replaceState({}, "", url);
}

function clickConsoleAudio(host) {
  const button = host.querySelector(".symphony-console [data-audio-toggle]");
  button?.click();
}

function makeReplayUrl({
  frameSeed = latestCartridge?.frameSeed,
  frameId = latestCartridge?.frameId,
  dominantState = latestCartridge?.dominantState,
  source = latestCartridge?.source,
  replaySeed = currentReplaySeed(),
  profile = normaliseReplayProfile(document.querySelector("[data-page-replay-profile]")?.value),
} = {}) {
  const url = new URL(REPLAY_ROUTE, window.location.origin);
  const frame = frameSeed ?? frameId ?? "pending";
  url.searchParams.set("frame", frame);
  url.searchParams.set("seed", replaySeed);
  url.searchParams.set("state", profile === "custom" ? dominantState ?? "unknown" : profile);
  url.searchParams.set("source", source ?? "replay");
  if (new URLSearchParams(window.location.search).has("symphonyPreviewData")) {
    url.searchParams.set("symphonyPreviewData", "1");
  }
  return url;
}

function replayUrl() {
  return makeReplayUrl();
}

function instrumentReplayUrl() {
  const url = new URL("/lab/system-symphony/", window.location.origin);
  url.searchParams.set("symphonyMode", "replay");
  url.searchParams.set(
    "symphonyScene",
    normaliseReplayProfile(document.querySelector("[data-page-replay-profile]")?.value),
  );
  url.searchParams.set("symphonySeed", currentReplaySeed());
  if (latestCartridge?.frameSeed) url.searchParams.set("symphonyFrame", latestCartridge.frameSeed);
  if (new URLSearchParams(window.location.search).has("symphonyPreviewData")) {
    url.searchParams.set("symphonyPreviewData", "1");
  }
  return url;
}

function setReplayStatus(message) {
  const status = document.querySelector("[data-page-replay-status]");
  if (status) status.textContent = message;
}

function planForFrame(frame, source) {
  if (frame?.scorePlan && source !== "replay") return frame.scorePlan;
  try {
    return buildAtlasApuScorePlan(
      source === "replay" ? { ...frame, replay: true } : frame,
      { sourceMode: source },
    );
  } catch {
    return null;
  }
}

function movementScale(plan, frame) {
  if (plan?.theme?.harmonicColor) return plan.theme.harmonicColor;
  if (Array.isArray(frame?.scale)) return frame.scale.join(", ");
  return "unknown";
}

function buildCartridge(host, detail = {}) {
  const frame = detail.frame ?? host.__atlasApuFrame?.frame;
  if (!frame) return null;
  const source = telemetrySourceLabel(host, detail);
  const plan = planForFrame(frame, source);
  if (!plan) return null;
  const commit = commitIdentity();
  const replaySeed = currentReplaySeed();
  const transition = plan.transition ?? {};
  const roles = plan.roles ?? {};
  const signalDensity = Number(roles.signal?.density);
  const frameTime = formatIsoTime(plan.timestamp ?? frame.timestamp ?? frame.lastSuccessfulAt ?? plan.frameId);
  const diagnosticGuard = detail.composition?.diagnostics?.scorePlanGuard;
  const guard = diagnosticGuard?.active === true
    ? diagnosticGuard
    : scorePlanGuardForFrame({ scorePlan: plan });
  const sampleFree = sampleFreeStatus(detail, plan);

  return Object.freeze({
    title: "ATLAS APU CARTRIDGE",
    frameId: String(plan.frameId ?? plan.seed),
    frameTime,
    dominantState: plan.dominantState ?? frame.scoreState ?? "unknown",
    dominantLabel: plan.dominantLabel ?? frame.scoreLabel ?? "Unknown",
    movement: plan.movement ?? "Unknown Drift",
    stateVector: plan.stateVector ?? frame.stateVector ?? {},
    tempo: `${plan.tempo?.bpm ?? frame.bpm ?? 100} BPM`,
    grid: plan.tempo?.grid ?? "16-step",
    scale: movementScale(plan, frame),
    clockPattern: `${roles.clock?.state ?? "steady"} / ${roles.clock?.grid ?? "16-step"}`,
    pulseMotif: `${plan.motif?.name ?? roles.pulse?.motif ?? "unknown motif"} / duty ${plan.motif?.dutyCycle ?? roles.pulse?.dutyCycle ?? "unknown"}`,
    memoryBehavior: roles.memory?.state ?? "unknown",
    thermalBassPattern: `${roles.thermal?.pattern ?? plan.bassPattern ?? "unknown"} / pressure ${formatPercentValue(roles.thermal?.pressure)}`,
    signalNoiseDensity: `${roles.signal?.pattern ?? plan.noisePattern ?? "unknown"} / ${Number.isFinite(signalDensity) ? formatPercentValue(signalDensity) : "unknown"}`,
    contentionAlerts: `${roles.contention?.alerts ?? 0} / ${roles.contention?.counterline ?? plan.counterline ?? "unknown"}`,
    recoveryAccents: roles.recovery?.active ? "active" : "inactive",
    transitionSignature: `${transition.id ?? "steady-state"} / ${transition.gesture ?? "current movement continues"}`,
    frameSeed: plan.seed ?? "pending",
    engineVersion: SYSTEM_SYMPHONY_BUILD_ID,
    scorePlanVersion: plan.buildId ?? "unknown",
    engineControlsVersion: detail.composition?.diagnostics?.engineControlsBuildId ?? "pending",
    commit: compactCommit(commit),
    source,
    sampleFree,
    sampleFreeGuard: guard?.active === true ? `${sampleFree} / ${guard.mode}` : `${sampleFree} / pending`,
    routeMode: routeModeLabel(),
    replaySeed,
    replayUrl: makeReplayUrl({
      frameSeed: plan.seed,
      frameId: plan.frameId,
      dominantState: plan.dominantState,
      source,
      replaySeed,
    }).href,
    evidence: plan.evidence ?? {},
    scorePlan: plan,
  });
}

function renderCartridge(payload) {
  if (!payload) return;
  latestCartridge = payload;
  window.__ATLAS_APU_CARTRIDGE__ = payload;

  setCartridgeField("frameTime", payload.frameTime);
  setCartridgeField("dominantState", `${payload.dominantLabel} / ${payload.movement}`);
  setCartridgeField("stateVector", formatStateVector(payload.stateVector));
  setCartridgeField("tempo", payload.tempo);
  setCartridgeField("grid", payload.grid);
  setCartridgeField("scale", payload.scale);
  setCartridgeField("clockPattern", payload.clockPattern);
  setCartridgeField("pulseMotif", payload.pulseMotif);
  setCartridgeField("memoryBehavior", payload.memoryBehavior);
  setCartridgeField("thermalBass", payload.thermalBassPattern);
  setCartridgeField("signalDensity", payload.signalNoiseDensity);
  setCartridgeField("contentionAlerts", payload.contentionAlerts);
  setCartridgeField("recoveryAccents", payload.recoveryAccents);
  setCartridgeField("transitionSignature", payload.transitionSignature);
  setCartridgeField("frameSeed", payload.frameSeed);
  setCartridgeField("engineVersion", payload.engineVersion);
  setCartridgeField("commit", payload.commit);
  setCartridgeField("source", payload.source);
  setCartridgeField("sampleFree", payload.sampleFree);
  setCartridgeField("replaySeed", payload.replaySeed);

  setProofText("page-proof-commit", payload.commit);
  setProofText("page-proof-engine", payload.engineVersion);
  setProofText("page-proof-source", payload.source);
  setProofText("page-proof-frame-time", payload.frameTime);
  setProofText("page-proof-route", payload.routeMode);
  setProofText("page-proof-frame-seed", payload.frameSeed);
  setProofText("page-proof-sample-free", payload.sampleFreeGuard);
  const proofReplay = byId("page-proof-replay");
  if (proofReplay) {
    proofReplay.href = payload.replayUrl;
    proofReplay.textContent = "available";
  }
  const json = document.querySelector("[data-cartridge-json]");
  if (json) json.textContent = JSON.stringify(payload, null, 2);
  const status = document.querySelector("[data-cartridge-status]");
  if (status) status.textContent = `Cartridge armed: ${payload.dominantState} / ${payload.source}.`;
}

function refreshCartridge(host, detail = host.__atlasApuFrame ?? {}) {
  renderCartridge(buildCartridge(host, detail));
}

function applyReplay(host) {
  const demoButton = host.querySelector("[data-demo-mode]");
  if (!demoButton || demoButton.disabled) {
    setReplayStatus("Replay is waiting for the first evidence frame.");
    return false;
  }
  if (demoButton.getAttribute("aria-pressed") !== "true") demoButton.click();
  const seed = normaliseReplaySeed(document.querySelector("[data-page-replay-seed]")?.value);
  const profile = normaliseReplayProfile(document.querySelector("[data-page-replay-profile]")?.value);
  const pageSeed = document.querySelector("[data-page-replay-seed]");
  if (pageSeed) pageSeed.value = seed;
  const engineSeed = host.querySelector("[data-performance-seed]");
  if (engineSeed) {
    engineSeed.value = seed;
    engineSeed.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const profileButton = host.querySelector(`[data-demo-profile="${profile}"]`);
  profileButton?.click();
  host.querySelector("[data-replay-seed]")?.click();
  const url = instrumentReplayUrl();
  window.history.replaceState({}, "", url);
  setReplayStatus(`Replay armed: ${profile === "custom" ? "live snapshot" : profile} / seed ${seed}.`);
  return true;
}

async function copyCartridgeJson() {
  const status = document.querySelector("[data-cartridge-status]");
  if (!latestCartridge) {
    if (status) status.textContent = "No cartridge is available yet.";
    return;
  }
  const json = JSON.stringify(latestCartridge, null, 2);
  try {
    await navigator.clipboard?.writeText(json);
    if (status) status.textContent = "Cartridge JSON copied.";
  } catch {
    if (status) status.textContent = "Cartridge JSON is visible in the export panel.";
  }
}

function downloadCartridgeJson() {
  const status = document.querySelector("[data-cartridge-status]");
  if (!latestCartridge) {
    if (status) status.textContent = "No cartridge is available yet.";
    return;
  }
  const blob = new Blob([JSON.stringify(latestCartridge, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `atlas-apu-cartridge-${latestCartridge.frameSeed ?? "frame"}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  if (status) status.textContent = "Cartridge JSON export started.";
}

function installModeControls(host) {
  const params = new URLSearchParams(window.location.search);
  const initialMode = normaliseMode(params.get("symphonyMode"));
  const initialProfile = normaliseReplayProfile(params.get("symphonyScene"));
  const initialSeed = normaliseReplaySeed(params.get("symphonySeed"));
  let replayRetryTimer = null;
  const profile = document.querySelector("[data-page-replay-profile]");
  const seed = document.querySelector("[data-page-replay-seed]");
  if (profile) profile.value = initialProfile;
  if (seed) seed.value = initialSeed;
  syncMode(initialMode, { push: false });
  for (const tab of document.querySelectorAll("[data-symphony-mode-tab]")) {
    tab.addEventListener("click", () => {
      const mode = normaliseMode(tab.dataset.symphonyModeTab);
      syncMode(mode);
      refreshCartridge(host);
      if (mode === "replay") applyReplay(host);
    });
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...document.querySelectorAll("[data-symphony-mode-tab]")];
      const index = tabs.indexOf(tab);
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(index + offset + tabs.length) % tabs.length];
      next.focus();
      next.click();
    });
  }
  for (const link of document.querySelectorAll("[data-symphony-mode-link]")) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      syncMode(link.dataset.symphonyModeLink);
      byId("symphony-trace-surface")?.scrollIntoView({ block: "start" });
    });
  }
  document.querySelector("[data-page-audio-toggle]")?.addEventListener("click", () => clickConsoleAudio(host));
  document.querySelector("[data-page-replay-apply]")?.addEventListener("click", () => {
    syncMode("replay");
    refreshCartridge(host);
    applyReplay(host);
  });
  document.querySelector("[data-page-replay-copy]")?.addEventListener("click", async () => {
    const url = replayUrl();
    try {
      await navigator.clipboard?.writeText(url.href);
      setReplayStatus(`Copied replay link: ${url.href}`);
    } catch {
      setReplayStatus(`Replay link: ${url.href}`);
    }
  });
  document.querySelector("[data-page-replay-seed]")?.addEventListener("input", (event) => {
    event.target.value = event.target.value.toUpperCase();
    refreshCartridge(host);
  });
  document.querySelector("[data-cartridge-copy]")?.addEventListener("click", copyCartridgeJson);
  document.querySelector("[data-cartridge-download]")?.addEventListener("click", downloadCartridgeJson);
  host.addEventListener("atlas-apu-frame", (event) => {
    refreshCartridge(host, event.detail);
  });
  refreshCartridge(host);
  if (initialMode === "replay") {
    const retry = (attempt = 0) => {
      if (applyReplay(host)) return;
      if (attempt >= 30) {
        setReplayStatus("Replay could not start because no evidence frame arrived.");
        return;
      }
      replayRetryTimer = window.setTimeout(() => retry(attempt + 1), 500);
    };
    retry();
  }
  window.addEventListener("pagehide", () => {
    if (replayRetryTimer !== null) window.clearTimeout(replayRetryTimer);
  }, { once: true });
}

function installInlineKeyboardBoundary(pageHost, instrumentHost) {
  document.addEventListener("keydown", (event) => {
    if (!pageHost.contains(event.target)) return;
    if (event.key === "Tab") {
      event.stopImmediatePropagation();
      return;
    }
    if (event.key !== "Escape") return;
    const help = instrumentHost.querySelector("[data-help]");
    if (help?.hidden !== false) event.stopImmediatePropagation();
  }, true);
}

function makeScrollableRegionsFocusable(host) {
  for (const [selector, label] of [
    [".symphony-visual", "System Symphony topology and waveform visualisation"],
    [".symphony-table-wrap", "System Symphony service score table"],
  ]) {
    for (const region of host.querySelectorAll(selector)) {
      region.tabIndex = 0;
      region.setAttribute("role", "region");
      region.setAttribute("aria-label", label);
    }
  }
}

function applyPageOutputHeadroom(host) {
  const sliders = [...host.querySelectorAll("[data-volume]")];
  const primary = sliders[0];
  if (!primary) return;
  primary.value = String(PAGE_OUTPUT_GAIN_PERCENT);
  primary.dispatchEvent(new Event("input", { bubbles: true }));
  host.dataset.pageOutputGain = String(PAGE_OUTPUT_GAIN_PERCENT);
}

function convertConsoleToRegion(host, pageHost) {
  const previousFocus = document.activeElement;
  const openButton = host.querySelector("[data-open-console]");
  const overlay = host.querySelector("[data-overlay]");
  const consolePanel = host.querySelector(".symphony-console");
  const closeButton = host.querySelector("[data-close-console]");
  if (!openButton || !overlay || !consolePanel) {
    throw new Error("System Symphony console contract is incomplete");
  }

  openButton.click();
  pageHost.appendChild(host);
  overlay.hidden = false;
  overlay.dataset.inline = "true";
  consolePanel.removeAttribute("aria-modal");
  consolePanel.removeAttribute("tabindex");
  consolePanel.setAttribute("role", "region");
  consolePanel.setAttribute("aria-labelledby", "symphony-console-title");
  if (closeButton) closeButton.hidden = true;
  document.body.classList.remove("symphony-console-open");
  pageHost.setAttribute("aria-busy", "false");
  makeScrollableRegionsFocusable(host);
  applyPageOutputHeadroom(host);

  if (previousFocus instanceof HTMLElement && previousFocus !== document.body) {
    previousFocus.focus({ preventScroll: true });
  }
  installInlineKeyboardBoundary(pageHost, host);
}

async function loadObjectiveCount() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(OBJECTIVES_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`objective policy answered ${response.status}`);
    const payload = await response.json();
    const objectives = Array.isArray(payload?.objectives) ? payload.objectives : [];
    setText("page-objective-count", objectives.length);
  } catch (error) {
    console.warn("system-symphony-page: objective count unavailable", error);
    setText("page-objective-count", "unavailable");
  } finally {
    window.clearTimeout(timeout);
  }
}

async function initialisePage() {
  const pageHost = document.querySelector("[data-symphony-page-host]");
  if (!pageHost) return;
  ensureStylesheet(SHELL_FIX_STYLESHEET);
  try {
    const host = await waitForInstrumentHost();
    convertConsoleToRegion(host, pageHost);
    installModeControls(host);
    syncSummary(host);
    const observer = new MutationObserver(() => syncSummary(host));
    observer.observe(host, {
      attributes: true,
      attributeFilter: ["data-state", "data-source", "data-running"],
      childList: true,
      characterData: true,
      subtree: true,
    });
    window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
  } catch (error) {
    console.error("system-symphony-page: inline instrument unavailable", error);
    pageHost.setAttribute("aria-busy", "false");
    const status = byId("page-source-status");
    status.dataset.state = "failure";
    status.textContent = "The existing System Symphony interface could not be embedded. Source links remain available.";
  }
  await loadObjectiveCount();
}

initialisePage();
