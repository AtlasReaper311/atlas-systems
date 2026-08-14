import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fieldRuntimeUrl = new URL("../../static/js/spectral-forge/spectral-field-runtime.js", import.meta.url);
const fieldComposeCompatUrl = new URL("../../static/js/spectral-forge/spectral-field-compose.js", import.meta.url);
const fieldArtUrl = new URL("../../static/js/spectral-forge/spectral-field-art.js", import.meta.url);
const forgeAppUrl = new URL("../../static/js/spectral-forge/app.js", import.meta.url);
const forgePageUrl = new URL("../spectral-forge/index.html", import.meta.url);
const symphonyMovementCssUrl = new URL("../shared/symphony-live-movement.css", import.meta.url);
const counterpartUrl = new URL("../shared/flagship-counterparts.js", import.meta.url);

async function source(url) {
  return readFile(url, "utf8");
}

test("Spectral Forge playback has only one active Field renderer and a fresh page entrypoint", async () => {
  const runtime = await source(fieldRuntimeUrl);
  const compat = await source(fieldComposeCompatUrl);
  const art = await source(fieldArtUrl);
  const app = await source(forgeAppUrl);
  const page = await source(forgePageUrl);

  assert.match(runtime, /spectral-field-compose-v4\.js\?v=20260814-field-4-single-renderer/);
  assert.match(runtime, /const render = typeof this\.draw === "function" \? this\.draw : fallbackDraw;/);
  assert.match(runtime, /render\.call\(this, timestamp\);/);
  assert.doesNotMatch(runtime, /from "\.\/spectral-field-compose\.js"/);

  assert.match(compat, /export \{ draw \} from "\.\/spectral-field-compose-v4\.js\?v=20260814-field-4-single-renderer"/);
  assert.doesNotMatch(compat, /spectral-field-layers\.js/);
  assert.doesNotMatch(compat, /function canvasSize|drawSignalFilaments\.call|drawSpectralBody\.call/);

  assert.match(art, /spectral-field-compose-v4\.js/);
  assert.match(art, /spectral-field-runtime\.js\?v=20260814-field-4-playback/);
  assert.match(app, /spectral-field-art\.js\?v=20260814-field-4-playback/);
  assert.match(page, /\/static\/js\/spectral-forge\/app\.js\?v=20260814-field-4-single-renderer/);
  assert.doesNotMatch(page, /\/static\/js\/spectral-forge\/app\.js\?v=20260812-production-v1/);
});

test("System Symphony keeps the production NOW PLAYING scale while only the product identity is redesigned", async () => {
  const css = await source(symphonyMovementCssUrl);
  const counterpart = await source(counterpartUrl);

  assert.match(css, /symphony-transport__title h2\[data-page-movement\]/);
  assert.match(css, /symphony-transport__title h2\[data-page-now-playing\]/);
  assert.match(css, /font-size:\s*clamp\(2rem, 3vw, 2\.55rem\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /font-size:\s*clamp\(1\.75rem, 8vw, 2\.2rem\)/);
  assert.match(counterpart, /symphony-live-movement\.css\?v=20260814-symphony-title-only-v1/);
});
