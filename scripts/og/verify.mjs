// CI gate for estate social previews (dependency-free; no rasteriser, no npm install).
// Fails if a local route or external satellite lacks a committed 1200x630 PNG,
// identifiers collide, local social metadata is incomplete, or any HTML page with
// og:image falls outside the resolved local route set.
// Run: npm run og:verify
import fs from "node:fs";
import path from "node:path";
import {
  REPO,
  OUT_DIR,
  CANVAS,
  canonicalHref,
  entryIdentityErrors,
  loadManifest,
  metaContent,
  ogImageHtmlFiles,
  resolveRoutes,
  resolveSatellites,
  socialImageAlt,
} from "./routes.mjs";

const manifest = loadManifest();
const localRoutes = resolveRoutes(manifest);
const satellites = resolveSatellites(manifest);
const entries = [...localRoutes, ...satellites];
const errors = entryIdentityErrors(entries);

function pngSize(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
}

function requireMeta(html, entry, key, expected = null) {
  const value = metaContent(html, key);
  if (value === null || value.trim() === "") {
    errors.push(`${entry.html}: missing ${key}`);
    return;
  }
  if (expected !== null && value !== expected) {
    errors.push(`${entry.html}: ${key} is ${JSON.stringify(value)}, expected ${JSON.stringify(expected)}`);
  }
}

for (const entry of entries) {
  const image = path.join(OUT_DIR, `${entry.file}.png`);
  if (!fs.existsSync(image)) {
    errors.push(`${entry.file}: missing og/${entry.file}.png (run npm run og:build)`);
  } else {
    const dimensions = pngSize(image);
    if (!dimensions) errors.push(`${entry.file}: og/${entry.file}.png is not a valid PNG`);
    else if (dimensions.w !== CANVAS.w || dimensions.h !== CANVAS.h) {
      errors.push(
        `${entry.file}: og/${entry.file}.png is ${dimensions.w}x${dimensions.h}, ` +
        `expected ${CANVAS.w}x${CANVAS.h}`,
      );
    }
  }

  if (entry.external) continue;

  const htmlPath = path.join(REPO, entry.html);
  if (!fs.existsSync(htmlPath)) {
    errors.push(`${entry.file}: missing local HTML ${entry.html}`);
    continue;
  }

  const html = fs.readFileSync(htmlPath, "utf8");
  const expectedImage = `https://atlas-systems.uk/og/${entry.file}.png`;
  const expectedAlt = socialImageAlt(entry);

  if (html.includes("https://atlas-systems.uk/og-default.png")) {
    errors.push(`${entry.html}: still references og-default.png`);
  }

  if (canonicalHref(html) === null) errors.push(`${entry.html}: missing canonical link`);
  requireMeta(html, entry, "og:type");
  requireMeta(html, entry, "og:title");
  requireMeta(html, entry, "og:description");
  requireMeta(html, entry, "og:url");
  requireMeta(html, entry, "og:site_name", "Atlas Systems");
  requireMeta(html, entry, "og:image", expectedImage);
  requireMeta(html, entry, "og:image:width", String(CANVAS.w));
  requireMeta(html, entry, "og:image:height", String(CANVAS.h));
  requireMeta(html, entry, "og:image:alt", expectedAlt);
  requireMeta(html, entry, "twitter:card", "summary_large_image");
  requireMeta(html, entry, "twitter:title");
  requireMeta(html, entry, "twitter:description");
  requireMeta(html, entry, "twitter:image", expectedImage);
  requireMeta(html, entry, "twitter:image:alt", expectedAlt);
}

// Bidirectional: nothing with static og:image may fall outside the local route set.
const resolvedHtml = new Set(localRoutes.map((entry) => entry.html));
for (const file of ogImageHtmlFiles()) {
  if (!resolvedHtml.has(file)) {
    errors.push(
      `${file}: declares og:image but has no local card ` +
      `(add a manifest route or ensure it is a discoverable /writing/ article)`,
    );
  }
}

if (errors.length) {
  console.error(`Estate social-preview check failed (${errors.length}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const auto = localRoutes.filter((entry) => entry.auto).length;
console.log(
  `Estate social-preview check passed: ${entries.length} cards ` +
  `(${localRoutes.length} local, ${satellites.length} external, ${auto} auto-discovered), ` +
  `all ${CANVAS.w}x${CANVAS.h}; every local route is fully wired.`,
);
