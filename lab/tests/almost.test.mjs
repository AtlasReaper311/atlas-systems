import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEFAULT_FRAME_MS,
  createRandom,
  createTrace,
  formatDuration,
  normalizeSeed,
  pointForTrace,
  sampleLabel,
  timingSample,
} from "../almost/almost-core.js";

const html = readFileSync(
  new URL("../almost/index.html", import.meta.url),
  "utf8",
);
const source = readFileSync(
  new URL("../almost/almost.js", import.meta.url),
  "utf8",
);

test("seeded trace construction is deterministic", () => {
  const firstRandom = createRandom(311);
  const secondRandom = createRandom(311);
  const first = Array.from({ length: 12 }, (_, index) =>
    createTrace(index, 12, firstRandom));
  const second = Array.from({ length: 12 }, (_, index) =>
    createTrace(index, 12, secondRandom));

  assert.deepEqual(first, second);
  assert.notDeepEqual(first[0], first[1]);
});

test("seed normalization always returns a usable uint32 value", () => {
  assert.equal(normalizeSeed("311"), 311);
  assert.equal(normalizeSeed(0), 311);
  assert.equal(normalizeSeed("not-a-number"), 311);
  assert.equal(normalizeSeed(0x1_0000_0001), 1);
});

test("timing samples distinguish near frames, drag, and stalls", () => {
  assert.equal(timingSample(DEFAULT_FRAME_MS, DEFAULT_FRAME_MS).kind, "near");
  assert.equal(timingSample(30, DEFAULT_FRAME_MS).kind, "drag");
  assert.equal(timingSample(100, DEFAULT_FRAME_MS).kind, "stall");
  assert.equal(sampleLabel(timingSample(DEFAULT_FRAME_MS, DEFAULT_FRAME_MS)), "drawing");
  assert.equal(sampleLabel(timingSample(30, DEFAULT_FRAME_MS)), "late frame");
  assert.equal(sampleLabel(timingSample(100, DEFAULT_FRAME_MS)), "long pause");
  assert.equal(timingSample(-10, DEFAULT_FRAME_MS).latenessMs, 0);
  assert.equal(timingSample(5000, DEFAULT_FRAME_MS).normalized, 1);
});

test("trace points remain finite and within the visible drawing surface", () => {
  const random = createRandom(923);
  const trace = createTrace(4, 16, random);
  for (const delta of [DEFAULT_FRAME_MS, 26, 120, 900]) {
    const point = pointForTrace(
      trace,
      92_000,
      timingSample(delta, DEFAULT_FRAME_MS),
      1200,
      700,
    );
    assert.ok(Number.isFinite(point.x));
    assert.ok(Number.isFinite(point.y));
    assert.ok(point.x >= 0 && point.x <= 1200);
    assert.ok(point.y >= 0 && point.y <= 700);
  }
});

test("elapsed time stays compact before and after one hour", () => {
  assert.equal(formatDuration(0), "00:00");
  assert.equal(formatDuration(83), "01:23");
  assert.equal(formatDuration(3661), "01:01:01");
});

test("page names its local source and exposes essential controls", () => {
  assert.match(html, /seeded geometry \+ local frame timing/);
  assert.match(html, /network input \/ none/);
  assert.match(html, /id="hold-button"/);
  assert.match(html, /id="new-button"/);
  assert.match(html, /id="save-button"/);
  assert.match(html, /It does not finish\./);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /document\.hidden/);
  assert.match(source, /drawSignalBlooms/);
  assert.match(source, /drawTimingStrip/);
  assert.match(source, /toBlob/);
});
