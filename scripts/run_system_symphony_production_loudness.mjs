import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  SYSTEM_SYMPHONY_BAR_DURATION_MS,
  SYSTEM_SYMPHONY_SAMPLE_INTERVAL_MS,
  SYSTEM_SYMPHONY_STATE_ALIGNMENT_BAR,
  SYSTEM_SYMPHONY_STATE_ALIGNMENT_STEP,
  SYSTEM_SYMPHONY_STATE_LABELS,
  SYSTEM_SYMPHONY_STATE_MEASUREMENT_BARS,
  SYSTEM_SYMPHONY_STATE_MEASUREMENT_MS,
  SYSTEM_SYMPHONY_STATE_PAGE_POLICY,
  SYSTEM_SYMPHONY_STATE_WINDOWS,
  SYSTEM_SYMPHONY_STATES,
  SYSTEM_SYMPHONY_TRANSITION_ROUTE,
  buildProgrammeSummary,
  buildStateMeasurementPlan,
  buildTransitionSummary,
  transitionPairs,
} from "./system-symphony-production-evidence.mjs";

async function collectEvidence(page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-apu-root]");
    const metric = (name) => root?.querySelector(`[data-metric="${name}"]`)?.textContent?.trim() ?? null;
    return {
      location: location.href,
      buildId: globalThis.__ATLAS_APU__?.buildId ?? null,
      hybridBuildId: globalThis.__ATLAS_APU__?.hybridBuildId ?? null,
      loudnessBuildId: globalThis.__ATLAS_APU_LOUDNESS__?.buildId ?? null,
      masteringRuntimeBuildId: globalThis.__ATLAS_APU_MASTERING_RUNTIME__?.buildId ?? null,
      masteringRuntime: globalThis.__ATLAS_APU_MASTERING_RUNTIME__?.getStatus?.() ?? null,
      loudnessStatus: globalThis.__ATLAS_APU_LOUDNESS__?.getStatus?.() ?? null,
      loudnessMetrics: globalThis.__ATLAS_APU_LOUDNESS__?.getMetrics?.() ?? null,
      ready: root?.dataset.ready ?? null,
      running: root?.dataset.running ?? null,
      source: root?.dataset.source ?? null,
      noSamples: root?.dataset.apuNoSamples ?? null,
      fixtureBannerHidden: root?.querySelector("[data-preview-fixture-banner]")?.hidden ?? null,
      fixtureBannerText: root?.querySelector("[data-preview-fixture-banner]")?.textContent?.trim() ?? null,
      metricState: metric("state"),
      metricPosition: metric("position"),
      frame: globalThis.__ATLAS_APU__?.getFrame?.() ?? null,
      arrangement: globalThis.__ATLAS_APU__?.getArrangement?.() ?? null,
      diagnostics: globalThis.__ATLAS_APU__?.getDiagnostics?.() ?? null,
      toneState: globalThis.Tone?.getContext?.().state ?? null,
      engineRunning: globalThis.__ATLAS_APU__?.isRunning?.() === true,
    };
  });
}

async function collectSample(page) {
  return page.evaluate(() => {
    const metrics = globalThis.__ATLAS_APU_LOUDNESS__?.getMetrics?.();
    const arrangement = globalThis.__ATLAS_APU__?.getArrangement?.();
    const diagnostics = globalThis.__ATLAS_APU__?.getDiagnostics?.();
    return {
      capturedAt: Date.now(),
      state: diagnostics?.state ?? null,
      section: arrangement?.section ?? null,
      position: arrangement?.cycleBarStart ?? null,
      stepIndex: Number(diagnostics?.stepIndex),
      momentaryLufs: Number(metrics?.momentaryLufs),
      shortTermLufs: Number(metrics?.shortTermLufs),
      integratedLufs: Number(metrics?.integratedLufs),
      truePeakDbtp: Number(metrics?.truePeakDbtp),
      sessionTruePeakDbtp: Number(metrics?.sessionTruePeakDbtp),
      blockCount: Number(metrics?.blockCount),
      gatedBlockCount: Number(metrics?.gatedBlockCount),
    };
  });
}

async function collectTimedSamples(page, durationMs) {
  const samples = [];
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    await page.waitForTimeout(SYSTEM_SYMPHONY_SAMPLE_INTERVAL_MS);
    samples.push(await collectSample(page));
  }
  return samples;
}

function attachDiagnostics(page, diagnostics) {
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("request", (request) => {
    if (/\.(?:wav|mp3|m4a|aac|ogg|opus|flac)(?:\?|$)/i.test(request.url())) {
      diagnostics.audioRequests.push(request.url());
    }
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("cloudflareinsights.com")) return;
    diagnostics.failedRequests.push({
      url: request.url(),
      error: request.failure()?.errorText ?? "unknown",
    });
  });
}

function assertPreviewBoundary(evidence) {
  assert.equal(evidence.source, "preview");
  assert.equal(evidence.fixtureBannerHidden, false);
  assert.match(evidence.fixtureBannerText ?? "", /not live estate data/i);
  assert.equal(evidence.frame?.evidenceMode, "preview");
  assert.equal(evidence.frame?.previewEstateDerived, true);
  assert.equal(evidence.frame?.scoreState, "healthy");
  assert.equal(evidence.metricState, "Healthy");
}

async function openEvidencePage({ browser, pageUrl, diagnostics, openPages }) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1800 },
    reducedMotion: "reduce",
  });
  openPages.add(page);
  attachDiagnostics(page, diagnostics);
  const response = await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 60_000 });
  assert.equal(response?.ok(), true, `production deterministic route answered ${response?.status()}`);
  await page.waitForSelector('[data-apu-root][data-ready="true"]', { timeout: 30_000 });
  const evidence = await collectEvidence(page);
  assertPreviewBoundary(evidence);
  return { page, evidence };
}

async function closeEvidencePage(page, openPages) {
  openPages.delete(page);
  await page.close().catch(() => {});
}

async function selectStateBeforePlayback(page, state) {
  const label = SYSTEM_SYMPHONY_STATE_LABELS[state];
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForFunction(({ expectedState, expectedLabel }) => {
    const root = document.querySelector("[data-apu-root]");
    const metricState = root?.querySelector('[data-metric="state"]')?.textContent?.trim() ?? null;
    const frame = globalThis.__ATLAS_APU__?.getFrame?.();
    return root?.dataset.source === "simulated"
      && frame?.scoreState === expectedState
      && metricState === expectedLabel;
  }, { expectedState: state, expectedLabel: label }, { timeout: 10_000, polling: 50 });
}

async function startAudio(page) {
  await page.getByRole("button", { name: "Start audio", exact: true }).click();
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
}

async function alignStateMeasurement(page, state) {
  await page.waitForFunction(({ expectedState, alignmentStep, alignmentBar }) => {
    const diagnostics = globalThis.__ATLAS_APU__?.getDiagnostics?.();
    const arrangement = globalThis.__ATLAS_APU__?.getArrangement?.();
    return diagnostics?.state === expectedState
      && Number(diagnostics?.stepIndex) >= alignmentStep
      && Number(diagnostics?.stepIndex) < alignmentStep + 16
      && arrangement?.cycleBarStart === alignmentBar
      && Object.keys(diagnostics?.channelFailures ?? {}).length === 0;
  }, {
    expectedState: state,
    alignmentStep: SYSTEM_SYMPHONY_STATE_ALIGNMENT_STEP,
    alignmentBar: SYSTEM_SYMPHONY_STATE_ALIGNMENT_BAR,
  }, { timeout: 20_000, polling: 25 });
  const evidence = await collectEvidence(page);
  assert.equal(evidence.frame?.scoreState, state);
  assert.equal(evidence.arrangement?.cycleBarStart, SYSTEM_SYMPHONY_STATE_ALIGNMENT_BAR);
  assert.ok(
    Number(evidence.diagnostics?.stepIndex) >= SYSTEM_SYMPHONY_STATE_ALIGNMENT_STEP
      && Number(evidence.diagnostics?.stepIndex) < SYSTEM_SYMPHONY_STATE_ALIGNMENT_STEP + 16,
    `${state} missed the aligned production measurement window`,
  );
  return evidence;
}

async function waitForTransition(page, from, to) {
  await page.waitForFunction(({ expectedFrom, expectedTo }) => {
    const diagnostics = globalThis.__ATLAS_APU__?.getDiagnostics?.();
    const transition = diagnostics?.lastStateTransition;
    return diagnostics?.state === expectedTo
      && transition?.from === expectedFrom
      && transition?.to === expectedTo
      && transition?.policy === "one-bar-decay"
      && Object.keys(diagnostics?.channelFailures ?? {}).length === 0;
  }, { expectedFrom: from, expectedTo: to }, { timeout: 12_000, polling: 100 });
}

async function measureState(page, state, alignedEvidence) {
  const expectedGainDb = state === "unknown" ? 8 : 4;
  await page.evaluate(() => globalThis.__ATLAS_APU_LOUDNESS__?.reset?.());
  const samples = await collectTimedSamples(page, SYSTEM_SYMPHONY_STATE_MEASUREMENT_MS);
  await page.waitForFunction(({ expectedState, expectedGain }) => {
    const metrics = globalThis.__ATLAS_APU_LOUDNESS__?.getMetrics?.();
    const mastering = globalThis.__ATLAS_APU_MASTERING_RUNTIME__?.getStatus?.();
    return mastering?.active === true
      && mastering?.state === expectedState
      && mastering?.targetGainDb === expectedGain
      && metrics?.ready === true
      && Number(metrics?.blockCount) >= 150
      && Number.isFinite(metrics?.integratedLufs)
      && Number.isFinite(metrics?.sessionTruePeakDbtp);
  }, { expectedState: state, expectedGain: expectedGainDb }, { timeout: 15_000, polling: 200 });

  const snapshot = await collectEvidence(page);
  const metrics = snapshot.loudnessMetrics;
  const window = SYSTEM_SYMPHONY_STATE_WINDOWS[state];
  assert.equal(snapshot.metricState, SYSTEM_SYMPHONY_STATE_LABELS[state]);
  assert.equal(snapshot.frame?.scoreState, state);
  assert.equal(snapshot.masteringRuntime?.state, state);
  assert.equal(snapshot.masteringRuntime?.policyBuildId, "20260728-system-symphony-mastering-v5");
  assert.equal(snapshot.masteringRuntime?.targetGainDb, expectedGainDb);
  if (state === "unknown") {
    assert.equal(snapshot.masteringRuntime?.targetIntegratedLufs, -24);
    assert.equal(snapshot.masteringRuntime?.targetToleranceDb, 3);
  }
  assert.ok(metrics.integratedLufs >= window.minimum, `${state} fell below ${window.minimum} LUFS in production`);
  assert.ok(metrics.integratedLufs <= window.maximum, `${state} exceeded ${window.maximum} LUFS in production`);
  assert.ok(metrics.sessionTruePeakDbtp <= -2, `${state} exceeded the production true-peak guard`);
  assert.ok(metrics.blockCount >= 150, `${state} did not collect the expected production loudness history`);
  assert.ok(metrics.gatedBlockCount > 0, `${state} produced no gated production loudness blocks`);

  return {
    state,
    label: SYSTEM_SYMPHONY_STATE_LABELS[state],
    policy: "stable-eight-bar-window",
    pagePolicy: SYSTEM_SYMPHONY_STATE_PAGE_POLICY,
    alignmentBar: SYSTEM_SYMPHONY_STATE_ALIGNMENT_BAR,
    alignmentStep: Number(alignedEvidence.diagnostics?.stepIndex),
    startSection: alignedEvidence.arrangement?.section ?? null,
    startPosition: alignedEvidence.metricPosition,
    measurementBars: SYSTEM_SYMPHONY_STATE_MEASUREMENT_BARS,
    measurementDurationMs: SYSTEM_SYMPHONY_STATE_MEASUREMENT_MS,
    metrics,
    mastering: snapshot.masteringRuntime,
    endSection: snapshot.arrangement?.section ?? null,
    endPosition: snapshot.metricPosition,
    samples,
  };
}

async function captureTransition(page, from, to) {
  await page.getByRole("button", { name: SYSTEM_SYMPHONY_STATE_LABELS[to], exact: true }).click();
  const stateWait = waitForTransition(page, from, to);
  const samples = await collectTimedSamples(page, SYSTEM_SYMPHONY_BAR_DURATION_MS);
  await stateWait;
  const snapshot = await collectEvidence(page);
  return {
    from,
    to,
    policy: snapshot.diagnostics?.lastStateTransition?.policy ?? null,
    transition: snapshot.diagnostics?.lastStateTransition ?? null,
    samples,
  };
}

export async function runSystemSymphonyProductionLoudnessProof({
  browser,
  siteUrl,
  expectedSha,
  outputDir,
}) {
  const pageUrl = new URL(
    `/lab/system-symphony-apu/?symphonyPreviewData=1&atlas-deploy=${encodeURIComponent(expectedSha)}`,
    siteUrl,
  ).href;
  const diagnostics = {
    audioRequests: [],
    failedRequests: [],
    pageErrors: [],
    consoleErrors: [],
  };
  const openPages = new Set();
  const stateMeasurements = [];
  const transitionMeasurements = [];
  let initialEvidence = null;
  let finalEvidence = null;
  let screenshotPage = null;
  let result = null;
  let failure = null;

  try {
    for (const plan of buildStateMeasurementPlan()) {
      const opened = await openEvidencePage({ browser, pageUrl, diagnostics, openPages });
      const { page } = opened;
      screenshotPage = page;
      initialEvidence ??= opened.evidence;
      await selectStateBeforePlayback(page, plan.mode);
      await startAudio(page);
      const alignedEvidence = await alignStateMeasurement(page, plan.state);
      stateMeasurements.push(await measureState(page, plan.state, alignedEvidence));
      await closeEvidencePage(page, openPages);
    }

    assert.deepEqual(
      [...new Set(stateMeasurements.map(({ pagePolicy }) => pagePolicy))],
      [SYSTEM_SYMPHONY_STATE_PAGE_POLICY],
    );
    assert.equal(new Set(stateMeasurements.map(({ startPosition }) => startPosition)).size, 1);
    assert.equal(new Set(stateMeasurements.map(({ startSection }) => startSection)).size, 1);
    assert.deepEqual(stateMeasurements.map(({ state }) => state), [...SYSTEM_SYMPHONY_STATES]);

    const transitionPageResult = await openEvidencePage({ browser, pageUrl, diagnostics, openPages });
    const transitionPage = transitionPageResult.page;
    screenshotPage = transitionPage;
    await selectStateBeforePlayback(transitionPage, "healthy");
    await startAudio(transitionPage);
    for (const { from, to } of transitionPairs(SYSTEM_SYMPHONY_TRANSITION_ROUTE)) {
      transitionMeasurements.push(await captureTransition(transitionPage, from, to));
    }
    finalEvidence = await collectEvidence(transitionPage);

    const programmeSummary = buildProgrammeSummary(stateMeasurements);
    const transitionSummary = buildTransitionSummary(transitionMeasurements, stateMeasurements);

    assert.equal(programmeSummary.measuredBars, 32);
    assert.deepEqual(programmeSummary.pagePolicies, [SYSTEM_SYMPHONY_STATE_PAGE_POLICY]);
    assert.equal(programmeSummary.alignmentPositions.length, 1);
    assert.ok(programmeSummary.maximumTruePeakDbtp <= -2, "the 32-bar production programme exceeded the true-peak guard");
    assert.ok(programmeSummary.unknownDeltas.healthy <= 4, "Healthy to Unknown retained a production loudness cliff");
    assert.ok(programmeSummary.unknownDeltas.warning <= 4, "Warning to Unknown retained a production loudness cliff");
    assert.ok(programmeSummary.unknownDeltas.critical <= 6.5, "Critical to Unknown retained an excessive production loudness cliff");
    assert.equal(transitionSummary.measuredTransitionCount, 12);
    assert.equal(transitionSummary.uniqueTransitionCount, 12);
    assert.equal(transitionSummary.expectedTransitionCount, 12);
    assert.equal(transitionSummary.allPassed, true, JSON.stringify(transitionSummary, null, 2));
    assert.ok(transitionSummary.transitions.every(({ policy }) => policy === "one-bar-decay"));
    assert.deepEqual(diagnostics.audioRequests, [], "production APU requested an audio asset");
    assert.deepEqual(diagnostics.failedRequests, []);
    assert.deepEqual(diagnostics.pageErrors, []);
    assert.deepEqual(diagnostics.consoleErrors, []);

    result = {
      pageUrl,
      measurementPolicy: SYSTEM_SYMPHONY_STATE_PAGE_POLICY,
      initialEvidence,
      finalEvidence,
      stateMeasurements,
      transitionMeasurements,
      programmeSummary,
      transitionSummary,
      diagnostics,
    };
  } catch (error) {
    failure = error;
    const availablePage = [...openPages].at(-1) ?? null;
    finalEvidence = availablePage
      ? await collectEvidence(availablePage).catch((collectionError) => ({
        collectionError: collectionError.message,
      }))
      : finalEvidence;
    result = {
      pageUrl,
      measurementPolicy: SYSTEM_SYMPHONY_STATE_PAGE_POLICY,
      initialEvidence,
      finalEvidence,
      stateMeasurements,
      transitionMeasurements,
      partialProgrammeSummary: stateMeasurements.length === SYSTEM_SYMPHONY_STATES.length
        ? buildProgrammeSummary(stateMeasurements)
        : null,
      diagnostics,
    };
  } finally {
    if (screenshotPage && !screenshotPage.isClosed()) {
      await screenshotPage.screenshot({
        path: path.join(outputDir, "system-symphony-production-loudness.png"),
        fullPage: true,
      }).catch(() => {});
    }
    await writeFile(
      path.join(outputDir, "loudness-evidence.json"),
      `${JSON.stringify({
        ok: failure === null,
        expectedSha,
        failure: failure ? { name: failure.name, message: failure.message, stack: failure.stack } : null,
        result,
      }, null, 2)}\n`,
      "utf8",
    );
    await Promise.all([...openPages].map((page) => page.close().catch(() => {})));
  }

  if (failure) throw failure;
  return result;
}
