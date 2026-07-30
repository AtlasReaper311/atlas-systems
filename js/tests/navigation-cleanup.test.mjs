import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const homepage = fs.readFileSync("index.html", "utf8");
const semantics = fs.readFileSync("static/js/shared-foundation-semantics.js", "utf8");

test("homepage cards use their canonical destinations", () => {
  assert.doesNotMatch(homepage, /\/systems\/index\.html#ramone/);
  assert.doesNotMatch(homepage, /\/lab\/index\.html#pipeline-grid-section/);
  assert.equal((homepage.match(/https:\/\/ramone\.atlas-systems\.uk\//g) || []).length, 3);
  assert.equal((homepage.match(/href="\/systems\/evidence\//g) || []).length, 3);
  assert.match(homepage, /<a href="\/lab\/system-symphony\/" class="audio-card">/);
});

test("consumer opts out of route breadcrumbs without affecting section labels", () => {
  const installer = semantics.match(
    /export function installSharedFoundationSemantics\(\) \{([\s\S]*?)\n\}/,
  )?.[1] || "";

  assert.match(installer, /removeRouteContextLabels\(\)/);
  assert.doesNotMatch(installer, /installBreadcrumbs\(\)/);
  assert.match(
    semantics,
    /\.focus-hero > \.focus-breadcrumb:first-child/,
  );
  assert.match(
    semantics,
    /\.atlas-breadcrumbs\[data-atlas-generated-breadcrumb="true"\]/,
  );
});
