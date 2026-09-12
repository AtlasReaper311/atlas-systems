import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

const pagePath = "lab/atlas-motion/index.html";
const cssPath = "lab/atlas-motion/atlas-motion.css";
const provenancePath = "static/media/atlas-motion/v0.1.0/provenance.json";
const videoPath = "static/media/atlas-motion/v0.1.0/estate-boot.mp4";
const posterPath = "static/media/atlas-motion/v0.1.0/estate-boot-frame-000.png";

const page = fs.readFileSync(pagePath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");
const provenance = JSON.parse(fs.readFileSync(provenancePath, "utf8"));

function sha256(path) {
  return crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
}

test("Atlas Motion uses the exact released EstateBoot media binding", () => {
  assert.equal(provenance.schema_version, "atlas-systems/atlas-motion-release-asset/v1");
  assert.equal(provenance.release.version, "0.1.0");
  assert.equal(provenance.release.tag, "v0.1.0");
  assert.equal(provenance.release.source_commit, "857f2a575480590c75186694a79860f60fcf899d");
  assert.equal(provenance.composition.id, "EstateBoot");
  assert.equal(provenance.composition.width, 1920);
  assert.equal(provenance.composition.height, 1080);
  assert.equal(provenance.composition.fps, 30);
  assert.equal(provenance.composition.frames, 450);
  assert.equal(provenance.composition.audio, false);

  assert.equal(fs.statSync(videoPath).size, provenance.assets.video.bytes);
  assert.equal(sha256(videoPath), provenance.assets.video.sha256);
  assert.equal(fs.statSync(posterPath).size, provenance.assets.poster.bytes);
  assert.equal(sha256(posterPath), provenance.assets.poster.sha256);
  assert.match(page, new RegExp(`src="/${videoPath}"`));
  assert.match(page, new RegExp(`poster="/${posterPath}"`));
});

test("Atlas Motion explains the replay, provenance, and evidence boundary", () => {
  for (const value of [
    "AtlasReaper311/atlas-motion",
    "857f2a575480590c75186694a79860f60fcf899d",
    "EstateBoot",
    "estate-boot-v0-5b970a9bf3b6",
    "5b970a9bf3b66b5469ce883aacec4a4b496e72cc",
    "Recorded replay",
    "historical",
    "current runtime health",
    "current deployment state",
    "current estate health",
    "live topology freshness",
    "current provider state",
    "current production correctness",
  ]) {
    assert.match(page, new RegExp(value.replaceAll(".", "\\."), "i"), `page should state ${value}`);
  }
  assert.match(page, /<video controls preload="metadata"/);
  assert.match(page, /Your browser cannot play this MP4/);
  assert.match(page, /href="#transcript"/);
  assert.match(page, /JavaScript is not required to read this surface/);
  assert.doesNotMatch(page, /https?:\/\/[^"']*AtlasReaper311\/atlas-motion/i);
  assert.doesNotMatch(page, /https?:\/\/[^"']*estate-boot/);
});

test("Atlas Motion keeps the route responsive and reduced-motion safe", () => {
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /aspect-ratio:\s*16 \/ 9/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /transition-duration: 0\.01ms/);
  assert.match(css, /animation-duration: 0\.01ms/);
});

test("Atlas Motion provenance records non-live and release ownership boundaries", () => {
  assert.equal(provenance.owner, "AtlasReaper311/atlas-systems");
  assert.equal(provenance.release_repository, "AtlasReaper311/atlas-motion");
  assert.equal(provenance.topology.simplified, true);
  assert.equal(provenance.topology.component_count, 6);
  assert.equal(provenance.topology.infrastructure_anchor_count, 1);
  assert.equal(provenance.topology.relationship_count, 6);
  assert.equal(provenance.boundaries.recorded_replay, true);
  assert.equal(provenance.boundaries.historical_topology, true);
  assert.equal(provenance.boundaries.runtime_dependency_on_motion, false);
  assert.equal(provenance.boundaries.deployment_claimed, false);
  assert.equal(provenance.boundaries.live_health_claimed, false);
  assert.equal(provenance.boundaries.current_topology_claimed, false);
  assert.equal(provenance.boundaries.provider_state_claimed, false);
  assert.equal(provenance.boundaries.production_correctness_claimed, false);
});
