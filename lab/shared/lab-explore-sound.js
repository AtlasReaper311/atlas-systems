/**
 * Sparse terminal Explore sound beds + soft Map air/cues.
 * Mute-default, gesture-gated, organic ramps only.
 *
 * Never use AudioParam.context — undefined in some browsers.
 * Beds are pulsed/intermittent instruments, not continuous drones.
 */

const VOICES = Object.freeze({
  almost: {
    presence: "score",
    pattern: "clock",
    airHz: 880,
    tickHz: [392, 494, 587],
    intervalMs: [720, 1180],
    airGain: 0.018,
    tickGain: 0.085,
    cueHz: 523,
    highpassHz: 220,
  },
  drift: {
    presence: "score",
    pattern: "lattice",
    airHz: 740,
    tickHz: [329.63, 415.3, 493.88],
    intervalMs: [420, 780],
    airGain: 0.014,
    tickGain: 0.07,
    cueHz: 349,
    highpassHz: 240,
  },
  speculum: {
    presence: "faint",
    pattern: "beam",
    airHz: 1046,
    tickHz: [698.46, 880, 1046.5],
    intervalMs: [1600, 2600],
    airGain: 0.008,
    tickGain: 0.035,
    cueHz: 784,
    highpassHz: 320,
  },
  shape: {
    presence: "score",
    pattern: "sonar",
    airHz: 620,
    tickHz: [440, 554.37, 659.25],
    intervalMs: [1100, 1900],
    airGain: 0.012,
    tickGain: 0.08,
    cueHz: 587,
    highpassHz: 200,
  },
  bearing: {
    presence: "score",
    pattern: "strut",
    airHz: 196,
    tickHz: [147, 196, 247],
    intervalMs: [860, 1500],
    airGain: 0.01,
    tickGain: 0.075,
    cueHz: 233,
    highpassHz: 90,
  },
  map: {
    presence: "faint",
    pattern: "city-air",
    kind: "chip",
    airHz: 520,
    tickHz: [210, 280, 360],
    intervalMs: [2200, 3600],
    airGain: 0.006,
    tickGain: 0.028,
    cueHz: 270,
    highpassHz: 280,
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
  let highpass = null;
  let lowpass = null;
  let airOsc = null;
  let airGain = null;
  let enabled = false;
  let starting = false;
  let lastCueAt = 0;
  let pulseTimer = 0;
  const reduced = prefersReducedMotion();
  const presenceScale = profile.presence === "faint" ? 0.55 : 1;
  const motionScale = reduced ? 0.7 : 1;

  function syncButton() {
    if (!button) return;
    button.setAttribute("aria-pressed", String(enabled));
    button.textContent = enabled ? "Sound on" : "Sound";
    button.title = enabled
      ? "Mute the soft Lab sound bed"
      : "Enable a soft Lab sound bed (starts quiet)";
  }

  function stopPulses() {
    if (pulseTimer) {
      window.clearTimeout(pulseTimer);
      pulseTimer = 0;
    }
  }

  function playGrain({
    freqs,
    peak,
    attack,
    release,
    type = "sine",
    filterHz = 2400,
    destination,
    glide = 1,
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

    filter.type = "bandpass";
    filter.frequency.value = filterHz;
    filter.Q.value = profile.pattern === "strut" ? 1.8 : 0.9;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    osc.start(now);
    osc.stop(now + attack + release + 0.04);
  }

  function pulseOnce() {
    if (!enabled || !context || context.state !== "running" || !bedBus) return;

    const tickPeak =
      profile.tickGain * presenceScale * motionScale *
      (profile.presence === "faint" ? 0.85 : 1.15);

    if (profile.pattern === "clock") {
      playGrain({
        freqs: profile.tickHz,
        peak: tickPeak,
        attack: 0.012,
        release: 0.16,
        type: "sine",
        filterHz: 3200,
        destination: bedBus,
      });
      // Soft off-beat ghost tick.
      window.setTimeout(() => {
        if (!enabled) return;
        playGrain({
          freqs: profile.tickHz,
          peak: tickPeak * 0.45,
          attack: 0.01,
          release: 0.12,
          type: "triangle",
          filterHz: 2600,
          destination: bedBus,
        });
      }, 140);
    } else if (profile.pattern === "lattice") {
      playGrain({
        freqs: profile.tickHz,
        peak: tickPeak * 0.8,
        attack: 0.008,
        release: 0.09,
        type: "triangle",
        filterHz: 2800,
        destination: bedBus,
      });
      if (Math.random() > 0.45) {
        playGrain({
          freqs: profile.tickHz,
          peak: tickPeak * 0.5,
          attack: 0.01,
          release: 0.11,
          type: "sine",
          filterHz: 2100,
          destination: bedBus,
          glide: 1.06,
        });
      }
    } else if (profile.pattern === "beam") {
      playGrain({
        freqs: profile.tickHz,
        peak: tickPeak,
        attack: 0.08,
        release: 0.55,
        type: "sine",
        filterHz: 3600,
        destination: bedBus,
        glide: 1.12,
      });
    } else if (profile.pattern === "sonar") {
      playGrain({
        freqs: profile.tickHz[0],
        peak: tickPeak,
        attack: 0.04,
        release: 0.7,
        type: "sine",
        filterHz: 1800,
        destination: bedBus,
        glide: 0.72,
      });
    } else if (profile.pattern === "strut") {
      playGrain({
        freqs: profile.tickHz,
        peak: tickPeak,
        attack: 0.004,
        release: 0.22,
        type: "triangle",
        filterHz: 900,
        destination: bedBus,
      });
      if (Math.random() > 0.55) {
        playGrain({
          freqs: profile.tickHz,
          peak: tickPeak * 0.35,
          attack: 0.02,
          release: 0.35,
          type: "sine",
          filterHz: 700,
          destination: bedBus,
          glide: 0.9,
        });
      }
    } else if (profile.pattern === "city-air") {
      // Rare soft chip dust — faint additive city texture, not a drone hit.
      playGrain({
        freqs: profile.tickHz,
        peak: tickPeak,
        attack: 0.03,
        release: 0.28,
        type: "square",
        filterHz: 1400,
        destination: bedBus,
      });
    }
  }

  function schedulePulses() {
    stopPulses();
    if (!enabled) return;
    const [min, max] = profile.intervalMs;
    const wait = jitter(min, max) * (reduced ? 1.35 : 1);
    pulseTimer = window.setTimeout(() => {
      pulseOnce();
      schedulePulses();
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

    // Split beds and cues so interaction hits stay clear of the texture.
    bedBus = context.createGain();
    bedBus.gain.value = 0.0001;
    cueBus = context.createGain();
    cueBus.gain.value = 0.0001;

    highpass = context.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = profile.highpassHz || 180;
    highpass.Q.value = 0.7;

    lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = profile.presence === "faint" ? 2200 : 3400;
    lowpass.Q.value = 0.35;

    bedBus.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(master);
    cueBus.connect(master);

    // Very quiet air tone — high enough and quiet enough to avoid drone mud.
    airOsc = context.createOscillator();
    airGain = context.createGain();
    airOsc.type = "sine";
    airOsc.frequency.value = profile.airHz;
    airGain.gain.value = 0.0001;
    airOsc.connect(airGain);
    airGain.connect(bedBus);
    airOsc.start();
  }

  async function enable() {
    if (enabled || starting) return;
    starting = true;
    try {
      await ensureGraph();
      if (!context || !master || !bedBus || !cueBus || !airGain) {
        throw new Error("Audio graph failed to initialise.");
      }
      if (context.state === "suspended") {
        await context.resume();
      }

      const masterTarget = reduced ? 0.75 : 0.92;
      const bedTarget = presenceScale * motionScale;
      const cueTarget = profile.presence === "faint" ? 0.7 : 0.95;
      const airTarget =
        profile.airGain * presenceScale * motionScale *
        (profile.presence === "score" ? 1.15 : 1);

      softRamp(context, master.gain, masterTarget, 0.85);
      softRamp(context, bedBus.gain, bedTarget, 1.05);
      softRamp(context, cueBus.gain, cueTarget, 0.7);
      softRamp(context, airGain.gain, airTarget, 1.2);

      enabled = true;
      syncButton();
      pulseOnce();
      schedulePulses();
      cue("mark");
    } catch (error) {
      console.error("[lab-explore-sound] enable failed", error);
      enabled = false;
      stopPulses();
      syncButton();
      if (button) {
        button.title = "Sound unavailable in this browser session";
      }
    } finally {
      starting = false;
    }
  }

  function disable() {
    stopPulses();
    if (!context || !master || !bedBus || !cueBus) {
      enabled = false;
      syncButton();
      return;
    }
    if (airGain) softRamp(context, airGain.gain, 0.0001, 0.9);
    softRamp(context, bedBus.gain, 0.0001, 0.95);
    softRamp(context, cueBus.gain, 0.0001, 0.7);
    softRamp(context, master.gain, 0.0001, 1.1);
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
      (profile.presence === "faint" ? 0.045 : 0.07) * motionScale;
    let attack = 0.05;
    let release = 0.35;
    let type = "sine";
    let filterHz = 2600;
    let glide = 1;

    if (name === "warn") {
      freq *= 0.8;
      peak *= 0.9;
      release = 0.5;
      type = "triangle";
      filterHz = 1600;
    } else if (name === "mark") {
      freq *= 1.08;
      peak *= profile.presence === "faint" ? 0.85 : 1;
      type = "sine";
    } else if (name === "lock") {
      freq = chip ? 240 : freq * 0.95;
      peak *= 1.05;
      attack = 0.07;
      release = 0.45;
      type = chip ? "square" : "triangle";
      filterHz = chip ? 1200 : 2200;
    } else if (name === "orbit") {
      freq = 160;
      peak *= 0.7;
      attack = 0.12;
      release = 0.55;
      type = "triangle";
      filterHz = 900;
      glide = 1.18;
    } else if (name === "edge") {
      freq = chip ? 420 : freq * 1.2;
      peak *= 0.8;
      attack = 0.03;
      release = 0.22;
      type = chip ? "square" : "sine";
      filterHz = chip ? 1500 : 2800;
    } else if (name === "clear") {
      freq *= 0.7;
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
        airOsc?.stop();
        context?.close();
      } catch {
        /* already closed */
      }
      context = null;
      airOsc = null;
    },
  };
}

export { VOICES };
