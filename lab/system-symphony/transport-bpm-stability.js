(() => {
  "use strict";

  const PREVIEW_HOST = "system-symphony-pr-43.atlas-systems-44t.pages.dev";
  if (window.location.hostname !== PREVIEW_HOST) return;

  const Tone = window.Tone;
  const transport = typeof Tone?.getTransport === "function"
    ? Tone.getTransport()
    : Tone?.Transport;
  const bpm = transport?.bpm;
  if (!bpm || typeof bpm.rampTo !== "function") {
    console.error("system-symphony: transport BPM stability hook is unavailable");
    return;
  }

  const diagnostics = {
    scheduledRamps: 0,
    skippedStableRamps: 0,
    lastTargetBpm: null,
    lastStartTime: null,
    lastEndTime: null,
  };

  bpm.rampTo = function rampBpmAtExplicitAudioTime(value, durationSeconds = 0.01) {
    const target = Number(value);
    if (!Number.isFinite(target)) return this;

    const current = Number(this.value);
    diagnostics.lastTargetBpm = target;
    if (Number.isFinite(current) && Math.abs(current - target) < 0.01) {
      diagnostics.skippedStableRamps += 1;
      return this;
    }

    const context = typeof Tone.getContext === "function" ? Tone.getContext() : Tone.context;
    const rawContext = context?.rawContext ?? context;
    const now = Number.isFinite(rawContext?.currentTime)
      ? rawContext.currentTime
      : 0;
    const lookAhead = Number.isFinite(context?.lookAhead)
      ? context.lookAhead
      : 0.12;
    const startTime = now + Math.max(0.006, lookAhead);
    const duration = Math.max(0.01, Number(durationSeconds) || 0.01);
    const startValue = Number.isFinite(current) ? current : target;

    if (
      typeof this.setValueAtTime === "function"
      && typeof this.linearRampToValueAtTime === "function"
    ) {
      this.setValueAtTime(startValue, startTime);
      this.linearRampToValueAtTime(target, startTime + duration);
    } else {
      this.value = target;
    }

    diagnostics.scheduledRamps += 1;
    diagnostics.lastStartTime = startTime;
    diagnostics.lastEndTime = startTime + duration;
    return this;
  };

  window.__ATLAS_SYMPHONY_BPM_STABILITY__ = {
    getSnapshot() {
      return { ...diagnostics, currentBpm: Number(bpm.value) };
    },
  };
})();
