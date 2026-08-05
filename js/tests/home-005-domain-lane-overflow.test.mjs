import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync("css/home-v2-responsive.css", "utf8");
const homepage = fs.readFileSync("index.html", "utf8");

test("HOME-005 keeps homepage domain lanes inside zero-minimum responsive tracks", () => {
  assert.match(homepage, /class="hero-domain-grid"/);
  assert.equal((homepage.match(/class="domain-lane"/g) || []).length, 3);

  assert.match(css, /@media\(max-width:880px\)\{/);
  assert.match(css, /\.hero-domain-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  assert.match(css, /\.domain-lane\{min-width:0\}/);

  assert.match(css, /@media\(max-width:620px\)\{/);
  assert.match(css, /\.hero-domain-grid\{grid-template-columns:minmax\(0,1fr\)\}/);

  assert.doesNotMatch(
    css,
    /\.hero-domain-grid,\.truth-rail,\.feature-grid,\.ops-rail,\.evidence-grid\{grid-template-columns:1fr\}/,
  );
});
