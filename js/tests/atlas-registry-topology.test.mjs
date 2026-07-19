import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const registryUrl = new URL(
  "../../static/js/live/atlas-registry.js",
  import.meta.url,
);
const source = await readFile(registryUrl, "utf8");

test("registry topology filter accepts the public topology id field", () => {
  assert.match(source, /typeof component\.id === "string"/);
  assert.match(source, /allowed\.add\(id\)/);
});

test("registry topology filter retains legacy name compatibility", () => {
  assert.match(source, /: component\.name/);
});

test("registry ES module remains valid JavaScript", () => {
  const result = spawnSync(process.execPath, ["--check", registryUrl.pathname], {
    encoding: "utf8",
  });

  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout || "node --check failed",
  );
});
