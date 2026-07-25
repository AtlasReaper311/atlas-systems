(() => {
  "use strict";

  const PREVIEW_HOST = "system-symphony-pr-43.atlas-systems-44t.pages.dev";
  const SAMPLE_MODULE = "/static/js/sonify/samples.js?v=20260720-system-symphony-loop-production-v2";
  const OUTPUT_CEILING_DB = -4;
  const SAMPLE_TRIM_DB = -4;
  const MAX_PREFETCH_CONCURRENCY = 4;

  if (window.location.hostname !== PREVIEW_HOST) return;

  const Tone = window.Tone;
  if (!Tone) {
    console.error("system-symphony: audio stability layer requires Tone.js");
    return;
  }

  const diagnostics = {
    enabled: true,
    preloadState: "loading",
    preloadedAssets: 0,
    preloadFailures: 0,
    lateScheduleCount: 0,
    maximumLateSeconds: 0,
    destinationTrimDb: null,
    configuredLimiterCount: 0,
    minimumLimiterThresholdDb: null,
    sampleNodesTrimmed: 0,
    distortionNodesStabilised: 0,
    reverbNodesStabilised: 0,
    flattenedScheduleCallbacks: 0,
    outputCeilingDb: OUTPUT_CEILING_DB,
    sampleTrimDb: SAMPLE_TRIM_DB,
    lookAheadSeconds: null,
    updateIntervalSeconds: null,
  };

  function toneNow() {
    return typeof Tone.now === "function" ? Tone.now() : 0;
  }

  function rawAudioNow() {
    const context = typeof Tone.getContext === "function" ? Tone.getContext() : Tone.context;
    const rawContext = context?.rawContext ?? context;
    return Number.isFinite(rawContext?.currentTime)
      ? rawContext.currentTime
      : toneNow();
  }

  function configureContext() {
    const context = typeof Tone.getContext === "function" ? Tone.getContext() : Tone.context;
    const rawContext = context?.rawContext ?? context;
    const baseLatency = Number(rawContext?.baseLatency) || 0;
    const outputLatency = Number(rawContext?.outputLatency) || 0;
    const lookAhead = Math.min(0.24, Math.max(0.12, (baseLatency + outputLatency) * 2 + 0.04));
    const updateInterval = Math.min(0.05, Math.max(0.025, lookAhead / 4));

    if (context && "lookAhead" in context) context.lookAhead = lookAhead;
    if (context && "updateInterval" in context) context.updateInterval = updateInterval;

    diagnostics.lookAheadSeconds = lookAhead;
    diagnostics.updateIntervalSeconds = updateInterval;
  }

  function installOutputSafety() {
    const destination = typeof Tone.getDestination === "function"
      ? Tone.getDestination()
      : Tone.Destination;
    const parameter = destination?.volume;
    if (!parameter) return;
    const current = Number(parameter.value);
    const target = Number.isFinite(current)
      ? Math.min(current, OUTPUT_CEILING_DB)
      : OUTPUT_CEILING_DB;
    const time = toneNow();
    if (typeof parameter.setValueAtTime === "function") {
      parameter.setValueAtTime(target, time);
    } else {
      parameter.value = target;
    }
    diagnostics.destinationTrimDb = target;
  }

  function wrapConnect(Constructor, stabilise) {
    const prototype = Constructor?.prototype;
    const nativeConnect = prototype?.connect;
    if (typeof nativeConnect !== "function" || nativeConnect.__atlasStableConnect) return;

    function stableConnect(...args) {
      if (!this.__atlasAudioStabilised) {
        stabilise(this);
        Object.defineProperty(this, "__atlasAudioStabilised", { value: true });
      }
      return nativeConnect.apply(this, args);
    }
    stableConnect.__atlasStableConnect = true;
    prototype.connect = stableConnect;
  }

  function setParamValue(parameter, value) {
    if (!parameter || !Number.isFinite(value)) return;
    const time = toneNow();
    if (typeof parameter.setValueAtTime === "function") {
      parameter.setValueAtTime(value, time);
    } else {
      parameter.value = value;
    }
  }

  function installLowDistortionProfile() {
    wrapConnect(Tone.Distortion, (node) => {
      const requested = Number(node.wet?.value);
      const distortion = Number(node.distortion);
      const wet = distortion <= 0.05 ? 0 : Math.min(0.025, Number.isFinite(requested) ? requested : 0);
      setParamValue(node.wet, wet);
      diagnostics.distortionNodesStabilised += 1;
      try {
        node.oversample = "none";
      } catch {
        // Tone may expose oversample as read-only in some browser builds.
      }
    });

    wrapConnect(Tone.Limiter, (node) => {
      const current = Number(node.threshold?.value);
      const target = Number.isFinite(current)
        ? Math.min(current, OUTPUT_CEILING_DB)
        : OUTPUT_CEILING_DB;
      setParamValue(node.threshold, target);
      diagnostics.configuredLimiterCount += 1;
      diagnostics.minimumLimiterThresholdDb = diagnostics.minimumLimiterThresholdDb === null
        ? target
        : Math.min(diagnostics.minimumLimiterThresholdDb, target);
    });

    for (const Constructor of [Tone.Player, Tone.GrainPlayer, Tone.Sampler]) {
      wrapConnect(Constructor, (node) => {
        const current = Number(node.volume?.value);
        if (Number.isFinite(current)) {
          setParamValue(node.volume, current + SAMPLE_TRIM_DB);
          diagnostics.sampleNodesTrimmed += 1;
        }
      });
    }

    wrapConnect(Tone.Reverb, (node) => {
      if (Number.isFinite(node.decay)) node.decay = Math.min(node.decay, 1.35);
      diagnostics.reverbNodesStabilised += 1;
    });
  }

  function safeScheduledTime(value, label) {
    if (!Number.isFinite(value)) return value;
    const minimum = rawAudioNow() + 0.006;
    if (value >= minimum) return value;
    const lateBy = minimum - value;
    diagnostics.lateScheduleCount += 1;
    diagnostics.maximumLateSeconds = Math.max(diagnostics.maximumLateSeconds, lateBy);
    return Math.ceil(minimum * 1000) / 1000;
  }

  function wrapScheduledMethod(Constructor, methodName, timeIndex, label) {
    const prototype = Constructor?.prototype;
    const native = prototype?.[methodName];
    if (typeof native !== "function" || native.__atlasStableSchedule) return;

    function stableScheduledMethod(...args) {
      args[timeIndex] = safeScheduledTime(args[timeIndex], label);
      return native.apply(this, args);
    }
    stableScheduledMethod.__atlasStableSchedule = true;
    prototype[methodName] = stableScheduledMethod;
  }

  function installScheduleGuard() {
    for (const name of ["Player", "GrainPlayer"]) {
      wrapScheduledMethod(Tone[name], "start", 0, `${name}.start`);
    }
    for (const name of [
      "Sampler",
      "Synth",
      "FMSynth",
      "AMSynth",
      "MonoSynth",
      "MembraneSynth",
      "PolySynth",
    ]) {
      wrapScheduledMethod(Tone[name], "triggerAttackRelease", 2, `${name}.triggerAttackRelease`);
    }
    for (const name of ["NoiseSynth", "MetalSynth"]) {
      wrapScheduledMethod(Tone[name], "triggerAttackRelease", 1, `${name}.triggerAttackRelease`);
    }
  }

  function installNestedScheduleFlattening() {
    const transport = typeof Tone.getTransport === "function"
      ? Tone.getTransport()
      : Tone.Transport;
    const nativeScheduleOnce = transport?.scheduleOnce;
    if (!transport || typeof nativeScheduleOnce !== "function" || nativeScheduleOnce.__atlasFlattened) {
      return;
    }

    function flattenedScheduleOnce(callback, time) {
      if (typeof callback === "function" && Number.isFinite(time)) {
        diagnostics.flattenedScheduleCallbacks += 1;
        callback(time);
        return `atlas-inline-${diagnostics.flattenedScheduleCallbacks}`;
      }
      return nativeScheduleOnce.call(this, callback, time);
    }
    flattenedScheduleOnce.__atlasFlattened = true;
    transport.scheduleOnce = flattenedScheduleOnce;
  }

  function setPreloadUi(disabled, message) {
    for (const button of document.querySelectorAll("[data-audio-toggle]")) {
      if (disabled && button.dataset.stabilityGate !== "true") {
        button.disabled = true;
        button.dataset.stabilityGate = "true";
      } else if (!disabled && button.dataset.stabilityGate === "true") {
        button.disabled = false;
        delete button.dataset.stabilityGate;
      }
    }
    const status = document.querySelector("[data-important-status]");
    if (status && message && status.textContent !== message) {
      status.textContent = message;
    }
  }

  async function prefetchAssets() {
    const { allSampleAssets } = await import(SAMPLE_MODULE);
    const assets = allSampleAssets();
    let cursor = 0;

    async function worker() {
      while (cursor < assets.length) {
        const asset = assets[cursor];
        cursor += 1;
        try {
          const response = await window.fetch(asset.url, {
            method: "GET",
            cache: "force-cache",
            credentials: "same-origin",
          });
          if (!response.ok) throw new Error(`${asset.id} answered ${response.status}`);
          await response.arrayBuffer();
          diagnostics.preloadedAssets += 1;
        } catch (error) {
          diagnostics.preloadFailures += 1;
          console.warn(`system-symphony: preload failed for ${asset.id}`, error);
        }
      }
    }

    setPreloadUi(true, "Preparing the audio library for stable playback…");
    await Promise.all(
      Array.from(
        { length: Math.min(MAX_PREFETCH_CONCURRENCY, Math.max(1, assets.length)) },
        () => worker(),
      ),
    );
    diagnostics.preloadState = diagnostics.preloadFailures === 0 ? "ready" : "degraded";
    setPreloadUi(
      false,
      diagnostics.preloadFailures === 0
        ? `Audio library ready: ${diagnostics.preloadedAssets} assets cached before playback.`
        : `Audio library ready with ${diagnostics.preloadFailures} fallback asset requests.`,
    );
  }

  configureContext();
  installOutputSafety();
  installLowDistortionProfile();
  installScheduleGuard();
  installNestedScheduleFlattening();

  const observer = new MutationObserver(() => {
    if (diagnostics.preloadState === "loading") {
      setPreloadUi(true, "Preparing the audio library for stable playback…");
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  void prefetchAssets()
    .catch((error) => {
      diagnostics.preloadState = "degraded";
      diagnostics.preloadFailures += 1;
      console.warn("system-symphony: audio preload failed; procedural fallback remains available", error);
      setPreloadUi(false, "Audio preload was incomplete. Procedural fallback remains available.");
    })
    .finally(() => observer.disconnect());

  window.__ATLAS_SYMPHONY_AUDIO_STABILITY__ = {
    getSnapshot() {
      return {
        ...diagnostics,
      };
    },
  };
})();
