import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import test from "node:test";

const visualsUrl = new URL("../../static/js/spectral-forge/visuals.js", import.meta.url);
const fieldRuntimeUrl = new URL("../../static/js/spectral-forge/spectral-field-runtime.js", import.meta.url);
const fieldComposeV4Url = new URL("../../static/js/spectral-forge/spectral-field-compose-v4.js", import.meta.url);
const forgeAppUrl = new URL("../../static/js/spectral-forge/app.js", import.meta.url);
const forgePageUrl = new URL("../spectral-forge/index.html", import.meta.url);
const symphonyPageUrl = new URL("../system-symphony/index.html", import.meta.url);
const counterpartCssUrl = new URL("../shared/flagship-counterparts.css", import.meta.url);
const counterpartUrl = new URL("../shared/flagship-counterparts.js", import.meta.url);
const headersUrl = new URL("../../_headers", import.meta.url);

const RETIRED_MODULES = [
  "../../static/js/spectral-forge/spectral-field-layers.js",
  "../../static/js/spectral-forge/spectral-field-compose.js",
  "../../static/js/spectral-forge/spectral-field-art.js",
  "../../static/js/spectral-forge/spectral-field-install.js",
  "../shared/symphony-live-movement.css",
];

async function source(url) {
  return readFile(url, "utf8");
}

async function exists(relative) {
  try {
    await access(new URL(relative, import.meta.url));
    return true;
  } catch {
    return false;
  }
}

test("Spectral Forge ships exactly one Field renderer with no resurrection path", async () => {
  const visuals = await source(visualsUrl);
  const runtime = await source(fieldRuntimeUrl);
  const composeV4 = await source(fieldComposeV4Url);

  // The renderer is bound at the class, not installed over the prototype at
  // import time. Ordering can no longer decide which artwork runs.
  assert.match(visuals, /import \{ draw as drawSpectralField \} from "\.\/spectral-field-compose-v4\.js"/);
  assert.match(visuals, /drawSpectralField\.call\(this, timestamp\)/);
  assert.match(composeV4, /this\.canvas\.dataset\.fieldRenderer = "v4-spatial"/);

  // The retired line-dominant renderer must not exist anywhere in the class.
  assert.doesNotMatch(visuals, /drawTraces/);
  assert.doesNotMatch(visuals, /createRadialGradient\(centerX/);
  assert.doesNotMatch(runtime, /fallbackDraw/);

  for (const retired of RETIRED_MODULES) {
    assert.equal(await exists(retired), false, `${retired} must stay deleted`);
  }
});

test("Forge module graph resolves each module once and defers caching to _headers", async () => {
  const app = await source(forgeAppUrl);
  const page = await source(forgePageUrl);
  const headers = await source(headersUrl);

  // Duplicate ?v= specifiers used to create two instances of the same module.
  assert.doesNotMatch(app, /\?v=/);
  assert.doesNotMatch(page, /spectral-forge\/app\.js\?v=/);
  assert.match(page, /<script type="module" src="\/static\/js\/spectral-forge\/app\.js">/);

  assert.match(headers, /\/static\/js\/spectral-forge\/\*/);
  assert.match(headers, /\/lab\/shared\/flagship-counterparts\.(js|css)/);
});

test("Flagship stylesheets are linked in the page head, not only injected at runtime", async () => {
  const forge = await source(forgePageUrl);
  const symphony = await source(symphonyPageUrl);
  const counterpart = await source(counterpartUrl);

  assert.match(forge, /<link rel="stylesheet" href="\/lab\/shared\/flagship-counterparts\.css/);
  assert.match(forge, /<link rel="stylesheet" href="\/lab\/spectral-forge\/spectral-forge-flagship-v2\.css/);
  assert.match(symphony, /<link rel="stylesheet" href="\/lab\/shared\/flagship-counterparts\.css/);

  // Runtime injection stays as an idempotent fallback only.
  assert.match(counterpart, /document\.head\.querySelector\(`link\[href\^="\$\{base\}"\]`\)/);
  assert.doesNotMatch(counterpart, /symphony-live-movement/);
});

test("System Symphony keeps the production NOW PLAYING scale in a linked stylesheet", async () => {
  const css = await source(counterpartCssUrl);

  assert.match(css, /symphony-transport__title h2\[data-page-movement\]/);
  assert.match(css, /symphony-transport__title h2\[data-page-now-playing\]/);
  assert.match(css, /font-size:\s*clamp\(2rem, 3vw, 2\.55rem\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /font-size:\s*clamp\(1\.75rem, 8vw, 2\.2rem\)/);
});
