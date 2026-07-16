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
import {
  DEFAULT_PERFORMANCE_SEED,
  createPerformanceArrangement,
} from "./performance.js";

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

test("Demo arrangements add a fast bounded low and mid arpeggiator", () => {
  const minimumEvents = { healthy: 19, warning: 22, critical: 24, unknown: 12 };
  for (const [state, score] of Object.entries(SCORE_STATES)) {
    for (const seed of ["0000", "7F3A", "A71A5", "FFFFFFFF"]) {
      const performance = createPerformanceArrangement(seed, state);
      for (let phrase = 0; phrase < 8; phrase += 1) {
        const events = Array.from({ length: 32 }, (_, step) => (
          terminalEventForStep(state, score.scale, step, phrase, performance)
        )).filter(Boolean);
        assert.ok(
          events.length >= minimumEvents[state],
          `${state} ${seed} should keep its intended arp motion`,
        );
        assert.ok(events.every((event) => event.midi >= PAD_ROOT_MIDI));
        assert.ok(events.every((event) => event.midi <= 55));
        assert.ok(events.every((event) => (
          event.duration === (state === "unknown" ? "8n" : "16n")
        )));
        assert.ok(events.every((event) => Number.isFinite(event.velocity)));
      }
    }
  }
  assert.equal(
    terminalEventForStep("healthy", SCORE_STATES.healthy.scale, 3, 0, null),
    null,
    "Live mode must not add the Demo arpeggiator",
  );
});

test("seeded Demo bass and percussion remain finite without losing the state groove", () => {
  const minimumBassEvents = { healthy: 12, warning: 12, critical: 12, unknown: 8 };
  const minimumKickEvents = { healthy: 12, warning: 12, critical: 12, unknown: 8 };
  for (const [state, score] of Object.entries(SCORE_STATES)) {
    for (const seed of ["0000", "7F3A", "A71A5", "FFFFFFFF"]) {
      const performance = createPerformanceArrangement(seed, state);
      const bassEvents = Array.from({ length: 32 }, (_, step) => (
        bassEventForStep(state, score.scale, step, 3, performance)
      )).filter(Boolean);
      const drumEvents = Array.from({ length: 32 }, (_, step) => (
        percussionEventsForStep(state, step, performance)
      ));
      assert.ok(bassEvents.length >= minimumBassEvents[state]);
      assert.ok(bassEvents.every((event) => Number.isFinite(event.midi)));
      assert.ok(bassEvents.every((event) => Number.isFinite(event.velocity)));
      assert.ok(
        drumEvents.filter((events) => events.kick).length >= minimumKickEvents[state],
      );
      assert.ok(drumEvents.some((events) => events.hat));
      for (const events of drumEvents) {
        for (const event of Object.values(events)) {
          if (event) assert.ok(Number.isFinite(event.velocity));
        }
      }
    }
  }
});

test("Demo scene rhythms separate night drive, pressure, pursuit and menu states", () => {
  const sceneEvents = Object.fromEntries(
    Object.entries(SCORE_STATES).map(([state, score]) => {
      const performance = createPerformanceArrangement(DEFAULT_PERFORMANCE_SEED, state);
      const bass = Array.from({ length: 32 }, (_, step) => (
        bassEventForStep(state, score.scale, step, 0, performance)
      )).filter(Boolean);
      const drums = Array.from({ length: 32 }, (_, step) => (
        percussionEventsForStep(state, step, performance)
      ));
      const arp = Array.from({ length: 32 }, (_, step) => (
        terminalEventForStep(state, score.scale, step, 0, performance)
      )).filter(Boolean);
      return [state, {
        bass: bass.length,
        kicks: drums.filter((events) => events.kick).length,
        snares: drums.filter((events) => events.snare).length,
        hats: drums.filter((events) => events.hat).length,
        metal: drums.filter((events) => events.metal).length,
        arp: arp.length,
      }];
    }),
  );

  assert.deepEqual(sceneEvents.healthy, {
    bass: 16,
    kicks: 16,
    snares: 8,
    hats: 16,
    metal: 4,
    arp: 19,
  });
  assert.deepEqual(sceneEvents.warning, {
    bass: 20,
    kicks: 16,
    snares: 8,
    hats: 20,
    metal: 4,
    arp: 22,
  });
  assert.deepEqual(sceneEvents.critical, {
    bass: 20,
    kicks: 18,
    snares: 12,
    hats: 20,
    metal: 4,
    arp: 24,
  });
  assert.deepEqual(sceneEvents.unknown, {
    bass: 12,
    kicks: 8,
    snares: 4,
    hats: 12,
    metal: 2,
    arp: 12,
  });
});

test("different Demo seeds create distinct audible phrase signatures", () => {
  const seeds = ["A71A5", "7F3A", "B10C", "C0FFEE", "DEADBEEF"];
  for (const [state, score] of Object.entries(SCORE_STATES)) {
    const signatures = new Set(seeds.map((seed) => {
      const performance = createPerformanceArrangement(seed, state);
      const bass = Array.from({ length: 32 }, (_, step) => (
        bassEventForStep(state, score.scale, step, 0, performance)
      ));
      const drums = Array.from({ length: 32 }, (_, step) => (
        percussionEventsForStep(state, step, performance)
      ));
      const terminal = Array.from({ length: 32 }, (_, step) => (
        terminalEventForStep(state, score.scale, step, 0, performance)
      ));
      return JSON.stringify({ bass, drums, terminal });
    }));
    assert.ok(signatures.size >= 4, `${state} needs clearly different seeded phrases`);
  }
});

function fakeToneRuntime() {
  const constructed = [];
  const triggers = [];
  const scheduledRepeats = new Map();
  const parameter = (value = 0) => ({
    value,
    rampTo(nextValue) {
      this.value = nextValue;
    },
  });

  class FakeNode {
    constructor(name, input) {
      constructed.push(name);
      this.name = name;
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
    triggerAttackRelease(...args) { triggers.push({ name: this.name, args }); }
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
    scheduleRepeat(callback, interval) {
      scheduledRepeats.set(interval, callback);
      return scheduledRepeats.size;
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
    triggers,
    scheduledRepeats,
    runEighth: (time = 0) => scheduledRepeats.get("8n")?.(time),
    runSixteenth: (time = 0) => scheduledRepeats.get("16n")?.(time),
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
    assert.ok(runtime.constructed.filter((name) => name === "MonoSynth").length >= 2);
    assert.equal(runtime.constructed.filter((name) => name === "Distortion").length, 1);
    assert.equal(runtime.constructed.filter((name) => name === "FeedbackDelay").length, 1);
    assert.ok(runtime.scheduledRepeats.has("8n"));
    assert.ok(runtime.scheduledRepeats.has("16n"));

    const performance = createPerformanceArrangement("7F3A", "healthy");
    const result = engine.setPerformance(performance);
    assert.equal(result.queued, true);
    assert.equal(applied.length, 0);
    runtime.runEighth();
    assert.equal(applied.length, 1);
    assert.equal(applied[0].id, performance.id);
    const triggerCount = runtime.triggers.length;
    for (let step = 0; step < 32; step += 1) runtime.runSixteenth(step / 4);
    assert.ok(
      runtime.triggers.length >= triggerCount + 18,
      "the active Demo arrangement must reach the audible 16th-note arp scheduler",
    );
  } finally {
    engine.dispose();
    if (previousTone === undefined) delete globalThis.Tone;
    else globalThis.Tone = previousTone;
  }
});
