import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_THEME_RUNTIME_BUILD_ID,
  createApuThemeRuntime,
  themeEvidenceForFrame,
} from "./apu-theme-runtime.js";

function arrangement({
  phraseIndex = 0,
  state = "healthy",
  section = "intro",
  sectionLocalPhrase = 0,
} = {}) {
  return Object.freeze({
    phraseIndex,
    cycleNumber: Math.floor(phraseIndex / 16),
    cyclePhrase: phraseIndex % 16,
    section,
    sectionLocalPhrase,
    scoreState: state,
    directorPhase: "establish",
  });
}

function plan(runtime, options = {}) {
  const nextArrangement = arrangement(options);
  return runtime.planForArrangement({
    frame: {
      scoreState: options.state ?? "healthy",
      evidenceMode: options.evidenceMode ?? "fixture",
      stale: Boolean(options.stale),
      replayMovement: options.replayMovement ?? null,
    },
    directorPlan: { phase: "develop" },
    arrangement: nextArrangement,
  });
}

test("theme evidence remains evidence-led and serializable", () => {
  const evidence = themeEvidenceForFrame({
    scoreState: "healthy",
    evidenceMode: "replay",
    stale: false,
    replayMovement: { kind: "recovery", state: "healthy", fromEvidence: true },
  });
  assert.equal(evidence.mode, "replay");
  assert.equal(evidence.recoveryConfirmed, true);
  assert.equal(evidence.movement.kind, "recovery");
  assert.ok(Object.isFrozen(evidence));
});

test("runtime advances once for an unchanged phrase decision", () => {
  const runtime = createApuThemeRuntime({ seed: "D2B-RUNTIME-TEST" });
  const first = plan(runtime, { phraseIndex: 3, section: "theme-a" });
  const second = plan(runtime, { phraseIndex: 3, section: "theme-a" });
  assert.deepEqual(second, first);
  assert.equal(second.memory.revision, first.memory.revision);
  assert.equal(second.buildId, APU_THEME_RUNTIME_BUILD_ID);
  assert.equal(second.songPlan.themeId, "ATLAS_THEME");
  assert.ok(Object.isFrozen(second));
  assert.ok(Object.isFrozen(second.themeMotif));
});

test("same-phrase evidence changes create a new bounded decision", () => {
  const runtime = createApuThemeRuntime({ seed: "D2B-STATE-TEST", historyLimit: 4 });
  const warning = plan(runtime, { phraseIndex: 5, state: "warning", section: "variation" });
  const critical = plan(runtime, { phraseIndex: 5, state: "critical", section: "variation" });
  assert.equal(warning.songPlan.state, "warning");
  assert.equal(critical.songPlan.state, "critical");
  assert.ok(critical.memory.revision > warning.memory.revision);
  assert.equal(critical.songPlan.cadenceIntent, "interrupted");
  assert.ok(critical.memory.recentTransforms.length <= 4);
});

test("phrase rewind resets the live planner boundary", () => {
  const runtime = createApuThemeRuntime({ seed: "D2B-REWIND-TEST" });
  plan(runtime, { phraseIndex: 9, section: "build" });
  const rewound = plan(runtime, { phraseIndex: 2, section: "establish", sectionLocalPhrase: 1 });
  assert.equal(rewound.phraseIndex, 2);
  assert.equal(rewound.memory.revision, 1);
});

test("unknown and critical states cannot claim resolution", () => {
  const runtime = createApuThemeRuntime({ seed: "D2B-HONESTY-TEST" });
  const critical = plan(runtime, { phraseIndex: 11, state: "critical", section: "peak" });
  const unknown = plan(runtime, { phraseIndex: 15, state: "unknown", section: "breathe" });
  assert.equal(critical.songPlan.cadenceIntent, "interrupted");
  assert.equal(critical.songPlan.evidenceAuthority.resolutionPermitted, false);
  assert.equal(unknown.songPlan.cadenceIntent, "no-cadence");
  assert.equal(unknown.songPlan.evidenceAuthority.resolutionPermitted, false);
});

test("evidence-backed recovery restores the Explorer reprise", () => {
  const runtime = createApuThemeRuntime({ seed: "D2B-RECOVERY-TEST" });
  plan(runtime, { phraseIndex: 13, state: "critical", section: "release" });
  const recovery = plan(runtime, {
    phraseIndex: 14,
    state: "healthy",
    section: "recovery",
    replayMovement: { kind: "recovery", state: "healthy", fromEvidence: true },
  });
  assert.equal(recovery.songPlan.cadenceIntent, "recovery");
  assert.equal(recovery.songPlan.phraseRole, "reprise");
  assert.equal(recovery.themeMotif.transform, "reprise");
  assert.equal(recovery.themeMotif.events.at(-1).degree, 0);
});
