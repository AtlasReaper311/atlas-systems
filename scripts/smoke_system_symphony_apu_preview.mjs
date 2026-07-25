import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const previewBase = process.env.PREVIEW_URL;
if (!previewBase) throw new Error("PREVIEW_URL is required");

const outputDirectory = process.env.APU_SMOKE_OUTPUT_DIR
  ?? process.env.SMOKE_OUTPUT_DIR
  ?? path.join(process.cwd(), ".tmp", "system-symphony-apu-smoke");
const route = new URL("/lab/system-symphony-apu/?symphonyPreviewData=1", previewBase).href;

await fs.mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1400 },
  reducedMotion: "reduce",
});

const consoleErrors = [];
const pageErrors = [];
const audioRequests = [];
const failedRequests = [];
let evidence = null;

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
  failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? "unknown" });
});

async function collectEvidence() {
  return page.evaluate(() => {
    const root = document.querySelector("[data-apu-root]");
    const metric = (name) => root?.querySelector(`[data-metric="${name}"]`)?.textContent?.trim() ?? null;
    const arrangement = globalThis.__ATLAS_APU__?.getArrangement?.() ?? null;
    const timeline = globalThis.__ATLAS_APU__?.getTimeline?.() ?? [];
    const diagnostics = globalThis.__ATLAS_APU__?.getDiagnostics?.() ?? null;
    return {
      buildId: globalThis.__ATLAS_APU__?.buildId ?? null,
      documentBuild: document.documentElement.dataset.atlasApuBuild ?? null,
      ready: root?.dataset.ready ?? null,
      running: root?.dataset.running ?? null,
      noSamples: root?.dataset.apuNoSamples ?? null,
      source: root?.dataset.source ?? null,
      state: root?.dataset.state ?? null,
      section: root?.dataset.section ?? null,
      statusText: root?.querySelector("[data-status]")?.textContent?.trim() ?? null,
      metricState: metric("state"),
      metricScene: metric("scene"),
      metricSection: metric("section"),
      metricPosition: metric("position"),
      metricPhase: metric("phase"),
      metricComponents: metric("components"),
      serviceRows: root?.querySelectorAll("[data-service]").length ?? 0,
      channelCards: root?.querySelectorAll("[data-channel]").length ?? 0,
      timelineSections: root?.querySelectorAll("[data-form-section]").length ?? 0,
      activeTimelineSections: root?.querySelectorAll('[data-form-section][data-active="true"]').length ?? 0,
      timeline,
      arrangement,
      diagnostics,
      toneState: globalThis.Tone?.getContext?.().state ?? null,
      engineRunning: globalThis.__ATLAS_APU__?.isRunning?.() === true,
    };
  });
}

async function writeBundle(fileName, error = null) {
  try {
    evidence = evidence ?? await collectEvidence();
  } catch (collectionError) {
    evidence = { collectionError: collectionError.message };
  }
  try {
    await page.screenshot({
      path: path.join(outputDirectory, "atlas-apu-track-preview.png"),
      fullPage: true,
    });
  } catch (screenshotError) {
    consoleErrors.push(`screenshot failed: ${screenshotError.message}`);
  }
  await fs.writeFile(
    path.join(outputDirectory, fileName),
    `${JSON.stringify({
      route,
      error: error ? { name: error.name, message: error.message, stack: error.stack } : null,
      evidence,
      audioRequests,
      failedRequests,
      consoleErrors,
      pageErrors,
    }, null, 2)}\n`,
    "utf8",
  );
}

try {
  const response = await page.goto(route, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  assert.equal(response?.ok(), true, `preview route answered ${response?.status()}`);

  await page.waitForSelector('[data-apu-root][data-ready="true"]', { timeout: 30_000 });
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-apu-root]");
    return root?.dataset.running === "true"
      && globalThis.Tone?.getContext?.().state === "running"
      && globalThis.__ATLAS_APU__?.getArrangement?.()?.section;
  }, null, { timeout: 15_000 });

  // The original smoke test stopped after 1.8 seconds, long before the reported
  // failure at the end of Variation. Run through bars 15-16 so transport,
  // transition voices and percussion are proven beyond that boundary.
  await page.waitForFunction(() => {
    const arrangement = globalThis.__ATLAS_APU__?.getArrangement?.();
    const diagnostics = globalThis.__ATLAS_APU__?.getDiagnostics?.();
    return arrangement?.section === "theme-b"
      && Number(diagnostics?.trackPhraseIndex) >= 7
      && Number(diagnostics?.stepIndex) > 32 * 7;
  }, null, { timeout: 55_000, polling: 250 });

  evidence = await collectEvidence();

  assert.match(evidence.buildId ?? "", /atlas-apu-track-v2$/);
  assert.equal(evidence.documentBuild, evidence.buildId);
  assert.equal(evidence.ready, "true");
  assert.equal(evidence.running, "true");
  assert.equal(evidence.noSamples, "true");
  assert.equal(evidence.source, "preview");
  assert.notEqual(evidence.metricState, "Unknown");
  assert.ok(Number.parseInt(evidence.metricComponents ?? "0", 10) > 0);
  assert.ok(evidence.serviceRows > 0);
  assert.equal(evidence.channelCards, 6);
  assert.equal(evidence.timelineSections, 10);
  assert.equal(evidence.activeTimelineSections, 1);
  assert.equal(evidence.timeline.length, 10);
  assert.equal(evidence.timeline[0].startBar, 1);
  assert.equal(evidence.timeline.at(-1).endBar, 32);
  assert.equal(evidence.arrangement.section, "theme-b");
  assert.equal(evidence.arrangement.cycleBarStart, 15);
  assert.equal(evidence.arrangement.cycleBarEnd, 16);
  assert.equal(evidence.metricSection, "Theme B");
  assert.match(evidence.metricPosition ?? "", /Bars 15-16 \/ 32/);
  assert.ok(evidence.diagnostics.stepIndex > 32 * 7);
  assert.ok(evidence.diagnostics.trackPhraseIndex >= 7);
  assert.deepEqual(evidence.diagnostics.channelFailures, {});
  assert.equal(evidence.toneState, "running");
  assert.equal(evidence.engineRunning, true);
  assert.deepEqual(audioRequests, [], "the APU track preview requested an audio asset");

  const materialFailures = failedRequests.filter(({ url }) => !url.includes("cloudflareinsights.com"));
  assert.deepEqual(materialFailures, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);

  await writeBundle("evidence.json");
} catch (error) {
  await writeBundle("failure.json", error);
  throw error;
} finally {
  await browser.close();
}
