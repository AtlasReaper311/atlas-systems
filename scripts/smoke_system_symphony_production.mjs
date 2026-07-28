import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import { runSystemSymphonyProductionLoudnessProof } from "./run_system_symphony_production_loudness.mjs";

const siteUrl = process.env.SITE_URL;
if (!siteUrl) throw new Error("SITE_URL is required");

const expectedSha = process.env.EXPECTED_SHA ?? "unknown";
const outputDir = process.env.SYMPHONY_PRODUCTION_OUTPUT_DIR
  ?? path.join(process.cwd(), ".tmp", "system-symphony-production-smoke");
const pageUrl = new URL(
  `/lab/system-symphony/?symphonyDebug=1&atlas-deploy=${encodeURIComponent(expectedSha)}`,
  siteUrl,
).href;

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const audioRequests = [];
let evidence = null;
let loudnessEvidence = null;
let failure = null;

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("request", (request) => {
  if (/\.(?:wav|mp3|m4a|aac|ogg|opus|flac)(?:\?|$)/i.test(request.url())) {
    audioRequests.push(request.url());
  }
});
page.on("requestfailed", (request) => {
  const url = request.url();
  if (url.includes("cloudflareinsights.com")) return;
  failedRequests.push({ url, error: request.failure()?.errorText ?? "unknown" });
});

async function collectEvidence() {
  return page.evaluate(() => {
    const host = document.getElementById("system-symphony-widget");
    const engine = globalThis.__symphonyEngine;
    return {
      location: location.href,
      buildId: globalThis.__ATLAS_SYSTEM_SYMPHONY_BUILD__ ?? null,
      documentBuild: document.documentElement.dataset.systemSymphonyBuild ?? null,
      previewData: Boolean(globalThis.__ATLAS_SYMPHONY_PREVIEW_DATA__),
      source: host?.dataset.source ?? null,
      state: host?.dataset.state ?? null,
      running: host?.dataset.running ?? null,
      pageOutputGain: Number(host?.dataset.pageOutputGain),
      sliderValues: [...document.querySelectorAll("[data-volume]")].map((node) => Number(node.value)),
      topologyPresent: Boolean(host?.querySelector("[data-topology]")),
      topologyNodes: host?.querySelectorAll("[data-node]").length ?? 0,
      serviceRows: host?.querySelectorAll("[data-service-table] tr").length ?? 0,
      stateWeightCards: host?.querySelectorAll("[data-state-weight]").length ?? 0,
      dominantReason: host?.querySelector("[data-dominant-reason]")?.textContent?.trim() ?? null,
      toneState: globalThis.Tone?.getContext?.()?.rawContext?.state
        ?? globalThis.Tone?.getContext?.()?.state
        ?? null,
      engineRunning: engine?.isRunning?.() === true,
      sampleReady: engine?.isSampleReady?.() === true,
      sampleStats: engine?.getSampleLoadStats?.() ?? null,
      samplePalette: engine?.getSamplePalette?.() ?? null,
      composition: engine?.getCompositionSnapshot?.() ?? null,
      cartridge: globalThis.__ATLAS_APU_CARTRIDGE__ ?? null,
      cartridgeJson: document.querySelector("[data-cartridge-json]")?.textContent?.trim() ?? null,
      proofReplayHref: document.getElementById("page-proof-replay")?.href ?? null,
      proofSampleFree: document.getElementById("page-proof-sample-free")?.textContent?.trim() ?? null,
      proofSource: document.getElementById("page-proof-source")?.textContent?.trim() ?? null,
      importantStatus: host?.querySelector("[data-important-status]")?.textContent?.trim() ?? null,
    };
  });
}

try {
  const response = await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  assert.equal(response?.ok(), true, `production page answered ${response?.status()}`);

  await page.waitForFunction(() => (
    Boolean(globalThis.Tone)
    && Boolean(globalThis.__symphonyEngine)
    && Boolean(document.getElementById("system-symphony-widget"))
  ), null, { timeout: 25_000 });

  await page.waitForFunction(() => {
    const host = document.getElementById("system-symphony-widget");
    return host?.dataset.source === "live"
      && host.querySelectorAll("[data-node]").length > 0
      && host.querySelectorAll("[data-service-table] tr").length > 0;
  }, null, { timeout: 35_000, polling: 250 });

  await page.locator("[data-audio-toggle]:visible").first().click();
  await page.waitForFunction(() => {
    const engine = globalThis.__symphonyEngine;
    const snapshot = engine?.getCompositionSnapshot?.();
    return engine?.isRunning?.() === true
      && globalThis.Tone?.getContext?.().state === "running"
      && Boolean(snapshot?.arrangement?.section);
  }, null, { timeout: 20_000, polling: 100 });

  evidence = await collectEvidence();
  assert.match(evidence.buildId ?? "", /atlas-apu-live-v7$/);
  assert.equal(evidence.documentBuild, evidence.buildId);
  assert.equal(evidence.previewData, false);
  assert.equal(evidence.source, "live");
  assert.equal(evidence.running, "1");
  assert.equal(evidence.engineRunning, true);
  assert.equal(evidence.toneState, "running");
  assert.equal(evidence.pageOutputGain, 62);
  assert.ok(evidence.sliderValues.length >= 2);
  assert.ok(evidence.sliderValues.every((value) => value === 62));
  assert.equal(evidence.topologyPresent, true);
  assert.ok(evidence.topologyNodes > 0, "production topology map has no nodes");
  assert.ok(evidence.serviceRows > 0, "production service table has no rows");
  assert.equal(evidence.stateWeightCards, 4);
  assert.ok(evidence.dominantReason, "dominant-state explanation is missing");
  assert.equal(evidence.sampleReady, true);
  assert.equal(evidence.sampleStats?.sampleFree, true);
  assert.equal(evidence.sampleStats?.totalAssets, 0);
  assert.equal(evidence.samplePalette?.section, "sample-free");
  assert.ok(evidence.composition?.arrangement?.section);
  assert.equal(evidence.composition?.diagnostics?.scorePlanGuard?.active, true, JSON.stringify(evidence, null, 2));
  assert.equal(evidence.composition?.diagnostics?.scorePlanGuard?.mode, "score-plan", JSON.stringify(evidence, null, 2));
  assert.equal(evidence.composition?.diagnostics?.sampleFree, true, JSON.stringify(evidence, null, 2));
  assert.equal(evidence.cartridge?.title, "ATLAS APU CARTRIDGE", JSON.stringify(evidence, null, 2));
  assert.match(evidence.cartridge?.frameSeed ?? "", /^APU-[0-9A-F]{8}$/);
  assert.equal(evidence.cartridge?.source, "live", JSON.stringify(evidence, null, 2));
  assert.equal(evidence.cartridge?.sampleFree, "yes", JSON.stringify(evidence, null, 2));
  assert.match(evidence.cartridge?.replayUrl ?? "", /\/lab\/system-symphony\/replay\/\?frame=APU-/);
  assert.ok(evidence.cartridgeJson?.includes('"scorePlan"'), JSON.stringify(evidence, null, 2));
  assert.match(evidence.proofReplayHref ?? "", /\/lab\/system-symphony\/replay\/\?frame=APU-/);
  assert.match(evidence.proofSampleFree ?? "", /^yes \/ score-plan$/);
  assert.equal(evidence.proofSource, "live");
  assert.deepEqual(audioRequests, [], "production APU requested an audio asset");
  assert.deepEqual(failedRequests, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);

  loudnessEvidence = await runSystemSymphonyProductionLoudnessProof({
    browser,
    siteUrl,
    expectedSha,
    outputDir,
  });
} catch (error) {
  failure = error;
  evidence = evidence ?? await collectEvidence().catch((collectionError) => ({
    collectionError: collectionError.message,
  }));
} finally {
  await page.screenshot({
    path: path.join(outputDir, "system-symphony-production.png"),
    fullPage: true,
  }).catch(() => {});
  await writeFile(
    path.join(outputDir, "evidence.json"),
    `${JSON.stringify({
      ok: failure === null,
      pageUrl,
      expectedSha,
      failure: failure ? { name: failure.name, message: failure.message, stack: failure.stack } : null,
      evidence,
      loudnessEvidence,
      audioRequests,
      failedRequests,
      pageErrors,
      consoleErrors,
    }, null, 2)}\n`,
    "utf8",
  );
  await browser.close();
}

if (failure) throw failure;
console.log(`Production System Symphony live and 32-bar loudness smoke passed: ${pageUrl}`);
