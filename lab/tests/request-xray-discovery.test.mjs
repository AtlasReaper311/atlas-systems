import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const landing = fs.readFileSync("lab/index.html", "utf8");

test("Request X-Ray is discoverable from the Lab Verify directory", () => {
  assert.match(landing, /data-family="verify"[^>]*data-motif="XRAY"[^>]*href="https:\/\/xray\.atlas-systems\.uk\/"/);
  assert.match(landing, /<h3>Request X-Ray<\/h3>/);
  assert.match(landing, /Break a simulated request path/);
  assert.match(landing, /<span class="data-mode">Simulated<\/span><span class="card-route">Open X-Ray/);
  assert.doesNotMatch(landing, /href="https:\/\/xray\.atlas-systems\.uk\/"[^>]*target="_blank"/);
});
