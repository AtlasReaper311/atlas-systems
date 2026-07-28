from pathlib import Path

CACHE_KEY = "20260728-system-symphony-trace-board-v1"


def replace_once(path_name: str, old: str, new: str) -> None:
    path = Path(path_name)
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(
            f"{path_name}: expected one occurrence of {old!r}, found {count}"
        )
    path.write_text(text.replace(old, new))


root = "lab/system-symphony/index.html"
replace_once(root, "/static/css/system-symphony.css?v=20260718-system-symphony-ghost-mix", f"/static/css/system-symphony.css?v={CACHE_KEY}")
replace_once(root, "/lab/system-symphony/system-symphony-page.css?v=20260727-stage-2a-polish-fixes", f"/lab/system-symphony/system-symphony-page.css?v={CACHE_KEY}")
replace_once(root, "/lab/shared/shell.js?v=20260725-batch-h-fixes", f"/lab/shared/shell.js?v={CACHE_KEY}")
replace_once(root, "/lab/system-symphony/system-symphony-page.js?v=20260727-stage-2a-polish-fixes", f"/lab/system-symphony/system-symphony-page.js?v={CACHE_KEY}")

for child in ["build-log", "radio", "replay", "roms"]:
    page = f"lab/system-symphony/{child}/index.html"
    replace_once(page, "/lab/system-symphony/system-symphony-page.css?v=20260727-stage-2a-polish-fixes", f"/lab/system-symphony/system-symphony-page.css?v={CACHE_KEY}")
    replace_once(page, "/lab/shared/shell.js?v=20260725-batch-h-fixes", f"/lab/shared/shell.js?v={CACHE_KEY}")

replace_once("lab/console/index.html", "/static/css/system-symphony.css?v=20260718-system-symphony-ghost-mix", f"/static/css/system-symphony.css?v={CACHE_KEY}")
replace_once("lab/console/index.html", "/static/js/sonify/ui.js?v=20260718-system-symphony-ghost-tempo-guard", f"/static/js/sonify/ui.js?v={CACHE_KEY}")
replace_once("lab/shared/shell.js", "/lab/system-symphony/system-symphony-navigation.js?v=20260727-stage-2a-polish-fixes", f"/lab/system-symphony/system-symphony-navigation.js?v={CACHE_KEY}")
replace_once("lab/shared/shell.js", "/lab/system-symphony/trace-role-bridge.js?v=20260726-phase-d-role-routing-v1", f"/lab/system-symphony/trace-role-bridge.js?v={CACHE_KEY}")
replace_once("lab/system-symphony/system-symphony-navigation.js", "/lab/system-symphony/system-symphony-navigation.css?v=20260727-stage-2a-polish-fixes", f"/lab/system-symphony/system-symphony-navigation.css?v={CACHE_KEY}")
replace_once("lab/system-symphony/trace-role-bridge.js", "/lab/system-symphony/trace-role-bridge.css?v=20260726-phase-d-role-routing-v1", f"/lab/system-symphony/trace-role-bridge.css?v={CACHE_KEY}")
replace_once("lab/system-symphony/system-symphony-page.js", '../../static/js/sonify/ui.js?v=20260726-system-symphony-atlas-apu-live-v7', f'../../static/js/sonify/ui.js?v={CACHE_KEY}')
replace_once("js/tests/batch-h-system-symphony-page.test.mjs", "/lab/system-symphony/system-symphony-page.css?v=20260727-stage-2a-polish-fixes", f"/lab/system-symphony/system-symphony-page.css?v={CACHE_KEY}")
replace_once("js/tests/system-symphony-navigation-ia.test.mjs", "system-symphony-navigation.js?v=20260727-stage-2a-polish-fixes", f"system-symphony-navigation.js?v={CACHE_KEY}")
replace_once("js/tests/system-symphony-navigation-ia.test.mjs", "trace-role-bridge.js?v=20260726-phase-d-role-routing-v1", f"trace-role-bridge.js?v={CACHE_KEY}")
replace_once("js/tests/system-symphony-phase-d-role-routing.test.mjs", "trace-role-bridge.js?v=20260726-phase-d-role-routing-v1", f"trace-role-bridge.js?v={CACHE_KEY}")

coherence = Path("static/js/sonify/coherence-cache.test.js")
coherence_text = coherence.read_text()
old_anchor = '  const ui = fs.readFileSync("static/js/sonify/ui.js", "utf8");\n'
new_anchor = old_anchor + f'  const traceBoardAssetId = "{CACHE_KEY}";\n'
if coherence_text.count(old_anchor) != 1:
    raise SystemExit("coherence cache anchor count changed")
coherence_text = coherence_text.replace(old_anchor, new_anchor)
old_assert = '  assert.match(symphonyPage, new RegExp(`ui\\.js\\?v=${LIVE_APU_BUILD_ID}`));'
new_assert = '  assert.match(symphonyPage, new RegExp(`ui\\.js\\?v=${traceBoardAssetId}`));'
if coherence_text.count(old_assert) != 1:
    raise SystemExit("coherence cache UI assertion count changed")
coherence.write_text(coherence_text.replace(old_assert, new_assert))

Path("js/tests/system-symphony-trace-board-cache-contract.test.mjs").write_text(
    f'''import assert from "node:assert/strict";
import {{ readFileSync }} from "node:fs";
import test from "node:test";

const key = "{CACHE_KEY}";
const read = (path) => readFileSync(path, "utf8");

test("TRACE cache identity advances the complete changed asset chain", () => {{
  const root = read("lab/system-symphony/index.html");
  for (const expected of [
    "/static/css/system-symphony.css?v=" + key,
    "/lab/system-symphony/system-symphony-page.css?v=" + key,
    "/lab/shared/shell.js?v=" + key,
    "/lab/system-symphony/system-symphony-page.js?v=" + key,
  ]) assert.ok(root.includes(expected), "missing " + expected);
  for (const child of ["build-log", "radio", "replay", "roms"]) {{
    const page = read("lab/system-symphony/" + child + "/index.html");
    assert.ok(page.includes("/lab/system-symphony/system-symphony-page.css?v=" + key));
    assert.ok(page.includes("/lab/shared/shell.js?v=" + key));
  }}
  const consolePage = read("lab/console/index.html");
  assert.ok(consolePage.includes("/static/css/system-symphony.css?v=" + key));
  assert.ok(consolePage.includes("/static/js/sonify/ui.js?v=" + key));
  const shell = read("lab/shared/shell.js");
  assert.ok(shell.includes("/lab/system-symphony/system-symphony-navigation.js?v=" + key));
  assert.ok(shell.includes("/lab/system-symphony/trace-role-bridge.js?v=" + key));
  assert.ok(read("lab/system-symphony/system-symphony-navigation.js").includes("/lab/system-symphony/system-symphony-navigation.css?v=" + key));
  assert.ok(read("lab/system-symphony/trace-role-bridge.js").includes("/lab/system-symphony/trace-role-bridge.css?v=" + key));
  assert.ok(read("lab/system-symphony/system-symphony-page.js").includes("../../static/js/sonify/ui.js?v=" + key));
}});

test("TRACE entrypoints no longer expose displaced cache identities", () => {{
  const paths = [
    "lab/console/index.html", "lab/shared/shell.js", "lab/system-symphony/index.html",
    "lab/system-symphony/build-log/index.html", "lab/system-symphony/radio/index.html",
    "lab/system-symphony/replay/index.html", "lab/system-symphony/roms/index.html",
    "lab/system-symphony/system-symphony-navigation.js",
    "lab/system-symphony/system-symphony-page.js",
    "lab/system-symphony/trace-role-bridge.js",
  ];
  const combined = paths.map(read).join("\\n");
  for (const stale of [
    "20260718-system-symphony-ghost-mix",
    "20260718-system-symphony-ghost-tempo-guard",
    "20260726-phase-d-role-routing-v1",
  ]) assert.ok(!combined.includes(stale), "stale cache identity remains: " + stale);
}});
'''
)
