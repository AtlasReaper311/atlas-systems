import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { descriptorForPath } from "../../static/js/surface-convergence.js";
import { loadFailureLaboratoryModel, validateFailureLaboratoryModel } from "../failure-laboratory-model.mjs";

const ROUTE = "/lab/failure-laboratory/";
const html = fs.readFileSync("lab/failure-laboratory/index.html", "utf8");
const css = fs.readFileSync("lab/failure-laboratory/failure-laboratory.css", "utf8");
const script = fs.readFileSync("lab/failure-laboratory/failure-laboratory.js", "utf8");
const model = loadFailureLaboratoryModel();
const manifest = JSON.parse(fs.readFileSync(".atlas/public-interface.json", "utf8"));
const sitemap = fs.readFileSync("sitemap.xml", "utf8");
const sitemapGenerator = fs.readFileSync("scripts/generate_sitemap.py", "utf8");

test("Failure Trace keeps the implemented Failure Laboratory route contract", () => {
  assert.doesNotThrow(() => validateFailureLaboratoryModel(model));
  assert.equal(model.authority.futureRoute, ROUTE);
  assert.equal(model.authority.futureRouteStatus, "implemented");
  assert.equal(descriptorForPath(ROUTE)?.mode, "standard");
  assert.match(html, /<title>Failure Trace \/\/ Atlas Systems<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/atlas-systems\.uk\/lab\/failure-laboratory\/">/);
  assert.match(html, /<h1 id="failure-trace-title">Failure Trace<span>\.<\/span><\/h1>/);
});

test("the route remains an indexed governed Lab surface", () => {
  const surface = manifest.surfaces.find((candidate) => candidate.url === `https://atlas-systems.uk${ROUTE}`);
  assert.ok(surface);
  assert.equal(surface.source, "lab/failure-laboratory/index.html");
  assert.equal(surface.kind, "lab-tool");
  assert.equal(surface.indexing, "index");
  assert.equal(surface.global_header, true);
  assert.equal(surface.search, true);
  assert.equal(surface.contextual_navigation, true);
  assert.ok(sitemap.includes(`<loc>https://atlas-systems.uk${ROUTE}</loc>`));
  assert.match(sitemapGenerator, /\("\/lab\/failure-laboratory\/", "monthly", "0\.7"\)/);
});

test("the editorial workspace is concise at first level and keeps secondary material in Reference", () => {
  assert.match(html, /Trace a distributed-system failure from request to recovery\./);
  assert.match(html, /GUIDED MODEL \/ NOT LIVE/);
  assert.doesNotMatch(html, /failure-lab-hero-boundary/);
  assert.doesNotMatch(html, /failure-lab-truth-strip/);
  assert.doesNotMatch(html, /PUBLIC ROUTE/);
  assert.match(html, /<section class="failure-trace-reference"/);
  assert.match(html, /Model-approved reading paths/);
  assert.match(html, /Evidence modes/);
  assert.match(html, /Participating instruments/);
  assert.match(html, /Unsupported relationships for selected scenario/);
  assert.match(html, /Proof and interpretation rules/);
  assert.match(html, /Spectral Forge/);
  assert.match(html, /System Symphony/);
});

test("Latency creep is the clean default scenario without changing model ordering", () => {
  assert.match(script, /const DEFAULT_SCENARIO_ID = "latency-creep"/);
  assert.match(html, /data-scenario-id="latency-creep" checked/);
  assert.match(html, /id="selected-scenario-label">Latency creep/);
  assert.match(html, /id="sticky-scenario-label">Latency creep/);
  assert.deepEqual(model.scenarios.map(({ id }) => id), [
    "normal-operation",
    "latency-creep",
    "cache-collapse",
    "dependency-failure",
    "network-partition",
    "cascading-failure",
    "recovery",
  ]);
  assert.match(script, /if \(scenarioId === DEFAULT_SCENARIO_ID\) url\.searchParams\.delete\("scenario"\)/);
});

test("the clean route activates Request without serialising #stage-request on initial load", () => {
  assert.match(script, /setActiveStage\(initialStage \|\| "request", \{ focus: false \}\)/);
  assert.doesNotMatch(script, /historyMethod:\s*invalidStageHash \|\| !window\.location\.hash/);
  assert.match(script, /if \(stageId === "request"\) url\.hash = ""/);
  assert.match(script, /else url\.hash = `stage-\$\{stageId\}`/);
  assert.match(script, /historyMethod: "pushState"/);
  assert.match(script, /addEventListener\("hashchange"/);
  assert.match(script, /addEventListener\("popstate"/);
});

test("the investigation rail keeps all six stages directly addressable in canonical order", () => {
  assert.equal((html.match(/data-stage-nav-link/g) || []).length, model.journey.sequence.length);
  assert.match(html, /href="#stage-request" aria-current="step"/);
  assert.match(html, /href="#stage-dependencies"/);
  assert.match(html, /href="#stage-coordination"/);
  assert.match(html, /href="#stage-impact"/);
  assert.match(html, /href="#stage-incident-evidence"/);
  assert.match(html, /href="#stage-recovery"/);
  assert.match(css, /\.failure-trace-stage-nav\s*\{[\s\S]*position:\s*sticky[\s\S]*top:\s*var\(--lab-shell-stack-height/);
  assert.doesNotMatch(css, /top:\s*calc\(var\(--lab-shell-stack-height[^;]+\+\s*[48]px\)/);
  assert.match(css, /\.failure-trace-stage-nav::after/);
  assert.match(css, /\.failure-trace-stage-nav ol::before/);
  assert.match(css, /scroll-margin-top:\s*calc\(var\(--lab-shell-stack-height/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.failure-trace-stage-nav[\s\S]*overflow-x:\s*auto/);
});

test("the rail explains its colours and distinguishes current, mapped, open, and composite states", () => {
  assert.match(script, /function installRailLegend\(\)/);
  assert.match(script, /Investigation rail colour key/);
  assert.match(script, /Current stage/);
  assert.match(script, /Mapped guidance/);
  assert.match(script, /Open \/ no generic mapping/);
  assert.match(script, /Composite assessment/);
  assert.match(css, /\.failure-trace-rail-key/);
  assert.match(css, /data-rail-state="active"/);
  assert.match(css, /data-rail-state="supported"/);
  assert.match(css, /data-rail-state="unmapped"/);
  assert.match(css, /data-rail-state="gap"/);
});

test("the sticky rail keeps selected context and reflects mapped, open, and recovery-composite states", () => {
  assert.match(html, /class="failure-trace-stage-context"/);
  assert.match(html, /id="sticky-scenario-label"/);
  assert.match(html, /data-stage-support="supported"/);
  assert.match(html, /data-stage-support="unmapped"/);
  assert.match(html, /data-stage-support="gap"/);
  assert.match(script, /function renderStageRail\(model, scenario\)/);
  assert.match(script, /item\.dataset\.stageSupport = supportState/);
  assert.match(script, /stage\.id === "recovery" && stage\.evidenceGap/);
  assert.match(script, /failure-trace-stage-support-label/);
  assert.match(script, /RAIL_STATE_LABELS\[supportState\]/);
  assert.match(css, /li\[data-stage-support="supported"\]/);
  assert.match(css, /li\[data-stage-support="unmapped"\]/);
  assert.match(css, /li\[data-stage-support="gap"\]/);
  assert.doesNotMatch(css, /li\[data-stage-support="unmapped"\][^}]*opacity:\s*0\.58/s);
});

test("every investigation stage teaches its intended job before showing current mappings", () => {
  assert.match(script, /const STAGE_GUIDANCE = Object\.freeze/);
  assert.match(script, /function createStagePurpose\(stage\)/);
  assert.match(script, /WHAT THIS STAGE DOES/);
  assert.match(script, /Failure context/);
  assert.match(script, /Atlas Twin relationships/);
  assert.match(script, /could-be-affected candidates/);
  assert.match(css, /\.failure-trace-stage-purpose/);
  assert.match(css, /\.failure-trace-stage-flow/);
});

test("open stages explain the missing mapping and the evidence-safe intended workflow", () => {
  assert.match(script, /function createUnmappedStage\(scenario, stage\)/);
  assert.match(script, /OPEN \/ NO GENERIC MAPPING/);
  assert.match(script, /The investigation question still matters\./);
  assert.match(script, /CURRENT MAPPING/);
  assert.match(script, /HOW IT WOULD WORK/);
  assert.match(script, /Use bounded Atlas Twin relationship context/);
  assert.match(css, /\.failure-trace-open-grid/);
  assert.match(css, /\.failure-trace-open-status/);
});

test("Recovery is presented as a composite assessment instead of an unfinished instrument", () => {
  assert.equal(model.constraints.recovery.singleAuthoritativeInstrument, null);
  assert.match(script, /function createRecoveryAssessment\(model, gap\)/);
  assert.match(script, /COMPOSITE ASSESSMENT \/ NOT AN OBSERVATION/);
  assert.match(script, /Recovery has no single source of truth\./);
  assert.match(script, /reset \/ re-run/);
  assert.match(script, /settling \/ containment/);
  assert.match(script, /heal \/ catch-up/);
  assert.match(script, /recorded aftermath/);
  assert.match(script, /named lifecycle fact \/ unknown/);
  assert.match(css, /\.failure-trace-recovery-assessment/);
  assert.match(css, /\.failure-trace-recovery-sources/);
});

test("the interface calls scenario selection an investigation context without changing model vocabulary", () => {
  assert.match(script, /INVESTIGATION CONTEXT/);
  assert.match(script, /Choose an investigation context/);
  assert.match(script, /Context/);
  assert.match(script, /Guide, not live/);
  assert.equal(model.scenarios[0].id, "normal-operation");
});

test("progressive enhancement shows one active stage while no-JS keeps the complete path", () => {
  assert.equal((html.match(/class="failure-trace-stage"/g) || []).length, model.journey.sequence.length);
  assert.match(html, /REQUEST[\s\S]*DEPENDENCIES[\s\S]*COORDINATION[\s\S]*IMPACT[\s\S]*INCIDENT EVIDENCE[\s\S]*RECOVERY/);
  assert.match(css, /#failure-laboratory-main\[data-stage-enhanced="true"\][\s\S]*\.failure-trace-stage:not\(\[data-active-stage\]\)[\s\S]*display:\s*none/);
  assert.match(script, /main\.dataset\.stageEnhanced = "true"/);
  assert.match(script, /toggleAttribute\("data-active-stage"/);
  assert.match(html, /<noscript>[\s\S]*default Latency creep context/);
});

test("the no-JS route keeps every participating destination reachable", () => {
  for (const instrument of model.instruments) {
    assert.match(
      html,
      new RegExp(`href="${instrument.canonical.route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
      instrument.id,
    );
  }
  assert.match(html, /Not applicable \/ unscored/);
  assert.match(html, /could be affected/);
  assert.match(html, /There is no single current Phase 3 Recovery Evidence instrument/);
  assert.doesNotMatch(html, /\/lab\/atlas-motion\//);
});

test("scenario rendering preserves unsupported, cross-cutting, provenance, and evidence boundaries", () => {
  assert.match(script, /relationship\.supportType === "unsupported" \|\| relationship\.supportType === "cross-cutting"/);
  assert.match(script, /relationship\.stageIds\.includes\(stage\.id\)/);
  assert.match(script, /not-applicable-unscored/);
  assert.match(script, /candidate\.instrumentId === instrumentId && candidate\.supportType === "cross-cutting"/);
  assert.match(script, /function createReadingFacts\(relationship\)/);
  assert.match(script, /reading\.nativeScenario/);
  assert.match(script, /reading\.sourceType/);
  assert.match(script, /function renderUnsupportedReference\(model, scenario\)/);
  assert.match(script, /relationship\.unsupportedReason \|\| relationship\.proofBoundary/);
  assert.match(script, /displayInstrumentLabel/);
  assert.match(script, /System SYMPHONY/);
  assert.match(script, /System Symphony/);
  assert.match(css, /\.failure-trace-reading-facts/);
  assert.match(css, /\.failure-trace-unsupported-list/);
});

test("route-local interaction targets and reduced-motion behaviour remain governed", () => {
  assert.match(css, /\.failure-trace-scenario-options label\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.failure-trace-reading-link\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.failure-trace-stage-action\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.failure-trace-reference > details > summary\s*\{[^}]*min-height:\s*64px/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});