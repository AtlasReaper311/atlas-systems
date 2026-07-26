import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium, firefox } from "playwright";

const previewBase = process.env.PREVIEW_URL;
if (!previewBase) throw new Error("PREVIEW_URL is required");

const browserName = process.env.APU_BROWSER ?? "chromium";
const browserType = browserName === "firefox" ? firefox : chromium;
if (!browserType) throw new Error(`Unsupported APU_BROWSER: ${browserName}`);

const outputDirectory = process.env.APU_SMOKE_OUTPUT_DIR
  ?? path.join(process.cwd(), ".tmp", `system-symphony-apu-${browserName}`);
const route = new URL("/lab/system-symphony-apu/?symphonyPreviewData=1", previewBase).href;
const stateWindows = Object.freeze({
  healthy: Object.freeze({ minimum: -31, maximum: -12 }),
  warning: Object.freeze({ minimum: -31, maximum: -12 }),
  critical: Object.freeze({ minimum: -30, maximum: -11 }),
  unknown: Object.freeze({ minimum: -34, maximum: -18 }),
});

await fs.mkdir(outputDirectory, { recursive: true });

const launchOptions = browserName === "firefox"
  ? {
    headless: true,
    firefoxUserPrefs: {
      "media.autoplay.default": 0,
      "media.autoplay.ask-permission": false,
      "media.autoplay.blocking_policy": 0,
      "media.autoplay.block-webaudio": false,
      "media.allowed-to-play.enabled": true,
      "media.block-autoplay-until-in-foreground": false,
    },
  }
  : { headless: true };
const browser = await browserType.launch(launchOptions);
const page = await browser.newPage({
  viewport: { width: 1440, height: 1800 },
  reducedMotion: "reduce",
});

const consoleErrors = [];
const pageErrors = [];
const audioRequests = [];
const failedRequests = [];
const stateTransitions = [];
const stateMeasurements = [];
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
    const frame = globalThis.__ATLAS_APU__?.getFrame?.() ?? null;
    const arrangement = globalThis.__ATLAS_APU__?.getArrangement?.() ?? null;
    const diagnostics = globalThis.__ATLAS_APU__?.getDiagnostics?.() ?? null;
    const rows = [...(root?.querySelectorAll("[data-service]") ?? [])].map((row) => ({
      service: row.dataset.service ?? null,
      evidenceState: row.dataset.evidenceState ?? null,
      cells: [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim() ?? ""),
    }));
    return {
      buildId: globalThis.__ATLAS_APU__?.buildId ?? null,
      hybridBuildId: globalThis.__ATLAS_APU__?.hybridBuildId ?? null,
      documentBuild: document.documentElement.dataset.atlasApuBuild ?? null,
      documentHybridBuild: document.documentElement.dataset.atlasApuHybridBuild ?? null,
      loudnessBuildId: globalThis.__ATLAS_APU_LOUDNESS__?.buildId ?? null,
      masteringRuntimeBuildId: globalThis.__ATLAS_APU_MASTERING_RUNTIME__?.buildId ?? null,
      masteringRuntime: globalThis.__ATLAS_APU_MASTERING_RUNTIME__?.getStatus?.() ?? null,
      loudnessStatus: globalThis.__ATLAS_APU_LOUDNESS__?.getStatus?.() ?? null,
      loudnessMetrics: globalThis.__ATLAS_APU_LOUDNESS__?.getMetrics?.() ?? null,
      rawLoudnessMetrics: globalThis.__ATLAS_APU_LOUDNESS__?.getRawMetrics?.() ?? null,
      ready: root?.dataset.ready ?? null,
      running: root?.dataset.running ?? null,
      source: root?.dataset.source ?? null,
      noSamples: root?.dataset.apuNoSamples ?? null,
      volumeValue: root?.querySelector("[data-volume]")?.value ?? null,
      statusText: root?.querySelector("[data-status]")?.textContent?.trim() ?? null,
      fixtureBannerHidden: root?.querySelector("[data-preview-fixture-banner]")?.hidden ?? null,
      fixtureBannerText: root?.querySelector("[data-preview-fixture-banner]")?.textContent?.trim() ?? null,
      dominantReasonText: root?.querySelector("[data-dominant-reason]")?.textContent?.trim() ?? null,
      vectorValues: Object.fromEntries(
        ["healthy", "warning", "critical", "unknown"].map((state) => [
          state,
          root?.querySelector(`[data-state-vector="${state}"] [data-state-vector-value]`)?.textContent?.trim() ?? null,
        ]),
      ),
      metricState: metric("state"),
      metricSection: metric("section"),
      metricPosition: metric("position"),
      metricKnown: metric("known"),
      metricMeasured: metric("measured"),
      frame,
      stateVector: globalThis.__ATLAS_APU__?.getStateVector?.() ?? null,
      dominantReason: globalThis.__ATLAS_APU__?.getDominantReason?.() ?? null,
      arrangement,
      diagnostics,
      rows,
      channelCards: root?.querySelectorAll("[data-channel]").length ?? 0,
      timelineSections: root?.querySelectorAll("[data-form-section]").length ?? 0,
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
  }, { expectedState: state, expectedPolicy: policy }, { timeout: 12_000, polling: 100 });
  const snapshot = await collectEvidence();
  stateTransitions.push(snapshot.diagnostics.lastStateTransition);
}

async function resetMeter() {
  await page.evaluate(() => globalThis.__ATLAS_APU_LOUDNESS__?.reset?.());
}

async function measureState(label, state, policy) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await waitForStateTransition(state, policy);
  await resetMeter();
  await page.waitForTimeout(6500);
  await page.waitForFunction((expectedState) => {
    const metrics = globalThis.__ATLAS_APU_LOUDNESS__?.getMetrics?.();
    const mastering = globalThis.__ATLAS_APU_MASTERING_RUNTIME__?.getStatus?.();
    return mastering?.active === true
      && mastering?.state === expectedState
      && mastering?.targetGainDb === 4
      && metrics?.ready === true
      && Number(metrics?.blockCount) >= 20
      && Number.isFinite(metrics?.momentaryLufs)
      && Number.isFinite(metrics?.shortTermLufs)
      && Number.isFinite(metrics?.integratedLufs)
      && Number.isFinite(metrics?.sessionTruePeakDbtp);
  }, state, { timeout: 15_000, polling: 200 });

  const snapshot = await collectEvidence();
  const metrics = snapshot.loudnessMetrics;
  const window = stateWindows[state];
  assert.equal(snapshot.metricState, label);
  assert.equal(snapshot.frame.scoreState, state);
  assert.equal(snapshot.masteringRuntime.state, state);
  assert.equal(snapshot.masteringRuntime.policyBuildId, "20260726-system-symphony-mastering-v3");
  assert.equal(snapshot.masteringRuntime.targetGainDb, 4);
  assert.ok(metrics.integratedLufs >= window.minimum, `${browserName} ${state} fell below ${window.minimum} LUFS`);
  assert.ok(metrics.integratedLufs <= window.maximum, `${browserName} ${state} exceeded ${window.maximum} LUFS`);
  assert.ok(metrics.sessionTruePeakDbtp <= -0.8, `${browserName} ${state} exceeded the true-peak guard`);
  assert.ok(metrics.blockCount > 0);
  assert.ok(metrics.gatedBlockCount > 0);
  stateMeasurements.push({
    browser: browserName,
    state,
    policy,
    metrics,
    mastering: snapshot.masteringRuntime,
    section: snapshot.arrangement?.section ?? null,
    position: snapshot.metricPosition,
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
      path: path.join(outputDirectory, `atlas-apu-hybrid-${browserName}.png`),
      fullPage: true,
    });
  } catch (screenshotError) {
    consoleErrors.push(`screenshot failed: ${screenshotError.message}`);
  }
  await fs.writeFile(
    path.join(outputDirectory, fileName),
    `${JSON.stringify({
      route,
      browser: browserName,
      error: error ? { name: error.name, message: error.message, stack: error.stack } : null,
      evidence,
      stateTransitions,
      stateMeasurements,
      audioRequests,
      failedRequests,
      consoleErrors,
      pageErrors,
    }, null, 2)}\n`,
    "utf8",
  );
}

try {
  const response = await page.goto(route, { waitUntil: "networkidle", timeout: 60_000 });
  assert.equal(response?.ok(), true, `preview route answered ${response?.status()}`);
  await page.waitForSelector('[data-apu-root][data-ready="true"]', { timeout: 30_000 });

  const fixture = await collectEvidence();
  assert.equal(fixture.source, "preview");
  assert.equal(fixture.fixtureBannerHidden, false);
  assert.match(fixture.fixtureBannerText ?? "", /not live estate data/i);
  assert.equal(fixture.frame.evidenceMode, "preview");
  assert.equal(fixture.frame.previewEstateDerived, true);
  assert.equal(fixture.frame.scoreState, "healthy");
  assert.equal(fixture.metricState, "Healthy");
  assert.equal(fixture.metricKnown, "91%");
  assert.equal(fixture.metricMeasured, "19");
  assert.equal(fixture.rows.length, 21);
  assert.equal(fixture.rows.filter((row) => row.evidenceState === "current").length, 19);
  assert.equal(fixture.rows.filter((row) => row.evidenceState === "reported-unknown").length, 2);
  assert.equal(fixture.rows.filter((row) => row.cells[1] === "unknown").length, 0);
  assert.ok(fixture.stateVector.healthy > 0.75);
  assert.ok(fixture.stateVector.warning > 0);
  assert.ok(fixture.stateVector.unknown > 0);
  assert.equal(fixture.stateVector.critical, 0);
  assert.match(fixture.dominantReason ?? "", /Healthy supplies the harmonic grammar/);

  await page.getByRole("button", { name: "Start audio" }).click();
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-apu-root]");
    return root?.dataset.running === "true"
      && globalThis.Tone?.getContext?.().state === "running"
      && globalThis.__ATLAS_APU__?.getArrangement?.()?.section;
  }, null, { timeout: 15_000 });
  await page.waitForFunction(() => {
    const status = globalThis.__ATLAS_APU_LOUDNESS__?.getStatus?.();
    const mastering = globalThis.__ATLAS_APU_MASTERING_RUNTIME__?.getStatus?.();
    return status?.status === "running" && status?.processorReady === true && mastering?.active === true;
  }, null, { timeout: 15_000, polling: 100 });

  await measureState("Warning", "warning", "tight-crossfade");
  await measureState("Critical", "critical", "hard-choke");
  await measureState("Unknown", "unknown", "one-bar-decay");
  await measureState("Healthy", "healthy", "crossfade");

  await page.waitForFunction(() => {
    const arrangement = globalThis.__ATLAS_APU__?.getArrangement?.();
    const diagnostics = globalThis.__ATLAS_APU__?.getDiagnostics?.();
    return arrangement?.section === "theme-b"
      && Number(diagnostics?.trackPhraseIndex) >= 7
      && Number(diagnostics?.stepIndex) > 32 * 7
      && Object.keys(diagnostics?.channelFailures ?? {}).length === 0;
  }, null, { timeout: 40_000, polling: 250 });

  evidence = await collectEvidence();
  assert.match(evidence.hybridBuildId ?? "", /evidence-hybrid-v1$/);
  assert.equal(evidence.documentHybridBuild, evidence.hybridBuildId);
  assert.match(evidence.loudnessBuildId ?? "", /loudness-meter-v3$/);
  assert.match(evidence.masteringRuntimeBuildId ?? "", /mastering-runtime-v2$/);
  assert.equal(evidence.ready, "true");
  assert.equal(evidence.running, "true");
  assert.equal(evidence.noSamples, "true");
  assert.equal(evidence.volumeValue, "70");
  assert.equal(evidence.channelCards, 6);
  assert.equal(evidence.timelineSections, 10);
  assert.equal(evidence.arrangement.section, "theme-b");
  assert.deepEqual(evidence.diagnostics.channelFailures, {});
  assert.equal(evidence.toneState, "running");
  assert.equal(evidence.engineRunning, true);
  assert.equal(stateMeasurements.length, 4);
  assert.deepEqual(stateTransitions.map(({ to, policy: transitionPolicy }) => ({ to, policy: transitionPolicy })), [
    { to: "warning", policy: "tight-crossfade" },
    { to: "critical", policy: "hard-choke" },
    { to: "unknown", policy: "one-bar-decay" },
    { to: "healthy", policy: "crossfade" },
  ]);

  const unknownMeasurement = stateMeasurements.find((measurement) => measurement.state === "unknown");
  assert.ok(unknownMeasurement.metrics.integratedLufs > -34, `${browserName} Unknown remained effectively inaudible`);
  assert.deepEqual(audioRequests, [], "the hybrid APU preview requested an audio asset");
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
