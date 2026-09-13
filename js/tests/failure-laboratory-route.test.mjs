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

test("Failure Laboratory is the implemented route named by the shared model", () => {
  assert.doesNotThrow(() => validateFailureLaboratoryModel(model));
  assert.equal(model.authority.futureRoute, ROUTE);
  assert.equal(model.authority.futureRouteStatus, "implemented");
  assert.equal(descriptorForPath(ROUTE)?.mode, "standard");
  assert.equal(descriptorForPath(ROUTE)?.eyebrow, "LAB / VERIFY / FAILURE INVESTIGATION");
});

test("the route is registered as an indexed governed Lab surface", () => {
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

test("the no-JS route keeps the complete sequence and every participating destination reachable", () => {
  assert.match(html, /<noscript>[\s\S]*JavaScript is optional/);
  assert.match(html, /REQUEST[\s\S]*DEPENDENCIES[\s\S]*COORDINATION[\s\S]*IMPACT[\s\S]*INCIDENT EVIDENCE[\s\S]*RECOVERY/);
  assert.equal((html.match(/class="failure-lab-stage(?:\s|")/g) || []).length, model.journey.sequence.length);
  assert.doesNotMatch(html, /data-stage-enhanced/);
  for (const scenario of model.scenarios) {
    assert.match(html, new RegExp(`data-scenario-id="${scenario.id}"`));
    assert.match(html, new RegExp(`<strong>${scenario.label}</strong>`));
  }
  for (const instrument of model.instruments) {
    assert.match(html, new RegExp(`href="${instrument.canonical.route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), instrument.id);
  }
  assert.match(html, /Not applicable \/ unscored/);
  assert.match(html, /could be affected/);
  assert.match(html, /There is no single current Phase 3 Recovery Evidence instrument/);
  assert.doesNotMatch(html, /atlas-motion/);
});

test("route-local controls keep governed 44px targets and reduced-motion coverage", () => {
  assert.match(css, /\.failure-lab-scenario-option input\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s);
  assert.match(css, /\.failure-lab-page summary\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s);
  assert.match(css, /\.failure-lab-actions \.action,\s*\.failure-lab-reading-link\s*\{[^}]*min-height:\s*44px;/s);
  assert.match(css, /\.failure-lab-stage-action\s*\{[^}]*min-height:\s*44px;/s);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
});

test("guided workspace keeps the static fallback and enhanced state separate", () => {
  assert.match(html, /A guided systems-failure investigation/);
  assert.match(html, /failure-lab-hero-path[\s\S]*Scenario[\s\S]*Six-stage corridor[\s\S]*Specialist evidence/);
  assert.match(html, /failure-lab-hero-path-label[^>]*>READ IN THIS ORDER \/ GUIDED, NOT LIVE/);
  assert.match(html, /id="hero-selected-scenario">Normal operation/);
  assert.match(html, /GUIDED, NOT LIVE[\s\S]*SIX STAGES[\s\S]*SEPARATE PROOF BOUNDARIES[\s\S]*CANONICAL HANDOFFS/);
  assert.match(html, /<summary id="boundary-heading">Why these boundaries matter \+<\/summary>/);
  assert.doesNotMatch(html, /One corridor\. Separate proof boundaries\./);
  assert.equal((html.match(/<small>/g) || []).length, 0);
  assert.doesNotMatch(css, /min-height:\s*8\.7rem/);
  assert.match(css, /\.failure-lab-scenario-option\s*\{[\s\S]*min-height:\s*4\.25rem/);
  assert.equal((html.match(/data-stage-nav-link/g) || []).length, model.journey.sequence.length);
  assert.match(html, /data-stage-nav-link href="#stage-request" aria-current="step"/);
  assert.match(html, /data-stage-previous href="#scenario-heading"/);
  assert.match(html, /data-stage-next href="#stage-dependencies"/);
  assert.match(html, /Next: Dependencies/);
  assert.match(html, /End of corridor\. No universal recovery claim is added\./);
  assert.match(html, /More evidence detail \+/);
  assert.match(html, /EVIDENCE GAP \/ INTENTIONAL/);
  assert.match(html, /OFF-RAIL \/ OPTIONAL \/ NOT A STAGE/);
  assert.match(css, /\.failure-lab-stage-nav ol::before/);
  assert.match(css, /scroll-margin-top:\s*calc\(var\(--lab-shell-stack-height/);
  assert.match(css, /#failure-laboratory-main\[data-stage-enhanced="true"\][\s\S]*\.failure-lab-stage:not\(\[data-active-stage\]\)[\s\S]*display: none/);
  assert.match(script, /const stageIds = new Set/);
  assert.match(script, /setActiveStage\(initialStage \|\| "request"/);
  assert.match(script, /main\.dataset\.stageEnhanced = "true"/);
  assert.match(script, /toggleAttribute\("data-active-stage"/);
  assert.match(script, /historyMethod: "pushState"/);
  assert.match(script, /historyMethod: "replaceState"/);
  assert.match(script, /historyMethod: invalidStageHash \|\| !window\.location\.hash \? "replaceState"/);
  assert.match(script, /addEventListener\("hashchange"/);
  assert.match(script, /addEventListener\("popstate"/);
  assert.match(script, /setText\("#hero-selected-scenario", scenario\.label\)/);
  assert.match(script, /EVIDENCE GAP \/ INTENTIONAL/);
  assert.doesNotMatch(script, /details\.open\s*=\s*true/);
});

test("scenario selection consumes model relationships without inferring unsupported pairs", () => {
  assert.match(script, /fetch\(MODEL_URL/);
  assert.match(script, /relationship\.supportType === "unsupported"/);
  assert.match(script, /relationship\.stageIds\.includes\(stage\.id\)/);
  assert.match(script, /not-applicable-unscored/);
  assert.match(script, /history\.pushState/);
  assert.match(script, /addEventListener\("popstate"/);
  assert.match(script, /scenario\.relationships\.filter\(\(candidate\) => candidate\.supportType === "unsupported"\)/);
  assert.doesNotMatch(script, /atlas-motion/);
});
