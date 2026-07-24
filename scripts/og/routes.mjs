// Route resolution for social-preview cards. Dependency-free (no rasteriser),
// so the CI verify step can run without `npm install`.
//
// Curated routes live in manifest.json. Any writing article NOT in the manifest
// is auto-discovered and given a card derived from its own metadata, so new
// monthly posts always get a route-specific preview even before anyone curates
// the copy. Add a manifest entry later to override the derived version.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, "..", "..");
export const OUT_DIR = path.join(REPO, "og");
export const CANVAS = { w: 1200, h: 630 };

export const plain = (line) => line.replace(/[[\]]/g, "");

const attr = (html, re) => {
  const m = html.match(re);
  return m ? m[1] : null;
};

function splitTwoLines(title) {
  const words = title.split(/\s+/);
  if (title.length <= 22 || words.length < 3) return [title];
  const half = title.length / 2;
  let run = 0;
  let i = 0;
  while (i < words.length - 1 && run + words[i].length < half) {
    run += words[i].length + 1;
    i++;
  }
  return [words.slice(0, i).join(" "), words.slice(i).join(" ")];
}

function accentLastWord(lines) {
  const out = [...lines];
  const words = out[out.length - 1].split(/\s+/);
  words[words.length - 1] = `[${words[words.length - 1]}]`;
  out[out.length - 1] = words.join(" ");
  return out;
}

function deriveArticleEntry(slug, relHtml, html) {
  const raw =
    attr(html, /property="og:title"\s+content="([^"]*)"/) ||
    attr(html, /<title>([^<]*)<\/title>/) ||
    slug;
  const title = raw.split("//")[0].split("|")[0].trim();

  const desc =
    attr(html, /name="description"\s+content="([^"]*)"/) ||
    attr(html, /property="og:description"\s+content="([^"]*)"/) ||
    "";
  let tagline = desc.replace(/\s+/g, " ").trim();
  if (tagline.length > 68) tagline = `${tagline.slice(0, 65).replace(/\s+\S*$/, "")}…`;

  return {
    file: slug,
    html: relHtml,
    route: `/writing/${slug}/`,
    kicker: "Writing / Case study",
    title: accentLastWord(splitTwoLines(title)),
    tagline,
    auto: true,
  };
}

export function resolveRoutes(manifest) {
  const routes = manifest.routes.map((r) => ({ ...r }));
  const covered = new Set(routes.map((r) => r.html));
  const writingDir = path.join(REPO, "writing");
  for (const slug of fs.readdirSync(writingDir).sort()) {
    const rel = path.join("writing", slug, "index.html");
    const abs = path.join(REPO, rel);
    if (covered.has(rel) || !fs.existsSync(abs)) continue;
    const html = fs.readFileSync(abs, "utf8");
    if (!/property="og:image"/.test(html)) continue;
    routes.push(deriveArticleEntry(slug, rel, html));
  }
  return routes;
}

// Every HTML file that declares og:image (for the bidirectional coverage check).
export function ogImageHtmlFiles() {
  const found = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (name === "node_modules" || name === ".git" || name.startsWith(".")) continue;
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".html") && /property="og:image"/.test(fs.readFileSync(p, "utf8")))
        found.push(path.relative(REPO, p));
    }
  };
  walk(REPO);
  return found;
}

export function loadManifest() {
  return JSON.parse(fs.readFileSync(path.join(REPO, "scripts", "og", "manifest.json"), "utf8"));
}
