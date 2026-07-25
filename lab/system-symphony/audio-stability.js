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
    maximumOutputDb: -Infinity,
    meterSamples: 0,
    outputCeilingDb: OUTPUT_CEILING_DB,
    sampleTrimDb: SAMPLE_TRIM_DB,
    lookAheadSeconds: null,
    updateIntervalSeconds: null,
  };

  function toneNow() {
    return typeof Tone.now === "function" ? Tone.now() : 0;
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
    const nodePrototype = Tone.ToneAudioNode?.prototype;
    const nativeToDestination = nodePrototype?.toDestination;
    if (typeof nativeToDestination !== "function") return;

    const safetyLimiter = new Tone.Limiter(OUTPUT_CEILING_DB);
    nativeToDestination.call(safetyLimiter);

    const meter = typeof Tone.Meter === "function"
      ? new Tone.Meter({ normalRange: false, smoothing: 0.72 })
      : null;
    if (meter) safetyLimiter.connect(meter);

    nodePrototype.toDestination = function toStableDestination() {
      this.connect(safetyLimiter);
      return this;
    };

    window.setInterval(() => {
      if (!meter) return;
      const reading = meter.getValue();
      const values = Array.isArray(reading) ? reading : [reading];
      const finite = values.filter(Number.isFinite);
      if (!finite.length) return;
      diagnostics.maximumOutputDb = Math.max(diagnostics.maximumOutputDb, ...finite);
      diagnostics.meterSamples += 1;
    }, 100);
  }

  function replaceConstructor(name, transformOptions) {
    const Native = Tone[name];
    if (typeof Native !== "function") return;

    class StableConstructor extends Native {
      constructor(...args) {
        super(...transformOptions(args));
      }
    }
    Object.setPrototypeOf(StableConstructor, Native);
    Tone[name] = StableConstructor;
  }

  function trimVolumeOptions(args) {
    if (!args.length || typeof args[0] !== "object" || args[0] === null) return args;
    const options = { ...args[0] };
    if (Number.isFinite(options.volume)) options.volume += SAMPLE_TRIM_DB;
    return [options, ...args.slice(1)];
  }

  function installLowDistortionProfile() {
    replaceConstructor("Distortion", (args) => {
      if (!args.length || typeof args[0] !== "object" || args[0] === null) return args;
      const options = { ...args[0] };
      const wet = Number(options.wet);
      if (Number.isFinite(wet)) {
        options.wet = Number(options.distortion) <= 0.05 ? 0 : Math.min(0.025, wet);
      }
      options.oversample = "none";
      return [options, ...args.slice(1)];
    });

    replaceConstructor("Limiter", (args) => {
      const threshold = Number(args[0]);
      return [Number.isFinite(threshold) ? Math.min(threshold, OUTPUT_CEILING_DB) : OUTPUT_CEILING_DB];
    });

    replaceConstructor("Player", trimVolumeOptions);
    replaceConstructor("GrainPlayer", trimVolumeOptions);
    replaceConstructor("Sampler", trimVolumeOptions);

    replaceConstructor("Reverb", (args) => {
      if (!args.length || typeof args[0] !== "object" || args[0] === null) return args;
      const options = { ...args[0] };
      if (Number.isFinite(options.decay)) options.decay = Math.min(options.decay, 1.35);
      return [options, ...args.slice(1)];
    });
  }

  function safeScheduledTime(value) {
    if (!Number.isFinite(value)) return value;
    const now = toneNow();
    const minimum = now + 0.012;
    if (value >= minimum) return value;
    const lateBy = minimum - value;
    diagnostics.lateScheduleCount += 1;
    diagnostics.maximumLateSeconds = Math.max(diagnostics.maximumLateSeconds, lateBy);
    return Math.ceil(minimum * 1000) / 1000;
  }

  function wrapScheduledMethod(Constructor, methodName, timeIndex) {
    const prototype = Constructor?.prototype;
    const native = prototype?.[methodName];
    if (typeof native !== "function" || native.__atlasStableSchedule) return;

    function stableScheduledMethod(...args) {
      args[timeIndex] = safeScheduledTime(args[timeIndex]);
      return native.apply(this, args);
    }
    stableScheduledMethod.__atlasStableSchedule = true;
    prototype[methodName] = stableScheduledMethod;
  }

  function installScheduleGuard() {
    for (const name of ["Player", "GrainPlayer"]) {
      wrapScheduledMethod(Tone[name], "start", 0);
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
      wrapScheduledMethod(Tone[name], "triggerAttackRelease", 2);
    }
    for (const name of ["NoiseSynth", "MetalSynth"]) {
      wrapScheduledMethod(Tone[name], "triggerAttackRelease", 1);
    }
  }

  function setPreloadUi(disabled, message) {
    for (const button of document.querySelectorAll("[data-audio-toggle]")) {
      if (disabled) {
        button.disabled = true;
        button.dataset.stabilityGate = "true";
      } else if (button.dataset.stabilityGate === "true") {
        button.disabled = false;
        delete button.dataset.stabilityGate;
      }
    }
    const status = document.querySelector("[data-important-status]");
    if (status && message) status.textContent = message;
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
        maximumOutputDb: Number.isFinite(diagnostics.maximumOutputDb)
          ? diagnostics.maximumOutputDb
          : null,
      };
    },
  };
})();
