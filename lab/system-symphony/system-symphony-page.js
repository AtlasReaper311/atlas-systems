import "../../static/js/sonify/ui.js?v=20260726-system-symphony-atlas-apu-live-v3";

const OBJECTIVES_URL = "https://api.atlas-systems.uk/v1/reliability/objectives";
const SHELL_FIX_STYLESHEET = "/static/css/batch-h-shell-fixes.css?v=20260725-browser-evidence";
const HOST_ID = "system-symphony-widget";
const HOST_WAIT_MS = 5000;
const PAGE_OUTPUT_GAIN_PERCENT = 70;

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

function syncSummary(host) {
  setText("page-score-state", metricText(host, "state"));
  setText("page-service-count", metricText(host, "total", "0"));
  setText(
    "page-measurement-count",
    `${metricText(host, "measured", "0")} / ${metricText(host, "unmeasured", "0")}`,
  );
  const state = host.dataset.state ?? "unknown";
  const source = host.dataset.source ?? "connecting";
  const status = byId("page-source-status");
  status.dataset.state = state === "critical" ? "failure" : state === "warning" ? "warning" : state === "healthy" ? "healthy" : "unknown";
  status.textContent = `Instrument ${state}; source ${source}. Live mode remains read-only.`;
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
