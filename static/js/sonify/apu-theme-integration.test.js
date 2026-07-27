import assert from "node:assert/strict";
import test from "node:test";

import {
  arrangementForPhrase,
  resetApuThemeIntegration,
} from "./apu-arranger.js";
import {
  primaryPulseEventForTrackStep,
  secondaryPulseEventForTrackStep,
} from "./apu-track-sequencer.js";
import { createScoreTraceEntry } from "./apu-score-trace.js";

const directorPlan = Object.freeze({
  phase: "develop",
  energy: 0.5,
  intent: Object.freeze({ pressure: 0.35, confidence: 0.9, intensity: 0.5 }),
});

function frame(state = "healthy") {
  const scales = {
    healthy: [0, 2, 3, 5, 7, 8, 10],
    warning: [0, 1, 3, 5, 7, 8, 10],
    critical: [0, 1, 4, 5, 7, 8, 10],
    unknown: [0, 2, 5, 7, 10],
  };
  return {
    scoreState: state,
    bpm: 100,
    tension: state === "healthy" ? 0.25 : 0.7,
    scale: scales[state],
    evidenceMode: "fixture",
    stale: false,
    voices: [],
  };
}

function leadEvents(nextFrame, arrangement) {
  return Array.from({ length: 32 }, (_, step) => ({
    step,
    event: primaryPulseEventForTrackStep(nextFrame, arrangement, step),
  })).filter((item) => item.event);
}

test("arranger attaches one frozen song plan without replacing legacy form data", () => {
  resetApuThemeIntegration();
  const next = arrangementForPhrase(frame("healthy"), directorPlan, 3);
  assert.equal(next.section, "theme-a");
  assert.equal(next.songPlan.themeId, "ATLAS_THEME");
  assert.equal(next.themeMotif.themeId, "ATLAS_THEME");
  assert.equal(next.themeMotif.state, "healthy");
  assert.ok(next.motifDegrees.includes(6), "legacy chip-law motif remains available");
  assert.deepEqual(next.themeEventSteps, next.themeMotif.events.map((event) => event.step));
  assert.ok(Object.isFrozen(next));
  assert.ok(Object.isFrozen(next.songPlan));
  assert.ok(Object.isFrozen(next.themeMemory));
});

test("primary pulse consumes the approved theme events inside the existing sequencer", () => {
  resetApuThemeIntegration();
  const nextFrame = frame("healthy");
  const next = arrangementForPhrase(nextFrame, directorPlan, 3);
  const played = leadEvents(nextFrame, next);
  assert.ok(played.length >= 4);
  assert.ok(played.every(({ event }) => event.themeId === "ATLAS_THEME"));
  assert.ok(played.every(({ event }) => event.themeTransform === next.themeMotif.transform));
  assert.ok(played.some(({ step }) => step === next.themeMotif.events[0].step));
});

test("state treatments remain recognisably distinct in live event density", () => {
  resetApuThemeIntegration();
  const warningFrame = frame("warning");
  const warning = arrangementForPhrase(warningFrame, directorPlan, 3);
  const warningSteps = leadEvents(warningFrame, warning).map(({ step }) => step);
  assert.ok(warningSteps.some((step) => step % 2 === 1));

  resetApuThemeIntegration();
  const criticalFrame = frame("critical");
  const critical = arrangementForPhrase(criticalFrame, directorPlan, 3);
  assert.ok(primaryPulseEventForTrackStep(criticalFrame, critical, 4));
  assert.ok(secondaryPulseEventForTrackStep(criticalFrame, critical, 7));

  resetApuThemeIntegration();
  const unknownFrame = frame("unknown");
  const unknown = arrangementForPhrase(unknownFrame, directorPlan, 7);
  assert.ok(leadEvents(unknownFrame, unknown).length <= 2);
});

test("D2B score trace records the played theme authority deterministically", () => {
  resetApuThemeIntegration();
  const nextFrame = frame("warning");
  const next = arrangementForPhrase(nextFrame, directorPlan, 5);
  const input = {
    frame: nextFrame,
    directorPlan,
    performancePlan: { phase: "groove" },
    arrangement: next,
    ornaments: [],
  };
  const first = createScoreTraceEntry(input);
  const second = createScoreTraceEntry(input);
  assert.deepEqual(first, second);
  assert.equal(first.motifId, "ATLAS_THEME");
  assert.equal(first.motifSource, "apu-song-plan+apu-theme-grammar+apu-arranger");
  assert.equal(first.cycleRole, next.songPlan.cycleRole);
  assert.equal(first.phraseRole, next.songPlan.phraseRole);
  assert.equal(first.cadenceIntent, next.songPlan.cadenceIntent);
  assert.equal(first.themePlan.playedTransform, next.themeMotif.transform);
  assert.ok(first.decisionSources.includes("apu-theme-runtime"));
  assert.ok(Object.isFrozen(first.themePlan));
});
