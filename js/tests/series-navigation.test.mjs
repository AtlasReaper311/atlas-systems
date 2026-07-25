import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(new URL("../../writing/series.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../writing/series.css", import.meta.url), "utf8");
const articleStyles = readFileSync(new URL("../../writing/series-article.css", import.meta.url), "utf8");
const workStyles = readFileSync(new URL("../../css/project-series.css", import.meta.url), "utf8");

test("series state is derived rather than hard-coded to one upcoming part", () => {
  assert.match(script, /data-series-publish-date/);
  assert.match(script, /series-next/);
  assert.match(script, /series-scheduled/);
  assert.match(script, /publishedCount/);
  assert.doesNotMatch(script, /series-upcoming"\)/);
});

test("the temporary first-series bridge materializes the scheduler attribute contract", () => {
  assert.match(script, /function materializeFallback/);
  for (const attribute of [
    "data-series",
    "data-series-part",
    "data-series-total",
    "data-series-title",
    "data-series-note",
    "data-series-publish-date",
  ]) {
    assert.match(script, new RegExp(`setAttribute\\("${attribute}"`));
  }
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
