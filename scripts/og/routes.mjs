// Route resolution for social-preview cards. Dependency-free (no rasteriser),
// so the CI verify step can run without `npm install`.
//
// Curated local routes live in manifest.routes. Curated cross-repository cards
// live in manifest.satellites and are rendered here without local HTML wiring.
// Any writing article NOT in the manifest is auto-discovered and given a card
// derived from its own metadata, so new monthly posts cannot silently keep a
// shared default image.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, "..", "..");
export const OUT_DIR = path.join(REPO, "og");
export const CANVAS = { w: 1200, h: 630 };

export const plain = (line) => line.replace(/[[\]]/g, "");

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}

function tagAttribute(tag, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i");
  return tag.match(pattern)?.[2] ?? null;
}

function insertBeforeHeadClose(html, tag) {
  if (!/<\/head>/i.test(html)) return html;
  return html.replace(/<\/head>/i, `  ${tag}\n</head>`);
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
  const escaped = escapeAttribute(value);
  return html.replace(/<meta\b[^>]*>/gi, (tag) => {
    const identifier = tagAttribute(tag, "property") ?? tagAttribute(tag, "name");
    if (identifier?.toLowerCase() !== key.toLowerCase()) return tag;

    if (/\bcontent\s*=\s*(["']).*?\1/i.test(tag)) {
      return tag.replace(/\bcontent\s*=\s*(["']).*?\1/i, `content="${escaped}"`);
    }
    return tag.replace(/\s*\/?>$/, ` content="${escaped}">`);
  });
}

export function ensureMetaContent(html, key, value) {
  if (metaContent(html, key) !== null) return html;
  const attribute = key.startsWith("og:") ? "property" : "name";
  return insertBeforeHeadClose(
    html,
    `<meta ${attribute}="${key}" content="${escapeAttribute(value)}">`,
  );
}

export function upsertMetaContent(html, key, value) {
  if (metaContent(html, key) === null) return ensureMetaContent(html, key, value);
  return replaceMetaContent(html, key, value);
}

export function canonicalHref(html) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = tagAttribute(tag, "rel");
    if (rel?.toLowerCase().split(/\s+/).includes("canonical")) {
      return tagAttribute(tag, "href");
    }
  }
  return null;
}

export function ensureCanonical(html, href) {
  if (canonicalHref(html) !== null) return html;
  return insertBeforeHeadClose(
    html,
    `<link rel="canonical" href="${escapeAttribute(href)}">`,
  );
}

export function documentTitle(html) {
  return html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? null;
}

export function socialImageAlt(entry) {
  return `${entry.title.map(plain).join(" ")} — Atlas Systems`;
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
    documentTitle(html) ||
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
  const routes = manifest.routes.map((route) => ({ ...route, external: false }));
  const covered = new Set(routes.map((route) => route.html));
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

export function resolveSatellites(manifest) {
  return (manifest.satellites ?? []).map((entry) => ({
    ...entry,
    external: true,
  }));
}

export function entryIdentityErrors(entries) {
  const errors = [];
  const files = new Map();
  const routes = new Map();
  const htmlFiles = new Map();

  for (const entry of entries) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.file ?? "")) {
      errors.push(`${entry.file ?? "<missing>"}: file must be a lowercase kebab-case identifier`);
    }
    if (!entry.route) errors.push(`${entry.file ?? "<missing>"}: route is required`);
    if (!entry.kicker) errors.push(`${entry.file ?? "<missing>"}: kicker is required`);
    if (!Array.isArray(entry.title) || entry.title.length < 1 || entry.title.length > 2) {
      errors.push(`${entry.file ?? "<missing>"}: title must contain one or two lines`);
    }
    if (!entry.tagline) errors.push(`${entry.file ?? "<missing>"}: tagline is required`);
    if (entry.external && entry.html) errors.push(`${entry.file}: external entries must not declare html`);
    if (!entry.external && !entry.html) errors.push(`${entry.file}: local entries must declare html`);

    if (files.has(entry.file)) {
      errors.push(`${entry.file}: duplicate card file shared with ${files.get(entry.file)}`);
    } else {
      files.set(entry.file, entry.route);
    }

    if (routes.has(entry.route)) {
      errors.push(`${entry.route}: duplicate route shared with ${routes.get(entry.route)}`);
    } else {
      routes.set(entry.route, entry.file);
    }

    if (!entry.external) {
      if (htmlFiles.has(entry.html)) {
        errors.push(`${entry.html}: duplicate local HTML shared with ${htmlFiles.get(entry.html)}`);
      } else {
        htmlFiles.set(entry.html, entry.file);
      }
    }
  }

  return errors;
}

// Every HTML file that declares og:image (for the bidirectional coverage check).
export function ogImageHtmlFiles() {
  const found = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (name === "node_modules" || name === ".git" || name.startsWith(".")) continue;
      const candidate = path.join(dir, name);
      if (fs.statSync(candidate).isDirectory()) walk(candidate);
      else if (name.endsWith(".html")) {
        const html = fs.readFileSync(candidate, "utf8");
        if (metaContent(html, "og:image") !== null) found.push(path.relative(REPO, candidate));
      }
    }
  };
  walk(REPO);
  return found;
}

export function loadManifest() {
  return JSON.parse(fs.readFileSync(path.join(REPO, "scripts", "og", "manifest.json"), "utf8"));
}
