import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { normalizeHit } from "../../static/js/estate-search/client.js";

const renderer = fs.readFileSync("static/js/estate-search/render.js", "utf8");
const labCard = fs.readFileSync("lab/lab-card.js", "utf8");

test("estate search preserves rich corpus source metadata", () => {
  const hit = normalizeHit({
    id: "atlas-corpus/docs/ramone-public-context.md#1",
    text: "Public Ramone uses atlas-corpus.",
    source_repo: "atlas-corpus",
    file_path: "docs/ramone-public-context.md",
    doc_type: "ramone-public",
    score: 0.91,
    chunk_index: 1,
    source_title: "atlas-corpus/docs/ramone-public-context.md > Public Path",
    public_url: "https://github.com/AtlasReaper311/atlas-corpus/blob/main/docs/ramone-public-context.md",
    heading_path: "Ramone Public Context > Public Path",
    source_class: "curated-public",
    source_scope: "public",
    source_lifecycle: "production",
  });

  assert.equal(hit.id, "atlas-corpus/docs/ramone-public-context.md#1");
  assert.equal(hit.title, "atlas-corpus/docs/ramone-public-context.md > Public Path");
  assert.equal(hit.url, "https://github.com/AtlasReaper311/atlas-corpus/blob/main/docs/ramone-public-context.md");
  assert.equal(hit.heading, "Ramone Public Context > Public Path");
  assert.equal(hit.sourceClass, "curated-public");
  assert.equal(hit.sourceScope, "public");
});

test("estate search renderer prefers corpus URLs over guessed paths", () => {
  assert.match(renderer, /if \(hit\.url\) return hit\.url/);
  assert.match(renderer, /if \(hit\.title\) return hit\.title/);
  assert.match(renderer, /hit\.sourceScope/);
});

test("Lab local personality replies cannot render fake source chips", () => {
  assert.doesNotMatch(labCard, /renderSources\(egg\.sources\)/);
  assert.match(labCard, /personality response .* local .* no evidence/);
  assert.match(labCard, /document\.createElement\(href \? "a" : "span"\)/);
});

test("Lab Ramone renders readable public source cards", () => {
  assert.match(labCard, /ramone-mini-source-title/);
  assert.match(labCard, /ramone-mini-source-meta/);
  assert.match(labCard, /ramone-mini-source-preview/);
  assert.match(labCard, /sourceMeta\(s\)/);
  assert.match(labCard, /sourcePreview\(s && s\.preview\)/);
  assert.match(labCard, /aria-label", `source \$\{i \+ 1\}: \$\{title\}`/);
});
