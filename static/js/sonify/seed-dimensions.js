/**
 * Orthogonal seeded dimensions for System SYMPHONY performances.
 *
 * Each labelled axis is derived independently, keeping replay deterministic
 * while avoiding one random choice accidentally coupling unrelated layers.
 */

import { stableHash } from "./mapping.js?v=20260720-system-symphony-loop-production-v2";

export const SEED_DIMENSIONS = Object.freeze({
  kickTimbre: 4,
  snareTimbre: 4,
  hatTimbre: 4,
  metalTimbre: 4,
  bassTimbre: 4,
  bassLoopTimbre: 4,
  leadTimbre: 6,
  atmosphereTimbre: 3,
  hatDensity: 3,
  bassOctaveOffset: 3,
  padVoicing: 4,
  filterAutomation: 4,
  arpDirection: 4,
  patternRotation: 8,
  tempoNudge: 4,
  sectionVariant: 4,
  leadSliceVariant: 4,
  bassLoopSliceVariant: 4,
  chordOffset: 4,
  chordProgression: 4,
  bassPattern: 8,
  bassShift: 4,
  bassDegreeOffset: 4,
  phraseStride: 3,
  melodyOffset: 4,
  riffPattern: 8,
  riffContour: 4,
  riffTimbre: 3,
  arpOctaveSpan: 2,
  arpGate: 4,
});

export const HAT_DENSITY_MAP = Object.freeze(["sparse", "standard", "dense"]);
export const BASS_OCTAVE_OFFSET_MAP = Object.freeze([-12, 0, 12]);
export const PAD_VOICING_MAP = Object.freeze(["triad", "sus2", "sus4", "quartal"]);
export const FILTER_AUTOMATION_MAP = Object.freeze([
  "none",
  "slow-open",
  "slow-close",
  "rhythmic-8n",
]);
export const ARP_DIRECTION_MAP = Object.freeze(["up", "down", "upDown", "seeded"]);
export const TEMPO_NUDGE_MAP = Object.freeze([-2, 0, 2, 4]);

function dimensionValue(seed, label, cardinality) {
  return stableHash(`${seed}:${label}`) % cardinality;
}

export function deriveDimensions(seed) {
  const source = String(seed ?? "live");
  const raw = Object.fromEntries(
    Object.entries(SEED_DIMENSIONS).map(([label, cardinality]) => [
      label,
      dimensionValue(source, label, cardinality),
    ]),
  );
  return Object.freeze({
    ...raw,
    hatDensityLabel: HAT_DENSITY_MAP[raw.hatDensity],
    bassOctaveShift: BASS_OCTAVE_OFFSET_MAP[raw.bassOctaveOffset],
    padVoicingLabel: PAD_VOICING_MAP[raw.padVoicing],
    filterAutomationLabel: FILTER_AUTOMATION_MAP[raw.filterAutomation],
    arpDirectionLabel: ARP_DIRECTION_MAP[raw.arpDirection],
    tempoNudgeBpm: TEMPO_NUDGE_MAP[raw.tempoNudge],
    seedSource: source,
  });
}

export function dimensionDelta(performanceA, performanceB) {
  if (!performanceA || !performanceB) return 0;
  return Object.keys(SEED_DIMENSIONS).filter(
    (label) => performanceA[label] !== performanceB[label],
  ).length;
}
