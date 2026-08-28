import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  COMPARE_INTERPOLATION_SECONDS,
  HARMONIC_PROFILES,
  SONIC_BASE_FREQUENCY,
  SONIC_SUB_FREQUENCY,
  effectiveStereoWidth,
  mappedParameterDelta,
} from "../../static/js/spectral-forge/sonic-profile.js";
import { TARGETS } from "../../static/js/spectral-forge/domain.js";

const nodesUrl = new URL("../../static/js/spectral-forge/sonic-nodes.js", import.meta.url);
const installUrl = new URL("../../static/js/spectral-forge/sonic-identity-install.js", import.meta.url);
const surfaceUrl = new URL("../../static/js/spectral-forge/sonic-identity-surface.js", import.meta.url);
const audioUrl = new URL("../../static/js/spectral-forge/audio-engine.js", import.meta.url);

async function source(url) { return readFile(url, "utf8"); }

test("sonic identity moves the fundamental lower without becoming sub-bass led", () => {
  assert.ok(SONIC_BASE_FREQUENCY >= 82 && SONIC_BASE_FREQUENCY <= 98);
  assert.equal(SONIC_SUB_FREQUENCY, SONIC_BASE_FREQUENCY / 2);
});

test("stable profile carries suspended crystalline colour and failure remains bounded", () => {
  assert.equal(HARMONIC_PROFILES.STABLE.harmonic, 1.5);
  assert.ok(HARMONIC_PROFILES.STABLE.shimmer > 2.7);
  assert.ok(HARMONIC_PROFILES.FAILED.harmonic >= 1.18 && HARMONIC_PROFILES.FAILED.harmonic <= 1.22);
  assert.ok(HARMONIC_PROFILES.RECOVERING.event.length >= 3);
});

test("instability narrows effective stereo width deterministically", () => {
  const stable = effectiveStereoWidth({ stereo_width: 70, instability: 0 });
  const failed = effectiveStereoWidth({ stereo_width: 70, instability: 35 });
  assert.ok(stable > failed);
  assert.ok(failed >= 0.08);
});

test("abrupt mapped changes receive at least the approved comparison interpolation", () => {
  assert.ok(COMPARE_INTERPOLATION_SECONDS >= 0.1 && COMPARE_INTERPOLATION_SECONDS <= 0.2);
  const previous = Object.fromEntries(TARGETS.map((target) => [target.id, target.defaultValue]));
  const next = { ...previous, filter_cutoff: 8000, instability: 35 };
  assert.ok(mappedParameterDelta(previous, next) > 0.18);
});

test("sonic identity is procedural, sample-free and does not encode scenario names", async () => {
  const [nodes, install] = await Promise.all([source(nodesUrl), source(installUrl)]);
  const combined = `${nodes}\n${install}`;
  /* The identity is a material that rings when excited, not a set of voices
   * that sound continuously. These names track that architecture; the contracts
   * below - procedural, sample-free, deterministic, and ignorant of scenario
   * identity - are what must hold whatever the synthesis is made of. */
  assert.match(nodes, /subOscillator/);
  assert.match(nodes, /resonators/);
  assert.match(nodes, /scheduleHeartbeat/);
  assert.match(nodes, /excite\(/);
  assert.match(nodes, /scheduleMicroImpacts/);
  assert.doesNotMatch(combined, /fetch\(|decodeAudioData/i);
  assert.doesNotMatch(combined, /Math\.random\s*\(/);
  assert.doesNotMatch(combined, /\b(?:normal|traffic|cache|flapping|creep|cascade|deploy)\b/i);
});

test("spatial macro is explicitly surfaced in Analyse", async () => {
  const surface = await source(surfaceUrl);
  assert.match(surface, /SPATIAL MACRO/);
  assert.match(surface, /effectiveStereoWidth/);
  assert.match(surface, /COMPARE TRANSITION/);
});

test("existing sample-bound output safety remains owned by the unchanged audio engine", async () => {
  const audio = await source(audioUrl);
  assert.match(audio, /OUTPUT_CEILING_DBFS = -1/);
  assert.match(audio, /createDynamicsCompressor\(\)/);
  assert.match(audio, /createSoftClipCurve\(\)/);
  assert.match(audio, /this\.ceiling\.gain\.value = OUTPUT_CEILING_LINEAR/);
});
