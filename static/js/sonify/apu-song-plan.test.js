import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  APU_PHRASE_ROLES,
  APU_THEME_TRANSFORMS,
  createSongPlanner,
  cycleRoleFor,
} from "./apu-song-plan.js";

const sections = [
  ["intro", 0], ["establish", 0], ["establish", 1], ["theme-a", 0],
  ["theme-a", 1], ["variation", 0], ["variation", 1], ["theme-b", 0],
  ["theme-b", 1], ["build", 0], ["build", 1], ["peak", 0],
  ["peak", 1], ["release", 0], ["recovery", 0], ["breathe", 0],
];

function input(index, overrides = {}) {
  const cyclePhrase = index % 16;
  const [section, sectionLocalPhrase] = sections[cyclePhrase];
  return {
    phraseIndex: index,
    cycleNumber: Math.floor(index / 16),
    cyclePhrase,
    section,
    sectionLocalPhrase,
    state: "healthy",
    evidence: { mode: "fixture", stale: false },
    compositionPhase: "develop",
    performancePhase: "groove",
    ...overrides,
  };
}

function journey(planner, length, overridesForIndex = null) {
  return Array.from({ length }, (_, index) => planner.advancePhrase({
    ...input(index),
    ...(overridesForIndex?.(index) ?? {}),
  }));
}

test("cycle roles follow statement, development, contrast, reprise development", () => {
  assert.deepEqual(Array.from({ length: 7 }, (_, index) => cycleRoleFor(index)), [
    "statement", "development", "contrast", "reprise", "development", "contrast", "reprise",
  ]);
});

test("identical journeys produce byte-equivalent plans and memory", () => {
  const left = createSongPlanner({ seed: "PASS-D1-DETERMINISM" });
  const right = createSongPlanner({ seed: "PASS-D1-DETERMINISM" });
  const leftPlans = journey(left, 48);
  const rightPlans = journey(right, 48);
  assert.deepEqual(leftPlans, rightPlans);
  assert.deepEqual(left.getMemory(), right.getMemory());
});

test("all phrases have explicit valid roles and deterministic signatures", () => {
  const plans = journey(createSongPlanner(), 64);
  assert.ok(plans.every((plan) => APU_PHRASE_ROLES.includes(plan.phraseRole)));
  assert.ok(plans.every((plan) => APU_THEME_TRANSFORMS.includes(plan.transform)));
  assert.ok(plans.every((plan) => /^[0-9a-f]{8}$/.test(plan.deterministicSignature)));
  assert.ok(plans.every(Object.isFrozen));
});

test("cycles remain related through one theme but do not repeat structurally", () => {
  const plans = journey(createSongPlanner(), 64);
  assert.deepEqual([...new Set(plans.map((plan) => plan.themeId))], ["ATLAS_THEME"]);
  const cycleSignatures = Array.from({ length: 4 }, (_, cycle) => plans
    .slice(cycle * 16, cycle * 16 + 16)
    .map((plan) => `${plan.phraseRole}:${plan.transform}:${plan.cycleRole}`)
    .join("|"));
  assert.equal(new Set(cycleSignatures).size, 4);
});

test("state changes preserve theme identity and apply distinct transformations", () => {
  const planner = createSongPlanner();
  const plans = [
    planner.advancePhrase(input(0, { state: "healthy" })),
    planner.advancePhrase(input(1, { state: "warning" })),
    planner.advancePhrase(input(2, { state: "critical" })),
    planner.advancePhrase(input(3, { state: "unknown", evidence: { mode: "fixture", stale: true } })),
  ];
  assert.deepEqual([...new Set(plans.map((plan) => plan.themeId))], ["ATLAS_THEME"]);
  assert.equal(new Set(plans.map((plan) => plan.themeState)).size, 4);
  assert.match(plans[3].themeState, /Lost Signal/);
  assert.ok(["outer-note-fragment", "augmentation", "retrograde-fragment", "inversion-lite"].includes(plans[3].transform));
});

test("critical and unknown cannot resolve or erase an unresolved question", () => {
  const planner = createSongPlanner();
  const critical = planner.advancePhrase(input(15, { state: "critical" }));
  const unknown = planner.advancePhrase(input(16, { state: "unknown", evidence: { mode: "fixture", stale: true } }));
  assert.equal(critical.evidenceAuthority.resolutionPermitted, false);
  assert.equal(unknown.evidenceAuthority.resolutionPermitted, false);
  assert.ok(!["resolved", "recovery"].includes(critical.cadenceIntent));
  assert.ok(!["resolved", "recovery"].includes(unknown.cadenceIntent));
  assert.ok(planner.getMemory().unresolvedQuestion);
});

test("confirmed recovery reprises the shared theme and clears the question", () => {
  const planner = createSongPlanner();
  planner.advancePhrase(input(0, { state: "critical" }));
  const recovery = planner.advancePhrase(input(14, {
    state: "healthy",
    section: "recovery",
    sectionLocalPhrase: 0,
    evidence: { mode: "replay", stale: false, recoveryConfirmed: true, movement: { kind: "recovery", fromEvidence: true } },
  }));
  assert.equal(recovery.themeId, "ATLAS_THEME");
  assert.equal(recovery.phraseRole, "reprise");
  assert.equal(recovery.transform, "reprise");
  assert.equal(recovery.cadenceIntent, "recovery");
  assert.equal(planner.getMemory().unresolvedQuestion, null);
  assert.equal(planner.getMemory().recoverySourceTheme.fromState, "critical");
});

test("recent transformations do not repeat mechanically", () => {
  const plans = journey(createSongPlanner(), 40);
  for (let index = 2; index < plans.length; index += 1) {
    const repeatedThree = plans[index].transform === plans[index - 1].transform
      && plans[index].transform === plans[index - 2].transform;
    assert.equal(repeatedThree, false, `three identical transforms at phrase ${index}`);
  }
});

test("reset reproduces the exact first plan", () => {
  const planner = createSongPlanner({ seed: "PASS-D1-RESET" });
  const first = planner.advancePhrase(input(0));
  planner.advancePhrase(input(1));
  planner.reset();
  assert.deepEqual(planner.advancePhrase(input(0)), first);
});

test("song-plan source contains no randomness, wall clock, or audio APIs", () => {
  const source = fs.readFileSync(new URL("./apu-song-plan.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Math\.random|Date\.now|AudioContext|OfflineAudioContext|Tone\./);
});
