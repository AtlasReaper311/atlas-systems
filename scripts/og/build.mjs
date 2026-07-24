// Generate every route's social-preview PNG into /og/. Run: npm run og:build
import fs from "node:fs";
import path from "node:path";
import { prepareFonts, buildSvg, renderPng, OUT_DIR } from "./lib.mjs";
import { loadManifest, resolveRoutes } from "./routes.mjs";

const routes = resolveRoutes(loadManifest());
const { fontFiles, measure } = await prepareFonts();
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const entry of routes) {
  const png = renderPng(buildSvg(entry, measure), fontFiles);
  fs.writeFileSync(path.join(OUT_DIR, `${entry.file}.png`), png);
  const tag = entry.auto ? " (auto)" : "";
  console.log(`  og/${entry.file}.png  ${(png.length / 1024).toFixed(1)} KB  ${entry.route}${tag}`);
}
console.log(`\nGenerated ${routes.length} route preview cards into /og/.`);
