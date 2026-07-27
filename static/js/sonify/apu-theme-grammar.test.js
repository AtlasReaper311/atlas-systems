import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ATLAS_THEME_GENOME,
  motifMidiEventsForPlan,
  themeMotifForPlan,
} from "./apu-theme-grammar.js";

const STATE_SCALE = Object.freeze({
  healthy: Object.freeze([0, 2, 3, 5, 7, 9, 10]),
  warning: Object.freeze([0, 1, 3, 5, 7, 8, 10]),
  critical: Object.freeze([0, 1, 4, 5, 7, 8, 10]),
  unknown: Object.freeze([0, 2, 5, 7, 10]),
});

function planFor(state, overrides = {}) {
  const cycleNumber = overrides.cycleNumber ?? 0;
  const section = overrides.section ?? "establish";
  const phraseRole = overrides.phraseRole
    ?? (section === "recovery" ? "reprise" : section === "breathe" ? "cadence" : cycleNumber === 0 ? "statement" : "development");
  return Object.freeze({
    themeId: "ATLAS_THEME",
    phraseIndex: overrides.phraseIndex ?? 1,
    cycleNumber,
    cycleRole: overrides.cycleRole ?? (cycleNumber === 0 ? "statement" : "development"),
    phraseRole,
    state,
    section,
    transform: overrides.transform ?? (cycleNumber === 0 ? "identity" : "rotation"),
    cadenceIntent: overrides.recoveryConfirmed ? "recovery" : state === "critical" ? "interrupted" : state === "unknown" ? "no-cadence" : state === "warning" ? "open" : "open",
  });
}

test("shared grammar is deterministic and deeply frozen", () => {
  const plan = planFor("healthy");
  const first = themeMotifForPlan(plan);
  const second = themeMotifForPlan(plan);
  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.events));
  assert.ok(Object.isFrozen(first.events[0]));
});

test("every state derives from ATLAS_THEME and preserves an anchor", () => {
  for (const state of Object.keys(STATE_SCALE)) {
    const motif = themeMotifForPlan(planFor(state));
    assert.equal(motif.themeId, ATLAS_THEME_GENOME.themeId);
    assert.ok(motif.preservedAnchors.length >= 1, state);
    assert.ok(motif.events.length >= 4, state);
  }
});

test("Explorer states the complete singable genome and returns home", () => {
  const motif = themeMotifForPlan(planFor("healthy"));
  assert.equal(motif.events.length, ATLAS_THEME_GENOME.degrees.length);
  assert.equal(motif.events[0].degree, 0);
  assert.equal(motif.events.at(-1).degree, 0);
  assert.deepEqual(motif.preservedAnchors, [0, 4, 7]);
});

test("Grid Pressure keeps the theme but displaces rhythm and withholds home", () => {
  const motif = themeMotifForPlan(planFor("warning"));
  assert.equal(motif.events.length, ATLAS_THEME_GENOME.degrees.length);
  assert.equal(motif.events[0].degree, 0);
  assert.notEqual(motif.events.at(-1).degree, 0);
  assert.ok(motif.events.some((event, index) => event.step !== ATLAS_THEME_GENOME.steps[index]));
  assert.ok(motif.echoEvents.length > 0);
});

test("Boss Protocol compresses the theme to bounded root and fifth cells", () => {
  const motif = themeMotifForPlan(planFor("critical", { section: "peak", cyclePhrase: 11 }));
  assert.ok(motif.events.length >= 5);
  assert.ok(motif.events.every((event) => [0, 4].includes(event.degree)));
  assert.equal(motif.events[0].degree, 0);
  assert.notEqual(motif.events.at(-1).degree, 0);
});

test("Lost Signal remains sparse, attributable, and echoed", () => {
  const motif = themeMotifForPlan(planFor("unknown", { section: "breathe", cyclePhrase: 15 }));
  assert.equal(motif.events.length, 4);
  assert.ok(motif.echoEvents.length >= 2);
  assert.ok(motif.preservedAnchors.includes(0));
  assert.notEqual(motif.events.at(-1).degree, 0);
});

test("recovery reprise restores a complete resolving phrase", () => {
  const motif = themeMotifForPlan(planFor("healthy", {
    phraseIndex: 14,
    cyclePhrase: 14,
    section: "recovery",
    recoveryConfirmed: true,
  }));
  assert.equal(motif.phraseRole, "reprise");
  assert.equal(motif.events.length, ATLAS_THEME_GENOME.degrees.length);
  assert.equal(motif.events.at(-1).degree, 0);
});

test("all emitted MIDI events stay inside each state register", () => {
  for (const [state, scale] of Object.entries(STATE_SCALE)) {
    const motif = motifMidiEventsForPlan(planFor(state), scale);
    for (const event of [...motif.events, ...motif.echoEvents]) {
      assert.ok(event.midi >= motif.register.minimum, `${state}:${event.midi}`);
      assert.ok(event.midi <= motif.register.maximum, `${state}:${event.midi}`);
      assert.ok(event.step >= 0 && event.step < 32, `${state}:${event.step}`);
    }
  }
});

test("cycle development changes transformation without changing theme identity", () => {
  const statement = themeMotifForPlan(planFor("healthy", { phraseIndex: 1, cycleNumber: 0 }));
  const development = themeMotifForPlan(planFor("healthy", { phraseIndex: 17, cycleNumber: 1 }));
  assert.equal(statement.themeId, development.themeId);
  assert.notEqual(statement.transform, development.transform);
  assert.notDeepEqual(statement.events.map((event) => event.degree), development.events.map((event) => event.degree));
});

test("statement role protects the recognisable identity from an over-eager transform", () => {
  const motif = themeMotifForPlan(planFor("healthy", { transform: "expansion" }));
  assert.equal(motif.requestedTransform, "expansion");
  assert.equal(motif.transform, "identity");
  assert.deepEqual(motif.events.map((event) => event.degree), ATLAS_THEME_GENOME.degrees);
});

test("a foreign theme identity is rejected", () => {
  assert.throws(
    () => themeMotifForPlan({ ...planFor("healthy"), themeId: "UNRELATED_THEME" }),
    /must use ATLAS_THEME/,
  );
});

test("theme grammar remains pure data and sample free", () => {
  const source = readFileSync(new URL("./apu-theme-grammar.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Math\.random/);
  assert.doesNotMatch(source, /Date\.now/);
  assert.doesNotMatch(source, /Tone\./);
  assert.doesNotMatch(source, /Sampler|Player|GrainPlayer/);
});
