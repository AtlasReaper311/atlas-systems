// CI gate for route social previews (platform-independent; does not byte-diff).
// Fails if: a manifest route lacks a committed 1200x630 PNG, or a route's HTML does
// not reference its own /og/<file>.png in both og:image and twitter:image.
// Run: npm run og:verify
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Self-contained (no heavy deps) so CI can run it without `npm install`.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const OUT_DIR = path.join(REPO, "og");
const CANVAS = { w: 1200, h: 630 };

const manifest = JSON.parse(fs.readFileSync(path.join(REPO, "scripts", "og", "manifest.json"), "utf8"));
const errors = [];

function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

for (const entry of manifest.routes) {
  const img = path.join(OUT_DIR, `${entry.file}.png`);
  if (!fs.existsSync(img)) {
    errors.push(`${entry.file}: missing og/${entry.file}.png (run npm run og:build)`);
  } else {
    const dim = pngSize(img);
    if (!dim) errors.push(`${entry.file}: og/${entry.file}.png is not a valid PNG`);
    else if (dim.w !== CANVAS.w || dim.h !== CANVAS.h)
      errors.push(`${entry.file}: og/${entry.file}.png is ${dim.w}x${dim.h}, expected ${CANVAS.w}x${CANVAS.h}`);
  }

  const htmlPath = path.join(REPO, entry.html);
  if (!fs.existsSync(htmlPath)) {
    errors.push(`${entry.file}: html ${entry.html} not found`);
    continue;
  }
  const html = fs.readFileSync(htmlPath, "utf8");
  const url = `/og/${entry.file}.png`;
  // Parse each <meta> tag (tolerant of multi-line tags and attribute order).
  const metas = html.match(/<meta\b[^>]*>/g) || [];
  const wired = (key) =>
    metas.some(
      (m) =>
        new RegExp(`(?:property|name)="${key}"`).test(m) &&
        new RegExp(`content="[^"]*/og/${entry.file}\\.png"`).test(m),
    );
  if (!wired("og:image")) errors.push(`${entry.html}: og:image does not point at ${url}`);
  if (!wired("twitter:image")) errors.push(`${entry.html}: twitter:image does not point at ${url}`);
}

if (errors.length) {
  console.error(`Route social-preview check failed (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`Route social-preview check passed: ${manifest.routes.length} routes, all 1200x630 and wired.`);
