// CI gate for estate social previews and browser identity (dependency-free).
// Fails if a local route or external satellite lacks a committed 1200x630 PNG,
// identifiers collide, local metadata is incomplete or inconsistent, or any
// HTML page with og:image falls outside the resolved local route set.
// Run: npm run og:verify
import fs from "node:fs";
import path from "node:path";
import {
  REPO,
  OUT_DIR,
  CANVAS,
  canonicalHref,
  documentTitle,
  entryIdentityErrors,
  loadManifest,
  metaContent,
  ogImageHtmlFiles,
  resolveRoutes,
  resolveSatellites,
  socialImageAlt,
} from "./routes.mjs";

const ORIGIN = "https://atlas-systems.uk";
const REQUIRED_ICONS = [
  { rel: "icon", href: "/favicon.ico", sizes: "any" },
  { rel: "icon", href: "/favicon-16x16.png", sizes: "16x16" },
  { rel: "icon", href: "/favicon-32x32.png", sizes: "32x32" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
  { rel: "manifest", href: "/site.webmanifest" },
];

const manifest = loadManifest();
const localRoutes = resolveRoutes(manifest);
const satellites = resolveSatellites(manifest);
const entries = [...localRoutes, ...satellites];
const errors = entryIdentityErrors(entries);

function pngSize(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
}

function requireMeta(html, entry, key, expected = null) {
  const value = metaContent(html, key);
  if (value === null || value.trim() === "") {
    errors.push(`${entry.html}: missing ${key}`);
    return null;
  }
  if (expected !== null && value !== expected) {
    errors.push(`${entry.html}: ${key} is ${JSON.stringify(value)}, expected ${JSON.stringify(expected)}`);
  }
  return value;
}

function tagAttribute(tag, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i");
  return tag.match(pattern)?.[2] ?? null;
}

function linkDeclarations(html) {
  return [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => ({
    rel: (tagAttribute(match[0], "rel") ?? "").toLowerCase().split(/\s+/),
    href: tagAttribute(match[0], "href"),
    sizes: tagAttribute(match[0], "sizes"),
  }));
}

function requireIcons(html, label) {
  const declarations = linkDeclarations(html);
  for (const required of REQUIRED_ICONS) {
    const found = declarations.some((entry) =>
      entry.rel.includes(required.rel) &&
      entry.href === required.href &&
      (required.sizes === undefined || entry.sizes === required.sizes)
    );
    if (!found) {
      const size = required.sizes ? ` sizes=${required.sizes}` : "";
      errors.push(`${label}: missing ${required.rel} ${required.href}${size}`);
    }
  }
}

function validateJsonLd(html, label) {
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      JSON.parse(match[1]);
    } catch (error) {
      errors.push(`${label}: invalid JSON-LD: ${error.message}`);
    }
  }
}

for (const entry of entries) {
  const image = path.join(OUT_DIR, `${entry.file}.png`);
  if (!fs.existsSync(image)) {
    errors.push(`${entry.file}: missing og/${entry.file}.png (run npm run og:build)`);
  } else {
    const dimensions = pngSize(image);
    if (!dimensions) errors.push(`${entry.file}: og/${entry.file}.png is not a valid PNG`);
    else if (dimensions.w !== CANVAS.w || dimensions.h !== CANVAS.h) {
      errors.push(
        `${entry.file}: og/${entry.file}.png is ${dimensions.w}x${dimensions.h}, ` +
        `expected ${CANVAS.w}x${CANVAS.h}`,
      );
    }
  }

  if (entry.external) continue;

  const htmlPath = path.join(REPO, entry.html);
  if (!fs.existsSync(htmlPath)) {
    errors.push(`${entry.file}: missing local HTML ${entry.html}`);
    continue;
  }

  const html = fs.readFileSync(htmlPath, "utf8");
  const routeUrl = `${ORIGIN}${entry.route}`;
  const expectedCanonical = entry.canonical ?? routeUrl;
  const expectedImage = `${ORIGIN}/og/${entry.file}.png`;
  const expectedAlt = socialImageAlt(entry);
  const title = documentTitle(html);

  if (html.includes(`${ORIGIN}/og-default.png`)) {
    errors.push(`${entry.html}: still references og-default.png`);
  }

  if (title === null || title === "") errors.push(`${entry.html}: missing document title`);
  requireMeta(html, entry, "description");

  const canonical = canonicalHref(html);
  if (canonical === null) errors.push(`${entry.html}: missing canonical link`);
  else if (canonical !== expectedCanonical) {
    errors.push(`${entry.html}: canonical is ${JSON.stringify(canonical)}, expected ${JSON.stringify(expectedCanonical)}`);
  }

  requireMeta(html, entry, "theme-color");
  requireMeta(html, entry, "og:type");
  requireMeta(html, entry, "og:title", title);
  requireMeta(html, entry, "og:description");
  requireMeta(html, entry, "og:url", expectedCanonical);
  requireMeta(html, entry, "og:site_name", "Atlas Systems");
  requireMeta(html, entry, "og:image", expectedImage);
  requireMeta(html, entry, "og:image:width", String(CANVAS.w));
  requireMeta(html, entry, "og:image:height", String(CANVAS.h));
  requireMeta(html, entry, "og:image:alt", expectedAlt);
  requireMeta(html, entry, "twitter:card", "summary_large_image");
  requireMeta(html, entry, "twitter:title", title);
  requireMeta(html, entry, "twitter:description");
  requireMeta(html, entry, "twitter:image", expectedImage);
  requireMeta(html, entry, "twitter:image:alt", expectedAlt);
  requireIcons(html, entry.html);
  validateJsonLd(html, entry.html);
}

// Bidirectional: nothing with static og:image may fall outside the local route set.
const resolvedHtml = new Set(localRoutes.map((entry) => entry.html));
for (const file of ogImageHtmlFiles()) {
  if (!resolvedHtml.has(file)) {
    errors.push(
      `${file}: declares og:image but has no local card ` +
      `(add a manifest route or ensure it is a discoverable /writing/ article)`,
    );
  }
}

// The error route is intentionally outside the canonical and social-card graph.
const errorPath = path.join(REPO, "404.html");
if (!fs.existsSync(errorPath)) {
  errors.push("404.html: missing error route");
} else {
  const errorHtml = fs.readFileSync(errorPath, "utf8");
  const robots = metaContent(errorHtml, "robots") ?? "";
  if (documentTitle(errorHtml) !== "404 // Atlas Systems") {
    errors.push("404.html: document title must be 404 // Atlas Systems");
  }
  requireMeta(errorHtml, { html: "404.html" }, "description");
  requireMeta(errorHtml, { html: "404.html" }, "theme-color");
  if (!robots.toLowerCase().split(/[\s,]+/).includes("noindex")) {
    errors.push("404.html: robots metadata must include noindex");
  }
  if (canonicalHref(errorHtml) !== null) {
    errors.push("404.html: must not canonicalize arbitrary missing paths");
  }
  if (metaContent(errorHtml, "og:image") !== null) {
    errors.push("404.html: must remain outside the social-card graph");
  }
  requireIcons(errorHtml, "404.html");
  validateJsonLd(errorHtml, "404.html");
}

if (errors.length) {
  console.error(`Estate browser-identity check failed (${errors.length}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const auto = localRoutes.filter((entry) => entry.auto).length;
console.log(
  `Estate browser-identity check passed: ${entries.length} cards ` +
  `(${localRoutes.length} local, ${satellites.length} external, ${auto} auto-discovered), ` +
  `all ${CANVAS.w}x${CANVAS.h}; every local route is fully wired and exact.`,
);
