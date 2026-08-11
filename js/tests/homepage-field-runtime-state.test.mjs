import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { lightPosition } from "../../static/js/atlas-field.js";

test("AtlasField keeps pure light coordinates immutable", () => {
  const position = lightPosition(1440, 900, 0);
  assert.ok(Object.isFrozen(position));
  assert.throws(() => {
    position.x += 1;
  }, TypeError);
});

test("AtlasField clones immutable coordinates into mutable renderer state", () => {
  const source = fs.readFileSync("static/js/atlas-field.js", "utf8");

  assert.match(
    source,
    /renderedLight = \{ \.\.\.lightPosition\(width, height, 0\) \};/,
  );
  assert.doesNotMatch(
    source,
    /renderedLight = lightPosition\(width, height, 0\);/,
  );

  const mutable = { ...lightPosition(1440, 900, 0) };
  assert.doesNotThrow(() => {
    mutable.x += 1;
    mutable.y += 1;
  });
});
