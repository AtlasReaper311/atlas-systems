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
const twinRoot = "static/media/atlas-motion/v0.3.0";
const twinProvenancePath = `${twinRoot}/provenance.json`;
const twinReleaseManifestPath = `${twinRoot}/atlas-motion-0.3.0.release-manifest.json`;
const twinInputPath = `${twinRoot}/twin-impact.motion-export.json`;
const twinExpectedAssets = [
  ["video", `${twinRoot}/twin-impact.mp4`, 1708031, "dd916eddd91b8ef9979024ca13d3538082fe067aad20635f3525a773cdecc2ab"],
  ["poster", `${twinRoot}/twin-impact-poster.png`, 277570, "ec1c5fa23688681a517fe3e9cdef4a56f535759e3dbcb1916adef0f5bd5e9ae3"],
  ["render_sidecar", `${twinRoot}/twin-impact.render.json`, 26105, "4758a086cd2f3ac346c7c4335266dc3f59ad2cfb1477811b9228ff1746927aa3"],
  ["poster_render_sidecar", `${twinRoot}/twin-impact-poster.render.json`, 23133, "a8f1b63ec5166b8509f99396dd80f2da83d7d9550757d69f7b9e4b6c2a250672"],
  ["ffprobe", `${twinRoot}/twin-impact.ffprobe.json`, 2197, "76d288f0e88ea63ade697427433b18ecfd121f599e4cbe0c936dce1a269f1b68"],
  ["frame_md5", `${twinRoot}/twin-impact.framemd5`, 43417, "8ea723cc8340c2ce9e1765360d2c55020ed8d33373fef0f1c73efee86affa542"],
  ["twin_input", twinInputPath, 18145, "0ab51eb5a7ad1a7ff20188b5e6569e3620941c41ca46a05b753b2da863c55314"],
  ["release_manifest", twinReleaseManifestPath, 51731, "dde9d27c7f6828204884ccae167b39046a7a868fd866a2c7abd54ec080dd2c6b"],
];

const page = fs.readFileSync(pagePath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");
const motionJs = fs.readFileSync(jsPath, "utf8");
const estateProvenance = JSON.parse(fs.readFileSync(estateProvenancePath, "utf8"));
const evidenceProvenance = JSON.parse(fs.readFileSync(evidenceProvenancePath, "utf8"));
const twinProvenance = JSON.parse(fs.readFileSync(twinProvenancePath, "utf8"));
const twinReleaseManifest = JSON.parse(fs.readFileSync(twinReleaseManifestPath, "utf8"));
const twinInput = JSON.parse(fs.readFileSync(twinInputPath, "utf8"));

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

test("Atlas Motion vendors the exact published Atlas Motion v0.3.0 TwinImpact evidence", () => {
  assert.equal(twinProvenance.schema_version, "atlas-systems/atlas-motion-release-asset/v1");
  assert.equal(twinProvenance.owner, "AtlasReaper311/atlas-systems");
  assert.equal(twinProvenance.release_repository, "AtlasReaper311/atlas-motion");
  assert.equal(twinProvenance.release.version, "0.3.0");
  assert.equal(twinProvenance.release.tag, "v0.3.0");
  assert.equal(twinProvenance.release.github_release_published, true);
  assert.equal(twinProvenance.release.source_commit, "4894209b1fde44847e89a2c3f5dafa9d97153f16");
  assert.equal(twinProvenance.release.source_tree, "6f7a28d58da1f601f2eaec9e9005ee56b8c17a35");
  assert.equal(twinProvenance.release.manifest_sha256, "dde9d27c7f6828204884ccae167b39046a7a868fd866a2c7abd54ec080dd2c6b");
  assert.equal(twinProvenance.release.archive_sha256, "10e272c5a0e1b010c664f76b35ed0b066c043f90c17fe317f80aef2190380771");
  assert.equal(twinProvenance.release.bundle_schema_version, "atlas-motion/release-bundle/v3");
  assert.equal(twinProvenance.release.bundle_kind, "candidate");
  assert.equal(twinProvenance.release.bundle_tag_status, "not-created");

  assert.equal(twinReleaseManifest.schema_version, "atlas-motion/release-bundle/v3");
  assert.equal(twinReleaseManifest.repository, "AtlasReaper311/atlas-motion");
  assert.equal(twinReleaseManifest.release.source_commit, twinProvenance.release.source_commit);
  assert.equal(twinReleaseManifest.release.source_tree, twinProvenance.release.source_tree);
  assert.equal(twinReleaseManifest.twin_impact.composition, "TwinImpact");
  assert.equal(twinReleaseManifest.twin_impact.input_path, "input/twin-impact.motion-export.json");
  assert.equal(twinReleaseManifest.twin_impact.twin_export.input_sha256, twinProvenance.twin_export.input_sha256);
  assert.equal(twinReleaseManifest.twin_impact.twin_export.passport_fingerprint, twinProvenance.twin_export.passport_fingerprint);

  assert.equal(twinProvenance.composition.id, "TwinImpact");
  assert.equal(twinProvenance.composition.slug, "twin-impact");
  assert.equal(twinProvenance.composition.preset, "landscape");
  assert.equal(twinProvenance.composition.width, 1920);
  assert.equal(twinProvenance.composition.height, 1080);
  assert.equal(twinProvenance.composition.fps, 30);
  assert.equal(twinProvenance.composition.duration_seconds, 18);
  assert.equal(twinProvenance.composition.frames, 540);
  assert.equal(twinProvenance.composition.codec, "h264");
  assert.equal(twinProvenance.composition.pixel_format, "yuv420p");
  assert.equal(twinProvenance.composition.audio, false);
  assert.deepEqual(twinProvenance.composition.poster, {
    preset: "poster-social",
    width: 1200,
    height: 630,
    frame: 539,
    rule: "final-hold-frame",
  });

  for (const [name, path, bytes, sha] of twinExpectedAssets) {
    const asset = twinProvenance.assets[name];
    assert.equal(asset.path, path);
    assert.equal(asset.bytes, bytes);
    assert.equal(asset.sha256, sha);
    assertAsset(path, bytes, sha);
  }
  assert.equal(sha256(twinReleaseManifestPath), twinProvenance.release.manifest_sha256);
  assert.equal(twinProvenance.assets.release_manifest.path, twinReleaseManifestPath);

  assert.equal(twinProvenance.twin_export.schema_version, "atlas-twin-motion-export/v1");
  assert.equal(twinProvenance.twin_export.experimental, true);
  assert.equal(twinProvenance.twin_export.twin_version, "1.1.0");
  assert.equal(twinProvenance.twin_export.producer.repository, "AtlasReaper311/atlas-twin");
  assert.equal(twinProvenance.twin_export.producer.source_commit, "937ac6ab929085f8e8f162dd2344802d2617f3d9");
  assert.equal(twinProvenance.twin_export.authority_pins.atlas_api_public_commit, "8ff638f92cfc3a3ec5e2243ecb6464c964bd8e65");
  assert.equal(twinProvenance.twin_export.authority_pins.atlas_infra_commit, "de3b182eae9effe06753affa5dcff1945d87c1eb");
  assert.deepEqual(twinProvenance.twin_export.subject, {
    repository: "AtlasReaper311/atlas-api-public",
    kind: "git_range",
    base: "8ff638f92cfc3a3ec5e2243ecb6464c964bd8e65",
    head: "02a0e6a7bfac66ea85cff536d0c89e6406abee5f",
    changed_files_path: null,
  });
  assert.equal(twinProvenance.twin_export.selection.node_count, 51);
  assert.equal(twinProvenance.twin_export.selection.relationship_count, 60);
  assert.equal(twinInput.schema_version, "atlas-twin-motion-export/v1");
  assert.equal(twinInput.experimental, true);
  assert.equal(twinInput.twin_version, "1.1.0");
  assert.equal(twinInput.passport_fingerprint, twinProvenance.twin_export.passport_fingerprint);
  assert.equal(twinInput.subject.repository, "AtlasReaper311/atlas-api-public");
  assert.equal(twinInput.selection.nodes.length, 51);
  assert.equal(twinInput.selection.edges.length, 60);
});

test("Atlas Motion presents a parent identity with three released compositions", () => {
  assert.match(page, /<h1 id="atlas-motion-title">Atlas Motion<\/h1>/);
  assert.match(page, /Deterministic motion for systems, evidence, and change impact/i);
  assert.match(page, /id="estateboot"/);
  assert.match(page, /id="evidencechain"/);
  assert.match(page, /id="twinimpact"/);
  assert.match(page, /data-motion-composition="estateboot"/);
  assert.match(page, /data-motion-composition="evidencechain"/);
  assert.match(page, /data-motion-composition="twinimpact"/);
  assert.match(page, /data-composition="estateboot"/);
  assert.match(page, /data-composition="evidencechain"/);
  assert.match(page, /data-composition="twinimpact"/);
  assert.equal((page.match(/data-motion-composition="[^"]+"/g) ?? []).length, 3);
  assert.equal((page.match(/<video\b/g) ?? []).length, 3);
  assert.equal((page.match(/controls playsinline preload="metadata"/g) ?? []).length, 3);
  assert.doesNotMatch(page, /<video[^>]+autoplay/i);
  assert.doesNotMatch(page, /two released compositions/i);
  assert.match(page, /v0\.1\.0/);
  assert.match(page, /v0\.2\.0/);
  assert.match(page, /v0\.3\.0/);
  assert.match(page, /three released compositions/i);
  assert.match(page, /<small>v0\.3\.0 \/ proposed change mapping<\/small>/);
  assert.match(page, /href="#twinimpact-proof">Open provenance<\/a>/);
  assert.match(page, /<details class="atlas-motion-proof"/);
  assert.match(page, /JavaScript is not required to read this surface/);
  assert.match(page, new RegExp(`src="/${twinRoot}/twin-impact\\.mp4"`));
  assert.match(page, new RegExp(`poster="/${twinRoot}/twin-impact-poster\\.png"`));
});

test("Atlas Motion keeps chapter navigation keyboard-safe and progressive", () => {
  assert.equal((page.match(/data-motion-seek(?:\s|=)/g) ?? []).length, 23);
  assert.match(page, /aria-label="EstateBoot chapters"/);
  assert.match(page, /aria-label="EvidenceChain chapters"/);
  assert.match(page, /aria-label="TwinImpact chapters"/);
  assert.match(page, /data-time="10\.86"/);
  assert.match(page, /data-time="2"/);
  assert.match(page, /data-time="7"/);
  assert.match(page, /data-time="11"/);
  assert.match(page, /data-time="16"/);
  for (const [time, label] of [
    ["0", "Identity / proposed change"],
    ["2", "COULD BE AFFECTED / system view"],
    ["7", "Declared relationships / evidence context"],
    ["11", "Boundaries / non-claims"],
    ["16", "Provenance close"],
  ]) {
    assert.match(page, new RegExp(`data-video-id="twinimpact-video" data-time="${time}"[^>]*>[\\s\\S]*?<span>${label.replaceAll(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")}</span>`));
  }
  assert.match(page, /data-motion-seek-status aria-live="polite"/);
  assert.match(motionJs, /event\.preventDefault\(\)/);
  assert.match(motionJs, /video\.currentTime/);
  assert.match(motionJs, /Playback remains paused/);
  assert.match(motionJs, /if \(!video.*return/);
  assert.match(page, /href="#estateboot-transcript"/);
  assert.match(page, /href="#evidencechain-transcript"/);
  assert.equal((page.match(/href="#twinimpact-transcript"/g) ?? []).length, 6);
});

test("Atlas Motion presents bounded TwinImpact evidence without live-state claims", () => {
  for (const value of [
    "current runtime health",
    "current deployment state",
    "current estate health",
    "live topology freshness",
    "current provider state",
    "production correctness",
    "publication",
    "social distribution",
    "COULD BE AFFECTED",
    "NOT OBSERVED IMPACT",
    "does not prove deployment",
    "runtime impact",
    "current service health",
    "synthetic Twin fixture",
    "not published here as a real Atlas example",
  ]) {
    assert.match(page, new RegExp(value.replaceAll(".", "\\."), "i"), `page should state ${value}`);
  }
  assert.doesNotMatch(page, /(?:was|were|has been|is|are) affected\b/i);
  assert.doesNotMatch(page, /(?:observed|actual|current) impact (?:occurred|was|is|has)/i);
  assert.doesNotMatch(page, /TwinImpact (?:composition|release|analysis) (?:is|was) (?:published|real)/i);
  assert.doesNotMatch(page, /source\/data\/twin\/motion-export-v1\.json/);
  assert.doesNotMatch(page, /https?:\/\/[^"']*AtlasReaper311\/atlas-motion/i);
  assert.doesNotMatch(page, /<(?:source|video)\b[^>]+(?:src|poster)="https?:/i);
  assert.doesNotMatch(motionJs, /https?:\/\//i);
  assert.equal(twinProvenance.boundaries.observed_impact_claimed, false);
  assert.equal(twinProvenance.boundaries.deployment_claimed, false);
  assert.equal(twinProvenance.boundaries.runtime_impact_claimed, false);
  assert.equal(twinProvenance.boundaries.current_live_state_claimed, false);
  assert.equal(twinProvenance.boundaries.current_service_health_claimed, false);
  assert.equal(twinProvenance.boundaries.current_estate_health_claimed, false);
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
  const chapterLabels = [...page.matchAll(/<a href="#(?:estateboot|evidencechain|twinimpact)-transcript"[^>]*>\d+ <span>([^<]+)<\/span>/g)]
    .map((match) => match[1]);
  assert.equal(chapterLabels.length, 23);
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
  assert.equal(twinProvenance.owner, "AtlasReaper311/atlas-systems");
  assert.equal(twinProvenance.release_repository, "AtlasReaper311/atlas-motion");
  assert.deepEqual(twinProvenance.chain, [
    "validated Atlas Twin export",
    "Atlas Motion TwinImpact",
    "v0.3.0 released evidence",
    "repository-local public presentation",
  ]);
  for (const boundary of [
    "relationship_subset_is_importance_ranking",
    "relationship_subset_is_causal_claim",
    "observed_impact_claimed",
    "deployment_claimed",
    "runtime_impact_claimed",
    "runtime_health_claimed",
    "current_live_state_claimed",
    "current_service_health_claimed",
    "current_estate_health_claimed",
    "provider_state_claimed",
    "production_correctness_claimed",
    "runtime_dependency_on_motion",
    "network_calls",
    "provider_calls",
    "runtime_calls",
  ]) {
    assert.equal(twinProvenance.boundaries[boundary], false, `${boundary} boundary`);
  }
});
