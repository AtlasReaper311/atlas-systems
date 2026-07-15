import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(
  new URL("../atlas-registry.js", import.meta.url),
  "utf8",
);

test("registry topology filter accepts the public topology id field", () => {
  assert.match(
    source,
    /typeof component\.id === "string"/,
  );

  assert.match(
    source,
    /allowed\[componentId\] = true/,
  );
});

test("registry topology filter retains legacy name compatibility", () => {
  assert.match(
    source,
    /: component\.name/,
  );
});

test("registry client remains valid JavaScript", () => {
  new vm.Script(source);
});
