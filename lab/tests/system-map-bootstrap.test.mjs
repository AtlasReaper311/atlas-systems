import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const boot=fs.readFileSync(new URL("../system-map-bootstrap.js",import.meta.url),"utf8");
const map=fs.readFileSync(new URL("../system-map.js",import.meta.url),"utf8");
const scene=fs.readFileSync(new URL("../system-map-scene.js",import.meta.url),"utf8");
test("uses public topology",()=>assert.match(boot,/\/v1\/topology/));
test("stable per-node seed",()=>{assert.match(map,/atlas-map:/);assert.doesNotMatch(map,/nodes\.map\(\(n\) => n\.id\)\.sort/);});
test("3D collision handling",()=>assert.match(scene,/resolveProjectedLabelCollisions/));
