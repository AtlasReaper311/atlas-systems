import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const labHtmlUrl = new URL("../index.html", import.meta.url);
const counterpartUrl = new URL("../shared/flagship-counterparts.js", import.meta.url);
const counterpartCssUrl = new URL("../shared/flagship-counterparts.css", import.meta.url);
const forgeBootstrapUrl = new URL("../../static/js/spectral-forge/app.js", import.meta.url);
const symphonyNavigationUrl = new URL("../system-symphony/system-symphony-navigation.js", import.meta.url);

async function source(url) {
  return readFile(url, "utf8");
}

test("Lab presents System Symphony and Spectral Forge as complementary audio flagships", async () => {
  const html = await source(labHtmlUrl);
  assert.match(html, /class="lab-audio-flagships"/);
  assert.match(html, /Listen to a system\. Design how it becomes sound\./);
  assert.match(html, /href="\/lab\/system-symphony\/"/);
  assert.match(html, /href="\/lab\/spectral-forge\/"/);
  assert.match(html, /System SYMPHONY interprets bounded estate state/);
  assert.match(html, /Spectral Forge exposes the translation itself as a deterministic simulated instrument/);
});

test("Spectral Forge is discoverable from the Experience directory with an honest data mode", async () => {
  const html = await source(labHtmlUrl);
  assert.match(html, /data-motif="MAP" href="\/lab\/spectral-forge\/"/);
  assert.match(html, /<h3>Spectral Forge<\/h3>/);
  assert.match(html, /<span class="data-mode">Simulated<\/span>/);
  assert.match(html, /Three deeper ways into the estate/);
});

test("shared counterpart module links only the two root instruments", async () => {
  const module = await source(counterpartUrl);
  assert.match(module, /"\/lab\/system-symphony\/"/);
  assert.match(module, /href: "\/lab\/spectral-forge\/"/);
  assert.match(module, /"\/lab\/spectral-forge\/"/);
  assert.match(module, /href: "\/lab\/system-symphony\/"/);
  assert.match(module, /Audio counterpart/);
  assert.doesNotMatch(module, /fetch\(|localStorage|AudioContext|Math\.random/);
});

test("both audio flagships install the same counterpart module", async () => {
  const forge = await source(forgeBootstrapUrl);
  const symphony = await source(symphonyNavigationUrl);
  assert.match(forge, /flagship-counterparts\.js/);
  assert.match(forge, /installFlagshipCounterpart\(\)/);
  assert.match(symphony, /flagship-counterparts\.js/);
  assert.match(symphony, /if \(isRootRoute\(\)\) installFlagshipCounterpart\(\)/);
});

test("counterpart rail preserves the 44px interaction target and responsive contract", async () => {
  const css = await source(counterpartCssUrl);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /outline: 2px solid #f5a623/);
});
