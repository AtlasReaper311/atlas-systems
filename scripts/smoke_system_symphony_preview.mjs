import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const previewBase = process.env.PREVIEW_URL;
if (!previewBase) throw new Error("PREVIEW_URL is required");

const outputDir = process.env.SMOKE_OUTPUT_DIR
  ?? path.join(process.cwd(), "system-symphony-smoke");
const pageUrl = new URL("/lab/system-symphony/?symphonyDebug=1", previewBase).href;
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
    || url.includes("/static/audio/system-symphony/")
    || url.startsWith("https://api.atlas-systems.uk/");
  if (!criticalRequest) return;
  requestFailures.push({
    url,
    error: request.failure()?.errorText ?? "unknown",
  });
});

let failure = null;
let liveEvidence = null;
try {
  const response = await page.goto(pageUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  assert.ok(response?.ok(), `preview page answered ${response?.status() ?? "no response"}`);

  await page.waitForFunction(() => (
    Boolean(window.Tone)
    && Boolean(window.__symphonyEngine)
    && Boolean(document.getElementById("system-symphony-widget"))
  ), null, { timeout: 20_000 });

  liveEvidence = await page.evaluate(async (endpoints) => {
    const entries = await Promise.all(Object.entries(endpoints).map(async ([name, url]) => {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const body = await response.json();
      return [name, {
        url: response.url,
        status: response.status,
        ok: response.ok,
        allowOrigin: response.headers.get("access-control-allow-origin"),
        cacheControl: response.headers.get("cache-control"),
        body,
      }];
    }));
    return Object.fromEntries(entries);
  }, API_ENDPOINTS);

  for (const [name, result] of Object.entries(liveEvidence)) {
    assert.equal(result.ok, true, `${name} answered ${result.status}`);
    assert.equal(result.body?.preview, undefined, `${name} returned preview fixture data`);
  }

  const sonify = liveEvidence.sonify.body;
  assert.equal(Array.isArray(sonify.services), true, "live /sonify services are missing");
  assert.equal(sonify.services.length, 22, `expected 22 live services, received ${sonify.services.length}`);
  assert.ok(sonify.services.some((service) => service.name === "atlas-dora"));
  assert.ok(sonify.services.some((service) => service.name === "specular-sonify"));
  assert.ok(
    sonify.services.every((service) => !String(service.evidence_source ?? "").startsWith("preview:")),
    "live /sonify contains preview evidence labels",
  );
  assert.ok(
    sonify.services.every((service) => !/preview fixture/i.test(String(service.health_detail ?? ""))),
    "live /sonify contains fixture health detail",
  );
  const sonifyAgeMs = Date.now() - Date.parse(sonify.timestamp ?? "");
  assert.ok(Number.isFinite(sonifyAgeMs) && sonifyAgeMs >= 0 && sonifyAgeMs < 300_000,
    `live /sonify timestamp is not current: ${sonify.timestamp}`);

  const topology = liveEvidence.topology.body;
  assert.equal(topology.schema, "atlas-public-topology/v3");
  assert.equal(topology.classification_authority, "AtlasReaper311/atlas-infra");
  assert.equal(topology.component_count, topology.components.length);
  const topologyById = new Map(topology.components.map((component) => [component.id, component]));
  assert.deepEqual(topologyById.get("atlas-systems")?.depends_on, [
    "github-pulse",
    "site-pulse",
    "deploy-watch",
    "atlas-api-public",
  ]);
  assert.deepEqual(topologyById.get("specular-sonify")?.depends_on, ["specular-telemetry"]);
  assert.deepEqual(topologyById.get("deploy-watch")?.depends_on, ["cloudflare"]);
  assert.deepEqual(topologyById.get("atlas-doc-viewer")?.depends_on, []);
  assert.notEqual(
    topologyById.get("specular-sonify")?.depends_on?.includes("atlas-api-public"),
    true,
    "specular-sonify must not claim atlas-api-public as its declared dependency",
  );

  assert.equal(liveEvidence.deployment.body?.ok, true);
  assert.equal(Array.isArray(liveEvidence.objectives.body?.objectives), true);

  await page.waitForFunction(() => (
    document.getElementById("system-symphony-widget")?.dataset?.source === "live"
  ), null, { timeout: 30_000 });

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

  await page.waitForFunction(() => (
    window.__symphonyEngine?.isSampleReady?.() === true
  ), null, { timeout: 45_000 });
  await page.waitForFunction(() => {
    const stats = window.__symphonyEngine?.getSampleLoadStats?.();
    return stats?.backgroundComplete === true;
  }, null, { timeout: 90_000 });

  const sampleStats = await page.evaluate(() => (
    window.__symphonyEngine?.getSampleLoadStats?.() ?? null
  ));
  assert.ok(sampleStats, "sample loader diagnostics are unavailable");
  assert.equal(sampleStats.coreReady, true, JSON.stringify(sampleStats, null, 2));
  assert.equal(sampleStats.failed, 0, JSON.stringify(sampleStats, null, 2));
  assert.equal(sampleStats.completed, sampleStats.totalAssets, JSON.stringify(sampleStats, null, 2));
  assert.equal(sampleStats.loaded, sampleStats.totalAssets, JSON.stringify(sampleStats, null, 2));

  const pageOutput = await page.evaluate(() => {
    const host = document.getElementById("system-symphony-widget");
    return {
      gain: Number(host?.dataset?.pageOutputGain),
      sliderValues: [...document.querySelectorAll("[data-volume]")]
        .map((slider) => Number(slider.value)),
    };
  });
  assert.equal(pageOutput.gain, 50);
  assert.ok(pageOutput.sliderValues.length >= 2);
  assert.ok(pageOutput.sliderValues.every((value) => value === 50));

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
    pageOutputGain: document.getElementById("system-symphony-widget")?.dataset?.pageOutputGain ?? null,
  })).catch((error) => ({ evaluateError: error.message }));

  const report = {
    ok: failure === null,
    pageUrl,
    failure: failure instanceof Error
      ? { name: failure.name, message: failure.message, stack: failure.stack }
      : failure,
    state,
    liveEvidence,
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
console.log(`System Symphony live-data preview smoke passed: ${pageUrl}`);
