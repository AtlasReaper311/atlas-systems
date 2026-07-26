import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

test("live APU preview route is statically sample-free", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/verify_system_symphony_reachability.mjs", "lab/system-symphony-apu/index.html"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /reachability guard passed/);
});

test("public System Symphony route does not load Tone twice", () => {
  const html = fs.readFileSync("lab/system-symphony/index.html", "utf8");
  const toneLoads = html.match(/\/vendor\/tone\.min\.js/g) ?? [];
  assert.equal(toneLoads.length, 1);
});
