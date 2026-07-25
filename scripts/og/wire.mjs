// Materialise complete static social metadata for every local route. External
// satellites are rendered here but wired in their owning repositories.
// Idempotent. Run: npm run og:wire
import fs from "node:fs";
import path from "node:path";
import {
  REPO,
  canonicalHref,
  documentTitle,
  ensureCanonical,
  ensureMetaContent,
  loadManifest,
  metaContent,
  plain,
  resolveRoutes,
  socialImageAlt,
  upsertMetaContent,
} from "./routes.mjs";

const ORIGIN = "https://atlas-systems.uk";
let changed = 0;

for (const entry of resolveRoutes(loadManifest())) {
  const file = path.join(REPO, entry.html);
  const before = fs.readFileSync(file, "utf8");
  const productionUrl = `${ORIGIN}${entry.route}`;
  const imageUrl = `${ORIGIN}/og/${entry.file}.png`;
  const alt = socialImageAlt(entry);
  const fallbackTitle = entry.title.map(plain).join(" ");

  let html = ensureCanonical(before, productionUrl);
  const canonical = canonicalHref(html) ?? productionUrl;
  const title =
    metaContent(html, "og:title") ??
    documentTitle(html) ??
    fallbackTitle;
  const description =
    metaContent(html, "og:description") ??
    metaContent(html, "description") ??
    entry.tagline;

  html = ensureMetaContent(html, "og:type", "website");
  html = ensureMetaContent(html, "og:title", title);
  html = ensureMetaContent(html, "og:description", description);
  html = ensureMetaContent(html, "og:url", canonical);
  html = ensureMetaContent(html, "og:site_name", "Atlas Systems");
  html = upsertMetaContent(html, "og:image", imageUrl);
  html = upsertMetaContent(html, "og:image:width", "1200");
  html = upsertMetaContent(html, "og:image:height", "630");
  html = upsertMetaContent(html, "og:image:alt", alt);

  html = ensureMetaContent(html, "twitter:card", "summary_large_image");
  html = ensureMetaContent(html, "twitter:title", title);
  html = ensureMetaContent(html, "twitter:description", description);
  html = upsertMetaContent(html, "twitter:image", imageUrl);
  html = upsertMetaContent(html, "twitter:image:alt", alt);

  if (html !== before) {
    fs.writeFileSync(file, html);
    changed++;
    console.log(`  wired ${entry.html} -> og/${entry.file}.png`);
  }
}

console.log(`\nUpdated ${changed} local route file(s).`);
