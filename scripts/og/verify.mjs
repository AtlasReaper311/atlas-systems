// CI gate for route social previews (dependency-free; no rasteriser, no npm install).
// Fails if: a resolved route lacks a committed 1200x630 PNG or is not wired in both
// og:image and twitter:image, OR any HTML declaring og:image is not a resolved route
// (e.g. a new article/page that still points at the shared default).
// Run: npm run og:verify
import fs from "node:fs";
import path from "node:path";
import {
  REPO,
  OUT_DIR,
  CANVAS,
  loadManifest,
  metaContent,
  resolveRoutes,
  ogImageHtmlFiles,
} from "./routes.mjs";

const routes = resolveRoutes(loadManifest());
const errors = [];

function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

for (const entry of routes) {
  const img = path.join(OUT_DIR, `${entry.file}.png`);
  if (!fs.existsSync(img)) {
    errors.push(`${entry.file}: missing og/${entry.file}.png (run npm run og:build)`);
  } else {
    const dim = pngSize(img);
    if (!dim) errors.push(`${entry.file}: og/${entry.file}.png is not a valid PNG`);
    else if (dim.w !== CANVAS.w || dim.h !== CANVAS.h)
      errors.push(`${entry.file}: og/${entry.file}.png is ${dim.w}x${dim.h}, expected ${CANVAS.w}x${CANVAS.h}`);
  }

  const html = fs.readFileSync(path.join(REPO, entry.html), "utf8");
  const metas = html.match(/<meta\b[^>]*>/g) || [];
  const wired = (key) =>
    metas.some((meta) =>
      metaContent(meta, key)?.endsWith(`/og/${entry.file}.png`));
  if (!wired("og:image")) errors.push(`${entry.html}: og:image does not point at /og/${entry.file}.png`);
  if (!wired("twitter:image")) errors.push(`${entry.html}: twitter:image does not point at /og/${entry.file}.png`);
}

// Bidirectional: nothing with og:image may fall outside the resolved set.
const resolvedHtml = new Set(routes.map((r) => r.html));
for (const file of ogImageHtmlFiles()) {
  if (!resolvedHtml.has(file))
    errors.push(`${file}: declares og:image but has no card (add a manifest entry or ensure it is a discoverable /writing/ article)`);
}

if (errors.length) {
  console.error(`Route social-preview check failed (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
const auto = routes.filter((r) => r.auto).length;
console.log(
  `Route social-preview check passed: ${routes.length} routes (${auto} auto-discovered), all 1200x630 and wired.`,
);
