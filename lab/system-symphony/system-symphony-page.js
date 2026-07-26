import "../../static/js/sonify/ui.js?v=20260726-system-symphony-atlas-apu-live-v6";
import { DEFAULT_USER_GAIN } from "../../static/js/sonify/apu-production-engine.js?v=20260726-system-symphony-atlas-apu-live-v6";

const OBJECTIVES_URL = "https://api.atlas-systems.uk/v1/reliability/objectives";
const SHELL_FIX_STYLESHEET = "/static/css/batch-h-shell-fixes.css?v=20260725-browser-evidence";
const HOST_ID = "system-symphony-widget";
const HOST_WAIT_MS = 5000;
const PAGE_OUTPUT_GAIN_PERCENT = Math.round(DEFAULT_USER_GAIN * 100);
const PAGE_MODES = new Set(["play", "trace", "replay"]);
const REPLAY_PROFILES = new Set(["custom", "healthy", "warning", "critical", "unknown"]);
const MOVEMENTS = Object.freeze({
  healthy: "Green Clock",
  warning: "Warning Pressure",
  critical: "Critical Choke",
  unknown: "Unknown Drift",
});

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

function replayUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("symphonyMode", "replay");
  url.searchParams.set(
    "symphonyScene",
    normaliseReplayProfile(document.querySelector("[data-page-replay-profile]")?.value),
  );
  url.searchParams.set(
    "symphonySeed",
    normaliseReplaySeed(document.querySelector("[data-page-replay-seed]")?.value),
  );
  return url;
}

function setReplayStatus(message) {
  const status = document.querySelector("[data-page-replay-status]");
  if (status) status.textContent = message;
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
  const url = replayUrl();
  window.history.replaceState({}, "", url);
  setReplayStatus(`Replay armed: ${profile === "custom" ? "live snapshot" : profile} / seed ${seed}.`);
  return true;
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
  });
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
