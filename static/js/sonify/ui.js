/**
 * System SYMPHONY compact widget and full telemetry console.
 *
 * Live mode is inspection-only. Preview mode clones the latest live snapshot and
 * mutates only local objects; this module never performs a write request.
 */

import {
  AUDIO_CONTEXT_BLOCKED_CODE,
  DEFAULT_USER_GAIN,
  SYSTEM_SYMPHONY_BUILD_ID,
  createEngine,
} from "./apu-production-engine.js?v=20260726-system-symphony-atlas-apu-live-v7";
import { createPoller } from "./poller.js?v=20260720-system-symphony-loop-production-v2";
import { buildHybridFrame } from "./apu-hybrid-state.js?v=20260726-system-symphony-evidence-hybrid-v2";
import {
  applyDemoProfileToServices,
  buildDependencyGraph,
  computeFrame,
  deriveDemoEstate,
  filterVoices,
} from "./mapping.js?v=20260720-system-symphony-loop-production-v2";
import {
  DEFAULT_PERFORMANCE_SEED,
  PERFORMANCE_MACRO_DEFAULTS,
  PERFORMANCE_SCENES,
  createPerformanceArrangement,
  formatPerformanceSeed,
  normalizePerformanceSeed,
} from "./performance.js?v=20260720-system-symphony-loop-production-v2";
import { resolveSamplePalette } from "./samples.js?v=20260720-system-symphony-loop-production-v2";
import {
  boardGeometry,
  chamferedPath,
  chipStateForVoice,
  copperRoute,
  routeOffsets,
} from "./trace-board.js?v=20260728-system-symphony-trace-board-v1";

if (typeof window !== "undefined") {
  window.__ATLAS_SYSTEM_SYMPHONY_BUILD__ = SYSTEM_SYMPHONY_BUILD_ID;
}
if (typeof document !== "undefined") {
  document.documentElement.dataset.systemSymphonyBuild = SYSTEM_SYMPHONY_BUILD_ID;
}

const WIDGET_ID = "system-symphony-widget";
const SVG_NS = "http://www.w3.org/2000/svg";
const NARROW_BOARD_QUERY = "(max-width: 700px)";

const STATUS_LABELS = {
  healthy: "Healthy",
  degraded: "Warning",
  down: "Critical",
  unknown: "Unknown",
};

const HELP_ROWS = [
  ["Overall estate health", "Harmony, tempo, industrial groove and master intensity"],
  ["Service status", "Synth family, articulation, density and stability"],
  ["Latency", "Low-pass cutoff and spectral openness"],
  ["Uptime / current state", "Brightness"],
  ["Error rate", "Instability, detuning and note confidence"],
  ["Active incidents", "Denser critical rhythm and harmonic tension"],
  ["New successful deployment", "One quantised amber hero motif"],
  ["Demo performance", "Ghost Circuit arrangement, dual synth arpeggio/riffs, club bass and mechanical drums"],
  ["Dependencies", "Topology edges"],
  ["Service identity", "Stable family, motif, register and stereo position"],
];

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function escapeText(value) {
  return String(value ?? "");
}

function formatPercent(value, digits = 0) {
  return Number.isFinite(value) ? `${value.toFixed(digits)}%` : "not measured";
}

function formatHealth(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : "unknown";
}

function formatLatency(value) {
  return Number.isFinite(value) ? `${Math.round(value)} ms` : "not measured";
}

function formatTimestamp(value) {
  if (!value) return "No successful update yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? escapeText(value)
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "medium" });
}

function metricValue(root, name, value) {
  const target = root.querySelector(`[data-metric="${name}"]`);
  if (target) target.textContent = value;
}

function maskedFrame(frame, muted, soloed) {
  const soloActive = soloed.size > 0;
  return {
    ...frame,
    voices: frame.voices.map((voice) => {
      const silenced =
        muted.has(voice.name) || (soloActive && !soloed.has(voice.name));
      return silenced
        ? { ...voice, voiceGain: 0, velocity: 0 }
        : voice;
    }),
  };
}

function template() {
  return `
    <section class="symphony-widget" aria-labelledby="symphony-widget-title">
      <div class="symphony-widget__signal" aria-hidden="true"></div>
      <div class="symphony-widget__topline">
        <div>
          <p class="symphony-kicker">Atlas APU live instrument</p>
          <h2 id="symphony-widget-title">SYSTEM <em>SYMPHONY</em></h2>
        </div>
        <span class="symphony-source-badge" data-source-badge>CONNECTING</span>
      </div>
      <div class="symphony-widget__readout">
        <strong data-compact-state>UNKNOWN</strong>
        <span data-compact-health>health --</span>
        <span data-compact-components>0 / 0 measured</span>
      </div>
      <div class="symphony-widget__controls">
        <button class="symphony-button symphony-button--primary" type="button" data-audio-toggle>Start</button>
        <label class="symphony-volume symphony-volume--compact">
          <span>Vol</span>
          <input type="range" min="0" max="100" step="1" value="${Math.round(DEFAULT_USER_GAIN * 100)}" data-volume aria-label="System SYMPHONY volume" />
        </label>
        <button class="symphony-button" type="button" data-open-console aria-expanded="false" aria-haspopup="dialog">Open console</button>
      </div>
    </section>

    <div class="symphony-overlay" data-overlay hidden>
      <section class="symphony-console" role="dialog" aria-modal="true" aria-labelledby="symphony-console-title" tabindex="-1">
        <header class="symphony-console__header">
          <div>
            <p class="symphony-kicker">Live estate Atlas APU score</p>
            <h2 id="symphony-console-title">System <em>SYMPHONY</em></h2>
            <p class="symphony-console__mode"><span data-dialog-source>CONNECTING</span> <span aria-hidden="true">/</span> <span data-dialog-score>Unknown score</span></p>
          </div>
          <div class="symphony-console__header-controls">
            <button class="symphony-button symphony-button--primary" type="button" data-audio-toggle>Start</button>
            <label class="symphony-volume">
              <span>Volume</span>
              <input type="range" min="0" max="100" step="1" value="${Math.round(DEFAULT_USER_GAIN * 100)}" data-volume aria-label="System SYMPHONY console volume" />
            </label>
            <button class="symphony-button" type="button" data-help-toggle aria-expanded="false">Mapping help</button>
            <button class="symphony-button symphony-button--icon" type="button" data-close-console aria-label="Close System SYMPHONY console">Close</button>
          </div>
        </header>

        <p class="symphony-important-status" data-important-status aria-live="polite"></p>

        <aside class="symphony-help" data-help hidden aria-label="Telemetry to APU role mapping">
          <div class="symphony-section-heading">
            <div><span>Reference</span><h3>What you are hearing</h3></div>
            <button class="symphony-button symphony-button--icon" type="button" data-help-close>Close help</button>
          </div>
          <p>Null measurements remain null. The score uses neutral musical defaults for continuity without claiming that a measurement exists.</p>
          <div class="symphony-help__table" data-help-rows></div>
        </aside>

        <div class="symphony-console__scroll">
          <section class="symphony-source-panel" aria-labelledby="symphony-source-title">
            <div>
              <span class="symphony-section-number">01</span>
              <h3 id="symphony-source-title">Signal source</h3>
              <p data-source-explanation>Reading current public telemetry. Live mode cannot alter estate state.</p>
            </div>
            <div class="symphony-source-panel__controls">
              <div class="symphony-segmented" role="group" aria-label="Symphony data source">
                <button type="button" data-live-mode aria-pressed="true">Live estate</button>
                <button type="button" data-demo-mode aria-pressed="false" disabled>Atlas APU audition</button>
              </div>
              <button class="symphony-button" type="button" data-demo-reset hidden>Reset preview from live</button>
              <div class="symphony-performance" data-performance-panel hidden>
                <div class="symphony-performance__header">
                  <span>Atlas APU // deterministic state audition</span>
                  <strong data-performance-scene>NIGHT DRIVE</strong>
                </div>
                <div class="symphony-demo-profiles">
                  <span>Musical scene</span>
                  <div role="group" aria-label="Demo musical scene">
                    <button type="button" data-demo-profile="custom" aria-pressed="true"><span>Custom</span><strong>Live snapshot</strong></button>
                    <button type="button" data-demo-profile="healthy" aria-pressed="false"><span>Healthy</span><strong>Explorer</strong></button>
                    <button type="button" data-demo-profile="warning" aria-pressed="false"><span>Warning</span><strong>Grid Pressure</strong></button>
                    <button type="button" data-demo-profile="critical" aria-pressed="false"><span>Critical</span><strong>Boss Protocol</strong></button>
                    <button type="button" data-demo-profile="unknown" aria-pressed="false"><span>Unknown</span><strong>Lost Signal</strong></button>
                  </div>
                </div>
                <div class="symphony-performance__macros" hidden>
                  <label><span>Energy <output data-performance-output="energy">${PERFORMANCE_MACRO_DEFAULTS.energy}</output></span><input type="range" min="0" max="100" step="1" value="${PERFORMANCE_MACRO_DEFAULTS.energy}" data-performance-macro="energy" /></label>
                  <label><span>Motion <output data-performance-output="motion">${PERFORMANCE_MACRO_DEFAULTS.motion}</output></span><input type="range" min="0" max="100" step="1" value="${PERFORMANCE_MACRO_DEFAULTS.motion}" data-performance-macro="motion" /></label>
                  <label><span>Grit <output data-performance-output="grit">${PERFORMANCE_MACRO_DEFAULTS.grit}</output></span><input type="range" min="0" max="100" step="1" value="${PERFORMANCE_MACRO_DEFAULTS.grit}" data-performance-macro="grit" /></label>
                  <label><span>Space <output data-performance-output="space">${PERFORMANCE_MACRO_DEFAULTS.space}</output></span><input type="range" min="0" max="100" step="1" value="${PERFORMANCE_MACRO_DEFAULTS.space}" data-performance-macro="space" /></label>
                </div>
                <div class="symphony-ghost-monitor" hidden>
                  <div class="symphony-ghost-monitor__heading">
                    <span>Ghost phase</span>
                    <strong data-ghost-phase>STANDBY</strong>
                  </div>
                  <ol class="symphony-ghost-phases" aria-label="Ghost Circuit arrangement phases">
                    <li data-ghost-phase-step="boot">Boot</li>
                    <li data-ghost-phase-step="drive">Drive</li>
                    <li data-ghost-phase-step="lift">Lift</li>
                    <li data-ghost-phase-step="drop">Drop</li>
                    <li data-ghost-phase-step="afterglow">Afterglow</li>
                  </ol>
                  <div class="symphony-ghost-monitor__actions">
                    <button class="symphony-button" type="button" data-ghost-focus aria-pressed="false">Ghost Circuit focus</button>
                    <button class="symphony-button" type="button" data-ghost-audition="arp" aria-pressed="false">Hear arp</button>
                    <button class="symphony-button" type="button" data-ghost-audition="riff" aria-pressed="false">Hear riff</button>
                  </div>
                  <p>Focus ducks the backing for A/B listening. Hear arp and Hear riff isolate each Ghost Circuit voice.</p>
                </div>
                <div class="symphony-performance__actions">
                  <button class="symphony-button symphony-button--primary" type="button" data-randomise-score>Randomise score</button>
                  <label class="symphony-performance__seed"><span>Score seed</span><input type="text" value="${DEFAULT_PERFORMANCE_SEED}" minlength="4" maxlength="8" pattern="[0-9A-Fa-f]{4,8}" spellcheck="false" autocomplete="off" data-performance-seed aria-describedby="symphony-performance-status" /></label>
                  <button class="symphony-button" type="button" data-replay-seed>Replay seed</button>
                </div>
                <p id="symphony-performance-status" class="symphony-performance__status" data-performance-status aria-live="polite">Seed ${DEFAULT_PERFORMANCE_SEED} ready</p>
              </div>
              <p class="symphony-update-time">Last successful telemetry: <time data-last-update>waiting</time></p>
            </div>
          </section>

          <section class="symphony-metrics" aria-label="Estate metrics">
            <article><span>Score state</span><strong data-metric="state">Unknown</strong></article>
            <article><span>Overall health</span><strong data-metric="health">unknown</strong></article>
            <article><span>Total components</span><strong data-metric="total">0</strong></article>
            <article><span>Measured</span><strong data-metric="measured">0</strong></article>
            <article><span>Warnings</span><strong data-metric="warnings">0</strong></article>
            <article><span>Failures / incidents</span><strong data-metric="failures">0 / 0</strong></article>
            <article><span>Unknown</span><strong data-metric="unknown">0</strong></article>
            <article><span>Unmeasured</span><strong data-metric="unmeasured">0</strong></article>
            <article class="symphony-metric-deploy"><span>Recent deployment</span><strong data-metric="deployment">baseline pending</strong></article>
          </section>

          <section class="symphony-hybrid-state" aria-labelledby="symphony-hybrid-state-title" data-hybrid-state>
            <div class="symphony-hybrid-state__head">
              <div><span>Hybrid score vector</span><h3 id="symphony-hybrid-state-title">One grammar, four audible layers</h3></div>
              <p data-dominant-reason>Waiting for the first evidence frame.</p>
            </div>
            <div class="symphony-state-vector" role="group" aria-label="Current Atlas APU state weights">
              <article class="symphony-state-weight" data-state="healthy"><span>Healthy / Explorer</span><strong data-state-weight="healthy">0%</strong></article>
              <article class="symphony-state-weight" data-state="warning"><span>Warning / Grid Pressure</span><strong data-state-weight="warning">0%</strong></article>
              <article class="symphony-state-weight" data-state="critical"><span>Critical / Boss Protocol</span><strong data-state-weight="critical">0%</strong></article>
              <article class="symphony-state-weight" data-state="unknown"><span>Unknown / Lost Signal</span><strong data-state-weight="unknown">100%</strong></article>
            </div>
          </section>

          <section class="symphony-orchestra" aria-labelledby="symphony-orchestra-title">
            <div class="symphony-section-heading">
              <div><span>02</span><h3 id="symphony-orchestra-title">APU topology panel</h3></div>
              <div class="symphony-section-heading__tools">
                <p>A trace lights only while that service voice is sounding. Copper is declared dependency, not live traffic.</p>
                <div class="symphony-segmented symphony-filter" role="group" aria-label="Filter estate components">
                  <button type="button" data-component-filter="all" aria-pressed="true">All</button>
                  <button type="button" data-component-filter="measured" aria-pressed="false">Measured</button>
                  <button type="button" data-component-filter="unmeasured" aria-pressed="false">Unmeasured</button>
                </div>
              </div>
            </div>
            <div class="symphony-legend" aria-label="Topology legend">
              <span><i class="status-healthy"></i>Healthy chip</span>
              <span><i class="status-degraded"></i>Warning / jitter</span>
              <span><i class="status-down"></i>Critical / clipping</span>
              <span><i class="status-unknown"></i>Unknown, measured</span>
              <span><i class="status-unmeasured"></i>Socket — declared, unmeasured</span>
              <span class="symphony-legend__edge">Copper trace: A → B means A depends on B</span>
              <span class="symphony-legend__edge">Lit path — voice sounding</span>
              <span class="symphony-legend__external">Dashed boundary chips are external systems</span>
            </div>
            <div class="symphony-orchestra__grid">
              <div class="symphony-visual" data-visual>
                <svg class="symphony-topology" data-topology viewBox="0 0 1360 584" preserveAspectRatio="xMidYMin meet" role="group" aria-label="Atlas estate topology board. Service chips, dependency traces and unmeasured sockets."></svg>
                <div class="symphony-analyser-grid">
                  <div class="symphony-waveform-wrap">
                    <span>Master waveform / real analyser</span>
                    <canvas data-waveform width="960" height="112" aria-label="Real-time waveform from the System SYMPHONY master analyser"></canvas>
                  </div>
                  <div class="symphony-spectrum-wrap">
                    <span>Master spectrum / 32 bands</span>
                    <canvas data-spectrum width="960" height="112" aria-label="Real-time 32-band spectrum from the System SYMPHONY master analyser"></canvas>
                  </div>
                </div>
              </div>

              <aside class="symphony-inspector" aria-labelledby="symphony-inspector-title">
                <p class="symphony-kicker">Selected voice</p>
                <h3 id="symphony-inspector-title" data-inspector-name>No component selected</h3>
                <p class="symphony-inspector__identity" data-inspector-identity>Select a topology node or service row.</p>
                <fieldset class="symphony-demo-editor" data-demo-editor hidden>
                  <legend>Simulated preview controls</legend>
                  <p>These controls change this browser snapshot only. Live telemetry keeps updating underneath.</p>
                  <label>Status
                    <select data-demo-status>
                      <option value="healthy">Healthy</option>
                      <option value="degraded">Warning</option>
                      <option value="down">Critical</option>
                      <option value="unknown">Unknown</option>
                    </select>
                  </label>
                  <div class="symphony-demo-editor__metrics">
                    <label>Latency (ms)<input type="number" min="0" max="5000" step="1" inputmode="decimal" data-demo-latency /></label>
                    <label>Uptime (%)<input type="number" min="0" max="100" step="0.1" inputmode="decimal" data-demo-uptime /></label>
                    <label>Error rate (%)<input type="number" min="0" max="100" step="0.1" inputmode="decimal" data-demo-error /></label>
                  </div>
                  <div class="symphony-demo-editor__actions">
                    <button class="symphony-button" type="button" data-demo-deployment>Trigger deployment motif</button>
                    <button class="symphony-button" type="button" data-demo-solo aria-pressed="false">Solo voice</button>
                    <button class="symphony-button" type="button" data-demo-mute aria-pressed="false">Mute voice</button>
                  </div>
                </fieldset>
                <p class="symphony-inspector__description" data-inspector-description></p>
                <dl data-inspector-details></dl>
                <div class="symphony-dependencies">
                  <h4>Depends on</h4>
                  <ul data-inspector-dependencies><li>None declared</li></ul>
                </div>
                <div class="symphony-dependencies">
                  <h4>Used by</h4>
                  <ul data-inspector-used-by><li>None declared</li></ul>
                </div>
                <p class="symphony-live-lock" data-live-lock>Live mode is read-only. Inspection and audio controls only.</p>
              </aside>
            </div>
          </section>

          <section class="symphony-service-section" aria-labelledby="symphony-services-title">
            <div class="symphony-section-heading">
              <div><span>03</span><h3 id="symphony-services-title">Service role score</h3></div>
              <p>Measured health is authoritative. Topology-only components remain explicitly Unmeasured.</p>
            </div>
            <div class="symphony-table-wrap">
              <table>
                <thead><tr><th>Service / component</th><th>Layer</th><th>Status</th><th>Latency</th><th>APU role</th><th>Source</th><th><span class="visually-hidden">Inspect</span></th></tr></thead>
                <tbody data-service-table></tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </div>
  `;
}

export function initSystemSymphony() {
  if (document.getElementById(WIDGET_ID)) return;

  const host = document.createElement("div");
  host.id = WIDGET_ID;
  host.className = "system-symphony";
  host.dataset.state = "unknown";
  host.dataset.source = "connecting";
  host.dataset.running = "0";
  host.innerHTML = template();
  document.body.append(host);

  const engine = createEngine();
  // Development-only: expose the engine for the mute/solo diagnostic when the
  // page is opened with ?symphonyDebug. Inert in normal use; removed before ship.
  try {
    if (typeof window !== "undefined"
      && new URLSearchParams(window.location.search).has("symphonyDebug")) {
      window.__symphonyEngine = engine;
    }
  } catch {
    // A missing window or search API just means no debug handle.
  }
  const overlay = host.querySelector("[data-overlay]");
  const consolePanel = host.querySelector(".symphony-console");
  const openButton = host.querySelector("[data-open-console]");
  const closeButton = host.querySelector("[data-close-console]");
  const help = host.querySelector("[data-help]");
  const helpToggle = host.querySelector("[data-help-toggle]");
  const topologySvg = host.querySelector("[data-topology]");
  const waveformCanvas = host.querySelector("[data-waveform]");
  const waveformContext = waveformCanvas.getContext("2d");
  const spectrumCanvas = host.querySelector("[data-spectrum]");
  const spectrumContext = spectrumCanvas.getContext("2d");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const narrowBoard = window.matchMedia(NARROW_BOARD_QUERY);
  const topologyNodes = new Map();
  const topologyEdges = new Map();
  const voiceTimers = new Map();
  const muted = new Set();
  const soloed = new Set();

  let mode = "live";
  let componentFilter = "all";
  let currentFrame = null;
  let lastLiveFrame = null;
  let lastLiveMerged = null;
  let demoMerged = null;
  let selectedName = null;
  let topologySelectionActive = false;
  let latestDeployment = null;
  let recentDeployment = null;
  let dialogOpen = false;
  let waveformAnimation = null;
  let lastWaveformDraw = 0;
  let lastAnnouncement = "";
  let demoDeploymentCounter = 0;
  let performanceSeed = DEFAULT_PERFORMANCE_SEED;
  let performanceMacros = { ...PERFORMANCE_MACRO_DEFAULTS };
  let performanceArrangement = null;
  let activeDemoProfile = null;
  let performanceStatus = `Seed ${DEFAULT_PERFORMANCE_SEED} ready`;
  let ghostFocus = false;
  let ghostAudition = null;
  let sceneTransitionPending = false;

  function presentationForVoice(voice) {
    if (voice.evidenceState === "topology-only") {
      return { key: "unmeasured", label: "Unmeasured" };
    }
    if (voice.evidenceState === "reported-unknown" || voice.evidenceState === "stale") {
      return { key: "unknown", label: STATUS_LABELS.unknown };
    }
    if (!voice.measured && !voice.demoSimulated) {
      return { key: "unmeasured", label: "Unmeasured" };
    }
    return {
      key: voice.status,
      label: STATUS_LABELS[voice.status] ?? STATUS_LABELS.unknown,
    };
  }

  function apuRoleLabel(voice) {
    const raw = String(voice?.instrumentLabel ?? "").toLowerCase();
    if (/pulse|lead|arp/.test(raw)) return "Pulse clock";
    if (/counter|fm|diagnostic/.test(raw)) return "Contention bus";
    if (/bass|triangle|foundation/.test(raw)) return "Thermal rail";
    if (/noise|drum|hat|rhythm/.test(raw)) return "Signal noise";
    if (/pad|memory|carrier|wavetable/.test(raw)) return "Memory field";
    if (/event|accent|deploy|incident|recovery/.test(raw)) return "Recovery bus";
    return "APU voice";
  }

  function visibleVoices(frame = currentFrame) {
    return frame ? filterVoices(frame.voices, componentFilter) : [];
  }

  const helpRows = host.querySelector("[data-help-rows]");
  for (const [signal, musicalResult] of HELP_ROWS) {
    const row = document.createElement("div");
    const term = document.createElement("strong");
    const definition = document.createElement("span");
    term.textContent = signal;
    definition.textContent = musicalResult;
    row.append(term, definition);
    helpRows.append(row);
  }

  function sourceState(frame = currentFrame) {
    if (mode === "demo") return { key: "demo", label: "DEMO / SIMULATED" };
    if (frame?.evidenceMode === "preview") return { key: "preview", label: "PREVIEW FIXTURE" };
    if (frame?.stale) return { key: "stale", label: "LIVE DATA STALE" };
    if (lastLiveFrame) return { key: "live", label: "LIVE" };
    return { key: "connecting", label: "CONNECTING" };
  }

  function randomPerformanceSeed() {
    const values = new Uint32Array(1);
    if (window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(values);
      return formatPerformanceSeed(values[0]);
    }
    return formatPerformanceSeed(Date.now() ^ Math.floor(Math.random() * 0xffffffff));
  }

  function renderPerformance(frame = currentFrame) {
    const panel = host.querySelector("[data-performance-panel]");
    const demoMode = mode === "demo";
    panel.hidden = !demoMode;
    if (!demoMode || !frame) return;

    const scene = performanceArrangement?.scoreState === frame.scoreState
      ? performanceArrangement
      : PERFORMANCE_SCENES[frame.scoreState] ?? PERFORMANCE_SCENES.unknown;
    const sceneName = activeDemoProfile === "custom"
      ? performanceArrangement
        ? `Custom / ${scene.sceneName ?? scene.name}`
        : "Custom snapshot"
      : scene.sceneName ?? scene.name;
    host.querySelector("[data-performance-scene]").textContent =
      sceneName;
    const performanceBpm = performanceArrangement
      ? Math.round(performanceArrangement.targetBpm)
      : frame.bpm;
    host.querySelector("[data-dialog-score]").textContent =
      `${frame.scoreLabel} // ${scene.sceneName ?? scene.name} / ${frame.mode} / ${performanceBpm} BPM`;
    const seedInput = host.querySelector("[data-performance-seed]");
    seedInput.value = performanceSeed;
    for (const input of host.querySelectorAll("[data-performance-macro]")) {
      const name = input.dataset.performanceMacro;
      const value = performanceMacros[name];
      input.value = String(value);
      host.querySelector(`[data-performance-output="${name}"]`).textContent = String(value);
    }
    for (const button of host.querySelectorAll("[data-demo-profile]")) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.demoProfile === activeDemoProfile),
      );
    }
    const weights = frame.stateVector ?? { healthy: 0, warning: 0, critical: 0, unknown: 1 };
    const vectorLabel = ["healthy", "warning", "critical", "unknown"]
      .map((state) => `${state} ${Math.round((Number(weights[state]) || 0) * 100)}%`)
      .join(" / ");
    host.querySelector("[data-performance-status]").textContent =
      `${performanceStatus} // ${vectorLabel} // ${frame.dominantStateReason ?? "deterministic state audition"}`;
    renderGhostControls();
  }

  function renderGhostControls(phase = engine.getGhostPhase()) {
    const phaseName = phase?.name ?? "standby";
    host.querySelector("[data-ghost-phase]").textContent = phaseName.toUpperCase();
    for (const item of host.querySelectorAll("[data-ghost-phase-step]")) {
      if (item.dataset.ghostPhaseStep === phaseName) {
        item.setAttribute("aria-current", "step");
      } else {
        item.removeAttribute("aria-current");
      }
    }
    host.querySelector("[data-ghost-focus]").setAttribute(
      "aria-pressed",
      String(ghostFocus),
    );
    for (const button of host.querySelectorAll("[data-ghost-audition]")) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.ghostAudition === ghostAudition),
      );
    }
  }

  function stagePerformance(scoreState, action = "Score", arrangement = null) {
    if (mode !== "demo") return;
    performanceArrangement = arrangement ?? createPerformanceArrangement(
      performanceSeed,
      scoreState,
      performanceMacros,
    );
    const result = engine.setPerformance(performanceArrangement, {
      quantize: engine.isRunning(),
    });
    performanceStatus = result.queued
      ? `${action} queued for next measure // ${performanceSeed}`
      : `${action} active // ${performanceSeed}`;
    renderPerformance(currentFrame);
  }

  function stageScene(frame, action = "Scene") {
    if (mode !== "demo" || !frame) return;
    performanceArrangement = createPerformanceArrangement(
      performanceSeed,
      frame.scoreState,
      performanceMacros,
    );
    const audible = maskedFrame(frame, muted, soloed);
    const result = engine.setScene(audible, performanceArrangement, {
      quantize: engine.isRunning(),
      transitionSeconds: 2,
    });
    sceneTransitionPending = result.queued;
    performanceStatus = result.queued
      ? `${action} queued for next bar // smooth 2-second crossfade // ${performanceSeed}`
      : `${action} active // ${performanceSeed}`;
    applyAndRender(frame, { applyAudio: false });
  }

  function announceImportant(frame) {
    const source = sourceState(frame);
    const message = `${source.label}. ${frame.scoreLabel} score.`;
    if (message === lastAnnouncement) return;
    lastAnnouncement = message;
    host.querySelector("[data-important-status]").textContent = message;
  }

  function setRunningUi() {
    const running = engine.isRunning();
    host.dataset.running = running ? "1" : "0";
    for (const button of host.querySelectorAll("[data-audio-toggle]")) {
      button.textContent = running ? "Stop" : "Start";
      button.setAttribute("aria-pressed", String(running));
      button.setAttribute(
        "aria-label",
        running ? "Stop System SYMPHONY audio" : "Start System SYMPHONY audio",
      );
    }
  }

  function renderCompact(frame) {
    const source = sourceState(frame);
    host.dataset.source = source.key;
    host.dataset.state = frame.scoreState;
    const badge = host.querySelector("[data-source-badge]");
    badge.textContent = source.label;
    host.querySelector("[data-compact-state]").textContent = frame.scoreLabel.toUpperCase();
    host.querySelector("[data-compact-health]").textContent =
      `health ${formatHealth(frame.overallHealth)}${frame.stale ? " last known" : ""}`;
    host.querySelector("[data-compact-components]").textContent =
      `${frame.measuredComponents} / ${frame.totalComponents} measured`;
  }

  function renderHybridState(frame) {
    const weights = frame?.stateVector ?? { healthy: 0, warning: 0, critical: 0, unknown: 1 };
    for (const state of ["healthy", "warning", "critical", "unknown"]) {
      const node = host.querySelector(`[data-state-weight="${state}"]`);
      if (node) node.textContent = `${Math.round((Number(weights[state]) || 0) * 100)}%`;
    }
    const panel = host.querySelector("[data-hybrid-state]");
    if (panel) panel.dataset.dominant = frame?.scoreState ?? "unknown";
    const reason = host.querySelector("[data-dominant-reason]");
    if (reason) {
      reason.textContent = frame?.dominantStateReason
        ?? "Unknown supplies the safe harmonic grammar until current evidence arrives.";
    }
  }

  function renderMetrics(frame) {
    metricValue(host, "state", `${frame.scoreLabel} / ${frame.mode}`);
    metricValue(
      host,
      "health",
      `${formatHealth(frame.overallHealth)}${frame.stale ? " (last known)" : ""}`,
    );
    metricValue(host, "total", String(frame.totalComponents));
    metricValue(host, "measured", String(frame.measuredComponents));
    metricValue(host, "warnings", String(frame.warningCount));
    metricValue(host, "failures", `${frame.failureCount} / ${frame.activeIncidents}`);
    const presentations = frame.voices.map(presentationForVoice);
    metricValue(
      host,
      "unknown",
      String(presentations.filter((item) => item.key === "unknown").length),
    );
    metricValue(
      host,
      "unmeasured",
      String(presentations.filter((item) => item.key === "unmeasured").length),
    );
    const deploymentText = recentDeployment
      ? `${recentDeployment.commitSha ?? recentDeployment.identity ?? "deployment"} / ${recentDeployment.status ?? "success"}`
      : latestDeployment
        ? `${latestDeployment.commitSha ?? latestDeployment.deployId ?? "baseline"} / baseline`
        : "baseline pending";
    metricValue(host, "deployment", deploymentText);
    renderHybridState(frame);
  }

  function boardLayout() {
    // Below the narrow breakpoint the board is recomposed as stacked carrier
    // bands rather than scaled down, because a 1360px board is unreadable at
    // phone width.
    return narrowBoard.matches ? "mobile" : "desktop";
  }

  function svgElement(tag, attributes = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) {
      node.setAttribute(key, String(value));
    }
    return node;
  }

  function selectService(name, focusInspector = false) {
    selectedName = name;
    topologySelectionActive = true;
    renderInspector();
    renderServiceTable();
    applyTopologySelection();
    if (focusInspector) host.querySelector("[data-inspector-name]").focus?.();
  }

  function clearTopologySelection() {
    if (!topologySelectionActive) return;
    topologySelectionActive = false;
    renderServiceTable();
    applyTopologySelection();
  }

  function applyTopologySelection() {
    const activeSelection = topologySelectionActive && Boolean(selectedName);
    const related = new Set(activeSelection ? [selectedName] : []);
    if (activeSelection && currentFrame) {
      const selected = currentFrame.voices.find((voice) => voice.name === selectedName);
      selected?.depends_on.forEach((name) => related.add(name));
      currentFrame.voices
        .filter((voice) => voice.depends_on.includes(selectedName))
        .forEach((voice) => related.add(voice.name));
    }
    for (const [nodeName, node] of topologyNodes) {
      node.classList.toggle("is-selected", activeSelection && nodeName === selectedName);
      node.classList.toggle("is-dimmed", activeSelection && !related.has(nodeName));
    }
    for (const edge of topologySvg.querySelectorAll(".symphony-edge")) {
      const connected = edge.dataset.from === selectedName || edge.dataset.to === selectedName;
      edge.classList.toggle("is-selected", activeSelection && connected);
      edge.classList.toggle("is-dimmed", activeSelection && !connected);
    }
  }

  function boardDefs() {
    const defs = svgElement("defs");

    const marker = svgElement("marker", {
      id: "symphony-arrow",
      viewBox: "0 0 10 10",
      refX: "9",
      refY: "5",
      markerWidth: "6",
      markerHeight: "6",
      orient: "auto-start-reverse",
    });
    marker.append(svgElement("path", { d: "M 0 0 L 10 5 L 0 10 z" }));

    // Hatch fill for unmeasured sockets. A socket cavity is hatched, never
    // filled like a live die.
    const hatch = svgElement("pattern", {
      id: "symphony-socket-hatch",
      width: "6",
      height: "6",
      patternUnits: "userSpaceOnUse",
      patternTransform: "rotate(45)",
    });
    hatch.append(svgElement("line", {
      x1: "0", y1: "0", x2: "0", y2: "6", class: "symphony-hatch-line",
    }));

    const fixture = svgElement("pattern", {
      id: "symphony-fixture-hatch",
      width: "10",
      height: "10",
      patternUnits: "userSpaceOnUse",
      patternTransform: "rotate(45)",
    });
    fixture.append(svgElement("line", {
      x1: "0", y1: "0", x2: "0", y2: "10", class: "symphony-fixture-line",
    }));

    defs.append(marker, hatch, fixture);
    return defs;
  }

  function appendChipBody(group, voice, chip, state) {
    const { w, h } = chip;

    group.append(svgElement("rect", {
      class: "symphony-chip__frame",
      x: 0, y: 0, width: w, height: h, rx: 3,
    }));

    // Copper pin stubs on both sides so a chip reads as seated on the board.
    const pins = svgElement("g", { class: "symphony-chip__pins" });
    for (const offset of [12, h / 2, h - 12]) {
      pins.append(svgElement("line", { x1: -6, y1: offset, x2: 0, y2: offset }));
      pins.append(svgElement("line", { x1: w, y1: offset, x2: w + 6, y2: offset }));
    }
    group.append(pins);

    if (state.unmeasured) {
      // Socket: hatched cavity and contact holes, no die and no LED.
      group.append(svgElement("rect", {
        class: "symphony-chip__cavity",
        x: 10, y: 10, width: w - 20, height: h - 20, rx: 2,
        fill: "url(#symphony-socket-hatch)",
      }));
      const holes = svgElement("g", { class: "symphony-chip__holes" });
      for (const cx of [w - 18, w - 30]) {
        holes.append(svgElement("circle", { cx, cy: 15, r: 2.4 }));
      }
      group.append(holes);
    } else {
      group.append(svgElement("rect", {
        class: "symphony-chip__die",
        x: 10, y: 10, width: w - 20, height: h - 20, rx: 2,
      }));
      // Degraded and critical carry a waveform on the die: uneven jitter for
      // warning, a clipped square wave for critical. Geometry, not just colour.
      if (state.status === "degraded" || state.status === "down") {
        const baseline = h - 15;
        const wave = state.status === "down"
          ? `M ${w - 62} ${baseline} L ${w - 54} ${baseline} L ${w - 54} ${baseline - 9} L ${w - 44} ${baseline - 9} L ${w - 44} ${baseline} L ${w - 34} ${baseline} L ${w - 34} ${baseline - 9} L ${w - 26} ${baseline - 9}`
          : `M ${w - 62} ${baseline} L ${w - 55} ${baseline - 7} L ${w - 48} ${baseline - 1} L ${w - 41} ${baseline - 8} L ${w - 34} ${baseline - 2} L ${w - 26} ${baseline - 6}`;
        group.append(svgElement("path", { class: "symphony-chip__wave", d: wave }));
      }
      group.append(svgElement("rect", {
        class: "symphony-chip__led",
        x: 12, y: h / 2 - 12, width: 8, height: 8, rx: 1,
      }));
    }

    const identity = svgElement("text", {
      class: "symphony-chip__identity", x: 26, y: h / 2 - 4,
    });
    identity.textContent = voice.displayName.length > 22
      ? `${voice.displayName.slice(0, 21)}…`
      : voice.displayName;

    const meta = svgElement("text", {
      class: "symphony-chip__meta", x: 26, y: h / 2 + 10,
    });
    meta.textContent = state.meta;

    const code = svgElement("text", {
      class: "symphony-chip__state", x: w - 12, y: h / 2 + 10, "text-anchor": "end",
    });
    code.textContent = state.code;

    group.append(identity, meta, code);

    // Corner brackets for selection. Dashes are centred on each corner so the
    // bracket reads as a seated component marker rather than a dashed outline.
    group.append(svgElement("rect", {
      class: "symphony-chip__brackets",
      x: -3, y: -3, width: w + 6, height: h + 6, rx: 3,
      "stroke-dasharray": `12 ${w + 6 - 24} 12 ${h + 6 - 24} 12 ${w + 6 - 24} 12 ${h + 6 - 24}`,
      "stroke-dashoffset": 6,
    }));
  }

  function renderTopology(frame) {
    topologyNodes.clear();
    topologyEdges.clear();
    topologySvg.replaceChildren();
    topologySvg.classList.toggle("is-critical", frame.scoreState === "critical");

    const filteredVoices = visibleVoices(frame);
    const graph = buildDependencyGraph(filteredVoices, frame.voices);
    const layout = boardLayout();
    const source = sourceState(frame);
    const board = boardGeometry({
      voices: filteredVoices,
      externalNodes: graph.externalNodes,
      layout,
    });

    topologySvg.setAttribute("viewBox", `0 0 ${board.width} ${board.height}`);
    topologySvg.dataset.layout = board.layout;
    topologySvg.dataset.source = source.key;
    topologySvg.dataset.scope = componentFilter;

    topologySvg.append(boardDefs());

    // Board plate and district silkscreen.
    const plate = svgElement("g", { class: "symphony-board__plate" });
    for (const district of board.districts) {
      const label = svgElement("text", {
        class: "symphony-board__district",
        x: district.x,
        y: layout === "mobile" ? district.y + 18 : district.y,
      });
      label.textContent = district.label;
      plate.append(label);
      if (layout === "mobile") {
        const measured = svgElement("text", {
          class: "symphony-board__district-count",
          x: board.width - 16,
          y: district.y + 18,
          "text-anchor": "end",
        });
        measured.textContent = `${district.measured}/${district.count} measured`;
        plate.append(measured);
      }
    }
    if (layout === "mobile") {
      plate.append(svgElement("line", {
        class: "symphony-board__spine",
        x1: board.spineX, y1: board.topBus, x2: board.spineX, y2: board.bottomBus,
      }));
    }
    topologySvg.append(plate);

    // Copper traces. Declared dependencies only; this is not live traffic.
    const edges = [...graph.internalEdges, ...graph.externalEdges];
    const offsets = routeOffsets(edges);
    const statusByName = new Map(
      filteredVoices.map((voice) => [voice.name, presentationForVoice(voice).key]),
    );
    const edgeGroup = svgElement("g", { class: "symphony-topology__edges" });
    for (const edge of edges) {
      const from = board.chips.get(edge.from);
      const to = board.chips.get(edge.to);
      if (!from || !to) continue;
      const points = copperRoute(from, to, {
        offset: offsets.get(`${edge.from} ${edge.to}`) ?? 0,
        topBus: board.topBus,
        bottomBus: board.bottomBus,
        layout: board.layout,
        spineX: board.spineX,
      });
      const path = svgElement("path", {
        class: `symphony-edge${to.external ? " is-external" : ""}`,
        d: chamferedPath(points),
        fill: "none",
        "marker-end": "url(#symphony-arrow)",
      });
      path.dataset.from = edge.from;
      path.dataset.to = edge.to;
      // The trace carries its source chip's pressure, so degraded jitter and
      // critical clipping read as damage on the signal itself.
      path.dataset.status = statusByName.get(edge.from) ?? "unknown";
      edgeGroup.append(path);

      // A via dot at each bend, as on a routed board.
      for (const bend of points.slice(1, -1)) {
        edgeGroup.append(svgElement("circle", {
          class: "symphony-edge__via", cx: bend.x, cy: bend.y, r: 1.6,
        }));
      }

      if (!topologyEdges.has(edge.from)) topologyEdges.set(edge.from, []);
      topologyEdges.get(edge.from).push(path);
    }
    topologySvg.append(edgeGroup);

    const chipGroup = svgElement("g", { class: "symphony-topology__chips" });
    for (const voice of filteredVoices) {
      const chip = board.chips.get(voice.name);
      if (!chip) continue;
      const presentation = presentationForVoice(voice);
      const state = chipStateForVoice(voice, presentation);
      const role = apuRoleLabel(voice);
      const evidence = voice.evidenceLabel
        ?? (voice.measured ? "Current measurement" : "Topology only");

      const group = svgElement("g", {
        class: `symphony-node status-${presentation.key}${topologySelectionActive && voice.name === selectedName ? " is-selected" : ""}`,
        transform: `translate(${chip.x} ${chip.y})`,
        tabindex: "0",
        role: "button",
        "aria-label": `${voice.displayName}, ${state.code === "LAST KNOWN" ? "last known" : presentation.label}, ${state.kind}, APU role ${role}, ${evidence}, source ${source.label}`,
      });
      group.dataset.node = voice.name;
      group.dataset.status = presentation.key;
      group.dataset.evidence = state.evidence;
      group.dataset.kind = state.kind;
      group.dataset.district = chip.districtId;
      group.dataset.voice = "false";

      const title = svgElement("title");
      title.textContent = `${voice.displayName}: ${presentation.label} / ${role}`;
      group.append(title);
      appendChipBody(group, voice, chip, state);

      group.addEventListener("click", () => selectService(voice.name));
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectService(voice.name);
        }
      });
      chipGroup.append(group);
      topologyNodes.set(voice.name, group);
    }

    for (const name of graph.externalNodes) {
      const chip = board.chips.get(name);
      if (!chip) continue;
      const group = svgElement("g", {
        class: "symphony-node symphony-node--external status-unmeasured",
        transform: `translate(${chip.x} ${chip.y})`,
        "aria-label": `${name}, external dependency boundary, health not measured here`,
      });
      group.dataset.node = name;
      group.dataset.status = "unmeasured";
      group.dataset.evidence = "external";
      group.dataset.kind = "external";
      group.dataset.district = chip.districtId;

      const title = svgElement("title");
      title.textContent = `${name}: external dependency (health not measured here)`;
      group.append(title);
      appendChipBody(
        group,
        { displayName: name },
        chip,
        { unmeasured: true, status: "unmeasured", kind: "external", code: "NO MEAS", meta: "external" },
      );
      chipGroup.append(group);
      topologyNodes.set(name, group);
    }
    topologySvg.append(chipGroup);

    // Source overlay. A stale board stops all flow; a fixture board is framed
    // and hatched so it can never be read as live.
    if (source.key === "stale") {
      for (const path of topologySvg.querySelectorAll(".symphony-edge")) {
        path.classList.remove("is-lit");
      }
    }
    if (source.key === "preview" || source.key === "demo") {
      const overlay = svgElement("g", { class: "symphony-board__fixture" });
      overlay.append(svgElement("rect", {
        x: 2, y: 2, width: board.width - 4, height: board.height - 4,
        fill: "url(#symphony-fixture-hatch)",
      }));
      overlay.append(svgElement("rect", {
        class: "symphony-board__fixture-frame",
        x: 2, y: 2, width: board.width - 4, height: board.height - 4,
      }));
      const plateLabel = svgElement("text", {
        class: "symphony-board__fixture-plate",
        x: board.width / 2, y: 26, "text-anchor": "middle",
      });
      plateLabel.textContent = `NOT LIVE — ${source.label}`;
      overlay.append(plateLabel);
      topologySvg.append(overlay);
    }

    applyTopologySelection();
  }

  function renderServiceTable() {
    const body = host.querySelector("[data-service-table]");
    body.replaceChildren();
    if (!currentFrame) return;
    for (const voice of visibleVoices()) {
      const row = document.createElement("tr");
      if (topologySelectionActive && voice.name === selectedName) row.classList.add("is-selected");
      const presentation = presentationForVoice(voice);
      row.dataset.status = presentation.key;
      const values = [
        voice.displayName,
        voice.layer,
        presentation.label,
        formatLatency(voice.latency_ms),
        apuRoleLabel(voice),
        voice.evidenceLabel ?? (voice.demoSimulated ? "Simulated profile" : voice.measured ? "Current measurement" : "Topology only"),
      ];
      values.forEach((value, index) => {
        const cell = document.createElement("td");
        if (index === 2) {
          const status = document.createElement("span");
          status.className = `symphony-status status-${presentation.key}`;
          status.textContent = value;
          cell.append(status);
        } else {
          cell.textContent = value;
        }
        row.append(cell);
      });
      const actionCell = document.createElement("td");
      const inspect = document.createElement("button");
      inspect.type = "button";
      inspect.className = "symphony-table-action";
      inspect.textContent = "Inspect";
      inspect.setAttribute("aria-label", `Inspect ${voice.displayName}`);
      inspect.addEventListener("click", () => selectService(voice.name));
      actionCell.append(inspect);
      row.append(actionCell);
      row.addEventListener("dblclick", () => selectService(voice.name));
      body.append(row);
    }
  }

  function inspectorVoice() {
    if (!currentFrame) return null;
    return currentFrame.voices.find((voice) => voice.name === selectedName) ?? null;
  }

  function renderInspector() {
    const voice = inspectorVoice();
    const name = host.querySelector("[data-inspector-name]");
    const identity = host.querySelector("[data-inspector-identity]");
    const description = host.querySelector("[data-inspector-description]");
    const details = host.querySelector("[data-inspector-details]");
    const dependencies = host.querySelector("[data-inspector-dependencies]");
    const usedBy = host.querySelector("[data-inspector-used-by]");
    const editor = host.querySelector("[data-demo-editor]");
    const liveLock = host.querySelector("[data-live-lock]");

    if (!voice) {
      name.textContent = "No component selected";
      identity.textContent = "Select a topology node or service row.";
      description.textContent = "";
      details.replaceChildren();
      dependencies.innerHTML = "<li>None declared</li>";
      usedBy.innerHTML = "<li>None declared</li>";
      editor.hidden = true;
      liveLock.hidden = mode === "demo";
      return;
    }

    name.textContent = voice.displayName;
    identity.textContent = `${apuRoleLabel(voice)} / ${voice.registerLabel} register / pan ${voice.pan.toFixed(2)} / ${voice.motifLabel}`;
    description.textContent = voice.description ?? "No topology description supplied.";
    details.replaceChildren();
    const presentation = presentationForVoice(voice);
    const detailRows = [
      ["Layer", voice.layer],
      ["Status", presentation.label],
      [
        "Measurement",
        voice.evidenceLabel
          ?? (voice.demoSimulated
            ? "Simulated profile"
            : voice.measured
              ? "Current measurement"
              : "Topology only / unmeasured"),
      ],
      ["Evidence", voice.evidence_source ?? "No live evidence source"],
      ["Health detail", voice.health_detail ?? "No health detail supplied"],
      ["Measured at", voice.measured_at ? formatTimestamp(voice.measured_at) : "not measured"],
      ["Latency", formatLatency(voice.latency_ms)],
      ["Uptime", formatPercent(voice.uptime_pct, 1)],
      ["Error rate", Number.isFinite(voice.error_rate) ? formatPercent(voice.error_rate * 100, 1) : "not measured"],
      ["Brightness", voice.brightness.toFixed(2)],
      ["Stability", voice.stability.toFixed(2)],
    ];
    for (const [label, value] of detailRows) {
      const term = document.createElement("dt");
      const definition = document.createElement("dd");
      term.textContent = label;
      definition.textContent = value;
      details.append(term, definition);
    }

    dependencies.replaceChildren();
    const dependencyNames = voice.depends_on.length ? voice.depends_on : ["None declared"];
    dependencyNames.forEach((dependency) => {
      const item = document.createElement("li");
      item.textContent = dependency;
      dependencies.append(item);
    });

    usedBy.replaceChildren();
    const consumers = currentFrame.voices
      .filter((candidate) => candidate.depends_on.includes(voice.name))
      .map((candidate) => candidate.displayName);
    (consumers.length ? consumers : ["None declared"]).forEach((consumer) => {
      const item = document.createElement("li");
      item.textContent = consumer;
      usedBy.append(item);
    });

    const demoMode = mode === "demo";
    editor.hidden = !demoMode;
    liveLock.hidden = demoMode;
    if (demoMode) {
      host.querySelector("[data-demo-status]").value = voice.status;
      host.querySelector("[data-demo-latency]").value = voice.latency_ms ?? "";
      host.querySelector("[data-demo-uptime]").value = voice.uptime_pct ?? "";
      host.querySelector("[data-demo-error]").value = Number.isFinite(voice.error_rate)
        ? (voice.error_rate * 100).toFixed(1)
        : "";
      host.querySelector("[data-demo-solo]").setAttribute(
        "aria-pressed",
        String(soloed.has(voice.name)),
      );
      host.querySelector("[data-demo-mute]").setAttribute(
        "aria-pressed",
        String(muted.has(voice.name)),
      );
    }
  }

  function renderDialog(frame) {
    const source = sourceState(frame);
    host.querySelector("[data-dialog-source]").textContent = source.label;
    const performanceLabel = mode === "demo" && performanceArrangement
      ? ` // ${performanceArrangement.sceneName}`
      : "";
    host.querySelector("[data-dialog-score]").textContent =
      `${frame.scoreLabel}${performanceLabel} / ${frame.mode} / ${frame.bpm} BPM`;
    host.querySelector("[data-last-update]").textContent = formatTimestamp(frame.lastSuccessfulAt);
    const explanation = host.querySelector("[data-source-explanation]");
    explanation.textContent = mode === "demo"
      ? "Browser-only Atlas APU audition. State profiles reshape only the local score while live telemetry continues unchanged underneath."
      : frame.stale
        ? "The live telemetry request failed. Last-known values remain visible, while the score is explicitly Unknown."
        : "Reading current public telemetry. Live mode is strictly read-only.";
    host.querySelector("[data-live-mode]").setAttribute("aria-pressed", String(mode === "live"));
    host.querySelector("[data-demo-mode]").setAttribute("aria-pressed", String(mode === "demo"));
    host.querySelector("[data-demo-reset]").hidden = mode !== "demo";
    renderPerformance(frame);
    for (const button of host.querySelectorAll("[data-component-filter]")) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.componentFilter === componentFilter),
      );
    }
    renderMetrics(frame);
    renderTopology(frame);
    renderServiceTable();
    renderInspector();
  }

  // Crossing the narrow breakpoint recomposes the board rather than scaling it,
  // so the layout has to be rebuilt rather than restyled.
  narrowBoard.addEventListener("change", () => {
    if (currentFrame) renderTopology(currentFrame);
  });

  function applyAndRender(frame, { applyAudio = true } = {}) {
    currentFrame = frame;
    const visible = visibleVoices(frame);
    if (!selectedName || !visible.some((voice) => voice.name === selectedName)) {
      selectedName = visible[0]?.name ?? null;
      topologySelectionActive = false;
    }
    const audible = mode === "demo"
      ? maskedFrame(frame, muted, soloed)
      : frame;
    if (applyAudio) engine.applyFrame(audible);
    renderCompact(frame);
    renderDialog(frame);
    announceImportant(frame);
    setRunningUi();
    const detail = Object.freeze({
      frame: clone(frame),
      mode,
      source: sourceState(frame),
      performance: performanceArrangement ? clone(performanceArrangement) : null,
      performanceSeed,
      buildId: SYSTEM_SYMPHONY_BUILD_ID,
      sampleStats: engine.getSampleLoadStats(),
      samplePalette: engine.getSamplePalette(),
      composition: engine.getCompositionSnapshot(),
    });
    host.__atlasApuFrame = detail;
    host.dispatchEvent(new CustomEvent("atlas-apu-frame", { bubbles: true, detail }));
  }

  function currentDemoFrame() {
    if (!demoMerged) return null;
    return buildHybridFrame(computeFrame(demoMerged), {
      ...demoMerged,
      stale: false,
    });
  }

  function resetDemoFromLive() {
    if (!lastLiveMerged) return;
    demoMerged = clone(lastLiveMerged);
    demoMerged.stale = false;
    demoMerged.lastSuccessfulAt = lastLiveFrame?.lastSuccessfulAt ?? null;
    demoMerged.estate = deriveDemoEstate(demoMerged.services);
    muted.clear();
    soloed.clear();
    activeDemoProfile = "custom";
    performanceArrangement = null;
    performanceStatus = "Custom live snapshot ready";
    sceneTransitionPending = false;
    resetGhostMixControls();
    engine.setPerformance(null, { quantize: false });
    const frame = currentDemoFrame();
    applyAndRender(frame);
  }

  function switchToDemo() {
    if (!lastLiveMerged) return;
    mode = "demo";
    resetDemoFromLive();
  }

  function switchToLive() {
    mode = "live";
    demoMerged = null;
    muted.clear();
    soloed.clear();
    activeDemoProfile = null;
    performanceArrangement = null;
    sceneTransitionPending = false;
    resetGhostMixControls();
    engine.setPerformance(null, { quantize: false });
    if (lastLiveFrame) applyAndRender(lastLiveFrame);
  }

  function updateSelectedDemo(patch) {
    if (mode !== "demo" || !demoMerged || !selectedName) return;
    const service = demoMerged.services.find((item) => item.name === selectedName);
    if (!service) return;
    const previousIncidents = demoMerged.estate?.active_incidents ?? 0;
    Object.assign(service, patch, {
      demoSimulated: true,
      health_detail: "Simulated component preview",
    });
    activeDemoProfile = "custom";
    demoMerged.estate = deriveDemoEstate(demoMerged.services);
    demoMerged.timestamp = new Date().toISOString();
    const frame = currentDemoFrame();
    if (
      sceneTransitionPending
      || performanceArrangement?.scoreState !== frame.scoreState
    ) {
      stageScene(frame);
    } else {
      applyAndRender(frame);
    }
    const nextIncidents = demoMerged.estate.active_incidents;
    if (nextIncidents > previousIncidents) {
      engine.queueIncidentAccent(nextIncidents - previousIncidents);
    }
  }

  function applyDemoProfile(profileName) {
    if (mode !== "demo" || !demoMerged) return;
    demoMerged.services = applyDemoProfileToServices(
      demoMerged.services,
      profileName,
    );
    activeDemoProfile = profileName;
    demoMerged.estate = deriveDemoEstate(demoMerged.services);
    demoMerged.timestamp = new Date().toISOString();
    muted.clear();
    soloed.clear();
    const frame = currentDemoFrame();
    stageScene(frame);
  }

  function randomisePerformance() {
    if (mode !== "demo" || !currentFrame) return;
    const previousSignature = performanceArrangement?.patternSignature ?? null;
    let nextArrangement = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      performanceSeed = randomPerformanceSeed();
      nextArrangement = createPerformanceArrangement(
        performanceSeed,
        currentFrame.scoreState,
        performanceMacros,
      );
      if (nextArrangement.patternSignature !== previousSignature) break;
    }
    stagePerformance(currentFrame.scoreState, "Random score", nextArrangement);
  }

  function replayPerformanceSeed() {
    if (mode !== "demo" || !currentFrame) return;
    const input = host.querySelector("[data-performance-seed]");
    try {
      performanceSeed = normalizePerformanceSeed(input.value);
      input.setCustomValidity("");
      stagePerformance(currentFrame.scoreState, "Replay seed");
    } catch (error) {
      input.setCustomValidity(error.message);
      performanceStatus = "Seed must use 4 to 8 hexadecimal characters";
      renderPerformance(currentFrame);
      input.reportValidity();
    }
  }

  function toggleGhostFocus() {
    if (mode !== "demo") return;
    ghostFocus = engine.setGhostFocus(!ghostFocus);
    performanceStatus = ghostFocus
      ? "Ghost Circuit focus active // backing ducked"
      : "Ghost Circuit focus off // full mix";
    renderPerformance(currentFrame);
  }

  function toggleGhostAudition(layer) {
    if (mode !== "demo") return;
    const nextLayer = ghostAudition === layer ? null : layer;
    ghostAudition = engine.setGhostAudition(nextLayer);
    performanceStatus = ghostAudition
      ? `${ghostAudition.toUpperCase()} audition active // isolated voice`
      : "Ghost Circuit audition off // full arrangement";
    renderPerformance(currentFrame);
  }

  function resetGhostMixControls() {
    ghostFocus = engine.setGhostFocus(false);
    ghostAudition = engine.setGhostAudition(null);
  }

  function flashDeployment(deployment) {
    recentDeployment = deployment;
    const visual = host.querySelector("[data-visual]");
    visual.classList.remove("has-deployment-pulse");
    void visual.getBoundingClientRect();
    visual.classList.add("has-deployment-pulse");
    window.setTimeout(() => visual.classList.remove("has-deployment-pulse"), 1600);
    if (currentFrame) renderMetrics(currentFrame);
  }

  function flashIncident() {
    host.classList.add("has-incident-accent");
    window.setTimeout(() => host.classList.remove("has-incident-accent"), 500);
  }

  function flashVoice(name) {
    const node = topologyNodes.get(name);
    if (!node) return;
    const lit = topologyEdges.get(name) ?? [];

    node.classList.remove("is-playing");
    void node.getBoundingClientRect();
    node.classList.add("is-playing");
    // A lit trace means one sounding voice, so the outgoing copper is only
    // energised for as long as the voice actually sounds.
    node.dataset.voice = "true";
    for (const path of lit) path.classList.add("is-lit");

    window.clearTimeout(voiceTimers.get(name));
    voiceTimers.set(name, window.setTimeout(() => {
      node.classList.remove("is-playing");
      node.dataset.voice = "false";
      for (const path of lit) path.classList.remove("is-lit");
      voiceTimers.delete(name);
    }, 520));
  }

  function drawWaveform(timestamp = 0) {
    if (!dialogOpen) {
      waveformAnimation = null;
      return;
    }
    const minimumDelay = reducedMotion.matches ? 250 : 0;
    if (timestamp - lastWaveformDraw >= minimumDelay) {
      lastWaveformDraw = timestamp;
      const data = engine.getWaveform();
      const width = waveformCanvas.width;
      const height = waveformCanvas.height;
      waveformContext.clearRect(0, 0, width, height);
      waveformContext.fillStyle = "#09090d";
      waveformContext.fillRect(0, 0, width, height);
      waveformContext.strokeStyle = "rgba(245, 166, 35, 0.2)";
      waveformContext.beginPath();
      waveformContext.moveTo(0, height / 2);
      waveformContext.lineTo(width, height / 2);
      waveformContext.stroke();
      waveformContext.strokeStyle = engine.isRunning() ? "#f5a623" : "#888894";
      waveformContext.lineWidth = 1.5;
      waveformContext.beginPath();
      const stride = width / Math.max(1, data.length - 1);
      data.forEach((sample, index) => {
        const x = index * stride;
        const y = height / 2 + sample * height * 0.42;
        if (index === 0) waveformContext.moveTo(x, y);
        else waveformContext.lineTo(x, y);
      });
      waveformContext.stroke();

      const spectrum = engine.getSpectrum();
      const spectrumWidth = spectrumCanvas.width;
      const spectrumHeight = spectrumCanvas.height;
      spectrumContext.clearRect(0, 0, spectrumWidth, spectrumHeight);
      spectrumContext.fillStyle = "#09090d";
      spectrumContext.fillRect(0, 0, spectrumWidth, spectrumHeight);
      const bandCount = 32;
      const binStride = Math.max(1, Math.floor(spectrum.length / bandCount));
      const gap = 3;
      const barWidth = spectrumWidth / bandCount;
      for (let band = 0; band < bandCount; band += 1) {
        const start = band * binStride;
        const bins = spectrum.slice(start, start + binStride);
        const db = bins.length
          ? bins.reduce((sum, value) => sum + (Number.isFinite(value) ? value : -100), 0) / bins.length
          : -100;
        const normalized = Math.max(0, Math.min(1, (db + 100) / 100));
        const barHeight = Math.max(1, normalized * spectrumHeight * 0.92);
        spectrumContext.fillStyle = engine.isRunning() ? "rgba(245, 166, 35, 0.72)" : "rgba(85, 85, 96, 0.72)";
        spectrumContext.fillRect(
          band * barWidth + gap / 2,
          spectrumHeight - barHeight,
          Math.max(1, barWidth - gap),
          barHeight,
        );
      }
    }
    waveformAnimation = window.requestAnimationFrame(drawWaveform);
  }

  function openConsole() {
    if (dialogOpen) return;
    dialogOpen = true;
    overlay.hidden = false;
    document.body.classList.add("symphony-console-open");
    openButton.setAttribute("aria-expanded", "true");
    closeButton.focus();
    if (waveformAnimation === null) {
      waveformAnimation = window.requestAnimationFrame(drawWaveform);
    }
  }

  function closeConsole() {
    if (!dialogOpen) return;
    dialogOpen = false;
    overlay.hidden = true;
    document.body.classList.remove("symphony-console-open");
    openButton.setAttribute("aria-expanded", "false");
    openButton.focus();
  }

  function setHelp(open) {
    help.hidden = !open;
    helpToggle.setAttribute("aria-expanded", String(open));
    if (open) help.querySelector("button")?.focus();
    else if (dialogOpen) helpToggle.focus();
  }

  async function toggleAudio() {
    const buttons = [...host.querySelectorAll("[data-audio-toggle]")];
    const shouldStart = !engine.isRunning();
    const startPromise = shouldStart ? engine.start() : null;
    buttons.forEach((button) => { button.disabled = true; });
    try {
      if (!shouldStart) engine.pause();
      else {
        host.querySelector("[data-important-status]").textContent =
          "Initialising the sample-free Atlas APU…";
        await startPromise;
        host.querySelector("[data-important-status]").textContent =
          "Atlas APU ready: six procedural roles, zero streamed or decoded audio assets.";
      }
      setRunningUi();
    } catch (error) {
      console.error("system-symphony: audio failed to start", error);
      const blocked = error?.code === AUDIO_CONTEXT_BLOCKED_CODE;
      host.querySelector("[data-important-status]").textContent = blocked
        ? "Your browser blocked Web Audio. Allow audio/autoplay for this site, then press Retry audio."
        : "Audio could not start. See the browser console for details.";
      if (blocked) {
        buttons.forEach((button) => {
          button.textContent = "Retry audio";
          button.setAttribute("aria-label", "Retry System SYMPHONY audio");
        });
      }
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  host.querySelectorAll("[data-audio-toggle]").forEach((button) => {
    button.addEventListener("click", toggleAudio);
  });
  host.querySelectorAll("[data-volume]").forEach((slider) => {
    slider.addEventListener("input", () => {
      const value = Number(slider.value);
      engine.setUserVolume(value / 100);
      host.querySelectorAll("[data-volume]").forEach((other) => {
        if (other !== slider) other.value = String(value);
      });
    });
  });

  openButton.addEventListener("click", openConsole);
  closeButton.addEventListener("click", closeConsole);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeConsole();
  });
  helpToggle.addEventListener("click", () => setHelp(help.hidden));
  host.querySelector("[data-help-close]").addEventListener("click", () => setHelp(false));
  host.querySelector("[data-live-mode]").addEventListener("click", switchToLive);
  host.querySelector("[data-demo-mode]").addEventListener("click", switchToDemo);
  host.querySelector("[data-demo-reset]").addEventListener("click", resetDemoFromLive);
  host.querySelectorAll("[data-demo-profile]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.demoProfile === "custom") resetDemoFromLive();
      else applyDemoProfile(button.dataset.demoProfile);
    });
  });
  topologySvg.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-node]")) return;
    clearTopologySelection();
  });
  topologySvg.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    clearTopologySelection();
  });
  host.querySelector("[data-randomise-score]").addEventListener(
    "click",
    randomisePerformance,
  );
  host.querySelector("[data-replay-seed]").addEventListener(
    "click",
    replayPerformanceSeed,
  );
  host.querySelector("[data-ghost-focus]").addEventListener(
    "click",
    toggleGhostFocus,
  );
  host.querySelectorAll("[data-ghost-audition]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleGhostAudition(button.dataset.ghostAudition);
    });
  });
  host.querySelector("[data-performance-seed]").addEventListener("input", (event) => {
    event.target.value = event.target.value.toUpperCase();
    event.target.setCustomValidity("");
  });
  host.querySelector("[data-performance-seed]").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    replayPerformanceSeed();
  });
  host.querySelectorAll("[data-performance-macro]").forEach((input) => {
    input.addEventListener("input", () => {
      const name = input.dataset.performanceMacro;
      performanceMacros = {
        ...performanceMacros,
        [name]: Number(input.value),
      };
      host.querySelector(`[data-performance-output="${name}"]`).textContent = input.value;
      if (mode === "demo" && currentFrame) {
        stagePerformance(currentFrame.scoreState, `${name} ${input.value}`);
      }
    });
  });
  host.querySelectorAll("[data-component-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      componentFilter = button.dataset.componentFilter;
      if (currentFrame) applyAndRender(currentFrame);
    });
  });

  host.querySelector("[data-demo-status]").addEventListener("change", (event) => {
    updateSelectedDemo({ status: event.target.value });
  });
  host.querySelector("[data-demo-latency]").addEventListener("change", (event) => {
    const value = event.target.value === "" ? null : Number(event.target.value);
    updateSelectedDemo({ latency_ms: Number.isFinite(value) ? value : null });
  });
  host.querySelector("[data-demo-uptime]").addEventListener("change", (event) => {
    const value = event.target.value === "" ? null : Number(event.target.value);
    updateSelectedDemo({ uptime_pct: Number.isFinite(value) ? value : null });
  });
  host.querySelector("[data-demo-error]").addEventListener("change", (event) => {
    const value = event.target.value === "" ? null : Number(event.target.value) / 100;
    updateSelectedDemo({ error_rate: Number.isFinite(value) ? value : null });
  });
  host.querySelector("[data-demo-deployment]").addEventListener("click", () => {
    if (mode !== "demo") return;
    demoDeploymentCounter += 1;
    const deployment = {
      identity: `demo-${demoDeploymentCounter}`,
      commitSha: `demo-${demoDeploymentCounter}`,
      status: "success",
      localOnly: true,
    };
    engine.queueDeploymentMotif(deployment);
    flashDeployment(deployment);
  });
  host.querySelector("[data-demo-solo]").addEventListener("click", () => {
    if (mode !== "demo" || !selectedName) return;
    if (soloed.has(selectedName)) soloed.delete(selectedName);
    else soloed.add(selectedName);
    applyAndRender(currentDemoFrame());
  });
  host.querySelector("[data-demo-mute]").addEventListener("click", () => {
    if (mode !== "demo" || !selectedName) return;
    if (muted.has(selectedName)) muted.delete(selectedName);
    else muted.add(selectedName);
    applyAndRender(currentDemoFrame());
  });

  document.addEventListener("keydown", (event) => {
    if (!dialogOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (!help.hidden) setHelp(false);
      else closeConsole();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...consolePanel.querySelectorAll(
      'button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), [tabindex="0"]',
    )].filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  engine.setVoiceHandler((name) => flashVoice(name));
  engine.setIncidentHandler(flashIncident);
  engine.setDeploymentHandler((deployment, firstNote) => {
    if (firstNote) flashDeployment(deployment);
  });
  engine.setPerformanceHandler((performance) => {
    if (mode !== "demo" || !performance) return;
    if (performanceArrangement?.id !== performance.id) return;
    sceneTransitionPending = false;
    performanceStatus = `Active // ${performance.sceneName} // ${performance.seed}`;
    renderPerformance(currentFrame);
  });
  engine.setGhostPhaseHandler((phase) => {
    if (mode !== "demo") return;
    renderGhostControls(phase);
  });
  engine.setSampleLoadHandler(() => {
    const status = host.querySelector("[data-important-status]");
    if (status && engine.isRunning()) {
      status.textContent = "Atlas APU ready: six procedural roles, zero streamed or decoded audio assets.";
    }
  });

  const poller = createPoller({
    onFrame(frame, info) {
      const hybridFrame = buildHybridFrame(frame, info.merged);
      lastLiveFrame = hybridFrame;
      lastLiveMerged = clone(info.merged);
      latestDeployment = info.deployment ?? latestDeployment;
      host.querySelector("[data-demo-mode]").disabled = false;
      if (mode === "live") {
        applyAndRender(hybridFrame);
        if (info.newIncidents > 0) {
          engine.queueIncidentAccent(info.newIncidents);
        }
      }
    },
    onDeployment(deployment) {
      latestDeployment = deployment;
      recentDeployment = deployment;
      engine.queueDeploymentMotif(deployment);
      flashDeployment(deployment);
    },
  });

  const initialMerged = { stale: true, services: [] };
  const initialFrame = buildHybridFrame(computeFrame(initialMerged), initialMerged);
  applyAndRender(initialFrame);
  poller.start();

  window.addEventListener("pagehide", () => {
    poller.stop();
    if (waveformAnimation !== null) {
      window.cancelAnimationFrame(waveformAnimation);
      waveformAnimation = null;
    }
    engine.dispose();
  }, { once: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSystemSymphony, { once: true });
} else {
  initSystemSymphony();
}
