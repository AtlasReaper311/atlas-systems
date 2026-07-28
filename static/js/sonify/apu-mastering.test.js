import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_MASTERING_BROWSER_CALIBRATION_DB,
  APU_MASTERING_DEFAULT_USER_GAIN,
  APU_MASTERING_LIMITER_CEILING_DB,
  APU_MASTERING_MAX_ESTIMATED_TRUE_PEAK_DBTP,
  APU_MASTERING_PROFILES,
  isWithinMasteringTarget,
  masteringProfileForState,
  masteringTargetWindow,
} from "./apu-mastering.js";

test("mastering policy applies the measured browser calibration without burying Lost Signal", () => {
  assert.equal(APU_MASTERING_DEFAULT_USER_GAIN, 0.62);
  assert.equal(APU_MASTERING_LIMITER_CEILING_DB, -2.2);
  assert.equal(APU_MASTERING_BROWSER_CALIBRATION_DB, 6);
  assert.ok(APU_MASTERING_MAX_ESTIMATED_TRUE_PEAK_DBTP <= -2);

  assert.equal(APU_MASTERING_PROFILES.healthy.masterGainDb, 4);
  assert.equal(APU_MASTERING_PROFILES.warning.masterGainDb, 4);
  assert.equal(APU_MASTERING_PROFILES.critical.masterGainDb, 4);
  assert.equal(APU_MASTERING_PROFILES.unknown.masterGainDb, 4);
  assert.equal(APU_MASTERING_PROFILES.unknown.targetIntegratedLufs, -24);
  assert.equal(APU_MASTERING_PROFILES.unknown.toleranceDb, 3);
  assert.ok(APU_MASTERING_PROFILES.unknown.programmeTrimDb > APU_MASTERING_PROFILES.healthy.programmeTrimDb);
});

test("programme trims reconcile exactly with the original state gains", () => {
  for (const profile of Object.values(APU_MASTERING_PROFILES)) {
    assert.equal(profile.baseGainDb + profile.programmeTrimDb, profile.masterGainDb);
  }
});

test("target windows remain state-specific and deterministic", () => {
  assert.deepEqual(masteringTargetWindow("healthy"), { minimumLufs: -26, maximumLufs: -18 });
  assert.deepEqual(masteringTargetWindow("critical"), { minimumLufs: -23, maximumLufs: -15 });
  assert.deepEqual(masteringTargetWindow("unknown"), { minimumLufs: -27, maximumLufs: -21 });
  assert.equal(isWithinMasteringTarget("healthy", -22), true);
  assert.equal(isWithinMasteringTarget("healthy", -30), false);
  assert.equal(isWithinMasteringTarget("unknown", -24), true);
  assert.equal(isWithinMasteringTarget("unknown", -30), false);
});

test("unknown remains the safe fallback profile", () => {
  assert.equal(masteringProfileForState("missing"), APU_MASTERING_PROFILES.unknown);
});
