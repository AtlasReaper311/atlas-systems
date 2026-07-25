(() => {
  const Tone = globalThis.Tone;
  if (!Tone?.PolySynth || !Tone?.FMSynth || !Tone?.Synth) return;
  if (Tone.__atlasApuTransitionCompatibilityInstalled) return;

  const OriginalPolySynth = Tone.PolySynth;

  function AtlasPolySynth(Voice, options = {}) {
    if (Voice === Tone.FMSynth) {
      return new Tone.Synth({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.002, decay: 0.1, sustain: 0.08, release: 0.18 },
        volume: -16,
      });
    }
    return new OriginalPolySynth(Voice, options);
  }

  Object.setPrototypeOf(AtlasPolySynth, OriginalPolySynth);
  AtlasPolySynth.prototype = OriginalPolySynth.prototype;

  try {
    Object.defineProperty(Tone, "PolySynth", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: AtlasPolySynth,
    });
  } catch {
    Tone.PolySynth = AtlasPolySynth;
  }

  Tone.__atlasApuTransitionCompatibilityInstalled = Tone.PolySynth === AtlasPolySynth;
})();
