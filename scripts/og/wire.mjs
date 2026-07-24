// Point each route's og:image / twitter:image at its own card and set a
// route-specific og:image:alt. Idempotent. Run: npm run og:wire
import fs from "node:fs";
import path from "node:path";
import { REPO, loadManifest, resolveRoutes } from "./routes.mjs";

const OLD = "https://atlas-systems.uk/og-default.png";
let changed = 0;

for (const entry of resolveRoutes(loadManifest())) {
  const file = path.join(REPO, entry.html);
  const before = fs.readFileSync(file, "utf8");
  const url = `https://atlas-systems.uk/og/${entry.file}.png`;
  const alt = `${entry.title.map((l) => l.replace(/[[\]]/g, "")).join(" ")} — Atlas Systems`;

  let html = before.split(OLD).join(url);
  // Update og:image:alt within its meta tag (tolerant of multi-line tags / attr order).
  html = html.replace(/<meta\b[^>]*property="og:image:alt"[^>]*>/, (tag) =>
    tag.replace(/content="[^"]*"/, `content="${alt.replace(/"/g, "&quot;")}"`),
  );

  if (html !== before) {
    fs.writeFileSync(file, html);
    changed++;
    console.log(`  wired ${entry.html} -> og/${entry.file}.png`);
  }
}
console.log(`\nUpdated ${changed} route file(s).`);
