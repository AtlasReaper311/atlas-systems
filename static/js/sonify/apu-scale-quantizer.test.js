import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_SCALE_QUANTIZER_BUILD_ID,
  ScaleQuantizer,
  midiToHz,
  hzToMidi,
} from "./apu-scale-quantizer.js";

test("build ID is a non-empty string", () => {
  assert.equal(typeof APU_SCALE_QUANTIZER_BUILD_ID, "string");
  assert.ok(APU_SCALE_QUANTIZER_BUILD_ID.length > 0);
});

test("midiToHz returns 440 for MIDI 69 (A4)", () => {
  assert.ok(Math.abs(midiToHz(69) - 440) < 0.01);
});

test("midiToHz returns 261.63 for MIDI 60 (C4)", () => {
  assert.ok(Math.abs(midiToHz(60) - 261.63) < 0.1);
});

test("hzToMidi returns 69 for 440 Hz", () => {
  assert.equal(hzToMidi(440), 69);
});

test("hzToMidi handles edge cases", () => {
  assert.equal(hzToMidi(0), 41); // fallback to tonic
  assert.equal(hzToMidi(-100), 41);
  assert.equal(hzToMidi(NaN), 41);
});

test("midiToHz and hzToMidi round-trip", () => {
  for (const midi of [36, 48, 60, 72, 84]) {
    assert.equal(hzToMidi(midiToHz(midi)), midi);
  }
});

test("ScaleQuantizer defaults to healthy state with F2 tonic", () => {
  const q = new ScaleQuantizer();
  assert.equal(q.state, "healthy");
  assert.deepEqual([...q.scale], [0, 2, 3, 5, 7, 9, 10]);
});

test("ScaleQuantizer table contains valid MIDI notes in range", () => {
  const q = new ScaleQuantizer({ minimum: 36, maximum: 72 });
  const table = q.table;
  assert.ok(table.length > 0);
  for (const midi of table) {
    assert.ok(midi >= 36, `${midi} >= 36`);
    assert.ok(midi <= 72, `${midi} <= 72`);
  }
});

test("table is sorted ascending", () => {
  const q = new ScaleQuantizer();
  const table = q.table;
  for (let i = 1; i < table.length; i += 1) {
    assert.ok(table[i] >= table[i - 1], `table[${i}] >= table[${i - 1}]`);
  }
});

test("table contains no duplicates", () => {
  const q = new ScaleQuantizer();
  const unique = new Set(q.table);
  assert.equal(unique.size, q.table.length);
});

test("table is cached", () => {
  const q = new ScaleQuantizer();
  const a = q.table;
  const b = q.table;
  assert.equal(a, b);
});

test("setState clears table cache", () => {
  const q = new ScaleQuantizer();
  const a = q.table;
  q.setState("warning");
  const b = q.table;
  assert.notEqual(a, b);
  assert.equal(q.state, "warning");
});

test("setState is idempotent for same state", () => {
  const q = new ScaleQuantizer();
  const a = q.table;
  q.setState("healthy");
  const b = q.table;
  assert.equal(a, b, "same state should keep cache");
});

test("quantizeMidi snaps to nearest scale degree", () => {
  const q = new ScaleQuantizer({ state: "healthy" });
  // F2 = MIDI 41, scale [0,2,3,5,7,9,10]
  // Valid notes near middle C: C4=60 is tonic+19 semitones? Let's check directly.
  const result = q.quantizeMidi(60);
  assert.ok(q.table.includes(result), `${result} should be in scale table`);
});

test("quantizeMidi returns exact note when already in scale", () => {
  const q = new ScaleQuantizer({ state: "healthy" });
  const tonic = 41; // F2
  assert.ok(q.table.includes(tonic));
  assert.equal(q.quantizeMidi(tonic), tonic);
});

test("quantizeHz returns a valid frequency", () => {
  const q = new ScaleQuantizer();
  const hz = q.quantizeHz(500);
  assert.ok(Number.isFinite(hz));
  assert.ok(hz > 0);
  // The quantised frequency should correspond to a scale note
  const midi = hzToMidi(hz);
  assert.ok(q.table.includes(midi));
});

test("degreeToMidi maps degree 0 to tonic", () => {
  const q = new ScaleQuantizer({ tonicMidi: 41 });
  assert.equal(q.degreeToMidi(0), 41);
});

test("degreeToMidi wraps across octaves", () => {
  const q = new ScaleQuantizer({ state: "healthy", tonicMidi: 41 });
  // Healthy scale has 7 notes, degree 7 = one octave up
  const degree7 = q.degreeToMidi(7);
  assert.equal(degree7, 41 + 12); // one octave above tonic
});

test("degreeToMidi handles negative degrees", () => {
  const q = new ScaleQuantizer({ state: "healthy", tonicMidi: 41 });
  const minusOne = q.degreeToMidi(-1);
  // degree -1 in a 7-note scale = scale[6] one octave down = 41 + 10 - 12 = 39
  assert.equal(minusOne, 39);
});

test("degreeToHz returns a positive frequency", () => {
  const q = new ScaleQuantizer();
  for (const degree of [-3, -1, 0, 1, 4, 7, 14]) {
    const hz = q.degreeToHz(degree);
    assert.ok(Number.isFinite(hz) && hz > 0, `degree ${degree} should produce positive Hz`);
  }
});

test("foldMidi keeps notes within range", () => {
  const q = new ScaleQuantizer();
  assert.equal(q.foldMidi(100, 40, 80), 76); // 100 - 12 - 12 = 76
  assert.equal(q.foldMidi(20, 40, 80), 44);  // 20 + 12 + 12 = 44
  assert.equal(q.foldMidi(60, 40, 80), 60);  // already in range
});

test("warning scale uses Phrygian intervals", () => {
  const q = new ScaleQuantizer({ state: "warning" });
  assert.deepEqual([...q.scale], [0, 1, 3, 5, 7, 8, 10]);
});

test("critical scale uses Phrygian dominant intervals", () => {
  const q = new ScaleQuantizer({ state: "critical" });
  assert.deepEqual([...q.scale], [0, 1, 4, 5, 7, 8, 10]);
});

test("unknown scale uses pentatonic sus intervals", () => {
  const q = new ScaleQuantizer({ state: "unknown" });
  assert.deepEqual([...q.scale], [0, 2, 5, 7, 10]);
});

test("custom scaleOverride is respected", () => {
  const custom = [0, 3, 7]; // power chord intervals
  const q = new ScaleQuantizer({ scaleOverride: custom });
  assert.deepEqual([...q.scale], custom);
});
