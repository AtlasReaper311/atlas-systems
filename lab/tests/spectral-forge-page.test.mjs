import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const htmlUrl = new URL("../spectral-forge/index.html", import.meta.url);
const cssUrls = [
  new URL("../spectral-forge/spectral-forge.css", import.meta.url),
  new URL("../spectral-forge/spectral-forge-foundation.css", import.meta.url),
  new URL("../spectral-forge/spectral-forge-workspace.css", import.meta.url),
  new URL("../spectral-forge/spectral-forge-analyse.css", import.meta.url),
  new URL("../spectral-forge/spectral-forge-responsive.css", import.meta.url),
];
const bootstrapUrl = new URL("../../static/js/spectral-forge/app.js", import.meta.url);
const controllerUrl = new URL("../../static/js/spectral-forge/app-core.js", import.meta.url);
const domainUrl = new URL("../../static/js/spectral-forge/domain.js", import.meta.url);
const audioUrl = new URL("../../static/js/spectral-forge/audio-engine.js", import.meta.url);
const stateUrl = new URL("../../static/js/spectral-forge/state.js", import.meta.url);
const visualsUrl = new URL("../../static/js/spectral-forge/visuals.js", import.meta.url);
const shellUrl = new URL("../shared/shell.js", import.meta.url);
const removedShellBridgeUrl = new URL("../spectral-forge/shell-bridge.js", import.meta.url);

async function source(url) {
  return readFile(url, "utf8");
}

async function allCss() {
  return (await Promise.all(cssUrls.map(source))).join("\n");
}

test("Spectral Forge declares the simulated evidence boundary and canonical route", async () => {
  const html = await source(htmlUrl);
  assert.match(html, /<html[^>]+data-evidence-mode="simulated"/i);
  assert.match(html, /class="[^"]*atlas-evidence-surface[^"]*"[^>]+data-evidence-mode="simulated"/i);
  assert.match(html, />SIMULATED</);
  assert.match(html, /Synthetic deterministic telemetry/);
  assert.match(html, /No production Atlas Systems data connected/);
  assert.match(html, /rel="canonical" href="https:\/\/atlas-systems\.uk\/lab\/spectral-forge\/"/);
  assert.doesNotMatch(html, />\s*LIVE\s*</i);
  assert.doesNotMatch(html, /\bLIVE DATA\b/i);
});

test("Spectral Forge preserves the progressive flagship hierarchy", async () => {
  const html = await source(htmlUrl);
  for (const depth of ["PLAY", "FORGE", "ANALYSE"]) {
    assert.match(html, new RegExp(`data-depth="${depth}"`));
    assert.match(html, new RegExp(`data-depth-panel="${depth}"`));
  }
  assert.match(html, /id="play-field"/);
  assert.match(html, /id="forge-field"/);
  assert.match(html, /id="analysis-field"/);
  assert.match(html, /id="audio-scope"/);
  assert.match(html, /id="route-focus"/);
  assert.match(html, /id="variant-a"[^>]*>A\s*<strong>BASELINE<\/strong>/);
  assert.match(html, /id="variant-b"[^>]*>B\s*<strong>CANDIDATE<\/strong>/);
});

test("Spectral Forge uses native controls for critical interaction paths", async () => {
  const html = await source(htmlUrl);
  assert.match(html, /<select id="scenario-select"/);
  assert.match(html, /<button[^>]+id="play-toggle"/);
  assert.match(html, /<button[^>]+id="audio-toggle"/);
  assert.match(html, /<dialog id="save-preset-dialog"/);
  assert.match(html, /<dialog id="forge-help-dialog"/);
  assert.match(html, /<select id="mapping-transform"/);
  assert.match(html, /<select id="mapping-polarity"/);
  assert.match(html, /<select id="mapping-smoothing"/);
  assert.doesNotMatch(html, /role="menu"|role="menuitem"/);
});

test("Spectral Forge is an Atlas-native static route registered by the shared Lab shell", async () => {
  const html = await source(htmlUrl);
  const bootstrap = await source(bootstrapUrl);
  const shell = await source(shellUrl);
  assert.match(html, /src="\/static\/js\/spectral-forge\/app\.js/);
  assert.match(html, /src="\/lab\/shared\/shell\.js/);
  assert.match(bootstrap, /\.\/app-core\.js/);
  assert.doesNotMatch(bootstrap, /shell-bridge/);
  assert.match(shell, /const SPECTRAL_FORGE_ROUTE = "\/lab\/spectral-forge\/"/);
  assert.match(shell, /label: "Spectral Forge", href: "\/lab\/spectral-forge\/"/);
  assert.match(shell, /isSystemSymphonyPath\(pathname\) \|\| pathname === SPECTRAL_FORGE_ROUTE/);
  await assert.rejects(access(removedShellBridgeUrl));
  assert.doesNotMatch(html, /next\/|react|vinext|drizzle|signin-with-chatgpt|\/workspace\/sites\//i);
});

test("production source contains no Sites machine-local paths or scaffold imports", async () => {
  const sources = await Promise.all([bootstrapUrl, controllerUrl, domainUrl, audioUrl, stateUrl, visualsUrl].map(source));
  const combined = `${await allCss()}\n${sources.join("\n")}`;
  assert.doesNotMatch(combined, /\/workspace\/sites\/|vinext|signin-with-chatgpt|drizzle-orm|\.openai\/hosting/i);
  assert.doesNotMatch(combined, /Math\.random\s*\(/);
});

test("audio implementation names true stereo width and a bounded sample stage", async () => {
  const audio = await source(audioUrl);
  const html = await source(htmlUrl);
  assert.match(audio, /createChannelSplitter\(2\)/);
  assert.match(audio, /createChannelMerger\(2\)/);
  assert.match(audio, /OUTPUT_CEILING_DBFS = -1/);
  assert.match(html, /TRUE MID \/ SIDE WIDTH/);
  assert.match(html, /−1 dBFS SAMPLE BOUND/);
});

test("interactive telemetry renders preserve focusable control identity", async () => {
  const controller = await source(controllerUrl);
  assert.match(controller, /lastPresetDefinitionSignature/);
  assert.match(controller, /lastRouteDefinitionSignature/);
  assert.match(controller, /lastInspectorConfigurationSignature/);
  assert.match(controller, /signalIndexNodes = new Map\(\)/);
  assert.match(controller, /audioParameterNodes = new Map\(\)/);
  assert.match(controller, /audibleSmoothing\(comparison\)/);
  assert.match(controller, /signature !== lastRouteDefinitionSignature/);
});

test("interface typography reserves sub-9px text for exceptional micro annotation only", async () => {
  const css = await allCss();
  assert.doesNotMatch(css, /font-size:\s*[67]px\b/);
  const eightPixelRules = css.match(/font-size:\s*8px\b/g) ?? [];
  assert.ok(eightPixelRules.length <= 1, `expected at most one 8px micro annotation, found ${eightPixelRules.length}`);
  assert.match(css, /font-size:\s*11px/);
  assert.match(css, /min-height:\s*44px/);
});

test("visual restoration uses hybrid flagship widths and focus-only skip link", async () => {
  const css = await allCss();
  const html = await source(htmlUrl);
  const bootstrap = await source(bootstrapUrl);
  assert.match(css, /--forge-content:\s*1100px/);
  assert.match(css, /--forge-controls:\s*1320px/);
  assert.match(css, /--forge-wide:\s*1440px/);
  assert.match(css, /\.forge-skip-link\s*\{[^}]*transform:\s*translateY\(calc\(-100% - 16px\)\)/);
  assert.match(css, /\.forge-skip-link:focus\s*\{[^}]*transform:\s*translateY\(0\)/);
  assert.match(css, /\.lab-flagship-counterpart--field\s*\{[^}]*width:\s*100%/);
  assert.match(bootstrap, /forge-product-identity p/);
  assert.match(bootstrap, /forge-counterpart-link/);
  assert.match(bootstrap, /lab-flagship-counterpart--field/);
  assert.match(html, /spectral-forge\.css\?v=20260813-visual-restoration-v2/);
});
