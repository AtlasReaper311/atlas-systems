import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

class StubElement {
  constructor(name) {
    this.name = name;
    this.children = [];
    this.className = "";
    this.dataset = {};
    this.innerHTML = "";
    this.textContent = "";
    this.title = "";
    this.value = "";
  }

  addEventListener() {}

  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

function createDocument(selectors) {
  const elements = new Map(selectors.map((selector) => [selector, new StubElement(selector)]));
  return {
    elements,
    querySelector(selector) {
      return elements.get(selector) || null;
    },
    createElement(tagName) {
      return new StubElement(tagName);
    },
  };
}

async function executeBrowserScript(path, document) {
  const warnings = [];
  const errors = [];
  const source = fs.readFileSync(path, "utf8");
  vm.runInNewContext(
    source,
    {
      document,
      fetch: async () => {
        throw new Error("offline fixture");
      },
      console: {
        warn: (...args) => warnings.push(args),
        error: (...args) => errors.push(args),
      },
      Date,
      Math,
      Number,
      Object,
      Promise,
      Set,
      String,
    },
    { filename: path },
  );
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  return { warnings, errors };
}

test("LAB-009 keeps the anomaly fallback reachable and explicitly simulated without chart controls", async () => {
  const document = createDocument([
    "#overall-state",
    "#overall-score",
    "#generated-at",
    "#source-status",
    "#metric-table",
    "#chart-summary",
    "#metric-value",
    "#metric-z",
    "#metric-slope",
    "#metric-volatility",
    "#metric-dtw",
    "#metric-confidence",
    "#metric-divergence",
    "#metric-warmup",
  ]);

  const { warnings, errors } = await executeBrowserScript("lab/anomaly/anomaly-core.js", document);
  const status = document.elements.get("#source-status");

  assert.equal(errors.length, 0);
  assert.equal(status.dataset.interfaceState, "partial");
  assert.equal(status.dataset.interfaceMissing, "metric-select,anomaly-chart");
  assert.equal(status.dataset.evidenceMode, "simulated");
  assert.equal(status.dataset.runtimeState, "unknown");
  assert.equal(status.textContent, "Simulated");
  assert.match(status.title, /Browser-generated demonstration/);
  assert.match(document.elements.get("#chart-summary").textContent, /Chart unavailable/);
  assert.match(document.elements.get("#overall-state").className, /state-simulated/);
  assert.ok(warnings.some(([message]) => message.startsWith("[lab/anomaly] optional interface elements unavailable")));
  assert.ok(warnings.some(([message]) => message.startsWith("[lab/anomaly] live evidence load failed")));
  assert.equal(warnings.some(([message]) => /replay/i.test(message)), false);
});

test("LAB-009 keeps the conformance fallback reachable without inferring zero evidence", async () => {
  const document = createDocument([
    "#estate-score",
    "#repo-count",
    "#generated-at",
    "#error-count",
    "#warning-count",
    "#unknown-count",
    "#evidence-status",
    "#repo-table",
    "#finding-table",
    "#rule-grid",
    "#policy-version",
    "#source-repository",
    "#source-commit",
    "#fingerprint",
  ]);

  const { warnings, errors } = await executeBrowserScript("lab/conformance/conformance-core.js", document);
  const status = document.elements.get("#evidence-status");

  assert.equal(errors.length, 0);
  assert.equal(status.dataset.interfaceState, "partial");
  assert.equal(status.dataset.interfaceMissing, "repo-filter");
  assert.equal(status.dataset.evidenceMode, "unavailable");
  assert.equal(status.dataset.runtimeState, "unknown");
  assert.equal(status.textContent, "Unavailable");
  assert.equal(document.elements.get("#estate-score").textContent, "unscored");
  assert.equal(document.elements.get("#repo-count").textContent, "—");
  assert.equal(document.elements.get("#error-count").textContent, "—");
  assert.equal(document.elements.get("#warning-count").textContent, "—");
  assert.equal(document.elements.get("#unknown-count").textContent, "—");
  assert.match(document.elements.get("#repo-table").innerHTML, /evidence is unavailable/i);
  assert.doesNotMatch(document.elements.get("#repo-table").innerHTML, />0</);
  assert.ok(warnings.some(([message]) => message.startsWith("[lab/conformance] optional interface elements unavailable")));
  assert.ok(warnings.some(([message]) => message.startsWith("[lab/conformance] live evidence load failed")));
});
