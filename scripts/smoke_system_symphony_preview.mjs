import assert from "node:assert/strict";
import { chromium } from "playwright";

const previewBase = process.env.PREVIEW_URL;
if (!previewBase) throw new Error("PREVIEW_URL is required");

const pageUrl = new URL("/lab/system-symphony/", previewBase).href;
const fatalPatterns = [
  /Tone\.js is unavailable/i,
  /Cross-Origin Request Blocked/i,
  /Access-Control-Allow-Origin/i,
  /file:\/\/\//i,
  /audio failed to start/i,
];
const diagnostics = [];

const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext();
const page = await context.newPage();

page.on("console", (message) => {
  const text = message.text();
  if (fatalPatterns.some((pattern) => pattern.test(text))) {
    diagnostics.push(`console ${message.type()}: ${text}`);
  }
});
page.on("pageerror", (error) => {
  diagnostics.push(`pageerror: ${error.message}`);
});
page.on("requestfailed", (request) => {
  const url = request.url();
  if (url.includes("static.cloudflareinsights.com")) return;
  diagnostics.push(`requestfailed: ${url} (${request.failure()?.errorText ?? "unknown"})`);
});

try {
  const response = await page.goto(pageUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  assert.ok(response?.ok(), `preview page answered ${response?.status() ?? "no response"}`);

  await page.waitForFunction(() => {
    return Boolean(window.Tone)
      && window.__ATLAS_SYMPHONY_PREVIEW_DATA__ === true;
  }, null, { timeout: 20_000 });

  for (const path of [
    "/lab/system-symphony/preview-data/sonify.json",
    "/lab/system-symphony/preview-data/topology.json",
    "/lab/system-symphony/preview-data/deployment.json",
    "/lab/system-symphony/preview-data/objectives.json",
  ]) {
    const fixture = await context.request.get(new URL(path, previewBase).href);
    assert.ok(fixture.ok(), `${path} answered ${fixture.status()}`);
    await fixture.json();
  }

  const audioButton = page.locator("[data-audio-toggle]").first();
  await audioButton.waitFor({ state: "visible", timeout: 20_000 });
  await audioButton.click();
  await page.waitForFunction(() => {
    return [...document.querySelectorAll("[data-audio-toggle]")]
      .some((button) => /pause/i.test(button.textContent ?? ""));
  }, null, { timeout: 30_000 });

  assert.equal(diagnostics.length, 0, diagnostics.join("\n"));
  console.log(`System Symphony preview smoke passed: ${pageUrl}`);
} finally {
  await browser.close();
}
