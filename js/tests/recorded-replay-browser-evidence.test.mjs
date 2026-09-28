import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runner = readFileSync("scripts/capture_recorded_replay_evidence.mjs", "utf8");
const browserCore = readFileSync("scripts/interface-evidence/browser-core.mjs", "utf8");
const workflow = readFileSync(".github/workflows/interface-preview.yml", "utf8");
const replay = readFileSync("lab/system-symphony/replay/index.html", "utf8");
const publicInterface = readFileSync("js/tests/public-interface-contract.test.mjs", "utf8");

test("recorded replay evidence is a dedicated exact-route Chrome and Firefox capture", () => {
  assert.match(runner, /const ROUTE = "\/lab\/system-symphony\/replay\/"/);
  assert.match(runner, /const INCIDENT = "inc-20260705-234935"/);
  assert.match(runner, /const REPLAY_ID = "recorded-inc-20260705-234935"/);
  assert.match(runner, /new URL\(`\$\{ROUTE\}\?incident=\$\{INCIDENT\}`/);
  assert.match(runner, /BROWSERS/);
  assert.match(runner, /trackAudioContexts: true/);
  assert.match(runner, /javaScriptEnabled: false/);
  assert.match(runner, /reducedMotion: "reduce"/);
  assert.match(runner, /captureDeterministicScreenshots/);
  assert.match(runner, /STANDARD_VIEWPORTS/);
  assert.match(browserCore, /media\.autoplay\.block-webaudio/);
  assert.match(browserCore, /media\.block-autoplay-until-in-foreground/);
  assert.match(browserCore, /TrackedAudioContext/);
  assert.match(browserCore, /instance\.addEventListener/);
});

test("recorded replay browser evidence covers identity, transport, consent, ownership, and no-JS boundaries", () => {
  for (const contract of [
    "HTTP 200",
    "schema changed",
    "source timestamps changed",
    "metrics were invented",
    "follow-up recovery boundary changed",
    "AudioContext ran before Start Audio",
    "Start Audio unmuted the replay",
    "automatic playback stopped before the second event",
    "Pause did not stop playback",
    "Reset did not stop playback",
    "current-event marker count is not exactly one",
    "reduced-motion context hid required replay information",
    "Atlas-owned accessibility blockers",
    "Atlas-owned console errors",
    "no-JS sequence does not contain four timestamps",
    "no-JS horizontal overflow",
  ]) assert.match(runner, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), contract);
  assert.match(replay, /meta name="robots" content="noindex, nofollow"/);
  assert.match(publicInterface, /lab\/system-symphony\/replay\/index\.html/);
});

test("workflow reports dedicated replay evidence independently and enforces its exact-head artifact", () => {
  assert.match(workflow, /capture_recorded_replay_evidence\.mjs/);
  assert.match(workflow, /id: recorded-replay-capture/);
  assert.match(workflow, /RECORDED_REPLAY_EVIDENCE_OUTPUT_DIR/);
  assert.match(workflow, /recorded-replay-browser-evidence-\$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(workflow, /RECORDED_REPLAY_CAPTURE_OUTCOME/);
  assert.match(workflow, /if \[ "\$\{RECORDED_REPLAY_CAPTURE_OUTCOME\}" != "success" \]/);
  assert.match(workflow, /Capture recorded-replay browser evidence[\s\S]*?if: always\(\)/);
});
