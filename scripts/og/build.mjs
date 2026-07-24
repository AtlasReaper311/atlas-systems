// Generate every local route and external satellite social-preview PNG into /og/.
// Run: npm run og:build
import fs from "node:fs";
import path from "node:path";
import { prepareFonts, buildSvg, renderPng, OUT_DIR } from "./lib.mjs";
import { loadManifest, resolveRoutes, resolveSatellites } from "./routes.mjs";

const manifest = loadManifest();
const entries = [
  ...resolveRoutes(manifest),
  ...resolveSatellites(manifest),
];
const { fontFiles, measure } = await prepareFonts();
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const entry of entries) {
  const png = renderPng(buildSvg(entry, measure), fontFiles);
  fs.writeFileSync(path.join(OUT_DIR, `${entry.file}.png`), png);
  const tags = [entry.auto ? "auto" : null, entry.external ? "external" : null]
    .filter(Boolean)
    .join(", ");
  const suffix = tags ? ` (${tags})` : "";
  console.log(`  og/${entry.file}.png  ${(png.length / 1024).toFixed(1)} KB  ${entry.route}${suffix}`);
}

const localCount = entries.filter((entry) => !entry.external).length;
const satelliteCount = entries.filter((entry) => entry.external).length;
console.log(
  `\nGenerated ${entries.length} preview cards into /og/ ` +
  `(${localCount} local, ${satelliteCount} external).`,
);
