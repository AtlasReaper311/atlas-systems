import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  BROWSERS,
  accessibilityReport,
  childFrameOrigins,
  configureDeterministicContext,
  observePage,
  openWithRetry,
  writeJson,
} from "./interface-evidence/browser-core.mjs";
import { classifyConsoleErrors } from "./interface-evidence/ownership.mjs";
import { STANDARD_VIEWPORTS } from "./interface-evidence/contract.mjs";
import { captureDeterministicScreenshots } from "./interface-evidence/screenshot-capture.mjs";

const SCHEMA_VERSION = "atlas-systems/recorded-replay-browser-evidence/v1";
const INCIDENT = "inc-20260705-234935";
const REPLAY_ID = "recorded-inc-20260705-234935";
const ROUTE = "/lab/system-symphony/replay/";
const DATA_URL = "/lab/system-symphony/black-box/recorded-replays.json?v=20260923-phase5-recorded-replay-v1";
const APPROVED_TIMESTAMPS = Object.freeze([
  "2026-07-05T23:48:50.649Z",
  "2026-07-05T23:49:08.770Z",
  "2026-07-05T23:49:35.670Z",
  "2026-07-05T23:51:03.675Z",
]);
const APPROVED_LABELS = Object.freeze([
  "Public push observed",
  "HTML or link validation failure reported",
  "Blackbox captured the incident",
  "Validation and publication success reported",
]);
const base = process.env.PREVIEW_URL;
if (!base) throw new Error("PREVIEW_URL is required");

const headSha = process.env.HEAD_SHA || "unknown";
const outputDirectory = process.env.RECORDED_REPLAY_EVIDENCE_OUTPUT_DIR || process.cwd();
const screenshotDirectory = path.join(outputDirectory, "screenshots");
const reportPath = path.join(outputDirectory, "recorded-replay-evidence.json");
const errorPath = path.join(outputDirectory, "capture-error.txt");
const replayUrl = new URL(`${ROUTE}?incident=${INCIDENT}`, base).toString();
const interactiveResults = [];
const noJavaScriptResults = [];
const blockingFailures = [];

function writeReport() {
  const resultFailures = [
    ...interactiveResults.flatMap(({ blockingFailures: failures }) => failures),
    ...noJavaScriptResults.flatMap(({ blockingFailures: failures }) => failures),
  ];
  const allFailures = [...blockingFailures, ...resultFailures];
  writeJson(reportPath, {
    schema_version: SCHEMA_VERSION,
    preview: base,
    commit: headSha,
    route: ROUTE,
    incident: INCIDENT,
    replayId: REPLAY_ID,
    browsers: BROWSERS.map(({ name }) => name),
    viewports: STANDARD_VIEWPORTS,
    interactive: interactiveResults,
    noJavaScript: noJavaScriptResults,
    blockingFailures: allFailures,
    passed: allFailures.length === 0
      && interactiveResults.length === BROWSERS.length * STANDARD_VIEWPORTS.length
      && noJavaScriptResults.length === BROWSERS.length * STANDARD_VIEWPORTS.length,
  });
}

function assertEvidence(condition, message, errors) {
  if (!condition) errors.push(message);
}

function routeState(page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-recorded-replay]");
    const eventButtons = [...document.querySelectorAll("[data-replay-position]")];
    const currentMarkers = eventButtons.filter((button) => button.classList.contains("is-current"));
    const currentAria = eventButtons.filter((button) => button.getAttribute("aria-current") === "step");
    const focus = document.activeElement;
    const focusRect = focus?.getBoundingClientRect?.();
    const eventRect = eventButtons[0]?.getBoundingClientRect?.();
    const text = document.body.innerText || "";
    return {
      root: root ? { ...root.dataset } : null,
      title: document.title,
      pathname: window.location.pathname,
      query: window.location.search,
      audioStates: window.__ATLAS_AUDIO_CONTEXT_STATES__ || [],
      controls: Object.fromEntries([
        ["startAudio", "[data-recorded-replay-start-audio]"],
        ["play", "[data-recorded-replay-play]"],
        ["pause", "[data-recorded-replay-pause]"],
        ["reset", "[data-recorded-replay-reset]"],
        ["mute", "[data-recorded-replay-mute]"],
      ].map(([name, selector]) => {
        const button = document.querySelector(selector);
        return [name, button ? {
          disabled: button.disabled,
          text: button.textContent.trim(),
          pressed: button.getAttribute("aria-pressed"),
        } : null];
      })),
      eventCount: eventButtons.length,
      eventTimes: [...document.querySelectorAll("[data-replay-position] time")].map((time) => time.dateTime),
      eventLabels: eventButtons.map((button) => button.querySelector("strong")?.textContent.trim() || ""),
      markerCount: currentMarkers.length,
      ariaCurrentCount: currentAria.length,
      markerPositions: currentMarkers.map((button) => button.dataset.replayPosition),
      ariaCurrentPositions: currentAria.map((button) => button.dataset.replayPosition),
      currentPosition: document.querySelector("[data-recorded-replay-position]")?.textContent.trim() || "",
      currentTimestamp: document.querySelector("[data-recorded-replay-historical-time]")?.textContent.trim() || "",
      currentLabel: document.querySelector("[data-recorded-replay-current-label]")?.textContent.trim() || "",
      currentText: document.querySelector("[data-recorded-replay-current-text]")?.textContent.trim() || "",
      timingCopy: document.querySelector(".recorded-replay__timing")?.textContent.trim() || "",
      audioCopy: document.querySelector("[data-recorded-replay-audio-note]")?.textContent.trim() || "",
      bodyText: text,
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      focus: {
        tag: focus?.tagName?.toLowerCase() || null,
        focusVisible: Boolean(document.querySelector(":focus-visible")),
        width: focusRect?.width || 0,
        height: focusRect?.height || 0,
        eventWidth: eventRect?.width || 0,
        eventHeight: eventRect?.height || 0,
      },
      informationVisible: [
        "[data-recorded-replay-incident]",
        "[data-recorded-replay-claims]",
        "[data-recorded-replay-current-label]",
        "[data-recorded-replay-current-text]",
        "[data-recorded-replay-events]",
      ].every((selector) => {
        const element = document.querySelector(selector);
        const rect = element?.getBoundingClientRect?.();
        return Boolean(element && rect && rect.width > 0 && rect.height > 0);
      }),
    };
  });
}

async function readArtifact(page) {
  return page.evaluate(async (url) => {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    return { status: response.status, artifact: await response.json() };
  }, DATA_URL);
}

function checkArtifact(artifact, errors) {
  assertEvidence(artifact.schema === "atlas-system-symphony/recorded-replay/v1", "schema changed", errors);
  assertEvidence(artifact.evidenceMode === "recorded-replay", "evidence mode changed", errors);
  assertEvidence(artifact.replayId === REPLAY_ID, "replay identity changed", errors);
  assertEvidence(artifact.incident?.id === INCIDENT, "incident identity changed", errors);
  assertEvidence(artifact.events?.length === 4, "artifact does not contain exactly four events", errors);
  assertEvidence(JSON.stringify(artifact.events?.map(({ timestamp }) => timestamp)) === JSON.stringify(APPROVED_TIMESTAMPS), "source timestamps changed", errors);
  assertEvidence(artifact.claims?.rootCause === "unknown-not-observed", "root cause boundary changed", errors);
  assertEvidence(artifact.claims?.impact === "unknown-not-observed", "impact boundary changed", errors);
  assertEvidence(artifact.claims?.liveHealth === "unknown-not-observed", "live health boundary changed", errors);
  assertEvidence(artifact.time?.incidentDuration === "unknown-not-observed", "duration boundary changed", errors);
  assertEvidence(artifact.metrics?.status === "unknown-not-observed", "metrics status changed", errors);
  assertEvidence(Object.keys(artifact.metrics?.values || {}).length === 0, "metrics were invented", errors);
  assertEvidence(artifact.claims?.recovery === "follow-up-success-observed-not-live-verified", "follow-up recovery boundary changed", errors);
  assertEvidence(artifact.events?.[0]?.causalRelation === "not-established", "push causality changed", errors);
  assertEvidence(artifact.events?.[3]?.causalRelation === "follow-up-success-observed-not-live-verified", "follow-up event boundary changed", errors);
}

function checkCurrentState(state, errors, expectedPosition = 0) {
  assertEvidence(state.pathname === ROUTE, `route changed to ${state.pathname}`, errors);
  assertEvidence(state.query === `?incident=${INCIDENT}`, "approved incident query changed", errors);
  assertEvidence(state.eventCount === 4, "page does not render four event entries", errors);
  assertEvidence(JSON.stringify(state.eventTimes) === JSON.stringify(APPROVED_TIMESTAMPS), "rendered source timestamps changed", errors);
  assertEvidence(JSON.stringify(state.eventLabels) === JSON.stringify(APPROVED_LABELS), "rendered event labels changed", errors);
  assertEvidence(state.markerCount === 1, "current-event marker count is not exactly one", errors);
  assertEvidence(state.ariaCurrentCount === 1, "aria-current marker count is not exactly one", errors);
  assertEvidence(state.markerPositions[0] === String(expectedPosition), "current-event marker is on the wrong event", errors);
  assertEvidence(state.ariaCurrentPositions[0] === String(expectedPosition), "aria-current is on the wrong event", errors);
  assertEvidence(state.currentPosition === `${expectedPosition + 1} / 4`, "current position text did not update", errors);
  assertEvidence(state.currentTimestamp.includes(APPROVED_TIMESTAMPS[expectedPosition].replace("T", " ").replace("Z", " UTC")), "historical timestamp did not update", errors);
  assertEvidence(state.timingCopy.includes("historical elapsed time not represented"), "presentation timing is not separated from historical time", errors);
  assertEvidence(/NOT LIVE/i.test(state.bodyText), "NOT LIVE boundary is not visible", errors);
  assertEvidence(/unknown/i.test(state.bodyText) && /not observed/i.test(state.bodyText), "unknown/not-observed boundaries are not visible", errors);
  assertEvidence(/follow-up success/i.test(state.bodyText) && /live recovery/i.test(state.bodyText), "follow-up success/live recovery boundary is not visible", errors);
  assertEvidence(!state.overflow, `document horizontal overflow ${state.scrollWidth} > ${state.width}`, errors);
}

async function captureInteractive(browserName, browser, viewport) {
  const errors = [];
  const result = {
    browser: browserName,
    viewport: viewport.name,
    viewportAuthority: viewport.authority,
    route: ROUTE,
    url: replayUrl,
    findings: [],
    blockingFailures: errors,
  };
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await configureDeterministicContext(context, { trackAudioContexts: true });
  const page = await context.newPage();
  const telemetry = observePage(page);
  try {
    result.navigation = await openWithRetry(page, replayUrl, { readySelectors: ["[data-recorded-replay]"] });
    await page.waitForFunction(() => document.querySelectorAll("[data-replay-position]").length === 4, null, { timeout: 15_000 });
    const initialArtifact = await readArtifact(page);
    result.httpStatus = result.navigation.status;
    result.routePathname = new URL(page.url()).pathname;
    assertEvidence(result.httpStatus === 200, `expected HTTP 200, received ${result.httpStatus}`, errors);
    assertEvidence(initialArtifact.status === 200, `artifact HTTP ${initialArtifact.status}`, errors);
    checkArtifact(initialArtifact.artifact, errors);

    const initial = await routeState(page);
    checkCurrentState(initial, errors, 0);
    result.initial = initial;
    assertEvidence(initial.root?.audioConsent === "false", "initial audio consent is not locked", errors);
    assertEvidence(initial.audioStates.every((state) => state !== "running"), "AudioContext ran before Start Audio", errors);
    assertEvidence(initial.controls.startAudio?.disabled === false, "Start Audio is not initially enabled", errors);
    assertEvidence(initial.controls.play?.disabled === true, "Play is not initially disabled", errors);
    assertEvidence(initial.controls.pause?.disabled === true, "Pause is not initially disabled", errors);
    assertEvidence(initial.controls.reset?.disabled === false, "Reset is not initially enabled", errors);
    assertEvidence(initial.controls.mute?.disabled === true, "Mute is not initially disabled", errors);
    assertEvidence(initial.controls.mute?.pressed === "true", "initial muted state is not true", errors);

    result.screenshots = await captureDeterministicScreenshots(page, {
      directory: screenshotDirectory,
      browserName,
      viewportName: viewport.name,
      routeName: "recorded-replay",
      includeViewport: viewport.width < 768,
    });

    await page.locator("[data-recorded-replay-start-audio]").click();
    await page.waitForFunction(() => document.querySelector("[data-recorded-replay]")?.dataset.audioConsent === "true");
    const consent = await routeState(page);
    assertEvidence(consent.audioStates.includes("running"), "AudioContext did not enter running state after Start Audio", errors);
    assertEvidence(consent.root?.muted === "true", "Start Audio unmuted the replay", errors);
    assertEvidence(consent.controls.mute?.text === "Unmute", "post-consent copy does not keep audio muted", errors);
    assertEvidence(consent.audioCopy.toLowerCase().includes("remains muted"), "post-consent audio copy is not truthful", errors);
    assertEvidence(consent.controls.play?.disabled === false, "Play did not become enabled after consent", errors);
    assertEvidence(consent.controls.pause?.disabled === true, "Pause became enabled before playback", errors);
    result.audioConsent = consent;

    await page.locator("[data-recorded-replay-play]").click();
    await page.waitForTimeout(2_550);
    const advanced = await routeState(page);
    assertEvidence(advanced.root?.playing === "true", "automatic playback stopped before the second event", errors);
    checkCurrentState(advanced, errors, 1);
    const advancedTimestamp = advanced.currentTimestamp;
    await page.locator("[data-recorded-replay-pause]").click();
    const paused = await routeState(page);
    assertEvidence(paused.root?.playing === "false", "Pause did not stop playback", errors);
    assertEvidence(paused.currentTimestamp === advancedTimestamp, "Pause changed the historical timestamp", errors);
    await page.locator("[data-recorded-replay-reset]").click();
    const reset = await routeState(page);
    checkCurrentState(reset, errors, 0);
    assertEvidence(reset.root?.playing === "false", "Reset did not stop playback", errors);
    result.transport = { advanced, paused, reset };

    await page.locator("[data-recorded-replay-mute]").click();
    const unmuted = await routeState(page);
    assertEvidence(unmuted.root?.muted === "false", "Unmute action did not unmute", errors);
    assertEvidence(unmuted.controls.mute?.text === "Mute", "Unmute action did not update its label", errors);
    await page.locator("[data-recorded-replay-mute]").click();
    const mutedAgain = await routeState(page);
    assertEvidence(mutedAgain.root?.muted === "true", "muting again did not work", errors);
    assertEvidence(mutedAgain.controls.mute?.text === "Unmute", "muting again did not update its label", errors);
    result.audioMute = { unmuted, mutedAgain };

    await page.locator('[data-replay-position="2"]').click();
    const direct = await routeState(page);
    checkCurrentState(direct, errors, 2);
    await page.locator('[data-replay-position="2"]').focus();
    await page.keyboard.press("ArrowRight");
    const arrowRight = await routeState(page);
    checkCurrentState(arrowRight, errors, 3);
    await page.keyboard.press("ArrowLeft");
    const arrowLeft = await routeState(page);
    checkCurrentState(arrowLeft, errors, 2);
    await page.keyboard.press("Home");
    const home = await routeState(page);
    checkCurrentState(home, errors, 0);
    await page.keyboard.press("End");
    const end = await routeState(page);
    checkCurrentState(end, errors, 3);
    assertEvidence(end.root?.playing === "false", "direct navigation left playback running", errors);
    result.navigationControls = { direct, arrowRight, arrowLeft, home, end };

    const finalReset = await page.locator("[data-recorded-replay-reset]").click().then(() => routeState(page));
    checkCurrentState(finalReset, errors, 0);
    assertEvidence(finalReset.root?.playing === "false", "final Reset did not stop playback", errors);
    result.reset = finalReset;

    const reduced = await routeState(page);
    assertEvidence(reduced.reducedMotion, "capture did not run in reduced-motion context", errors);
    assertEvidence(reduced.informationVisible, "reduced-motion context hid required replay information", errors);
    assertEvidence(reduced.focus.eventWidth > 0 && reduced.focus.eventHeight > 0, "keyboard event controls are unusable", errors);
    await page.locator('[data-replay-position="1"]').focus();
    await page.keyboard.press("Tab");
    const focus = await routeState(page);
    assertEvidence(focus.focus.tag, "keyboard focus did not reach an interactive replay control", errors);
    assertEvidence(focus.focus.focusVisible, "keyboard focus is not visibly placed", errors);
    assertEvidence(focus.focus.width > 0 && focus.focus.height > 0, "focused replay control has no usable geometry", errors);
    result.reducedMotion = reduced;
    result.focus = focus.focus;

    const accessibility = await accessibilityReport(page);
    const consoleClassification = classifyConsoleErrors(telemetry.consoleErrors, {
      pageOrigin: new URL(page.url()).origin,
      childFrameOrigins: childFrameOrigins(page),
    });
    assertEvidence(accessibility.blocking.length === 0, `Atlas-owned accessibility blockers ${JSON.stringify(accessibility.blocking)}`, errors);
    assertEvidence(telemetry.pageErrors.length === 0, `page errors ${JSON.stringify(telemetry.pageErrors)}`, errors);
    assertEvidence(consoleClassification.atlasBlocking.length === 0, `Atlas-owned console errors ${JSON.stringify(consoleClassification.atlasBlocking)}`, errors);
    assertEvidence(telemetry.failedRequests.length === 0, `failed first-party requests ${JSON.stringify(telemetry.failedRequests)}`, errors);
    assertEvidence(telemetry.responseErrors.length === 0, `first-party HTTP errors ${JSON.stringify(telemetry.responseErrors)}`, errors);
    assertEvidence(!focus.overflow, `horizontal overflow ${focus.scrollWidth} > ${focus.width}`, errors);
    result.accessibility = {
      blocking: accessibility.blocking,
      violations: accessibility.violations,
      thirdParty: accessibility.thirdParty,
    };
    result.thirdPartyDiagnostics = {
      accessibility: accessibility.thirdParty,
      console: consoleClassification.thirdParty,
    };
    result.telemetry = {
      ...telemetry,
      atlasConsoleErrors: consoleClassification.atlasBlocking,
      thirdPartyConsoleErrors: consoleClassification.thirdParty,
    };
  } catch (error) {
    const message = `${browserName}/${viewport.name}: ${error.stack || error.message}`;
    result.diagnostics = {
      state: await routeState(page).catch(() => null),
      audioNote: await page.locator("[data-recorded-replay-audio-note]").textContent().catch(() => null),
      telemetry: {
        ...telemetry,
        atlasConsoleErrors: classifyConsoleErrors(telemetry.consoleErrors, {
          pageOrigin: new URL(page.url()).origin,
          childFrameOrigins: childFrameOrigins(page),
        }).atlasBlocking,
      },
    };
    errors.push(message);
  } finally {
    interactiveResults.push(result);
    writeReport();
    await context.close();
  }
}

async function captureNoJavaScript(browserName, browser, viewport) {
  const errors = [];
  const result = {
    browser: browserName,
    viewport: viewport.name,
    viewportAuthority: viewport.authority,
    route: ROUTE,
    url: replayUrl,
    scenario: "no-js",
    blockingFailures: errors,
  };
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    javaScriptEnabled: false,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  try {
    const response = await page.goto(replayUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const evidence = await page.evaluate(() => ({
      pathname: window.location.pathname,
      query: window.location.search,
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      text: document.querySelector("noscript")?.textContent || "",
      timestamps: [...document.querySelectorAll("noscript time")].map((time) => time.dateTime),
    }));
    assertEvidence(response?.status() === 200, `expected HTTP 200, received ${response?.status() ?? "no response"}`, errors);
    assertEvidence(evidence.pathname === ROUTE, `no-JS route changed to ${evidence.pathname}`, errors);
    assertEvidence(evidence.query === `?incident=${INCIDENT}`, "no-JS incident query changed", errors);
    assertEvidence(evidence.timestamps.length === 4, "no-JS sequence does not contain four timestamps", errors);
    assertEvidence(JSON.stringify(evidence.timestamps) === JSON.stringify(APPROVED_TIMESTAMPS), "no-JS timestamps changed", errors);
    for (const term of [
      "Causality is not established",
      "root cause",
      "impact",
      "incident duration",
      "live recovery",
      "does not verify live recovery",
    ]) assertEvidence(evidence.text.toLowerCase().includes(term.toLowerCase()), `no-JS boundary is missing: ${term}`, errors);
    assertEvidence(evidence.width >= viewport.width, "no-JS viewport measurement is invalid", errors);
    assertEvidence(evidence.scrollWidth <= evidence.width + 1, `no-JS horizontal overflow ${evidence.scrollWidth} > ${evidence.width}`, errors);
    result.httpStatus = response?.status() ?? null;
    result.evidence = {
      ...evidence,
      text: undefined,
      requiredTerms: ["Causality is not established", "root cause", "impact", "incident duration", "live recovery", "does not verify live recovery"],
    };
  } catch (error) {
    errors.push(`${browserName}/${viewport.name}/no-js: ${error.stack || error.message}`);
  } finally {
    noJavaScriptResults.push(result);
    writeReport();
    await context.close();
  }
}

async function run() {
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.mkdirSync(screenshotDirectory, { recursive: true });
  for (const browserDefinition of BROWSERS) {
    const browser = await browserDefinition.launch();
    try {
      for (const viewport of STANDARD_VIEWPORTS) {
        await captureInteractive(browserDefinition.name, browser, viewport);
        await captureNoJavaScript(browserDefinition.name, browser, viewport);
      }
    } finally {
      await browser.close();
    }
  }
  writeReport();
  if (blockingFailures.length || interactiveResults.some(({ blockingFailures: failures }) => failures.length) || noJavaScriptResults.some(({ blockingFailures: failures }) => failures.length)) {
    fs.writeFileSync(errorPath, `${JSON.stringify({ blockingFailures, interactive: interactiveResults.flatMap(({ blockingFailures: failures }) => failures), noJavaScript: noJavaScriptResults.flatMap(({ blockingFailures: failures }) => failures) }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

run().catch((error) => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  blockingFailures.push(error.stack || error.message);
  writeJson(errorPath, { blockingFailures });
  process.exitCode = 1;
});
