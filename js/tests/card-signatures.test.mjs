import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { CARD_SIGNATURES } from "../../static/js/card-signatures.js";

function cardRecords(markup) {
  return [...markup.matchAll(/<a\b[^>]*class="[^"]*\bsystem-card\b[^"]*"[^>]*>/g)].map(([tag]) => ({
    visual: tag.match(/\bdata-visual="([^"]+)"/)?.[1] ?? null,
    motif: tag.match(/\bdata-motif="([^"]+)"/)?.[1] ?? null,
  }));
}

test("every current Lab and Systems card resolves to a specialised SVG signature", () => {
  const lab = fs.readFileSync("lab/index.html", "utf8");
  const systems = fs.readFileSync("systems/index.html", "utf8");
  const sprite = fs.readFileSync("static/media/card-signatures.svg", "utf8");
  const labCards = cardRecords(lab);
  const systemCards = cardRecords(systems);
  assert.equal(labCards.length, 17);
  assert.equal(systemCards.length, 17);
  for (const [page, cards] of [["Lab", labCards], ["Systems", systemCards]]) {
    for (const [index, card] of cards.entries()) {
      assert.ok(card.visual, `${page} card ${index + 1} data-visual`);
      assert.ok(card.motif, `${page} card ${index + 1} data-motif`);
      assert.ok(CARD_SIGNATURES.includes(card.visual), `${page} ${card.visual} registered`);
      assert.ok(sprite.includes(`<symbol id="signature-${card.visual}"`), `${page} ${card.visual} symbol`);
    }
  }
  const visuals = [...new Set([...labCards, ...systemCards].map(({ visual }) => visual))].sort();
  assert.deepEqual(visuals, [...CARD_SIGNATURES].sort());
});

test("Lab and Systems load the signature assets", () => {
  for (const path of ["lab/index.html", "systems/index.html"]) {
    const markup = fs.readFileSync(path, "utf8");
    assert.match(markup, /\/static\/css\/card-signatures\.css\?v=20260724-card-signatures/);
    assert.match(markup, /\/static\/js\/card-signatures\.js\?v=20260724-card-signatures/);
  }
  const css = fs.readFileSync("static/css/card-signatures.css", "utf8");
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.system-card\.directory-card\s*\{[^}]*padding-bottom:/s);
  assert.match(css, /\.system-card\.directory-card \.card-route\s*\{[^}]*max-width:\s*none/s);
  assert.match(css, /\.system-card \.card-route\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(css, /\.system-card\.specimen-card\[data-card-signature-ready\]\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.system-card\.specimen-card:not\(\[data-card-signature-ready\]\)[^}]*max-width:\s*50%/s);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /> \.card-signature\s*\{[^}]*grid-row:\s*6/s);
  assert.match(css, /width:\s*clamp\(160px,\s*52%,\s*280px\)/);
  assert.match(css, /max-width:\s*620px[^]*grid-row:\s*6/);
  const script = fs.readFileSync("static/js/card-signatures.js", "utf8");
  assert.match(script, /fetch\(SPRITE_PATH/);
  assert.match(script, /preserving CSS motif fallback/);
});

test("governed preview validates card layout and watches every signature asset", () => {
  const workflow = fs.readFileSync(".github/workflows/interface-preview.yml", "utf8");
  for (const path of [
    "static/css/card-signatures.css",
    "static/js/card-signatures.js",
    "static/media/card-signatures.svg",
    "js/tests/card-signatures.test.mjs",
  ]) {
    assert.ok(workflow.includes(`- "${path}"`), `${path} preview trigger`);
  }

  const evidence = fs.readFileSync("scripts/capture_interface_evidence.mjs", "utf8");
  assert.match(evidence, /cardSignatureCount/);
  assert.match(evidence, /cardLayoutOverlaps/);
  assert.match(evidence, /card signature\/text overlaps/);
  assert.match(evidence, /cardRouteOverflows/);
  assert.match(evidence, /card CTA overflows/);
});
