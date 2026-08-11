/**
 * Soft Explore sound beds + soft-chip System Map cues.
 * Mute-default, gesture-gated, organic ramps only (no hard gain jumps).
 */

const VOICES = Object.freeze({
  almost: {
    kind: "bed",
    freqs: [174.61, 220.0],
    types: ["sine", "triangle"],
    bedGain: 0.045,
    lfoHz: 0.07,
    filterHz: 1280,
    cueHz: 392.0,
  },
  drift: {
    kind: "bed",
    freqs: [146.83, 196.0],
    types: ["sine", "sine"],
    bedGain: 0.038,
    lfoHz: 0.055,
    filterHz: 1100,
    cueHz: 329.63,
  },
  speculum: {
    kind: "bed",
    freqs: [261.63, 311.13],
    types: ["sine", "triangle"],
    bedGain: 0.034,
    lfoHz: 0.09,
    filterHz: 1500,
    cueHz: 523.25,
  },
  shape: {
    kind: "bed",
    freqs: [196.0, 293.66],
    types: ["sine", "triangle"],
    bedGain: 0.036,
    lfoHz: 0.08,
    filterHz: 1350,
    cueHz: 440.0,
  },
  bearing: {
    kind: "bed",
    freqs: [110.0, 164.81],
    types: ["triangle", "sine"],
    bedGain: 0.04,
    lfoHz: 0.045,
    filterHz: 980,
    cueHz: 246.94,
  },
  map: {
    kind: "chip",
    bedGain: 0.022,
    lfoHz: 0.04,
    filterHz: 720,
    freqs: [98.0, 130.81],
    types: ["sine", "triangle"],
    cueHz: 280,
  },
});

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function softRamp(param, value, seconds) {
  const now = param.context.currentTime;
  const current = Math.max(0.0001, param.value || 0.0001);
  param.cancelScheduledValues(now);
  param.setValueAtTime(current, now);
  param.exponentialRampToValueAtTime(
    Math.max(0.0001, value),
    now + Math.max(0.08, seconds),
  );
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
  let bedGain = null;
  let filter = null;
  let oscillators = [];
  let lfo = null;
  let lfoGain = null;
  let enabled = false;
  let starting = false;
  let lastCueAt = 0;
  const reduced = prefersReducedMotion();
  const bedCeiling = reduced ? profile.bedGain * 0.55 : profile.bedGain;

  function syncButton() {
    if (!button) return;
    button.setAttribute("aria-pressed", String(enabled));
    button.textContent = enabled ? "Sound on" : "Sound";
    button.title = enabled
      ? "Mute the soft Lab sound bed"
      : "Enable a soft Lab sound bed (starts quiet)";
  }

  async function ensureGraph() {
    if (context) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    context = new AudioCtx({ latencyHint: "interactive" });
    master = context.createGain();
    master.gain.value = 0.0001;
    master.connect(context.destination);

    bedGain = context.createGain();
    bedGain.gain.value = 0.0001;

    filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = profile.filterHz || 1200;
    filter.Q.value = 0.55;
    bedGain.connect(filter);
    filter.connect(master);

    oscillators = profile.freqs.map((freq, index) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = profile.types[index] || "sine";
      osc.frequency.value = freq;
      gain.gain.value = index === 0 ? 0.72 : 0.36;
      osc.connect(gain);
      gain.connect(bedGain);
      osc.start();
      return { osc, gain };
    });

    lfo = context.createOscillator();
    lfoGain = context.createGain();
    lfo.type = "sine";
    lfo.frequency.value = profile.lfoHz;
    lfoGain.gain.value = Math.max(40, (profile.filterHz || 1200) * 0.12);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
  }

  async function enable() {
    if (enabled || starting) return;
    starting = true;
    try {
      await ensureGraph();
      if (!context) return;
      if (context.state === "suspended") await context.resume();
      softRamp(master.gain, reduced ? 0.55 : 0.82, 1.15);
      softRamp(bedGain.gain, bedCeiling, 1.45);
      enabled = true;
      syncButton();
    } finally {
      starting = false;
    }
  }

  function disable() {
    if (!context || !master || !bedGain) {
      enabled = false;
      syncButton();
      return;
    }
    softRamp(bedGain.gain, 0.0001, 1.25);
    softRamp(master.gain, 0.0001, 1.45);
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
    if (!enabled || !context || context.state !== "running") return;

    const now = context.currentTime;
    if (name === "edge" || name === "tick") {
      if (now - lastCueAt < 0.12) return;
    }
    lastCueAt = now;

    const osc = context.createOscillator();
    const gain = context.createGain();
    const cueFilter = context.createBiquadFilter();
    cueFilter.type = "lowpass";
    cueFilter.Q.value = 0.7;

    const chip = profile.kind === "chip";
    let freq = profile.cueHz || 320;
    let peak = reduced ? 0.016 : 0.026;
    let attack = 0.09;
    let release = 0.58;

    if (name === "warn") {
      freq *= 0.78;
      peak *= 0.8;
      release = 0.72;
      osc.type = "triangle";
    } else if (name === "mark") {
      freq *= 1.1;
      peak *= 0.85;
      osc.type = "sine";
    } else if (name === "lock") {
      freq = chip ? 210 : freq * 0.92;
      peak = reduced ? 0.018 : 0.03;
      attack = 0.12;
      release = 0.8;
      osc.type = chip ? "square" : "triangle";
    } else if (name === "orbit") {
      freq = 88;
      peak = reduced ? 0.01 : 0.016;
      attack = 0.28;
      release = 1.15;
      osc.type = "triangle";
    } else if (name === "edge") {
      freq = chip ? 460 : (profile.cueHz || 320) * 1.28;
      peak = reduced ? 0.01 : 0.018;
      attack = 0.07;
      release = 0.42;
      osc.type = chip ? "square" : "sine";
    } else if (name === "clear") {
      freq *= 0.66;
      peak *= 0.65;
      release = 0.9;
      osc.type = "sine";
    } else {
      osc.type = chip ? "square" : "sine";
    }

    osc.frequency.setValueAtTime(freq, now);
    if (name === "orbit") {
      osc.frequency.exponentialRampToValueAtTime(freq * 1.16, now + release);
    }

    cueFilter.frequency.setValueAtTime(chip ? 620 : 1700, now);
    cueFilter.frequency.exponentialRampToValueAtTime(
      chip ? 400 : 860,
      now + release,
    );

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);

    osc.connect(cueFilter);
    cueFilter.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + attack + release + 0.06);
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
        oscillators.forEach(({ osc }) => osc.stop());
        lfo?.stop();
        context?.close();
      } catch {
        /* already closed */
      }
      context = null;
      oscillators = [];
    },
  };
}

export { VOICES };
