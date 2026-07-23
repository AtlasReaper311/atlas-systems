import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import {
  STATUS_ENDPOINT,
  STATUS_LABELS,
  STATUS_PAGE,
  STATUS_STALE_AFTER_MS,
  parseEstateStatus,
} from "../../static/js/estate-status.js";
import { GLOBAL_ROUTES, normalizeAtlasTitle } from "../../static/js/estate-shell.js";

const NOW = Date.parse("2026-07-23T08:00:00Z");
const BUNDLE_ROOT = "static/vendor/atlas-interface/v0.1.1";

function snapshot(operational, total, checkedAt = "2026-07-23T07:55:00Z") {
  return { estate: { operational, total_components: total, checked_at: checkedAt } };
}

function sha256(path) {
  return crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
}

test("status indicator consumes the bounded aggregate contract", () => {
  assert.equal(STATUS_ENDPOINT, "https://api.atlas-systems.uk/v1/stats");
  assert.equal(STATUS_PAGE, "https://status.atlas-systems.uk/");
  assert.equal(STATUS_STALE_AFTER_MS, 1_200_000);
  assert.equal(STATUS_LABELS.operational, "Operational");
});

test("status mapping distinguishes operational, degraded, unavailable, and unknown", () => {
  assert.equal(parseEstateStatus(snapshot(19, 19), NOW).state, "operational");
  assert.equal(parseEstateStatus(snapshot(18, 19), NOW).state, "degraded");
  assert.equal(parseEstateStatus(snapshot(10, 19), NOW).state, "degraded");
  assert.equal(parseEstateStatus(snapshot(9, 19), NOW).state, "unavailable");
  assert.equal(parseEstateStatus(snapshot(0, 19), NOW).state, "unavailable");
  assert.equal(parseEstateStatus(null, NOW).state, "unknown");
  assert.equal(parseEstateStatus(snapshot(20, 19), NOW).state, "unknown");
  assert.equal(parseEstateStatus(snapshot(19, 19, "2026-07-23T08:05:00Z"), NOW).state, "unknown");
  assert.equal(parseEstateStatus(snapshot(19, 19, "2026-07-23T07:39:59Z"), NOW).state, "unknown");
});

test("v2 shell exposes the accepted route order", () => {
  assert.deepEqual(GLOBAL_ROUTES.map(({ label }) => label), ["Work", "Writing", "Lab", "Systems", "About"]);
  const shell = fs.readFileSync("static/js/estate-shell.js", "utf8");
  const shellCss = fs.readFileSync("static/css/estate-shell.css", "utf8");
  assert.match(shell, /atlas-header__brand/);
  assert.match(shell, /atlas-header__nav/);
  assert.match(shell, /atlas-header__actions/);
  assert.match(shell, /preserveHomepageStatus/);
  assert.match(shell, /v0\.1\.1\/atlas-interface-kit\.css/);
  assert.match(shell, /normalizeLegacySemantics/);
  assert.match(shellCss, /grid-template-columns:\s*repeat\(5,\s*1fr\)/);
});

test("estate page titles use the page-first double-slash convention", () => {
  assert.equal(normalizeAtlasTitle("Atlas Systems"), "Atlas Systems");
  assert.equal(normalizeAtlasTitle("Work — Atlas Systems"), "Work // Atlas Systems");
  assert.equal(normalizeAtlasTitle("Atlas Systems // Status"), "Status // Atlas Systems");
});

test("interface-kit vendor copy matches the canonical SHA-256 manifest", () => {
  const versions = fs.readdirSync("static/vendor/atlas-interface", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(versions, ["v0.1.1"]);

  const manifest = JSON.parse(fs.readFileSync(`${BUNDLE_ROOT}/manifest.json`, "utf8"));
  assert.equal(manifest.schema_version, "atlas-interface-kit/bundle/v1");
  assert.equal(manifest.version, "0.1.1");
  assert.equal(manifest.contract_version, "2.0.0");
  assert.equal(manifest.component_role_count, 25);
  assert.deepEqual(Object.keys(manifest.files).sort(), ["atlas-interface-kit.css", "components.json", "tokens.json"]);

  for (const [name, record] of Object.entries(manifest.files)) {
    const path = `${BUNDLE_ROOT}/${name}`;
    assert.equal(fs.statSync(path).size, record.bytes, `${name} byte count`);
    assert.equal(sha256(path), record.sha256, `${name} SHA-256`);
  }

  const tokens = JSON.parse(fs.readFileSync(`${BUNDLE_ROOT}/tokens.json`, "utf8"));
  assert.equal(tokens.colour.text_faint, "#888894");
  for (const obsolete of ["atlas-interface.css", "atlas-interface.js", "tokens.schema.json"]) {
    assert.equal(fs.existsSync(`${BUNDLE_ROOT}/${obsolete}`), false, `${obsolete} must not remain`);
  }
});

test("new directory routes and preserved console exist", () => {
  for (const path of ["systems/index.html", "lab/index.html", "lab/system-map/index.html", "lab/console/index.html"]) {
    assert.equal(fs.existsSync(path), true, `${path} must exist`);
  }
  const headers = fs.readFileSync("_headers", "utf8");
  assert.match(headers, /\/lab\/console\/\*/);
  assert.match(headers, /X-Robots-Tag: noindex/);
});

test("Lab route contract uses the dedicated map and operations routes", () => {
  const shell = fs.readFileSync("lab/shared/shell.js", "utf8");
  assert.match(shell, /System Map", href: "\/lab\/system-map\//);
  assert.match(shell, /Operations", href: "\/lab\/console\//);
  assert.match(shell, /Shape Detector", href: "\/lab\/anomaly\//);
  const landing = fs.readFileSync("lab/index.html", "utf8");
  assert.ok(landing.indexOf('id="ramone-card"') < landing.indexOf('id="featured-title"'));
  assert.match(landing, /Experience/);
  assert.match(landing, /Observe/);
  assert.match(landing, /Verify/);
  assert.match(landing, /Explore/);
});

test("Lab and Systems cards carry operation-specific visual identities", () => {
  const lab = fs.readFileSync("lab/index.html", "utf8");
  const systems = fs.readFileSync("systems/index.html", "utf8");
  const directoryCss = fs.readFileSync("static/css/v2-directory-pages.css", "utf8");

  assert.match(lab, /class="card-grid featured-grid"/);
  assert.match(lab, /class="card-grid directory-grid verify-grid"/);
  assert.match(lab, /class="card-grid directory-grid explore-grid"/);
  assert.match(systems, /class="card-grid product-showcase"/);
  assert.match(systems, /class="card-grid systems-tools-grid"/);
  assert.ok((lab.match(/data-visual=/g) || []).length >= 15);
  assert.ok((systems.match(/data-visual=/g) || []).length >= 15);

  for (const visual of ["ramone", "symphony", "signal", "map", "proof", "status", "conformance", "reliability", "api", "anomaly"]) {
    assert.match(directoryCss, new RegExp(`\\[data-visual="${visual}"\\]`));
  }
  assert.match(directoryCss, /prefers-reduced-motion:reduce/);
});

test("reduced-motion and legacy Lab compatibility stay explicit", () => {
  const transitions = fs.readFileSync("js/transitions.js", "utf8");
  const shell = fs.readFileSync("static/js/estate-shell.js", "utf8");
  assert.match(transitions, /data-ramone-reduced-musing/);
  assert.match(shell, /replaceHeading\(ramoneHeading, "h2"\)/);
  assert.match(shell, /map\.setAttribute\("role", "group"\)/);
});

test("specialist Lab wrappers preserve original tool modules", () => {
  const wrappers = [
    ["lab/proof-chain/proof-chain.js", "./proof-chain-core.js"],
    ["lab/signal/signal-v2.js", "./signal-v2-core.js"],
    ["lab/anomaly/anomaly.js", "./anomaly-core.js"],
    ["lab/conformance/conformance.js", "./conformance-core.js"],
    ["lab/reliability/reliability.js", "./reliability-core.js"],
  ];
  for (const [wrapper, coreImport] of wrappers) {
    const source = fs.readFileSync(wrapper, "utf8");
    assert.match(source, /import "\.\.\/shared\/shell\.js";/);
    assert.ok(source.includes(`import "${coreImport}";`));
  }
});

test("System SYMPHONY implementation remains outside this migration", () => {
  const interfaceFiles = [
    "static/js/estate-shell.js",
    "static/js/estate-status.js",
    "static/css/estate-shell.css",
    "static/css/v2-directory-pages.css",
    "lab/shared/shell.js",
    "lab/index.html",
    "lab/system-map/index.html",
    "systems/index.html",
  ];
  assert.equal(interfaceFiles.some((path) => path.includes("static/js/sonify")), false);
});

test("production deployment remains independent from Cloudflare Git integration", () => {
  const deploy = fs.readFileSync(".github/workflows/deploy.yml", "utf8");

  assert.doesNotMatch(deploy, /source_changed/);
  assert.doesNotMatch(deploy, /\[skip ci\]/);
  assert.doesNotMatch(deploy, /git push/);
  assert.match(deploy, /wrangler|validate-static\.yml/);
  assert.match(deploy, /verify-production:/);
  assert.match(deploy, /build-commit/);
  assert.match(deploy, /https:\/\/atlas-systems\.uk/);
  assert.match(deploy, /needs: \[deploy, verify-production\]/);
});

test("mutable site responses revalidate while versioned interface assets stay immutable", () => {
  const headers = fs.readFileSync("_headers", "utf8");

  assert.match(headers, /\/\*\n(?:.|\n)*Cache-Control: no-cache, max-age=0, must-revalidate/);
  assert.match(headers, /\/static\/vendor\/atlas-interface\/\*/);
  assert.match(headers, /! Cache-Control/);
  assert.match(headers, /Cache-Control: public, max-age=31536000, immutable/);
  assert.doesNotMatch(headers, /\/static\/audio\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
  assert.doesNotMatch(headers, /stale-while-revalidate/);
});
