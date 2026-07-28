import "./apu-mastering-runtime.js?v=20260728-system-symphony-mastering-runtime-v4";
import {
  APU_LOUDNESS_METER_BUILD_ID,
  createApuLoudnessMeter,
} from "./apu-loudness-meter.js?v=20260726-system-symphony-loudness-meter-v3";

const root = document.querySelector("[data-apu-root]");
const volumeInput = root?.querySelector("[data-volume]");
const fields = Object.freeze({
  status: root?.querySelector('[data-loudness="status"]'),
  momentary: root?.querySelector('[data-loudness="momentary"]'),
  shortTerm: root?.querySelector('[data-loudness="short-term"]'),
  integrated: root?.querySelector('[data-loudness="integrated"]'),
  truePeak: root?.querySelector('[data-loudness="true-peak"]'),
  samplePeak: root?.querySelector('[data-loudness="sample-peak"]'),
  blocks: root?.querySelector('[data-loudness="blocks"]'),
  method: root?.querySelector('[data-loudness="method"]'),
});

let meter = null;
let starting = false;
let rawMetrics = null;
let adjustedMetrics = null;
let userGain = Math.max(0, Math.min(1, Number(volumeInput?.value ?? 50) / 100));

function setText(element, value) {
  if (element) element.textContent = value;
}

function gainCompensationDb(gain) {
  return gain > 0 ? -20 * Math.log10(gain) : Number.POSITIVE_INFINITY;
}

function compensate(value) {
  if (!Number.isFinite(value) || !(userGain > 0)) return Number.NEGATIVE_INFINITY;
  return value + gainCompensationDb(userGain);
}

function formatLoudness(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} LUFS` : "Below gate";
}

function formatPeak(value, suffix) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ${suffix}` : "Silent";
}

function renderMetrics(metrics) {
  rawMetrics = metrics;
  adjustedMetrics = Object.freeze({
    ...metrics,
    momentaryLufs: compensate(metrics.momentaryLufs),
    shortTermLufs: compensate(metrics.shortTermLufs),
    integratedLufs: compensate(metrics.integratedLufs),
    samplePeakDbfs: compensate(metrics.samplePeakDbfs),
    truePeakDbtp: compensate(metrics.truePeakDbtp),
    sessionTruePeakDbtp: compensate(metrics.sessionTruePeakDbtp),
    userGain,
    gainCompensationDb: userGain > 0 ? gainCompensationDb(userGain) : null,
  });

  if (!(userGain > 0)) {
    setText(fields.status, "Muted");
    setText(fields.momentary, "Muted");
    setText(fields.shortTerm, "Muted");
    setText(fields.integrated, "Muted");
    setText(fields.truePeak, "Muted");
    setText(fields.samplePeak, "Muted");
    return;
  }

  setText(fields.status, metrics.ready ? "Measuring" : "Warming up");
  setText(fields.momentary, formatLoudness(adjustedMetrics.momentaryLufs));
  setText(fields.shortTerm, formatLoudness(adjustedMetrics.shortTermLufs));
  setText(fields.integrated, formatLoudness(adjustedMetrics.integratedLufs));
  setText(fields.truePeak, formatPeak(adjustedMetrics.sessionTruePeakDbtp, "dBTP est."));
  setText(fields.samplePeak, formatPeak(adjustedMetrics.samplePeakDbfs, "dBFS"));
  setText(fields.blocks, `${metrics.gatedBlockCount} / ${metrics.blockCount}`);
  setText(
    fields.method,
    `${metrics.compliance}; ${metrics.truePeakMethod}; readings normalised above the user volume control.`,
  );
}

function renderStatus(event) {
  const status = event?.status ?? "unknown";
  if (root) root.dataset.loudnessStatus = status;
  if (status === "loading") setText(fields.status, "Loading worklet");
  if (status === "running") setText(fields.status, "Warming up");
  if (status === "failed") setText(fields.status, "Meter unavailable");
  if (status === "disposed") setText(fields.status, "Stopped");
}

function renderError(error) {
  if (root) root.dataset.loudnessStatus = "failed";
  setText(fields.status, "Meter unavailable");
  setText(fields.method, `The soundtrack remains active. Meter error: ${error.message}`);
}

async function startMeter() {
  if (!root || meter || starting || root.dataset.running !== "true") return;
  const Tone = globalThis.Tone;
  if (!Tone?.getContext || !Tone?.getDestination) {
    renderError(new Error("Tone.js destination is unavailable"));
    return;
  }

  starting = true;
  try {
    meter = await createApuLoudnessMeter({
      context: Tone.getContext(),
      source: Tone.getDestination(),
      onMetrics: renderMetrics,
      onStatus: renderStatus,
      onError: renderError,
    });
  } catch (error) {
    renderError(error instanceof Error ? error : new Error(String(error)));
  } finally {
    starting = false;
  }
}

function handleVolume() {
  userGain = Math.max(0, Math.min(1, Number(volumeInput?.value ?? 0) / 100));
  meter?.reset();
  rawMetrics = null;
  adjustedMetrics = null;
  setText(fields.blocks, "0 / 0");
  setText(fields.method, userGain > 0
    ? "Measurement restarted after the volume change."
    : "Measurement is paused visually while the preview output is muted.");
  if (root?.dataset.loudnessStatus === "running") setText(fields.status, userGain > 0 ? "Warming up" : "Muted");
}

volumeInput?.addEventListener("input", handleVolume);

const observer = root ? new MutationObserver(() => {
  if (root.dataset.running === "true") startMeter();
}) : null;
observer?.observe(root, { attributes: true, attributeFilter: ["data-running"] });

if (root?.dataset.running === "true") startMeter();

globalThis.__ATLAS_APU_LOUDNESS__ = Object.freeze({
  buildId: APU_LOUDNESS_METER_BUILD_ID,
  getStatus: () => meter?.getStatus?.() ?? Object.freeze({ status: starting ? "loading" : "idle", processorReady: false }),
  getMetrics: () => adjustedMetrics,
  getRawMetrics: () => rawMetrics,
  reset: () => meter?.reset?.() ?? false,
});

globalThis.addEventListener("pagehide", () => {
  observer?.disconnect();
  meter?.dispose?.();
  meter = null;
}, { once: true });
