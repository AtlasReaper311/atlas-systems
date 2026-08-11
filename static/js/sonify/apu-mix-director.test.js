import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  APU_MIX_BUSES,
  APU_MIX_DIRECTOR_BUILD_ID,
  describeIntent,
  mixDirectiveFor,
  safetyEnvelope,
} from "./apu-mix-director.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(path.join(HERE, "apu-mix-director.js"), "utf-8");

const STATES = ["healthy", "warning", "critical", "unknown"];
const PHASES = ["intro", "groove", "pressure", "rupture", "recovery", "afterglow"];

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

test("build id and bus list are frozen", () => {
  assert.equal(typeof APU_MIX_DIRECTOR_BUILD_ID, "string");
  assert.ok(APU_MIX_DIRECTOR_BUILD_ID.length > 0);
  assert.ok(Object.isFrozen(APU_MIX_BUSES));
  assert.deepEqual(
    [...APU_MIX_BUSES],
    ["primary", "secondary", "bass", "pad", "services", "drums", "accent"],
  );
});

// ---------------------------------------------------------------------------
// Shape of the directive
// ---------------------------------------------------------------------------

test("directive has all required top-level fields", () => {
  const d = mixDirectiveFor({ state: "healthy", phase: "groove" });
  assert.ok(typeof d.provenance === "string" && d.provenance.length > 0);
  assert.equal(d.state, "healthy");
  assert.equal(d.phase, "groove");
  assert.ok(d.buses);
  assert.ok(Array.isArray(d.ducking));
  assert.ok(d.chipWobble);
  assert.ok(d.transientSoftener);
  assert.ok(Object.isFrozen(d));
});

test("directive has an entry for every APU bus", () => {
  const d = mixDirectiveFor({ state: "healthy", phase: "groove" });
  for (const busName of APU_MIX_BUSES) {
    assert.ok(d.buses[busName], `bus ${busName} present`);
    assert.ok(Number.isFinite(d.buses[busName].gainMul));
    assert.ok(Number.isFinite(d.buses[busName].highcutHz));
    assert.ok(Number.isFinite(d.buses[busName].width));
    assert.ok(Object.isFrozen(d.buses[busName]));
  }
});

test("ducking rules have source, target, depth, and release", () => {
  const d = mixDirectiveFor({ state: "healthy", phase: "groove" });
  assert.ok(d.ducking.length >= 4, "must define at least four ducking rules");
  for (const rule of d.ducking) {
    assert.ok(typeof rule.source === "string" && rule.source.length > 0);
    assert.ok(typeof rule.target === "string" && rule.target.length > 0);
    assert.ok(rule.source !== rule.target, "a bus cannot duck itself");
    assert.ok(Number.isFinite(rule.depthDb));
    assert.ok(Number.isFinite(rule.releaseMs));
    assert.ok(Object.isFrozen(rule));
  }
});

test("critical ducking rule set includes the kick-to-bass sidechain", () => {
  const d = mixDirectiveFor({ state: "critical", phase: "rupture" });
  const rule = d.ducking.find((r) => r.source === "kick" && r.target === "bass");
  assert.ok(rule, "kick to bass sidechain is expected in every directive");
  assert.ok(rule.depthDb > 0);
});

// ---------------------------------------------------------------------------
// Safety envelope
// ---------------------------------------------------------------------------

test("every directive respects the safety envelope for every state/phase combo", () => {
  const env = safetyEnvelope();
  for (const state of STATES) {
    for (const phase of PHASES) {
      const d = mixDirectiveFor({ state, phase });

      for (const busName of APU_MIX_BUSES) {
        const bus = d.buses[busName];
        assert.ok(bus.gainMul >= env.gainMulMin && bus.gainMul <= env.gainMulMax,
          `${state}/${phase} ${busName} gainMul ${bus.gainMul} out of range`);
        assert.ok(bus.highcutHz >= env.highcutMinHz && bus.highcutHz <= env.highcutMaxHz,
          `${state}/${phase} ${busName} highcut ${bus.highcutHz} out of range`);
        assert.ok(bus.width >= env.widthMin && bus.width <= env.widthMax,
          `${state}/${phase} ${busName} width ${bus.width} out of range`);
      }

      for (const rule of d.ducking) {
        assert.ok(rule.depthDb >= env.duckDepthMinDb && rule.depthDb <= env.duckDepthMaxDb,
          `${state}/${phase} ${rule.source}>${rule.target} depth ${rule.depthDb} out of range`);
        assert.ok(rule.releaseMs >= env.duckReleaseMinMs && rule.releaseMs <= env.duckReleaseMaxMs,
          `${state}/${phase} ${rule.source}>${rule.target} release ${rule.releaseMs} out of range`);
      }

      assert.ok(d.chipWobble.rateHz >= env.wobbleRateMinHz && d.chipWobble.rateHz <= env.wobbleRateMaxHz);
      assert.ok(d.chipWobble.depthCents >= env.wobbleDepthMinCents && d.chipWobble.depthCents <= env.wobbleDepthMaxCents);
      assert.ok(d.transientSoftener.thresholdDb >= env.softenerThresholdMinDb && d.transientSoftener.thresholdDb <= env.softenerThresholdMaxDb);
      assert.ok(d.transientSoftener.ratio >= env.softenerRatioMin && d.transientSoftener.ratio <= env.softenerRatioMax);
      assert.ok(d.transientSoftener.freqHz >= env.softenerFreqMinHz && d.transientSoftener.freqHz <= env.softenerFreqMaxHz);
    }
  }
});

test("no directive contains a NaN or Infinity value", () => {
  for (const state of STATES) {
    for (const phase of PHASES) {
      const d = mixDirectiveFor({ state, phase });
      const values = [];
      for (const bus of Object.values(d.buses)) {
        values.push(bus.gainMul, bus.highcutHz, bus.width);
      }
      for (const rule of d.ducking) {
        values.push(rule.depthDb, rule.releaseMs);
      }
      values.push(d.chipWobble.rateHz, d.chipWobble.depthCents);
      values.push(d.transientSoftener.thresholdDb, d.transientSoftener.ratio, d.transientSoftener.freqHz);
      for (const value of values) {
        assert.ok(Number.isFinite(value), `${state}/${phase} produced non-finite value ${value}`);
      }
    }
  }
});

test("no bus can be silenced by ducking depth", () => {
  const env = safetyEnvelope();
  assert.ok(env.duckDepthMaxDb < 12, "max duck depth should stay under -12 dB so no bus is muted");
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test("mixDirectiveFor is deterministic across calls", () => {
  for (const state of STATES) {
    for (const phase of PHASES) {
      const a = mixDirectiveFor({ state, phase });
      const b = mixDirectiveFor({ state, phase });
      assert.deepEqual(a, b);
    }
  }
});

test("mixDirectiveFor returns frozen output at every nesting level", () => {
  const d = mixDirectiveFor({ state: "healthy", phase: "groove" });
  assert.ok(Object.isFrozen(d));
  assert.ok(Object.isFrozen(d.buses));
  assert.ok(Object.isFrozen(d.chipWobble));
  assert.ok(Object.isFrozen(d.transientSoftener));
  for (const bus of Object.values(d.buses)) {
    assert.ok(Object.isFrozen(bus));
  }
  for (const rule of d.ducking) {
    assert.ok(Object.isFrozen(rule));
  }
});

// ---------------------------------------------------------------------------
// Differentiation
// ---------------------------------------------------------------------------

test("different states produce different mix directives at the same phase", () => {
  const phase = "groove";
  const shapes = STATES.map((state) => JSON.stringify(mixDirectiveFor({ state, phase }).buses));
  assert.equal(new Set(shapes).size, STATES.length, "every state must produce a distinct bus map");
});

test("different phases produce different mix directives at the same state", () => {
  const state = "healthy";
  const shapes = PHASES.map((phase) => JSON.stringify(mixDirectiveFor({ state, phase })));
  assert.ok(new Set(shapes).size >= 5,
    "expected >= 5 distinct phase directives, got ${new Set(shapes).size}");
});

test("critical is darker than healthy at every bus", () => {
  const healthy = mixDirectiveFor({ state: "healthy", phase: "groove" });
  const critical = mixDirectiveFor({ state: "critical", phase: "groove" });
  for (const busName of APU_MIX_BUSES) {
    assert.ok(critical.buses[busName].highcutHz <= healthy.buses[busName].highcutHz,
      `critical ${busName} highcut ${critical.buses[busName].highcutHz} should be <= healthy ${healthy.buses[busName].highcutHz}`);
  }
});

test("critical is narrower than healthy on non-mono buses", () => {
  const healthy = mixDirectiveFor({ state: "healthy", phase: "groove" });
  const critical = mixDirectiveFor({ state: "critical", phase: "groove" });
  for (const busName of ["primary", "pad", "services", "accent"]) {
    assert.ok(critical.buses[busName].width < healthy.buses[busName].width,
      `critical should narrow ${busName} versus healthy`);
  }
});

test("rupture ducks harder than afterglow", () => {
  const rupture = mixDirectiveFor({ state: "warning", phase: "rupture" });
  const afterglow = mixDirectiveFor({ state: "warning", phase: "afterglow" });
  const ruptureKickBass = rupture.ducking.find((r) => r.source === "kick" && r.target === "bass");
  const afterglowKickBass = afterglow.ducking.find((r) => r.source === "kick" && r.target === "bass");
  assert.ok(ruptureKickBass.depthDb > afterglowKickBass.depthDb,
    "rupture should press the kick sidechain harder than afterglow");
});

test("afterglow opens stereo wider than rupture", () => {
  const rupture = mixDirectiveFor({ state: "healthy", phase: "rupture" });
  const afterglow = mixDirectiveFor({ state: "healthy", phase: "afterglow" });
  const rupturePad = rupture.buses.pad.width;
  const afterglowPad = afterglow.buses.pad.width;
  assert.ok(afterglowPad > rupturePad,
    `afterglow pad width ${afterglowPad} should exceed rupture pad width ${rupturePad}`);
});

test("bass bus is nearly mono in every state and phase", () => {
  for (const state of STATES) {
    for (const phase of PHASES) {
      const d = mixDirectiveFor({ state, phase });
      assert.ok(d.buses.bass.width <= 0.15,
        `${state}/${phase} bass width ${d.buses.bass.width} should stay under 0.15`);
    }
  }
});

// ---------------------------------------------------------------------------
// Fallback behaviour
// ---------------------------------------------------------------------------

test("unknown state key falls back to unknown state", () => {
  const d = mixDirectiveFor({ state: "gibberish", phase: "groove" });
  assert.equal(d.state, "unknown");
});

test("unknown phase key falls back to groove", () => {
  const d = mixDirectiveFor({ state: "healthy", phase: "explode" });
  assert.equal(d.phase, "groove");
});

test("empty argument object still returns a valid directive", () => {
  const d = mixDirectiveFor();
  assert.ok(d.buses);
  assert.equal(d.state, "healthy");
  assert.equal(d.phase, "groove");
});

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

test("describeIntent produces a two-part label", () => {
  const label = describeIntent("critical", "rupture");
  assert.ok(label.length > 0);
  assert.ok(label.includes(","), "label should join state and phase intent with a comma");
});

test("provenance in the directive matches describeIntent", () => {
  const d = mixDirectiveFor({ state: "warning", phase: "pressure" });
  assert.ok(d.provenance.includes(describeIntent("warning", "pressure")));
});

// ---------------------------------------------------------------------------
// Source-level negative controls
// ---------------------------------------------------------------------------

test("source does not use Math.random or Date.now", () => {
  const codeOnly = SOURCE.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  assert.doesNotMatch(codeOnly, /Math\.random\s*\(/);
  assert.doesNotMatch(codeOnly, /Date\.now\s*\(/);
});

test("source does not import Tone.js or Web Audio node factories", () => {
  const codeOnly = SOURCE.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  assert.doesNotMatch(codeOnly, /\bfrom\s+["'][^"']*tone/i);
  assert.doesNotMatch(codeOnly, /\bnew\s+Tone\./);
  assert.doesNotMatch(codeOnly, /AudioContext/);
  assert.doesNotMatch(codeOnly, /createOscillator|createBufferSource|createGain\b/);
});

test("source does not reference sample assets", () => {
  assert.doesNotMatch(SOURCE, /\.wav\b/i);
  assert.doesNotMatch(SOURCE, /\.mp3\b/i);
  assert.doesNotMatch(SOURCE, /\.ogg\b/i);
});
