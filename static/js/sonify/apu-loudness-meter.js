import { APU_LOUDNESS_DSP_BUILD_ID } from "./apu-loudness-dsp.js?v=20260726-system-symphony-loudness-dsp-v1";

export const APU_LOUDNESS_METER_BUILD_ID = "20260726-system-symphony-loudness-meter-v1";
export const APU_LOUDNESS_PROCESSOR_NAME = "atlas-apu-loudness-meter";
export const APU_LOUDNESS_WORKLET_URL = "/static/js/sonify/apu-loudness-worklet.js?v=20260726-system-symphony-loudness-meter-v1";

function isUsableAudioContext(candidate) {
  if (!candidate?.audioWorklet?.addModule) return false;
  const BaseContext = globalThis.BaseAudioContext;
  if (typeof BaseContext === "function") return candidate instanceof BaseContext;
  return true;
}

function rawAudioContext(context) {
  const candidates = [
    context?.rawContext?._nativeAudioContext,
    context?._nativeAudioContext,
    context?._context?._nativeAudioContext,
    context?.rawContext,
    context?._context,
    context,
  ];
  return candidates.find(isUsableAudioContext) ?? null;
}

function sourceCandidates(source) {
  return [...new Set([
    source,
    source?.output,
    source?.input,
    source?._gainNode,
  ].filter((candidate) => candidate?.connect))];
}

function connectSource(source, destination) {
  const failures = [];
  for (const candidate of sourceCandidates(source)) {
    try {
      candidate.connect(destination);
      return candidate;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`APU loudness meter source is not connectable: ${failures.join("; ") || "no audio output"}`);
}

function disconnectSource(source, destination) {
  try {
    source?.disconnect?.(destination);
  } catch {
    // Tone.js nodes can already be disconnected during graph disposal.
  }
}

export async function createApuLoudnessMeter({
  context,
  source,
  onMetrics = null,
  onStatus = null,
  onError = null,
  maxBlockHistory = 216000,
} = {}) {
  const rawContext = rawAudioContext(context);
  if (!rawContext || typeof AudioWorkletNode !== "function") {
    throw new Error("AudioWorklet is unavailable in this browser context");
  }

  let disposed = false;
  let status = "loading";
  let metrics = null;
  let processorReady = false;
  let connectedSource = null;

  const emitStatus = (nextStatus, detail = null) => {
    status = nextStatus;
    onStatus?.(Object.freeze({
      buildId: APU_LOUDNESS_METER_BUILD_ID,
      status,
      detail,
      processorReady,
    }));
  };

  emitStatus("loading");
  await rawContext.audioWorklet.addModule(APU_LOUDNESS_WORKLET_URL);

  const node = new AudioWorkletNode(rawContext, APU_LOUDNESS_PROCESSOR_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 2,
    channelCountMode: "explicit",
    channelInterpretation: "speakers",
    processorOptions: {
      maxBlockHistory,
    },
  });

  node.onprocessorerror = (event) => {
    const error = new Error(event?.message || "APU loudness worklet processor failed");
    status = "failed";
    onError?.(error);
    emitStatus("failed", error.message);
  };

  node.port.onmessage = (event) => {
    const message = event.data ?? {};
    if (message.type === "ready") {
      processorReady = true;
      emitStatus("running", `${message.buildId ?? APU_LOUDNESS_DSP_BUILD_ID}@${message.sampleRate ?? rawContext.sampleRate}`);
      return;
    }
    if (message.type === "metrics" && message.metrics) {
      metrics = Object.freeze({ ...message.metrics });
      onMetrics?.(metrics);
      return;
    }
    if (message.type === "error") {
      const error = new Error(message.message || "APU loudness worklet reported an error");
      status = "failed";
      onError?.(error);
      emitStatus("failed", error.message);
    }
  };

  try {
    connectedSource = connectSource(source, node);
  } catch (error) {
    node.port.close();
    node.disconnect();
    throw error;
  }

  return Object.freeze({
    buildId: APU_LOUDNESS_METER_BUILD_ID,

    getStatus() {
      return Object.freeze({ status, processorReady, disposed });
    },

    getMetrics() {
      return metrics;
    },

    reset() {
      if (disposed) return false;
      metrics = null;
      node.port.postMessage({ type: "reset" });
      return true;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      disconnectSource(connectedSource, node);
      node.port.close();
      node.disconnect();
      emitStatus("disposed");
    },
  });
}
