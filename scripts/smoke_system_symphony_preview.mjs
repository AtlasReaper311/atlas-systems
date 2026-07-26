import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const previewBase = process.env.PREVIEW_URL;
if (!previewBase) throw new Error("PREVIEW_URL is required");

const outputDir = process.env.SMOKE_OUTPUT_DIR
  ?? path.join(process.cwd(), "system-symphony-smoke");
const pageUrl = new URL(
  "/lab/system-symphony/?symphonyDebug=1&symphonyPreviewData=1",
  previewBase,
).href;
const previewOrigin = new URL(previewBase).origin;
const API_ENDPOINTS = Object.freeze({
  sonify: "https://api.atlas-systems.uk/sonify",
  topology: "https://api.atlas-systems.uk/v1/topology",
  deployment: "https://api.atlas-systems.uk/deploy-watch/latest",
  objectives: "https://api.atlas-systems.uk/v1/reliability/objectives",
});
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
const audioRequests = [];

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
page.on("request", (request) => {
  if (/\.(?:wav|mp3|m4a|aac|ogg|opus|flac)(?:\?|$)/i.test(request.url())) {
    audioRequests.push(request.url());
  }
});
page.on("requestfailed", (request) => {
  const url = request.url();
  const criticalRequest =
    url.includes("/vendor/tone.min.js")
    || url.includes("/static/audio/system-symphony/")
    || url.startsWith("https://api.atlas-systems.uk/")
    || url.startsWith(`${previewOrigin}/lab/system-symphony/preview-data/`);
  if (!criticalRequest) return;
  requestFailures.push({
    url,
    error: request.failure()?.errorText ?? "unknown",
  });
});

let failure = null;
let previewEvidence = null;
try {
  const response = await page.goto(pageUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  assert.ok(response?.ok(), `preview page answered ${response?.status() ?? "no response"}`);

  await page.waitForFunction(() => (
    Boolean(window.Tone)
    && Boolean(window.__symphonyEngine)
    && Boolean(window.__ATLAS_SYMPHONY_PREVIEW_DATA__)
    && Boolean(document.getElementById("system-symphony-widget"))
  ), null, { timeout: 20_000 });

  previewEvidence = await page.evaluate(async (endpoints) => {
    const entries = await Promise.all(Object.entries(endpoints).map(async ([name, url]) => {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      return [name, {
        url: response.url,
        status: response.status,
        ok: response.ok,
        body: await response.json(),
      }];
    }));
    return Object.fromEntries(entries);
  }, API_ENDPOINTS);

  for (const [name, result] of Object.entries(previewEvidence)) {
    assert.equal(result.ok, true, `${name} answered ${result.status}`);
    assert.ok(result.url.startsWith(previewOrigin), `${name} did not use the same-origin preview fixture`);
    assert.equal(result.body?.preview, true, `${name} was not labelled as preview data`);
  }

  assert.ok(Array.isArray(previewEvidence.sonify.body?.services));
  assert.ok(previewEvidence.sonify.body.services.length > 0);
  assert.ok(Array.isArray(previewEvidence.topology.body?.components));
  assert.ok(previewEvidence.topology.body.components.length > 0);
  assert.equal(previewEvidence.deployment.body?.ok, true);
  assert.ok(Array.isArray(previewEvidence.objectives.body?.objectives));

  await page.waitForFunction(() => (
    document.getElementById("system-symphony-widget")?.dataset?.source === "preview"
  ), null, { timeout: 30_000 });

  const audioButton = page.locator("[data-audio-toggle]:visible").first();
  await audioButton.waitFor({ state: "visible", timeout: 20_000 });
  await audioButton.click();
  await page.waitForFunction(() => (
    [...document.querySelectorAll("[data-audio-toggle]")].some((button) => (
      /stop/i.test(button.textContent ?? "")
      && button.getAttribute("aria-pressed") === "true"
    ))
  ), null, { timeout: 45_000 });

  await page.waitForFunction(() => (
    window.__symphonyEngine?.isSampleReady?.() === true
  ), null, { timeout: 45_000 });
  await page.waitForFunction(() => (
    window.__symphonyEngine?.getSampleLoadStats?.()?.backgroundComplete === true
  ), null, { timeout: 90_000 });

  const audioState = await page.evaluate(() => {
    const host = document.getElementById("system-symphony-widget");
    return {
      toneContextState: window.Tone?.getContext?.()?.rawContext?.state
        ?? window.Tone?.context?.rawContext?.state
        ?? window.Tone?.context?.state
        ?? null,
      sampleStats: window.__symphonyEngine?.getSampleLoadStats?.() ?? null,
      buildId: window.__ATLAS_SYSTEM_SYMPHONY_BUILD__ ?? null,
      documentBuild: document.documentElement.dataset.systemSymphonyBuild ?? null,
      samplePalette: window.__symphonyEngine?.getSamplePalette?.() ?? null,
      composition: window.__symphonyEngine?.getCompositionSnapshot?.() ?? null,
      topologyNodes: host?.querySelectorAll("[data-node]").length ?? 0,
      serviceRows: host?.querySelectorAll("[data-service-table] tr").length ?? 0,
      stateWeightCards: host?.querySelectorAll("[data-state-weight]").length ?? 0,
      dominantReason: host?.querySelector("[data-dominant-reason]")?.textContent?.trim() ?? null,
      hostSource: host?.dataset?.source ?? null,
      hostRunning: host?.dataset?.running ?? null,
      pageOutputGain: Number(host?.dataset?.pageOutputGain),
      sliderValues: [...document.querySelectorAll("[data-volume]")]
        .map((slider) => Number(slider.value)),
      importantStatus: document.querySelector("[data-important-status]")?.textContent?.trim() ?? null,
    };
  });

  assert.equal(audioState.toneContextState, "running", JSON.stringify(audioState, null, 2));
  assert.equal(audioState.hostSource, "preview", JSON.stringify(audioState, null, 2));
  assert.equal(audioState.hostRunning, "1", JSON.stringify(audioState, null, 2));
  assert.match(audioState.buildId ?? "", /atlas-apu-live-v4$/);
  assert.equal(audioState.documentBuild, audioState.buildId);
  assert.equal(audioState.sampleStats?.coreReady, true, JSON.stringify(audioState, null, 2));
  assert.equal(audioState.sampleStats?.sampleFree, true, JSON.stringify(audioState, null, 2));
  assert.equal(audioState.sampleStats?.failed, 0, JSON.stringify(audioState, null, 2));
  assert.equal(audioState.sampleStats?.loaded, 0, JSON.stringify(audioState, null, 2));
  assert.equal(audioState.sampleStats?.totalAssets, 0, JSON.stringify(audioState, null, 2));
  assert.equal(audioState.samplePalette?.lead, "pulse-a", JSON.stringify(audioState, null, 2));
  assert.equal(audioState.samplePalette?.bass, "triangle", JSON.stringify(audioState, null, 2));
  assert.equal(audioState.samplePalette?.section, "sample-free", JSON.stringify(audioState, null, 2));
  assert.equal(audioState.samplePalette?.bassLoop, null);
  assert.ok(audioState.composition?.arrangement?.section, JSON.stringify(audioState, null, 2));
  assert.equal(audioState.composition?.diagnostics?.scorePlanGuard?.active, true, JSON.stringify(audioState, null, 2));
  assert.equal(audioState.composition?.diagnostics?.scorePlanGuard?.mode, "score-plan", JSON.stringify(audioState, null, 2));
  assert.equal(audioState.composition?.diagnostics?.sampleFree, true, JSON.stringify(audioState, null, 2));
  assert.ok(audioState.topologyNodes > 0, JSON.stringify(audioState, null, 2));
  assert.ok(audioState.serviceRows > 0, JSON.stringify(audioState, null, 2));
  assert.equal(audioState.stateWeightCards, 4);
  assert.ok(audioState.dominantReason, JSON.stringify(audioState, null, 2));
  assert.equal(audioState.pageOutputGain, 70);
  assert.ok(audioState.sliderValues.length >= 2);
  assert.ok(audioState.sliderValues.every((value) => value === 70));
  assert.deepEqual(audioRequests, [], "the live-route APU requested an audio asset");

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
    previewDataEnabled: Boolean(window.__ATLAS_SYMPHONY_PREVIEW_DATA__),
    sampleReady: window.__symphonyEngine?.isSampleReady?.() ?? false,
    sampleStats: window.__symphonyEngine?.getSampleLoadStats?.() ?? null,
    samplePalette: window.__symphonyEngine?.getSamplePalette?.() ?? null,
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
    hostRunning: document.getElementById("system-symphony-widget")?.dataset?.running ?? null,
    pageOutputGain: document.getElementById("system-symphony-widget")?.dataset?.pageOutputGain ?? null,
  })).catch((error) => ({ evaluateError: error.message }));

  const report = {
    ok: failure === null,
    pageUrl,
    failure: failure instanceof Error
      ? { name: failure.name, message: failure.message, stack: failure.stack }
      : failure,
    state,
    previewEvidence,
    audioRequests,
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
console.log(`System Symphony Atlas APU live-route preview passed: ${pageUrl}`);
