"use strict";

import {
  BUILT_IN_PRESETS,
  TARGET_BY_ID,
  cloneMappings,
  createMapping,
  fingerprintMappings,
  mappingOutputs,
  validatePreset,
} from "./domain.js";

export const STORAGE_KEY = "atlas-spectral-forge:v3";
export const AUDITION_MODES = Object.freeze(["FULL", "ROUTE_FOCUS"]);
export const USER_PRESET_LIMIT = 12;
export const USER_PRESET_NAME_MAX = 48;

export function createComparisonState(mappings = BUILT_IN_PRESETS[0].mappings) {
  const baseline = cloneMappings(mappings);
  const candidate = cloneMappings(mappings);
  return {
    baseline,
    candidate,
    activeVariant: "A",
    selectedMappingId: candidate[0]?.id ?? "",
    auditionMode: "FULL",
    baselineFingerprint: fingerprintMappings(baseline),
    candidateFingerprint: fingerprintMappings(candidate),
  };
}

export function captureBaseline(state) {
  const baseline = cloneMappings(state.candidate);
  return {
    ...state,
    baseline,
    baselineFingerprint: fingerprintMappings(baseline),
    activeVariant: "A",
    auditionMode: "FULL",
  };
}

export function copyBaselineToCandidate(state) {
  const candidate = cloneMappings(state.baseline);
  return {
    ...state,
    candidate,
    candidateFingerprint: fingerprintMappings(candidate),
    activeVariant: "B",
    selectedMappingId: candidate.find((mapping) => mapping.id === state.selectedMappingId)?.id ?? candidate[0]?.id ?? "",
  };
}

export function setActiveVariant(state, variant) {
  if (variant !== "A" && variant !== "B") throw new TypeError(`Unknown mapping variant: ${variant}`);
  return { ...state, activeVariant: variant };
}

export function activeMappings(state) {
  return state.activeVariant === "A" ? state.baseline : state.candidate;
}

export function updateCandidateMapping(state, mappingId, patch) {
  const candidate = state.candidate.map((mapping) => {
    if (mapping.id !== mappingId) return mapping;
    const next = { ...mapping, ...patch };
    return createMapping(next);
  });
  const presetCheck = validatePreset({ id: "candidate", name: "candidate", builtIn: false, mappings: candidate });
  if (!presetCheck.valid) throw new TypeError(presetCheck.errors.join("; "));
  return {
    ...state,
    candidate,
    candidateFingerprint: fingerprintMappings(candidate),
    activeVariant: "B",
    selectedMappingId: mappingId,
  };
}

export function createCandidateRoute(state, source, target) {
  const definition = TARGET_BY_ID[target];
  if (!definition) throw new TypeError(`Unknown target: ${target}`);
  const withoutTarget = state.candidate.filter((mapping) => mapping.target !== target);
  const sequence = withoutTarget.filter((mapping) => mapping.id.startsWith(`route-${source}-${target}-`)).length + 1;
  const route = createMapping({
    id: `route-${source}-${target}-${sequence}`,
    source,
    target,
    outputMin: definition.min,
    outputMax: definition.max,
  });
  const candidate = [...withoutTarget, route];
  return {
    ...state,
    candidate,
    candidateFingerprint: fingerprintMappings(candidate),
    activeVariant: "B",
    selectedMappingId: route.id,
  };
}

export function removeCandidateRoute(state, mappingId) {
  const candidate = state.candidate.filter((mapping) => mapping.id !== mappingId);
  return {
    ...state,
    candidate,
    candidateFingerprint: fingerprintMappings(candidate),
    activeVariant: "B",
    selectedMappingId: candidate[0]?.id ?? "",
    auditionMode: candidate.length ? state.auditionMode : "FULL",
  };
}

export function setAuditionMode(state, mode) {
  if (!AUDITION_MODES.includes(mode)) throw new TypeError(`Unknown audition mode: ${mode}`);
  return { ...state, auditionMode: mode };
}

export function selectedMapping(state) {
  const mappings = activeMappings(state);
  return mappings.find((mapping) => mapping.id === state.selectedMappingId) ?? mappings[0] ?? null;
}

function smoothingByTarget(mappings) {
  return Object.fromEntries(
    mappings
      .filter((mapping) => mapping.enabled)
      .map((mapping) => [mapping.target, mapping.smoothing]),
  );
}

export function audibleOutputs(frame, state) {
  const active = activeMappings(state);
  const outputs = mappingOutputs(frame, active);
  if (state.auditionMode !== "ROUTE_FOCUS") return outputs;
  const selected = selectedMapping(state);
  const reference = { ...mappingOutputs(frame, state.baseline) };
  if (!selected || !selected.enabled) return Object.freeze(reference);
  reference[selected.target] = outputs[selected.target];
  return Object.freeze(reference);
}

export function audibleSmoothing(state) {
  const active = activeMappings(state);
  if (state.auditionMode !== "ROUTE_FOCUS") return Object.freeze(smoothingByTarget(active));
  const selected = selectedMapping(state);
  const reference = smoothingByTarget(state.baseline);
  if (!selected || !selected.enabled) return Object.freeze(reference);
  reference[selected.target] = selected.smoothing;
  return Object.freeze(reference);
}

export function applyPresetToCandidate(state, preset) {
  const validation = validatePreset(preset);
  if (!validation.valid) throw new TypeError(validation.errors.join("; "));
  const candidate = cloneMappings(preset.mappings);
  return {
    ...state,
    candidate,
    candidateFingerprint: fingerprintMappings(candidate),
    activeVariant: "B",
    selectedMappingId: candidate[0]?.id ?? "",
    auditionMode: "FULL",
  };
}

export function createUserPreset(name, mappings, id = null) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) throw new TypeError("Preset name is required");
  if (trimmed.length > USER_PRESET_NAME_MAX) throw new TypeError(`Preset name must be ${USER_PRESET_NAME_MAX} characters or fewer`);
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "preset";
  const preset = { id: id ?? `user-${slug}`, name: trimmed.toUpperCase(), builtIn: false, mappings: cloneMappings(mappings) };
  validatePreset(preset, { throwOnError: true });
  return preset;
}

export function serialisePreferences({ userPresets, presetId, depth, masterLevel }) {
  const safePresets = (Array.isArray(userPresets) ? userPresets : [])
    .filter((preset) => !preset.builtIn && validatePreset(preset).valid)
    .slice(0, USER_PRESET_LIMIT);
  return JSON.stringify({ schema: 3, userPresets: safePresets, presetId: String(presetId || "reference"), depth: ["PLAY", "FORGE", "ANALYSE"].includes(depth) ? depth : "PLAY", masterLevel: Number.isFinite(masterLevel) ? masterLevel : null });
}

export function parsePreferences(raw) {
  if (!raw) return { userPresets: [], presetId: "reference", depth: "PLAY", masterLevel: null };
  const parsed = JSON.parse(raw);
  if (!parsed || parsed.schema !== 3) throw new TypeError("Unsupported Spectral Forge preference schema");
  const userPresets = Array.isArray(parsed.userPresets)
    ? parsed.userPresets.filter((preset) => !preset.builtIn && validatePreset(preset).valid).slice(0, USER_PRESET_LIMIT)
    : [];
  return {
    userPresets,
    presetId: typeof parsed.presetId === "string" ? parsed.presetId : "reference",
    depth: ["PLAY", "FORGE", "ANALYSE"].includes(parsed.depth) ? parsed.depth : "PLAY",
    masterLevel: Number.isFinite(parsed.masterLevel) ? parsed.masterLevel : null,
  };
}
