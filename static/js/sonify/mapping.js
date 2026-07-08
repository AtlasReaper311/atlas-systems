/**
 * mapping.js :: telemetry in, synth parameters out. Pure functions only.
 *
 * This file is the contract between the data and the sound. It imports
 * nothing, touches no DOM, references no Tone.js object, and never
 * reads a clock. Given the same services array and estate block it
 * returns the same plain object, which is what makes mapping.test.js
 * runnable under bare `node --test` with no browser and no
 * AudioContext. Everything stateful (scheduling, ramping, fetching)
 * lives in engine.js and poller.js; if a change here needs a Tone
 * import, the change belongs in engine.js instead.
 */

/* ------------------------------------------------------------------ */
/* Constants (each with provenance; none of these are magic numbers)  */
/* ------------------------------------------------------------------ */

/**
 * The curated service list, fixed order, always six. The engine builds
 * exactly one voice per entry regardless of what a payload contains,
 * which is what "polyphony capped at 6, no dynamic voice count" means
 * in practice. Authoritative copy: SERVICES in specular-sonify's
 * src/index.js; the two must match (same vendored-constant discipline
 * as the estate's _meta.js).
 */
export const CURATED_SERVICES = [
  "ramone-memory",
  "atlas-corpus",
  "specular-telemetry",
  "atlas-api-index",
  "ramone-trigger",
  "specular-edge",
];

/**
 * Latency normalisation ceiling. 500ms is the point past which every
 * service in this estate is equally "slow" for musical purposes; the
 * inverse-log curve below spends most of its resolution in the
 * 0-150ms band where the estate actually lives.
 */
export const MAX_EXPECTED_LATENCY_MS = 500;

/**
 * Scale tables: semitone offsets from the root, eight degrees spanning
 * one octave including the octave itself (indices 0-7). Lydian is the
 * healthy estate (raised 4th, open and unresolved in a pleasant way),
 * Phrygian the degraded one (flat 2nd, immediately darker). Index 4 is
 * 7 semitones (a perfect fifth) in BOTH tables, which matters below:
 * it is the one degree that stays put under any crossfade weight.
 */
export const SCALE_LYDIAN = [0, 2, 4, 6, 7, 9, 11, 12];
export const SCALE_PHRYGIAN = [0, 1, 3, 5, 7, 8, 10, 12];
export const SCALE_DEGREE_COUNT = 8;

/**
 * Root note C3 as a MIDI number (Tone.js convention: C4 = 60, middle
 * C, so C3 = 48). Pitch stays numeric in this file; engine.js receives
 * a frequency in Hz and never converts.
 */
export const ROOT_MIDI = 48;

/**
 * The degree used when latency is null: index 4, the perfect fifth.
 * Chosen because SCALE_LYDIAN[4] === SCALE_PHRYGIAN[4] === 7, so an
 * unmeasured voice sits on the one pitch the scale crossfade cannot
 * move. A voice with no data should not imply motion in the data.
 */
export const NEUTRAL_DEGREE = 4;

/**
 * Transport tempo. Provenance: the shortest known scheduled cadence in
 * the estate is specular-sentinel's five minute systemd timer
 * (OnCalendar=*:0/5 in specular-sentinel/systemd/). 72 BPM is the
 * spec's calm baseline and also divides that 300 second period into
 * exactly 90 bars of 4/4 (300s x 1.2 beats per second / 4 beats per
 * bar), so one sentinel cycle is a whole number of musical phrases
 * rather than a drifting fraction. atlas-api-index's hourly cron and
 * atlas-api-public's ten minute cron both also divide cleanly.
 */
export const TRANSPORT_BPM = 72;

/** Lowpass cutoff range for the per-voice uptime filter. */
export const FILTER_MIN_HZ = 200;
export const FILTER_MAX_HZ = 8000;

/**
 * Uptime below this maps to the filter floor. The spec asks for two
 * things at once: "uptime_pct / 100 mapped linearly to 200Hz-8000Hz"
 * and "below 90% uptime, cutoff drops below 1500Hz (audibly muffled)".
 * A linear map over the full 0-100 range cannot satisfy the second
 * clause (90% would land at 7220Hz, indistinguishable from healthy),
 * so the audible intent wins: the linear 200-8000Hz sweep is applied
 * across the 90-100% band where real uptime lives, clamped below it.
 * Under this map, 1500Hz sits at about 91.7% uptime, so anything
 * under 90% is well below 1500Hz, exactly as the spec's muffle clause
 * requires. The deviation from the literal formula is documented in
 * the module README.
 */
export const UPTIME_AUDIBLE_FLOOR_PCT = 90;

/** Base note velocity; error_rate only ever scales it down. */
export const BASE_VELOCITY = 0.55;

/** Fresh-deploy vibrato: max depth, decaying to zero across one hour. */
export const VIBRATO_MAX_DEPTH = 0.15;
export const VIBRATO_WINDOW_SECS = 3600;

/**
 * Estate silence behaviour: at or above CALM_HEALTH_THRESHOLD with no
 * active incidents, the master bus rests at CALM_FLOOR_DB (sparse, not
 * silent). Below the threshold it ramps linearly back to unity,
 * reaching 0dB at MASTER_UNITY_HEALTH: an estate at coin-flip health
 * or worse deserves full volume. Any active incident forces unity
 * immediately regardless of health.
 */
export const CALM_HEALTH_THRESHOLD = 0.95;
export const CALM_FLOOR_DB = -9;
export const MASTER_UNITY_HEALTH = 0.5;

/**
 * Per-voice gain for known vs unknown services. Unknown voices stay
 * faint and neutral rather than fully muted, so the six-service estate
 * remains visible by ear even before every worker exposes metrics.
 */
export const KNOWN_VOICE_GAIN = 1;
export const UNKNOWN_VOICE_GAIN = 0.18;

/**
 * Continuous parameters (filter, gain, vibrato depth, master volume,
 * under-note pitch) glide with this ramp on every poll tick. Notes
 * themselves never use it: they trigger on the Transport's 8th-note
 * grid or not at all. That split is the architecture.
 */
export const PARAM_RAMP_SECS = 0.3;

/**
 * Null-metric defaults, chosen per status. The /sonify contract allows
 * null numeric fields wherever the backing store has no measurement
 * (today TELEMETRY_KV carries no latency, uptime, error or deploy
 * history at all; see the Worker README). A null must not be allowed
 * to make a voice lie, so the default depends on what the status
 * already asserts:
 *   healthy  -> optimistic: open filter, full base velocity
 *   degraded -> audibly impaired: muffled filter, halved velocity
 *   down     -> the voice recedes to nothing via the spec's own
 *               velocity formula (error 1.0 gives 0.4 x 0 = 0); the
 *               alarm is carried by the estate layer instead (scale
 *               tilt, master gain, incident hit)
 *   unknown  -> healthy-shaped but quiet, so it can fade into a
 *               measured state cleanly the moment data arrives
 * Latency has no pessimistic default on purpose: inventing a pitch
 * would claim a measurement that was never made, so null latency
 * always resolves to the crossfade-invariant NEUTRAL_DEGREE.
 */
export const STATUS_NULL_DEFAULTS = {
  healthy: { uptime_pct: 100, error_rate: 0 },
  degraded: { uptime_pct: 90.5, error_rate: 0.5 },
  down: { uptime_pct: 0, error_rate: 1 },
  unknown: { uptime_pct: 100, error_rate: 0 },
};

/* ------------------------------------------------------------------ */
/* Small pure helpers                                                  */
/* ------------------------------------------------------------------ */

/** Clamp x into [lo, hi]; non-finite x collapses to lo. */
export function clamp(x, lo, hi) {
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}

/** MIDI (float-friendly) to Hz. 440Hz reference at MIDI 69. */
export function midiToFrequencyHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Inverse-log latency normalisation, per spec:
 * 1 - log(latency + 1) / log(maxExpectedLatency + 1), clamped [0, 1].
 * Fast services score near 1, slow near 0. Log rather than linear
 * because the ear (and the operator) cares about the difference
 * between 20ms and 80ms far more than between 380ms and 440ms.
 */
export function normalizeLatency(latencyMs) {
  if (latencyMs == null || !Number.isFinite(latencyMs)) return null;
  const n =
    1 -
    Math.log(Math.max(0, latencyMs) + 1) /
      Math.log(MAX_EXPECTED_LATENCY_MS + 1);
  return clamp(n, 0, 1);
}

/**
 * Quantised scale-degree index 0-7. Quantised, never a continuous
 * bend: latency wobble should re-voice a note on the next grid hit,
 * not smear it. Null latency lands on the crossfade-invariant degree.
 */
export function latencyToDegree(latencyMs) {
  const n = normalizeLatency(latencyMs);
  if (n === null) return NEUTRAL_DEGREE;
  return Math.round(n * (SCALE_DEGREE_COUNT - 1));
}

/**
 * Lowpass cutoff from uptime. Linear 200-8000Hz across the 90-100%
 * band, floored below it; see UPTIME_AUDIBLE_FLOOR_PCT for why the
 * literal full-range formula was rejected.
 */
export function uptimeToFilterHz(uptimePct) {
  const n = clamp(
    (uptimePct - UPTIME_AUDIBLE_FLOOR_PCT) /
      (100 - UPTIME_AUDIBLE_FLOOR_PCT),
    0,
    1,
  );
  return FILTER_MIN_HZ + n * (FILTER_MAX_HZ - FILTER_MIN_HZ);
}

/**
 * Velocity from error rate: 0.4 x (1 - error_rate). Errors make a
 * voice recede; they never make it louder or more percussive.
 */
export function errorRateToVelocity(errorRate) {
  return BASE_VELOCITY * (1 - clamp(errorRate, 0, 1));
}

/** Voice gain from status: unknown is visible but clearly background. */
export function statusToVoiceGain(status) {
  return status === "unknown" ? UNKNOWN_VOICE_GAIN : KNOWN_VOICE_GAIN;
}

/**
 * Vibrato depth from deploy age: 0.15 at the moment of deploy,
 * decaying linearly to 0 across one hour, then exactly 0 (the engine
 * stops the LFO entirely at 0; an inaudible oscillator still costs
 * CPU, so "off" must mean off).
 */
export function deployAgeToVibratoDepth(lastDeploySecsAgo) {
  if (lastDeploySecsAgo == null || !Number.isFinite(lastDeploySecsAgo)) {
    return 0;
  }
  if (lastDeploySecsAgo >= VIBRATO_WINDOW_SECS) return 0;
  const remaining = 1 - Math.max(0, lastDeploySecsAgo) / VIBRATO_WINDOW_SECS;
  return VIBRATO_MAX_DEPTH * remaining;
}

/**
 * Crossfade the two semitone tables by overall health. Weight is the
 * health value itself: 1.0 is pure Lydian, 0.0 pure Phrygian, 0.5 an
 * even blend, so below 0.5 the mix favours Phrygian and above it
 * Lydian, per spec. The blend runs on the offset table rather than on
 * note selection, so a sustained tone bends as the estate's mood
 * shifts instead of waiting for a retrigger. Blended offsets are
 * intentionally fractional (quarter-tone territory mid-fade): degree
 * SELECTION stays quantised, degree VALUES glide.
 */
export function blendScales(overallHealth) {
  const w = clamp(overallHealth ?? 1, 0, 1);
  return SCALE_LYDIAN.map(
    (lyd, i) => lyd * w + SCALE_PHRYGIAN[i] * (1 - w),
  );
}

/**
 * Master bus level in dB. Incidents force unity: an alert is never
 * played at the calm floor. Otherwise linear between unity at
 * MASTER_UNITY_HEALTH and the calm floor at CALM_HEALTH_THRESHOLD.
 * The floor reads as "calm", not "off": a listener should be able to
 * tell a quiet healthy estate from a muted tab.
 */
export function computeMasterGainDb(overallHealth, activeIncidents) {
  if ((activeIncidents ?? 0) > 0) return 0;
  const h = clamp(overallHealth ?? 1, 0, 1);
  const t = clamp(
    (h - MASTER_UNITY_HEALTH) / (CALM_HEALTH_THRESHOLD - MASTER_UNITY_HEALTH),
    0,
    1,
  );
  // + 0 normalises IEEE negative zero: -18 x 0 is -0, which fails
  // SameValue comparisons (Object.is, assert.strictEqual) and prints
  // as "-0" in debug output. Unity should read as unity.
  return CALM_FLOOR_DB * t + 0;
}

/* ------------------------------------------------------------------ */
/* Per-voice and per-frame assembly                                    */
/* ------------------------------------------------------------------ */

/**
 * Resolve a service record's nullable metrics against the per-status
 * default table. Measured values always win; only nulls are filled.
 */
export function resolveMetrics(service) {
  const status = STATUS_NULL_DEFAULTS[service?.status]
    ? service.status
    : "unknown";
  const defaults = STATUS_NULL_DEFAULTS[status];
  const pick = (value, fallback) =>
    value == null || !Number.isFinite(value) ? fallback : value;
  return {
    status,
    latency_ms:
      service?.latency_ms == null || !Number.isFinite(service.latency_ms)
        ? null
        : service.latency_ms,
    uptime_pct: pick(service?.uptime_pct, defaults.uptime_pct),
    error_rate: pick(service?.error_rate, defaults.error_rate),
    last_deploy_secs_ago:
      service?.last_deploy_secs_ago == null ||
      !Number.isFinite(service.last_deploy_secs_ago)
        ? null
        : service.last_deploy_secs_ago,
  };
}

/**
 * One voice's parameter set. `voiceGain` gates the voice's gain node in
 * the engine; unknown services are still scheduled, updated, and faintly
 * audible, so they can fade into measured data without popping.
 */
export function computeVoiceParams(service, blendedScale) {
  const m = resolveMetrics(service);
  const degree = latencyToDegree(m.latency_ms);
  const semitoneOffset = blendedScale[degree];
  const midi = ROOT_MIDI + semitoneOffset;
  return {
    name: service?.name ?? "unnamed",
    status: m.status,
    audible: true,
    voiceGain: statusToVoiceGain(m.status),
    latency_ms: m.latency_ms,
    uptime_pct: m.uptime_pct,
    error_rate: m.error_rate,
    last_deploy_secs_ago: m.last_deploy_secs_ago,
    degree,
    semitoneOffset,
    midi,
    frequencyHz: midiToFrequencyHz(midi),
    filterHz: uptimeToFilterHz(m.uptime_pct),
    velocity: errorRateToVelocity(m.error_rate),
    vibratoDepth: deployAgeToVibratoDepth(m.last_deploy_secs_ago),
  };
}

/**
 * The single entry point poller.js calls: a full /sonify payload in, a
 * plain frame object out. Defensive against missing blocks; an empty
 * payload produces a valid all-silent frame rather than a throw,
 * because a sonification that crashes on bad data is a worse monitor
 * than silence.
 */
export function computeFrame(payload) {
  const estate = payload?.estate ?? {};
  const overallHealth = clamp(estate.overall_health ?? 1, 0, 1);
  const activeIncidents = Number.isFinite(estate.active_incidents)
    ? Math.max(0, Math.trunc(estate.active_incidents))
    : 0;
  const scale = blendScales(overallHealth);
  const services = Array.isArray(payload?.services) ? payload.services : [];
  return {
    timestamp: typeof payload?.timestamp === "string" ? payload.timestamp : null,
    overallHealth,
    activeIncidents,
    masterGainDb: computeMasterGainDb(overallHealth, activeIncidents),
    bpm: TRANSPORT_BPM,
    scale,
    voices: services.map((s) => computeVoiceParams(s, scale)),
  };
}
