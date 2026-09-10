import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const PRODUCT_FACING_FILES = [
  "index.html",
  "systems/index.html",
  "lab/index.html",
  "lab/system-symphony/index.html",
  "lab/system-symphony/roms/index.html",
  "lab/system-symphony/radio/index.html",
  "lab/system-symphony/build-log/index.html",
  "lab/system-symphony/replay/index.html",
  "static/js/homepage-interactions.js",
  "lab/shared/lab-intro-field.js",
  "lab/shared/flagship-counterparts.js",
  "lab/system-symphony/rom-library.js",
];

const OBSOLETE_PRODUCT_NAME = /\bSYMPHONY\b/;
const SONIFY_UI_COPY = [
  "System Symphony volume",
  "System Symphony console volume",
  "Close System Symphony console",
  "System Symphony master analyser",
  "Stop System Symphony audio",
  "Start System Symphony audio",
  "Retry System Symphony audio",
];

test("current System Symphony product-facing copy uses approved casing", () => {
  for (const path of PRODUCT_FACING_FILES) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, OBSOLETE_PRODUCT_NAME, path);
  }

  const sonifyUi = readFileSync("static/js/sonify/ui.js", "utf8");
  for (const copy of SONIFY_UI_COPY) {
    assert.ok(sonifyUi.includes(copy), copy);
  }
  assert.match(sonifyUi, /System <em>Symphony<\/em>/);

  assert.match(
    readFileSync("lab/system-symphony/index.html", "utf8"),
    />System Symphony<\/h1>/,
  );
});
