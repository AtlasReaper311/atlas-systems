import assert from "node:assert/strict";
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

test("presentation evidence proves all protected bodies are unchanged", () => {
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
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /focus-visible/);
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
