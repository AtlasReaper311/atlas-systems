// Route social-preview card generation.
// Renders a deterministic 1200x630 PNG per route from the estate's own tokens and
// self-hosted faces. No browser, no network. See scripts/og/manifest.json for copy.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decompress } from "wawoff2";
import { create as createFont } from "fontkit";
import { Resvg } from "@resvg/resvg-js";
import { REPO, OUT_DIR, CANVAS, plain } from "./routes.mjs";

export { REPO, OUT_DIR, CANVAS };
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FONT_SRC = path.join(REPO, "static", "vendor", "atlas-interface", "v0.2.0", "fonts");
export const CACHE = path.join(HERE, ".fonts"); // gitignored TTF cache
const PAD_X = 64;

const C = {
  ink: "#0a0a0f",
  text: "#e8e8e0",
  dim: "#aaa9a0",
  faint: "#888894",
  accent: "#f5a623",
  grid: "rgba(255,255,255,0.035)",
};
const F = { serif: "DM Serif Display", mono: "IBM Plex Mono", monoMed: "IBM Plex Mono Medium" };

// woff2 in the repo -> decompressed TTF on disk (resvg 2.6 loads font *files*, not buffers).
const FACES = {
  "dm-serif-display-400.woff2": "DMSerifDisplay-Regular.ttf",
  "dm-serif-display-400-italic.woff2": "DMSerifDisplay-Italic.ttf",
  "ibm-plex-mono-400.woff2": "IBMPlexMono-Regular.ttf",
  "ibm-plex-mono-500.woff2": "IBMPlexMono-Medium.ttf",
};

export async function prepareFonts() {
  fs.mkdirSync(CACHE, { recursive: true });
  const fontFiles = [];
  let serifPath;
  for (const [src, out] of Object.entries(FACES)) {
    const dst = path.join(CACHE, out);
    fs.writeFileSync(dst, await decompress(fs.readFileSync(path.join(FONT_SRC, src))));
    fontFiles.push(dst);
    if (out === "DMSerifDisplay-Regular.ttf") serifPath = dst;
  }
  const serif = createFont(fs.readFileSync(serifPath));
  const measure = (text, size) => (serif.layout(text).advanceWidth / serif.unitsPerEm) * size;
  return { fontFiles, measure };
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Split a title line on [accent] markers into escaped tspans (accent = amber italic).
function lineToTspans(line) {
  return line
    .split(/(\[[^\]]*\])/)
    .filter(Boolean)
    .map((p) =>
      p.startsWith("[") && p.endsWith("]")
        ? `<tspan fill="${C.accent}" font-style="italic">${esc(p.slice(1, -1))}</tspan>`
        : `<tspan>${esc(p)}</tspan>`,
    )
    .join("");
}

export function buildSvg(entry, measure) {
  const { w, h } = CANVAS;
  const avail = w - PAD_X * 2;

  // Auto-fit: largest size <= 90 that keeps every title line within the content width.
  const MAX = 90;
  const widest = Math.max(...entry.title.map((ln) => measure(plain(ln), MAX)));
  const size = Math.min(MAX, Math.floor((MAX * avail) / widest));
  const lead = Math.round(size * 1.02);

  const twoLine = entry.title.length > 1;
  const kickerY = twoLine ? 322 : 356;
  const firstY = kickerY + Math.round(size * 1.06) + 8;
  const titles = entry.title
    .map((ln, i) => `<text x="${PAD_X}" y="${firstY + i * lead}" font-family="${F.serif}" font-size="${size}" fill="${C.text}">${lineToTspans(ln)}</text>`)
    .join("\n  ");

  // Brand domain only; the specific route path is already shown top-right.
  const domain = "atlas-systems.uk";
  const ruleW = 34;
  const bottomY = h - 56;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
      <path d="M80 0 H0 V80" fill="none" stroke="${C.grid}" stroke-width="1"/>
    </pattern>
    <radialGradient id="glow" cx="86%" cy="6%" r="62%">
      <stop offset="0%" stop-color="${C.accent}" stop-opacity="0.16"/>
      <stop offset="48%" stop-color="${C.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="${C.ink}"/>
  <rect width="${w}" height="${h}" fill="url(#grid)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  <text x="${PAD_X}" y="94" font-family="${F.monoMed}" font-size="26" letter-spacing="4" fill="${C.text}"><tspan>ATLAS</tspan><tspan fill="${C.accent}">_</tspan><tspan>SYSTEMS</tspan></text>
  <text x="${w - PAD_X}" y="94" text-anchor="end" font-family="${F.mono}" font-size="21" letter-spacing="1" fill="${C.faint}">${esc(entry.route)}</text>
  <rect x="${PAD_X}" y="${kickerY - 8}" width="${ruleW}" height="2" fill="${C.accent}"/>
  <text x="${PAD_X + ruleW + 18}" y="${kickerY}" font-family="${F.monoMed}" font-size="22" letter-spacing="4" fill="${C.accent}">${esc(entry.kicker.toUpperCase())}</text>
  ${titles}
  <text x="${PAD_X}" y="${bottomY}" font-family="${F.mono}" font-size="22" letter-spacing="1" fill="${C.dim}"><tspan fill="${C.accent}">$</tspan> ${esc(domain)}</text>
  ${entry.tagline ? `<text x="${w - PAD_X}" y="${bottomY}" text-anchor="end" font-family="${F.mono}" font-size="19" letter-spacing="0.4" fill="${C.faint}">${esc(entry.tagline)}</text>` : ""}
</svg>`;
}

export function renderPng(svg, fontFiles) {
  return new Resvg(svg, {
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: F.mono },
    fitTo: { mode: "width", value: CANVAS.w },
    background: C.ink,
  })
    .render()
    .asPng();
}
