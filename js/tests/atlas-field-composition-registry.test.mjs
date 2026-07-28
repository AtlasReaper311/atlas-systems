import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  ATLAS_FIELD_COMPOSITIONS,
  ATLAS_FIELD_ROUTE_COMPOSITIONS,
  compositionForRoute,
} from "../../static/js/atlas-field-composition-registry.js";

const css = fs.readFileSync("static/css/secondary-surface-fields.css", "utf8");
const transitions = fs.readFileSync("js/transitions.js", "utf8");
const focusedShell = fs.readFileSync("static/js/focused-systems-shell.js", "utf8");
const labIntro = fs.readFileSync("lab/shared/lab-intro-field.js", "utf8");

const expected = Object.freeze({
  "/systems/reliability/": ["pulse-horizon", ".focus-hero"],
  "/about/": ["identity-field", ".page-header"],
  "/lab/": ["signal-bloom", ".page-intro"],
});

test("registry resolves exact routes to frozen named compositions", () => {
  assert.deepEqual(Object.keys(ATLAS_FIELD_ROUTE_COMPOSITIONS), Object.keys(expected));
  for (const [route, [name, selector]] of Object.entries(expected)) {
    const resolved = compositionForRoute(route);
    assert.equal(resolved.name, name);
    assert.equal(resolved.definition, ATLAS_FIELD_COMPOSITIONS[name]);
    assert.equal(resolved.definition.selector, selector);
    assert.equal(resolved.definition.preset, "ambient");
    assert.equal(resolved.definition.options.pointer.enabled, false);
    assert.ok(Object.isFrozen(resolved.definition));
  }
  assert.equal(compositionForRoute("/systems/reliability/objectives/"), null);
  assert.equal(compositionForRoute("/about/cv/"), null);
  assert.equal(compositionForRoute("/lab/signal/"), null);
});

test("compositions have materially different motion and silhouettes", () => {
  assert.match(css, /pulse-horizon[^}]*scaleX\(1\.24\) scaleY\(\.62\)/s);
  assert.match(css, /pulse-horizon::before[\s\S]*pulse-horizon-scan/);
  assert.match(css, /identity-field[^}]*rotate\(-7deg\) scale\(1\.16\)/s);
  assert.match(css, /identity-field::before[\s\S]*identity-orbit/);
  assert.match(css, /signal-bloom[^}]*scale\(1\.12\) translate\(5%, 1%\)/s);
  assert.match(css, /signal-bloom::before[\s\S]*signal-bloom-drift/);
});

test("reliability colour is decorative and route entrypoints are exact", () => {
  assert.match(css, /Reliability: decorative monitoring cadence, never a live status signal/);
  assert.match(transitions, /window\.location\.pathname === "\/about\/"/);
  assert.match(focusedShell, /window\.location\.pathname === "\/systems\/reliability\/"/);
  assert.match(labIntro, /mountSecondarySurfaceField\(root, "\/lab\/"\)/);
});
