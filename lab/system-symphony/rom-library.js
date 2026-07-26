import {
  cartridgeSummary,
  materializeBlackBoxArchive,
  validateBlackBoxCartridge,
} from "../../static/js/sonify/atlas-apu-flight-recorder.js?v=20260726-atlas-apu-black-box-v1";
import {
  incidentArcSummary,
  materializeIncidentArcArchive,
  validateIncidentArc,
} from "../../static/js/sonify/atlas-apu-incident-arc.js?v=20260726-atlas-apu-incident-arc-v1";

const ARCHIVE_URL = "/lab/system-symphony/black-box/archive.json?v=20260726-phase9-flight-recorder";
const INCIDENT_URL = "/lab/system-symphony/black-box/incident-arcs.json?v=20260726-phase10-incident-boss-track";

function text(value, fallback = "unknown") {
  return String(value ?? fallback);
}

function setStatus(message) {
  const status = document.querySelector("[data-rom-status]");
  if (status) status.textContent = message;
}

function setJson(payload, { reveal = false } = {}) {
  const json = document.querySelector("[data-rom-json]");
  if (json) json.textContent = JSON.stringify(payload, null, 2);
  if (!reveal) return;
  const inspector = document.querySelector("[data-rom-inspector]");
  if (inspector) {
    inspector.open = true;
    inspector.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  json?.focus({ preventScroll: true });
}

function categoryFor(cartridge) {
  if (cartridge.dominantState === "healthy") return "Healthy cartridge";
  if (cartridge.dominantState === "warning") return "Warning cartridge";
  if (cartridge.dominantState === "critical") return "Critical cartridge";
  if (cartridge.dominantState === "unknown") return "Unknown cartridge";
  return "Recovery cartridge";
}

function sourceCategory(cartridge) {
  if (cartridge.source === "fixture") return "Fixture cartridge";
  if (cartridge.source === "replay") return "Replay evidence";
  if (cartridge.source === "live stale" || cartridge.source === "stale") return "Stale live evidence";
  if (cartridge.source === "live") return "Live evidence";
  return "Source unknown";
}

function proofLine(cartridge) {
  return [
    `seed ${cartridge.seed ?? cartridge.frameSeed ?? "pending"}`,
    `source ${cartridge.source ?? "unknown"}`,
    `commit ${cartridge.commit ?? "unavailable"}`,
    `sample-free ${cartridge.sampleFree ?? "unknown"}`,
  ].join(" / ");
}

function cardAction(label, href) {
  const link = document.createElement("a");
  link.className = "focus-action";
  link.href = href;
  link.textContent = label;
  return link;
}

function renderCartridgeCard(cartridge) {
  const article = document.createElement("article");
  article.className = "symphony-rom-card";
  article.dataset.state = cartridge.dominantState ?? "unknown";

  const cover = document.createElement("div");
  cover.className = "symphony-rom-card__cover";
  cover.dataset.state = cartridge.dominantState ?? "unknown";
  const chip = document.createElement("span");
  chip.textContent = "ATLAS APU-01";
  const movement = document.createElement("strong");
  movement.textContent = text(cartridge.movementName);
  const source = document.createElement("em");
  source.textContent = text(cartridge.source);
  cover.append(chip, movement, source);

  const body = document.createElement("div");
  body.className = "symphony-rom-card__body";
  const type = document.createElement("p");
  type.className = "symphony-panel-kicker";
  type.textContent = `${categoryFor(cartridge)} / ${sourceCategory(cartridge)}`;
  const title = document.createElement("h2");
  title.textContent = cartridge.movementName ?? cartridge.movement ?? "Unknown Drift";
  const summary = document.createElement("p");
  summary.textContent = cartridgeSummary(cartridge);
  const meta = document.createElement("dl");
  meta.className = "symphony-rom-meta";
  for (const [label, value] of [
    ["Dominant state", cartridge.dominantState],
    ["Chip law", cartridge.scorePlanVersion ?? cartridge.scorePlan?.buildId],
    ["Seed", cartridge.seed],
    ["Source", cartridge.source],
    ["Build", cartridge.engineVersion],
    ["Commit", cartridge.commit],
    ["Sample-free", cartridge.sampleFree],
  ]) {
    const item = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = text(value);
    item.append(dt, dd);
    meta.append(item);
  }

  const actions = document.createElement("div");
  actions.className = "symphony-rom-actions";
  actions.append(
    cardAction("Open", `/lab/system-symphony/?symphonyMode=replay&symphonyScene=${encodeURIComponent(cartridge.dominantState ?? "unknown")}&symphonySeed=${encodeURIComponent(cartridge.replaySeed ?? "A7A5")}&symphonyCartridge=${encodeURIComponent(cartridge.cartridgeId ?? "")}`),
    cardAction("Replay", cartridge.replayUrl),
  );
  const inspect = document.createElement("button");
  inspect.type = "button";
  inspect.className = "focus-action";
  inspect.textContent = "Inspect";
  inspect.addEventListener("click", () => {
    setJson(cartridge, { reveal: true });
    setStatus(`${proofLine(cartridge)}. Fixture, live, stale, and replay labels are preserved in the exported JSON.`);
  });
  actions.append(inspect);

  body.append(type, title, summary, meta, actions);
  article.append(cover, body);
  return article;
}

function renderIncidentCard(arc) {
  const article = document.createElement("article");
  article.className = "symphony-rom-card symphony-rom-card--incident";
  article.dataset.state = "recovery";

  const cover = document.createElement("div");
  cover.className = "symphony-rom-card__cover";
  cover.dataset.state = "recovery";
  const chip = document.createElement("span");
  chip.textContent = "INCIDENT ARC";
  const movement = document.createElement("strong");
  movement.textContent = text(arc.movementName);
  const source = document.createElement("em");
  source.textContent = text(arc.source);
  cover.append(chip, movement, source);

  const body = document.createElement("div");
  body.className = "symphony-rom-card__body";
  const type = document.createElement("p");
  type.className = "symphony-panel-kicker";
  type.textContent = `Historic incident cartridge / ${sourceCategory(arc)}`;
  const title = document.createElement("h2");
  title.textContent = arc.title ?? "Incident Replay";
  const summary = document.createElement("p");
  summary.textContent = incidentArcSummary(arc);
  const meta = document.createElement("dl");
  meta.className = "symphony-rom-meta";
  for (const [label, value] of [
    ["Path", arc.stateTransitionPath?.join(" -> ")],
    ["Frames", arc.frameCount],
    ["Seed", arc.replaySeed],
    ["Source", arc.source],
    ["Build", arc.archiveBuildId],
    ["Commit", arc.frameCartridges?.[0]?.commit],
    ["Sample-free", arc.sampleFreeGuardStatus],
  ]) {
    const item = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = text(value);
    item.append(dt, dd);
    meta.append(item);
  }

  const actions = document.createElement("div");
  actions.className = "symphony-rom-actions";
  actions.append(
    cardAction("Open", `/lab/system-symphony/?symphonyMode=replay&symphonyIncident=${encodeURIComponent(arc.incidentId)}&symphonyIncidentStep=1`),
    cardAction("Replay", arc.replayUrl),
  );
  const inspect = document.createElement("button");
  inspect.type = "button";
  inspect.className = "focus-action";
  inspect.textContent = "Inspect";
  inspect.addEventListener("click", () => {
    setJson(arc, { reveal: true });
    setStatus(`${arc.title}: ${validateIncidentArc(arc).valid ? "valid" : "invalid"} static fixture arc.`);
  });
  actions.append(inspect);

  body.append(type, title, summary, meta, actions);
  article.append(cover, body);
  return article;
}

async function loadJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

async function initialiseRomLibrary() {
  const list = document.querySelector("[data-rom-library]");
  if (!list) return;
  try {
    const [archivePayload, incidentPayload] = await Promise.all([
      loadJson(ARCHIVE_URL),
      loadJson(INCIDENT_URL),
    ]);
    const archive = materializeBlackBoxArchive(archivePayload, { origin: window.location.origin });
    const incidentArchive = materializeIncidentArcArchive(incidentPayload, { origin: window.location.origin });
    list.replaceChildren(
      ...archive.cartridges.map(renderCartridgeCard),
      ...incidentArchive.incidentArcs.map(renderIncidentCard),
    );
    const first = archive.cartridges[0] ?? incidentArchive.incidentArcs[0] ?? null;
    if (first) setJson(first);
    const validCount = archive.cartridges.filter((cartridge) => validateBlackBoxCartridge(cartridge).valid).length;
    setStatus(`${validCount} static cartridge(s) and ${incidentArchive.incidentArcs.length} incident arc(s) loaded. All are labelled fixture evidence until live persistence is approved.`);
  } catch (error) {
    console.warn("system-symphony-rom-library: archive unavailable", error);
    setStatus("Static ROM archive is unavailable. Live System SYMPHONY behavior is unchanged.");
  }
}

void initialiseRomLibrary();
