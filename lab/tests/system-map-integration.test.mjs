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
const html = fs.readFileSync(
  new URL("../index.html", import.meta.url),
  "utf8",
);
const topology = fs.readFileSync(
  new URL("../system-map.topology.js", import.meta.url),
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

test("3D controls pan by default and keep navigation bounded", () => {
  assert.match(scene, /mode:\s*"pan"/);
  assert.match(scene, /event\.button === 2 \|\| event\.altKey/);
  assert.match(scene, /createPanBounds\(state, WORLD_SCALE\)/);
  assert.match(scene, /zoomTargetTowardPoint/);
  assert.doesNotMatch(scene, /shift-drag pan/);
  assert.doesNotMatch(scene, /orbit\.panX|orbit\.panZ/);
});

test("3D scene has restrained global and node-local lighting", () => {
  assert.match(scene, /THREE\.ACESFilmicToneMapping/);
  assert.match(scene, /THREE\.HemisphereLight/);
  assert.match(scene, /THREE\.AdditiveBlending/);
  assert.match(scene, /function nodeGlow\(node\)/);
});

test("route focus is persistent, accessible, and shared by both views", () => {
  assert.match(map, /function toggleRouteFocus\(node\)/);
  assert.match(map, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(map, /class: "smap-route-bridge"/);
  assert.match(map, /class: "smap-route-flow"/);
  assert.match(scene, /function applyRouteFocus\(\)/);
  assert.match(scene, /setRouteFocus\(nodeId\)/);
  assert.match(css, /smap-route-group\.is-related/);
  assert.match(css, /smap-route-group\.is-muted/);
  assert.match(css, /@keyframes smap-route-flow/);
});

test("3D routes use subtle elevations and a closer initial fit", () => {
  assert.match(scene, /const ROUTE_ELEVATION/);
  assert.match(scene, /tunnel:\s*0\.24/);
  assert.match(scene, /Math\.max\(fitHeight, fitWidth\) \* 0\.9/);
  assert.doesNotMatch(scene, /Math\.max\(fitHeight, fitWidth\) \* 1\.34/);
});

test("edge works contains the declared edge workers", () => {
  assert.match(
    topology,
    /id: "specular-edge", role: "worker", kind: "worker"/,
  );
  assert.match(
    topology,
    /id: "ramone-edge", role: "worker", kind: "worker"/,
  );
  assert.match(topology, /layer: "edge", district: "edge"/);
});

test("legend styles include every rendered role", () => {
  for (const role of [
    "worker",
    "site",
    "repo",
    "local",
    "ext",
    "infra",
    "kv",
  ]) {
    assert.match(css, new RegExp(`smap-leg-role-${role}`));
  }
});

test("legend separates status, node type, and connection semantics", () => {
  assert.match(html, /aria-label="Status"/);
  assert.match(html, /aria-label="Node type"/);
  assert.match(html, /aria-label="Connection"/);
  assert.match(html, /smap-leg-role-ext/);
  assert.match(html, />external dependency</);
  assert.match(css, /smap-node-status/);
  assert.match(css, /stroke-dasharray:\s*3 2/);
});
