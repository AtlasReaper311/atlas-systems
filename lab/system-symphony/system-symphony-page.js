import "../../static/js/sonify/ui.js?v=20260726-system-symphony-atlas-apu-live-v7";
import {
  DEFAULT_USER_GAIN,
  SYSTEM_SYMPHONY_BUILD_ID,
} from "../../static/js/sonify/apu-production-engine.js?v=20260726-system-symphony-atlas-apu-live-v7";
import { buildAtlasApuScorePlan } from "../../static/js/sonify/atlas-apu-score-plan.js?v=20260726-atlas-apu-score-plan-v3";
import { scorePlanGuardForFrame } from "../../static/js/sonify/atlas-apu-engine-controls.js?v=20260726-atlas-apu-engine-controls-v4";
import {
  cartridgeSummary,
  createAtlasApuBlackBoxCartridge,
  materializeBlackBoxArchive,
  validateBlackBoxCartridge,
} from "../../static/js/sonify/atlas-apu-flight-recorder.js?v=20260726-atlas-apu-black-box-v1";
import {
  incidentArcSummary,
  materializeIncidentArcArchive,
  validateIncidentArc,
} from "../../static/js/sonify/atlas-apu-incident-arc.js?v=20260726-atlas-apu-incident-arc-v1";

const OBJECTIVES_URL = "https://api.atlas-systems.uk/v1/reliability/objectives";
const SHELL_FIX_STYLESHEET = "/static/css/batch-h-shell-fixes.css?v=20260725-browser-evidence";
const FLIGHT_RECORDER_ARCHIVE_URL = "/lab/system-symphony/black-box/archive.json?v=20260726-phase9-flight-recorder";
const INCIDENT_ARC_ARCHIVE_URL = "/lab/system-symphony/black-box/incident-arcs.json?v=20260726-phase10-incident-boss-track";
const HOST_ID = "system-symphony-widget";
const HOST_WAIT_MS = 5000;
const PAGE_OUTPUT_GAIN_PERCENT = Math.round(DEFAULT_USER_GAIN * 100);
const PAGE_MODES = new Set(["play", "trace", "replay"]);
const PROOF_PANELS = new Set(["cartridge", "blackbox", "incident"]);
const REPLAY_PROFILES = new Set(["custom", "healthy", "warning", "critical", "unknown"]);
const REPLAY_ROUTE = "/lab/system-symphony/replay/";
const INCIDENT_ARC_FRAME_MS = 10000;
const APU_ROLE_LABELS = Object.freeze({
  clock: "Clock",
  pulse: "Pulse",
  memory: "Memory",
  thermal: "Thermal",
  signal: "Signal",
  contention: "Contention",
  recovery: "Recovery",
});
const MOVEMENTS = Object.freeze({
  healthy: "Green Clock",
  warning: "Warning Pressure",
  critical: "Critical Choke",
  unknown: "Unknown Drift",
});

let latestCartridge = null;
let archivedCartridges = [];
let incidentArcs = [];
let selectedIncidentArc = null;
let incidentArcIndex = 0;
let incidentArcTimer = null;
let activeProofPanel = "cartridge";

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

function setProofPair(name, value) {
  setProofText(`page-proof-${name}`, value);
  setProofText(`trust-proof-${name}`, value);
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
  setProofPair("engine", SYSTEM_SYMPHONY_BUILD_ID);
  setProofPair("commit", compactCommit(commitIdentity()));
  setProofPair("source", telemetrySourceLabel(host));
  setProofPair("route", routeModeLabel());
  document.querySelector("[data-page-movement]")?.replaceChildren(document.createTextNode(movement));
  document.querySelector("[data-page-source-label]")?.replaceChildren(document.createTextNode(sourceLabel));
  document.querySelector("[data-page-now-state]")?.replaceChildren(document.createTextNode(metricText(host, "state")));
  document.querySelector("[data-page-measured-label]")?.replaceChildren(document.createTextNode(playMeasured));
  document.querySelector("[data-cover-movement]")?.replaceChildren(document.createTextNode(movement));
  document.querySelector("[data-cover-source]")?.replaceChildren(document.createTextNode(telemetrySourceLabel(host)));
  const cover = document.querySelector("[data-current-cartridge-cover]");
  if (cover) cover.dataset.state = stateKey;
  const pageAudio = document.querySelector("[data-page-audio-toggle]");
  if (pageAudio) {
    pageAudio.textContent = running ? "Stop listening" : "Start listening";
    pageAudio.setAttribute("aria-pressed", String(running));
  }
  const status = byId("page-source-status");
  status.dataset.state = stateKey === "critical" ? "failure" : stateKey === "warning" ? "warning" : stateKey === "healthy" ? "healthy" : "unknown";
  status.textContent = `Instrument ${stateKey}; source ${source}. Live mode remains read-only.`;
  highlightApuRole(host.dataset.apuRoleHighlight);
}

function syncMode(mode, { push = true } = {}) {
  const nextMode = normaliseMode(mode);
  const flagship = document.querySelector("[data-symphony-flagship]");
  if (!flagship) return;
  flagship.dataset.symphonyMode = nextMode;
  for (const tab of flagship.querySelectorAll("[data-symphony-mode-tab]")) {
    const selected = tab.dataset.symphonyModeTab === nextMode;
    tab.setAttribute("aria-selected", String(selected));
    if (selected) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of flagship.querySelectorAll("[data-symphony-mode-panel]")) {
    panel.hidden = panel.dataset.symphonyModePanel !== nextMode;
    panel.classList.toggle("is-active", panel.dataset.symphonyModePanel === nextMode);
  }
  setProofPair("route", nextMode.toUpperCase());
  if (!push) return;
  const url = new URL(window.location.href);
  if (nextMode === "play") url.searchParams.delete("symphonyMode");
  else url.searchParams.set("symphonyMode", nextMode);
  window.history.replaceState({}, "", url);
}

function scrollToPanel(target) {
  if (!target) return;
  const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - 96);
  window.scrollTo({ top, left: 0, behavior: "auto" });
}

function pinHorizontalScroll() {
  if (window.scrollX === 0) return;
  window.scrollTo({ top: window.scrollY, left: 0, behavior: "auto" });
}

function selectProofPanel(panel = "cartridge", { scroll = false } = {}) {
  const nextPanel = PROOF_PANELS.has(panel) ? panel : "cartridge";
  activeProofPanel = nextPanel;
  const consoleNode = document.querySelector("[data-proof-console]");
  for (const tab of document.querySelectorAll("[data-proof-tab]")) {
    const selected = tab.dataset.proofTab === nextPanel;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const proofPanel of document.querySelectorAll("[data-proof-panel]")) {
    proofPanel.hidden = proofPanel.dataset.proofPanel !== nextPanel;
  }
  if (scroll) {
    const target = document.querySelector(`[data-proof-panel="${nextPanel}"]`) ?? consoleNode;
    scrollToPanel(target);
  }
  window.requestAnimationFrame(pinHorizontalScroll);
}

function setTrustLayer(open) {
  const layer = document.querySelector("[data-trust-layer]");
  if (!layer) return;
  layer.hidden = !open;
  for (const toggle of document.querySelectorAll("[data-trust-toggle]")) {
    toggle.setAttribute("aria-expanded", String(open));
  }
  if (open) layer.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function setTrustStatus(message) {
  const status = document.querySelector("[data-trust-status]");
  if (status) status.textContent = message;
}

function sourceHonestyMessage(source) {
  if (source === "live") return "Live source: current bounded public telemetry.";
  if (source === "live stale") return "Stale source: live request failed; last-known values remain inspectable.";
  if (source === "fixture") return "Fixture source: static preview data, not live estate state.";
  if (source === "replay") return "Replay source: browser-only deterministic playback.";
  return "Connecting source: no live claim is available yet.";
}

function roleSummary(plan, role) {
  const entry = plan?.roles?.[role];
  if (!entry) return `${APU_ROLE_LABELS[role] ?? role}: waiting for the first score plan.`;
  const parts = Object.entries(entry)
    .filter(([, value]) => value !== null && value !== undefined && typeof value !== "object")
    .slice(0, 4)
    .map(([key, value]) => `${key} ${value}`);
  return `${entry.role ?? APU_ROLE_LABELS[role] ?? role}: ${entry.lane ?? "diagnostic lane"}${parts.length ? ` / ${parts.join(" / ")}` : ""}.`;
}

function highlightApuRole(role) {
  const selected = APU_ROLE_LABELS[role] ? role : "";
  const label = APU_ROLE_LABELS[selected] ?? "";
  for (const button of document.querySelectorAll("[data-apu-role-highlight]")) {
    button.setAttribute("aria-pressed", String(button.dataset.apuRoleHighlight === selected));
  }
  const status = document.querySelector("[data-apu-role-status]");
  if (status) status.textContent = selected
    ? roleSummary(latestCartridge?.scorePlan, selected)
    : "Select a role to see its current chip law. Switch the source to Atlas APU audition, then inspect a service to solo or mute it.";
  const host = document.getElementById(HOST_ID);
  if (!host) return;
  host.dataset.apuRoleHighlight = selected;
  const rows = host.querySelectorAll("[data-service-table] tr");
  for (const row of rows) {
    const roleCell = row.children[4];
    row.classList.toggle("is-role-highlight", Boolean(label) && roleCell?.textContent?.includes(label));
  }
}

function clickConsoleAudio(host) {
  const button = host.querySelector(".symphony-console [data-audio-toggle]");
  button?.click();
  return host.dataset.running === "1";
}

function ensureConsoleAudioRunning(host) {
  if (!host) return false;
  if (host.dataset.running === "1") return true;
  return clickConsoleAudio(host);
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

function decorateCartridgeForDisplay(payload, frame = {}) {
  const plan = payload?.scorePlan ?? {};
  const transition = payload?.transition ?? plan.transition ?? {};
  const roles = plan.roles ?? {};
  const signalDensity = Number(roles.signal?.density);
  return Object.freeze({
    ...payload,
    title: "ATLAS APU CARTRIDGE",
    dominantLabel: payload?.dominantLabel ?? plan.dominantLabel ?? frame.scoreLabel ?? "Unknown",
    movement: payload?.movement ?? payload?.movementName ?? plan.movement ?? "Unknown Drift",
    tempo: payload?.tempo ?? `${plan.tempo?.bpm ?? frame.bpm ?? 100} BPM`,
    grid: payload?.grid ?? plan.tempo?.grid ?? "16-step",
    scale: payload?.scale ?? movementScale(plan, frame),
    clockPattern: payload?.clockPattern ?? `${roles.clock?.state ?? "steady"} / ${roles.clock?.grid ?? "16-step"}`,
    pulseMotif: payload?.pulseMotif ?? `${plan.motif?.name ?? roles.pulse?.motif ?? "unknown motif"} / duty ${plan.motif?.dutyCycle ?? roles.pulse?.dutyCycle ?? "unknown"}`,
    memoryBehavior: payload?.memoryBehavior ?? roles.memory?.state ?? "unknown",
    thermalBassPattern: payload?.thermalBassPattern ?? `${roles.thermal?.pattern ?? plan.bassPattern ?? "unknown"} / pressure ${formatPercentValue(roles.thermal?.pressure)}`,
    signalNoiseDensity: payload?.signalNoiseDensity ?? `${roles.signal?.pattern ?? plan.noisePattern ?? "unknown"} / ${Number.isFinite(signalDensity) ? formatPercentValue(signalDensity) : "unknown"}`,
    contentionAlerts: payload?.contentionAlerts ?? `${roles.contention?.alerts ?? 0} / ${roles.contention?.counterline ?? plan.counterline ?? "unknown"}`,
    recoveryAccents: payload?.recoveryAccents ?? (roles.recovery?.active ? "active" : "inactive"),
    transitionSignature: payload?.transitionSignature ?? `${transition.id ?? "steady-state"} / ${transition.gesture ?? "current movement continues"}`,
  });
}

function buildCartridge(host, detail = {}) {
  const frame = detail.frame ?? host.__atlasApuFrame?.frame;
  if (!frame) return null;
  const source = telemetrySourceLabel(host, detail);
  const plan = planForFrame(frame, source);
  if (!plan) return null;
  const commit = commitIdentity();
  const replaySeed = currentReplaySeed();
  const diagnosticGuard = detail.composition?.diagnostics?.scorePlanGuard;
  const guard = diagnosticGuard?.active === true
    ? diagnosticGuard
    : scorePlanGuardForFrame({ scorePlan: plan });
  const sampleFree = sampleFreeStatus(detail, plan);
  const blackBoxCartridge = createAtlasApuBlackBoxCartridge({
    frame,
    scorePlan: plan,
    source,
    routeMode: routeModeLabel(),
    replaySeed,
    replayUrl: makeReplayUrl({
      frameSeed: plan.seed,
      frameId: plan.frameId,
      dominantState: plan.dominantState,
      source,
      replaySeed,
    }).href,
    engineVersion: SYSTEM_SYMPHONY_BUILD_ID,
    commit,
    sampleFreeGuardStatus: guard?.active === true ? `${sampleFree} / ${guard.mode}` : `${sampleFree} / pending`,
    build: {
      engineControlsVersion: detail.composition?.diagnostics?.engineControlsBuildId ?? "pending",
    },
    origin: window.location.origin,
  });

  return decorateCartridgeForDisplay(blackBoxCartridge, frame);
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

  setProofPair("commit", payload.commit);
  setProofPair("engine", payload.engineVersion);
  setProofPair("source", payload.source);
  setProofPair("frame-time", payload.frameTime);
  setProofPair("route", payload.routeMode);
  setProofPair("frame-seed", payload.frameSeed);
  setProofPair("sample-free", payload.sampleFreeGuard);
  const proofReplay = byId("page-proof-replay");
  if (proofReplay) {
    proofReplay.href = payload.replayUrl;
    proofReplay.textContent = "available";
  }
  document.querySelector("[data-cover-movement]")?.replaceChildren(document.createTextNode(payload.movement ?? "Unknown Drift"));
  document.querySelector("[data-cover-source]")?.replaceChildren(document.createTextNode(payload.source ?? "connecting"));
  const cover = document.querySelector("[data-current-cartridge-cover]");
  if (cover) cover.dataset.state = payload.dominantState ?? "unknown";
  const json = document.querySelector("[data-cartridge-json]");
  if (json) json.textContent = JSON.stringify(payload, null, 2);
  const status = document.querySelector("[data-cartridge-status]");
  if (status) status.textContent = `Cartridge armed: ${payload.dominantState} / ${payload.source}.`;
  setTrustStatus(sourceHonestyMessage(payload.source));
  highlightApuRole(document.getElementById(HOST_ID)?.dataset.apuRoleHighlight);
}

function refreshCartridge(host, detail = host.__atlasApuFrame ?? {}) {
  renderCartridge(buildCartridge(host, detail));
}

function setFlightRecorderField(name, value) {
  const node = document.querySelector(`[data-flight-recorder-field="${name}"]`);
  if (node) node.textContent = String(value ?? "unknown");
}

function setFlightRecorderStatus(message) {
  const status = document.querySelector("[data-flight-recorder-status]");
  if (status) status.textContent = message;
}

function renderFlightRecorderJson(cartridge) {
  const json = document.querySelector("[data-flight-recorder-json]");
  if (!json) return;
  json.textContent = cartridge
    ? JSON.stringify(cartridge, null, 2)
    : "Select a static archive cartridge to inspect its black-box proof.";
}

function selectArchivedCartridge(cartridge, host, { armReplay = true } = {}) {
  if (!cartridge) return;
  const displayCartridge = decorateCartridgeForDisplay(cartridge, cartridge.telemetrySnapshot);
  const validation = validateBlackBoxCartridge(cartridge);
  renderFlightRecorderJson(cartridge);
  setFlightRecorderField("selected", cartridge.cartridgeId ?? cartridge.seed ?? "pending");
  setFlightRecorderField("schema", validation.valid ? cartridge.schemaVersion : `invalid: ${validation.missing.join(", ")}`);
  const summary = cartridgeSummary(cartridge);
  if (armReplay) {
    selectProofPanel("blackbox");
    renderCartridge(displayCartridge);
    const seed = document.querySelector("[data-page-replay-seed]");
    const profile = document.querySelector("[data-page-replay-profile]");
    if (seed) seed.value = normaliseReplaySeed(cartridge.replaySeed);
    if (profile) profile.value = normaliseReplayProfile(cartridge.dominantState);
    syncMode("replay");
    applyReplay(host);
    setReplayStatus(`Archived fixture cartridge armed: ${summary}.`);
  }
  setFlightRecorderStatus(`Inspecting static fixture cartridge ${cartridge.cartridgeId}. Live persistence is not enabled.`);
  for (const button of document.querySelectorAll("[data-flight-recorder-inspect]")) {
    button.setAttribute("aria-pressed", String(button.dataset.flightRecorderInspect === cartridge.cartridgeId));
  }
}

function renderFlightRecorderArchive(archive, host) {
  archivedCartridges = [...(archive.cartridges ?? [])];
  const list = document.querySelector("[data-flight-recorder-list]");
  setFlightRecorderField("archive", archive.archiveVersion ?? "static");
  setFlightRecorderField("count", archivedCartridges.length);
  setFlightRecorderField("schema", archive.schemaVersion ?? "unknown");
  if (!list) return;
  list.replaceChildren();
  for (const cartridge of archivedCartridges) {
    const validation = validateBlackBoxCartridge(cartridge);
    const item = document.createElement("article");
    item.className = "symphony-flight-recorder-card";
    item.dataset.state = cartridge.dominantState ?? "unknown";

    const heading = document.createElement("h3");
    heading.textContent = cartridge.movementName ?? cartridge.movement ?? "Unknown Drift";
    const proof = document.createElement("p");
    proof.textContent = `${cartridge.source} / ${cartridge.seed} / ${cartridge.sampleFreeGuardStatus}`;
    const meta = document.createElement("p");
    meta.textContent = validation.valid
      ? `Schema ${cartridge.schemaVersion} / commit ${cartridge.commit}`
      : `Invalid cartridge: ${validation.missing.join(", ")}`;

    const actions = document.createElement("div");
    actions.className = "symphony-flight-recorder-card__actions";
    const inspect = document.createElement("button");
    inspect.type = "button";
    inspect.className = "focus-action";
    inspect.dataset.flightRecorderInspect = cartridge.cartridgeId;
    inspect.setAttribute("aria-pressed", "false");
    inspect.textContent = "Inspect";
    inspect.addEventListener("click", () => selectArchivedCartridge(cartridge, host));
    const replay = document.createElement("a");
    replay.className = "focus-action";
    replay.href = cartridge.replayUrl;
    replay.textContent = "Replay";
    actions.append(inspect, replay);
    item.append(heading, proof, meta, actions);
    list.append(item);
  }
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("symphonyCartridge") ?? params.get("cartridge");
  const selected = archivedCartridges.find((cartridge) => cartridge.cartridgeId === requested) ?? null;
  if (selected) selectArchivedCartridge(selected, host, { armReplay: true });
  else if (archivedCartridges[0]) selectArchivedCartridge(archivedCartridges[0], host, { armReplay: false });
  else {
    renderFlightRecorderJson(null);
    setFlightRecorderStatus("Flight recorder archive is empty. Live persistence is not enabled.");
  }
}

async function loadFlightRecorderArchive(host) {
  try {
    const response = await fetch(FLIGHT_RECORDER_ARCHIVE_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`archive answered ${response.status}`);
    const archive = materializeBlackBoxArchive(await response.json(), {
      origin: window.location.origin,
    });
    renderFlightRecorderArchive(archive, host);
    setFlightRecorderStatus(`${archive.cartridges.length} static fixture cartridges available. Live persistence is not enabled.`);
  } catch (error) {
    console.warn("system-symphony-page: flight recorder archive unavailable", error);
    archivedCartridges = [];
    setFlightRecorderField("archive", "unavailable");
    setFlightRecorderField("count", "0");
    setFlightRecorderField("selected", "none");
    setFlightRecorderField("schema", "unavailable");
    renderFlightRecorderJson(null);
    setFlightRecorderStatus("Static flight recorder archive is unavailable. Live instrument behavior is unchanged.");
  }
}

function setIncidentArcField(name, value) {
  const node = document.querySelector(`[data-incident-arc-field="${name}"]`);
  if (node) node.textContent = String(value ?? "unknown");
}

function setIncidentArcStatus(message) {
  const status = document.querySelector("[data-incident-arc-status]");
  if (status) status.textContent = message;
}

function renderIncidentProgress({ playing = false } = {}) {
  const progress = document.querySelector("[data-incident-arc-progress]");
  const bar = document.querySelector("[data-incident-arc-progress-bar]");
  if (!progress || !bar || !selectedIncidentArc) return;
  const cartridge = selectedIncidentArc.frameCartridges[incidentArcIndex];
  if (!cartridge) {
    progress.hidden = true;
    return;
  }
  progress.hidden = false;
  progress.dataset.playing = String(playing);
  progress.dataset.state = cartridge.dominantState ?? "unknown";
  progress.style.setProperty("--incident-frame-ms", `${INCIDENT_ARC_FRAME_MS}ms`);
  progress.setAttribute(
    "aria-label",
    `Holding incident stage ${incidentArcIndex + 1} of ${selectedIncidentArc.frameCartridges.length} for ${INCIDENT_ARC_FRAME_MS / 1000} seconds.`,
  );
  bar.style.animation = "none";
  bar.style.transform = "scaleX(0)";
  if (playing) {
    void bar.offsetWidth;
    bar.style.animation = `symphony-incident-progress ${INCIDENT_ARC_FRAME_MS}ms linear forwards`;
  }
}

function renderIncidentArcJson(arc) {
  const json = document.querySelector("[data-incident-arc-json]");
  if (!json) return;
  json.textContent = arc
    ? JSON.stringify(arc, null, 2)
    : "Select a static incident arc to inspect its movement JSON.";
}

function clearIncidentArcTimer() {
  if (incidentArcTimer === null) return;
  window.clearInterval(incidentArcTimer);
  incidentArcTimer = null;
}

function updateIncidentUrl(arc, index) {
  const url = new URL(window.location.href);
  url.searchParams.set("symphonyMode", "replay");
  url.searchParams.set("symphonyIncident", arc.incidentId);
  url.searchParams.set("symphonyIncidentStep", String(index + 1));
  window.history.replaceState({}, "", url);
}

function renderIncidentTimeline(arc) {
  const timeline = document.querySelector("[data-incident-arc-timeline]");
  if (!timeline) return;
  timeline.replaceChildren();
  for (const cartridge of arc?.frameCartridges ?? []) {
    const stage = document.createElement("button");
    stage.type = "button";
    stage.className = "symphony-incident-stage";
    stage.dataset.incidentArcStep = String(cartridge.incidentFrame.index);
    stage.dataset.state = cartridge.dominantState ?? "unknown";
    stage.setAttribute("aria-pressed", String(cartridge.incidentFrame.index === incidentArcIndex));
    stage.classList.toggle("is-active", cartridge.incidentFrame.index === incidentArcIndex);

    const badge = document.createElement("span");
    badge.className = "symphony-incident-stage__badge";
    badge.textContent = `Stage ${cartridge.incidentFrame.index + 1}`;

    const heading = document.createElement("h3");
    heading.textContent = cartridge.incidentFrame.label;
    const state = document.createElement("p");
    state.className = "symphony-incident-stage__state";
    state.textContent = `${cartridge.dominantLabel} / ${cartridge.movementName}`;
    const proof = document.createElement("p");
    proof.className = "symphony-incident-stage__proof";
    proof.textContent = `${cartridge.frameTime} / ${cartridge.seed}`;
    stage.append(badge, heading, state, proof);
    stage.addEventListener("click", () => {
      clearIncidentArcTimer();
      armIncidentArcFrame(arc, cartridge.incidentFrame.index);
    });
    timeline.append(stage);
  }
}

function renderIncidentImpact(arc, activeCartridge) {
  const impact = document.querySelector("[data-incident-arc-impact]");
  if (!impact) return;
  impact.replaceChildren();
  const activeNames = new Set((activeCartridge?.telemetrySnapshot?.voices ?? [])
    .filter((voice) => voice.status !== "healthy" || voice.measured === false)
    .map((voice) => voice.name));
  for (const service of arc?.affectedServices ?? []) {
    const badge = document.createElement("span");
    badge.className = "symphony-incident-impact";
    badge.classList.toggle("is-active", activeNames.has(service.name));
    badge.textContent = `${service.displayName} / ${service.statuses.join("+")}`;
    impact.append(badge);
  }
}

function armIncidentArcFrame(arc = selectedIncidentArc, index = incidentArcIndex, { updateUrl = true, playing = false } = {}) {
  if (!arc) return false;
  const boundedIndex = Math.max(0, Math.min(index, arc.frameCartridges.length - 1));
  const cartridge = arc.frameCartridges[boundedIndex];
  if (!cartridge) return false;
  incidentArcIndex = boundedIndex;
  selectedIncidentArc = arc;
  selectProofPanel("incident");
  renderCartridge(decorateCartridgeForDisplay(cartridge, cartridge.telemetrySnapshot));
  renderIncidentTimeline(arc);
  renderIncidentImpact(arc, cartridge);
  renderIncidentProgress({ playing });
  setIncidentArcField("selected", `${arc.incidentId} / ${boundedIndex + 1} of ${arc.frameCartridges.length}`);
  setIncidentArcField("path", arc.stateTransitionPath.join(" -> "));
  const seed = document.querySelector("[data-page-replay-seed]");
  const profile = document.querySelector("[data-page-replay-profile]");
  if (seed) seed.value = normaliseReplaySeed(cartridge.replaySeed);
  if (profile) profile.value = normaliseReplayProfile(cartridge.dominantState);
  syncMode("replay");
  const host = document.getElementById(HOST_ID);
  if (host) applyReplay(host);
  if (updateUrl) updateIncidentUrl(arc, boundedIndex);
  const hold = `${INCIDENT_ARC_FRAME_MS / 1000}s hold`;
  const prefix = playing ? "Performing" : "Armed";
  setIncidentArcStatus(`${prefix} stage ${boundedIndex + 1} of ${arc.frameCartridges.length}: ${cartridge.incidentFrame.label} / ${cartridge.source} / ${hold}.`);
  return true;
}

function selectIncidentArc(arc, { armReplay = false, index = 0 } = {}) {
  if (!arc) return;
  selectedIncidentArc = arc;
  incidentArcIndex = Math.max(0, Math.min(index, arc.frameCartridges.length - 1));
  const validation = validateIncidentArc(arc);
  renderIncidentArcJson(arc);
  renderIncidentTimeline(arc);
  renderIncidentImpact(arc, arc.frameCartridges[incidentArcIndex]);
  setIncidentArcField("selected", arc.incidentId);
  setIncidentArcField("path", arc.stateTransitionPath.join(" -> "));
  setIncidentArcStatus(validation.valid
    ? `Ready: ${incidentArcSummary(arc)}. Static fixture evidence only.`
    : `Invalid incident arc: ${validation.missing.join(", ")}.`);
  if (armReplay) armIncidentArcFrame(arc, incidentArcIndex);
}

function playIncidentArc({ startAudio = false } = {}) {
  if (!selectedIncidentArc) {
    setIncidentArcStatus("No incident arc is available.");
    return;
  }
  const host = document.getElementById(HOST_ID);
  const audioRunning = startAudio ? ensureConsoleAudioRunning(host) : host?.dataset.running === "1";
  clearIncidentArcTimer();
  armIncidentArcFrame(selectedIncidentArc, 0, { playing: true });
  setIncidentArcStatus(`${audioRunning ? "Boss track playing" : "Timeline playing silently"}: warning -> critical -> recovery, ${INCIDENT_ARC_FRAME_MS / 1000}s per frame.`);
  incidentArcTimer = window.setInterval(() => {
    const nextIndex = incidentArcIndex + 1;
    if (nextIndex >= selectedIncidentArc.frameCartridges.length) {
      clearIncidentArcTimer();
      renderIncidentProgress({ playing: false });
      setIncidentArcStatus(`Incident arc complete: ${selectedIncidentArc.recoveryMarker?.label ?? "sequence ended"}.`);
      return;
    }
    armIncidentArcFrame(selectedIncidentArc, nextIndex, { playing: true });
  }, INCIDENT_ARC_FRAME_MS);
}

function installIncidentArcControls() {
  document.querySelector("[data-incident-arc-audition]")?.addEventListener("click", () => playIncidentArc({ startAudio: true }));
  document.querySelector("[data-incident-arc-play]")?.addEventListener("click", () => playIncidentArc());
  document.querySelector("[data-incident-arc-stop]")?.addEventListener("click", () => {
    clearIncidentArcTimer();
    renderIncidentProgress({ playing: false });
    setIncidentArcStatus("Incident arc playback stopped.");
  });
  document.querySelector("[data-incident-arc-prev]")?.addEventListener("click", () => {
    clearIncidentArcTimer();
    renderIncidentProgress({ playing: false });
    armIncidentArcFrame(selectedIncidentArc, incidentArcIndex - 1);
  });
  document.querySelector("[data-incident-arc-next]")?.addEventListener("click", () => {
    clearIncidentArcTimer();
    renderIncidentProgress({ playing: false });
    armIncidentArcFrame(selectedIncidentArc, incidentArcIndex + 1);
  });
  window.addEventListener("pagehide", clearIncidentArcTimer, { once: true });
}

function renderIncidentArcArchive(archive) {
  incidentArcs = [...(archive.incidentArcs ?? [])];
  setIncidentArcField("archive", archive.archiveVersion ?? "static");
  setIncidentArcField("count", incidentArcs.length);
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("symphonyIncident") ?? params.get("incident");
  const requestedStep = Math.max(0, (Number(params.get("symphonyIncidentStep")) || 1) - 1);
  const selected = incidentArcs.find((arc) => arc.incidentId === requested)
    ?? incidentArcs[0]
    ?? null;
  if (selected) {
    selectIncidentArc(selected, {
      armReplay: Boolean(requested),
      index: requested ? requestedStep : 0,
    });
  } else {
    renderIncidentArcJson(null);
    setIncidentArcStatus("Incident arc archive is empty. Live persistence is not enabled.");
  }
}

async function loadIncidentArcArchive() {
  try {
    const response = await fetch(INCIDENT_ARC_ARCHIVE_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`incident archive answered ${response.status}`);
    const archive = materializeIncidentArcArchive(await response.json(), {
      origin: window.location.origin,
    });
    renderIncidentArcArchive(archive);
  } catch (error) {
    console.warn("system-symphony-page: incident arc archive unavailable", error);
    incidentArcs = [];
    selectedIncidentArc = null;
    setIncidentArcField("archive", "unavailable");
    setIncidentArcField("count", "0");
    setIncidentArcField("selected", "none");
    setIncidentArcField("path", "unavailable");
    renderIncidentArcJson(null);
    setIncidentArcStatus("Static incident arc archive is unavailable. Live instrument behavior is unchanged.");
  }
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
  const initialProofPanel = params.get("symphonyProof");
  const initialProfile = normaliseReplayProfile(params.get("symphonyScene"));
  const initialSeed = normaliseReplaySeed(params.get("symphonySeed"));
  let replayRetryTimer = null;
  const profile = document.querySelector("[data-page-replay-profile]");
  const seed = document.querySelector("[data-page-replay-seed]");
  if (profile) profile.value = initialProfile;
  if (seed) seed.value = initialSeed;
  syncMode(initialMode, { push: false });
  selectProofPanel(PROOF_PANELS.has(initialProofPanel) ? initialProofPanel : activeProofPanel);
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
      scrollToPanel(byId("symphony-trace-surface"));
    });
  }
  for (const tab of document.querySelectorAll("[data-proof-tab]")) {
    tab.addEventListener("click", () => selectProofPanel(tab.dataset.proofTab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...document.querySelectorAll("[data-proof-tab]")];
      const index = tabs.indexOf(tab);
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(index + offset + tabs.length) % tabs.length];
      next.focus();
      next.click();
    });
  }
  for (const opener of document.querySelectorAll("[data-proof-open]")) {
    opener.addEventListener("click", (event) => {
      event.preventDefault();
      syncMode("trace");
      setTrustLayer(true);
      selectProofPanel(opener.dataset.proofOpen, { scroll: true });
    });
  }
  for (const trustToggle of document.querySelectorAll("[data-trust-toggle]")) {
    trustToggle.addEventListener("click", () => {
      const layer = document.querySelector("[data-trust-layer]");
      setTrustLayer(layer?.hidden !== false);
    });
  }
  document.querySelector("[data-trust-close]")?.addEventListener("click", () => setTrustLayer(false));
  for (const roleButton of document.querySelectorAll("[data-apu-role-highlight]")) {
    roleButton.addEventListener("click", () => {
      const pressed = roleButton.getAttribute("aria-pressed") === "true";
      highlightApuRole(pressed ? "" : roleButton.dataset.apuRoleHighlight);
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
  for (const copyButton of document.querySelectorAll("[data-cartridge-copy]")) {
    copyButton.addEventListener("click", copyCartridgeJson);
  }
  for (const downloadButton of document.querySelectorAll("[data-cartridge-download]")) {
    downloadButton.addEventListener("click", downloadCartridgeJson);
  }
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
    installIncidentArcControls();
    syncSummary(host);
    await loadFlightRecorderArchive(host);
    await loadIncidentArcArchive();
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
