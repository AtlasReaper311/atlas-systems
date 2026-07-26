import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const headers = readFileSync("_headers", "utf8");
const redirects = readFileSync("_redirects", "utf8");

const CLOUDINARY = "https://res.cloudinary.com";

const SOURCE_EXTENSIONS = new Set([".html", ".js", ".mjs"]);
const SKIP_DIRECTORIES = new Set(["node_modules", ".git", "tests", "scripts"]);

function shippedSources(directory = ".") {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      found.push(...shippedSources(full));
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (entry.name.includes(".test.")) continue;
    found.push(full.replace(/^\.\//, ""));
  }
  return found;
}

// Returns the directive's source list as exact tokens. Token equality is used
// throughout instead of substring matching: a substring check would accept
// https://res.cloudinary.com.example.invalid, and CodeQL flags the pattern as
// js/incomplete-url-substring-sanitization.
function directiveSources(name) {
  const policy = headers.match(/Content-Security-Policy:([^\n]*)/)?.[1] ?? "";
  const found = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  if (!found) return null;
  return found.slice(name.length).trim().split(/\s+/).filter(Boolean);
}

function hasExactToken(tokens, expected) {
  return tokens.some((token) => token === expected);
}

function redirectRules() {
  return redirects
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(/\s+/))
    .filter((parts) => parts.length >= 2)
    .map(([source, destination, code = "302"]) => ({ source, destination, code }));
}

test("media-src covers local Symphony audio and the Cloudinary demo host", () => {
  const media = directiveSources("media-src");
  assert.ok(media, "media-src must be declared; otherwise it falls back to default-src 'self'");

  // static/audio/system-symphony/* is loaded through `new Audio()` in
  // static/js/sonify/asset-loader.js, which CSP governs with media-src.
  assert.ok(hasExactToken(media, "'self'"), "media-src must keep 'self' for local audio assets");

  // work/index.html plays the Velocity theme stems from Cloudinary.
  assert.ok(hasExactToken(media, CLOUDINARY), "media-src must allow the Cloudinary demo host");
});

test("every remote media host referenced in source is allowed by media-src", () => {
  const media = directiveSources("media-src") ?? [];
  const sources = shippedSources();

  const hosts = new Set();
  for (const path of sources) {
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(/https:\/\/[^"'`\s)]+\.(?:mp3|mp4|m4a|wav|opus|aac|webm|ogg)\b/g)) {
      hosts.add(new URL(match[0]).origin);
    }
  }

  for (const host of hosts) {
    assert.ok(hasExactToken(media, host), `${host} serves media but is absent from media-src`);
  }
});

test("script-src does not grant 'unsafe-eval'", () => {
  const script = directiveSources("script-src");
  assert.ok(script, "script-src must be declared");
  assert.ok(!script.includes("'unsafe-eval'"), "no shipped source needs 'unsafe-eval'");
});

test("no shipped source consumes eval, so 'unsafe-eval' stays removed", () => {
  const consumer =
    /\beval[\s]*\(|\bnew[\s]+Function[\s]*\(|[^.\w]Function[\s]*\(\s*["'`]|set(?:Timeout|Interval)[\s]*\(\s*["']/;

  const offenders = shippedSources().filter((file) => consumer.test(readFileSync(file, "utf8")));
  assert.deepEqual(
    offenders,
    [],
    `these files would need 'unsafe-eval' restored: ${offenders.join(", ")}`,
  );
});

test("every top-level section has a trailing-slash redirect", () => {
  const rules = redirectRules();
  for (const section of ["work", "writing", "lab", "about", "systems"]) {
    const rule = rules.find((entry) => entry.source === `/${section}`);
    assert.ok(rule, `/${section} has no trailing-slash redirect`);
    assert.equal(rule.destination, `/${section}/`);
    assert.equal(rule.code, "301");
  }
});

test("the retired Lab reliability route redirects server-side", () => {
  const rules = redirectRules();
  for (const source of ["/lab/reliability", "/lab/reliability/"]) {
    const rule = rules.find((entry) => entry.source === source);
    assert.ok(rule, `${source} has no server redirect`);
    assert.equal(rule.destination, "/systems/reliability/");
    assert.equal(rule.code, "301");
  }
});

test("no splat redirect shadows the reliability sibling assets", () => {
  // Cloudflare Pages follows a matching redirect even when a static asset also
  // matches the request, so a splat under /lab/reliability/ would make these
  // files unreachable rather than merely redundant.
  const siblings = [
    "lab/reliability/reliability.js",
    "lab/reliability/reliability-core.js",
    "lab/reliability/reliability.css",
    "lab/reliability/evidence/specular-route-503-live-2026-07-15.json",
  ];
  for (const path of siblings) {
    assert.equal(existsSync(path), true, `${path} must exist for this guard to mean anything`);
  }

  for (const { source } of redirectRules()) {
    assert.ok(
      !source.startsWith("/lab/reliability/") || source === "/lab/reliability/",
      `${source} would shadow files under /lab/reliability/`,
    );
  }
});
