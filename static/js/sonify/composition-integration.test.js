import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  MIX_LIMITS,
  bassEventForStep,
  percussionEventsForStep,
  terminalEventForStep,
} from "./engine.js";
import {
  createCompositionDirector,
  motifEventForStep,
} from "./composition-director.js";
import { SCORE_STATES } from "./mapping.js";

function liveFrame(scoreState, pressure) {
  const state = SCORE_STATES[scoreState];
  return {
    scoreState,
    scale: [...state.scale],
    bpm: state.bpm,
    tension: state.tension,
    overallHealth: scoreState === "critical" ? 0.3 : scoreState === "warning" ? 0.82 : 1,
    activeIncidents: scoreState === "critical" ? 1 : 0,
    stale: scoreState === "unknown",
    modulation: {
      pressure,
      healthPressure: pressure,
      coveragePressure: scoreState === "unknown" ? 0.7 : 0,
      latencyPressure: pressure * 0.5,
      uptimePressure: pressure * 0.3,
      errorPressure: pressure * 0.4,
      incidentPressure: scoreState === "critical" ? 0.5 : 0,
      deploymentEnergy: 0,
      componentLoad: 0.5,
      spectralOpenness: 1 - pressure * 0.45,
      staleDecay: scoreState === "unknown" ? 0.8 : 0,
    },
  };
}

test("warning live bass uses tight pulse durations instead of long wobble notes", () => {
  const scale = SCORE_STATES.warning.scale;
  const liveEvents = Array.from({ length: 32 }, (_, step) => (
    bassEventForStep("warning", scale, step, 0)
  )).filter(Boolean);
  assert.ok(liveEvents.length > 0);
  assert.ok(liveEvents.every((event) => event.duration === "8n"));

  const director = createCompositionDirector({ seed: "ATLAS-WARNING-BASS" });
  director.observe(liveFrame("warning", 0.62));
  const plan = director.advancePhrase();
  const directed = Array.from({ length: 32 }, (_, step) => (
    bassEventForStep("warning", scale, step, 0, plan)
  )).filter(Boolean);
  assert.ok(directed.length > 0);
  assert.ok(directed.every((event) => ["16n", "8n"].includes(event.duration)));
  assert.ok(Number.isInteger(plan.bassLoopTimbre), "live Warning must select a deterministic phrase-loop timbre");
});

test("live plans drive motif, arp and rhythm as one bounded arrangement", () => {
  for (const state of Object.keys(SCORE_STATES)) {
    const director = createCompositionDirector({ seed: `ATLAS-INTEGRATION-${state}` });
    const frame = liveFrame(state, state === "critical" ? 0.95 : state === "warning" ? 0.6 : 0.2);
    director.observe(frame);
    const plan = director.advancePhrase();
    const motif = Array.from({ length: 32 }, (_, step) => (
      motifEventForStep(plan, frame.scale, step)
    )).filter(Boolean);
    const arp = Array.from({ length: 32 }, (_, step) => (
      terminalEventForStep(state, frame.scale, step, 0, plan)
    )).filter(Boolean);
    const drums = Array.from({ length: 32 }, (_, step) => (
      percussionEventsForStep(state, step, plan)
    ));

    assert.ok(motif.length > 0);
    assert.ok(arp.length > 0);
    assert.ok(drums.some((events) => events.kick));
    assert.ok(drums.some((events) => events.hat));
    assert.ok(arp.every((event) => Number.isFinite(event.midi)));
    assert.ok(motif.every((event) => Number.isFinite(event.midi)));
  }
});

test("mix architecture exposes conservative hard ceilings", () => {
  assert.ok(MIX_LIMITS.drumParallelGain <= 0.18);
  assert.ok(MIX_LIMITS.drumDriveWet <= 0.16);
  assert.ok(MIX_LIMITS.serviceDriveWet <= 0.2);
  assert.ok(MIX_LIMITS.terminalGain <= 0.92);
  assert.ok(MIX_LIMITS.riffGain <= 0.82);
  assert.ok(MIX_LIMITS.motifGain <= 0.46);
  assert.ok(MIX_LIMITS.masterGainDbMax <= -4);
  assert.ok(MIX_LIMITS.masterGainDbMin <= MIX_LIMITS.masterGainDbMax);
});

test("the production sonification runtime contains no AudioWorklet telemetry path", () => {
  const directory = dirname(fileURLToPath(import.meta.url));
  const previewOnlyWorkletFiles = new Set([
    "apu-loudness-dsp.js",
    "apu-loudness-meter.js",
    "apu-loudness-ui.js",
    "apu-loudness-worklet.js",
  ]);
  const productionJavascriptFiles = readdirSync(directory).filter((name) => (
    name.endsWith(".js")
    && !name.endsWith(".test.js")
    && !previewOnlyWorkletFiles.has(name)
  ));

  for (const name of productionJavascriptFiles) {
    const source = readFileSync(join(directory, name), "utf8");
    assert.equal(
      /AudioWorkletNode|audioWorklet\.addModule|apu-loudness/.test(source),
      false,
      `${name} must not create or load an AudioWorklet telemetry path`,
    );
  }

  const repositoryRoot = join(directory, "..", "..", "..");
  const productionRoute = readFileSync(join(repositoryRoot, "lab", "system-symphony", "index.html"), "utf8");
  const previewRoute = readFileSync(join(repositoryRoot, "lab", "system-symphony-apu", "index.html"), "utf8");

  assert.equal(/apu-loudness/.test(productionRoute), false, "production route must not load the preview loudness meter");
  assert.equal(/apu-loudness-ui\.js/.test(previewRoute), true, "isolated APU preview must explicitly load the loudness UI");
});
