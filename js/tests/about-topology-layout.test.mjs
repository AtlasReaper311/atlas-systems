import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function ruleBlock(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `${marker} must exist`);

  const openingBrace = source.indexOf("{", markerIndex);
  assert.notEqual(openingBrace, -1, `${marker} must open a block`);

  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }

  assert.fail(`${marker} must close its block`);
}

test("About topology separates lower labels throughout the small-screen range", () => {
  const css = fs.readFileSync("static/css/editorial-surfaces-v2.css", "utf8");
  const about = fs.readFileSync("about/index.html", "utf8");
  const smallScreen = ruleBlock(css, "@media (max-width: 767px)");

  for (const node of ["systems", "software", "audio", "games"]) {
    assert.match(about, new RegExp(`data-node="${node}"`), `${node} node`);
  }

  assert.match(smallScreen, /\.about-topology\s*\{\s*min-height:\s*226px;/);
  assert.match(
    smallScreen,
    /\.about-topology-node\[data-node="software"\]\s*\{[^}]*left:\s*12px;[^}]*bottom:\s*60px;/,
  );
  assert.match(
    smallScreen,
    /\.about-topology-node\[data-node="audio"\]\s*\{[^}]*bottom:\s*14px;/,
  );
  assert.match(
    smallScreen,
    /\.about-topology-node\[data-node="games"\]\s*\{[^}]*right:\s*12px;[^}]*bottom:\s*60px;/,
  );
});
