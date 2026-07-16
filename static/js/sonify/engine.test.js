import assert from "node:assert/strict";
import test from "node:test";

import {
  COUNTERLINE_BUS_GAINS,
  DRONE_MIDI,
  PAD_DURATIONS,
  PAD_MEASURE_STEPS,
  PAD_ROOT_MIDI,
  PERCUSSION_BUS_GAINS,
  bassEventForStep,
  buildPadVoicing,
  counterlineEventForStep,
  createEngine,
  percussionEventsForStep,
  serviceOctaveDisplacement,
  shouldApplyPendingPerformance,
  shouldPlayServiceVoice,
  shouldPlayPad,
  startToneWithTimeout,
  terminalEventForStep,
} from "./engine.js";
import { SCORE_STATES, STATUS_PARAMETERS, computeFrame } from "./mapping.js";
import { createPerformanceArrangement } from "./performance.js";

test("audio context start resolves normally", async () => {
  await startToneWithTimeout({ start: async () => undefined }, 20);
});

test("audio context start fails closed when browser unlock never resolves", async () => {
  await assert.rejects(
    startToneWithTimeout({ start: () => new Promise(() => {}) }, 10),
    /audio context did not start in time/,
  );
});

test("the shared pad refreshes every measure with a low grounded voicing", () => {
  assert.deepEqual(DRONE_MIDI, [26, 33]);
  assert.equal(PAD_MEASURE_STEPS, 8);
  assert.deepEqual(
    Array.from({ length: 32 }, (_, step) => step).filter(shouldPlayPad),
    [0, 8, 16, 24],
  );
  for (const state of Object.keys(SCORE_STATES)) {
    for (let measure = 0; measure < 4; measure += 1) {
      const notes = buildPadVoicing(state, SCORE_STATES[state].scale, measure);
      assert.ok(notes.length >= 2);
      assert.ok(Math.min(...notes) >= PAD_ROOT_MIDI);
      assert.ok(Math.max(...notes) <= 57, `${state} pad should stay at or below A3`);
    }
  }
});

test("service octave variation is neutral or downward, never an upward alarm jump", () => {
  for (let seed = 0; seed < 500; seed += 1) {
    assert.ok([0, -12].includes(serviceOctaveDisplacement(seed)));
  }
});

test("bass scheduling stays finite on off-grid healthy and warning steps", () => {
  const expectedEvents = { healthy: 8, warning: 10, critical: 8, unknown: 4 };
  for (const [state, score] of Object.entries(SCORE_STATES)) {
    for (let phrase = 0; phrase < 8; phrase += 1) {
      const events = Array.from({ length: 32 }, (_, step) => (
        bassEventForStep(state, score.scale, step, phrase)
      )).filter(Boolean);
      assert.equal(events.length, expectedEvents[state]);
      for (const event of events) {
        assert.ok(Number.isFinite(event.midi), `${state} bass midi must be finite`);
        assert.ok(Number.isFinite(event.velocity), `${state} bass velocity must be finite`);
        assert.equal(typeof event.duration, "string");
      }
    }
  }
});

test("every state retains non-drum layers across a sustained eight-phrase run", () => {
  const statusForState = {
    healthy: "healthy",
    warning: "degraded",
    critical: "down",
    unknown: "unknown",
  };
  const minimumServiceEvents = { healthy: 8, warning: 12, critical: 16, unknown: 6 };
  const expectedCounterlineEvents = { healthy: 4, warning: 8, critical: 8, unknown: 4 };

  for (const [state, score] of Object.entries(SCORE_STATES)) {
    const voiceDensity = STATUS_PARAMETERS[statusForState[state]].density;
    for (let phrase = 0; phrase < 8; phrase += 1) {
      const steps = Array.from({ length: 32 }, (_, step) => step);
      const padEvents = steps.filter(shouldPlayPad);
      const counterlineEvents = steps
        .map((step) => counterlineEventForStep(state, score.scale, step, phrase))
        .filter(Boolean);
      const serviceEvents = steps.filter((step) => shouldPlayServiceVoice(
        state,
        phrase,
        step,
        score.density,
        voiceDensity,
      ));

      assert.equal(padEvents.length, 4, `${state} should refresh its pad every measure`);
      assert.equal(counterlineEvents.length, expectedCounterlineEvents[state]);
      assert.ok(serviceEvents.length >= minimumServiceEvents[state]);
      assert.ok(counterlineEvents.every((event) => Number.isFinite(event.midi)));
    }
  }

  assert.equal(PAD_DURATIONS.healthy, "2m");
  assert.equal(PAD_DURATIONS.warning, "2m");
  assert.equal(PAD_DURATIONS.unknown, "2m");
  assert.ok(COUNTERLINE_BUS_GAINS.healthy > 0);
  assert.ok(COUNTERLINE_BUS_GAINS.warning > COUNTERLINE_BUS_GAINS.healthy);
  assert.ok(COUNTERLINE_BUS_GAINS.unknown > 0);
});

test("every state keeps an industrial rhythmic foundation", () => {
  const steps = Array.from({ length: 32 }, (_, step) => step);
  const eventSteps = (state, event) => steps.filter(
    (step) => percussionEventsForStep(state, step)[event] !== null,
  );

  assert.deepEqual(eventSteps("healthy", "kick"), [0, 8, 16, 24]);
  assert.deepEqual(eventSteps("healthy", "snare"), [4, 12, 20, 28]);
  assert.deepEqual(
    eventSteps("healthy", "hat"),
    [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31],
  );
  assert.deepEqual(
    eventSteps("warning", "kick"),
    [0, 6, 8, 14, 16, 22, 24, 30],
  );
  assert.deepEqual(
    eventSteps("warning", "snare"),
    [4, 12, 20, 28],
  );
  assert.deepEqual(eventSteps("unknown", "kick"), [0, 16]);
  assert.deepEqual(eventSteps("unknown", "hat"), [3, 7, 11, 19, 23, 31]);
  assert.ok(PERCUSSION_BUS_GAINS.healthy > 0);
  assert.ok(PERCUSSION_BUS_GAINS.warning > PERCUSSION_BUS_GAINS.healthy);
  assert.ok(PERCUSSION_BUS_GAINS.critical > PERCUSSION_BUS_GAINS.warning);
  assert.ok(PERCUSSION_BUS_GAINS.unknown > 0);
  assert.ok(PERCUSSION_BUS_GAINS.unknown < PERCUSSION_BUS_GAINS.healthy);
});

test("critical keeps the liked kick pattern inside the fuller drum machine", () => {
  const steps = Array.from({ length: 32 }, (_, step) => step);
  assert.deepEqual(
    steps.filter((step) => percussionEventsForStep("critical", step).kick),
    [0, 8, 14, 16, 24, 30],
  );
  assert.deepEqual(
    steps.filter((step) => percussionEventsForStep("critical", step).snare),
    [4, 12, 20, 28],
  );
  assert.equal(percussionEventsForStep("critical", 0).kick.velocity, 0.72);
  assert.equal(percussionEventsForStep("critical", 14).kick.velocity, 0.48);
  assert.equal(percussionEventsForStep("critical", 7).hat.velocity, 0.3);
  assert.equal(percussionEventsForStep("critical", 3).hat.velocity, 0.2);
  assert.equal(percussionEventsForStep("critical", 15).metal.velocity, 0.24);
});

test("Demo performance changes activate only on measure boundaries", () => {
  assert.deepEqual(
    Array.from({ length: 32 }, (_, step) => step).filter(shouldApplyPendingPerformance),
    [0, 8, 16, 24],
  );
  assert.equal(shouldApplyPendingPerformance(-1), false);
  assert.equal(shouldApplyPendingPerformance(1.5), false);
});

test("Demo arrangements add a bounded low and mid terminal sequence", () => {
  for (const [state, score] of Object.entries(SCORE_STATES)) {
    for (const seed of ["0000", "7F3A", "A71A5", "FFFFFFFF"]) {
      const performance = createPerformanceArrangement(seed, state);
      for (let phrase = 0; phrase < 8; phrase += 1) {
        const events = Array.from({ length: 32 }, (_, step) => (
          terminalEventForStep(state, score.scale, step, phrase, performance)
        )).filter(Boolean);
        assert.ok(events.length >= 7, `${state} ${seed} should keep terminal motion`);
        assert.ok(events.every((event) => event.midi >= PAD_ROOT_MIDI));
        assert.ok(events.every((event) => event.midi <= 60));
        assert.ok(events.every((event) => Number.isFinite(event.velocity)));
      }
    }
  }
  assert.equal(
    terminalEventForStep("healthy", SCORE_STATES.healthy.scale, 3, 0, null),
    null,
    "Live mode must not add the Demo terminal sequence",
  );
});

test("seeded Demo bass and percussion remain finite without losing the state groove", () => {
  const minimumBassEvents = { healthy: 8, warning: 10, critical: 8, unknown: 4 };
  for (const [state, score] of Object.entries(SCORE_STATES)) {
    for (const seed of ["0000", "7F3A", "A71A5", "FFFFFFFF"]) {
      const performance = createPerformanceArrangement(seed, state);
      const bassEvents = Array.from({ length: 32 }, (_, step) => (
        bassEventForStep(state, score.scale, step, 3, performance)
      )).filter(Boolean);
      const drumEvents = Array.from({ length: 32 }, (_, step) => (
        percussionEventsForStep(state, step, performance)
      ));
      assert.equal(bassEvents.length, minimumBassEvents[state]);
      assert.ok(bassEvents.every((event) => Number.isFinite(event.midi)));
      assert.ok(bassEvents.every((event) => Number.isFinite(event.velocity)));
      assert.ok(drumEvents.some((events) => events.kick));
      assert.ok(drumEvents.some((events) => events.hat));
      for (const events of drumEvents) {
        for (const event of Object.values(events)) {
          if (event) assert.ok(Number.isFinite(event.velocity));
        }
      }
    }
  }
});

function fakeToneRuntime() {
  const constructed = [];
  let scheduledEighth = null;
  const parameter = (value = 0) => ({
    value,
    rampTo(nextValue) {
      this.value = nextValue;
    },
  });

  class FakeNode {
    constructor(name, input) {
      constructed.push(name);
      const options = input && typeof input === "object" ? input : {};
      const numeric = Number.isFinite(input) ? input : 0;
      this.gain = parameter(numeric);
      this.frequency = parameter(options.frequency ?? numeric);
      this.volume = parameter(numeric);
      this.wet = parameter(options.wet ?? 0);
      this.pan = parameter(numeric);
      this.detune = parameter(0);
    }

    connect() { return this; }
    chain() { return this; }
    toDestination() { return this; }
    triggerAttackRelease() {}
    start() { return this; }
    dispose() {}
    getValue() { return new Float32Array(512); }
    async generate() {}
  }

  const nodeClass = (name) => class extends FakeNode {
    constructor(...args) {
      const options = name === "PolySynth" ? args[1] : args[0];
      super(name, options);
    }
  };
  const transport = {
    bpm: parameter(72),
    state: "stopped",
    scheduleRepeat(callback) {
      scheduledEighth = callback;
      return 1;
    },
    scheduleOnce() {},
    nextSubdivision() { return 0; },
    clear() {},
    start() { this.state = "started"; },
  };
  const Tone = {
    start: async () => undefined,
    Gain: nodeClass("Gain"),
    Analyser: nodeClass("Analyser"),
    Limiter: nodeClass("Limiter"),
    Compressor: nodeClass("Compressor"),
    Reverb: nodeClass("Reverb"),
    Filter: nodeClass("Filter"),
    Volume: nodeClass("Volume"),
    Distortion: nodeClass("Distortion"),
    PolySynth: nodeClass("PolySynth"),
    Synth: nodeClass("Synth"),
    MonoSynth: nodeClass("MonoSynth"),
    FMSynth: nodeClass("FMSynth"),
    AMSynth: nodeClass("AMSynth"),
    MembraneSynth: nodeClass("MembraneSynth"),
    NoiseSynth: nodeClass("NoiseSynth"),
    MetalSynth: nodeClass("MetalSynth"),
    Noise: nodeClass("Noise"),
    Panner: nodeClass("Panner"),
    FeedbackDelay: nodeClass("FeedbackDelay"),
    getTransport: () => transport,
    Time: () => ({ toSeconds: () => 0.25 }),
    Draw: { schedule: (callback) => callback() },
  };
  return {
    Tone,
    constructed,
    runEighth: (time = 0) => scheduledEighth?.(time),
  };
}

test("the browser graph allocates Demo effects once and applies a queued score on beat", async () => {
  const previousTone = globalThis.Tone;
  const runtime = fakeToneRuntime();
  globalThis.Tone = runtime.Tone;
  const engine = createEngine();
  const applied = [];
  try {
    engine.applyFrame(computeFrame({
      timestamp: "2026-07-16T12:00:00.000Z",
      estate: { overall_health: 1, active_incidents: 0 },
      services: [],
    }));
    engine.setPerformanceHandler((performance) => applied.push(performance));
    await engine.start();
    assert.ok(runtime.constructed.includes("Distortion"));
    assert.ok(runtime.constructed.includes("FeedbackDelay"));
    assert.ok(runtime.constructed.includes("AMSynth"));
    assert.equal(runtime.constructed.filter((name) => name === "Distortion").length, 1);
    assert.equal(runtime.constructed.filter((name) => name === "FeedbackDelay").length, 1);

    const performance = createPerformanceArrangement("7F3A", "healthy");
    const result = engine.setPerformance(performance);
    assert.equal(result.queued, true);
    assert.equal(applied.length, 0);
    runtime.runEighth();
    assert.equal(applied.length, 1);
    assert.equal(applied[0].id, performance.id);
  } finally {
    engine.dispose();
    if (previousTone === undefined) delete globalThis.Tone;
    else globalThis.Tone = previousTone;
  }
});
