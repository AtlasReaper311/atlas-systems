import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

const stylesheetHref =
  "/static/css/article-interface-v2.css?v=20260724-phase-b-v1";
const articles = [
  ["sonin-generative-system", "W-01"],
  ["slampunk-dynamic-mix-engine", "W-02"],
  ["ramone-local-ai-system", "W-03"],
  ["overclocking-specular-core", "W-04"],
];

test("historical articles consume one versioned presentation layer", () => {
  for (const [slug, number] of articles) {
    const html = fs.readFileSync(`writing/${slug}/index.html`, "utf8");
    assert.equal(
      html.split(`href="${stylesheetHref}"`).length - 1,
      1,
      `${number} must contain one exact presentation stylesheet`,
    );
    assert.match(html, new RegExp(`article-index">\\s*${number}`));
  }
});

test("historical article shells expose the current Systems route", () => {
  for (const [slug, number] of articles) {
    const html = fs.readFileSync(`writing/${slug}/index.html`, "utf8");
    assert.match(
      html,
      /<a href="\/systems\/" class="nav-link">Systems<\/a>/,
      `${number} desktop navigation must expose Systems`,
    );
    assert.match(
      html,
      /<a href="\/systems\/" class="mobile-nav-item">[\s\S]*?Systems<\/a>/,
      `${number} mobile navigation must expose Systems`,
    );
  }
});

test("presentation refresh preserved bodies before the approved title normalization", () => {
  const previous = JSON.parse(
    fs.readFileSync(
      "docs/evidence/published-article-head-refresh-v1.json",
      "utf8",
    ),
  );
  const current = JSON.parse(
    fs.readFileSync(
      "docs/evidence/historical-article-presentation-v1.json",
      "utf8",
    ),
  );
  const previousBodies = new Map(
    previous.articles.map((article) => [
      article.slug,
      article.body_sha256_after,
    ]),
  );

  assert.equal(
    current.schema,
    "atlas-scheduler/published-article-presentation-refresh/v1",
  );
  assert.equal(current.production_write, false);
  assert.equal(current.articles.length, articles.length);
  for (const article of current.articles) {
    assert.equal(article.body_unchanged, true);
    assert.equal(article.body_sha256_before, article.body_sha256_after);
    assert.equal(
      article.body_sha256_after,
      previousBodies.get(article.slug),
    );
  }
  assert.equal(current.protected_indexes["writing/index.html"].unchanged, true);
  assert.equal(current.protected_indexes["work/index.html"].unchanged, true);
});

test("shared article layer carries the long-form accessibility contract", () => {
  const css = fs.readFileSync(
    "static/css/article-interface-v2.css",
    "utf8",
  );
  assert.match(css, /body\s*\{[\s\S]*font-size:\s*16px/);
  assert.match(css, /\.prose p,[\s\S]*font-size:\s*16px/);
  assert.match(css, /\.article-subtitle,[\s\S]*font-size:\s*14px/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /main\s*\{[\s\S]*overflow-x:\s*clip/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /\.model-table,[\s\S]*table-layout:\s*fixed/);
  assert.match(css, /\.prose pre\s*\{[\s\S]*white-space:\s*pre-wrap/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /focus-visible/);
});

test("SPECULAR-CORE uses a colon in titles and an em dash in subheaders", () => {
  const titleEvidence = JSON.parse(
    fs.readFileSync(
      "docs/evidence/specular-core-title-normalization-v1.json",
      "utf8",
    ),
  );
  const subheaderEvidence = JSON.parse(
    fs.readFileSync(
      "docs/evidence/specular-core-subheader-normalization-v1.json",
      "utf8",
    ),
  );
  const article = fs.readFileSync(
    "writing/overclocking-specular-core/index.html",
    "utf8",
  );
  const writingIndex = fs.readFileSync("writing/index.html", "utf8");

  assert.equal(
    titleEvidence.schema,
    "atlas-systems/specular-core-title-normalization/v1",
  );
  assert.equal(titleEvidence.production_write, false);
  assert.equal(
    subheaderEvidence.schema,
    "atlas-systems/specular-core-subheader-normalization/v1",
  );
  assert.equal(subheaderEvidence.production_write, false);
  assert.deepEqual(
    subheaderEvidence.files.map(({ path }) => path),
    ["writing/overclocking-specular-core/index.html", "writing/index.html"],
  );
  assert.match(
    article,
    /<title>SPECULAR-CORE: Hardware Tuning \/\/ Atlas Systems<\/title>/,
  );
  assert.match(
    article,
    /<h1 class="article-title">Pushing the Limits: Overclocking SPECULAR-CORE<\/h1>/,
  );
  assert.match(
    article,
    /<div class="article-subtitle">SPECULAR-CORE — Hardware Tuning<\/div>/,
  );
  assert.match(
    writingIndex,
    /<h2 class="article-title">Pushing the Limits: Overclocking SPECULAR-CORE<\/h2>/,
  );
  assert.match(
    writingIndex,
    /<h2 id="writing-feature-heading">Pushing the Limits: Overclocking SPECULAR-CORE<\/h2>/,
  );
  assert.match(
    writingIndex,
    /<div class="article-subtitle">SPECULAR-CORE — Hardware Tuning \/\/ Case Study<\/div>/,
  );
  assert.doesNotMatch(
    article,
    /Pushing the Limits — Overclocking SPECULAR-CORE/,
  );
  assert.doesNotMatch(
    writingIndex,
    /Pushing the Limits — Overclocking SPECULAR-CORE/,
  );
});

test("browser evidence inventory covers every historical article route", () => {
  const sitemap = fs.readFileSync("sitemap.xml", "utf8");
  const capture = fs.readFileSync("scripts/capture_interface_evidence.mjs", "utf8");
  assert.match(capture, /buildEvidencePlan/);
  for (const [slug, number] of articles) {
    assert.ok(
      sitemap.includes(`<loc>https://atlas-systems.uk/writing/${slug}/</loc>`),
      `${number} route must remain in the sitemap-derived evidence inventory`,
    );
  }
});
