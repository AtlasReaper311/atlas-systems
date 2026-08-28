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
  assert.match(css, /\.domain-lane\{min-width:0;max-width:100%;overflow:hidden\}/);

  assert.match(css, /@media\(max-width:768px\)\{/);
  assert.match(css, /\.hero-domain-grid\{grid-template-columns:minmax\(0,1fr\)\}/);
});

test("mobile audio cards keep their CTA in normal flow below long copy", () => {
  assert.match(css, /\.audio-card\{min-height:0\}/);
  assert.match(css, /\.audio-card \.card-kicker\{margin-bottom:3rem\}/);
  assert.match(
    css,
    /\.audio-cta\{position:relative;bottom:auto;left:auto;margin-top:1\.25rem\}/,
  );
  assert.doesNotMatch(css, /\.audio-card\{min-height:270px\}/);
});
