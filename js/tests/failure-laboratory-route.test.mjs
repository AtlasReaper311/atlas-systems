import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  FAILURE_TRACE_ROUTE,
  LEGACY_FAILURE_TRACE_ROUTE,
  descriptorForPath,
} from "../../static/js/surface-convergence.js";
import { loadFailureLaboratoryModel, validateFailureLaboratoryModel } from "../failure-laboratory-model.mjs";

const ROUTE = "/lab/failure-trace/";
const LEGACY_ROUTE = "/lab/failure-laboratory/";
const html = fs.readFileSync("lab/failure-trace/index.html", "utf8");
const legacyHtml = fs.readFileSync("lab/failure-laboratory/index.html", "utf8");
const css = fs.readFileSync("lab/failure-trace/failure-laboratory.css", "utf8");
const script = fs.readFileSync("lab/failure-trace/failure-laboratory.js", "utf8");
const model = loadFailureLaboratoryModel();
const manifest = JSON.parse(fs.readFileSync(".atlas/public-interface.json", "utf8"));
const sitemap = fs.readFileSync("sitemap.xml", "utf8");
const sitemapGenerator = fs.readFileSync("scripts/generate_sitemap.py", "utf8");
const redirects = fs.readFileSync("_redirects", "utf8");
const socialManifest = JSON.parse(fs.readFileSync("scripts/og/manifest.json", "utf8"));

test("Failure Trace owns the canonical public route while the v1 model keeps its compatibility identifier", () => {
  assert.doesNotThrow(() => validateFailureLaboratoryModel(model));
  assert.equal(FAILURE_TRACE_ROUTE, ROUTE);
  assert.equal(LEGACY_FAILURE_TRACE_ROUTE, LEGACY_ROUTE);
  assert.equal(model.authority.futureRoute, LEGACY_ROUTE);
  assert.equal(model.authority.futureRouteStatus, "implemented");
  assert.equal(descriptorForPath(ROUTE)?.mode, "standard");
  assert.equal(descriptorForPath(LEGACY_ROUTE), null);
  assert.match(script, /const MODEL_AUTHORITY_ROUTE = "\/lab\/failure-laboratory\/"/);
  assert.match(script, /const CANONICAL_ROUTE = "\/lab\/failure-trace\/"/);
  assert.match(script, /model\.authority\?\.futureRoute !== MODEL_AUTHORITY_ROUTE/);
  assert.match(script, /normalizedPath\(window\.location\.pathname\) !== CANONICAL_ROUTE/);
});

test("canonical browser identity is Failure Trace and the legacy route permanently redirects", () => {
  assert.match(html, /<title>Failure Trace \/\/ Atlas Systems<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/atlas-systems\.uk\/lab\/failure-trace\/">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/atlas-systems\.uk\/lab\/failure-trace\/">/);
  assert.ok(html.includes("https://atlas-systems.uk/og/failure-trace.png"));
  assert.match(html, /Failure Trace\. Trace the bounded path\. \/\/ Atlas Systems/);
  assert.match(html, /<h1 id="failure-trace-title">Failure Trace<span>\.<\/span><\/h1>/);
  assert.match(legacyHtml, /<meta name="robots" content="noindex, follow">/);
  assert.match(legacyHtml, /<link rel="canonical" href="https:\/\/atlas-systems\.uk\/lab\/failure-trace\/">/);
  assert.match(legacyHtml, /location\.replace\("\/lab\/failure-trace\/" \+ location\.search \+ location\.hash\)/);
  assert.match(redirects, /\/lab\/failure-laboratory\s+\/lab\/failure-trace\/\s+301/);
  assert.match(redirects, /\/lab\/failure-laboratory\/\s+\/lab\/failure-trace\/\s+301/);
  assert.match(redirects, /\/lab\/failure-laboratory\/\*\s+\/lab\/failure-trace\/:splat\s+301/);
});

test("the canonical route is the indexed governed Lab surface and sitemap target", () => {
  const surface = manifest.surfaces.find((candidate) => candidate.url === `https://atlas-systems.uk${ROUTE}`);
  assert.ok(surface);
  assert.equal(surface.source, "lab/failure-trace/index.html");
  assert.equal(surface.kind, "lab-tool");
  assert.equal(surface.indexing, "index");
  assert.equal(surface.global_header, true);
  assert.equal(surface.search, true);
  assert.equal(surface.contextual_navigation, true);
  assert.match(surface.footer, /Failure Trace/);
  assert.ok(surface.notes.some((note) => /Failure Trace participation model/.test(note)));
  assert.equal(manifest.surfaces.some((candidate) => candidate.url.endsWith(LEGACY_ROUTE)), false);
  assert.ok(sitemap.includes(`<loc>https://atlas-systems.uk${ROUTE}</loc>`));
  assert.ok(!sitemap.includes(`<loc>https://atlas-systems.uk${LEGACY_ROUTE}</loc>`));
  assert.match(sitemapGenerator, /\("\/lab\/failure-trace\/", "monthly", "0\.7"\)/);
  assert.doesNotMatch(sitemapGenerator, /\("\/lab\/failure-laboratory\/",/);
});

test("social preview ownership moved to the Failure Trace identity", () => {
  const entry = socialManifest.routes.find((candidate) => candidate.route === ROUTE);
  assert.equal(entry?.file, "failure-trace");
  assert.equal(entry?.html, "lab/failure-trace/index.html");
  assert.deepEqual(entry?.title, ["Failure Trace.", "Trace the [bounded path.]"]);
  assert.equal(fs.existsSync("og/failure-trace.png"), true);
  assert.equal(socialManifest.routes.some((candidate) => candidate.route === LEGACY_ROUTE), false);
});

test("the editorial workspace is concise at first level and keeps secondary material in Reference", () => {
  assert.match(html, /Trace a distributed-system failure from request to recovery\./);
  assert.match(html, /GUIDED MODEL \/ NOT LIVE/);
  assert.doesNotMatch(html, /PUBLIC ROUTE/);
  assert.match(html, /<section class="failure-trace-reference"/);
  assert.match(html, /Model-approved reading paths/);
  assert.match(html, /Evidence modes/);
  assert.match(html, /Participating instruments/);
  assert.match(html, /Unsupported relationships for selected context/);
  assert.match(html, /Proof and interpretation rules/);
  assert.match(html, /Spectral Forge/);
  assert.match(html, /System Symphony/);
});

test("Latency creep remains the clean default scenario without changing model ordering", () => {
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
  assert.match(script, /if \(stageId === "request"\) url\.hash = ""/);
  assert.match(script, /else url\.hash = `stage-\$\{stageId\}`/);
  assert.match(script, /historyMethod: "pushState"/);
  assert.match(script, /addEventListener\("hashchange"/);
  assert.match(script, /addEventListener\("popstate"/);
});

test("the investigation rail keeps all six stages directly addressable in canonical order", () => {
  assert.equal((html.match(/data-stage-nav-link/g) || []).length, model.journey.sequence.length);
  for (const stageId of model.journey.sequence) assert.match(html, new RegExp(`href="#stage-${stageId}"`));
  assert.match(css, /\.failure-trace-stage-nav\s*\{[\s\S]*position:\s*sticky[\s\S]*top:\s*var\(--lab-shell-stack-height/);
  assert.match(css, /\.failure-trace-stage-nav::after/);
  assert.match(css, /\.failure-trace-stage-nav ol::before/);
  assert.match(css, /scroll-margin-top:\s*calc\(var\(--lab-shell-stack-height/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.failure-trace-stage-nav ol\s*\{[^}]*min-width:\s*0;[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /@media \(max-width: 620px\)[\s\S]*\.failure-trace-stage-nav ol\s*\{[^}]*min-width:\s*600px/);
});

test("mobile Failure Trace keeps scenario controls and the investigation rail within the viewport", () => {
  assert.match(css, /--failure-trace-dim:\s*#8a8992/);
  assert.match(css, /background-color:\s*var\(--failure-trace-bg\)/);
  assert.match(css, /\.failure-trace-scenario-options\s*\{[^}]*min-inline-size:\s*0/s);
  assert.match(css, /\.failure-trace-scenario-options span\s*\{[^}]*background:\s*var\(--failure-trace-surface\)/s);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.failure-trace-scenario-options\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.failure-trace-stage-context\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.failure-trace-rail-key\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*\.failure-trace-stage-nav\s*\{[^}]*margin-right:\s*-12px;[^}]*margin-left:\s*-12px/);
});

test("rail, open-stage, and recovery semantics remain explicit", () => {
  assert.match(html, /Investigation rail colour key/);
  assert.match(html, /Mapped guidance/);
  assert.match(html, /Open \/ no generic mapping/);
  assert.match(html, /Composite assessment/);
  assert.match(script, /function renderStageRail\(model, scenario\)/);
  assert.match(script, /function createUnmappedStage\(scenario, stage\)/);
  assert.match(script, /OPEN \/ NO GENERIC MAPPING/);
  assert.match(script, /function createRecoveryAssessment\(model, gap\)/);
  assert.match(script, /COMPOSITE ASSESSMENT \/ NOT AN OBSERVATION/);
  assert.match(script, /Recovery has no single source of truth\./);
  assert.equal(model.constraints.recovery.singleAuthoritativeInstrument, null);
});

test("progressive enhancement preserves a complete no-JS path and destination reachability", () => {
  assert.equal((html.match(/class="failure-trace-stage"/g) || []).length, model.journey.sequence.length);
  assert.match(css, /#failure-laboratory-main\[data-stage-enhanced="true"\][\s\S]*\.failure-trace-stage:not\(\[data-active-stage\]\)[\s\S]*display:\s*none/);
  assert.match(script, /main\.dataset\.stageEnhanced = "true"/);
  assert.match(script, /toggleAttribute\("data-active-stage"/);
  assert.match(html, /<noscript>[\s\S]*default Latency creep context/);
  for (const instrument of model.instruments) {
    assert.match(
      html,
      new RegExp(`href="${instrument.canonical.route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
      instrument.id,
    );
  }
});

test("scenario rendering preserves provenance and evidence boundaries", () => {
  assert.match(script, /relationship\.supportType === "unsupported" \|\| relationship\.supportType === "cross-cutting"/);
  assert.match(script, /function createReadingFacts\(relationship\)/);
  assert.match(script, /reading\.nativeScenario/);
  assert.match(script, /reading\.sourceType/);
  assert.match(script, /function renderUnsupportedReference\(model, scenario\)/);
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
