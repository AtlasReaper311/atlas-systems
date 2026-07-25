import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalHref,
  deriveArticleEntry,
  ensureCanonical,
  ensureMetaContent,
  entryIdentityErrors,
  metaContent,
  normalizeRepoPath,
  replaceMetaContent,
  resolveSatellites,
  socialImageAlt,
  upsertMetaContent,
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

test("repository-relative paths remain POSIX-shaped on every host", () => {
  assert.equal(
    normalizeRepoPath("writing\\ordered-last\\index.html"),
    "writing/ordered-last/index.html",
  );
  assert.equal(
    normalizeRepoPath("writing/ordered-last/index.html"),
    "writing/ordered-last/index.html",
  );
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

test("missing social metadata and canonical links are inserted idempotently", () => {
  const source = `<!doctype html>\n<html><head>\n<title>Proof Chain // Atlas Systems</title>\n</head><body></body></html>`;
  const canonical = "https://atlas-systems.uk/lab/proof-chain/";

  let html = ensureCanonical(source, canonical);
  html = ensureCanonical(html, canonical);
  html = ensureMetaContent(html, "og:type", "website");
  html = ensureMetaContent(html, "og:type", "website");
  html = upsertMetaContent(html, "twitter:image:alt", "Proof, connected. // Atlas Systems");

  assert.equal(canonicalHref(html), canonical);
  assert.equal(metaContent(html, "og:type"), "website");
  assert.equal(
    metaContent(html, "twitter:image:alt"),
    "Proof, connected. // Atlas Systems",
  );
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  assert.equal((html.match(/property="og:type"/g) || []).length, 1);
});

test("satellites are external render-only entries", () => {
  const [entry] = resolveSatellites({
    satellites: [
      {
        file: "status",
        route: "status.atlas-systems.uk",
        kicker: "Estate health",
        title: ["Live estate [status.]"],
        tagline: "Real-time public health evidence.",
      },
    ],
  });

  assert.equal(entry.external, true);
  assert.equal(entry.html, undefined);
  assert.equal(socialImageAlt(entry), "Live estate status. // Atlas Systems");
});

test("entry validation rejects duplicate card identifiers and routes", () => {
  const errors = entryIdentityErrors([
    {
      file: "status",
      html: "status/index.html",
      route: "/status/",
      kicker: "Status",
      title: ["Status"],
      tagline: "One",
      external: false,
    },
    {
      file: "status",
      route: "/status/",
      kicker: "Satellite",
      title: ["Status"],
      tagline: "Two",
      external: true,
    },
  ]);

  assert.ok(errors.some((error) => error.includes("duplicate card file")));
  assert.ok(errors.some((error) => error.includes("duplicate route")));
});
