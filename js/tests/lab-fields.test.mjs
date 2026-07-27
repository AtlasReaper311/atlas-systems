import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { LAB_FIELD_TARGETS } from "../../static/js/lab-fields.js";

test("Lab fields expose exactly one ambient header and one System Map card target", () => {
  assert.deepEqual(Object.keys(LAB_FIELD_TARGETS), ["intro", "systemMapCard"]);
  assert.equal(LAB_FIELD_TARGETS.intro.selector, ".page-intro");
  assert.equal(LAB_FIELD_TARGETS.intro.options.preset, "ambient");
  assert.equal(LAB_FIELD_TARGETS.systemMapCard.selector, "#system-map");
  assert.equal(LAB_FIELD_TARGETS.systemMapCard.options.preset, "card");
  assert.equal(LAB_FIELD_TARGETS.systemMapCard.options.pointer.enabled, false);
  assert.ok(Object.isFrozen(LAB_FIELD_TARGETS));
  assert.ok(Object.isFrozen(LAB_FIELD_TARGETS.intro));
  assert.ok(Object.isFrozen(LAB_FIELD_TARGETS.systemMapCard));
});

test("Lab shell mounts the fields only on the Lab directory route", () => {
  const shell = fs.readFileSync("lab/shared/shell.js", "utf8");
  assert.match(shell, /const LAB_HOME_ROUTE = "\/lab\/"/);
  assert.match(shell, /ensureStylesheet\(LAB_FIELDS_CSS\)/);
  assert.match(shell, /import\(LAB_FIELDS_MODULE\)/);
  assert.match(shell, /await initLabFields\(\)/);
  assert.match(shell, /if \(currentPath\(\) !== LAB_HOME_ROUTE\) return/);
});

test("Lab field styles make both mounts visible and pointer-transparent", () => {
  const css = fs.readFileSync("static/css/lab-fields.css", "utf8");
  assert.match(css, /\.lab-intro-atlas-field > \.atlas-field-canvas\s*\{[^}]*position:\s*absolute[^}]*opacity:\s*\.82[^}]*pointer-events:\s*none/s);
  assert.match(css, /#system-map\.lab-system-map-atlas-field > \.atlas-field-canvas\s*\{[^}]*inset:\s*0[^}]*opacity:\s*\.96[^}]*pointer-events:\s*none/s);
  assert.match(css, /#system-map\.lab-system-map-atlas-field > \.card-signature\s*\{[^}]*z-index:\s*3/s);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("governed preview watches every Lab field asset", () => {
  const workflow = fs.readFileSync(".github/workflows/interface-preview.yml", "utf8");
  for (const path of [
    "static/css/lab-fields.css",
    "static/js/atlas-field.js",
    "static/js/lab-fields.js",
    "lab/shared/shell.js",
    "js/tests/lab-fields.test.mjs",
  ]) {
    assert.ok(workflow.includes(`- "${path}"`), `${path} preview trigger`);
  }
});
