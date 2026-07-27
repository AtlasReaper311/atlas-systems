import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_SCORE_TRACE_HISTORY_LIMIT,
  createScoreTraceEntry,
  createScoreTraceRecorder,
  scoreTraceDigest,
  serializeScoreTrace,
  stableStringify,
} from "./apu-score-trace.js";

function input() {
  return {
    frame: {
      scoreState: "healthy",
      evidenceMode: "fixture",
      stale: false,
      measuredComponents: 21,
      totalComponents: 21,
      knownServiceRatio: 1,
    },
    directorPlan: {
      id: "live:1:trace:0:healthy:establish:2",
      state: "healthy",
      phraseIndex: 0,
      phase: "establish",
      motifVariant: 2,
      motifDegrees: [0, 2, 4, 1],
      motifPattern: [0, 4, 8, 12],
      bassPattern: 3,
    },
    performancePlan: {
      phase: "intro",
      density: 0.4,
      silenceBudget: 0.4,
    },
    arrangement: {
      phraseIndex: 0,
      cycleNumber: 0,
      cyclePhrase: 0,
      cycleBarStart: 1,
      cycleBarEnd: 2,
      scoreState: "healthy",
      section: "intro",
      sectionLabel: "Intro",
      directorPhase: "establish",
      motifMode: "fragment",
      motifDegrees: [0, 4, 6, 4],
      harmony: [{ rootDegree: 0, quality: "open", inversion: 0 }],
      drumPattern: "none",
      bassPattern: "none",
      transition: "lift",
      serviceDensity: 0.12,
      mix: { primary: 0.42, secondary: 0, services: 0.12, bass: 0, drums: 0, pad: 0.82, accent: 0.14 },
    },
    ornaments: [{ voice: "secondary", function: "connective-arp", offsetSteps: 12, midiOffset: 7, duration: "16n" }],
  };
}

test("score trace entries are deterministic and deeply frozen", () => {
  const first = createScoreTraceEntry(input());
  const second = createScoreTraceEntry(input());
  assert.deepEqual(first, second);
  assert.equal(first.deterministicSignature, second.deterministicSignature);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.harmony));
  assert.ok(Object.isFrozen(first.harmony[0]));
  assert.ok(Object.isFrozen(first.ornaments[0]));
  assert.ok(Object.isFrozen(first.evidenceSource));
  assert.equal(first.stateTitle, "Explorer");
  assert.equal(first.foregroundVoice, "pad");
  assert.equal(first.responseVoice, "primary");
});

test("stable serialization ignores object insertion order", () => {
  assert.equal(stableStringify({ b: 2, a: 1 }), stableStringify({ a: 1, b: 2 }));
});

test("trace serialization and digest are byte stable", () => {
  const entries = [createScoreTraceEntry(input())];
  assert.equal(serializeScoreTrace(entries), serializeScoreTrace(entries));
  assert.equal(scoreTraceDigest(entries), scoreTraceDigest(entries));
  assert.match(scoreTraceDigest(entries), /^[0-9a-f]{8}$/);
});

test("recorder remains bounded and resettable", () => {
  const recorder = createScoreTraceRecorder({ limit: 3 });
  for (let index = 0; index < 5; index += 1) {
    const next = input();
    next.arrangement.phraseIndex = index;
    next.arrangement.cyclePhrase = index;
    recorder.record(next);
  }
  assert.equal(recorder.getHistory().length, 3);
  assert.equal(recorder.getLatest().phraseIndex, 4);
  recorder.reset();
  assert.equal(recorder.getHistory().length, 0);
  assert.ok(APU_SCORE_TRACE_HISTORY_LIMIT >= 128);
});

test("one-entry recorder limit remains bounded", () => {
  const recorder = createScoreTraceRecorder({ limit: 1 });
  for (let index = 0; index < 4; index += 1) {
    const next = input();
    next.arrangement.phraseIndex = index;
    recorder.record(next);
  }
  assert.equal(recorder.getHistory().length, 1);
  assert.equal(recorder.getLatest().phraseIndex, 3);
});

test("trace payload does not retain arbitrary frame or credential fields", () => {
  const next = input();
  next.frame.NOTIFY_TOKEN = "not-for-trace";
  next.frame.providerCredential = "not-for-trace";
  const entry = createScoreTraceEntry(next);
  const serialized = JSON.stringify(entry);
  assert.doesNotMatch(serialized, /NOTIFY_TOKEN/);
  assert.doesNotMatch(serialized, /providerCredential/);
  assert.doesNotMatch(serialized, /not-for-trace/);
});
