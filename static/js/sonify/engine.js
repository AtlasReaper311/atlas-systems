/**
 * engine.js :: everything that touches Tone.js lives here.
 *
 * The one architectural rule this file exists to enforce: notes
 * trigger on the Transport's 8th-note grid, and ONLY there; every
 * other quantity (filter cutoff, voice gain, vibrato depth, master
 * level, the pitch under an already-sounding note) glides continuously
 * via 300ms rampTo calls on each poll tick. Triggering happens inside
 * Transport callbacks using the callback's own `time` argument, never
 * Tone.now(), so a hit can never land off-grid.
 *
 * Tone.js arrives as a vendored classic script (window.Tone), not an
 * import: the site's CSP is script-src 'self' with no CDN loads, and
 * this module reads the global at call time so load order stays
 * forgiving. Pinned version and vendoring command are in the README.
 */

import {
  CURATED_SERVICES,
  PARAM_RAMP_SECS,
  TRANSPORT_BPM,
  VIBRATO_MAX_DEPTH,
} from "./mapping.js?v=20260708-controls2";

/* ------------------------------------------------------------------ */
/* Engine-local constants                                              */
/* ------------------------------------------------------------------ */

/**
 * DEVIATION NOTE (per spec instruction to flag Tone.js API deviations
 * rather than silently change behaviour): the spec names Tone.Vibrato,
 * but Tone.Vibrato's internal LFO starts at construction and exposes
 * no public stop, so "after one hour, vibrato is off entirely (zero
 * CPU cost)" cannot be honoured with it. Instead each voice gets a
 * Tone.LFO wired into the synth's detune param (cents), with real
 * start()/stop(). The spec's 0..0.15 depth maps onto LFO amplitude
 * with a +/-15 cent range at full depth: audibly the same subtle
 * post-deploy shimmer, but an expired vibrato costs nothing.
 */
export const VIBRATO_MAX_CENTS = 15;
export const VIBRATO_RATE_HZ = 5;

/**
 * Round-robin note length. At 72 BPM a half note is ~1.67s and each
 * voice comes around every six 8th notes (2.5s), so successive strikes
 * of a voice never overlap themselves (each FMSynth is monophonic;
 * six mono voices IS the polyphony cap) while release tails from
 * neighbouring voices overlap into a continuous bed.
 */
export const NOTE_DURATION = "2n";

/** Incident percussion: one low membrane hit per newly seen incident,
 *  through a short reverb, always on a quarter-note boundary. */
export const INCIDENT_NOTE = "C1";
export const INCIDENT_DURATION = "8n";
export const INCIDENT_VELOCITY = 0.9;
export const REVERB_DECAY_SECS = 1.5;

/** Default position for the user volume slider (linear gain 0..1). */
export const DEFAULT_USER_GAIN = 1;

/** Short ramp for start/stop and slider moves; snappier than the
 *  telemetry ramps because it answers a direct user action. */
const UI_RAMP_SECS = 0.15;

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

/**
 * Create the (page-lifetime) audio engine. Nothing here touches the
 * AudioContext until start() runs inside a user gesture; until then
 * applyFrame() just remembers the latest frame so the first audible
 * moment already reflects live data.
 */
export function createEngine() {
  let initialized = false;
  let running = false;
  let userVolume = DEFAULT_USER_GAIN;

  /** Latest mapped frame, whether or not audio is live. */
  let currentFrame = null;
  /** name -> voice params from the latest frame, for the grid tick. */
  let frameVoices = new Map();

  /** name -> { synth, filter, gain, lfo, lfoRunning, lfoStopTimer } */
  const voices = new Map();

  let transport = null;
  let userGain = null;
  let healthVolume = null;
  let membrane = null;
  let reverb = null;
  let tickIndex = 0;
  let voiceTickHandler = null;

  function requireTone() {
    const Tone = globalThis.Tone;
    if (!Tone) {
      throw new Error(
        "sonify: window.Tone is missing. Load /vendor/tone.min.js " +
          "(classic script, before this module) per the README.",
      );
    }
    return Tone;
  }

  function buildGraph(Tone) {
    // User volume is the outermost stage and starts closed so the
    // graph can be built and primed without a click; resume() opens it.
    userGain = new Tone.Gain(0).toDestination();

    // The estate's calm floor lives on its own dB-native stage so the
    // health mapping and the user's slider never fight over one param.
    healthVolume = new Tone.Volume(0).connect(userGain);

    // Incident percussion joins AFTER the health stage on purpose: an
    // alert must land at full user volume even while the estate rests
    // at the -18dB calm floor. The user slider still governs it.
    reverb = new Tone.Reverb({ decay: REVERB_DECAY_SECS, wet: 0.5 });
    reverb.connect(userGain);
    membrane = new Tone.MembraneSynth({
      octaves: 4,
      pitchDecay: 0.06,
      envelope: { attack: 0.001, decay: 0.5, sustain: 0.01, release: 0.6 },
    });
    membrane.connect(reverb);

    for (const name of CURATED_SERVICES) {
      const synth = new Tone.FMSynth({
        // Soft ambient patch: near-unity harmonicity for slow beating
        // warmth, low modulation index to stay far from FM clang, and
        // -6dB of per-voice headroom so six voices summing never clip.
        harmonicity: 1.005,
        modulationIndex: 1.8,
        oscillator: { type: "sine" },
        modulation: { type: "sine" },
        envelope: { attack: 0.06, decay: 0.4, sustain: 0.6, release: 1.4 },
        modulationEnvelope: {
          attack: 0.3,
          decay: 0.5,
          sustain: 0.4,
          release: 1.6,
        },
        volume: -6,
      });

      // Vibrato LFO into detune (cents). Created stopped, amplitude 0;
      // applyVibrato() starts it only while a fresh deploy is decaying
      // and stops it again at zero depth. See VIBRATO_MAX_CENTS note.
      const lfo = new Tone.LFO({
        frequency: VIBRATO_RATE_HZ,
        min: -VIBRATO_MAX_CENTS,
        max: VIBRATO_MAX_CENTS,
        amplitude: 0,
      });
      lfo.connect(synth.detune);

      const filter = new Tone.Filter({
        type: "lowpass",
        frequency: 8000,
        rolloff: -24,
        Q: 1,
      });

      // Per-voice gate. Starts closed and fades open on the first
      // frame; unknown voices hold at a low mapped gain but stay
      // scheduled, so a service appearing mid-session fades in rather
      // than pops.
      const gain = new Tone.Gain(0);

      synth.chain(filter, gain, healthVolume);
      voices.set(name, {
        synth,
        filter,
        gain,
        lfo,
        lfoRunning: false,
        lfoStopTimer: null,
      });
    }
  }

  /**
   * The 8th-note grid callback. One voice per tick, round-robin across
   * the curated pool: with six voices each returns every three beats,
   * a slow arpeggio whose tails weave into a bed. Silent (gated or
   * zero-velocity) voices are triggered anyway, exactly as the spec
   * asks, so audibility is purely a gain question and fade-ins are
   * always mid-phrase clean. `time` comes from the Transport and is
   * the ONLY clock notes may use.
   */
  function onEighth(time) {
    const name = CURATED_SERVICES[tickIndex % CURATED_SERVICES.length];
    tickIndex += 1;
    const params = frameVoices.get(name);
    const voice = voices.get(name);
    if (!params || !voice) return;
    voiceTickHandler?.(name, params);
    voice.synth.triggerAttackRelease(
      params.frequencyHz,
      NOTE_DURATION,
      time,
      params.velocity,
    );
  }

  function applyVibrato(voice, depth) {
    if (depth > 0) {
      if (voice.lfoStopTimer !== null) {
        clearTimeout(voice.lfoStopTimer);
        voice.lfoStopTimer = null;
      }
      if (!voice.lfoRunning) {
        voice.lfo.start();
        voice.lfoRunning = true;
      }
      voice.lfo.amplitude.rampTo(depth / VIBRATO_MAX_DEPTH, PARAM_RAMP_SECS);
    } else if (voice.lfoRunning && voice.lfoStopTimer === null) {
      // Ramp to zero first, then genuinely stop the oscillator: an
      // inaudible LFO still burns cycles, and "off" must mean off.
      voice.lfo.amplitude.rampTo(0, PARAM_RAMP_SECS);
      voice.lfoStopTimer = setTimeout(() => {
        voice.lfo.stop();
        voice.lfoRunning = false;
        voice.lfoStopTimer = null;
      }, PARAM_RAMP_SECS * 1000 + 100);
    }
  }

  function applyFrameToGraph(frame) {
    healthVolume.volume.rampTo(frame.masterGainDb, PARAM_RAMP_SECS);
    for (const v of frame.voices) {
      const voice = voices.get(v.name);
      if (!voice) continue; // payload outside the curated pool: ignore
      voice.filter.frequency.rampTo(v.filterHz, PARAM_RAMP_SECS);
      voice.gain.gain.rampTo(
        v.voiceGain ?? (v.audible ? 1 : 0),
        PARAM_RAMP_SECS,
      );
      // Pitch under a sustained note glides too: this is what lets the
      // scale crossfade bend a held tone instead of waiting for the
      // next retrigger. New strikes then land on the same value.
      voice.synth.frequency.rampTo(v.frequencyHz, PARAM_RAMP_SECS);
      applyVibrato(voice, v.vibratoDepth);
    }
  }

  return {
    /**
     * Initialise (once) and run. MUST be called from a user gesture:
     * Tone.start() resumes the AudioContext, which browsers only allow
     * in response to input, and autoplaying telemetry audio would be
     * hostile UX even where a browser permitted it.
     */
    async start() {
      const Tone = requireTone();
      await Tone.start();
      if (!initialized) {
        buildGraph(Tone);
        // Reverb renders its impulse response off-thread; wait so the
        // first incident hit is wet, not dry-then-suddenly-wet.
        await reverb.generate();
        transport = Tone.getTransport();
        transport.bpm.value = TRANSPORT_BPM;
        transport.scheduleRepeat(onEighth, "8n");
        initialized = true;
        if (currentFrame) applyFrameToGraph(currentFrame);
      }
      transport.start();
      userGain.gain.rampTo(userVolume, UI_RAMP_SECS);
      running = true;
    },

    /** Mute: close the user stage, halt the grid. Release tails fade
     *  under the closing gain rather than being cut. */
    pause() {
      if (!initialized || !running) return;
      userGain.gain.rampTo(0, UI_RAMP_SECS);
      transport.pause();
      running = false;
    },

    /**
     * Accept a mapped frame from the poller. Always remembered, only
     * applied when the graph exists; on a muted page this is how the
     * first unmuted moment already sounds like the live estate.
     */
    applyFrame(frame) {
      currentFrame = frame;
      frameVoices = new Map(frame.voices.map((v) => [v.name, v]));
      if (initialized) applyFrameToGraph(frame);
    },

    /**
     * Schedule `count` membrane hits on successive quarter-note
     * boundaries: never immediately, always quantised, per spec. The
     * count is bounded by the curated list (six services), so no cap
     * logic is needed. Hits arriving while muted are dropped on
     * purpose: they are transient alerts, not a queue to replay.
     */
    queueIncidentHits(count) {
      if (!initialized || !running || count <= 0) return;
      const Tone = requireTone();
      const quarterSecs = Tone.Time("4n").toSeconds();
      const firstAt = transport.nextSubdivision("4n");
      for (let i = 0; i < count; i += 1) {
        transport.scheduleOnce((time) => {
          membrane.triggerAttackRelease(
            INCIDENT_NOTE,
            INCIDENT_DURATION,
            time,
            INCIDENT_VELOCITY,
          );
        }, firstAt + i * quarterSecs);
      }
    },

    /** User volume, linear 0..1. Remembered while muted. */
    setUserVolume(value) {
      userVolume = Math.min(1, Math.max(0, Number(value) || 0));
      if (initialized && running) {
        userGain.gain.rampTo(userVolume, 0.05);
      }
    },

    isInitialized: () => initialized,
    isRunning: () => running,
    setVoiceTickHandler(handler) {
      voiceTickHandler = typeof handler === "function" ? handler : null;
    },
  };
}
