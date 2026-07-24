import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const MATURITY_LABELS = ["Production", "Tool", "Preview", "Experiment", "Planned", "Retired"];
const NEW_LAB_ROUTES = [
  "/lab/proof-chain/",
  "/lab/signal/",
  "/lab/reliability/",
  "/lab/conformance/",
  "/lab/anomaly/",
];

test("homepage aggregate status uses same-tab Atlas-owned navigation", () => {
  const html = read("index.html");
  const match = html.match(/<a href="https:\/\/status\.atlas-systems\.uk\/" class="nav-status"[^>]*>/);
  assert.ok(match, "homepage status link is missing");
  assert.doesNotMatch(match[0], /target=/);
  assert.doesNotMatch(match[0], /rel=/);
});

for (const path of ["lab/index.html", "systems/index.html"]) {
  test(`${path} documents every accepted maturity label`, () => {
    const html = read(path);
    for (const label of MATURITY_LABELS) {
      assert.match(html, new RegExp(`class="badge [^"]*">${label}<`));
    }
  });
}

test("maturity completion styles distinguish planned and retired states", () => {
  const css = read("static/css/v2-directory-pages.css");
  assert.match(css, /\.badge\.planned\s*\{/);
  assert.match(css, /\.badge\.retired\s*\{/);
  assert.match(css, /\.badge\.planned[^}]*border-style:dotted/);
  assert.match(css, /\.badge\.retired[^}]*text-decoration:line-through/);
});

test("all approved public Lab tools are generated into the sitemap", () => {
  const generator = read("scripts/generate_sitemap.py");
  const sitemap = read("sitemap.xml");
  for (const route of NEW_LAB_ROUTES) {
    assert.ok(generator.includes(`("${route}", "monthly", "0.6")`));
    assert.ok(sitemap.includes(`<loc>https://atlas-systems.uk${route}</loc>`));
  }
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(new Set(locations).size, locations.length, "sitemap locations must be unique");
});
