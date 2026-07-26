export const APU_MASTERING_BUILD_ID = "20260726-system-symphony-mastering-v1";
export const APU_MASTERING_DEFAULT_USER_GAIN = 0.7;
export const APU_MASTERING_LIMITER_CEILING_DB = -1;
export const APU_MASTERING_MAX_ESTIMATED_TRUE_PEAK_DBTP = -0.8;

const freezeProfile = (profile) => Object.freeze({ ...profile });

export const APU_MASTERING_PROFILES = Object.freeze({
  healthy: freezeProfile({
    state: "healthy",
    label: "Explorer master",
    baseGainDb: -10,
    programmeTrimDb: 8,
    masterGainDb: -2,
    targetIntegratedLufs: -22,
    toleranceDb: 4,
  }),
  warning: freezeProfile({
    state: "warning",
    label: "Grid Pressure master",
    baseGainDb: -10.5,
    programmeTrimDb: 8.5,
    masterGainDb: -2,
    targetIntegratedLufs: -21,
    toleranceDb: 4,
  }),
  critical: freezeProfile({
    state: "critical",
    label: "Boss Protocol master",
    baseGainDb: -11,
    programmeTrimDb: 9,
    masterGainDb: -2,
    targetIntegratedLufs: -19,
    toleranceDb: 4,
  }),
  unknown: freezeProfile({
    state: "unknown",
    label: "Lost Signal master",
    baseGainDb: -18,
    programmeTrimDb: 7,
    masterGainDb: -11,
    targetIntegratedLufs: -27,
    toleranceDb: 5,
  }),
});

export function masteringProfileForState(state) {
  return APU_MASTERING_PROFILES[state] ?? APU_MASTERING_PROFILES.unknown;
}

export function masteringTargetWindow(state) {
  const profile = masteringProfileForState(state);
  return Object.freeze({
    minimumLufs: profile.targetIntegratedLufs - profile.toleranceDb,
    maximumLufs: profile.targetIntegratedLufs + profile.toleranceDb,
  });
}

export function isWithinMasteringTarget(state, integratedLufs) {
  if (!Number.isFinite(integratedLufs)) return false;
  const window = masteringTargetWindow(state);
  return integratedLufs >= window.minimumLufs && integratedLufs <= window.maximumLufs;
}
