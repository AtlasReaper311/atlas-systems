import { subscribe as subscribeRegistry } from "./atlas-registry.js?v=20260720-esm-live";

const section = document.getElementById("live");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const TELEMETRY_ENDPOINT = "https://api.atlas-systems.uk/specular";
const TELEMETRY_POLL_MS = 60_000;
const AGE_TICK_MS = 5_000;
const EXCLUDED_WORKERS = new Set(["simple-proxy"]);

const BOOT = [
  ['<span class="acc">SPECULAR-CORE // LIVE</span> :: attaching feeds', 0],
  ['[<span class="ok">ok</span>] telemetry <span class="by">· api.atlas-systems.uk/specular</span>', 150],
  ['[<span class="ok">ok</span>] worker registry <span class="by">· api.atlas-systems.uk · 60s poll</span>', 150],
  ['[<span class="ok">ok</span>] corpus index <span class="by">· corpus.atlas-systems.uk</span>', 140],
  ['[<span class="ok">ok</span>] all feeds attached · <span class="acc">cockpit online</span>', 150],
];

let booted = false;
let sampledAt = null;
let telemetryTimer = null;
let ageTimer = null;
let unsubscribeRegistry = null;

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = byId(id);
  if (element) element.textContent = value;
}

function revealPanels() {
  const panels = section?.querySelectorAll(".live-panel") || [];
  panels.forEach((panel, index) => {
    if (reduceMotion) {
      panel.classList.add("in");
      return;
    }
    window.setTimeout(() => panel.classList.add("in"), index * 130);
  });
}

function runBoot() {
  const bootElement = byId("live-boot");
  if (!bootElement) {
    revealPanels();
    return;
  }

  if (reduceMotion) {
    for (const [html] of BOOT) {
      const line = document.createElement("div");
      line.className = "live-boot-line show";
      line.innerHTML = html;
      bootElement.appendChild(line);
    }
    revealPanels();
    return;
  }

  let elapsed = 150;
  for (const [html, delay] of BOOT) {
    elapsed += delay;
    window.setTimeout(() => {
      const line = document.createElement("div");
      line.className = "live-boot-line";
      line.innerHTML = html;
      bootElement.appendChild(line);
      requestAnimationFrame(() => line.classList.add("show"));
    }, elapsed);
  }

  window.setTimeout(revealPanels, elapsed + 260);
}

function uptimeHuman(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `up ${days ? `${days}d ` : ""}${hours}h ${minutes}m`;
}

function renderCores(perCore) {
  const strip = byId("spw-cores");
  if (!strip) return;

  while (strip.children.length < perCore.length) {
    const bar = document.createElement("span");
    bar.className = "sp-w-core";
    bar.appendChild(document.createElement("i"));
    strip.appendChild(bar);
  }

  for (let index = 0; index < perCore.length; index += 1) {
    strip.children[index].firstChild.style.height =
      `${Math.max(4, Math.min(100, perCore[index]))}%`;
  }
}

function renderModels(loaded) {
  const wrap = byId("spw-models");
  if (!wrap) return;

  wrap.replaceChildren();
  for (const model of loaded) {
    const chip = document.createElement("span");
    chip.className = "sp-w-chip";
    chip.textContent = model.name;
    wrap.appendChild(chip);
  }
}

function renderTelemetry(payload) {
  const root = byId("specular-widget");
  const feedDot = byId("live-feed-telemetry");
  if (!root) return;

  root.dataset.state = payload.online ? "online" : "offline";
  if (feedDot) feedDot.dataset.state = payload.online ? "ok" : "down";
  window.dispatchEvent(new CustomEvent("atlas:telemetry", { detail: payload }));

  const telemetry = payload.telemetry;
  if (payload.online) {
    sampledAt = Date.parse(telemetry?.sampled_at || "");
  } else {
    sampledAt = null;
    const seen = payload.last_seen
      ? new Date(payload.last_seen).toLocaleString()
      : "never";
    setText(
      "spw-offline",
      `SPECULAR-CORE is offline. Last seen ${seen}${telemetry ? "; showing the last reported snapshot." : "."}`,
    );
    setText("spw-age", "offline");
  }

  if (!telemetry) return;

  setText("spw-host", telemetry.host?.hostname || "SPECULAR-CORE");
  setText("spw-uptime", payload.online ? uptimeHuman(telemetry.host?.uptime_s || 0) : "");
  setText("spw-platform", telemetry.host?.platform || "");

  if (telemetry.gpu) {
    setText("spw-gpu-util", telemetry.gpu.utilisation_pct);
    const vramPct = telemetry.gpu.vram_total_mb
      ? (100 * telemetry.gpu.vram_used_mb) / telemetry.gpu.vram_total_mb
      : 0;
    const vramFill = byId("spw-vram-fill");
    if (vramFill) vramFill.style.width = `${vramPct.toFixed(0)}%`;
    setText(
      "spw-vram",
      `VRAM ${(telemetry.gpu.vram_used_mb / 1024).toFixed(1)} / ${(telemetry.gpu.vram_total_mb / 1024).toFixed(1)} GB`,
    );
    setText("spw-gpu-line", `${telemetry.gpu.name} · ${telemetry.gpu.temperature_c}°C`);
  } else {
    setText("spw-gpu-util", "–");
    setText("spw-gpu-line", "no NVIDIA stats");
  }

  setText("spw-cpu", Math.round(telemetry.cpu?.overall_pct || 0));
  renderCores(telemetry.cpu?.per_core_pct || []);
  setText(
    "spw-cpu-line",
    `${telemetry.cpu?.cores?.logical || 0} threads${telemetry.cpu?.freq_mhz?.current ? ` · ${(telemetry.cpu.freq_mhz.current / 1000).toFixed(1)} GHz` : ""}`,
  );

  setText("spw-ram", Math.round(telemetry.ram?.pct || 0));
  const ramFill = byId("spw-ram-fill");
  if (ramFill) ramFill.style.width = `${(telemetry.ram?.pct || 0).toFixed(0)}%`;
  setText("spw-ram-line", `${telemetry.ram?.used_gb || 0} / ${telemetry.ram?.total_gb || 0} GB`);

  if (telemetry.ollama?.reachable) {
    const loaded = telemetry.ollama.loaded || [];
    const available = telemetry.ollama.available || [];
    setText(
      "spw-ollama-line",
      loaded.length
        ? `${loaded.length} loaded · ${available.length} available`
        : `idle · ${available.length} models available`,
    );
    renderModels(loaded);
  } else {
    setText("spw-ollama-line", "not running");
    renderModels([]);
  }
}

function tickAge() {
  if (sampledAt !== null && Number.isFinite(sampledAt)) {
    const age = Math.max(0, Math.round((Date.now() - sampledAt) / 1000));
    setText("spw-age", `sampled ${age}s ago`);
  }
}

function clearTelemetryTimers() {
  if (telemetryTimer !== null) {
    clearTimeout(telemetryTimer);
    telemetryTimer = null;
  }
  if (ageTimer !== null) {
    clearTimeout(ageTimer);
    ageTimer = null;
  }
}

function scheduleAgeTick() {
  if (document.hidden || !booted) return;
  ageTimer = window.setTimeout(() => {
    ageTimer = null;
    tickAge();
    scheduleAgeTick();
  }, AGE_TICK_MS);
}

async function refreshTelemetry() {
  if (document.hidden || !booted) return;

  try {
    const response = await fetch(TELEMETRY_ENDPOINT, { cache: "no-store" });
    if (!response.ok) throw new Error(`telemetry ${response.status}`);
    renderTelemetry(await response.json());
  } catch {
    const root = byId("specular-widget");
    const feedDot = byId("live-feed-telemetry");
    if (root) root.dataset.state = "offline";
    if (feedDot) feedDot.dataset.state = "down";
    setText("spw-offline", "Telemetry endpoint unreachable from this browser.");
    setText("spw-age", "offline");
  } finally {
    if (!document.hidden && booted) {
      telemetryTimer = window.setTimeout(() => {
        telemetryTimer = null;
        void refreshTelemetry();
      }, TELEMETRY_POLL_MS);
    }
  }
}

function renderEstateStatus(snapshot) {
  const line = byId("live-estate-line");
  const sub = byId("live-estate-sub");
  const list = byId("live-workers");
  const feedDot = byId("live-feed-registry");

  if (!snapshot.ok && !snapshot.stale) {
    if (feedDot) feedDot.dataset.state = "down";
    if (line) line.textContent = "registry unreachable";
    if (sub) sub.textContent = "no live estate data from this browser";
    if (list) list.replaceChildren();
    return;
  }

  if (feedDot) feedDot.dataset.state = snapshot.stale ? "warn" : "ok";

  const workers = (snapshot.workers || []).filter(
    (worker) => !EXCLUDED_WORKERS.has(worker.name),
  );
  const documented = workers.filter((worker) => worker.documented).length;
  const pending = workers.length - documented;

  if (line) {
    line.textContent = `${workers.length} workers · ${documented} documented · ${pending} pending /_meta`;
  }
  if (sub) {
    sub.textContent =
      `${snapshot.stale ? "stale snapshot · " : ""}` +
      `${snapshot.generatedAt ? `registry built ${snapshot.generatedAt.slice(11, 16)}Z · ` : ""}` +
      "rebuilt hourly";
  }

  if (!list) return;

  const fragment = document.createDocumentFragment();
  const sorted = [...workers].sort((a, b) => {
    if (a.documented !== b.documented) return a.documented ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const worker of sorted) {
    const row = document.createElement("div");
    row.className = "live-worker-row";
    row.dataset.st = worker.documented ? "live" : "undoc";

    const dot = document.createElement("span");
    dot.className = "live-worker-dot";
    const name = document.createElement("span");
    name.className = "live-worker-name";
    name.textContent = worker.name;
    const note = document.createElement("span");
    note.className = "live-worker-note";
    note.textContent = worker.documented
      ? worker.meta?.description || ""
      : worker.note || "no /_meta yet";

    row.append(dot, name, note);
    fragment.appendChild(row);
  }

  list.replaceChildren(fragment);
}

function startSection() {
  if (booted || !section) return;
  booted = true;
  runBoot();

  unsubscribeRegistry = subscribeRegistry(renderEstateStatus);
  void refreshTelemetry();
  scheduleAgeTick();
}

function handleVisibilityChange() {
  if (document.hidden) {
    clearTelemetryTimers();
    return;
  }

  if (booted) {
    void refreshTelemetry();
    scheduleAgeTick();
  }
}

if (section) {
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        startSection();
        observer.disconnect();
      }
    }, { threshold: 0.2 });
    observer.observe(section);
  } else {
    startSection();
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", () => {
    clearTelemetryTimers();
    unsubscribeRegistry?.();
    unsubscribeRegistry = null;
  }, { once: true });
}
