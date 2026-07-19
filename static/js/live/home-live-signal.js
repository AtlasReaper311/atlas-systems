import { subscribe as subscribeRegistry } from "./atlas-registry.js?v=20260720-esm-live";

const POLL_INTERVAL_MS = 60_000;
const COUNTDOWN_TICK_MS = 1_000;
const DEPLOY_URL = "https://api.atlas-systems.uk/deploy-watch/latest";

const SERVICES = [
  { key: "atlas-notify", name: "atlas-notify", url: "https://api.atlas-systems.uk/notify/health" },
  { key: "github-pulse", name: "github-pulse", url: "https://api.atlas-systems.uk/pulse" },
  { key: "site-pulse", name: "site-pulse", url: "https://api.atlas-systems.uk/site-pulse/health" },
  { key: "deploy-watch", name: "deploy-watch", url: "https://api.atlas-systems.uk/deploy-watch/health" },
];

const state = {
  deploy: { status: "loading", data: null },
  services: Object.fromEntries(
    SERVICES.map((service) => [service.key, { status: "loading" }]),
  ),
  registry: null,
  lastChecked: null,
  nextCheck: null,
  checking: false,
};

let renderFrame = null;
let pollTimer = null;
let countdownTimer = null;
let unsubscribeRegistry = null;

function scheduleRender() {
  if (renderFrame !== null) return;

  renderFrame = requestAnimationFrame(() => {
    renderFrame = null;
    renderAll();
  });
}

function clearPollTimer() {
  if (pollTimer === null) return;
  clearTimeout(pollTimer);
  pollTimer = null;
}

function clearCountdownTimer() {
  if (countdownTimer === null) return;
  clearTimeout(countdownTimer);
  countdownTimer = null;
}

function scheduleNextPoll() {
  clearPollTimer();
  if (document.hidden) return;

  pollTimer = window.setTimeout(() => {
    pollTimer = null;
    void pollAll();
  }, POLL_INTERVAL_MS);
}

function scheduleCountdownTick() {
  clearCountdownTimer();
  if (document.hidden) return;

  const remainder = Date.now() % COUNTDOWN_TICK_MS;
  const delay = remainder === 0
    ? COUNTDOWN_TICK_MS
    : COUNTDOWN_TICK_MS - remainder;

  countdownTimer = window.setTimeout(() => {
    countdownTimer = null;
    scheduleRender();
    scheduleCountdownTick();
  }, delay);
}

function overallHealth() {
  const statuses = SERVICES.map((service) => state.services[service.key].status);
  const upCount = statuses.filter((status) => status === "ok").length;
  const total = SERVICES.length;

  if (statuses.some((status) => status === "loading")) {
    return { level: "loading", upCount, total };
  }
  if (upCount === total) {
    return { level: "nominal", upCount, total };
  }
  if (upCount >= Math.ceil(total / 2)) {
    return { level: "degraded", upCount, total };
  }
  return { level: "critical", upCount, total };
}

async function fetchDeploy() {
  try {
    const response = await fetch(DEPLOY_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.deploy = { status: "ok", data: await response.json() };
  } catch {
    state.deploy = { status: "error", data: null };
  }
}

async function fetchService(service) {
  try {
    const response = await fetch(service.url, { cache: "no-store" });
    state.services[service.key] = {
      status: response.ok ? "ok" : "error",
    };
  } catch {
    state.services[service.key] = { status: "error" };
  }
}

async function pollAll() {
  if (state.checking) return;

  clearPollTimer();
  state.checking = true;
  state.nextCheck = null;
  scheduleRender();

  await Promise.all([
    fetchDeploy(),
    ...SERVICES.map(fetchService),
  ]);

  state.lastChecked = new Date();
  state.nextCheck = new Date(Date.now() + POLL_INTERVAL_MS);
  state.checking = false;

  scheduleRender();
  scheduleNextPoll();
}

function ensureBackendGrid() {
  const grid = document.getElementById("backendGrid");
  if (!grid || grid.dataset.built === "1") return;

  const fragment = document.createDocumentFragment();

  for (const service of SERVICES) {
    const cell = document.createElement("div");
    cell.className = "signal-cell";

    const label = document.createElement("div");
    label.className = "signal-label";
    label.textContent = service.name;

    const value = document.createElement("div");
    value.className = "signal-value mono";
    value.id = `backend-${service.key}`;
    value.style.color = "var(--text-dim)";
    value.textContent = "checking…";

    cell.append(label, value);
    fragment.appendChild(cell);
  }

  grid.replaceChildren(fragment);
  grid.dataset.built = "1";
}

function ensureCountdownControls() {
  if (document.getElementById("signal-countdown")) return;

  const liveSection = [...document.querySelectorAll(".section")].find((section) =>
    section.querySelector(".section-label")?.textContent.trim() === "Live signal",
  );
  const label = liveSection?.querySelector(".section-label");
  if (!label) return;

  const row = document.createElement("div");
  row.dataset.liveSignalControls = "";
  row.style.cssText = [
    "font-size:11px",
    "letter-spacing:0.08em",
    "margin-top:0.75rem",
    "margin-bottom:2rem",
    "display:flex",
    "align-items:center",
    "gap:1rem",
  ].join(";");

  const countdown = document.createElement("span");
  countdown.id = "signal-countdown";
  countdown.style.color = "var(--text-faint)";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "↻ refresh";
  button.style.cssText = [
    "font-family:var(--mono)",
    "font-size:11px",
    "letter-spacing:0.08em",
    "color:var(--text-dim)",
    "background:none",
    "border:1px solid var(--border)",
    "padding:0.2rem 0.6rem",
    "cursor:pointer",
  ].join(";");
  button.addEventListener("click", () => {
    void pollAll();
  });

  row.append(countdown, button);
  label.after(row);
}

function renderNavDot() {
  const dot = document.querySelector(".status-dot");
  const label = document.getElementById("nav-build-status");
  if (!dot || !label) return;

  const { level, upCount, total } = overallHealth();
  const config = {
    loading: { bg: "var(--accent)", shadow: "rgba(245,166,35,0.15)", text: "checking…" },
    nominal: { bg: "#4ade80", shadow: "rgba(74,222,128,0.15)", text: "systems nominal" },
    degraded: { bg: "#f5a623", shadow: "rgba(245,166,35,0.15)", text: `${upCount}/${total} operational` },
    critical: { bg: "#e24b4a", shadow: "rgba(226,75,74,0.15)", text: "major outage" },
  }[level];

  dot.style.background = config.bg;
  dot.style.boxShadow = `0 0 0 3px ${config.shadow}`;
  dot.style.animation = level === "nominal"
    ? "pulse 2.5s ease-in-out infinite"
    : "none";
  label.textContent = config.text;
}

function renderDeploy() {
  const lastDeploy = document.getElementById("last-deploy");
  const commit = document.getElementById("commit-hash");
  const build = document.getElementById("build-status");
  if (!lastDeploy) return;

  const { status, data } = state.deploy;

  if (status === "loading") {
    for (const element of [lastDeploy, commit, build]) {
      if (element) element.textContent = "checking…";
    }
    return;
  }

  if (status === "error" || !data?.commitSha) {
    for (const element of [lastDeploy, commit, build]) {
      if (element) element.textContent = "—";
    }
    return;
  }

  const when = data.endedOn || data.createdOn;
  lastDeploy.textContent = when
    ? `${new Date(when).toISOString().slice(0, 16).replace("T", " ")} UTC`
    : "—";

  if (commit) {
    if (data.commitUrl) {
      const link = document.createElement("a");
      link.href = data.commitUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.style.color = "inherit";
      link.style.textDecoration = "underline";
      link.textContent = data.commitSha;
      commit.replaceChildren(link);
    } else {
      commit.textContent = data.commitSha;
    }
  }

  if (build) {
    const config = {
      success: { text: "passing", color: "#4ade80" },
      failure: { text: "failing", color: "#e24b4a" },
    }[data.status] ?? {
      text: data.status || "—",
      color: "var(--accent)",
    };

    build.textContent = config.text;
    build.style.color = config.color;
  }
}

function renderBackendGrid() {
  for (const service of SERVICES) {
    const element = document.getElementById(`backend-${service.key}`);
    if (!element) continue;

    const config = {
      loading: { text: "checking…", color: "var(--text-dim)" },
      ok: { text: "operational", color: "#4ade80" },
      error: { text: "unreachable", color: "#e24b4a" },
    }[state.services[service.key].status];

    element.textContent = config.text;
    element.style.color = config.color;
  }
}

function renderCountdown() {
  const element = document.getElementById("signal-countdown");
  if (!element) return;

  if (state.checking) {
    element.textContent = "checking…";
    element.style.color = "var(--accent)";
    return;
  }

  if (!state.nextCheck || !state.lastChecked) {
    element.textContent = "";
    return;
  }

  const secondsUntil = Math.max(
    0,
    Math.round((state.nextCheck.getTime() - Date.now()) / 1000),
  );
  const checkedAt = `${state.lastChecked.toISOString().slice(11, 19)} UTC`;

  element.textContent = `last checked ${checkedAt} · next in ${secondsUntil}s`;
  element.style.color = "var(--text-faint)";
}

function renderEstateStrip() {
  const strip = document.getElementById("estate-strip");
  const text = document.getElementById("estate-strip-text");
  if (!strip || !text || !state.registry) return;

  const snapshot = state.registry;

  if (!snapshot.ok && !snapshot.stale) {
    strip.dataset.state = "unknown";
    text.textContent = "estate map · every worker, every binding";
  } else {
    strip.dataset.state = snapshot.stale ? "stale" : "ok";

    if (snapshot.counts) {
      text.textContent =
        `${snapshot.counts.workers} workers at the edge · ` +
        `${snapshot.counts.documented} self-documenting · ` +
        (snapshot.stale ? "last snapshot" : "registry nominal");
    } else {
      text.textContent = `estate registry ${snapshot.stale ? "· last snapshot" : "nominal"}`;
    }
  }

  strip.hidden = false;
  strip.classList.add("in");
}

function renderAll() {
  ensureBackendGrid();
  ensureCountdownControls();
  renderNavDot();
  renderDeploy();
  renderBackendGrid();
  renderCountdown();
  renderEstateStrip();
}

function handleVisibilityChange() {
  if (document.hidden) {
    clearPollTimer();
    clearCountdownTimer();
    return;
  }

  scheduleRender();
  scheduleCountdownTick();
  void pollAll();
}

function init() {
  unsubscribeRegistry = subscribeRegistry((snapshot) => {
    state.registry = snapshot;
    scheduleRender();
  });

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", () => {
    clearPollTimer();
    clearCountdownTimer();
    unsubscribeRegistry?.();
    unsubscribeRegistry = null;
  }, { once: true });

  scheduleRender();
  scheduleCountdownTick();
  void pollAll();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
