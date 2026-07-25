import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lab = readFileSync("lab/index.html", "utf8");
const systems = readFileSync("systems/index.html", "utf8");
const sitemap = readFileSync("sitemap.xml", "utf8");
const sitemapGenerator = readFileSync("scripts/generate_sitemap.py", "utf8");
const headers = readFileSync("_headers", "utf8");

const publicRoutes = [
  "/systems/observability/",
  "/systems/reliability/",
  "/systems/evidence/",
  "/lab/system-symphony/",
];

test("the v2 Lab and Systems directories expose every Batch H destination", () => {
  for (const route of publicRoutes) {
    assert.ok(lab.includes(`href="${route}"`), `Lab missing ${route}`);
    assert.ok(systems.includes(`href="${route}"`), `Systems missing ${route}`);
  }
  assert.match(lab, /Grouped by purpose\./);
  assert.match(systems, /One estate,/);
});

test("System Symphony no longer routes through the dense console", () => {
  const symphonyCards = [...lab.matchAll(/<a[^>]+data-visual="symphony"[^>]+href="([^"]+)"/g)];
  assert.ok(symphonyCards.length >= 2);
  for (const match of symphonyCards) assert.equal(match[1], "/lab/system-symphony/");
  assert.match(systems, /data-visual="symphony"[^>]+href="\/lab\/system-symphony\/"/);
});

test("the preserved console remains an explicit noindex rollback surface", () => {
  assert.match(lab, /href="\/lab\/console\/"/);
  assert.match(lab, /no-index technical route/);
  assert.match(headers, /\/lab\/console\/\*[\s\S]*X-Robots-Tag: noindex, follow/);
});

test("the public sitemap contains focused routes and excludes the compatibility redirect", () => {
  for (const route of publicRoutes) {
    assert.ok(sitemap.includes(`https://atlas-systems.uk${route}`), `sitemap missing ${route}`);
    assert.ok(sitemapGenerator.includes(`("${route}", "monthly", "0.7")`), `generator missing ${route}`);
  }
  assert.doesNotMatch(sitemap, /https:\/\/atlas-systems\.uk\/lab\/reliability\//);
  assert.doesNotMatch(sitemapGenerator, /\("\/lab\/reliability\/"/);
});

test("focused routes do not replace the production status surface", () => {
  assert.match(lab, /https:\/\/status\.atlas-systems\.uk\//);
  assert.match(systems, /https:\/\/status\.atlas-systems\.uk\//);
});
