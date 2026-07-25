import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const previewBase = process.env.PREVIEW_URL;
if (!previewBase) throw new Error("PREVIEW_URL is required");

const outputDir = process.env.SMOKE_OUTPUT_DIR
  ?? path.join(process.cwd(), "system-symphony-smoke");
const pageUrl = new URL("/lab/system-symphony/", previewBase).href;
const fatalPatterns = [
  /Tone\.js is unavailable/i,
  /Cross-Origin Request Blocked/i,
  /Access-Control-Allow-Origin/i,
  /file:\/\/\//i,
  /audio failed to start/i,
];
const consoleMessages = [];
const pageErrors = [];
const requestFailures = [];

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext();
const page = await context.newPage();

page.on("console", (message) => {
  consoleMessages.push({ type: message.type(), text: message.text() });
});
page.on("pageerror", (error) => {
  pageErrors.push(error.message);
});
page.on("requestfailed", (request) => {
  const url = request.url();
  const criticalRequest =
    url.includes("/vendor/tone.min.js")
    || url.includes("/lab/system-symphony/preview-data/")
    || url.startsWith("https://api.atlas-systems.uk/");
  if (!criticalRequest) return;
  requestFailures.push({
    url,
    error: request.failure()?.errorText ?? "unknown",
  });
});

let failure = null;
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

  for (const fixturePath of [
    "/lab/system-symphony/preview-data/sonify.json",
    "/lab/system-symphony/preview-data/topology.json",
    "/lab/system-symphony/preview-data/deployment.json",
    "/lab/system-symphony/preview-data/objectives.json",
  ]) {
    const fixture = await context.request.get(new URL(fixturePath, previewBase).href);
    assert.ok(fixture.ok(), `${fixturePath} answered ${fixture.status()}`);
    await fixture.json();
  }

  const audioButton = page.locator("[data-audio-toggle]:visible").first();
  await audioButton.waitFor({ state: "visible", timeout: 20_000 });
  await audioButton.click();
  await page.waitForFunction(() => {
    return [...document.querySelectorAll("[data-audio-toggle]")]
      .some((button) => (
        /stop/i.test(button.textContent ?? "")
        && button.getAttribute("aria-pressed") === "true"
      ));
  }, null, { timeout: 45_000 });

  const fatalConsole = consoleMessages.filter(({ text }) => (
    fatalPatterns.some((pattern) => pattern.test(text))
  ));
  assert.equal(pageErrors.length, 0, pageErrors.join("\n"));
  assert.equal(requestFailures.length, 0, JSON.stringify(requestFailures, null, 2));
  assert.equal(fatalConsole.length, 0, JSON.stringify(fatalConsole, null, 2));
} catch (error) {
  failure = error;
} finally {
  const state = await page.evaluate(() => ({
    location: window.location.href,
    toneAvailable: Boolean(window.Tone),
    toneContextState: window.Tone?.getContext?.()?.rawContext?.state
      ?? window.Tone?.context?.rawContext?.state
      ?? window.Tone?.context?.state
      ?? null,
    previewDataEnabled: window.__ATLAS_SYMPHONY_PREVIEW_DATA__ === true,
    audioButtons: [...document.querySelectorAll("[data-audio-toggle]")].map((button) => ({
      text: button.textContent?.trim() ?? "",
      disabled: button.disabled,
      ariaLabel: button.getAttribute("aria-label"),
      ariaPressed: button.getAttribute("aria-pressed"),
      visible: Boolean(button.offsetWidth || button.offsetHeight || button.getClientRects().length),
    })),
    importantStatus: document.querySelector("[data-important-status]")?.textContent?.trim() ?? null,
    hostState: document.getElementById("system-symphony-widget")?.dataset?.state ?? null,
    hostSource: document.getElementById("system-symphony-widget")?.dataset?.source ?? null,
  })).catch((error) => ({ evaluateError: error.message }));

  const report = {
    ok: failure === null,
    pageUrl,
    failure: failure instanceof Error
      ? { name: failure.name, message: failure.message, stack: failure.stack }
      : failure,
    state,
    consoleMessages,
    pageErrors,
    requestFailures,
  };
  await writeFile(
    path.join(outputDir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await page.screenshot({
    path: path.join(outputDir, "page.png"),
    fullPage: true,
  }).catch(() => {});
  await browser.close();
}

if (failure) throw failure;
console.log(`System Symphony preview smoke passed: ${pageUrl}`);
