import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const liveSignalUrl = new URL("../live-signal.js", import.meta.url);
const pulseUrl = new URL("../pulse.js", import.meta.url);
const homeLiveStripUrl = new URL("../home-live-strip.js", import.meta.url);

const [liveSignalSource, pulseSource, homeLiveStripSource] = await Promise.all([
  readFile(liveSignalUrl, "utf8"),
  readFile(pulseUrl, "utf8"),
  readFile(homeLiveStripUrl, "utf8"),
]);

test("live-signal owns frame-coalesced homepage telemetry rendering", () => {
  assert.match(liveSignalSource, /function scheduleRender\(\)/);
  assert.match(liveSignalSource, /requestAnimationFrame\(\(\) => \{/);
  assert.match(liveSignalSource, /function renderAll\(\)/);
  assert.doesNotMatch(liveSignalSource, /\bsetInterval\s*\(/);
});

test("pulse does not write to live-signal deploy or commit fields", () => {
  assert.doesNotMatch(pulseSource, /updateLiveSignal/);
  assert.doesNotMatch(pulseSource, /getElementById\(["']commit-hash["']\)/);
  assert.doesNotMatch(pulseSource, /getElementById\(["']last-deploy["']\)/);
});

test("standalone home-live-strip renderer is retired", () => {
  assert.doesNotMatch(homeLiveStripSource, /AtlasRegistry\.subscribe/);
  assert.doesNotMatch(homeLiveStripSource, /getElementById/);
  assert.match(liveSignalSource, /function renderEstateStrip\(\)/);
  assert.match(liveSignalSource, /estate-strip-text/);
});
