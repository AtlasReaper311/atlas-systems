/**
 * Quiet musical Explore beds + soft interaction cues.
 * Mute-default, gesture-gated, organic ramps only.
 *
 * Beds are soft chord pads + sparse scale notes (soundtrack-ish).
 * No continuous high-pitched air tones. Cues stay sharp and short.
 *
 * Never use AudioParam.context — undefined in some browsers.
 */

const VOICES = Object.freeze({
  almost: {
    presence: "score",
    pattern: "clock",
    rootHz: 196, // G3
    intervals: [0, 3, 7, 10, 12],
    padGain: 0.028,
    noteGain: 0.05,
    intervalMs: [1100, 1700],
    cueHz: 392,
    lowpassHz: 1400,
  },
  drift: {
    presence: "score",
    pattern: "lattice",
    rootHz: 146.83, // D3
    intervals: [0, 2, 5, 7, 10, 12],
    padGain: 0.024,
    noteGain: 0.045,
    intervalMs: [900, 1500],
    cueHz: 293.66,
    lowpassHz: 1200,
  },
  speculum: {
    presence: "faint",
    pattern: "beam",
    rootHz: 174.61, // F3
    intervals: [0, 5, 7, 12],
    padGain: 0.012,
    noteGain: 0.018,
    intervalMs: [2400, 3800],
    cueHz: 349.23,
    lowpassHz: 1100,
  },
  shape: {
    presence: "score",
    pattern: "sonar",
    rootHz: 164.81, // E3
    intervals: [0, 3, 7, 12, 15],
    padGain: 0.022,
    noteGain: 0.048,
    intervalMs: [1300, 2100],
    cueHz: 329.63,
    lowpassHz: 1300,
  },
  bearing: {
    presence: "score",
    pattern: "strut",
    rootHz: 130.81, // C3
    intervals: [0, 5, 7, 12],
    padGain: 0.026,
    noteGain: 0.052,
    intervalMs: [1200, 1900],
    cueHz: 196,
    lowpassHz: 1000,
  },
  map: {
    presence: "faint",
    pattern: "city-air",
    kind: "chip",
    rootHz: 110, // A2
    intervals: [0, 7, 12],
    padGain: 0.01,
    noteGain: 0.014,
    intervalMs: [3000, 4800],
    cueHz: 220,
    lowpassHz: 900,
  },
});

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function softRamp(audioContext, param, value, seconds) {
  if (!audioContext || !param) return;
  const now = audioContext.currentTime;
  const current = Number.isFinite(param.value)
    ? Math.max(0.0001, param.value)
    : 0.0001;
  param.cancelScheduledValues(now);
  param.setValueAtTime(current, now);
  param.exponentialRampToValueAtTime(
    Math.max(0.0001, value),
    now + Math.max(0.08, seconds),
  );
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function jitter(min, max) {
  return min + Math.random() * (max - min);
}

function midiOffsetHz(rootHz, semitones) {
  return rootHz * 2 ** (semitones / 12);
}

/**
 * @param {{ voice: keyof typeof VOICES, button: HTMLButtonElement | null }} options
 */
export function mountLabSound({ voice, button }) {
  const profile = VOICES[voice];
  if (!profile) {
    throw new Error(`Unknown lab sound voice: ${voice}`);
  }

  let context = null;
  let master = null;
  let bedBus = null;
  let cueBus = null;
  let bedFilter = null;
  let padGain = null;
  let padOscs = [];
  let enabled = false;
  let starting = false;
  let lastCueAt = 0;
  let pulseTimer = 0;
  let breatheTimer = 0;
  let scaleStep = 0;
  const reduced = prefersReducedMotion();
  const presenceScale = profile.presence === "faint" ? 0.55 : 1;
  const motionScale = reduced ? 0.7 : 1;

  function syncButton() {
    if (!button) return;
    button.setAttribute("aria-pressed", String(enabled));
    button.textContent = enabled ? "Sound on" : "Sound";
    button.title = enabled
      ? "Mute the soft Lab soundtrack"
      : "Enable a soft Lab soundtrack (starts quiet)";
  }

  function stopPulseTimer() {
    if (pulseTimer) {
      window.clearTimeout(pulseTimer);
      pulseTimer = 0;
    }
  }

  function stopBedMotion() {
    stopPulseTimer();
    if (breatheTimer) {
      window.clearTimeout(breatheTimer);
      breatheTimer = 0;
    }
  }

  function playGrain({
    freqs,
    peak,
    attack,
    release,
    type = "sine",
    filterHz = 1400,
    destination,
    glide = 1,
    q = 0.7,
  }) {
    if (!context || !destination) return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const freq = Array.isArray(freqs) ? pick(freqs) : freqs;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (glide !== 1) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(40, freq * glide),
        now + attack + release,
      );
    }

    filter.type = "lowpass";
    filter.frequency.value = filterHz;
    filter.Q.value = q;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    osc.start(now);
    osc.stop(now + attack + release + 0.05);
  }

  function playChordNote(semitone, peak, attack, release) {
    playGrain({
      freqs: midiOffsetHz(profile.rootHz, semitone),
      peak,
      attack,
      release,
      type: "triangle",
      filterHz: profile.lowpassHz,
      destination: bedBus,
      q: 0.55,
    });
    // Soft octave ghost for body without bright edge.
    playGrain({
      freqs: midiOffsetHz(profile.rootHz, semitone - 12),
      peak: peak * 0.35,
      attack: attack * 1.2,
      release: release * 1.1,
      type: "sine",
      filterHz: profile.lowpassHz * 0.75,
      destination: bedBus,
      q: 0.4,
    });
  }

  function breathePad() {
    if (!enabled || !context || !padGain) return;
    const now = context.currentTime;
    const low =
      0.0001 +
      profile.padGain * presenceScale * motionScale * 0.35;
    const high =
      profile.padGain * presenceScale * motionScale *
      (profile.presence === "faint" ? 0.75 : 1);
    const rise = profile.presence === "faint" ? 2.8 : 2.1;
    const hold = profile.presence === "faint" ? 1.6 : 1.1;
    const fall = profile.presence === "faint" ? 3.2 : 2.4;

    padGain.gain.cancelScheduledValues(now);
    padGain.gain.setValueAtTime(Math.max(0.0001, padGain.gain.value), now);
    padGain.gain.exponentialRampToValueAtTime(high, now + rise);
    padGain.gain.exponentialRampToValueAtTime(low, now + rise + hold + fall);

    breatheTimer = window.setTimeout(
      () => {
        breathePad();
      },
      (rise + hold + fall + jitter(0.4, 1.2)) * 1000,
    );
  }

  function pulseOnce() {
    if (!enabled || !context || context.state !== "running" || !bedBus) return;

    // Faint voices mostly live on the pad; rare soft notes only.
    if (profile.presence === "faint" && Math.random() > 0.4) return;

    const notePeak =
      profile.noteGain * presenceScale * motionScale *
      (profile.presence === "faint" ? 0.7 : 1);
    const intervals = profile.intervals;
    let semitone;

    if (profile.pattern === "clock") {
      // Steady motif: root → fifth → optional third.
      const cycle = [0, 7, 3, 12];
      semitone = cycle[scaleStep % cycle.length];
      playChordNote(semitone, notePeak, 0.08, 0.55);
      if (scaleStep % 4 === 0) {
        playChordNote(7, notePeak * 0.45, 0.12, 0.7);
      }
    } else if (profile.pattern === "lattice") {
      semitone = pick(intervals);
      playChordNote(semitone, notePeak * 0.85, 0.06, 0.45);
      if (Math.random() > 0.4) {
        playChordNote(pick(intervals), notePeak * 0.4, 0.1, 0.55);
      }
    } else if (profile.pattern === "beam") {
      playChordNote(pick([0, 5, 7]), notePeak, 0.25, 1.4);
    } else if (profile.pattern === "sonar") {
      // Descending soft figure.
      const down = [12, 7, 3, 0];
      semitone = down[scaleStep % down.length];
      playChordNote(semitone, notePeak, 0.12, 0.95);
    } else if (profile.pattern === "strut") {
      const strut = [0, 0, 7, 5];
      semitone = strut[scaleStep % strut.length];
      playChordNote(semitone, notePeak, 0.05, 0.4);
      if (scaleStep % 4 === 2) {
        playChordNote(12, notePeak * 0.35, 0.08, 0.5);
      }
    } else if (profile.pattern === "city-air") {
      playChordNote(pick([0, 7]), notePeak, 0.3, 1.6);
    }

    scaleStep += 1;
  }

  function schedulePulses() {
    stopPulseTimer();
    if (!enabled) return;
    const [min, max] = profile.intervalMs;
    const wait = jitter(min, max) * (reduced ? 1.35 : 1);
    pulseTimer = window.setTimeout(function tick() {
      pulseOnce();
      if (!enabled) return;
      pulseTimer = window.setTimeout(
        tick,
        jitter(min, max) * (reduced ? 1.35 : 1),
      );
    }, wait);
  }

  async function ensureGraph() {
    if (context) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      throw new Error("Web Audio is unavailable in this browser.");
    }

    context = new AudioCtx({ latencyHint: "interactive" });

    master = context.createGain();
    master.gain.value = 0.0001;
    master.connect(context.destination);

    bedBus = context.createGain();
    bedBus.gain.value = 0.0001;
    cueBus = context.createGain();
    cueBus.gain.value = 0.0001;

    bedFilter = context.createBiquadFilter();
    bedFilter.type = "lowpass";
    bedFilter.frequency.value = profile.lowpassHz || 1200;
    bedFilter.Q.value = 0.4;

    bedBus.connect(bedFilter);
    bedFilter.connect(master);
    cueBus.connect(master);

    // Warm triad pad (root / third / fifth), never a single bright tone.
    padGain = context.createGain();
    padGain.gain.value = 0.0001;
    padGain.connect(bedBus);

    const triad = [0, profile.intervals.includes(3) ? 3 : 5, 7];
    padOscs = triad.map((semi, index) => {
      const osc = context.createOscillator();
      const voiceGain = context.createGain();
      osc.type = index === 1 ? "triangle" : "sine";
      osc.frequency.value = midiOffsetHz(profile.rootHz, semi);
      // Tiny detune for chorus warmth without beating harshly.
      osc.detune.value = index === 0 ? -4 : index === 2 ? 5 : 0;
      voiceGain.gain.value = index === 0 ? 0.55 : 0.32;
      osc.connect(voiceGain);
      voiceGain.connect(padGain);
      osc.start();
      return osc;
    });
  }

  async function enable() {
    if (enabled || starting) return;
    starting = true;
    try {
      await ensureGraph();
      if (!context || !master || !bedBus || !cueBus || !padGain) {
        throw new Error("Audio graph failed to initialise.");
      }
      if (context.state === "suspended") {
        await context.resume();
      }

      const masterTarget = reduced ? 0.72 : 0.88;
      const bedTarget = presenceScale * motionScale;
      const cueTarget = profile.presence === "faint" ? 0.75 : 0.98;

      softRamp(context, master.gain, masterTarget, 0.9);
      softRamp(context, bedBus.gain, bedTarget, 1.1);
      softRamp(context, cueBus.gain, cueTarget, 0.65);

      enabled = true;
      scaleStep = 0;
      syncButton();
      breathePad();
      pulseOnce();
      schedulePulses();
      cue("mark");
    } catch (error) {
      console.error("[lab-explore-sound] enable failed", error);
      enabled = false;
      stopBedMotion();
      syncButton();
      if (button) {
        button.title = "Sound unavailable in this browser session";
      }
    } finally {
      starting = false;
    }
  }

  function disable() {
    stopBedMotion();
    if (!context || !master || !bedBus || !cueBus) {
      enabled = false;
      syncButton();
      return;
    }
    if (padGain) softRamp(context, padGain.gain, 0.0001, 1.0);
    softRamp(context, bedBus.gain, 0.0001, 1.0);
    softRamp(context, cueBus.gain, 0.0001, 0.7);
    softRamp(context, master.gain, 0.0001, 1.15);
    enabled = false;
    syncButton();
  }

  async function toggle() {
    if (enabled) disable();
    else await enable();
  }

  /**
   * Soft one-shot layered over the bed. No-ops when muted.
   * @param {"tick"|"mark"|"warn"|"lock"|"orbit"|"edge"|"clear"} name
   */
  function cue(name = "tick") {
    if (!enabled || !context || context.state !== "running" || !cueBus) return;

    const now = context.currentTime;
    if (name === "edge" || name === "tick") {
      if (now - lastCueAt < 0.14) return;
    }
    lastCueAt = now;

    const chip = profile.kind === "chip" || profile.pattern === "city-air";
    let freq = profile.cueHz || 320;
    let peak =
      (profile.presence === "faint" ? 0.05 : 0.075) * motionScale;
    let attack = 0.04;
    let release = 0.32;
    let type = "sine";
    let filterHz = 2200;
    let glide = 1;

    if (name === "warn") {
      freq *= 0.85;
      peak *= 0.9;
      release = 0.48;
      type = "triangle";
      filterHz = 1400;
    } else if (name === "mark") {
      freq *= 1.05;
      peak *= profile.presence === "faint" ? 0.85 : 1;
      type = "sine";
    } else if (name === "lock") {
      freq = chip ? 240 : freq * 0.95;
      peak *= 1.05;
      attack = 0.06;
      release = 0.42;
      type = chip ? "square" : "triangle";
      filterHz = chip ? 1200 : 1800;
    } else if (name === "orbit") {
      freq = 160;
      peak *= 0.7;
      attack = 0.12;
      release = 0.55;
      type = "triangle";
      filterHz = 900;
      glide = 1.18;
    } else if (name === "edge") {
      freq = chip ? 420 : freq * 1.15;
      peak *= 0.8;
      attack = 0.03;
      release = 0.2;
      type = chip ? "square" : "sine";
      filterHz = chip ? 1500 : 2400;
    } else if (name === "clear") {
      freq *= 0.75;
      peak *= 0.65;
      release = 0.5;
      type = "sine";
      glide = 0.85;
    }

    playGrain({
      freqs: freq,
      peak,
      attack,
      release,
      type,
      filterHz,
      destination: cueBus,
      glide,
    });
  }

  if (button) {
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      void toggle();
    });
    syncButton();
  }

  return {
    enable,
    disable,
    toggle,
    cue,
    isEnabled: () => enabled,
    dispose() {
      disable();
      try {
        for (const osc of padOscs) osc.stop();
        context?.close();
      } catch {
        /* already closed */
      }
      context = null;
      padOscs = [];
    },
  };
}

export { VOICES };
