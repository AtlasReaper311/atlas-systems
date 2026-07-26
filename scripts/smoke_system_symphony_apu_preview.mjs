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
  viewport: { width: 1440, height: 1600 },
  reducedMotion: "reduce",
});

const consoleErrors = [];
const pageErrors = [];
const audioRequests = [];
const failedRequests = [];
const stateTransitions = [];
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
    const loudnessText = (name) => root?.querySelector(`[data-loudness="${name}"]`)?.textContent?.trim() ?? null;
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
      loudnessStatus: root?.dataset.loudnessStatus ?? null,
      statusText: root?.querySelector("[data-status]")?.textContent?.trim() ?? null,
      metricState: metric("state"),
      metricScene: metric("scene"),
      metricSection: metric("section"),
      metricPosition: metric("position"),
      metricPhase: metric("phase"),
      metricComponents: metric("components"),
      loudnessStatusText: loudnessText("status"),
      loudnessMomentaryText: loudnessText("momentary"),
      loudnessShortTermText: loudnessText("short-term"),
      loudnessIntegratedText: loudnessText("integrated"),
      loudnessTruePeakText: loudnessText("true-peak"),
      loudnessMethodText: loudnessText("method"),
      loudnessControllerStatus: globalThis.__ATLAS_APU_LOUDNESS__?.getStatus?.() ?? null,
      loudnessMetrics: globalThis.__ATLAS_APU_LOUDNESS__?.getMetrics?.() ?? null,
      rawLoudnessMetrics: globalThis.__ATLAS_APU_LOUDNESS__?.getRawMetrics?.() ?? null,
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

async function waitForStateTransition(state, policy) {
  await page.waitForFunction(({ expectedState, expectedPolicy }) => {
    const diagnostics = globalThis.__ATLAS_APU__?.getDiagnostics?.();
    return diagnostics?.state === expectedState
      && diagnostics?.lastStateTransition?.to === expectedState
      && diagnostics?.lastStateTransition?.policy === expectedPolicy
      && Object.keys(diagnostics?.channelFailures ?? {}).length === 0;
  }, { expectedState: state, expectedPolicy: policy }, { timeout: 10_000, polling: 100 });
  const snapshot = await collectEvidence();
  stateTransitions.push(snapshot.diagnostics.lastStateTransition);
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
      stateTransitions,
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

  await page.waitForFunction(() => {
    const status = globalThis.__ATLAS_APU_LOUDNESS__?.getStatus?.();
    return status?.status === "running" && status?.processorReady === true;
  }, null, { timeout: 15_000, polling: 100 });

  await page.getByRole("button", { name: "Critical", exact: true }).click();
  await waitForStateTransition("critical", "hard-choke");

  await page.getByRole("button", { name: "Unknown", exact: true }).click();
  await waitForStateTransition("unknown", "one-bar-decay");

  await page.getByRole("button", { name: "Healthy", exact: true }).click();
  await waitForStateTransition("healthy", "crossfade");

  // Continue through bars 15-16 so transport, state transitions and the
  // monitoring-only worklet all remain active during a long browser run.
  await page.waitForFunction(() => {
    const arrangement = globalThis.__ATLAS_APU__?.getArrangement?.();
    const diagnostics = globalThis.__ATLAS_APU__?.getDiagnostics?.();
    const loudness = globalThis.__ATLAS_APU_LOUDNESS__?.getMetrics?.();
    return arrangement?.section === "theme-b"
      && Number(diagnostics?.trackPhraseIndex) >= 7
      && Number(diagnostics?.stepIndex) > 32 * 7
      && loudness?.ready === true
      && Number.isFinite(loudness?.momentaryLufs)
      && Number.isFinite(loudness?.shortTermLufs)
      && Number.isFinite(loudness?.integratedLufs)
      && Number.isFinite(loudness?.sessionTruePeakDbtp);
  }, null, { timeout: 55_000, polling: 250 });

  evidence = await collectEvidence();

  assert.match(evidence.buildId ?? "", /state-identities-v1$/);
  assert.equal(evidence.documentBuild, evidence.buildId);
  assert.equal(evidence.ready, "true");
  assert.equal(evidence.running, "true");
  assert.equal(evidence.noSamples, "true");
  assert.equal(evidence.source, "simulated");
  assert.equal(evidence.metricState, "Healthy");
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
  assert.equal(evidence.diagnostics.state, "healthy");
  assert.deepEqual(evidence.diagnostics.channelFailures, {});
  assert.equal(evidence.toneState, "running");
  assert.equal(evidence.engineRunning, true);

  assert.equal(evidence.loudnessStatus, "running");
  assert.equal(evidence.loudnessControllerStatus.status, "running");
  assert.equal(evidence.loudnessControllerStatus.processorReady, true);
  assert.equal(evidence.loudnessMetrics.ready, true);
  assert.ok(Number.isFinite(evidence.loudnessMetrics.momentaryLufs));
  assert.ok(Number.isFinite(evidence.loudnessMetrics.shortTermLufs));
  assert.ok(Number.isFinite(evidence.loudnessMetrics.integratedLufs));
  assert.ok(Number.isFinite(evidence.loudnessMetrics.sessionTruePeakDbtp));
  assert.ok(evidence.loudnessMetrics.blockCount > 0);
  assert.ok(evidence.loudnessMetrics.gatedBlockCount > 0);
  assert.match(evidence.loudnessMetrics.truePeakMethod, /4x-cubic-estimate/);
  assert.match(evidence.loudnessMetrics.compliance, /BS\.1770-5/);
  assert.match(evidence.loudnessMomentaryText ?? "", /LUFS/);
  assert.match(evidence.loudnessIntegratedText ?? "", /LUFS/);
  assert.match(evidence.loudnessTruePeakText ?? "", /dBTP est\./);
  assert.match(evidence.loudnessMethodText ?? "", /normalised above the user volume control/);

  assert.deepEqual(stateTransitions.map(({ to, policy }) => ({ to, policy })), [
    { to: "critical", policy: "hard-choke" },
    { to: "unknown", policy: "one-bar-decay" },
    { to: "healthy", policy: "crossfade" },
  ]);
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
