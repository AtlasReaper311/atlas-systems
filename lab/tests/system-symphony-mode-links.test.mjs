import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("lab/system-symphony/index.html", "utf8");

test("System Symphony product modes are real deep links", () => {
  for (const [mode, href] of [
    ["play", "/lab/system-symphony/"],
    ["trace", "/lab/system-symphony/?symphonyMode=trace"],
    ["replay", "/lab/system-symphony/?symphonyMode=replay"],
  ]) {
    assert.ok(
      page.includes(`href="${href}" role="tab"`) &&
        page.includes(`data-symphony-mode-tab="${mode}"`),
      `missing reliable ${mode} mode link`,
    );
  }
  assert.equal((page.match(/data-symphony-mode-tab=/g) ?? []).length, 3);
  assert.equal((page.match(/<button[^>]+data-symphony-mode-tab=/g) ?? []).length, 0);
});
