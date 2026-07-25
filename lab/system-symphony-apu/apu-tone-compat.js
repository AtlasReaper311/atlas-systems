(() => {
  const Tone = globalThis.Tone;
  const prototype = Tone?.PolySynth?.prototype;
  if (!prototype?.triggerAttackRelease) return;
  if (Tone.__atlasApuTransitionCompatibilityInstalled) return;

  const originalTriggerAttackRelease = prototype.triggerAttackRelease;
  Tone.__atlasApuSuppressedPolyStarts = 0;

  function guardedTriggerAttackRelease(...args) {
    try {
      return originalTriggerAttackRelease.apply(this, args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Start time must be strictly greater than previous start time")) {
        throw error;
      }

      // Tone.js can reject a decorative PolySynth accent when its internal
      // voice allocator receives an equal scheduled start. The soundtrack form,
      // transport and evidence state are authoritative; omit that one accent
      // rather than allowing a non-critical event voice to poison playback.
      Tone.__atlasApuSuppressedPolyStarts += 1;
      return this;
    }
  }

  try {
    Object.defineProperty(prototype, "triggerAttackRelease", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: guardedTriggerAttackRelease,
    });
  } catch {
    prototype.triggerAttackRelease = guardedTriggerAttackRelease;
  }

  Tone.__atlasApuTransitionCompatibilityInstalled = prototype.triggerAttackRelease === guardedTriggerAttackRelease;
})();
