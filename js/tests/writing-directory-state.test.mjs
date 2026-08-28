import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = (path) => fs.readFileSync(path, "utf8");

function loadDirectoryContract() {
  const context = {};
  vm.runInNewContext(read("writing/directory-contract.js"), context, {
    filename: "writing/directory-contract.js",
  });
  return context.AtlasWritingDirectoryContract;
}

function card({ upcoming = false, series = false } = {}) {
  const classes = new Set(upcoming ? ["coming-soon"] : []);
  return {
    classList: {
      contains(value) {
        return classes.has(value);
      },
    },
    hasAttribute(name) {
      return name === "data-series" && series;
    },
  };
}

test("Writing content types are mutually exclusive", () => {
  const contract = loadDirectoryContract();
  const standalone = card();
  const series = card({ series: true });
  const upcomingSeries = card({ upcoming: true, series: true });

  assert.equal(contract.contentType(standalone), "case-study");
  assert.equal(contract.contentType(series), "series");
  assert.equal(contract.contentType(upcomingSeries), "upcoming");

  assert.equal(contract.matchesFilter(standalone, "case-study"), true);
  assert.equal(contract.matchesFilter(series, "case-study"), false);
  assert.equal(contract.matchesFilter(upcomingSeries, "case-study"), false);

  assert.equal(contract.matchesFilter(standalone, "series"), false);
  assert.equal(contract.matchesFilter(series, "series"), true);
  assert.equal(contract.matchesFilter(upcomingSeries, "series"), false);

  assert.equal(contract.matchesFilter(standalone, "upcoming"), false);
  assert.equal(contract.matchesFilter(series, "upcoming"), false);
  assert.equal(contract.matchesFilter(upcomingSeries, "upcoming"), true);

  for (const entry of [standalone, series, upcomingSeries]) {
    assert.equal(contract.matchesFilter(entry, "all"), true);
  }
});

test("Writing filter contract rejects unknown state and invalid cards", () => {
  const contract = loadDirectoryContract();
  assert.throws(() => contract.matchesFilter(card(), "articles"), /Unknown Writing filter/);
  assert.throws(() => contract.contentType(null), /requires an article card/);
});

test("Writing source loads the state contract before directory behavior", () => {
  const writing = read("writing/index.html");
  const contractIndex = writing.indexOf('/writing/directory-contract.js');
  const behaviorIndex = writing.indexOf('/writing/directory.js');
  assert.ok(contractIndex >= 0, "Writing must load the directory state contract");
  assert.ok(behaviorIndex > contractIndex, "Writing behavior must load after its state contract");
});

test("scheduler-owned series attributes are complete and browser fallback is absent", () => {
  const writing = read("writing/index.html");
  const series = read("writing/series.js");
  const cards = writing.match(
    /<a\b[^>]*class="article-entry(?: coming-soon)?"[^>]*data-series="pipeline-observability"[^>]*>/g,
  ) || [];

  assert.equal(cards.length, 3);
  for (const [index, source] of cards.entries()) {
    assert.match(source, new RegExp(`data-series-part="${3 - index}"`));
    assert.match(source, /data-series-total="3"/);
    assert.match(source, /data-series-title="Pipeline &amp; Observability"/);
    assert.match(source, /data-series-note="[^"]+"/);
    assert.match(source, /data-series-publish-date="\d{4}-\d{2}-\d{2}"/);
  }

  assert.doesNotMatch(series, /\bFALLBACK\b|materializeFallback/);
  assert.match(series, /Invalid scheduler-owned Writing series metadata/);
});

test("series refresh disconnects prior observers before rebuilding", () => {
  const series = read("writing/series.js");
  assert.match(series, /var observers = \[\];/);
  assert.match(series, /function disconnectObservers\(\)/);
  assert.match(series, /observer\.disconnect\(\)/);
  assert.match(series, /function apply\(\) \{\s*disconnectObservers\(\);/);
  assert.match(series, /observers\.push\(observer\)/);
  assert.match(series, /disconnect: disconnectObservers/);
});
