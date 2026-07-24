import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveArticleEntry,
  metaContent,
  replaceMetaContent,
} from "./routes.mjs";

test("metadata discovery is independent of attribute order and quote style", () => {
  const html = `
    <meta content="Ordered last" property="og:title">
    <meta content='A useful description' name='description'>
    <meta content="https://atlas-systems.uk/og/stale.png"
          property="og:image">
  `;

  assert.equal(metaContent(html, "og:title"), "Ordered last");
  assert.equal(metaContent(html, "description"), "A useful description");
  assert.equal(
    metaContent(html, "og:image"),
    "https://atlas-systems.uk/og/stale.png",
  );
});

test("article derivation reads content-first social metadata", () => {
  const entry = deriveArticleEntry(
    "ordered-last",
    "writing/ordered-last/index.html",
    `
      <meta content="Ordered Last // Atlas Systems" property="og:title">
      <meta content="A description discovered without relying on attribute order."
            property="og:description">
    `,
  );

  assert.equal(entry.route, "/writing/ordered-last/");
  assert.deepEqual(entry.title, ["Ordered [Last]"]);
  assert.match(entry.tagline, /^A description discovered/);
});

test("wiring replaces arbitrary stale social-card URLs", () => {
  const html = `
    <meta content="https://old.example/previous-card.png" property="og:image">
    <meta name="twitter:image" content="/og/a-different-stale-card.png">
    <meta content="Old alt text" property="og:image:alt">
  `;
  const card = "https://atlas-systems.uk/og/writing.png";

  let wired = replaceMetaContent(html, "og:image", card);
  wired = replaceMetaContent(wired, "twitter:image", card);
  wired = replaceMetaContent(wired, "og:image:alt", 'Writing "Atlas"');

  assert.equal(metaContent(wired, "og:image"), card);
  assert.equal(metaContent(wired, "twitter:image"), card);
  assert.equal(metaContent(wired, "og:image:alt"), "Writing &quot;Atlas&quot;");
  assert.doesNotMatch(wired, /old\.example|different-stale-card|Old alt text/);
});
