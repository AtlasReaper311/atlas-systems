import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const writingRoot = "writing";
const retiredTokens = [
  "atlas-footer--editorial",
  "atlas-footer__identity",
  "atlas-footer__context",
  "atlas-footer__sequence",
  "atlas-footer__escape",
  "atlas-footer__estate-escape",
  "AUTO-FOOTER: filled in by atlas-scheduler at publish time",
];

function publishedArticles() {
  return fs
    .readdirSync(writingRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      slug: entry.name,
      file: path.join(writingRoot, entry.name, "index.html"),
    }))
    .filter(({ file }) => fs.existsSync(file))
    .map(({ slug, file }) => ({
      slug,
      html: fs.readFileSync(file, "utf8"),
    }))
    .filter(({ html }) => /class="article-index"/.test(html));
}

test("every published Writing article uses the final classic footer", () => {
  const articles = publishedArticles();
  assert.ok(articles.length >= 7, "expected the complete published Writing set");

  for (const { slug, html } of articles) {
    assert.equal(
      html.match(/<div class="article-footer">/g)?.length ?? 0,
      1,
      `${slug} must contain exactly one classic article-footer container`,
    );
    assert.doesNotMatch(
      html,
      /<(?:div|footer) class="[^"]*article-footer[^"]+"/,
      `${slug} must not add classes to the classic footer`,
    );

    for (const token of retiredTokens) {
      assert.ok(!html.includes(token), `${slug} contains retired footer token ${token}`);
    }

    const footer = html.match(/<div class="article-footer">([\s\S]*?)<\/div>/);
    assert.ok(footer, `${slug} classic footer could not be extracted`);
    assert.match(footer[1], /class="footer-back"/);
    assert.ok(
      footer[1].includes("Latest article") ||
        (footer[1].match(/class="footer-back"/g)?.length ?? 0) >= 2,
      `${slug} must expose a forward link or Latest article`,
    );
  }
});

test("long visible prose links wrap without widening the article", () => {
  const css = fs.readFileSync("static/css/article-interface-v2.css", "utf8");
  assert.match(
    css,
    /\.prose a\s*\{[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?\}/,
  );
});
