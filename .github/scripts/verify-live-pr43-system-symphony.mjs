import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

const LIVE_URL = "https://atlas-systems.uk/lab/system-symphony/";
const OUTPUT_DIR = process.env.VERIFICATION_OUTPUT_DIR
  ?? path.join(process.cwd(), "live-pr43-system-symphony");
const ATTEMPTS = 15;
const RETRY_DELAY_MS = 10_000;
const REQUIRED_BUILD = "20260720-system-symphony-loop-production-v2";
const EXCLUDED = new Set(["wobbly-synth", "bass-transformer", "bass-angry"]);

await mkdir(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});

let finalReport = null;
let finalError = null;

for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  const requestFailures = [];
  const consoleMessages = [];
  let stage = "navigation";

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    consoleMessages.push({ type: message.type(), text: message.text() });
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (
      url.startsWith("https://api.atlas-systems.uk/")
      || url.includes("/vendor/tone.min.js")
      || url.includes("/static/audio/system-symphony/")
      || url.includes("/static/js/sonify/")
      || url.includes("/lab/system-symphony/")
    ) {
      requestFailures.push({
        url,
        error: request.failure()?.errorText ?? "unknown",
      });
    }
  });

  try {
    const cacheBust = Date.now();
    const url = `${LIVE_URL}?symphonyDebug=1&verify=${cacheBust}`;
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    assert.ok(response?.ok(), `live page answered ${response?.status() ?? "no response"}`);

    stage = "deployed-source";
    const deployedSource = await page.evaluate(async ({ build, bust }) => {
      const pageModule = await fetch(
        `/lab/system-symphony/system-symphony-page.js?verify=${bust}`,
        { cache: "no-store" },
      ).then((result) => result.text());
      const samplesModule = await fetch(
        `/static/js/sonify/samples.js?verify=${bust}`,
        { cache: "no-store" },
      ).then((result) => result.text());
      return {
        pageHasBuild: pageModule.includes(build),
        pageHasHeadroom: pageModule.includes("PAGE_OUTPUT_GAIN_PERCENT = 50"),
        samplesHasBuild: samplesModule.includes(build),
      };
    }, { build: REQUIRED_BUILD, bust: cacheBust });
    assert.equal(deployedSource.pageHasBuild, true, "live page module is still the pre-PR43 build");
    assert.equal(deployedSource.pageHasHeadroom, true, "live page module is missing 50 percent output headroom");
    assert.equal(deployedSource.samplesHasBuild, true, "live sample module is still the pre-PR43 build");

    stage = "engine-ready";
    await page.waitForFunction(() => (
      Boolean(window.Tone)
      && Boolean(window.__symphonyEngine)
      && Boolean(document.getElementById("system-symphony-widget"))
    ), null, { timeout: 30_000 });

    await page.waitForFunction(() => (
      document.getElementById("system-symphony-widget")?.dataset?.source === "live"
    ), null, { timeout: 60_000 });

    stage = "audio-start";
    const button = page.locator("[data-audio-toggle]:visible").first();
    await button.waitFor({ state: "visible", timeout: 30_000 });
    await button.click();

    await page.waitForFunction(() => (
      document.getElementById("system-symphony-widget")?.dataset?.running === "1"
      && [...document.querySelectorAll("[data-audio-toggle]")].some((node) => (
        node.getAttribute("aria-pressed") === "true"
        && /stop/i.test(node.textContent ?? "")
      ))
    ), null, { timeout: 45_000 });

    stage = "sample-library";
    await page.waitForFunction(() => (
      window.__symphonyEngine?.isSampleReady?.() === true
    ), null, { timeout: 45_000 });
    await page.waitForFunction(() => (
      window.__symphonyEngine?.getSampleLoadStats?.()?.backgroundComplete === true
    ), null, { timeout: 90_000 });

    stage = "assertions";
    const state = await page.evaluate(() => {
      const host = document.getElementById("system-symphony-widget");
      return {
        toneContextState: window.Tone?.getContext?.()?.rawContext?.state
          ?? window.Tone?.context?.rawContext?.state
          ?? window.Tone?.context?.state
          ?? null,
        source: host?.dataset?.source ?? null,
        running: host?.dataset?.running ?? null,
        pageOutputGain: Number(host?.dataset?.pageOutputGain),
        sampleReady: window.__symphonyEngine?.isSampleReady?.() ?? false,
        sampleStats: window.__symphonyEngine?.getSampleLoadStats?.() ?? null,
        samplePalette: window.__symphonyEngine?.getSamplePalette?.() ?? null,
        volumeValues: [...document.querySelectorAll("[data-volume]")]
          .map((slider) => Number(slider.value)),
        status: document.querySelector("[data-important-status]")?.textContent?.trim() ?? null,
        scoreState: host?.dataset?.state ?? null,
      };
    });

    assert.equal(state.toneContextState, "running", JSON.stringify(state, null, 2));
    assert.equal(state.source, "live", JSON.stringify(state, null, 2));
    assert.equal(state.running, "1", JSON.stringify(state, null, 2));
    assert.equal(state.pageOutputGain, 50, JSON.stringify(state, null, 2));
    assert.equal(state.sampleReady, true, JSON.stringify(state, null, 2));
    assert.equal(state.sampleStats?.requested, 38, JSON.stringify(state, null, 2));
    assert.equal(state.sampleStats?.loaded, 38, JSON.stringify(state, null, 2));
    assert.equal(state.sampleStats?.totalAssets, 38, JSON.stringify(state, null, 2));
    assert.equal(state.sampleStats?.failed, 0, JSON.stringify(state, null, 2));
    assert.equal(state.sampleStats?.fallbacks, 0, JSON.stringify(state, null, 2));
    assert.ok(state.samplePalette?.bassLoop, JSON.stringify(state, null, 2));
    assert.equal(EXCLUDED.has(state.samplePalette?.lead), false, JSON.stringify(state, null, 2));
    assert.equal(EXCLUDED.has(state.samplePalette?.bass), false, JSON.stringify(state, null, 2));
    assert.ok(state.volumeValues.length >= 2, JSON.stringify(state, null, 2));
    assert.ok(state.volumeValues.every((value) => value === 50), JSON.stringify(state, null, 2));
    assert.equal(pageErrors.length, 0, pageErrors.join("\n"));
    assert.equal(requestFailures.length, 0, JSON.stringify(requestFailures, null, 2));

    finalReport = {
      ok: true,
      attempt,
      stage,
      url,
      deployedSource,
      state,
      pageErrors,
      requestFailures,
      consoleMessages,
    };
    await page.screenshot({
      path: path.join(OUTPUT_DIR, "live-page.png"),
      fullPage: true,
    });
    finalError = null;
    await context.close();
    break;
  } catch (error) {
    finalError = error;
    finalReport = {
      ok: false,
      attempt,
      stage,
      error: {
        name: error?.name ?? "Error",
        message: error?.message ?? String(error),
        stack: error?.stack ?? null,
      },
      pageErrors,
      requestFailures,
      consoleMessages,
    };
    await page.screenshot({
      path: path.join(OUTPUT_DIR, `attempt-${attempt}.png`),
      fullPage: true,
    }).catch(() => {});
    await context.close();
    if (attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }
}

await browser.close();
await writeFile(
  path.join(OUTPUT_DIR, "report.json"),
  `${JSON.stringify(finalReport, null, 2)}\n`,
  "utf8",
);

if (finalError) throw finalError;
console.log(JSON.stringify(finalReport, null, 2));
