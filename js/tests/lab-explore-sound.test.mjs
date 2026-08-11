import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sound = fs.readFileSync("lab/shared/lab-explore-sound.js", "utf8");
const almostHtml = fs.readFileSync("lab/almost/index.html", "utf8");
const driftHtml = fs.readFileSync("lab/drift/index.html", "utf8");
const speculumHtml = fs.readFileSync("lab/speculum/index.html", "utf8");
const shapeHtml = fs.readFileSync("lab/anomaly/index.html", "utf8");
const bearingHtml = fs.readFileSync("lab/bearing/index.html", "utf8");
const mapJs = fs.readFileSync("lab/system-map.js", "utf8");
const mapScene = fs.readFileSync("lab/system-map-scene.js", "utf8");

test("shared Lab sound module exposes mute-default organic beds and map chip voice", () => {
  assert.match(sound, /export function mountLabSound/);
  assert.match(sound, /almost:/);
  assert.match(sound, /drift:/);
  assert.match(sound, /speculum:/);
  assert.match(sound, /shape:/);
  assert.match(sound, /bearing:/);
  assert.match(sound, /map:/);
  assert.match(sound, /kind: "chip"/);
  assert.match(sound, /exponentialRampToValueAtTime/);
  assert.match(sound, /aria-pressed/);
  assert.match(sound, /Sound on/);
});

test("Explore tools reuse local controls for Sound toggles", () => {
  assert.match(almostHtml, /id="sound-button"/);
  assert.match(driftHtml, /id="sound-button"/);
  assert.match(speculumHtml, /id="spc-sound"/);
  assert.match(shapeHtml, /id="sound-button"/);
  assert.match(bearingHtml, /id="btn-sound"/);
  assert.match(bearingHtml, /bearing-sound\.js\?v=20260811-sound/);
  assert.match(fs.readFileSync("lab/almost/almost.js", "utf8"), /voice: "almost"/);
  assert.match(fs.readFileSync("lab/drift/drift.js", "utf8"), /voice: "drift"/);
  assert.match(fs.readFileSync("lab/speculum/speculum.js", "utf8"), /voice: 'speculum'/);
  assert.match(fs.readFileSync("lab/anomaly/anomaly.js", "utf8"), /voice: "shape"/);
});

test("System Map mounts soft-chip sound and cinematic focus/orbit", () => {
  assert.match(mapJs, /voice: "map"/);
  assert.match(mapJs, /id = "smap-sound"/);
  assert.match(mapJs, /cinematicFocus/);
  assert.match(mapJs, /onCameraGesture/);
  assert.match(mapScene, /function cinematicFocus/);
  assert.match(mapScene, /function cinematicRelease/);
  assert.match(mapScene, /beginCameraTween/);
  assert.match(mapScene, /autoOrbit/);
  assert.match(mapScene, /ArrowLeft/);
  assert.match(mapScene, /soft focus orbit|ease the camera|Pinning eases/i);
});
