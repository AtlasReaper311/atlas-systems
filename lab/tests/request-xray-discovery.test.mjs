import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const landing = fs.readFileSync("lab/index.html", "utf8");

test("Request X-Ray is discoverable from the Lab Verify directory", () => {
  assert.match(landing, /data-family="verify"[^>]*data-motif="XRAY"[^>]*href="\/lab\/xray\/"/);
  assert.match(landing, /<h3>Request X-Ray<\/h3>/);
  assert.match(landing, /Break a simulated request path/);
  assert.match(landing, /<span class="data-mode">Simulated<\/span><span class="card-route">Open X-Ray/);
  assert.doesNotMatch(landing, /href="\/lab\/xray\/"[^>]*target="_blank"/);
});

test("Request X-Ray is registered in the shared Lab Verify navigation", () => {
  const shell = fs.readFileSync("lab/shared/shell.js", "utf8");
  assert.match(shell, /label: "X-Ray", href: "\/lab\/xray\/"/);
  assert.doesNotMatch(shell, /label: "X-Ray", href: "https:\/\/xray\.atlas-systems\.uk\/"/);
});

test("Request X-Ray route uses the governed Lab shell instead of standalone chrome", () => {
  const page = fs.readFileSync("lab/xray/index.html", "utf8");
  assert.match(page, /<script type="module" src="\/lab\/shared\/shell\.js\?v=20260813-xray-route"><\/script>/);
  assert.match(page, /<script type="module" src="\/lab\/xray\/src\/app\.js\?v=20260813-lab-shell-parity"><\/script>/);
  // The chrome is the estate's, shipped in the document so first paint is
  // already correct. Bespoke X-Ray navigation is what stays forbidden.
  assert.match(page, /<nav class="atlas-header atlas-nav-shell atlas-global-header" aria-label="Primary navigation">/);
  assert.match(page, /<nav class="mobile-nav atlas-mobile-nav atlas-bottom-nav" aria-label="Mobile navigation">/);
  assert.match(page, /<nav class="lab-context-nav lab-context-nav--compact" aria-label="Lab navigation"/);
  assert.doesNotMatch(page, /class="xray-nav|class="xray-header/);
});
