import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runner = readFileSync("scripts/capture_batch_h_evidence.mjs", "utf8");
const genericRunner = readFileSync("scripts/capture_interface_evidence.mjs", "utf8");
const contract = readFileSync("scripts/interface-evidence/contract.mjs", "utf8");
const browserCore = readFileSync("scripts/interface-evidence/browser-core.mjs", "utf8");
const workflow = readFileSync(".github/workflows/interface-preview.yml", "utf8");
const evidenceCss = readFileSync("static/css/systems-evidence-truthfulness.css", "utf8");
const evidenceHtml = readFileSync("systems/evidence/index.html", "utf8");

test("Batch H browser evidence preserves every focused destination", () => {
  for (const route of [
    "/systems/observability/",
    "/systems/reliability/",
    "/systems/evidence/",
    "/lab/system-symphony/",
  ]) {
    assert.ok(runner.includes(`path: \"${route}\"`), `missing ${route}`);
  }
});

test("all evidence runners share the governed browser and viewport contract", () => {
  for (const width of [320, 375, 768, 1024, 1440, 1920]) {
    assert.ok(contract.includes(`width: ${width}`), `missing ${width}px viewport`);
  }
  assert.ok(browserCore.includes('name: "chrome"'));
  assert.ok(browserCore.includes('chromium.launch({ channel: "chrome"'));
  assert.ok(browserCore.includes('name: "firefox"'));
  assert.ok(browserCore.includes("firefox.launch"));
  assert.ok(runner.includes('from "./interface-evidence/browser-core.mjs"'));
  assert.ok(genericRunner.includes('from "./interface-evidence/browser-core.mjs"'));
});

test("Batch H retains keyboard, unavailable-data, audio-consent, and no-JavaScript overflow assertions", () => {
  assert.ok(runner.includes('page.keyboard.press("Tab")'));
  assert.ok(runner.includes('document.querySelector(":focus-visible")'));
  assert.ok(runner.includes("javaScriptEnabled: false"));
  assert.ok(runner.includes('reducedMotion: "reduce"'));
  assert.ok(runner.includes("__ATLAS_AUDIO_CONTEXT_STATES__"));
  assert.ok(runner.includes('filter((state) => state === "running")'));
  assert.ok(runner.includes("audio context entered running state before user consent"));
  assert.ok(runner.includes('startsWith("Start")'));
  assert.ok(runner.includes("activeElementInsideSymphony"));
  assert.ok(runner.includes("Symphony stole focus during page load"));
  assert.ok(runner.includes("Symphony is not embedded as a non-modal page region"));
  assert.ok(runner.includes("openSourceDocument"));
  assert.ok(runner.includes("stylesApplied"));
  assert.ok(runner.includes("stylesheets were not applied before no-JavaScript measurement"));
  assert.ok(runner.includes("evidence.stylesApplied && evidence.scrollWidth > evidence.width + 1"));
  assert.ok(runner.includes("horizontal overflow"));
  assert.doesNotMatch(runner, /waitUntil:\s*"domcontentloaded"/);
  assert.ok(browserCore.includes("export async function waitForAppliedStylesheets"));
  assert.ok(browserCore.includes("export async function openSourceDocument"));
  assert.ok(browserCore.includes('waitUntil: "load"'));
  assert.ok(browserCore.includes('link[rel="stylesheet"][href]'));
  assert.ok(browserCore.includes('bodyStyle.marginTop === "0px"'));
});

test("shared diagnostics record console, request, resource, and accessibility evidence", () => {
  assert.ok(browserCore.includes('page.on("console"'));
  assert.ok(browserCore.includes('page.on("requestfailed"'));
  assert.ok(browserCore.includes('page.on("response"'));
  assert.ok(browserCore.includes('performance.getEntriesByType("resource")'));
  assert.ok(browserCore.includes("wcag22aa"));
  assert.ok(browserCore.includes("actionableConsoleErrors"));
  assert.ok(genericRunner.includes("blockingFailures"));
  assert.ok(genericRunner.includes("blocking-changed-route"));
  assert.ok(genericRunner.includes("reporting-baseline"));
  assert.ok(runner.includes("blockingFailures"));
});

test("the preview workflow enforces approval before evidence deployment", () => {
  assert.ok(workflow.includes("approval-gate:"));
  assert.ok(workflow.includes("Evidence approval is required"));
  assert.ok(workflow.includes("needs: [validate, approval-gate]"));
  assert.ok(workflow.includes("node scripts/plan_interface_evidence.mjs"));
  assert.ok(workflow.includes("CHANGED_ROUTES_JSON"));
  assert.ok(workflow.includes("node capture_interface_evidence.mjs"));
  assert.ok(workflow.includes("node capture_batch_h_evidence.mjs"));
  assert.equal((workflow.match(/npm install --save-exact playwright@1\.61\.1 @axe-core\/playwright@4\.12\.1/g) || []).length, 1);
  assert.ok(workflow.includes("retention-days: 14"));
});

test("preview evidence captures cannot cascade into a misleading missing-artifact failure or silently pass", () => {
  assert.ok(workflow.includes("id: route-capture"));
  assert.ok(workflow.includes("id: batch-h-capture"));
  assert.ok(workflow.includes("continue-on-error: true"));
  assert.ok(workflow.includes("Enforce browser evidence capture results"));
  assert.ok(workflow.includes("ROUTE_CAPTURE_OUTCOME"));
  assert.ok(workflow.includes("BATCH_H_CAPTURE_OUTCOME"));
  assert.ok(workflow.includes('if [ "${ROUTE_CAPTURE_OUTCOME}" != "success" ]'));
  assert.ok(workflow.includes('if [ "${BATCH_H_CAPTURE_OUTCOME}" != "success" ]'));
  assert.ok(workflow.includes('exit "${failed}"'));
  assert.match(workflow, /name: Capture Batch H product assertions[\s\S]*?if: always\(\)/);
  assert.match(
    workflow,
    /name: Upload route-derived visual and accessibility evidence[\s\S]*?if-no-files-found: error/,
  );
  assert.match(
    workflow,
    /name: Upload Batch H visual and accessibility evidence[\s\S]*?if-no-files-found: error/,
  );
});

test("Verify source layout contains wide tables before JavaScript enhancement", () => {
  assert.match(evidenceCss, /data-systems-detail="evidence"[\s\S]*?\.focus-table-wrap[\s\S]*?contain:\s*layout paint inline-size/);
  assert.match(evidenceCss, /\.focus-table-wrap[\s\S]*?max-width:\s*100%/);
  assert.match(evidenceCss, /\.focus-table-wrap[\s\S]*?overflow-x:\s*auto/);
  assert.doesNotMatch(
    evidenceCss,
    /data-systems-detail="evidence"[\s\S]*?overflow-x:\s*clip/,
    "document-level overflow clip must not hide no-JavaScript overflow regressions",
  );
  assert.match(evidenceHtml, /<details class="systems-evidence-disclosure">[\s\S]*?<tbody id="activity-rows">/);
  assert.match(evidenceHtml, /systems-evidence-truthfulness\.css\?v=20260810-evidence-truthfulness-2/);
});
