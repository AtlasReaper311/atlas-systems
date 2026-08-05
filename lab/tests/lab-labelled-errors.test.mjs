import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const anomaly = fs.readFileSync("lab/anomaly/anomaly-core.js", "utf8");
const conformance = fs.readFileSync("lab/conformance/conformance-core.js", "utf8");

test("LAB-007c labels anomaly fallback diagnostics with stable source and context", () => {
  assert.match(anomaly, /sourceStatus\.dataset\.errorSource = "anomaly-evidence"/);
  assert.match(anomaly, /sourceStatus\.dataset\.errorContext = "live-load"/);
  assert.match(
    anomaly,
    /console\.warn\(\s*"\[lab\/anomaly\] live evidence load failed; rendering an explicitly simulated browser demonstration",\s*error,\s*\);/,
  );
  assert.match(anomaly, /delete sourceStatus\.dataset\.errorSource/);
  assert.match(anomaly, /delete sourceStatus\.dataset\.errorContext/);
  assert.match(anomaly, /applyEvidenceMode\("simulated"\)/);
  assert.doesNotMatch(anomaly, /console\.error\(/);
});

test("LAB-007c labels conformance fallback diagnostics with stable source and context", () => {
  assert.match(conformance, /reportElements\.status\.dataset\.errorSource = "conformance-evidence"/);
  assert.match(conformance, /reportElements\.status\.dataset\.errorContext = "live-load"/);
  assert.match(
    conformance,
    /console\.warn\(\s*"\[lab\/conformance\] live evidence load failed; rendering an unavailable evidence state",\s*error,\s*\);/,
  );
  assert.match(conformance, /delete reportElements\.status\.dataset\.errorSource/);
  assert.match(conformance, /delete reportElements\.status\.dataset\.errorContext/);
  assert.match(conformance, /applyEvidenceMode\("unavailable"\)/);
  assert.doesNotMatch(conformance, /console\.error\(/);
});
