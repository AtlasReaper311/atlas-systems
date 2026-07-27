import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { LAB_INTRO_FIELD } from "../../lab/shared/lab-intro-field.js";
import { SYSTEM_MAP_CARD_FIELD } from "../../lab/shared/system-map-card-field.js";

const markup = fs.readFileSync("lab/index.html", "utf8");
const systemMapPage = fs.readFileSync("lab/system-map/index.html", "utf8");
const cardCss = fs.readFileSync("lab/shared/system-map-card-field.css", "utf8");
const introCss = fs.readFileSync("lab/shared/lab-intro-field.css", "utf8");
const cardModule = fs.readFileSync("lab/shared/system-map-card-field.js", "utf8");
const introModule = fs.readFileSync("lab/shared/lab-intro-field.js", "utf8");
const shell = fs.readFileSync("lab/shared/shell.js", "utf8");
const headers = fs.readFileSync("_headers", "utf8");
const previewWorkflow = fs.readFileSync(".github/workflows/interface-preview.yml", "utf8");
const previewSmoke = fs.readFileSync("scripts/smoke_system_map_card_field_preview.mjs", "utf8");

test("Lab AtlasField targets remain bounded to the intro and featured System Map card", () => {
  assert.equal(LAB_INTRO_FIELD.selector, ".page-intro");
  assert.equal(LAB_INTRO_FIELD.options.preset, "ambient");
  assert.equal(LAB_INTRO_FIELD.options.pointer.enabled, false);
  assert.equal(SYSTEM_MAP_CARD_FIELD.selector, "#system-map.featured");
  assert.equal(SYSTEM_MAP_CARD_FIELD.options.preset, "card");
  assert.equal(SYSTEM_MAP_CARD_FIELD.options.pointer.enabled, false);
  assert.ok(Object.isFrozen(LAB_INTRO_FIELD));
  assert.ok(Object.isFrozen(SYSTEM_MAP_CARD_FIELD));
  assert.equal((markup.match(/id="system-map"/g) || []).length, 1);
  assert.doesNotMatch(systemMapPage, /system-map-card-field|lab-intro-field/);
});

test("Lab shell mounts fresh field assets only on the Lab directory", () => {
  assert.match(shell, /const LAB_HOME_ROUTE = "\/lab\/"/);
  assert.match(shell, /LAB_INTRO_FIELD_CSS = "\/lab\/shared\/lab-intro-field\.css\?v=20260727-lab-intro-field-v1"/);
  assert.match(shell, /LAB_INTRO_FIELD_MODULE = "\/lab\/shared\/lab-intro-field\.js\?v=20260727-lab-intro-field-v1"/);
  assert.match(shell, /SYSTEM_MAP_CARD_FIELD_CSS = "\/lab\/shared\/system-map-card-field\.css\?v=20260727-system-map-card-field-v2"/);
  assert.match(shell, /SYSTEM_MAP_CARD_FIELD_MODULE = "\/lab\/shared\/system-map-card-field\.js\?v=20260727-system-map-card-field-v2"/);
  assert.match(shell, /if \(currentPath\(\) !== LAB_HOME_ROUTE\) return/);
  assert.match(shell, /await Promise\.all\(\[/);
  assert.match(shell, /installLabIntroField\(\)/);
  assert.match(shell, /installSystemMapCardField\(\)/);
  assert.match(shell, /await installLabHomeFields\(\)/);
  assert.match(cardModule, /atlas-field\.js\?v=20260727-atlas-field-production-v2/);
  assert.match(introModule, /atlas-field\.js\?v=20260727-atlas-field-production-v2/);
});

test("Lab field mounts are idempotent", () => {
  assert.match(introModule, /atlasIntroFieldState === "ready"[\s\S]*querySelector\(":scope > canvas\.atlas-field-canvas"\)/);
  assert.match(cardModule, /atlasFieldState === "ready"[\s\S]*querySelector\(":scope > canvas\.atlas-field-canvas"\)/);
});

test("Lab field bootstrap assets cannot be retained stale", () => {
  for (const asset of [
    "/lab/shared/shell.js",
    "/lab/shared/system-map-card-field.js",
    "/lab/shared/system-map-card-field.css",
    "/lab/shared/lab-intro-field.js",
    "/lab/shared/lab-intro-field.css",
  ]) {
    assert.match(headers, new RegExp(`${asset.replaceAll("/", "\\/")}\n  Cache-Control: no-store, max-age=0`));
  }
});

test("System Map card field is restrained and protects content legibility", () => {
  assert.match(cardCss, /#system-map\.system-map-card-atlas-field::before\s*\{[^}]*z-index:\s*1[^}]*linear-gradient/s);
  assert.match(cardCss, /#system-map\.system-map-card-atlas-field > \.atlas-field-canvas\s*\{[^}]*opacity:\s*\.64[^}]*pointer-events:\s*none[^}]*brightness\(1\.12\)/s);
  assert.match(cardCss, /#system-map\.system-map-card-atlas-field > \.card-signature\s*\{[^}]*opacity:\s*1[^}]*rgba\(10, 10, 15, \.9\)[^}]*backdrop-filter:\s*blur\(4px\)/s);
  assert.equal(SYSTEM_MAP_CARD_FIELD.options.density.max, 520);
  assert.equal(SYSTEM_MAP_CARD_FIELD.options.light.radiusRatio, 0.38);
  assert.match(cardCss, /prefers-reduced-motion:\s*reduce/);
});

test("Lab intro field remains atmospheric rather than foreground content", () => {
  assert.match(introCss, /\.page-intro\.lab-intro-atlas-field::after\s*\{[^}]*z-index:\s*1[^}]*linear-gradient/s);
  assert.match(introCss, /\.page-intro\.lab-intro-atlas-field > \.atlas-field-canvas\s*\{[^}]*opacity:\s*\.42[^}]*pointer-events:\s*none[^}]*brightness\(\.9\)/s);
  assert.ok(LAB_INTRO_FIELD.options.density.max <= 520);
  assert.ok(LAB_INTRO_FIELD.options.domainStyles.every((style) => {
    const alpha = Number(style.match(/,\s*([0-9.]+)\)$/)?.[1] || 1);
    return alpha <= 0.1;
  }));
  assert.match(introCss, /prefers-reduced-motion:\s*reduce/);
});

test("governed preview verifies both visible Lab fields at pixel level", () => {
  assert.match(previewWorkflow, /smoke_system_map_card_field_preview\.mjs/);
  assert.match(previewWorkflow, /Verify System Map card AtlasField pixels/);
  assert.match(previewWorkflow, /system-map-card-field-preview-smoke/);
  assert.match(previewWorkflow, /playwright@1\.61\.1/);
  assert.match(previewSmoke, /atlasIntroFieldState/);
  assert.match(previewSmoke, /scrollIntoViewIfNeeded/);
  assert.match(previewSmoke, /minimumLuminousPixels:\s*4/);
  assert.match(previewSmoke, /minimumLuminousPixels:\s*8/);
});
