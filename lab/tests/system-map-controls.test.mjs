import assert from "node:assert/strict";
import test from "node:test";

import {
  clampTarget,
  clampZoom,
  createPanBounds,
  zoomLimits,
  zoomTargetTowardPoint,
} from "../system-map-controls.js";

test("pan bounds include a small margin around the city", () => {
  const bounds = createPanBounds(
    { width: 1000, height: 600 },
    0.02,
  );

  assert.deepEqual(bounds, {
    minX: -11.2,
    maxX: 11.2,
    minZ: -6.72,
    maxZ: 6.72,
  });
});

test("camera targets cannot leave the bounded city", () => {
  const bounds = {
    minX: -10,
    maxX: 10,
    minZ: -6,
    maxZ: 6,
  };

  assert.deepEqual(
    clampTarget({ x: 40, z: -30 }, bounds),
    { x: 10, z: -6 },
  );
});

test("zoom stays within fitted distance limits", () => {
  const limits = zoomLimits(20);

  assert.equal(clampZoom(1, 20), limits.minimum);
  assert.equal(clampZoom(200, 20), limits.maximum);
  assert.equal(clampZoom(18, 20), 18);
});

test("zooming in moves the target toward the pointer", () => {
  const next = zoomTargetTowardPoint({
    target: { x: 0, z: 0 },
    point: { x: 8, z: 4 },
    previousDistance: 20,
    nextDistance: 10,
    bounds: {
      minX: -10,
      maxX: 10,
      minZ: -10,
      maxZ: 10,
    },
  });

  assert.deepEqual(next, { x: 2.88, z: 1.44 });
});

test("cursor-focused zoom still respects pan bounds", () => {
  const next = zoomTargetTowardPoint({
    target: { x: 9, z: 9 },
    point: { x: 40, z: 40 },
    previousDistance: 20,
    nextDistance: 8,
    bounds: {
      minX: -10,
      maxX: 10,
      minZ: -10,
      maxZ: 10,
    },
  });

  assert.deepEqual(next, { x: 10, z: 10 });
});
