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

test("SPECULAR-CORE uses the approved colon title without changing other copy", () => {
  const evidence = JSON.parse(
    fs.readFileSync(
      "docs/evidence/specular-core-title-normalization-v1.json",
      "utf8",
    ),
  );
  const article = fs.readFileSync(
    "writing/overclocking-specular-core/index.html",
    "utf8",
  );
  const writingIndex = fs.readFileSync("writing/index.html", "utf8");
  const sha256 = (value) =>
    crypto.createHash("sha256").update(value).digest("hex");

  assert.equal(
    evidence.schema,
    "atlas-systems/specular-core-title-normalization/v1",
  );
  assert.equal(evidence.production_write, false);
  assert.equal(evidence.files[0].after_sha256, sha256(article));
  assert.equal(evidence.files[1].after_sha256, sha256(writingIndex));
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
    /<div class="article-subtitle">SPECULAR-CORE: Hardware Tuning<\/div>/,
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
    /<div class="article-subtitle">SPECULAR-CORE: Hardware Tuning \/\/ Case Study<\/div>/,
  );
  assert.doesNotMatch(
    article,
    /(?:SPECULAR-CORE|Pushing the Limits) — (?:Hardware Tuning|Overclocking SPECULAR-CORE)/,
  );
  assert.doesNotMatch(
    writingIndex,
    /(?:SPECULAR-CORE|Pushing the Limits) — (?:Hardware Tuning|Overclocking SPECULAR-CORE)/,
  );
});

test("browser evidence matrix covers every changed historical route", () => {
  const capture = fs.readFileSync(
    "scripts/capture_interface_evidence.mjs",
    "utf8",
  );
  for (const [slug, number] of articles) {
    assert.match(
      capture,
      new RegExp(
        `\\["article-${number.toLowerCase()}",\\s*"/writing/${slug}/"\\]`,
      ),
    );
  }
});
