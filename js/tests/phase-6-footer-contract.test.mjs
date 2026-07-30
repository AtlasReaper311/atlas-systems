import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  footerConfiguration,
  isExcludedFooterRoute,
  normalizePath,
  resolveFooterVariant,
} from "../../static/js/phase-6-footer.js";

const CLASSIC_WRITING_ARTICLES = [
  "writing/sonin-generative-system/index.html",
  "writing/slampunk-dynamic-mix-engine/index.html",
  "writing/ramone-local-ai-system/index.html",
  "writing/overclocking-specular-core/index.html",
  "writing/atlas-pipeline-infrastructure-dashboard/index.html",
  "writing/atlas-systems-cicd-pipeline/index.html",
  "writing/atlas-lab-observability/index.html",
];

function linkCount(configuration) {
  return [...configuration.context, ...configuration.evidence, ...configuration.escape]
    .filter((item) => typeof item !== "string")
    .length;
}

test("route resolver separates estate, tool, and excluded surfaces", () => {
  assert.equal(normalizePath("/about"), "/about/");
  assert.equal(resolveFooterVariant("/"), "estate");
  assert.equal(resolveFooterVariant("/work/"), "estate");
  assert.equal(resolveFooterVariant("/lab/"), "tool");
  assert.equal(resolveFooterVariant("/lab/bearing/"), "tool");
  assert.equal(resolveFooterVariant("/systems/reliability/"), "tool");
  assert.equal(resolveFooterVariant("/lab/console/"), null);
  assert.equal(resolveFooterVariant("/writing/sonin-generative-system/"), null);
  assert.equal(isExcludedFooterRoute("/writing/ramone-local-ai-system/"), true);
});

test("estate and tool profiles remain governed without duplicating global navigation", () => {
  const estate = footerConfiguration("/about/", "About // Atlas Systems");
  assert.equal(estate.variant, "estate");
  assert.ok(estate.identity.name);
  assert.deepEqual(estate.context, []);
  assert.ok(estate.escape.length > 0);
  assert.equal(linkCount(estate), 3);
  assert.equal("sequence" in estate, false);

  const tool = footerConfiguration(
    "/lab/bearing/",
    "The Bearing // Atlas Systems",
    "Bearing since you arrived",
  );
  assert.equal(tool.variant, "tool");
  assert.equal(tool.identity.name, "The Bearing");
  assert.ok(tool.context.length > 0);
  assert.ok(tool.escape.length > 0);
  assert.equal(tool.evidence[0], "Bearing since you arrived");
  assert.equal(linkCount(tool), 4);
  assert.equal("sequence" in tool, false);
});

test("shared estate-search path installs the footer without editing content pages", () => {
  const renderer = fs.readFileSync("static/js/estate-search/render.js", "utf8");
  assert.match(renderer, /import "\.\.\/phase-6-footer\.js";/);
  for (const path of [
    "index.html",
    "404.html",
    "work/index.html",
    "writing/index.html",
    "systems/index.html",
    "about/index.html",
  ]) {
    assert.match(
      fs.readFileSync(path, "utf8"),
      /\/static\/js\/estate-search\/global-search\.js/,
      `${path} must retain the shared module path`,
    );
  }
});

test("Pages artifact and production rollout require the Phase 6 footer assets", () => {
  const prepare = fs.readFileSync("scripts/prepare_pages_publish.sh", "utf8");
  const verifier = fs.readFileSync("scripts/verify_pages_output.py", "utf8");
  const deploy = fs.readFileSync(".github/workflows/deploy.yml", "utf8");

  for (const asset of [
    "static/js/phase-6-footer.js",
    "static/css/phase-6-footer.css",
    "static/js/estate-search/render.js",
  ]) {
    assert.match(prepare, new RegExp(asset.replaceAll("/", "\\/")));
    assert.match(verifier, new RegExp(asset.replaceAll("/", "\\/")));
  }

  assert.match(deploy, /name: Confirm Phase 6 footer assets are live/);
  assert.match(deploy, /const FOOTER_STYLESHEET/);
  assert.match(deploy, /atlas-interface-kit v0\.4\.0/);
});

test("footer-only stylesheet keeps a single compact rail and immutable v0.4.0 behaviour", () => {
  const css = fs.readFileSync("static/css/phase-6-footer.css", "utf8");
  assert.match(css, /atlas-interface-kit v0\.4\.0/);
  assert.match(css, /\.atlas-footer\s*\{[\s\S]*display: flex;/);
  assert.match(css, /flex-wrap: wrap/);
  assert.match(css, /margin: var\(--atlas-space-7, 48px\) auto 0/);
  assert.match(css, /padding: var\(--atlas-space-4, 16px\) var\(--atlas-space-5, 24px\)/);
  assert.match(css, /\.atlas-footer__identity/);
  assert.match(css, /\.atlas-footer__context/);
  assert.match(css, /\.atlas-footer__evidence/);
  assert.match(css, /\.atlas-footer__escape/);
  assert.match(css, /text-decoration: underline/);
  assert.match(css, /min-width: var\(--atlas-touch-min, 44px\)/);
  assert.match(css, /min-height: var\(--atlas-touch-min, 44px\)/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /\.atlas-footer__sequence/);
});

test("Bearing light mode bridges its local palette into accessible footer tokens", () => {
  const css = fs.readFileSync("static/css/phase-6-footer.css", "utf8");
  assert.match(css, /:root:not\(\[data-theme="dark"\]\) body:has\(#lattice\)/);
  assert.match(css, /:root\[data-theme="light"\] body:has\(#lattice\)/);
  assert.match(css, /--bearing-phase6-accessible-accent: #8a4c00/);
  assert.match(css, /--bearing-phase6-accessible-muted: #5b5d60/);
  assert.match(css, /--atlas-text: #171a20/);
  assert.match(css, /--atlas-text-dim: #5b5d60/);
  assert.match(css, /--atlas-text-faint: #5b5d60/);
  assert.match(css, /body:has\(#lattice\) \.step \.n/);
  assert.match(css, /body:has\(#lattice\) pre\.snip \.a/);
  assert.match(css, /body:has\(#lattice\) pre\.snip \.c/);
});

test("Bearing narrow code sample wraps instead of creating an unfocusable scroll region", () => {
  const css = fs.readFileSync("static/css/phase-6-footer.css", "utf8");
  assert.match(
    css,
    /@media \(max-width: 767px\)[\s\S]*body:has\(#lattice\) pre\.snip\s*\{[\s\S]*overflow-x: visible;[\s\S]*overflow-wrap: anywhere;[\s\S]*white-space: pre-wrap;/,
  );
});

test("W-01 through W-07 keep the classic scheduler-owned footer", () => {
  for (const path of CLASSIC_WRITING_ARTICLES) {
    const html = fs.readFileSync(path, "utf8");
    const match = html.match(/<div class="article-footer">([\s\S]*?)<\/div>/);
    assert.ok(match, `${path} classic footer`);
    assert.doesNotMatch(match[0], /<footer\b/);
    assert.doesNotMatch(match[0], /atlas-footer/);
    assert.doesNotMatch(match[0], /Writing index/);
  }
});

test("Bearing opts into the shared installer while the console stays deferred", () => {
  const bearing = fs.readFileSync("lab/bearing/index.html", "utf8");
  assert.match(bearing, /\/static\/js\/phase-6-footer\.js\?v=20260730-phase-6-v1/);

  const consolePage = fs.readFileSync("lab/console/index.html", "utf8");
  assert.doesNotMatch(consolePage, /data-atlas-phase6-footer/);
  assert.equal(isExcludedFooterRoute("/lab/console/"), true);
});
