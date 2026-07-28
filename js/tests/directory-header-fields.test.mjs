import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  DIRECTORY_HEADER_COMPOSITIONS,
  compositionForPath,
} from "../../static/js/directory-header-fields.js";

const css = fs.readFileSync("static/css/directory-header-fields.css", "utf8");
const enableEnhancements = fs.readFileSync("static/js/enable-enhancements.js", "utf8");
const cardSignatures = fs.readFileSync("static/js/card-signatures.js", "utf8");
const headers = fs.readFileSync("_headers", "utf8");
const previewWorkflow = fs.readFileSync(".github/workflows/interface-preview.yml", "utf8");
const previewSmoke = fs.readFileSync("scripts/smoke_directory_header_fields_preview.mjs", "utf8");

const expected = Object.freeze({
  systems: {
    path: "/systems/",
    selector: ".page-intro",
    composition: "atlas-header-composition--topology-current",
    seed: "atlas-systems-topology-current-v2",
  },
  work: {
    path: "/work/",
    selector: ".page-header",
    composition: "atlas-header-composition--build-fragments",
    seed: "atlas-work-build-fragments-v2",
  },
  writing: {
    path: "/writing/",
    selector: ".page-header",
    composition: "atlas-header-composition--editorial-drift",
    seed: "atlas-writing-editorial-drift-v2",
  },
});

test("directory headers use one behavioural preset with distinct compositions", () => {
  for (const [name, contract] of Object.entries(expected)) {
    const definition = DIRECTORY_HEADER_COMPOSITIONS[name];
    assert.equal(definition.selector, contract.selector);
    assert.equal(definition.preset, "ambient");
    assert.equal(definition.options.pointer.enabled, false);
    assert.equal(definition.options.seed, contract.seed);
    assert.ok(definition.hostClasses.includes("atlas-page-header"));
    assert.ok(definition.hostClasses.includes(contract.composition));
    assert.ok(Object.isFrozen(definition));
    assert.ok(Object.isFrozen(definition.options));
  }

  assert.equal(new Set(Object.values(expected).map(({ seed }) => seed)).size, 3);
  assert.notDeepEqual(
    DIRECTORY_HEADER_COMPOSITIONS.systems.options.domainStyles,
    DIRECTORY_HEADER_COMPOSITIONS.work.options.domainStyles,
  );
  assert.notDeepEqual(
    DIRECTORY_HEADER_COMPOSITIONS.work.options.domainStyles,
    DIRECTORY_HEADER_COMPOSITIONS.writing.options.domainStyles,
  );
  assert.ok(DIRECTORY_HEADER_COMPOSITIONS.systems.options.density.max > DIRECTORY_HEADER_COMPOSITIONS.work.options.density.max);
  assert.ok(DIRECTORY_HEADER_COMPOSITIONS.work.options.density.max > DIRECTORY_HEADER_COMPOSITIONS.writing.options.density.max);
});

test("route resolution is exact and does not decorate child pages", () => {
  for (const [name, contract] of Object.entries(expected)) {
    const composition = compositionForPath(contract.path);
    assert.equal(composition.name, name);
    assert.equal(composition.definition, DIRECTORY_HEADER_COMPOSITIONS[name]);
  }

  assert.equal(compositionForPath("/systems/reliability/"), null);
  assert.equal(compositionForPath("/writing/example/"), null);
  assert.equal(compositionForPath("/lab/"), null);
});

test("shared header CSS normalises geometry and typography", () => {
  assert.match(css, /\.atlas-page-header\s*\{[\s\S]*min-height:\s*clamp\(430px, 58vh, 620px\)/);
  assert.match(css, /padding:\s*calc\(var\(--atlas-header-height, 56px\) \+ 5rem\) 0 4rem !important/);
  assert.match(css, /\.atlas-page-header h1,[\s\S]*font:\s*400 clamp\(2\.8rem, 7vw, 5\.25rem\)\/1 var\(--serif\)/);
  assert.match(css, /\.atlas-page-header \.page-sub,[\s\S]*font-size:\s*16px[\s\S]*line-height:\s*1\.8/);
  assert.match(css, /\.atlas-page-header \.section-label,[\s\S]*letter-spacing:\s*\.2em/);
});

test("each composition has a materially different silhouette and animation grammar", () => {
  assert.match(css, /topology-current[^}]*scaleX\(1\.42\) scaleY\(\.52\)/s);
  assert.match(css, /topology-current::before[\s\S]*topology-scan/);
  assert.match(css, /topology-current::before[\s\S]*radial-gradient/);

  assert.match(css, /build-fragments[^}]*skewX\(-7deg\)/s);
  assert.match(css, /build-fragments[^}]*clip-path:\s*polygon/s);
  assert.match(css, /build-fragments::before[\s\S]*fragment-shift/);
  assert.match(css, /fragment-shift[\s\S]*steps\(6, end\)/);

  assert.match(css, /editorial-drift[^}]*rotate\(-13deg\) scale\(1\.28\)/s);
  assert.match(css, /editorial-drift::before[\s\S]*editorial-drift/);
  assert.match(css, /editorial-drift::before[\s\S]*repeating-linear-gradient/);

  const opacities = [...css.matchAll(/composition--(?:topology-current|build-fragments|editorial-drift) > \.directory-header-field-canvas \{[\s\S]*?opacity:\s*([.\d]+)/g)]
    .map((match) => Number(match[1]));
  assert.deepEqual(opacities, [0.2, 0.12, 0.075]);
});

test("route entrypoints and cache boundaries are explicit", () => {
  assert.match(enableEnhancements, /directory-header-fields\.js\?v=20260728-directory-header-compositions-v2/);
  assert.match(enableEnhancements, /"\/work\/", "\/writing\/"/);
  assert.match(cardSignatures, /^import "\.\/directory-header-fields\.js\?v=20260728-directory-header-compositions-v2";/);

  for (const asset of [
    "/static/js/directory-header-fields.js",
    "/static/css/directory-header-fields.css",
    "/static/js/enable-enhancements.js",
    "/static/js/card-signatures.js",
  ]) {
    assert.match(headers, new RegExp(`${asset.replaceAll("/", "\\/")}\n  Cache-Control: no-store, max-age=0`));
  }
});

test("governed preview verifies all three header canvases and shared formatting", () => {
  assert.match(previewWorkflow, /smoke_directory_header_fields_preview\.mjs/);
  assert.match(previewWorkflow, /Verify directory header AtlasField pixels and uniformity/);
  assert.match(previewSmoke, /systems[\s\S]*work[\s\S]*writing/);
  assert.match(previewSmoke, /atlasDirectoryHeaderState/);
  assert.match(previewSmoke, /luminousPixels/);
  assert.match(previewSmoke, /headerMinHeight/);
  assert.match(previewSmoke, /headingFontFamily/);
});