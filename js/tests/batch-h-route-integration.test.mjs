import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const lab = readFileSync("lab/index.html", "utf8");
const systems = readFileSync("systems/index.html", "utf8");
const sitemap = readFileSync("sitemap.xml", "utf8");
const sitemapGenerator = readFileSync("scripts/generate_sitemap.py", "utf8");
const headers = readFileSync("_headers", "utf8");
const labShell = readFileSync("lab/shared/shell.js", "utf8");

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
  assert.ok(lab.includes("Grouped by purpose."));
  assert.ok(systems.includes("One estate,"));
});

test("System Symphony no longer routes through the dense console", () => {
  const directoryCards = [...lab.matchAll(/<a[^>]+data-visual="symphony"[^>]+href="([^"]+)"/g)];
  assert.ok(directoryCards.length >= 1);
  for (const match of directoryCards) assert.equal(match[1], "/lab/system-symphony/");
  assert.match(lab, /class="lab-flagship-card lab-flagship-card--symphony" href="\/lab\/system-symphony\/"/);
  assert.ok(systems.includes('data-visual="symphony"'));
  assert.ok(systems.includes('href="/lab/system-symphony/"'));
  assert.ok(labShell.includes('{ label: "System Symphony", href: "/lab/system-symphony/" }'));
});

test("the preserved console remains an explicit noindex rollback surface", () => {
  assert.ok(lab.includes('href="/lab/console/"'));
  assert.ok(lab.includes("no-index technical route"));
  assert.match(headers, /\/lab\/console\/\*[\s\S]*X-Robots-Tag: noindex, follow/);
});

test("the public sitemap contains focused routes and excludes the compatibility redirect", () => {
  for (const route of publicRoutes) {
    assert.ok(sitemap.includes(`https://atlas-systems.uk${route}`), `sitemap missing ${route}`);
    assert.ok(sitemapGenerator.includes(`("${route}", "monthly", "0.7")`), `generator missing ${route}`);
  }
  assert.ok(!sitemap.includes("<loc>https://atlas-systems.uk/lab/reliability/</loc>"));
  assert.ok(!sitemapGenerator.includes('("/lab/reliability/"'));
  assert.ok(labShell.includes('{ label: "Reliability", href: "/systems/reliability/" }'));
  assert.ok(!labShell.includes('{ label: "Reliability", href: "/lab/reliability/" }'));
});

test("focused routes do not replace the production status surface", () => {
  assert.ok(lab.includes('href="https://status.atlas-systems.uk/"'));
  assert.ok(systems.includes('href="https://status.atlas-systems.uk/"'));
});

test("temporary Batch H diagnostics are not part of the review candidate", () => {
  assert.equal(existsSync(".github/workflows/batch-h-diagnostics.yml"), false);
});
