import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const paths = {
  registryModule: new URL("static/js/live/atlas-registry.js", root),
  homeModule: new URL("static/js/live/home-live-signal.js", root),
  mapModule: new URL("static/js/live/lab-system-map-bootstrap.js", root),
  labModule: new URL("static/js/live/lab-live-section.js", root),
  registryEntry: new URL("js/atlas-registry.js", root),
  homeEntry: new URL("js/live-signal.js", root),
  mapEntry: new URL("lab/system-map-bootstrap.js", root),
  labEntry: new URL("lab/live-section.js", root),
};

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([key, url]) => [key, await readFile(url, "utf8")]),
  ),
);

const versionedRegistryImport = /atlas-registry\.js\?v=20260720-esm-live/;

test("registry client exposes module exports instead of a window global", () => {
  assert.match(sources.registryModule, /export function subscribe\(/);
  assert.match(sources.registryModule, /export function refresh\(/);
  assert.match(sources.registryModule, /export function getSnapshot\(/);
  assert.doesNotMatch(sources.registryModule, /window\.AtlasRegistry/);
  assert.doesNotMatch(sources.registryEntry, /window\.AtlasRegistry/);
});

test("all active registry consumers import the same versioned module URL", () => {
  assert.match(sources.homeModule, versionedRegistryImport);
  assert.match(sources.mapModule, versionedRegistryImport);
  assert.match(sources.labModule, versionedRegistryImport);

  for (const source of [sources.homeModule, sources.mapModule, sources.labModule]) {
    assert.doesNotMatch(source, /window\.AtlasRegistry/);
  }
});

test("legacy script paths are compatibility loaders only", () => {
  assert.match(sources.registryEntry, /void import\(/);
  assert.match(sources.homeEntry, /void import\(/);
  assert.match(sources.mapEntry, /void import\(/);
  assert.match(sources.labEntry, /void import\(/);

  assert.doesNotMatch(sources.registryEntry, /\(function\s*\(/);
  assert.doesNotMatch(sources.homeEntry, /\(function\s*\(/);
  assert.doesNotMatch(sources.mapEntry, /\(function\s*\(/);
  assert.doesNotMatch(sources.labEntry, /\(function\s*\(/);
});
