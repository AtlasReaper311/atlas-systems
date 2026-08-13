import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { LAB_INTRO_FIELD } from "../../lab/shared/lab-intro-field.js";
import { SYSTEM_MAP_CARD_FIELD } from "../../lab/shared/system-map-card-field.js";

const markup = fs.readFileSync("lab/index.html", "utf8");
const systemMapPage = fs.readFileSync("lab/system-map/index.html", "utf8");
const cardCss = fs.readFileSync("lab/shared/system-map-card-field.css", "utf8");
const compositionCss = fs.readFileSync("static/css/secondary-surface-fields.css", "utf8");
const sharedCss = fs.readFileSync("static/css/atlas-field-consumer.css", "utf8");
const cardModule = fs.readFileSync("lab/shared/system-map-card-field.js", "utf8");
const introModule = fs.readFileSync("lab/shared/lab-intro-field.js", "utf8");
const registryModule = fs.readFileSync("static/js/atlas-field-composition-registry.js", "utf8");
const shell = fs.readFileSync("lab/shared/shell.js", "utf8");
const headers = fs.readFileSync("_headers", "utf8");
const previewWorkflow = fs.readFileSync(".github/workflows/interface-preview.yml", "utf8");
const previewSmoke = fs.readFileSync("scripts/smoke_system_map_card_field_preview.mjs", "utf8");

test("Lab AtlasField targets remain bounded to the intro and visible System Map directory card", () => {
  assert.equal(LAB_INTRO_FIELD.selector, ".page-intro");
  assert.equal(LAB_INTRO_FIELD.preset, "ambient");
  assert.equal(LAB_INTRO_FIELD.options.pointer.enabled, false);
  assert.equal(SYSTEM_MAP_CARD_FIELD.selector, 'a.directory-card[href="/lab/system-map/"]');
  assert.equal(SYSTEM_MAP_CARD_FIELD.preset, "card");
  assert.equal(SYSTEM_MAP_CARD_FIELD.options.pointer.enabled, false);
  assert.ok(Object.isFrozen(LAB_INTRO_FIELD));
  assert.ok(Object.isFrozen(SYSTEM_MAP_CARD_FIELD));
  assert.equal((markup.match(/class="system-card directory-card"[^>]*href="\/lab\/system-map\/"/g) || []).length, 1);
  assert.doesNotMatch(systemMapPage, /system-map-card-field|lab-intro-field/);
});

test("Lab card remains local while the intro uses the named composition registry", () => {
  assert.match(cardModule, /defineAtlasFieldConsumer/);
  assert.match(cardModule, /mountAtlasFieldConsumer/);
  assert.match(introModule, /ATLAS_FIELD_COMPOSITIONS\["signal-bloom"\]/);
  assert.match(introModule, /mountSecondarySurfaceField/);
  assert.match(registryModule, /"signal-bloom": composition/);
  assert.match(cardCss, /atlas-field-consumer\.css\?v=20260807-hero-contrast/);
  assert.match(cardCss, /\.system-map-card-atlas-field > \.card-signature\s*\{[^}]*position:\s*absolute/s);
  assert.match(compositionCss, /atlas-composition--signal-bloom/);
  assert.match(sharedCss, /\.atlas-field-surface > \.atlas-field-canvas/);
  assert.match(sharedCss, /\.atlas-field-surface > :not\(\.atlas-field-canvas\):not\(\.card-signature\)/);
  assert.match(sharedCss, /z-index:\s*4/);
  assert.match(sharedCss, /pointer-events:\s*none/);
});

test("Lab shell mounts fresh field assets only on the Lab directory", () => {
  assert.match(shell, /const LAB_HOME_ROUTE = "\/lab\/"/);
  assert.match(shell, /if \(currentPath\(\) !== LAB_HOME_ROUTE\) return/);
  assert.match(shell, /installLabIntroField\(\)/);
  assert.match(shell, /installSystemMapCardField\(\)/);
  assert.match(markup, /<link rel="stylesheet" href="\/static\/css\/secondary-surface-fields\.css\?v=20260807-hero-contrast">/);
  assert.match(markup, /<link rel="stylesheet" href="\/lab\/shared\/lab-intro-field\.css\?v=20260807-signature-position">/);
  assert.match(markup, /<header class="page-intro[^"]*\batlas-composition--signal-bloom\b/);
});

test("Lab field bootstrap assets cannot be retained stale", () => {
  for (const asset of [
    "/static/js/atlas-field-consumer.js",
    "/static/js/atlas-field-composition-registry.js",
    "/static/js/secondary-surface-fields.js",
    "/static/css/atlas-field-consumer.css",
    "/static/css/secondary-surface-fields.css",
    "/lab/shared/shell.js",
    "/lab/shared/system-map-card-field.js",
    "/lab/shared/system-map-card-field.css",
    "/lab/shared/lab-intro-field.js",
  ]) {
    assert.match(headers, new RegExp(`${asset.replaceAll("/", "\\/")}\n  Cache-Control: no-store, max-age=0`));
  }
});

test("surface-specific composition remains local", () => {
  assert.match(cardCss, /\.system-map-card-atlas-field::before\s*\{[^}]*linear-gradient/s);
  assert.match(cardCss, /opacity:\s*\.64/);
  assert.match(cardCss, /backdrop-filter:\s*blur\(4px\)/s);
  assert.match(compositionCss, /atlas-composition--signal-bloom::before/);
  assert.match(compositionCss, /opacity:\s*\.24/);
  assert.match(compositionCss, /signal-bloom-drift/);
});

test("governed preview verifies both visible Lab fields at pixel level", () => {
  assert.match(previewWorkflow, /smoke_system_map_card_field_preview\.mjs/);
  assert.match(previewSmoke, /systemMapCardSelector/);
  assert.match(previewSmoke, /atlasIntroFieldState/);
  assert.match(previewSmoke, /scrollIntoViewIfNeeded/);
  assert.match(previewSmoke, /minimumWidth:\s*320/);
  assert.match(previewSmoke, /minimumLuminousPixels:\s*4/);
  assert.match(previewSmoke, /minimumLuminousPixels:\s*8/);
});
