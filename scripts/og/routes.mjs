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

function tagAttribute(tag, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i");
  return tag.match(pattern)?.[2] ?? null;
}

export function metaContent(html, key) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const identifier = tagAttribute(tag, "property") ?? tagAttribute(tag, "name");
    if (identifier?.toLowerCase() === key.toLowerCase()) {
      return tagAttribute(tag, "content");
    }
  }
  return null;
}

export function replaceMetaContent(html, key, value) {
  const escaped = value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return html.replace(/<meta\b[^>]*>/gi, (tag) => {
    const identifier = tagAttribute(tag, "property") ?? tagAttribute(tag, "name");
    if (identifier?.toLowerCase() !== key.toLowerCase()) return tag;

    if (/\bcontent\s*=\s*(["']).*?\1/i.test(tag)) {
      return tag.replace(/\bcontent\s*=\s*(["']).*?\1/i, `content="${escaped}"`);
    }
    return tag.replace(/\s*\/?>$/, ` content="${escaped}">`);
  });
}

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

export function deriveArticleEntry(slug, relHtml, html) {
  const raw =
    metaContent(html, "og:title") ||
    html.match(/<title>([^<]*)<\/title>/i)?.[1] ||
    slug;
  const title = raw.split("//")[0].split("|")[0].trim();

  const desc =
    metaContent(html, "description") ||
    metaContent(html, "og:description") ||
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
    if (metaContent(html, "og:image") === null) continue;
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
      else if (name.endsWith(".html")) {
        const html = fs.readFileSync(p, "utf8");
        if (metaContent(html, "og:image") !== null) found.push(path.relative(REPO, p));
      }
    }
  };
  walk(REPO);
  return found;
}

export function loadManifest() {
  return JSON.parse(fs.readFileSync(path.join(REPO, "scripts", "og", "manifest.json"), "utf8"));
}
