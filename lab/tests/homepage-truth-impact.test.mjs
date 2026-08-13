import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const [html, truthSource, interactionSource, baseCss] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("static/js/live/homepage-truth.js", root), "utf8"),
  readFile(new URL("static/js/homepage-interactions.js", root), "utf8"),
  readFile(new URL("css/home-v2-base.css", root), "utf8"),
]);

test("homepage metadata matches the current portfolio domains and audio specialism", () => {
  assert.match(html, /local AI, automation, infrastructure, and real-time audio systems/i);
  assert.doesNotMatch(html, /Audio systems, local AI, and infrastructure/i);
});

test("homepage keeps detailed Worker coverage in the evidence cards only", () => {
  assert.doesNotMatch(html, /id="estate-declared-workers"/);
  assert.doesNotMatch(html, /id="estate-observed-workers"/);
  assert.doesNotMatch(html, /id="estate-documented-workers"/);
  assert.match(html, /id="evidence-declared"/);
  assert.match(html, /id="evidence-observed"/);
  assert.match(html, /id="evidence-documented"/);
  assert.match(html, /Portfolio signal summary/);
  assert.match(html, /Audio Systems/);
  assert.match(html, /Control plane evidence/);
  assert.doesNotMatch(html, /Live estate truth summary/);
  assert.match(truthSource, /const TOPOLOGY_URL = "https:\/\/api\.atlas-systems\.uk\/v1\/topology"/);
  assert.match(truthSource, /missing:|missing,/);
  assert.match(truthSource, /Not observed:/);
  assert.match(truthSource, /architecture coverage/);
  assert.doesNotMatch(truthSource, /estate-declared-workers|estate-observed-workers|estate-documented-workers/);
  assert.doesNotMatch(truthSource, /\.style\s*[.=\[]|\bcssText\b/);
});

test("homepage keeps its initial status hook for the estate shell to replace", () => {
  assert.match(html, /<span id="nav-build-status" class="atlas-estate-status-label">Checking<\/span>/);
  assert.match(html, /\/js\/live-signal\.js\?v=20260720-vector-five/);
  assert.doesNotMatch(truthSource, /nav-build-status|renderNavDot|overallHealth/);
});

test("body operational claims are evidence driven rather than hardcoded green", () => {
  assert.match(html, /id="ops-deploy-value" data-state="pending">checking deploy/);
  assert.match(html, /id="ops-blackbox-value" data-state="pending">checking registry/);
  assert.match(html, /id="ops-registry-value" data-state="pending">checking topology/);
  assert.doesNotMatch(html, /incident recorder armed|deploy feed green|State nominal/);
  assert.doesNotMatch(interactionSource, /systems nominal|incident recorder armed|deploy feed green/);
});

test("homepage foregrounds interactive audio engineering without overcrowding navigation", () => {
  assert.match(html, /System SYMPHONY/);
  assert.match(html, /Signal Garden/);
  assert.match(html, /href="\/lab\/signal\/"/);
  assert.match(html, /Specialism \/ real-time audio/);
});

test("AWS is officially active and Writing remains reachable on mobile", () => {
  assert.match(html, /AWS <span class="stack-state">active<\/span>/);
  assert.match(html, /class="mobile-nav-item atlas-mobile-nav__item" href="\/writing\/"/);
  assert.doesNotMatch(html, /AWS[\s\S]{0,80}in progress/i);
});

test("homepage uses the canonical Atlas Systems text tokens", () => {
  assert.match(baseCss, /--text-dim:#aaa9a0/);
  assert.match(baseCss, /--text-faint:#888894/);
  assert.match(baseCss, /--accent:#f5a623/);
});

test("system map copy avoids repeating detailed Worker coverage language", () => {
  assert.match(html, /Declared architecture, enriched by live discovery/);
  assert.match(html, /source systems, runtime surfaces, dependencies, and evidence routes/);
  assert.doesNotMatch(html, /public topology provides the declared component graph/);
  assert.doesNotMatch(html, /runtime registry adds observed Worker presence/);
  assert.doesNotMatch(html, /the system, describing itself/i);
});

test("latest accessibility compatibility hook remains available without owning visible truth", () => {
  const estateStrip = html.match(/<a[^>]*id="estate-strip"[^>]*>/)?.[0] ?? "";
  assert.ok(estateStrip);
  assert.match(estateStrip, /compat-estate-strip/);
  assert.match(estateStrip, /aria-hidden="true"/);
  assert.match(html, /id="truth-strip"/);
});
