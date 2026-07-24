// Point each route's og:image / twitter:image at its own card and set a
// route-specific og:image:alt. Idempotent. Run: npm run og:wire
import fs from "node:fs";
import path from "node:path";
import {
  REPO,
  loadManifest,
  replaceMetaContent,
  resolveRoutes,
} from "./routes.mjs";

let changed = 0;

for (const entry of resolveRoutes(loadManifest())) {
  const file = path.join(REPO, entry.html);
  const before = fs.readFileSync(file, "utf8");
  const url = `https://atlas-systems.uk/og/${entry.file}.png`;
  const alt = `${entry.title.map((l) => l.replace(/[[\]]/g, "")).join(" ")} — Atlas Systems`;

  let html = replaceMetaContent(before, "og:image", url);
  html = replaceMetaContent(html, "twitter:image", url);
  html = replaceMetaContent(html, "og:image:alt", alt);

  if (html !== before) {
    fs.writeFileSync(file, html);
    changed++;
    console.log(`  wired ${entry.html} -> og/${entry.file}.png`);
  }
}
console.log(`\nUpdated ${changed} route file(s).`);
