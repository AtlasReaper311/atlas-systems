import assert from "node:assert/strict";
import test from "node:test";

import { installSurfaceConvergence } from "../../static/js/phase-6-footer.js";

function restoreGlobal(name, value, existed) {
  if (existed) globalThis[name] = value;
  else delete globalThis[name];
}

test("surface convergence bootstrap is single-flight across concurrent module identities and retries after failure", async () => {
  const saved = new Map([
    ["location", [globalThis.location, Object.hasOwn(globalThis, "location")]],
    ["document", [globalThis.document, Object.hasOwn(globalThis, "document")]],
    ["fetch", [globalThis.fetch, Object.hasOwn(globalThis, "fetch")]],
  ]);

  let releaseFirst;
  let fetchCalls = 0;
  globalThis.location = { pathname: "/lab/signal/", origin: "https://example.test" };
  globalThis.document = {
    getElementById() { return null; },
    head: {
      querySelectorAll() { return []; },
      appendChild() {},
    },
    createElement() { return { dataset: {} }; },
  };
  globalThis.fetch = async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) {
      await new Promise((resolve) => { releaseFirst = resolve; });
    }
    return { ok: false, status: 503 };
  };

  try {
    const first = installSurfaceConvergence();
    const concurrent = installSurfaceConvergence();
    assert.strictEqual(concurrent, first);

    await Promise.resolve();
    assert.equal(fetchCalls, 1);

    releaseFirst();
    await assert.rejects(first, /HTTP 503/);
    await Promise.resolve();

    const retry = installSurfaceConvergence();
    assert.notStrictEqual(retry, first);
    await assert.rejects(retry, /HTTP 503/);
    assert.equal(fetchCalls, 2);
  } finally {
    for (const [name, [value, existed]] of saved) restoreGlobal(name, value, existed);
  }
});
