import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const boot = fs.readFileSync(
  new URL("../../static/js/live/lab-system-map-bootstrap.js", import.meta.url),
  "utf8",
);
const layout = fs.readFileSync(
  new URL("../system-map-layout.js", import.meta.url),
  "utf8",
);
const scene = fs.readFileSync(
  new URL("../system-map-scene.js", import.meta.url),
  "utf8",
);

test("uses public topology", () => {
  assert.match(boot, /\/v1\/topology/);
});

test("layout order is deterministic per node", () => {
  assert.match(layout, /String\(a\.id\)\.localeCompare\(String\(b\.id\)\)/);
  assert.match(layout, /members\.sort\(nodeSort\)/);
});

test("3D labels avoid projected collisions", () => {
  assert.match(scene, /function overlaps\(/);
  assert.match(scene, /placed\.some\(\(other\) => overlaps\(box, other\)\)/);
});
