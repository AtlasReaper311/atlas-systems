import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  LIVE_STATE_TRANSITION_SECONDS,
  canCommitLiveFrameAtStep,
  liveStateConfirmationFrames,
} from "./engine.js";
import { SYSTEM_SYMPHONY_BUILD_ID as LIVE_APU_BUILD_ID } from "./apu-production-engine.js";
import { resolveSamplePalette } from "./samples.js";

test("live state changes require persistence before harmonic state replacement", () => {
  assert.equal(liveStateConfirmationFrames("healthy", "warning"), 2);
  assert.equal(liveStateConfirmationFrames("healthy", "critical"), 2);
  assert.equal(liveStateConfirmationFrames("healthy", "unknown"), 3);
  assert.equal(liveStateConfirmationFrames("critical", "healthy"), 3);
  assert.equal(LIVE_STATE_TRANSITION_SECONDS, 6);
});

test("live state changes commit only at phrase boundaries", () => {
  assert.equal(canCommitLiveFrameAtStep(8, "healthy", "critical"), false);
  assert.equal(canCommitLiveFrameAtStep(16, "healthy", "warning"), false);
  assert.equal(canCommitLiveFrameAtStep(0, "healthy", "critical"), true);
  assert.equal(canCommitLiveFrameAtStep(8, "warning", "warning"), true);
});

test("live telemetry palette keeps loop foundations while removing wobbly lead and AC-unit metal hits", () => {
  const performance = {
    liveDirected: true,
    bassLoopTimbre: 1,
    leadTimbre: 3,
    metalTimbre: 0,
    sectionVariant: 0,
  };
  for (let phrase = 0; phrase < 16; phrase += 1) {
    const palette = resolveSamplePalette("warning", performance, phrase);
    assert.ok(palette.bassLoop);
    assert.notEqual(palette.lead, "wobbly-synth");
    assert.equal(palette.metal, "perc-stick");
  }
});

test("Ghost Circuit keeps its richer sample pools", () => {
  const performance = {
    liveDirected: false,
    bassLoopTimbre: 1,
    leadTimbre: 3,
    metalTimbre: 0,
    sectionVariant: 0,
  };
  const palettes = Array.from({ length: 16 }, (_, phrase) => (
    resolveSamplePalette("warning", performance, phrase)
  ));
  assert.equal(palettes.some((palette) => palette.bassLoop !== null), true);
  assert.equal(palettes.some((palette) => palette.metal !== "perc-stick"), true);
});

test("cache contract exposes and revalidates the active Atlas APU build", () => {
  const headers = fs.readFileSync("_headers", "utf8");
  const symphonyPage = fs.readFileSync("lab/system-symphony/system-symphony-page.js", "utf8");
  const ui = fs.readFileSync("static/js/sonify/ui.js", "utf8");
  assert.equal(LIVE_APU_BUILD_ID, "20260726-system-symphony-atlas-apu-live-v3");
  assert.match(headers, /\/static\/js\/sonify\/\*[\s\S]*Cache-Control: no-cache, max-age=0, must-revalidate/);
  assert.match(headers, new RegExp(`X-Atlas-System-Symphony-Build: ${LIVE_APU_BUILD_ID}`));
  assert.match(symphonyPage, new RegExp(`ui\\.js\\?v=${LIVE_APU_BUILD_ID}`));
  assert.match(ui, new RegExp(`apu-production-engine\\.js\\?v=${LIVE_APU_BUILD_ID}`));
  assert.match(ui, /__ATLAS_SYSTEM_SYMPHONY_BUILD__/);
});

test("state commit path no longer advances the composition director twice", () => {
  const source = fs.readFileSync("static/js/sonify/engine.js", "utf8");
  const match = source.match(/function commitPendingLiveFrame[\s\S]*?function advanceLivePhrase/);
  assert.ok(match);
  assert.doesNotMatch(match[0], /liveDirector\.advancePhrase\(\)/);
  assert.match(source, /allowStateChange: canCommitLiveFrameAtStep/);
});
