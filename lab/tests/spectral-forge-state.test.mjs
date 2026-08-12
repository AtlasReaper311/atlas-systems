import assert from "node:assert/strict";
import test from "node:test";

import { BUILT_IN_PRESETS, createFrame, fingerprintMappings } from "../../static/js/spectral-forge/domain.js";
import {
  applyPresetToCandidate,
  audibleOutputs,
  captureBaseline,
  copyBaselineToCandidate,
  createComparisonState,
  createUserPreset,
  parsePreferences,
  serialisePreferences,
  setActiveVariant,
  setAuditionMode,
  updateCandidateMapping,
} from "../../static/js/spectral-forge/state.js";

test("baseline is immutable while candidate edits", () => {
  const initial = createComparisonState();
  const baselineFingerprint = initial.baselineFingerprint;
  const selected = initial.candidate[0];
  const edited = updateCandidateMapping(initial, selected.id, { outputMax: selected.outputMax - 0.2 });
  assert.equal(edited.baselineFingerprint, baselineFingerprint);
  assert.equal(fingerprintMappings(edited.baseline), baselineFingerprint);
  assert.notEqual(edited.candidateFingerprint, baselineFingerprint);
  assert.equal(edited.activeVariant, "B");
});

test("capture baseline is explicit and updates only from candidate", () => {
  const initial = createComparisonState();
  const selected = initial.candidate[0];
  const edited = updateCandidateMapping(initial, selected.id, { outputMax: selected.outputMax - 0.2 });
  const captured = captureBaseline(edited);
  assert.equal(captured.baselineFingerprint, edited.candidateFingerprint);
  assert.equal(captured.activeVariant, "A");
});

test("copy baseline to candidate restores deterministic comparison state", () => {
  const initial = createComparisonState();
  const edited = updateCandidateMapping(initial, initial.candidate[0].id, { outputMin: 0.5 });
  const restored = copyBaselineToCandidate(edited);
  assert.equal(restored.baselineFingerprint, restored.candidateFingerprint);
  assert.equal(restored.activeVariant, "B");
});

test("A and B consume identical telemetry frames", () => {
  const state = createComparisonState();
  const frame = createFrame("cache", 31.2);
  const a = audibleOutputs(frame, setActiveVariant(state, "A"));
  const b = audibleOutputs(frame, setActiveVariant(state, "B"));
  assert.deepEqual(a, b);
});

test("route focus keeps baseline context and only substitutes selected target", () => {
  const initial = createComparisonState();
  const selected = initial.candidate[0];
  const edited = updateCandidateMapping(initial, selected.id, { outputMax: selected.outputMax - 1 });
  const state = setAuditionMode(edited, "ROUTE_FOCUS");
  const frame = createFrame("traffic", 25);
  const focused = audibleOutputs(frame, state);
  const baseline = audibleOutputs(frame, setAuditionMode(setActiveVariant(state, "A"), "FULL"));
  const candidate = audibleOutputs(frame, setAuditionMode(setActiveVariant(state, "B"), "FULL"));
  for (const [target, value] of Object.entries(focused)) {
    assert.equal(value, target === selected.target ? candidate[target] : baseline[target], target);
  }
});

test("built-in preset loads into candidate without changing baseline", () => {
  const initial = createComparisonState();
  const next = applyPresetToCandidate(initial, BUILT_IN_PRESETS[1]);
  assert.equal(next.baselineFingerprint, initial.baselineFingerprint);
  assert.notEqual(next.candidateFingerprint, initial.candidateFingerprint);
  assert.equal(next.activeVariant, "B");
});

test("preferences round-trip only validated user presets", () => {
  const preset = createUserPreset("My map", BUILT_IN_PRESETS[0].mappings);
  const raw = serialisePreferences({ userPresets: [preset], presetId: preset.id, depth: "FORGE", masterLevel: 0.56 });
  const parsed = parsePreferences(raw);
  assert.equal(parsed.userPresets.length, 1);
  assert.equal(parsed.presetId, preset.id);
  assert.equal(parsed.depth, "FORGE");
  assert.equal(parsed.masterLevel, 0.56);
});
