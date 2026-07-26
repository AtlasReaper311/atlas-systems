import { APU_LOUDNESS_DSP_BUILD_ID } from "./apu-loudness-dsp.js?v=20260726-system-symphony-loudness-dsp-v1";

export const APU_LOUDNESS_METER_BUILD_ID = "20260726-system-symphony-loudness-meter-v1";
export const APU_LOUDNESS_PROCESSOR_NAME = "atlas-apu-loudness-meter";
export const APU_LOUDNESS_WORKLET_URL = "/static/js/sonify/apu-loudness-worklet.js?v=20260726-system-symphony-loudness-meter-v1";

function describeError(error) {
  const name = typeof error?.name === "string" && error.name ? error.name : "Error";
  const message = typeof error?.message === "string" && error.message
    ? error.message
    : String(error || "unknown error");
  const code = error?.code === undefined ? "" : ` code=${String(error.code)}`;
  return `${name}: ${message}${code}`;
}

function stageError(stage, dialect, error) {
  const wrapped = new Error(`APU loudness ${stage} failed [${dialect}]: ${describeError(error)}`);
  wrapped.cause = error;
  return wrapped;
}

function nativeAudioContext(context) {
  const candidates = [
    context?.rawContext?._nativeAudioContext,
    context?._nativeAudioContext,
    context?._context?._nativeAudioContext,
    context?.rawContext,
    context?._context,
    context,
  ];
  const BaseContext = globalThis.BaseAudioContext;
  return candidates.find((candidate) => {
    if (!candidate?.audioWorklet?.addModule) return false;
    return typeof BaseContext !== "function" || candidate instanceof BaseContext;
  }) ?? null;
}

function standardizedAudioContext(context, toneContext) {
  const candidates = [
    toneContext?.rawContext,
    context?.rawContext,
    toneContext?._context,
    context?._context,
  ];
  return candidates.find((candidate) => (
    typeof candidate?.createGain === "function"
    && candidate?.destination
  )) ?? null;
}

function createZeroGainSink(audioContext) {
  if (!audioContext?.createGain || !audioContext?.destination) {
    throw new TypeError("audio context cannot create a silent monitor sink");
  }
  const sink = audioContext.createGain();
  if (sink?.gain) sink.gain.value = 0;
  sink.connect(audioContext.destination);
  return sink;
}

function toneWorkletFactory(context) {
  const candidates = [context, context?.rawContext, context?._context];
  const toneContext = candidates.find((candidate) => (
    typeof candidate?.addAudioWorkletModule === "function"
    && typeof candidate?.createAudioWorkletNode === "function"
  ));
  if (!toneContext) return null;
  const audioContext = standardizedAudioContext(context, toneContext);
  if (!audioContext) return null;
  return Object.freeze({
    sampleRate: toneContext.sampleRate ?? audioContext.sampleRate ?? context?.sampleRate ?? null,
    addModule: (url) => toneContext.addAudioWorkletModule(url, APU_LOUDNESS_PROCESSOR_NAME),
    // Tone 14.8 delegates to standardized-audio-context. Chromium rejects the
    // explicit AudioWorkletNode options accepted by the native fallback, so use
    // the registered processor's one-input/one-output defaults on this path.
    createNode: (name) => toneContext.createAudioWorkletNode(name),
    createSilentSink: () => createZeroGainSink(audioContext),
    dialect: "tone-context",
  });
}

function nativeWorkletFactory(context) {
  const rawContext = nativeAudioContext(context);
  if (!rawContext || typeof globalThis.AudioWorkletNode !== "function") return null;
  return Object.freeze({
    sampleRate: rawContext.sampleRate,
    addModule: (url) => rawContext.audioWorklet.addModule(url),
    createNode: (name, options) => new globalThis.AudioWorkletNode(rawContext, name, options),
    createSilentSink: () => createZeroGainSink(rawContext),
    dialect: "native-context",
  });
}

function workletFactory(context) {
  // Tone.js wraps standardized-audio-context. Its Context methods create a
  // worklet node in the same node dialect as Tone.Destination. The worklet
  // output terminates at an explicit zero-gain sink connected directly to the
  // raw context destination, so the meter never returns audio to System Symphony.
  return toneWorkletFactory(context) ?? nativeWorkletFactory(context);
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
      failures.push(describeError(error));
    }
  }
  throw new Error(`source is not connectable: ${failures.join("; ") || "no audio output"}`);
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
  const factory = workletFactory(context);
  if (!factory) throw new Error("AudioWorklet is unavailable in this browser context");

  let disposed = false;
  let status = "loading";
  let metrics = null;
  let processorReady = false;
  let connectedSource = null;
  let silentSink = null;

  const emitStatus = (nextStatus, detail = null) => {
    status = nextStatus;
    onStatus?.(Object.freeze({
      buildId: APU_LOUDNESS_METER_BUILD_ID,
      status,
      detail,
      processorReady,
      dialect: factory.dialect,
    }));
  };

  emitStatus("loading");
  try {
    await factory.addModule(APU_LOUDNESS_WORKLET_URL);
  } catch (error) {
    throw stageError("module registration", factory.dialect, error);
  }

  let node = null;
  try {
    node = factory.createNode(APU_LOUDNESS_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      processorOptions: {
        maxBlockHistory,
      },
    });
    if (!node?.port) throw new TypeError("created worklet node has no MessagePort");
    silentSink = factory.createSilentSink();
    node.connect(silentSink);
  } catch (error) {
    silentSink?.disconnect?.();
    node?.port?.close?.();
    node?.disconnect?.();
    throw stageError("node creation", factory.dialect, error);
  }

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
      emitStatus("running", `${message.buildId ?? APU_LOUDNESS_DSP_BUILD_ID}@${message.sampleRate ?? factory.sampleRate ?? "unknown"}`);
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
    silentSink.disconnect?.();
    throw stageError("source connection", factory.dialect, error);
  }

  return Object.freeze({
    buildId: APU_LOUDNESS_METER_BUILD_ID,

    getStatus() {
      return Object.freeze({ status, processorReady, disposed, dialect: factory.dialect });
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
      disconnectSource(node, silentSink);
      silentSink?.disconnect?.();
      node.port.close();
      node.disconnect();
      emitStatus("disposed");
    },
  });
}
