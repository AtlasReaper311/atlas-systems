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

test("About topology separates lower labels at every viewport", () => {
  const css = fs.readFileSync("static/css/editorial-surfaces-v2.css", "utf8");
  const about = fs.readFileSync("about/index.html", "utf8");

  for (const node of ["systems", "software", "audio", "games"]) {
    assert.match(about, new RegExp(`data-node="${node}"`), `${node} node`);
  }

  assert.match(ruleBlock(css, ".about-topology"), /min-height:\s*226px;/);
  assert.match(
    ruleBlock(css, '.about-topology-node[data-node="systems"]'),
    /top:\s*16px;/,
  );
  assert.match(
    ruleBlock(css, '.about-topology-node[data-node="software"]'),
    /left:\s*12px;[^]*bottom:\s*60px;/,
  );
  assert.match(
    ruleBlock(css, '.about-topology-node[data-node="audio"]'),
    /bottom:\s*14px;/,
  );
  assert.match(
    ruleBlock(css, '.about-topology-node[data-node="games"]'),
    /right:\s*12px;[^]*bottom:\s*60px;/,
  );

  const smallScreen = ruleBlock(css, "@media (max-width: 767px)");
  assert.doesNotMatch(
    smallScreen,
    /about-topology/,
    "the collision-safe topology geometry must not depend on a viewport breakpoint",
  );
});
