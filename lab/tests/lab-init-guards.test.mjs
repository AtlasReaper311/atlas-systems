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
      String,
    },
    { filename: path },
  );
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  return { warnings, errors };
}

test("LAB-009 keeps the anomaly fallback reachable without chart or metric controls", async () => {
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
  assert.match(status.textContent, /labelled deterministic replay/);
  assert.match(document.elements.get("#chart-summary").textContent, /Chart unavailable/);
  assert.ok(warnings.some(([message]) => message.startsWith("[lab/anomaly] optional interface elements unavailable")));
  assert.ok(warnings.some(([message]) => message.startsWith("[lab/anomaly] live evidence load failed")));
});

test("LAB-009 keeps the conformance fallback reachable without its repository filter", async () => {
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
  assert.equal(status.textContent, "no report published yet");
  assert.equal(document.elements.get("#estate-score").textContent, "unscored");
  assert.match(document.elements.get("#repo-table").innerHTML, /No repository rows match/);
  assert.ok(warnings.some(([message]) => message.startsWith("[lab/conformance] optional interface elements unavailable")));
  assert.ok(warnings.some(([message]) => message.startsWith("[lab/conformance] live evidence load failed")));
});
