(() => {
  const Tone = globalThis.Tone;
  if (!Tone?.PolySynth || !Tone?.FMSynth || !Tone?.Synth) return;
  if (Tone.__atlasApuTransitionCompatibilityInstalled) return;

  const OriginalPolySynth = Tone.PolySynth;

  function AtlasPolySynth(Voice, options = {}) {
    const isTransitionVoice = Voice === Tone.FMSynth
      && Number(options?.harmonicity) === 2
      && Number(options?.modulationIndex) === 4.5;

    if (isTransitionVoice) {
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
  Tone.PolySynth = AtlasPolySynth;
  Tone.__atlasApuTransitionCompatibilityInstalled = true;
})();
