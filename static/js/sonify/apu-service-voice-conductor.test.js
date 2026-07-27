import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_SERVICE_VOICE_CONDUCTOR_BUILD_ID,
  conductServiceEvent,
} from "./apu-service-voice-conductor.js";

function event(name = "atlas-api-public") {
  return {
    midi: 61,
    velocity: 0.35,
    duration: "16n",
    identity: { channel: "pulse-a", label: "service", pan: 0.4, dutyCycle: 0.25 },
    voice: { name, hash: 0, registerMidi: 53, filterHz: 2600 },
  };
}

function findActiveStep(args) {
  for (let step = 0; step < 32; step += 1) {
    const result = conductServiceEvent({ ...args, step });
    if (result) return { result, step };
  }
  throw new Error("no active motif rhythm step");
}

test("build id identifies tonic-aware conductor", () => assert.match(APU_SERVICE_VOICE_CONDUCTOR_BUILD_ID, /v2$/));

test("motif rhythm suppresses inactive steps", () => {
  const args = { event: event(), frame: { scoreState: "healthy" }, arrangement: { rootMidi: 41 }, perfPlan: { phase: "groove" }, phraseIndex: 0 };
  const results = Array.from({ length: 8 }, (_, step) => conductServiceEvent({ ...args, step }));
  assert.ok(results.some(Boolean));
  assert.ok(results.some((value) => value === null));
});

test("active arrangement tonic changes the quantised result", () => {
  const common = { event: event(), frame: { scoreState: "healthy" }, perfPlan: { phase: "groove" }, phraseIndex: 0 };
  const a = findActiveStep({ ...common, arrangement: { rootMidi: 41 } });
  const b = conductServiceEvent({ ...common, arrangement: { rootMidi: 43 }, step: a.step });
  assert.ok(b);
  assert.notEqual(a.result.provenance.tonicMidi, b.provenance.tonicMidi);
});

test("recovery phase selects the recovery mutation", () => {
  const { result } = findActiveStep({
    event: event(),
    frame: { scoreState: "healthy" },
    arrangement: { rootMidi: 41 },
    perfPlan: { phase: "recovery" },
    phraseIndex: 0,
  });
  assert.equal(result.mutation, "resolve");
  assert.equal(result.duration, "8n");
});

test("preferred layer and role are carried to the audible route", () => {
  const { result } = findActiveStep({
    event: event("service-route"),
    frame: { scoreState: "warning" },
    arrangement: { rootMidi: 41 },
    perfPlan: { phase: "pressure" },
    phraseIndex: 2,
  });
  assert.ok(["primary", "secondary", "bass", "pad", "accent"].includes(result.route));
  assert.equal(result.provenance.preferredLayer, result.route);
});

test("critical motifs remain audible on at least one rhythm slot", () => {
  const outputs = Array.from({ length: 32 }, (_, step) => conductServiceEvent({
    event: event("critical-answer-shape"),
    frame: { scoreState: "critical" },
    arrangement: { rootMidi: 41 },
    perfPlan: { phase: "rupture" },
    phraseIndex: 3,
    step,
  })).filter(Boolean);
  assert.ok(outputs.length > 0);
  assert.ok(outputs.every((output) => output.mutation === "fragment"));
});

test("identical inputs produce identical played notes and provenance", () => {
  const args = {
    event: event(), frame: { scoreState: "unknown" }, arrangement: { rootMidi: 46 },
    perfPlan: { phase: "afterglow" }, phraseIndex: 4, step: 0,
  };
  assert.deepEqual(conductServiceEvent(args), conductServiceEvent(args));
});
