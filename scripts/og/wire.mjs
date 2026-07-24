// One-off: point each route's og:image / twitter:image at its own card and set a
// route-specific og:image:alt. Idempotent. Run: node scripts/og/wire.mjs
import fs from "node:fs";
import path from "node:path";
import { REPO } from "./lib.mjs";

const manifest = JSON.parse(fs.readFileSync(path.join(REPO, "scripts", "og", "manifest.json"), "utf8"));
const OLD = "https://atlas-systems.uk/og-default.png";
let changed = 0;

for (const entry of manifest.routes) {
  const file = path.join(REPO, entry.html);
  let html = fs.readFileSync(file, "utf8");
  const before = html;
  const url = `https://atlas-systems.uk/og/${entry.file}.png`;
  const alt = entry.title.map((l) => l.replace(/[[\]]/g, "")).join(" ") + " — Atlas Systems";

  html = html.split(OLD).join(url);
  // Update og:image:alt content within its meta tag (tolerant of multi-line tags / attr order).
  html = html.replace(/<meta\b[^>]*property="og:image:alt"[^>]*>/, (tag) =>
    tag.replace(/content="[^"]*"/, `content="${alt.replace(/"/g, "&quot;")}"`),
  );

  if (html !== before) {
    fs.writeFileSync(file, html);
    changed++;
    console.log(`  wired ${entry.html} -> og/${entry.file}.png`);
  } else {
    console.log(`  (no change) ${entry.html}`);
  }
}
console.log(`\nUpdated ${changed}/${manifest.routes.length} route files.`);
