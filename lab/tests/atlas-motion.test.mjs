import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

const pagePath = "lab/atlas-motion/index.html";
const cssPath = "lab/atlas-motion/atlas-motion.css";
const jsPath = "lab/atlas-motion/atlas-motion.js";
const estateProvenancePath = "static/media/atlas-motion/v0.1.0/provenance.json";
const estateVideoPath = "static/media/atlas-motion/v0.1.0/estate-boot.mp4";
const estatePosterPath = "static/media/atlas-motion/v0.1.0/estate-boot-frame-000.png";
const evidenceRoot = "static/media/atlas-motion/v0.2.0";
const evidenceProvenancePath = `${evidenceRoot}/provenance.json`;

const page = fs.readFileSync(pagePath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");
const motionJs = fs.readFileSync(jsPath, "utf8");
const estateProvenance = JSON.parse(fs.readFileSync(estateProvenancePath, "utf8"));
const evidenceProvenance = JSON.parse(fs.readFileSync(evidenceProvenancePath, "utf8"));

function sha256(path) {
  return crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
}

function assertAsset(path, expectedBytes, expectedSha) {
  assert.equal(fs.statSync(path).size, expectedBytes, `${path} byte count`);
  assert.equal(sha256(path), expectedSha, `${path} SHA-256`);
}

test("Atlas Motion keeps the exact released EstateBoot media binding", () => {
  assert.equal(estateProvenance.schema_version, "atlas-systems/atlas-motion-release-asset/v1");
  assert.equal(estateProvenance.release.version, "0.1.0");
  assert.equal(estateProvenance.release.tag, "v0.1.0");
  assert.equal(estateProvenance.release.source_commit, "857f2a575480590c75186694a79860f60fcf899d");
  assert.equal(estateProvenance.composition.id, "EstateBoot");
  assert.equal(estateProvenance.composition.width, 1920);
  assert.equal(estateProvenance.composition.height, 1080);
  assert.equal(estateProvenance.composition.fps, 30);
  assert.equal(estateProvenance.composition.frames, 450);
  assert.equal(estateProvenance.composition.audio, false);

  assertAsset(estateVideoPath, estateProvenance.assets.video.bytes, estateProvenance.assets.video.sha256);
  assertAsset(estatePosterPath, estateProvenance.assets.poster.bytes, estateProvenance.assets.poster.sha256);
  assert.match(page, new RegExp(`src="/${estateVideoPath}"`));
  assert.match(page, new RegExp(`poster="/${estatePosterPath}"`));
});

test("Atlas Motion vendors the exact published EvidenceChain release evidence", () => {
  assert.equal(evidenceProvenance.schema_version, "atlas-systems/atlas-motion-release-asset/v1");
  assert.equal(evidenceProvenance.release.version, "0.2.0");
  assert.equal(evidenceProvenance.release.tag, "v0.2.0");
  assert.equal(evidenceProvenance.release.github_release_published, true);
  assert.equal(evidenceProvenance.release.source_commit, "ec9e5cdec34905e77ed0653b8a74372f79df2a8c");
  assert.equal(evidenceProvenance.release.bundle_kind, "candidate");
  assert.equal(evidenceProvenance.release.bundle_tag_status, "not-created");
  assert.equal(evidenceProvenance.composition.id, "EvidenceChain");
  assert.equal(evidenceProvenance.composition.width, 1920);
  assert.equal(evidenceProvenance.composition.height, 1080);
  assert.equal(evidenceProvenance.composition.fps, 30);
  assert.equal(evidenceProvenance.composition.frames, 600);
  assert.equal(evidenceProvenance.composition.audio, false);

  const video = `${evidenceRoot}/evidence-chain.mp4`;
  assertAsset(video, evidenceProvenance.assets.video.bytes, evidenceProvenance.assets.video.sha256);
  for (const poster of evidenceProvenance.assets.posters) {
    assertAsset(poster.path, poster.bytes, poster.sha256);
  }
  for (const asset of [evidenceProvenance.assets.render_sidecar, evidenceProvenance.assets.ffprobe, evidenceProvenance.assets.frame_md5, evidenceProvenance.assets.release_manifest]) {
    assert.equal(sha256(asset.path), asset.sha256, `${asset.path} SHA-256`);
  }
  assert.equal(sha256(evidenceProvenance.reviewed_input.path), evidenceProvenance.reviewed_input.sha256);
  assert.match(page, new RegExp(`src="/${video}"`));
  assert.match(page, new RegExp(`poster="/${evidenceRoot}/evidence-chain-frame-000.png"`));
});

test("Atlas Motion presents a parent identity with two released compositions", () => {
  assert.match(page, /<h1 id="atlas-motion-title">Atlas Motion<\/h1>/);
  assert.match(page, /Deterministic motion for systems, evidence, and change impact/i);
  assert.match(page, /id="estateboot"/);
  assert.match(page, /id="evidencechain"/);
  assert.match(page, /data-motion-composition="estateboot"/);
  assert.match(page, /data-motion-composition="evidencechain"/);
  assert.match(page, /data-composition="estateboot"/);
  assert.match(page, /data-composition="evidencechain"/);
  assert.equal((page.match(/<video\b/g) ?? []).length, 2);
  assert.equal((page.match(/controls playsinline preload="metadata"/g) ?? []).length, 2);
  assert.doesNotMatch(page, /<video[^>]+autoplay/i);
  assert.match(page, /v0\.1\.0/);
  assert.match(page, /v0\.2\.0/);
  assert.match(page, /<details class="atlas-motion-proof"/);
  assert.match(page, /JavaScript is not required to read this surface/);
});

test("Atlas Motion keeps chapter navigation keyboard-safe and progressive", () => {
  assert.equal((page.match(/data-motion-seek(?:\s|=)/g) ?? []).length, 18);
  assert.match(page, /aria-label="EstateBoot chapters"/);
  assert.match(page, /aria-label="EvidenceChain chapters"/);
  assert.match(page, /data-time="10\.86"/);
  assert.match(page, /data-motion-seek-status aria-live="polite"/);
  assert.match(motionJs, /event\.preventDefault\(\)/);
  assert.match(motionJs, /video\.currentTime/);
  assert.match(motionJs, /Playback remains paused/);
  assert.match(motionJs, /if \(!video.*return/);
  assert.match(page, /href="#estateboot-transcript"/);
  assert.match(page, /href="#evidencechain-transcript"/);
});

test("Atlas Motion preserves explicit evidence boundaries and excludes TwinImpact claims", () => {
  for (const value of [
    "current runtime health",
    "current deployment state",
    "current estate health",
    "live topology freshness",
    "current provider state",
    "production correctness",
    "publication",
    "social distribution",
    "synthetic Twin fixture",
    "not published here as a real Atlas example",
  ]) {
    assert.match(page, new RegExp(value.replaceAll(".", "\\."), "i"), `page should state ${value}`);
  }
  assert.doesNotMatch(page, /TwinImpact (?:composition|release|analysis) (?:is|was) (?:published|real)/i);
  assert.doesNotMatch(page, /https?:\/\/[^"']*AtlasReaper311\/atlas-motion/i);
  assert.equal(evidenceProvenance.boundaries.deployed_claimed, false);
  assert.equal(evidenceProvenance.boundaries.live_health_claimed, false);
  assert.equal(evidenceProvenance.boundaries.provider_state_claimed, false);
  assert.equal(evidenceProvenance.boundaries.production_correctness_claimed, false);
});

test("Atlas Motion corrects the old EstateBoot release wording and keeps the shell contract", () => {
  assert.doesNotMatch(page, /v0\.1\.0[^<\n]*candidate release/i);
  assert.match(page, /v0\.2\.0<\/code> · published GitHub Release/);
  assert.match(page, /Bundle manifest<\/dt><dd><code>kind: candidate<\/code>/);
  const shell = fs.readFileSync("lab/shared/shell.js", "utf8");
  assert.match(shell, /label: "Atlas Motion", href: "\/lab\/atlas-motion\/"/);
});

test("Atlas Motion transcripts keep every chapter label readable without JavaScript", () => {
  const chapterLabels = [...page.matchAll(/<a href="#(?:estateboot|evidencechain)-transcript"[^>]*>\d+ <span>([^<]+)<\/span>/g)]
    .map((match) => match[1]);
  assert.equal(chapterLabels.length, 18);
  for (const label of chapterLabels) {
    assert.match(
      page,
      new RegExp(`<strong>${label.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.</strong>`),
      `transcript should include chapter ${label}`,
    );
  }
});

test("Atlas Motion remains responsive and reduced-motion safe", () => {
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /aspect-ratio:\s*16 \/ 9/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /@media \(max-width: 390px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /transition-duration: \.01ms/);
  assert.match(css, /animation-duration: \.01ms/);
  assert.match(css, /grid-template-columns: repeat\(6/);
  assert.match(css, /\.atlas-motion-proof summary \{[\s\S]*min-height: 44px/);
});

test("Atlas Motion provenance records non-live release ownership boundaries", () => {
  assert.equal(estateProvenance.owner, "AtlasReaper311/atlas-systems");
  assert.equal(estateProvenance.release_repository, "AtlasReaper311/atlas-motion");
  assert.equal(estateProvenance.topology.simplified, true);
  assert.equal(estateProvenance.boundaries.recorded_replay, true);
  assert.equal(estateProvenance.boundaries.deployment_claimed, false);
  assert.equal(estateProvenance.boundaries.live_health_claimed, false);
  assert.equal(estateProvenance.boundaries.current_topology_claimed, false);
  assert.equal(estateProvenance.boundaries.provider_state_claimed, false);
  assert.equal(estateProvenance.boundaries.production_correctness_claimed, false);
});
