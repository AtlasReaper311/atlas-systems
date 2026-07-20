import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const homeLiveUrl = new URL(
  "../../static/js/live/home-live-signal.js",
  import.meta.url,
);
const homeStateCssUrl = new URL(
  "../../css/live-state-contract.css",
  import.meta.url,
);
const symphonyUiUrl = new URL(
  "../../static/js/sonify/ui.js",
  import.meta.url,
);
const symphonyCssUrl = new URL(
  "../../static/css/system-symphony.css",
  import.meta.url,
);

const [homeLiveSource, homeStateCss, symphonyUiSource, symphonyCss] =
  await Promise.all([
    readFile(homeLiveUrl, "utf8"),
    readFile(homeStateCssUrl, "utf8"),
    readFile(symphonyUiUrl, "utf8"),
    readFile(symphonyCssUrl, "utf8"),
  ]);

test("homepage live-state JavaScript emits semantics instead of visual styles", () => {
  assert.doesNotMatch(homeLiveSource, /\.style\s*[.=\[]/);
  assert.doesNotMatch(homeLiveSource, /\bcssText\b/);
  assert.doesNotMatch(homeLiveSource, /setAttribute\(["']style["']/);
  assert.doesNotMatch(homeLiveSource, /#4ade80|#e24b4a|rgba\(74\s*,\s*222|rgba\(226\s*,\s*75/);

  assert.match(homeLiveSource, /dot\.dataset\.state = level/);
  assert.match(homeLiveSource, /build\.dataset\.state = config\.state/);
  assert.match(homeLiveSource, /element\.dataset\.state = status/);
  assert.match(homeLiveSource, /element\.dataset\.state = "checking"/);
  assert.match(homeLiveSource, /strip\.dataset\.state = snapshot\.stale \? "stale" : "ok"/);
});

test("homepage visual states remain component-scoped", () => {
  assert.match(homeLiveSource, /function renderNavDot\(\)/);
  assert.match(homeLiveSource, /function renderDeploy\(\)/);
  assert.match(homeLiveSource, /function renderBackendGrid\(\)/);
  assert.match(homeLiveSource, /function renderCountdown\(\)/);
  assert.match(homeLiveSource, /function renderEstateStrip\(\)/);
  assert.doesNotMatch(
    homeLiveSource,
    /document\.(?:body|documentElement)\.dataset\.state/,
  );
});

test("homepage CSS owns state colour, halo, and animation", () => {
  assert.match(homeLiveSource, /\/css\/live-state-contract\.css\?v=20260720-vector-four/);
  assert.match(homeStateCss, /\.status-dot\[data-state="nominal"\]/);
  assert.match(homeStateCss, /\.status-dot\[data-state="degraded"\]/);
  assert.match(homeStateCss, /\.status-dot\[data-state="critical"\]/);
  assert.match(homeStateCss, /#build-status\[data-state="success"\]/);
  assert.match(homeStateCss, /#build-status\[data-state="failure"\]/);
  assert.match(homeStateCss, /\.signal-value\[data-state="ok"\]/);
  assert.match(homeStateCss, /\.signal-value\[data-state="error"\]/);
  assert.match(homeStateCss, /\.live-signal-countdown\[data-state="checking"\]/);
  assert.match(homeStateCss, /@media \(prefers-reduced-motion: reduce\)/);
});

test("System SYMPHONY keeps its semantic state-driven visual contract", () => {
  assert.match(symphonyUiSource, /host\.dataset\.state = "unknown"/);
  assert.match(symphonyUiSource, /host\.dataset\.state = frame\.scoreState/);
  assert.match(symphonyCss, /\.system-symphony\[data-state="healthy"\]/);
  assert.match(symphonyCss, /\.system-symphony\[data-state="warning"\]/);
  assert.match(symphonyCss, /\.system-symphony\[data-state="critical"\]/);
});
