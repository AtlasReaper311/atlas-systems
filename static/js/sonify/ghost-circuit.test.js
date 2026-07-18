import assert from "node:assert/strict";
import test from "node:test";

import {
  ARRANGEMENT_PHASES,
  GHOST_CIRCUIT_VERSION,
  RIFF_MAX_MIDI,
  RIFF_ROOT_MIDI,
  arrangementPhaseForPhrase,
  filterAutomationMultiplier,
  ghostLayerMixProfile,
  ghostRiffEventForStep,
  orderedDegreeIndex,
  rotatePatternSteps,
  transitionAccentForStep,
} from "./ghost-circuit.js";
import { SCORE_STATES } from "./mapping.js";
import { createPerformanceArrangement } from "./performance.js";

test("Ghost Circuit arrangement phases are deterministic and state-specific", () => {
  assert.equal(GHOST_CIRCUIT_VERSION, 2);
  const signatures = new Set();
  for (const state of Object.keys(ARRANGEMENT_PHASES)) {
    const performance = createPerformanceArrangement("A71A5", state);
    const first = Array.from({ length: 8 }, (_, phrase) => (
      arrangementPhaseForPhrase(state, phrase, performance).name
    ));
    const replay = Array.from({ length: 8 }, (_, phrase) => (
      arrangementPhaseForPhrase(state, phrase, performance).name
    ));
    assert.deepEqual(replay, first);
    assert.ok(first.includes("drive"));
    assert.ok(first.includes("afterglow"));
    signatures.add(first.join(":"));
  }
  assert.equal(signatures.size, 4);
});

test("Ghost Circuit mix profiles make the overlay audible and auditionable", () => {
  const normal = ghostLayerMixProfile();
  const focus = ghostLayerMixProfile({ focus: true });
  const arp = ghostLayerMixProfile({ audition: "arp" });
  const riff = ghostLayerMixProfile({ audition: "riff" });
  assert.ok(normal.arp > 1);
  assert.ok(normal.riff > normal.arp);
  assert.ok(normal.lead < 0.8 && normal.lead > 0.7);
  assert.ok(focus.backing < normal.backing);
  assert.ok(focus.lead < normal.lead);
  assert.ok(focus.arp > normal.arp);
  assert.ok(focus.riff > normal.riff);
  assert.deepEqual(
    { backing: arp.backing, lead: arp.lead, arp: arp.arp, riff: arp.riff },
    { backing: 0.1, lead: 0, arp: 1.65, riff: 0 },
  );
  assert.deepEqual(
    { backing: riff.backing, lead: riff.lead, arp: riff.arp, riff: riff.riff },
    { backing: 0.1, lead: 0, arp: 0, riff: 2.25 },
  );
});

test("arp direction and pattern rotation produce bounded distinct sequences", () => {
  assert.deepEqual(rotatePatternSteps([0, 8, 16, 24], 3), [3, 11, 19, 27]);
  assert.deepEqual(
    Array.from({ length: 7 }, (_, index) => orderedDegreeIndex("up", index, 4)),
    [0, 1, 2, 3, 0, 1, 2],
  );
  assert.deepEqual(
    Array.from({ length: 7 }, (_, index) => orderedDegreeIndex("down", index, 4)),
    [3, 2, 1, 0, 3, 2, 1],
  );
  assert.deepEqual(
    Array.from({ length: 7 }, (_, index) => orderedDegreeIndex("upDown", index, 4)),
    [0, 1, 2, 3, 2, 1, 0],
  );
});

test("filter automation modes move independently while remaining bounded", () => {
  const modes = ["none", "slow-open", "slow-close", "rhythmic-8n"];
  const signatures = new Set(modes.map((mode) => (
    Array.from({ length: 32 }, (_, step) => (
      filterAutomationMultiplier(mode, step, 2).toFixed(3)
    )).join(":")
  )));
  assert.equal(signatures.size, modes.length);
  for (const mode of modes) {
    for (let step = 0; step < 32; step += 1) {
      const value = filterAutomationMultiplier(mode, step, 2);
      assert.ok(value >= 0.72 && value <= 1.22);
    }
  }
});

test("every scene generates sparse scale-safe Ghost Circuit riffs", () => {
  for (const [state, score] of Object.entries(SCORE_STATES)) {
    for (const seed of ["0000", "7F3A", "A71A5", "FFFFFFFF"]) {
      const performance = createPerformanceArrangement(seed, state);
      const events = Array.from({ length: 32 }, (_, step) => (
        ghostRiffEventForStep(state, score.scale, step, 4, performance)
      )).filter(Boolean);
      assert.ok(events.length >= (state === "unknown" ? 4 : 7));
      assert.ok(events.length <= 12);
      assert.ok(events.every((event) => event.midi >= RIFF_ROOT_MIDI));
      assert.ok(events.every((event) => event.midi <= RIFF_MAX_MIDI));
      assert.ok(events.every((event) => event.velocity > 0 && event.velocity <= 0.56));
      assert.ok(events.every((event) => ["32n", "16n", "8n"].includes(event.duration)));
    }
  }
});

test("riff note velocity is not attenuated a second time by arrangement phase", () => {
  const state = "healthy";
  const score = SCORE_STATES[state];
  const performance = createPerformanceArrangement("A71A5", state);
  const phaseVelocities = new Map();
  for (let phrase = 0; phrase < 8; phrase += 1) {
    const phase = arrangementPhaseForPhrase(state, phrase, performance).name;
    const event = Array.from({ length: 32 }, (_, step) => (
      ghostRiffEventForStep(state, score.scale, step, phrase, performance)
    )).find(Boolean);
    if (event) phaseVelocities.set(phase, event.velocity);
  }
  assert.equal(phaseVelocities.has("boot"), false);
  assert.ok(phaseVelocities.has("drive"));
  assert.ok(phaseVelocities.has("lift"));
  assert.ok(phaseVelocities.has("drop"));
  assert.equal(new Set(phaseVelocities.values()).size, 1);
});

test("transition ear candy is quantised and has an eight-phrase cooldown", () => {
  const performance = { sectionVariant: 0 };
  const tapeStops = [];
  for (let phrase = 0; phrase < 24; phrase += 1) {
    for (let step = 0; step < 32; step += 1) {
      const accent = transitionAccentForStep("healthy", phrase, step, performance);
      if (accent?.id === "fx-tapestop") tapeStops.push([phrase, step]);
    }
  }
  assert.deepEqual(tapeStops, [[6, 30], [14, 30], [22, 30]]);
});
