import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  STATUS_ENDPOINT,
  STATUS_PAGE,
  STATUS_STALE_AFTER_MS,
  parseEstateStatus,
} from "../../static/js/estate-status.js";

const NOW = Date.parse("2026-07-23T08:00:00Z");

function snapshot(operational, total, checkedAt = "2026-07-23T07:55:00Z") {
  return {
    estate: {
      operational,
      total_components: total,
      checked_at: checkedAt,
    },
  };
}

test("status indicator consumes the bounded aggregate contract", () => {
  assert.equal(STATUS_ENDPOINT, "https://api.atlas-systems.uk/v1/stats");
  assert.equal(STATUS_PAGE, "https://status.atlas-systems.uk/");
  assert.equal(STATUS_STALE_AFTER_MS, 1_200_000);
});

test("status mapping distinguishes nominal, degraded, and unavailable", () => {
  assert.equal(parseEstateStatus(snapshot(19, 19), NOW).state, "nominal");
  assert.equal(parseEstateStatus(snapshot(18, 19), NOW).state, "degraded");
  assert.equal(parseEstateStatus(snapshot(10, 19), NOW).state, "degraded");
  assert.equal(parseEstateStatus(snapshot(9, 19), NOW).state, "unavailable");
  assert.equal(parseEstateStatus(snapshot(0, 19), NOW).state, "unavailable");
});

test("missing, impossible, future, and stale evidence remain unknown", () => {
  assert.equal(parseEstateStatus(null, NOW).state, "unknown");
  assert.equal(parseEstateStatus(snapshot(20, 19), NOW).state, "unknown");
  assert.equal(parseEstateStatus(snapshot(19, 19, "2026-07-23T08:05:00Z"), NOW).state, "unknown");
  assert.equal(parseEstateStatus(snapshot(19, 19, "2026-07-23T07:39:59Z"), NOW).state, "unknown");
});

test("canonical browser icon package is locally deployed", () => {
  const required = [
    "favicon.ico",
    "favicon-16x16.png",
    "favicon-32x32.png",
    "apple-touch-icon.png",
    "android-chrome-192x192.png",
    "android-chrome-512x512.png",
    "site.webmanifest",
  ];
  for (const path of required) {
    assert.equal(fs.existsSync(path), true, `${path} must exist`);
    assert.ok(fs.statSync(path).size > 0, `${path} must not be empty`);
  }

  const manifest = JSON.parse(fs.readFileSync("site.webmanifest", "utf8"));
  assert.equal(manifest.name, "Atlas Systems");
  assert.equal(manifest.theme_color, "#0a0a0f");
  assert.equal(manifest.background_color, "#0a0a0f");
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
    assert.equal(fs.existsSync(wrapper.replace(/\.js$/, "-core.js").replace("signal-v2-core-core", "signal-v2-core")), true);
  }
});

test("Lab route contract keeps Ramone home before contextual navigation work", () => {
  const shell = fs.readFileSync("lab/shared/shell.js", "utf8");
  assert.match(shell, /\{ label: "Lab home", href: "\/lab\/" \}/);
  assert.match(shell, /\{ label: "System Map", href: "\/lab\/#system-map" \}/);
  assert.match(shell, /\{ label: "Proof Chain", href: "\/lab\/proof-chain\/" \}/);
  assert.match(shell, /\{ label: "Signal", href: "\/lab\/signal\/" \}/);
  assert.match(shell, /\{ label: "Reliability", href: "\/lab\/reliability\/" \}/);
  assert.match(shell, /\{ label: "Conformance", href: "\/lab\/conformance\/" \}/);
  assert.match(shell, /\{ label: "Anomaly", href: "\/lab\/anomaly\/" \}/);
});

test("homepage receives no duplicate status indicator", () => {
  const shell = fs.readFileSync("static/js/estate-shell.js", "utf8");
  assert.match(
    shell,
    /window\.location\.hostname === "atlas-systems\.uk" && window\.location\.pathname === "\/"/,
  );
});

test("search renderer installs the estate shell once", () => {
  const renderer = fs.readFileSync("static/js/estate-search/render.js", "utf8");
  assert.match(renderer, /import "\.\.\/estate-shell\.js";/);
});

test("System SYMPHONY source files are outside the interface change contract", () => {
  const interfaceFiles = [
    "static/js/estate-shell.js",
    "static/js/estate-status.js",
    "static/css/estate-shell.css",
    "lab/shared/shell.js",
    "lab/shared/systems.css",
  ];
  assert.equal(interfaceFiles.some((path) => path.includes("static/js/sonify")), false);
  assert.equal(interfaceFiles.includes("lab/index.html"), false);
});
