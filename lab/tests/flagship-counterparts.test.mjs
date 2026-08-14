import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const labHtmlUrl = new URL("../index.html", import.meta.url);
const labIntroFieldUrl = new URL("../shared/lab-intro-field.js", import.meta.url);
const counterpartUrl = new URL("../shared/flagship-counterparts.js", import.meta.url);
const counterpartCssUrl = new URL("../shared/flagship-counterparts.css", import.meta.url);
const audioCardsCssUrl = new URL("../shared/audio-flagship-cards.css", import.meta.url);
const forgeFlagshipCssUrl = new URL("../spectral-forge/spectral-forge-flagship-v2.css", import.meta.url);
const forgeBootstrapUrl = new URL("../../static/js/spectral-forge/app.js", import.meta.url);
const fieldArtUrl = new URL("../../static/js/spectral-forge/spectral-field-art.js", import.meta.url);
const fieldComposeUrl = new URL("../../static/js/spectral-forge/spectral-field-compose-v4.js", import.meta.url);
const fieldGeometryUrl = new URL("../../static/js/spectral-forge/spectral-field-geometry.js", import.meta.url);
const fieldModelUrl = new URL("../../static/js/spectral-forge/spectral-field-model.js", import.meta.url);
const fieldLayersUrl = new URL("../../static/js/spectral-forge/spectral-field-layers-v4.js", import.meta.url);
const symphonyNavigationUrl = new URL("../system-symphony/system-symphony-navigation.js", import.meta.url);
const cardSignaturesUrl = new URL("../../static/js/card-signatures.js", import.meta.url);
const cardSignaturesCssUrl = new URL("../../static/css/card-signatures.css", import.meta.url);

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

test("shared counterpart module gives the two root instruments a LISTEN and DESIGN family identity", async () => {
  const module = await source(counterpartUrl);
  assert.match(module, /"\/lab\/system-symphony\/"/);
  assert.match(module, /href: "\/lab\/spectral-forge\/"/);
  assert.match(module, /family: "LISTEN"/);
  assert.match(module, /prefix: "SYSTEM"/);
  assert.match(module, /signature: "SYMPHONY"/);
  assert.match(module, /counterpartFamily: "DESIGN"/);
  assert.match(module, /"\/lab\/spectral-forge\/"/);
  assert.match(module, /href: "\/lab\/system-symphony\/"/);
  assert.match(module, /family: "DESIGN"/);
  assert.match(module, /prefix: "SPECTRAL"/);
  assert.match(module, /signature: "Forge"/);
  assert.match(module, /counterpartFamily: "LISTEN"/);
  assert.match(module, /ATLAS AUDIO \/\/ \$\{family\}/);
  assert.match(module, /spectral-forge-flagship-v2\.css/);
  assert.match(module, /\.forge-play \.forge-field-stage/);
  assert.match(module, /\.symphony-stage/);
  assert.match(module, /atlas-audio-title__signature/);
  assert.doesNotMatch(module, /fetch\(|localStorage|AudioContext|Math\.random/);
});

test("System Symphony flagship stage renders a deterministic score architecture without touching audio", async () => {
  const module = await source(counterpartUrl);
  const css = await source(counterpartCssUrl);
  assert.match(module, /function installSymphonyArchitecture\(pathname\)/);
  assert.match(module, /data-symphony-score-architecture/);
  assert.match(module, /window\.__ATLAS_APU_CARTRIDGE__/);
  assert.match(module, /SYMPHONY_ROLES/);
  assert.match(module, /scoreDensity\(cartridge, role\)/);
  assert.match(module, /requestAnimationFrame\(paint\)/);
  assert.doesNotMatch(module, /createOscillator|createGain|AudioContext|audioEngine/);
  assert.match(css, /\.symphony-score-architecture/);
  assert.match(css, /grid-template-columns:\s*minmax\(500px, \.92fr\) minmax\(520px, 1\.08fr\)/);
  assert.match(css, /APU-01 \/ LIVE SCORE ARCHITECTURE/);
  assert.match(css, /mask-image:\s*linear-gradient\(90deg/);
});

test("both audio flagships install the same counterpart module", async () => {
  const forge = await source(forgeBootstrapUrl);
  const symphony = await source(symphonyNavigationUrl);
  assert.match(forge, /flagship-counterparts\.js/);
  assert.match(forge, /installFlagshipCounterpart\(\)/);
  assert.match(symphony, /flagship-counterparts\.js/);
  assert.match(symphony, /if \(isRootRoute\(\)\) installFlagshipCounterpart\(\)/);
});

test("flagship family styling preserves focus, reduced motion and stronger title hierarchy", async () => {
  const css = await source(counterpartCssUrl);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /outline:\s*2px solid #f5a623/);
  assert.match(css, /atlas-audio-title--listen \.atlas-audio-title__prefix/);
  assert.match(css, /atlas-audio-title--listen \.atlas-audio-title__signature/);
  assert.match(css, /atlas-audio-title--design \.atlas-audio-title__prefix/);
  assert.match(css, /atlas-audio-title--design \.atlas-audio-title__signature/);
  assert.match(css, /color:\s*#f5a623/);
  assert.match(css, /text-shadow:/);
  assert.match(css, /symphony-transport__title h2\[data-page-now-playing\]/);
});

test("Spectral Forge removes the dead hero band and keeps PLAY and FORGE field-first", async () => {
  const css = await source(forgeFlagshipCssUrl);
  assert.match(css, /forge-product-header[\s\S]*min-height:\s*0/);
  assert.match(css, /forge-product-header[\s\S]*align-items:\s*center/);
  assert.match(css, /forge-play \.forge-field-stage/);
  assert.match(css, /min-height:\s*clamp\(700px, calc\(100svh - 250px\), 900px\)/);
  assert.match(css, /forge-route-overlay > span:nth-child\(2\)[\s\S]*visibility:\s*hidden/);
  assert.match(css, /forge-workspace/);
  assert.match(css, /minmax\(650px,1\.78fr\)/);
  assert.match(css, /forge-field-stage--compact/);
  assert.match(css, /min-height:\s*720px/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /width:\s*100%/);
});

test("active Spectral Field visual pipeline is state-driven rather than scenario-art directed", async () => {
  const art = await source(fieldArtUrl);
  const compose = await source(fieldComposeUrl);
  const geometry = await source(fieldGeometryUrl);
  const model = await source(fieldModelUrl);
  const layers = await source(fieldLayersUrl);
  const combinedStatePath = `${geometry}\n${model}\n${layers}`;
  assert.match(art, /spectral-field-compose-v4\.js/);
  assert.match(art, /spectral-field-layers-v4\.js/);
  assert.match(model, /function fieldArtState\(frame, mapped\)/);
  assert.match(model, /FIELD_VISUAL_SEED/);
  assert.match(geometry, /signatureState\(art, mapped, health, coherence\)/);
  assert.match(geometry, /radiusX = width \* \(0\.395/);
  assert.match(geometry, /depthSpan/);
  assert.match(geometry, /latticeSnap/);
  assert.match(layers, /function projectPoint\(state, x, y, z/);
  assert.match(layers, /drawPressureMembranes/);
  assert.match(layers, /drawSignatureMoments/);
  assert.match(layers, /drawSelectedRoute/);
  assert.match(layers, /localScale/);
  assert.match(compose, /drawPressureMembranes\.call/);
  assert.match(compose, /drawSignatureMoments\.call/);
  assert.doesNotMatch(model, /SCENARIO_ART_PROFILES|scenarioArtState|scenarioId/);
  assert.doesNotMatch(geometry, /SCENARIO_BY_ID|visualSeed|scenarioId/);
  assert.doesNotMatch(layers, /scenarioId/);
  assert.doesNotMatch(combinedStatePath, /\b(?:normal|traffic|flapping|creep|cascade|deploy)\b/i);
  assert.doesNotMatch(combinedStatePath, /Math\.random/);
});

test("Lab-home boot owns LISTEN and DESIGN card treatment without adding a standalone script", async () => {
  const labIntroField = await source(labIntroFieldUrl);
  const css = await source(audioCardsCssUrl);
  const labHtml = await source(labHtmlUrl);
  const globalJs = await source(cardSignaturesUrl);
  const globalCss = await source(cardSignaturesCssUrl);
  assert.match(labIntroField, /const AUDIO_FLAGSHIP_CARDS_CSS/);
  assert.match(labIntroField, /family: "LISTEN"/);
  assert.match(labIntroField, /family: "DESIGN"/);
  assert.match(labIntroField, /function enhanceAudioFlagshipCards/);
  assert.match(labIntroField, /`ATLAS AUDIO \/\/ \$\{definition\.family\}`/);
  assert.match(labIntroField, /lab-flagship-card__signature/);
  assert.match(labIntroField, /new URL\(documentNode\.baseURI\)\.pathname/);
  assert.match(labIntroField, /enhanceAudioFlagshipCards\(root\)/);
  assert.match(css, /\.lab-flagship-card__signature/);
  assert.match(css, /color:var\(--accent\)/);
  assert.match(css, /em\.lab-flagship-card__signature\{font-style:italic\}/);
  assert.doesNotMatch(labHtml, /\/lab\/shared\/audio-flagship-cards\.js/);
  assert.doesNotMatch(globalJs, /audio-flagship-cards\.js/);
  assert.doesNotMatch(globalJs, /const AUDIO_FLAGSHIPS|function enhanceAudioFlagshipCards/);
  assert.doesNotMatch(globalCss, /\.lab-flagship-card__signature/);
});