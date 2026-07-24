// Generate every route's social-preview PNG into /og/. Run: npm run og:build
import fs from "node:fs";
import path from "node:path";
import { prepareFonts, buildSvg, renderPng, OUT_DIR, REPO } from "./lib.mjs";

const manifest = JSON.parse(fs.readFileSync(path.join(REPO, "scripts", "og", "manifest.json"), "utf8"));
const { fontFiles, measure } = await prepareFonts();
fs.mkdirSync(OUT_DIR, { recursive: true });

let n = 0;
for (const entry of manifest.routes) {
  const png = renderPng(buildSvg(entry, measure), fontFiles);
  const out = path.join(OUT_DIR, `${entry.file}.png`);
  fs.writeFileSync(out, png);
  console.log(`  og/${entry.file}.png  ${(png.length / 1024).toFixed(1)} KB  ${entry.route}`);
  n++;
}
console.log(`\nGenerated ${n} route preview cards into /og/.`);
