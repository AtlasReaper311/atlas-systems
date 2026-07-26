import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  modeHref,
  normalizePath,
} from "../system-symphony/system-symphony-mode-links.js";

const shell = readFileSync("lab/shared/shell.js", "utf8");
const modeLinks = readFileSync(
  "lab/system-symphony/system-symphony-mode-links.js",
  "utf8",
);

test("System Symphony product modes expose complete fallback links", () => {
  assert.equal(modeHref("play"), "/lab/system-symphony/");
  assert.equal(modeHref("trace"), "/lab/system-symphony/?symphonyMode=trace");
  assert.equal(modeHref("replay"), "/lab/system-symphony/?symphonyMode=replay");
  assert.equal(modeHref("invalid"), "/lab/system-symphony/");
});

test("the instrument route upgrades internal tabs to reliable product links", () => {
  assert.equal(normalizePath("/lab/system-symphony"), "/lab/system-symphony/");
  assert.ok(shell.includes("system-symphony-mode-links.js?v=20260726-mode-links-v1"));
  assert.ok(modeLinks.includes("data-symphony-mode-route"));
  assert.ok(modeLinks.includes("event.preventDefault()"));
  assert.ok(modeLinks.includes("tab.click()"));
  assert.ok(modeLinks.includes('link.setAttribute("aria-current", "page")'));
  assert.ok(modeLinks.includes("tabs.style.display = \"none\""));
});
