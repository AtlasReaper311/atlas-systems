import assert from "node:assert/strict";
import test from "node:test";

import { BUILT_IN_PRESETS, createFrame, fingerprintMappings } from "../../static/js/spectral-forge/domain.js";
import {
  USER_PRESET_LIMIT,
  USER_PRESET_NAME_MAX,
  applyPresetToCandidate,
  audibleOutputs,
  audibleSmoothing,
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

test("route focus preserves baseline smoothing outside the selected target", () => {
  const initial = createComparisonState();
  const selected = initial.candidate[0];
  const other = initial.candidate[1];
  let edited = updateCandidateMapping(initial, selected.id, { smoothing: "FAST" });
  edited = updateCandidateMapping(edited, other.id, { smoothing: "IMMEDIATE" });
  const state = setAuditionMode({ ...edited, selectedMappingId: selected.id }, "ROUTE_FOCUS");
  const smoothing = audibleSmoothing(state);
  const baselineSmoothing = audibleSmoothing(setAuditionMode(setActiveVariant(state, "A"), "FULL"));
  assert.equal(smoothing[selected.target], "FAST");
  assert.equal(smoothing[other.target], baselineSmoothing[other.target]);
});

test("route focus with a bypassed selected route falls back to baseline values and smoothing", () => {
  const initial = createComparisonState();
  const selected = initial.candidate[0];
  const bypassed = setAuditionMode(updateCandidateMapping(initial, selected.id, { enabled: false, smoothing: "FAST" }), "ROUTE_FOCUS");
  const frame = createFrame("traffic", 25);
  const focused = audibleOutputs(frame, bypassed);
  const focusedSmoothing = audibleSmoothing(bypassed);
  const baselineState = setAuditionMode(setActiveVariant(bypassed, "A"), "FULL");
  assert.deepEqual(focused, audibleOutputs(frame, baselineState));
  assert.deepEqual(focusedSmoothing, audibleSmoothing(baselineState));
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

test("user preset persistence is bounded by count and name length", () => {
  assert.throws(
    () => createUserPreset("x".repeat(USER_PRESET_NAME_MAX + 1), BUILT_IN_PRESETS[0].mappings),
    new RegExp(`${USER_PRESET_NAME_MAX} characters or fewer`),
  );
  const presets = Array.from({ length: USER_PRESET_LIMIT + 4 }, (_, index) => (
    createUserPreset(`Map ${index + 1}`, BUILT_IN_PRESETS[0].mappings, `user-${index + 1}`)
  ));
  const raw = serialisePreferences({ userPresets: presets, presetId: presets[0].id, depth: "PLAY", masterLevel: 0.56 });
  assert.equal(parsePreferences(raw).userPresets.length, USER_PRESET_LIMIT);
});
