import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const version = "20260727-atlas-field-production-v2";
const expectedEntrypoints = [
  `/css/home-v2-base.css?v=${version}`,
  `/static/js/homepage-interactions.js?v=${version}`,
  `/static/js/live/homepage-truth.js?v=${version}`,
];

test("homepage publishes fresh AtlasField entrypoint identities", () => {
  const html = fs.readFileSync("index.html", "utf8");

  for (const entrypoint of expectedEntrypoints) {
    assert.ok(html.includes(entrypoint), `missing current AtlasField entrypoint: ${entrypoint}`);
  }

  assert.doesNotMatch(html, /\/css\/home-v2-base\.css\?v=20260720-truth-impact/);
  assert.doesNotMatch(html, /\/static\/js\/homepage-interactions\.js\?v=20260720-truth-impact/);
  assert.doesNotMatch(html, /\/static\/js\/live\/homepage-truth\.js\?v=20260720-truth-impact/);
});

test("production smoke verifies the exact AtlasField entrypoints", () => {
  const smoke = fs.readFileSync("scripts/smoke_homepage_atlas_field_production.mjs", "utf8");

  for (const entrypoint of expectedEntrypoints) {
    assert.ok(smoke.includes(entrypoint), `production smoke does not verify: ${entrypoint}`);
  }

  assert.match(smoke, /assert\.deepEqual\(evidence\.entrypoints, expectedEntrypoints/);
});
