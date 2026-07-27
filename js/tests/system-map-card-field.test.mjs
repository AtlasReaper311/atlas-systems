import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { SYSTEM_MAP_CARD_FIELD } from "../../lab/shared/system-map-card-field.js";

const markup = fs.readFileSync("lab/index.html", "utf8");
const systemMapPage = fs.readFileSync("lab/system-map/index.html", "utf8");
const css = fs.readFileSync("lab/shared/system-map-card-field.css", "utf8");
const moduleSource = fs.readFileSync("lab/shared/system-map-card-field.js", "utf8");
const shell = fs.readFileSync("lab/shared/shell.js", "utf8");
const headers = fs.readFileSync("_headers", "utf8");
const previewWorkflow = fs.readFileSync(".github/workflows/system-map-card-field-preview-smoke.yml", "utf8");

test("System Map card field targets only the featured Lab card", () => {
  assert.equal(SYSTEM_MAP_CARD_FIELD.selector, "#system-map.featured");
  assert.equal(SYSTEM_MAP_CARD_FIELD.options.preset, "card");
  assert.equal(SYSTEM_MAP_CARD_FIELD.options.pointer.enabled, false);
  assert.ok(Object.isFrozen(SYSTEM_MAP_CARD_FIELD));
  assert.equal((markup.match(/id="system-map"/g) || []).length, 1);
  assert.doesNotMatch(moduleSource, /page-intro|ambient/);
  assert.doesNotMatch(systemMapPage, /system-map-card-field/);
});

test("Lab shell mounts fresh card-owned assets only on the Lab directory", () => {
  assert.match(shell, /const LAB_HOME_ROUTE = "\/lab\/"/);
  assert.match(shell, /SYSTEM_MAP_CARD_FIELD_CSS = "\/lab\/shared\/system-map-card-field\.css\?v=20260727-system-map-card-field-v1"/);
  assert.match(shell, /SYSTEM_MAP_CARD_FIELD_MODULE = "\/lab\/shared\/system-map-card-field\.js\?v=20260727-system-map-card-field-v1"/);
  assert.match(shell, /if \(currentPath\(\) !== LAB_HOME_ROUTE\) return/);
  assert.match(shell, /ensureStylesheet\(SYSTEM_MAP_CARD_FIELD_CSS\)/);
  assert.match(shell, /await import\(SYSTEM_MAP_CARD_FIELD_MODULE\)/);
  assert.match(shell, /await installSystemMapCardField\(\)/);
  assert.match(moduleSource, /atlas-field\.js\?v=20260727-atlas-field-production-v2/);
});

test("Lab field bootstrap assets cannot be retained stale", () => {
  for (const asset of [
    "/lab/shared/shell.js",
    "/lab/shared/system-map-card-field.js",
    "/lab/shared/system-map-card-field.css",
  ]) {
    assert.match(headers, new RegExp(`${asset.replaceAll("/", "\\/")}\\n  Cache-Control: no-store, max-age=0`));
  }
});

test("System Map card field remains decorative and visibly composited", () => {
  assert.match(css, /#system-map\.system-map-card-atlas-field > \.atlas-field-canvas\s*\{[^}]*position:\s*absolute[^}]*opacity:\s*\.92[^}]*pointer-events:\s*none[^}]*mix-blend-mode:\s*screen/s);
  assert.match(css, /#system-map\.system-map-card-atlas-field > \.card-signature\s*\{[^}]*z-index:\s*3/s);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("governed preview runs a pixel-level System Map card field smoke", () => {
  assert.match(previewWorkflow, /smoke_system_map_card_field_preview\.mjs/);
  assert.match(previewWorkflow, /system-map-card-field-preview-smoke/);
  assert.match(previewWorkflow, /interface-preview-approved/);
  assert.match(previewWorkflow, /playwright@1\.61\.1/);
});
