#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text(encoding="utf-8")
    if new in source:
        return
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one patch anchor, found {count}")
    file.write_text(source.replace(old, new), encoding="utf-8")


def main() -> None:
    replace_once(
        "index.html",
        '<a href="https://status.atlas-systems.uk" class="nav-status" target="_blank" rel="noopener">',
        '<a href="https://status.atlas-systems.uk/" class="nav-status">',
    )

    maturity_old = (
        '            <div><dt><span class="badge experiment">Experiment</span></dt>'
        '<dd>Exploratory behaviour without a stable product contract.</dd></div>'
    )
    maturity_new = maturity_old + """
            <div><dt><span class="badge planned">Planned</span></dt><dd>Declared future work that is not yet a usable public surface.</dd></div>
            <div><dt><span class="badge retired">Retired</span></dt><dd>Historical surface that is no longer an active public destination.</dd></div>"""
    for path in ("lab/index.html", "systems/index.html"):
        replace_once(path, maturity_old, maturity_new)
        replace_once(
            path,
            "/static/css/v2-directory-pages.css?v=20260723-visual-semantics",
            "/static/css/v2-directory-pages.css?v=20260724-maturity-completion",
        )

    replace_once(
        "lab/system-map/index.html",
        "/static/css/v2-directory-pages.css?v=20260723-visual-semantics",
        "/static/css/v2-directory-pages.css?v=20260724-maturity-completion",
    )

    css_old = (
        ".badge.production { color:#4ade80; border-color:rgba(74,222,128,.3); "
        "background:rgba(74,222,128,.08); }"
    )
    css_new = css_old + """
.badge.planned { color:var(--text-dim); border-style:dotted; border-color:rgba(170,169,160,.38); background:rgba(170,169,160,.06); }
.badge.retired { color:var(--text-faint); border-color:rgba(136,136,148,.28); background:rgba(136,136,148,.05); text-decoration:line-through; text-decoration-thickness:1px; }"""
    replace_once("static/css/v2-directory-pages.css", css_old, css_new)

    routes_old = """    ("/lab/system-map/", "monthly", "0.6"),
    ("/about/", "monthly", "0.6"),"""
    routes_new = """    ("/lab/system-map/", "monthly", "0.6"),
    ("/lab/proof-chain/", "monthly", "0.6"),
    ("/lab/signal/", "monthly", "0.6"),
    ("/lab/reliability/", "monthly", "0.6"),
    ("/lab/conformance/", "monthly", "0.6"),
    ("/lab/anomaly/", "monthly", "0.6"),
    ("/about/", "monthly", "0.6"),"""
    replace_once("scripts/generate_sitemap.py", routes_old, routes_new)

    replace_once(
        "js/tests/public-interface-contract.test.mjs",
        'for (const maturity of ["Production", "Tool", "Preview", "Experiment"]) {',
        'for (const maturity of ["Production", "Tool", "Preview", "Experiment", "Planned", "Retired"]) {',
    )
    replace_once(
        "js/tests/public-interface-contract.test.mjs",
        "/v2-directory-pages\\.css\\?v=20260723-visual-semantics/",
        "/v2-directory-pages\\.css\\?v=20260724-maturity-completion/",
    )

    Path("js/tests/phase3-cleanup.test.mjs").write_text(
        '''import assert from "node:assert/strict";
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
''',
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
