/**
 * Soft Explore sound beds + soft-chip System Map cues.
 * Mute-default, gesture-gated, organic ramps only (no hard gain jumps).
 *
 * Note: never use AudioParam.context — it is undefined in some browsers.
 * Always schedule against the owning AudioContext.
 */

const VOICES = Object.freeze({
  almost: {
    kind: "bed",
    freqs: [220.0, 329.63],
    types: ["sine", "triangle"],
    bedGain: 0.14,
    lfoHz: 0.07,
    filterHz: 2200,
    cueHz: 392.0,
  },
  drift: {
    kind: "bed",
    freqs: [196.0, 293.66],
    types: ["sine", "sine"],
    bedGain: 0.13,
    lfoHz: 0.055,
    filterHz: 2000,
    cueHz: 329.63,
  },
  speculum: {
    kind: "bed",
    freqs: [261.63, 392.0],
    types: ["sine", "triangle"],
    bedGain: 0.125,
    lfoHz: 0.09,
    filterHz: 2400,
    cueHz: 523.25,
  },
  shape: {
    kind: "bed",
    freqs: [246.94, 369.99],
    types: ["sine", "triangle"],
    bedGain: 0.13,
    lfoHz: 0.08,
    filterHz: 2200,
    cueHz: 440.0,
  },
  bearing: {
    kind: "bed",
    freqs: [164.81, 246.94],
    types: ["triangle", "sine"],
    bedGain: 0.135,
    lfoHz: 0.045,
    filterHz: 1800,
    cueHz: 246.94,
  },
  map: {
    kind: "chip",
    bedGain: 0.09,
    lfoHz: 0.04,
    filterHz: 1400,
    freqs: [130.81, 196.0],
    types: ["sine", "triangle"],
    cueHz: 280,
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
  const bedCeiling = reduced ? profile.bedGain * 0.7 : profile.bedGain;

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
    if (!AudioCtx) {
      throw new Error("Web Audio is unavailable in this browser.");
    }

    context = new AudioCtx({ latencyHint: "interactive" });
    master = context.createGain();
    master.gain.value = 0.0001;
    master.connect(context.destination);

    bedGain = context.createGain();
    bedGain.gain.value = 0.0001;

    filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = profile.filterHz || 2000;
    filter.Q.value = 0.4;
    bedGain.connect(filter);
    filter.connect(master);

    oscillators = profile.freqs.map((freq, index) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = profile.types[index] || "sine";
      osc.frequency.value = freq;
      if (index > 0) osc.detune.value = -7;
      gain.gain.value = index === 0 ? 0.82 : 0.48;
      osc.connect(gain);
      gain.connect(bedGain);
      osc.start();
      return { osc, gain };
    });

    lfo = context.createOscillator();
    lfoGain = context.createGain();
    lfo.type = "sine";
    lfo.frequency.value = profile.lfoHz;
    lfoGain.gain.value = Math.max(40, (profile.filterHz || 2000) * 0.07);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
  }

  async function enable() {
    if (enabled || starting) return;
    starting = true;
    try {
      await ensureGraph();
      if (!context || !master || !bedGain) {
        throw new Error("Audio graph failed to initialise.");
      }
      if (context.state === "suspended") {
        await context.resume();
      }
      softRamp(context, master.gain, reduced ? 0.85 : 1, 0.7);
      softRamp(context, bedGain.gain, bedCeiling, 0.95);
      enabled = true;
      syncButton();
      // Confirm enable so the toggle is never a silent no-op.
      cue("mark");
    } catch (error) {
      console.error("[lab-explore-sound] enable failed", error);
      enabled = false;
      syncButton();
      if (button) {
        button.title = "Sound unavailable in this browser session";
      }
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
    softRamp(context, bedGain.gain, 0.0001, 0.95);
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
    if (!enabled || !context || context.state !== "running" || !master) return;

    const now = context.currentTime;
    if (name === "edge" || name === "tick") {
      if (now - lastCueAt < 0.12) return;
    }
    lastCueAt = now;

    const osc = context.createOscillator();
    const gain = context.createGain();
    const cueFilter = context.createBiquadFilter();
    cueFilter.type = "lowpass";
    cueFilter.Q.value = 0.65;

    const chip = profile.kind === "chip";
    let freq = profile.cueHz || 320;
    let peak = reduced ? 0.045 : 0.07;
    let attack = 0.07;
    let release = 0.5;

    if (name === "warn") {
      freq *= 0.78;
      peak *= 0.9;
      release = 0.7;
      osc.type = "triangle";
    } else if (name === "mark") {
      freq *= 1.1;
      peak = reduced ? 0.06 : 0.09;
      osc.type = "sine";
    } else if (name === "lock") {
      freq = chip ? 220 : freq * 0.92;
      peak = reduced ? 0.05 : 0.08;
      attack = 0.09;
      release = 0.7;
      osc.type = chip ? "square" : "triangle";
    } else if (name === "orbit") {
      freq = 120;
      peak = reduced ? 0.03 : 0.05;
      attack = 0.2;
      release = 1;
      osc.type = "triangle";
    } else if (name === "edge") {
      freq = chip ? 500 : (profile.cueHz || 320) * 1.28;
      peak = reduced ? 0.035 : 0.055;
      attack = 0.05;
      release = 0.4;
      osc.type = chip ? "square" : "sine";
    } else if (name === "clear") {
      freq *= 0.66;
      peak *= 0.75;
      release = 0.8;
      osc.type = "sine";
    } else {
      osc.type = chip ? "square" : "sine";
    }

    osc.frequency.setValueAtTime(freq, now);
    if (name === "orbit") {
      osc.frequency.exponentialRampToValueAtTime(freq * 1.16, now + release);
    }

    cueFilter.frequency.setValueAtTime(chip ? 900 : 2600, now);
    cueFilter.frequency.exponentialRampToValueAtTime(
      chip ? 520 : 1200,
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
