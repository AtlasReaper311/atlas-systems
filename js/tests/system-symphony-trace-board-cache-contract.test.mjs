import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const boardKey = "20260831-system-symphony-heading-clearance-v1";
const pageKey = "20260728-system-symphony-trace-pr160-v1";
const read = (path) => readFileSync(path, "utf8");

test("TRACE cache identity advances the complete changed asset chain", () => {
  const root = read("lab/system-symphony/index.html");

  for (const expected of [
    "/static/css/system-symphony.css?v=" + boardKey,
    "/lab/system-symphony/system-symphony-page.css?v=" + pageKey,
    "/lab/shared/shell.js?v=" + boardKey,
    "/lab/system-symphony/system-symphony-page.js?v=" + pageKey,
  ]) {
    assert.ok(root.includes(expected), "missing " + expected);
  }

  for (const child of ["build-log", "radio", "roms"]) {
    const page = read("lab/system-symphony/" + child + "/index.html");
    assert.ok(
      page.includes(
        "/lab/system-symphony/system-symphony-page.css?v=" + pageKey,
      ),
    );
    assert.ok(page.includes("/lab/shared/shell.js?v=" + boardKey));
  }

  const replay = read("lab/system-symphony/replay/index.html");
  assert.ok(
    replay.includes(
      "/lab/system-symphony/system-symphony-page.css?v=" + pageKey,
    ),
  );
  assert.ok(!replay.includes("/lab/shared/shell.js"));

  const consolePage = read("lab/console/index.html");
  assert.ok(
    consolePage.includes("/static/css/system-symphony.css?v=" + boardKey),
  );
  assert.ok(
    consolePage.includes("/static/js/sonify/ui.js?v=" + boardKey),
  );

  const shell = read("lab/shared/shell.js");
  assert.ok(
    shell.includes(
      "/lab/system-symphony/system-symphony-navigation.js?v=" + boardKey,
    ),
  );
  assert.ok(
    shell.includes(
      "/lab/system-symphony/trace-role-bridge.js?v=" + boardKey,
    ),
  );
  assert.ok(
    read("lab/system-symphony/system-symphony-navigation.js").includes(
      "/lab/system-symphony/system-symphony-navigation.css?v=" + boardKey,
    ),
  );
  assert.ok(
    read("lab/system-symphony/trace-role-bridge.js").includes(
      "/lab/system-symphony/trace-role-bridge.css?v=" + boardKey,
    ),
  );
  assert.ok(
    read("lab/system-symphony/system-symphony-page.js").includes(
      "../../static/js/sonify/ui.js?v=" + boardKey,
    ),
  );
});

test("TRACE entrypoints no longer expose displaced cache identities", () => {
  const paths = [
    "lab/console/index.html",
    "lab/shared/shell.js",
    "lab/system-symphony/index.html",
    "lab/system-symphony/build-log/index.html",
    "lab/system-symphony/radio/index.html",
    "lab/system-symphony/replay/index.html",
    "lab/system-symphony/roms/index.html",
    "lab/system-symphony/system-symphony-navigation.js",
    "lab/system-symphony/system-symphony-page.js",
    "lab/system-symphony/trace-role-bridge.js",
  ];

  const combined = paths.map(read).join("\n");

  for (const stale of [
    "20260718-system-symphony-ghost-mix",
    "20260718-system-symphony-ghost-tempo-guard",
    "20260726-phase-d-role-routing-v1",
  ]) {
    assert.ok(
      !combined.includes(stale),
      "stale cache identity remains: " + stale,
    );
  }
});
