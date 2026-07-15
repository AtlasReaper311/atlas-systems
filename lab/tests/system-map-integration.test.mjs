import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const bootstrap = fs.readFileSync(
  new URL("../system-map-bootstrap.js", import.meta.url),
  "utf8",
);
const map = fs.readFileSync(
  new URL("../system-map.js", import.meta.url),
  "utf8",
);
const scene = fs.readFileSync(
  new URL("../system-map-scene.js", import.meta.url),
  "utf8",
);
const css = fs.readFileSync(
  new URL("../system-map.css", import.meta.url),
  "utf8",
);

test("bootstrap updates the map without reloading the page", () => {
  assert.doesNotMatch(bootstrap, /location\.reload/);
  assert.match(bootstrap, /atlas:system-map-data/);
  assert.match(bootstrap, /script\.type = "module"/);
});

test("capable desktops select 3D before flat view", () => {
  assert.match(
    map,
    /const preferredMode = canUse3D\(\) \? "3d" : "flat"/,
  );
  assert.match(map, /threeButton\.textContent = "3D view"/);
  assert.match(map, /flatButton\.textContent = "flat view"/);
});

test("3D renderer registers a persistent controller", () => {
  assert.match(scene, /vm\.register3D\(controller\)/);
  assert.match(scene, /setVisible/);
  assert.match(scene, /fitCamera/);
  assert.match(scene, /placeLabels/);
});

test("legend styles include every rendered role", () => {
  for (const role of [
    "worker",
    "site",
    "repo",
    "local",
    "ext",
    "kv",
  ]) {
    assert.match(css, new RegExp(`smap-leg-role-${role}`));
  }
});
