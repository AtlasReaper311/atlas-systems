import assert from "node:assert/strict";
import test from "node:test";

import {
  HEALTH_VISUAL_PROFILES,
  healthVisualProfile,
} from "../../static/js/spectral-forge/visuals.js";

test("health visual profiles make failure structurally less coherent than stable state", () => {
  const stable = HEALTH_VISUAL_PROFILES.STABLE;
  const pressured = HEALTH_VISUAL_PROFILES.PRESSURED;
  const degraded = HEALTH_VISUAL_PROFILES.DEGRADED;
  const failed = HEALTH_VISUAL_PROFILES.FAILED;
  assert.ok(pressured.widthScale <= stable.widthScale);
  assert.ok(degraded.widthScale < pressured.widthScale);
  assert.ok(failed.widthScale < degraded.widthScale);
  assert.ok(failed.coherenceScale < degraded.coherenceScale);
  assert.ok(degraded.coherenceScale < stable.coherenceScale);
  assert.ok(failed.asymmetryBias > degraded.asymmetryBias);
  assert.ok(failed.fractureScale > degraded.fractureScale);
  assert.ok(failed.heightScale > stable.heightScale);
});

test("health visual profiles remain finite and bounded", () => {
  for (const [health, profile] of Object.entries(HEALTH_VISUAL_PROFILES)) {
    for (const [key, value] of Object.entries(profile)) {
      assert.equal(Number.isFinite(value), true, `${health}/${key}`);
      assert.ok(value >= 0 && value <= 1.5, `${health}/${key} bounded`);
    }
  }
  assert.equal(healthVisualProfile("UNKNOWN"), HEALTH_VISUAL_PROFILES.STABLE);
});
