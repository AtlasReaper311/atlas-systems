/**
 * atlas-sound.js: procedurally synthesised UI cues for atlas-systems.uk
 *
 * Everything is generated with the Web Audio API at play time: oscillators
 * and short filtered noise bursts. No audio files, zero asset weight, zero
 * licensing question, and a truer flex for an audio-systems specialisation
 * than shipping stock UI sounds would be.
 *
 * DEFAULT: MUTED. Unsolicited sound on a portfolio site reads as a mistake,
 * not a feature. Sound is a detail a visitor opts into via the nav toggle;
 * the choice persists in localStorage. Conveniently, the toggle click is
 * also the user gesture browsers require before audio may start, so
 * enabling sound and permitting it are the same act. Design with the
 * autoplay policy, not against it.
 *
 * Integration (any page):
 *
 *   <script src="/js/atlas-sound.js" defer></script>
 *   <script>
 *     window.addEventListener("DOMContentLoaded", function () {
 *       AtlasSound.mountToggle();   // adds [ sound: off ] to the nav
 *       AtlasSound.autowire();      // optional: hover/click cues on .nav-links
 *     });
 *   </script>
 *
 * Status dot wiring (in whatever polls the nav status): replace nothing,
 * add one line where the state is set:
 *
 *   AtlasSound.status(deploy.status);   // "success" | "failure" | ...
 *
 * The module itself enforces the estate's only-signal-genuine-change rule:
 * status() remembers the last seen state in sessionStorage and stays silent
 * unless the state actually flipped. Polling every 30 seconds costs nothing;
 * navigating between pages does not re-chime.
 *
 * API:
 *   AtlasSound.play(name)       "navHover" | "navClick" | "statusGood" |
 *                               "statusBad" | "easterEgg"
 *   AtlasSound.status(state)    plays statusGood/statusBad only on change
 *   AtlasSound.setEnabled(bool) / .toggle() / .isEnabled()
 *   AtlasSound.setVolume(0..1)  persisted; default 0.6
 *   AtlasSound.mountToggle(target?)  target: element or selector, default "nav"
 *   AtlasSound.autowire(root?)  bind nav hover/click cues, idempotent
 *
 * Degradation: if AudioContext is unavailable (older Safari, exotic
 * embedded browsers) every method becomes a silent no-op. A visitor never
 * sees a console error from this file.
 */

(function () {
  "use strict";

  var ENABLED_KEY = "atlas:sound:enabled";
  var VOLUME_KEY = "atlas:sound:volume";
  var LAST_STATUS_KEY = "atlas:sound:last-status"; // sessionStorage

  var Ctx = window.AudioContext || window.webkitAudioContext;
  var supported = typeof Ctx === "function";

  /* ---- storage that never throws (private mode, disabled storage) ---- */

  function storageGet(store, key) {
    try { return store.getItem(key); } catch (err) { return null; }
  }
  function storageSet(store, key, value) {
    try { store.setItem(key, value); } catch (err) { /* in-memory only */ }
  }

  var enabled = storageGet(window.localStorage, ENABLED_KEY) === "1";
  var volume = (function () {
    var raw = parseFloat(storageGet(window.localStorage, VOLUME_KEY));
    return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.6;
  })();

  var ctx = null;
  var master = null;
  var noiseBuffer = null;

  function ensureContext() {
    if (!supported) return null;
    if (!ctx) {
      try {
        ctx = new Ctx();
        master = ctx.createGain();
        master.gain.value = volume;
        master.connect(ctx.destination);
      } catch (err) {
        supported = false;
        return null;
      }
    }
    if (ctx.state === "suspended") {
      // Only resolves inside a trusted gesture; rejection is fine, the
      // next gesture will try again.
      ctx.resume().catch(function () {});
    }
    return ctx;
  }

  // If a page enables sound before any click this session (persisted
  // preference), the first gesture anywhere unlocks the context.
  ["pointerdown", "keydown", "touchstart"].forEach(function (type) {
    window.addEventListener(type, function unlock() {
      if (enabled) ensureContext();
      window.removeEventListener(type, unlock);
    }, { once: true, passive: true });
  });

  /* ------------------------------ synthesis --------------------------- */

  /** Click-free envelope: never start or end a gain at hard zero. */
  function envelope(now, attack, duration, peak) {
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    gain.connect(master);
    return gain;
  }

  function tone(opts) {
    var now = ctx.currentTime + (opts.delay || 0);
    var osc = ctx.createOscillator();
    osc.type = opts.type || "sine";
    osc.frequency.setValueAtTime(opts.freq, now);
    if (opts.glideTo) {
      osc.frequency.exponentialRampToValueAtTime(opts.glideTo, now + opts.duration);
    }
    var out = envelope(now, opts.attack || 0.008, opts.duration, opts.peak);
    if (opts.lowpass) {
      var filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = opts.lowpass;
      osc.connect(filter);
      filter.connect(out);
    } else {
      osc.connect(out);
    }
    osc.start(now);
    osc.stop(now + opts.duration + 0.05);
  }

  function getNoiseBuffer() {
    if (!noiseBuffer) {
      var length = Math.floor(ctx.sampleRate * 0.25);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  }

  function noiseBurst(opts) {
    var now = ctx.currentTime + (opts.delay || 0);
    var source = ctx.createBufferSource();
    source.buffer = getNoiseBuffer();
    var filter = ctx.createBiquadFilter();
    filter.type = opts.filterType || "bandpass";
    filter.frequency.value = opts.center;
    if (opts.q) filter.Q.value = opts.q;
    var out = envelope(now, opts.attack || 0.002, opts.duration, opts.peak);
    source.connect(filter);
    filter.connect(out);
    source.start(now);
    source.stop(now + opts.duration + 0.05);
  }

  /* Cue design notes:
   *
   * navHover   12ms bandpassed noise at 3.8kHz. Under ~20ms the ear reads
   *            texture, not tone: a mechanical key-tick at a distance.
   *            High centre keeps it out of the speech band; tiny gain
   *            keeps it out of the way.
   *
   * navClick   Sine gliding 740Hz down to 520Hz over 70ms. A downward
   *            glide reads as "settled, confirmed"; pure sine because a
   *            confirmation should be soft, not buzzy.
   *
   * statusGood C5 rising to G5, sequential sines. A rising perfect fifth
   *            is the most resolved interval available: "all clear"
   *            without becoming a jingle.
   *
   * statusBad  A#4 + E5 sounded together: a tritone, the culturally
   *            "wrong" interval, on soft sawtooths through a 1.2kHz
   *            lowpass with a slight downward bend. Unease, deliberately
   *            muted; a portfolio site never needs a klaxon.
   *
   * easterEgg  C5-E5-G5 sine arpeggio with a short highpassed noise
   *            shimmer on the tail. A major triad is the smallest
   *            possible fanfare; the noise tail is the sparkle.
   */
  var CUES = {
    navHover: function () {
      noiseBurst({ center: 3800, q: 8, duration: 0.012, peak: 0.05 });
    },
    navClick: function () {
      tone({ freq: 740, glideTo: 520, duration: 0.07, peak: 0.10 });
    },
    statusGood: function () {
      tone({ freq: 523.25, duration: 0.11, peak: 0.09 });
      tone({ freq: 783.99, duration: 0.13, peak: 0.09, delay: 0.09 });
    },
    statusBad: function () {
      tone({ type: "sawtooth", freq: 466.16, glideTo: 452, duration: 0.26, peak: 0.055, lowpass: 1200 });
      tone({ type: "sawtooth", freq: 659.25, glideTo: 640, duration: 0.26, peak: 0.055, lowpass: 1200 });
    },
    easterEgg: function () {
      tone({ freq: 523.25, duration: 0.09, peak: 0.08 });
      tone({ freq: 659.25, duration: 0.09, peak: 0.08, delay: 0.07 });
      tone({ freq: 783.99, duration: 0.12, peak: 0.08, delay: 0.14 });
      noiseBurst({ filterType: "highpass", center: 6000, duration: 0.08, peak: 0.03, delay: 0.18 });
    },
  };

  function play(name) {
    if (!enabled || !supported || !CUES[name]) return;
    try {
      if (!ensureContext()) return;
      CUES[name]();
    } catch (err) {
      /* A failed cue is a non-event; a visitor-visible error would be
         worse than the sound it replaced. */
    }
  }

  /* ------------------- status: only on genuine change ------------------ */

  var GOOD_STATES = /^(success|operational|online|ok|green|awake|up|live)$/;

  function status(rawState) {
    var state = String(rawState || "").toLowerCase().trim();
    if (!state) return;
    var previous = storageGet(window.sessionStorage, LAST_STATUS_KEY);
    storageSet(window.sessionStorage, LAST_STATUS_KEY, state);
    // First observation this session sets the baseline silently; the same
    // rule deploy-watch follows, applied to a speaker instead of Discord.
    if (previous === null || previous === state) return;
    play(GOOD_STATES.test(state) ? "statusGood" : "statusBad");
  }

  /* ------------------------------- toggle ------------------------------ */

  var toggleButton = null;

  function reflectToggle() {
    if (!toggleButton) return;
    toggleButton.textContent = enabled ? "[ sound: on ]" : "[ sound: off ]";
    toggleButton.setAttribute("aria-pressed", enabled ? "true" : "false");
    toggleButton.classList.toggle("atlas-sound-on", enabled);
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    storageSet(window.localStorage, ENABLED_KEY, enabled ? "1" : "0");
    reflectToggle();
    if (enabled) {
      // This runs inside the toggle click: gesture available, context
      // unlocks, and the confirmation blip proves the speaker path works.
      ensureContext();
      play("navClick");
    }
  }

  function injectToggleStyles() {
    if (document.getElementById("atlas-sound-style")) return;
    var style = document.createElement("style");
    style.id = "atlas-sound-style";
    style.textContent =
      ".atlas-sound-toggle{font-family:var(--mono,'IBM Plex Mono',monospace);" +
      "font-size:11px;letter-spacing:0.06em;color:var(--text-faint,#888894);" +
      "background:none;border:none;padding:0.35rem 0.6rem;cursor:pointer;" +
      "transition:color 0.15s;}" +
      ".atlas-sound-toggle:hover{color:var(--text-dim,#aaa9a0);}" +
      ".atlas-sound-toggle.atlas-sound-on{color:var(--accent,#f5a623);}" +
      ".atlas-sound-toggle:focus-visible{outline:2px solid var(--accent,#f5a623);outline-offset:2px;}";
    document.head.appendChild(style);
  }

  function mountToggle(target) {
    if (!supported || toggleButton) return toggleButton;
    var host =
      typeof target === "string" ? document.querySelector(target)
      : target instanceof Element ? target
      : document.querySelector("nav");
    if (!host) return null;

    injectToggleStyles();
    toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "atlas-sound-toggle";
    toggleButton.setAttribute("aria-label", "Toggle interface sound");
    toggleButton.addEventListener("click", function () { setEnabled(!enabled); });

    // Sit just before the status link when the shell has one, otherwise
    // at the end of the host.
    var statusLink = host.querySelector(".nav-status");
    if (statusLink) host.insertBefore(toggleButton, statusLink);
    else host.appendChild(toggleButton);

    reflectToggle();
    return toggleButton;
  }

  /* ------------------------------ autowire ----------------------------- */

  var wired = false;

  function autowire(root) {
    if (wired) return;
    wired = true;
    var scope = root instanceof Element ? root : document;
    scope.querySelectorAll(".nav-links a, .nav-wordmark").forEach(function (link) {
      link.addEventListener("pointerenter", function () { play("navHover"); });
      link.addEventListener("click", function () { play("navClick"); });
    });
  }

  /* -------------------------------- API -------------------------------- */

  window.AtlasSound = {
    play: play,
    status: status,
    setEnabled: setEnabled,
    toggle: function () { setEnabled(!enabled); },
    isEnabled: function () { return enabled; },
    setVolume: function (value) {
      var clamped = Math.min(1, Math.max(0, Number(value)));
      if (!Number.isFinite(clamped)) return;
      volume = clamped;
      storageSet(window.localStorage, VOLUME_KEY, String(volume));
      if (master) master.gain.value = volume;
    },
    getVolume: function () { return volume; },
    mountToggle: mountToggle,
    autowire: autowire,
  };

  if (!supported && window.console && console.debug) {
    console.debug("atlas-sound: Web Audio unavailable; running silent.");
  }
})();
