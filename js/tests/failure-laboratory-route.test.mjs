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
  assert.match(css, /\.failure-lab-next\s*\{[^}]*min-height:\s*44px;/s);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
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
