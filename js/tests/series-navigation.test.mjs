import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(new URL("../../writing/series.js", import.meta.url), "utf8");
const writing = readFileSync(new URL("../../writing/index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../writing/series.css", import.meta.url), "utf8");
const articleStyles = readFileSync(new URL("../../writing/series-article.css", import.meta.url), "utf8");
const workStyles = readFileSync(new URL("../../css/project-series.css", import.meta.url), "utf8");

function attributeValue(card, attribute) {
  return card.match(new RegExp(`${attribute}="([^"]*)"`))?.[1] ?? null;
}

test("series state is derived from source metadata, not Ramone publication state", () => {
  assert.match(script, /data-series-publish-date/);
  assert.match(script, /series-next/);
  assert.match(script, /series-scheduled/);
  assert.match(script, /publishedCount/);
  assert.doesNotMatch(script, /series-upcoming"\)/);
  assert.doesNotMatch(script, /ramone-voice-assistant/);
});

test("the Writing source owns the complete scheduler series attribute contract", () => {
  assert.doesNotMatch(script, /materializeFallback|\bFALLBACK\b/);
  const cards = writing.match(
    /<a\b[^>]*class="article-entry"[^>]*data-series="pipeline-observability"[^>]*>/g,
  ) || [];
  assert.equal(cards.length, 3);
  for (const card of cards) {
    for (const attribute of [
      "data-series",
      "data-series-part",
      "data-series-total",
      "data-series-title",
      "data-series-note",
      "data-series-publish-date",
    ]) {
      assert.match(card, new RegExp(`${attribute}="[^"]+"`));
    }
  }
  assert.match(script, /Invalid scheduler-owned Writing series metadata/);
});

test("the published Ramone mini-series contains both accepted article parts", () => {
  const cards = [...writing.matchAll(
    /<a\b(?=[^>]*class="[^"]*\barticle-entry\b")(?=[^>]*data-series="ramone-voice-assistant")[^>]*>/g,
  )].map(([card]) => card);
  assert.equal(cards.length, 2);
  assert.equal(cards.filter((card) => /\bcoming-soon\b/.test(card)).length, 0);

  const parts = cards
    .map((card) => ({
      href: attributeValue(card, "href"),
      part: Number(attributeValue(card, "data-series-part")),
      total: Number(attributeValue(card, "data-series-total")),
      title: attributeValue(card, "data-series-title"),
      note: attributeValue(card, "data-series-note"),
      publishDate: attributeValue(card, "data-series-publish-date"),
    }))
    .sort((left, right) => left.part - right.part);

  assert.deepEqual(parts, [
    {
      href: "/writing/ramone-voice-assistant/",
      part: 1,
      total: 2,
      title: "Ramone Voice Assistant",
      note: "2 parts · 24–26 September 2026",
      publishDate: "2026-09-24",
    },
    {
      href: "/writing/ramone-voice-verified-actions/",
      part: 2,
      total: 2,
      title: "Ramone Voice Assistant",
      note: "2 parts · 24–26 September 2026",
      publishDate: "2026-09-26",
    },
  ]);
  assert.match(writing, /id="series-ramone-voice-assistant"/);
});

test("series refresh is observer-idempotent", () => {
  assert.match(script, /var observers = \[\];/);
  assert.match(script, /function disconnectObservers\(\)/);
  assert.match(script, /observer\.disconnect\(\)/);
  assert.match(script, /function apply\(\) \{\s*disconnectObservers\(\);/);
  assert.match(script, /observers\.push\(observer\)/);
});

test("writing series UI includes compact cards, progress, and contained article navigation", () => {
  assert.match(styles, /series-banner-progress/);
  assert.match(styles, /series-compact/);
  assert.match(styles, /series-next/);
  assert.match(articleStyles, /article-series-parts/);
  assert.match(articleStyles, /is-current/);
  assert.match(articleStyles, /is-live/);
  assert.match(articleStyles, /is-next/);
  assert.match(articleStyles, /position:\s*static/);
  assert.match(articleStyles, /inset:\s*auto/);
  assert.match(articleStyles, /height:\s*auto/);
  assert.match(articleStyles, /auto-fit/);
});

test("work page has a compact series badge treatment", () => {
  assert.match(workStyles, /\.project-series/);
  assert.match(workStyles, /var\(--accent/);
});
