import assert from "node:assert/strict";
import test from "node:test";

import {
  captureDeterministicScreenshots,
  segmentScrollPositions,
} from "../../scripts/interface-evidence/screenshot-capture.mjs";

function fakePage(measurement, { failFullPage = false, failSegments = false } = {}) {
  const screenshots = [];
  const scrollPositions = [];
  return {
    screenshots,
    scrollPositions,
    async evaluate(_callback, position) {
      if (position === undefined) return measurement;
      scrollPositions.push(position);
      return undefined;
    },
    async screenshot(options) {
      screenshots.push(options);
      if (options.fullPage && failFullPage) throw new Error("browser safe dimension exceeded");
      if (!options.fullPage && failSegments) throw new Error("segment write failed");
    },
  };
}

test("normal documents keep the full-page capture and required viewport capture", async () => {
  const page = fakePage({ documentWidth: 1200, documentHeight: 2400, viewportWidth: 1200, viewportHeight: 1000 });
  const result = await captureDeterministicScreenshots(page, {
    directory: "out",
    browserName: "chrome",
    viewportName: "375",
    routeName: "normal",
    includeViewport: true,
  });

  assert.equal(result.captureMode, "full-page");
  assert.match(result.fullPage, /chrome-375-normal-full\.png$/);
  assert.match(result.viewport, /chrome-375-normal-viewport\.png$/);
  assert.deepEqual(result.segments, []);
  assert.deepEqual(page.scrollPositions, []);
  assert.equal(page.screenshots.filter(({ fullPage }) => fullPage).length, 1);
});

test("oversized documents use deterministic bounded vertical segments", async () => {
  const page = fakePage({ documentWidth: 1200, documentHeight: 65_000, viewportWidth: 1200, viewportHeight: 1000 });
  const result = await captureDeterministicScreenshots(page, {
    directory: "out",
    browserName: "firefox",
    viewportName: "1440",
    routeName: "ramone-voice-assistant",
  });

  assert.equal(result.captureMode, "segmented");
  assert.equal(result.fullPage, null);
  assert.equal(result.segments.length, 65);
  assert.equal(result.segments[0].scrollY, 0);
  assert.equal(result.segments.at(-1).scrollY, 64_000);
  assert.match(result.fallbackReason, /safe screenshot envelope/);
  assert.equal(page.screenshots.some(({ fullPage }) => fullPage), false);
});

test("a normal full-page failure records fallback metadata and remains capturable", async () => {
  const page = fakePage(
    { documentWidth: 1200, documentHeight: 2400, viewportWidth: 1200, viewportHeight: 1000 },
    { failFullPage: true },
  );
  const result = await captureDeterministicScreenshots(page, {
    directory: "out",
    browserName: "firefox",
    viewportName: "375",
    routeName: "ramone-voice-assistant",
    includeViewport: true,
  });

  assert.equal(result.captureMode, "segmented-fallback");
  assert.equal(result.fullPage, null);
  assert.equal(result.segments.length, 3);
  assert.match(result.fallbackReason, /full-page capture failed/);
  assert.ok(result.viewport);
});

test("a real failure remains blocking when neither capture path succeeds", async () => {
  const page = fakePage(
    { documentWidth: 1200, documentHeight: 65_000, viewportWidth: 1200, viewportHeight: 1000 },
    { failSegments: true },
  );
  await assert.rejects(
    () => captureDeterministicScreenshots(page, {
      directory: "out",
      browserName: "firefox",
      viewportName: "1440",
      routeName: "broken",
    }),
    /segmented screenshot capture failed: segment write failed/,
  );
});

test("segment positions always include the final visible document slice", () => {
  assert.deepEqual(segmentScrollPositions({ documentHeight: 2_400, viewportHeight: 1_000 }), [0, 1_000, 1_400]);
  assert.deepEqual(segmentScrollPositions({ documentHeight: 1_000, viewportHeight: 1_000 }), [0]);
});
