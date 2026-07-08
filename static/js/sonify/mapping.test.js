/**
 * mapping.test.js :: run with `node --test static/js/sonify/`
 *
 * Node's built-in runner, node:assert/strict, zero new dependencies.
 * mapping.js is pure, so these tests need no browser, no AudioContext
 * and no mocks; that isolation is the reason the mapping layer exists
 * as its own file. The sibling package.json ({"type":"module"}) is
 * what lets Node parse these .js files as ES modules; browsers never
 * read it.
 *
 * Four cases per the build spec:
 *   1. healthy-estate output
 *   2. degraded-estate output
 *   3. null-field handling for "unknown" status
 *   4. scale-crossfade boundaries at health 0.0 / 0.5 / 1.0
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  BASE_VELOCITY,
  CALM_FLOOR_DB,
  FILTER_MAX_HZ,
  FILTER_MIN_HZ,
  NEUTRAL_DEGREE,
  ROOT_MIDI,
  SCALE_LYDIAN,
  SCALE_PHRYGIAN,
  blendScales,
  computeFrame,
  computeMasterGainDb,
  deployAgeToVibratoDepth,
  latencyToDegree,
  midiToFrequencyHz,
  uptimeToFilterHz,
} from "./mapping.js";

/** Build a service record with healthy measurements unless overridden. */
function service(name, overrides = {}) {
  return {
    name,
    status: "healthy",
    latency_ms: 40,
    uptime_pct: 100,
    error_rate: 0,
    last_deploy_secs_ago: 7200,
    ...overrides,
  };
}

const CURATED = [
  "ramone-memory",
  "atlas-corpus",
  "specular-telemetry",
  "atlas-api-index",
  "ramone-trigger",
  "specular-edge",
];

test("healthy estate: pure Lydian, open filters, calm floor", () => {
  const payload = {
    timestamp: "2026-07-07T12:00:00.000Z",
    estate: { overall_health: 1.0, active_incidents: 0 },
    services: CURATED.map((n) => service(n)),
  };
  const frame = computeFrame(payload);

  // Health 1.0 selects the Lydian table exactly (weight 1 blend).
  assert.deepEqual(frame.scale, SCALE_LYDIAN);

  // Calm-but-not-silent: master rests at the sparse ambient floor.
  assert.equal(frame.masterGainDb, CALM_FLOOR_DB);
  assert.equal(frame.voices.length, 6);

  for (const v of frame.voices) {
    assert.equal(v.audible, true);
    // 100% uptime opens the lowpass fully.
    assert.equal(v.filterHz, FILTER_MAX_HZ);
    // Zero error rate leaves the base velocity untouched.
    assert.equal(v.velocity, BASE_VELOCITY);
    // Deploy two hours ago: vibrato fully off, not merely tiny.
    assert.equal(v.vibratoDepth, 0);
  }

  // 40ms latency: normalized = 1 - ln(41)/ln(501) ~= 0.4026, degree 3.
  // Lydian degree 3 is the raised 4th (6 semitones), the mode's
  // signature note, so a typical healthy latency voices the scale's
  // identity. MIDI 48 + 6 = 54.
  const v = frame.voices[0];
  assert.equal(v.degree, 3);
  assert.equal(v.midi, ROOT_MIDI + 6);
  assert.ok(Math.abs(v.frequencyHz - midiToFrequencyHz(54)) < 1e-9);
});

test("degraded estate: Phrygian-weighted blend, muffle, recession", () => {
  const payload = {
    timestamp: "2026-07-07T12:00:10.000Z",
    estate: { overall_health: 0.4, active_incidents: 1 },
    services: [
      service("ramone-memory"),
      service("atlas-corpus", { error_rate: 0.5 }),
      // Down with nulls: the per-status default table must make this
      // voice recede to zero velocity and floor its filter.
      service("specular-telemetry", {
        status: "down",
        latency_ms: null,
        uptime_pct: null,
        error_rate: null,
        last_deploy_secs_ago: null,
      }),
      service("atlas-api-index", { uptime_pct: 91 }),
      service("ramone-trigger", { status: "degraded", uptime_pct: 85 }),
      service("specular-edge"),
    ],
  };
  const frame = computeFrame(payload);

  // Health 0.4 favours Phrygian: blended flat-2nd sits at
  // 2 x 0.4 + 1 x 0.6 = 1.4 semitones, closer to Phrygian's 1 than
  // Lydian's 2. Fractional on purpose: the table glides, notes don't.
  assert.ok(Math.abs(frame.scale[1] - 1.4) < 1e-9);
  assert.ok(Math.abs(frame.scale[1] - SCALE_PHRYGIAN[1]) <
    Math.abs(frame.scale[1] - SCALE_LYDIAN[1]));

  // An active incident forces the master bus to unity, never the floor.
  assert.equal(frame.masterGainDb, 0);

  // Errors scale a voice down, never up.
  const erroring = frame.voices[1];
  assert.ok(Math.abs(erroring.velocity - BASE_VELOCITY * 0.5) < 1e-9);

  // The down service is audible in principle but fully receded, and
  // its filter sits on the floor: absence expressed by the spec's own
  // velocity formula rather than an invented rule.
  const down = frame.voices[2];
  assert.equal(down.audible, true);
  assert.equal(down.velocity, 0);
  assert.equal(down.filterHz, FILTER_MIN_HZ);
  assert.equal(down.degree, NEUTRAL_DEGREE);

  // 91% uptime lands under the 1500Hz muffle line: the audible intent
  // the uptime map exists to satisfy.
  const wobbling = frame.voices[3];
  assert.ok(wobbling.filterHz < 1500);
  assert.ok(wobbling.filterHz > FILTER_MIN_HZ);

  // 85% is below the audible floor entirely.
  assert.equal(frame.voices[4].filterHz, FILTER_MIN_HZ);
});

test("unknown status: null fields resolve to a silent, NaN-free voice", () => {
  const payload = {
    timestamp: "2026-07-07T12:00:20.000Z",
    estate: { overall_health: 0.3, active_incidents: 0 },
    services: [
      {
        name: "ramone-memory",
        status: "unknown",
        latency_ms: null,
        uptime_pct: null,
        error_rate: null,
        last_deploy_secs_ago: null,
      },
    ],
  };
  const frame = computeFrame(payload);
  const v = frame.voices[0];

  // Gated silent, but shaped healthy so it can fade in cleanly.
  assert.equal(v.audible, false);
  assert.equal(v.filterHz, FILTER_MAX_HZ);
  assert.equal(v.velocity, BASE_VELOCITY);
  assert.equal(v.vibratoDepth, 0);

  // Null latency lands on the crossfade-invariant fifth: both scale
  // tables hold 7 at index 4, so even at health 0.3 the unmeasured
  // voice's pitch is exact, not a blend artefact.
  assert.equal(v.degree, NEUTRAL_DEGREE);
  assert.equal(v.semitoneOffset, 7);
  assert.equal(v.midi, ROOT_MIDI + 7);

  // Nothing numeric may be NaN or infinite anywhere in the voice.
  for (const key of [
    "degree",
    "semitoneOffset",
    "midi",
    "frequencyHz",
    "filterHz",
    "velocity",
    "vibratoDepth",
  ]) {
    assert.ok(Number.isFinite(v[key]), `${key} must be finite`);
  }

  // Direct null-tolerance of the individual mappers.
  assert.equal(latencyToDegree(null), NEUTRAL_DEGREE);
  assert.equal(deployAgeToVibratoDepth(null), 0);
  assert.ok(Number.isFinite(uptimeToFilterHz(null)));
});

test("scale crossfade boundaries at exactly 0.0, 0.5, 1.0", () => {
  // 0.0: pure Phrygian, exact equality (weight arithmetic degenerates
  // to the raw integer table).
  assert.deepEqual(blendScales(0.0), SCALE_PHRYGIAN);

  // 1.0: pure Lydian, exact.
  assert.deepEqual(blendScales(1.0), SCALE_LYDIAN);

  // 0.5: the elementwise midpoint. Multiplying integers by 0.5 is
  // exact in binary floating point, so strict equality is safe here.
  const mid = SCALE_LYDIAN.map((lyd, i) => (lyd + SCALE_PHRYGIAN[i]) / 2);
  assert.deepEqual(blendScales(0.5), mid);

  // The invariant degree holds at every boundary.
  assert.equal(blendScales(0.0)[NEUTRAL_DEGREE], 7);
  assert.equal(blendScales(0.5)[NEUTRAL_DEGREE], 7);
  assert.equal(blendScales(1.0)[NEUTRAL_DEGREE], 7);

  // Master gain at the same boundaries: unity at or below 0.5 health,
  // the calm floor at and above 0.95 when no incidents are active.
  assert.equal(computeMasterGainDb(0.0, 0), 0);
  assert.equal(computeMasterGainDb(0.5, 0), 0);
  assert.equal(computeMasterGainDb(1.0, 0), CALM_FLOOR_DB);
  assert.equal(computeMasterGainDb(0.95, 0), CALM_FLOOR_DB);
});
