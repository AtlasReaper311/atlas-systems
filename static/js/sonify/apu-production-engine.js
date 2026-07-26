import {
  APU_TRACK_DEFAULT_GAIN,
  createApuTrackEngine,
} from "./apu-track-engine-v2.js?v=20260726-system-symphony-atlas-apu-live-v7";

export const AUDIO_CONTEXT_BLOCKED_CODE = "audio-context-blocked";
export const DEFAULT_USER_GAIN = APU_TRACK_DEFAULT_GAIN;
export const SYSTEM_SYMPHONY_BUILD_ID = "20260726-system-symphony-atlas-apu-live-v7";

function noAssetStats() {
  return Object.freeze({
    requested: 0,
    loaded: 0,
    failed: 0,
    fallbacks: 0,
    totalAssets: 0,
    completed: 0,
    coreReady: true,
    backgroundComplete: true,
    sampleFree: true,
  });
}

function normalizedStartError(error) {
  const message = String(error?.message ?? "");
  if (!error?.code && /audio|autoplay|context|suspend|timeout/i.test(message)) {
    try {
      error.code = AUDIO_CONTEXT_BLOCKED_CODE;
    } catch {
      return Object.assign(new Error(message || "Browser audio could not start"), {
        code: AUDIO_CONTEXT_BLOCKED_CODE,
        cause: error,
      });
    }
  }
  return error;
}

export function createEngine() {
  let currentFrame = null;
  let activePerformance = null;
  let voiceHandler = null;
  let incidentHandler = null;
  let deploymentHandler = null;
  let performanceHandler = null;
  let ghostPhaseHandler = null;
  let sampleLoadHandler = null;
  let ghostFocus = false;
  let ghostAudition = null;

  const engine = createApuTrackEngine({
    onVoice(event) {
      voiceHandler?.(event?.name, event);
    },
    onArrangement({ arrangement } = {}) {
      ghostPhaseHandler?.({
        name: arrangement?.directorPhase ?? arrangement?.section ?? "standby",
      });
    },
  });

  function applyFrame(frame) {
    if (!frame || typeof frame !== "object") return false;
    currentFrame = frame;
    return engine.applyFrame(frame);
  }

  function setPerformance(performance) {
    activePerformance = performance ?? null;
    performanceHandler?.(activePerformance);
    return Object.freeze({ queued: false, unchanged: false });
  }

  function setScene(frame, performance, { quantize = true } = {}) {
    activePerformance = performance ?? null;
    const queued = Boolean(quantize && engine.isRunning());
    applyFrame(frame);
    performanceHandler?.(activePerformance);
    return Object.freeze({ queued, unchanged: false });
  }

  return Object.freeze({
    buildId: SYSTEM_SYMPHONY_BUILD_ID,

    async start() {
      try {
        const started = await engine.start();
        sampleLoadHandler?.(noAssetStats());
        return started;
      } catch (error) {
        throw normalizedStartError(error);
      }
    },

    pause() {
      engine.pause();
    },

    applyFrame,
    setPerformance,
    setScene,

    setGhostFocus(enabled) {
      ghostFocus = Boolean(enabled);
      return ghostFocus;
    },

    setGhostAudition(layer) {
      ghostAudition = layer === "arp" || layer === "riff" ? layer : null;
      return ghostAudition;
    },

    queueIncidentAccent(count = 1) {
      const queued = engine.queueIncident(count);
      if (queued) incidentHandler?.();
      return queued;
    },

    queueDeploymentMotif(deployment = {}) {
      const queued = engine.queueDeployment(deployment);
      if (queued) deploymentHandler?.(deployment, true);
      return queued;
    },

    setUserVolume(value) {
      return engine.setVolume(value);
    },

    getWaveform: () => engine.getWaveform(),
    getSpectrum: () => engine.getSpectrum(),
    isInitialized: () => engine.isInitialized(),
    isRunning: () => engine.isRunning(),
    isSampleReady: () => true,
    getSampleLoadStats: noAssetStats,
    getSamplePalette: () => Object.freeze({
      section: "sample-free",
      lead: "pulse-a",
      bass: "triangle",
      bassLoop: null,
      atmosphere: "memory-field",
    }),
    getDebugNodes: () => Object.freeze({}),
    getGhostPhase() {
      const arrangement = engine.getArrangement();
      return arrangement
        ? Object.freeze({ name: arrangement.directorPhase ?? arrangement.section ?? "standby" })
        : null;
    },
    getGhostMixState: () => Object.freeze({ focus: ghostFocus, audition: ghostAudition }),
    getCompositionSnapshot: () => Object.freeze({
      mode: activePerformance ? "atlas-apu-audition" : "live",
      frameState: currentFrame?.scoreState ?? "unknown",
      arrangement: engine.getArrangement(),
      diagnostics: engine.getDiagnostics(),
    }),

    setVoiceHandler(handler) {
      voiceHandler = typeof handler === "function" ? handler : null;
    },
    setIncidentHandler(handler) {
      incidentHandler = typeof handler === "function" ? handler : null;
    },
    setDeploymentHandler(handler) {
      deploymentHandler = typeof handler === "function" ? handler : null;
    },
    setPerformanceHandler(handler) {
      performanceHandler = typeof handler === "function" ? handler : null;
    },
    setGhostPhaseHandler(handler) {
      ghostPhaseHandler = typeof handler === "function" ? handler : null;
    },
    setSampleLoadHandler(handler) {
      sampleLoadHandler = typeof handler === "function" ? handler : null;
      sampleLoadHandler?.(noAssetStats());
    },

    dispose() {
      engine.dispose();
      currentFrame = null;
      activePerformance = null;
    },
  });
}
