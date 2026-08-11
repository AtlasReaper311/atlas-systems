/**
 * Atlas APU master stage profiles.
 *
 * Pure-data per-state DAC drive and 8-bit quantiser wet values consumed
 * by the master soft-clipper chain. Replaces the incorrect Pass C v1
 * import of a non-existent `masterStageProfileForState` from
 * `apu-soft-clipper.js` on PR #128.
 *
 * This module intentionally lives outside `apu-soft-clipper.js` so the
 * clipper primitives module stays a pure signal-processing library with
 * no per-state assumptions. State choreography belongs here.
 *
 * Drive controls how hard the tanh curve saturates. Values above 2.5
 * become audibly compressed and warm; 1.4 is transparent. Quantise wet
 * controls the amount of 8-bit lo-fi colour blended into the master.
 *
 * All values were tuned against the PR #128 clipper curve so that
 * healthy is transparent, warning is warm, critical is compressed, and
 * unknown is soft with more 8-bit colour to sound "distant".
 */

export const APU_MASTER_STAGE_PROFILES_BUILD_ID = "20260727-apu-master-stage-profiles-v1";

const clamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  if (numeric < minimum) return minimum;
  if (numeric > maximum) return maximum;
  return numeric;
};

const DRIVE_MIN = 0.5;
const DRIVE_MAX = 3.0;
const WET_MIN = 0.0;
const WET_MAX = 0.35;

export const APU_MASTER_STAGE_PROFILES = Object.freeze({
  healthy:  Object.freeze({ drive: 1.35, quantiseWet: 0.06, label: "transparent" }),
  warning:  Object.freeze({ drive: 1.75, quantiseWet: 0.10, label: "warm" }),
  critical: Object.freeze({ drive: 2.25, quantiseWet: 0.15, label: "compressed" }),
  unknown:  Object.freeze({ drive: 1.10, quantiseWet: 0.18, label: "distant" }),
});

export function masterStageProfileForState(state) {
  const raw = APU_MASTER_STAGE_PROFILES[state] ?? APU_MASTER_STAGE_PROFILES.unknown;
  return Object.freeze({
    drive: clamp(raw.drive, DRIVE_MIN, DRIVE_MAX),
    quantiseWet: clamp(raw.quantiseWet, WET_MIN, WET_MAX),
    label: raw.label,
  });
}

export function masterStageProfileSafetyEnvelope() {
  return Object.freeze({
    driveMin: DRIVE_MIN,
    driveMax: DRIVE_MAX,
    wetMin: WET_MIN,
    wetMax: WET_MAX,
  });
}
