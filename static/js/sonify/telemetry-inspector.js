export const TELEMETRY_FRAME_EVENT = "system-symphony:telemetry-frame";

function formatUnit(value, suffix = "", digits = 2) {
  return Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : "n/a";
}

function ensureInspector() {
  if (typeof document === "undefined") return null;
  const host = document.getElementById("system-symphony-widget");
  if (!host) return null;
  const existing = host.querySelector("[data-modulation-inspector]");
  if (existing) return existing;

  const anchor = host.querySelector(".symphony-metrics");
  if (!anchor) return null;

  const section = document.createElement("section");
  section.className = "symphony-modulation-inspector";
  section.dataset.modulationInspector = "";
  section.setAttribute("aria-labelledby", "symphony-modulation-title");
  section.innerHTML = `
    <div class="symphony-section-heading">
      <div><span>Live control vector</span><h3 id="symphony-modulation-title">Telemetry → DSP</h3></div>
      <p>Bounded control-rate values. Healthy telemetry is acoustically neutral; pressure only adds small amounts of energy.</p>
    </div>
    <div class="symphony-metrics" data-modulation-grid>
      <article><span>Pressure</span><strong data-modulation="pressure">0.00</strong></article>
      <article><span>Latency pressure</span><strong data-modulation="latencyPressure">0.00</strong></article>
      <article><span>Error pressure</span><strong data-modulation="errorPressure">0.00</strong></article>
      <article><span>Coverage</span><strong data-modulation="coverage">0%</strong></article>
      <article><span>Incident pressure</span><strong data-modulation="incidentPressure">0.00</strong></article>
      <article><span>Deployment energy</span><strong data-modulation="deploymentEnergy">0.00</strong></article>
      <article><span>Tempo lift</span><strong data-modulation="tempoLiftBpm">+0.0 BPM</strong></article>
      <article><span>Density lift</span><strong data-modulation="densityLift">+0.0%</strong></article>
      <article><span>Gain lift</span><strong data-modulation="gainLiftDb">+0.0 dB</strong></article>
      <article><span>Stale decay</span><strong data-modulation="staleDecay">0%</strong></article>
    </div>
  `;
  anchor.insertAdjacentElement("afterend", section);
  return section;
}

function setValue(section, key, value) {
  const target = section?.querySelector(`[data-modulation="${key}"]`);
  if (target) target.textContent = value;
}

export function renderTelemetryInspector(frame) {
  const section = ensureInspector();
  const modulation = frame?.modulation;
  if (!section || !modulation) return false;

  setValue(section, "pressure", formatUnit(modulation.pressure));
  setValue(section, "latencyPressure", formatUnit(modulation.latencyPressure));
  setValue(section, "errorPressure", formatUnit(modulation.errorPressure));
  setValue(section, "coverage", formatUnit((modulation.coverage ?? 0) * 100, "%", 0));
  setValue(section, "incidentPressure", formatUnit(modulation.incidentPressure));
  setValue(section, "deploymentEnergy", formatUnit(modulation.deploymentEnergy));
  setValue(section, "tempoLiftBpm", `+${formatUnit(modulation.tempoLiftBpm, " BPM", 1)}`);
  setValue(section, "densityLift", `+${formatUnit((modulation.densityLift ?? 0) * 100, "%", 1)}`);
  setValue(section, "gainLiftDb", `+${formatUnit(modulation.gainLiftDb, " dB", 1)}`);
  setValue(section, "staleDecay", formatUnit((modulation.staleDecay ?? 0) * 100, "%", 0));
  section.dataset.stale = frame.stale ? "true" : "false";
  return true;
}

function handleFrame(event) {
  renderTelemetryInspector(event?.detail?.frame ?? null);
}

if (typeof window !== "undefined") {
  window.addEventListener(TELEMETRY_FRAME_EVENT, handleFrame);
}
