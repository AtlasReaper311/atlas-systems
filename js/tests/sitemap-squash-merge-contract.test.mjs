import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const python = String.raw`
from scripts import generate_sitemap as sitemap


def document(lastmod, *, loc="https://atlas-systems.uk/lab/system-symphony/", priority="0.7"):
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>{loc}</loc>
    <lastmod>{lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>{priority}</priority>
  </url>
</urlset>
'''

committed = document("2026-07-28T22:18:14+01:00")
generated_after_squash = document("2026-07-28T23:01:46+01:00")
assert sitemap.comparison_mode(committed, generated_after_squash) == "lastmod-only"
assert sitemap.comparison_mode(committed, committed) == "exact"
assert sitemap.comparison_mode(
    committed,
    document("2026-07-28T23:01:46+01:00", priority="0.6"),
) == "structural"

try:
    sitemap.comparison_mode(document("not-a-date"), generated_after_squash)
except ValueError as error:
    assert "invalid <lastmod>" in str(error)
else:
    raise AssertionError("invalid lastmod was accepted")

duplicate = committed.replace(
    "</urlset>",
    committed.split("<url>", 1)[1].split("</url>", 1)[0].join(
        ["<url>", "</url>\n  <url>", "</url>"]
    ) + "\n</urlset>",
)
try:
    sitemap.sitemap_contract(duplicate, "duplicate fixture")
except ValueError as error:
    assert "duplicate sitemap location" in str(error)
else:
    raise AssertionError("duplicate sitemap location was accepted")
`;

test("sitemap validation tolerates only squash-merge timestamp drift", () => {
  const result = spawnSync("python3", ["-c", python], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"));
});
