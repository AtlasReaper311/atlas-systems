import assert from "node:assert/strict";
import test from "node:test";

import {
  modeSurfaceMatches,
  normalizePath,
  routeLabel,
} from "../system-symphony/system-symphony-navigation.js";

test("System Symphony route labels remain consistent across nested destinations", () => {
  assert.equal(routeLabel("/lab/system-symphony/"), "Instrument");
  assert.equal(routeLabel("/lab/system-symphony/roms/"), "ROM Library");
  assert.equal(routeLabel("/lab/system-symphony/build-log/"), "Build Log Synth");
  assert.equal(routeLabel("/lab/system-symphony/radio/"), "Signal Radio");
  assert.equal(routeLabel("/lab/system-symphony/replay/"), "Replay");
});

test("mode surface matching supports single and shared workspaces", () => {
  assert.equal(modeSurfaceMatches({ dataset: { modeSurface: "trace" } }, "trace"), true);
  assert.equal(modeSurfaceMatches({ dataset: { modeSurface: "trace replay" } }, "replay"), true);
  assert.equal(modeSurfaceMatches({ dataset: { modeSurface: "trace replay" } }, "play"), false);
});

test("navigation path normalization preserves root and adds trailing slashes", () => {
  assert.equal(normalizePath("/"), "/");
  assert.equal(normalizePath("/lab/system-symphony"), "/lab/system-symphony/");
});
