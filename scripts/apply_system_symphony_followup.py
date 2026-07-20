from __future__ import annotations

from pathlib import Path

BUILD_ID = "20260720-system-symphony-coherence-cache-v1"
ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one patch anchor, found {count}")
    write(path, content.replace(old, new, 1))


# Cache contract: Lab HTML and the sonification module graph must revalidate.
headers_path = "_headers"
headers = read(headers_path).rstrip()
cache_rules = f"""

/lab
  Cache-Control: no-cache, max-age=0, must-revalidate
  X-Atlas-System-Symphony-Build: {BUILD_ID}

/lab/
  Cache-Control: no-cache, max-age=0, must-revalidate
  X-Atlas-System-Symphony-Build: {BUILD_ID}

/lab/index.html
  Cache-Control: no-cache, max-age=0, must-revalidate
  X-Atlas-System-Symphony-Build: {BUILD_ID}

/static/js/sonify/*
  Cache-Control: no-cache, max-age=0, must-revalidate
  X-Atlas-System-Symphony-Build: {BUILD_ID}
"""
if "/static/js/sonify/*" not in headers:
    headers += cache_rules
else:
    raise RuntimeError("_headers already contains a System SYMPHONY cache rule; inspect before patching")
write(headers_path, headers + "\n")

# Make the top-level module URLs change as well as forcing future revalidation.
replace_once(
    "lab/index.html",
    'src="/static/js/sonify/ui.js?v=20260718-system-symphony-ghost-tempo-guard"',
    f'src="/static/js/sonify/ui.js?v={BUILD_ID}"',
)
replace_once(
    "static/js/sonify/ui.js",
    "  DEFAULT_USER_GAIN,\n  createEngine,\n} from \"./engine.js?v=20260718-system-symphony-ghost-tempo-guard\";",
    f"  DEFAULT_USER_GAIN,\n  SYSTEM_SYMPHONY_BUILD_ID,\n  createEngine,\n}} from \"./engine.js?v={BUILD_ID}\";",
)
replace_once(
    "static/js/sonify/ui.js",
    'import { resolveSamplePalette } from "./samples.js?v=20260718-system-symphony-ghost-circuit";\n\nconst WIDGET_ID = "system-symphony-widget";',
    'import { resolveSamplePalette } from "./samples.js?v=20260718-system-symphony-ghost-circuit";\n\n'
    'if (typeof window !== "undefined") {\n'
    '  window.__ATLAS_SYSTEM_SYMPHONY_BUILD__ = SYSTEM_SYMPHONY_BUILD_ID;\n'
    '}\n'
    'if (typeof document !== "undefined") {\n'
    '  document.documentElement.dataset.systemSymphonyBuild = SYSTEM_SYMPHONY_BUILD_ID;\n'
    '}\n\n'
    'const WIDGET_ID = "system-symphony-widget";',
)

# Engine state-coherence controls.
replace_once(
    "static/js/sonify/engine.js",
    'export const AUDIO_START_TIMEOUT_MS = 8000;\nexport const PAD_MEASURE_STEPS = 8;',
    f'export const AUDIO_START_TIMEOUT_MS = 8000;\n'
    f'export const SYSTEM_SYMPHONY_BUILD_ID = "{BUILD_ID}";\n'
    'export const LIVE_STATE_TRANSITION_SECONDS = 6;\n'
    'export const LIVE_STATE_CONFIRMATION_FRAMES = Object.freeze({\n'
    '  healthy: 3,\n'
    '  warning: 2,\n'
    '  critical: 2,\n'
    '  unknown: 3,\n'
    '});\n'
    'export const PAD_MEASURE_STEPS = 8;',
)
replace_once(
    "static/js/sonify/engine.js",
    'function clamp(value, minimum, maximum) {\n  return Math.min(maximum, Math.max(minimum, Number(value) || 0));\n}\n\nexport function shouldPlayPad(step) {',
    'function clamp(value, minimum, maximum) {\n'
    '  return Math.min(maximum, Math.max(minimum, Number(value) || 0));\n'
    '}\n\n'
    'export function liveStateConfirmationFrames(currentState, nextState) {\n'
    '  if (!currentState || currentState === nextState) return 1;\n'
    '  if (nextState === "critical") return LIVE_STATE_CONFIRMATION_FRAMES.critical;\n'
    '  if (nextState === "unknown") return LIVE_STATE_CONFIRMATION_FRAMES.unknown;\n'
    '  if (currentState === "critical" && nextState === "healthy") {\n'
    '    return LIVE_STATE_CONFIRMATION_FRAMES.healthy;\n'
    '  }\n'
    '  return LIVE_STATE_CONFIRMATION_FRAMES[nextState] ?? 2;\n'
    '}\n\n'
    'export function canCommitLiveFrameAtStep(step, currentState, nextState) {\n'
    '  if (!Number.isInteger(step) || step < 0 || step % PAD_MEASURE_STEPS !== 0) return false;\n'
    '  if (!currentState || !nextState || currentState === nextState) return true;\n'
    '  return step % PHRASE_STEPS === 0;\n'
    '}\n\n'
    'export function shouldPlayPad(step) {',
)
replace_once(
    "static/js/sonify/engine.js",
    '  let currentFrame = null;\n  let pendingLiveFrame = null;\n  let phraseIndex = 0;',
    '  let currentFrame = null;\n'
    '  let pendingLiveFrame = null;\n'
    '  let liveStateCandidate = null;\n'
    '  let liveStateCandidateCount = 0;\n'
    '  let phraseIndex = 0;',
)
replace_once(
    "static/js/sonify/engine.js",
    '  let sampleLoadHandler = null;\n\n  function effectivePerformance() {',
    '  let sampleLoadHandler = null;\n\n'
    '  function resetLiveStateCandidate() {\n'
    '    liveStateCandidate = null;\n'
    '    liveStateCandidateCount = 0;\n'
    '  }\n\n'
    '  function acceptLiveFrameState(frame) {\n'
    '    const currentState = currentFrame?.scoreState ?? null;\n'
    '    const nextState = frame?.scoreState ?? "unknown";\n'
    '    if (!currentState || currentState === nextState) {\n'
    '      resetLiveStateCandidate();\n'
    '      return true;\n'
    '    }\n'
    '    if (liveStateCandidate !== nextState) {\n'
    '      liveStateCandidate = nextState;\n'
    '      liveStateCandidateCount = 1;\n'
    '    } else {\n'
    '      liveStateCandidateCount += 1;\n'
    '    }\n'
    '    const required = liveStateConfirmationFrames(currentState, nextState);\n'
    '    if (liveStateCandidateCount < required) return false;\n'
    '    resetLiveStateCandidate();\n'
    '    return true;\n'
    '  }\n\n'
    '  function effectivePerformance() {',
)
replace_once(
    "static/js/sonify/engine.js",
    '  function commitPendingLiveFrame(time) {\n'
    '    if (demoMode || !pendingLiveFrame) return false;\n'
    '    const previousState = currentFrame?.scoreState;\n'
    '    currentFrame = pendingLiveFrame;\n'
    '    pendingLiveFrame = null;\n'
    '    liveDirector.observe(currentFrame);\n'
    '    const stateChanged = previousState && previousState !== currentFrame.scoreState;\n'
    '    if (stateChanged) {\n'
    '      livePlan = liveDirector.advancePhrase();\n'
    '      pad?.releaseAll?.(time);\n'
    '    }\n'
    '    applyFrameToGraph(currentFrame, stateChanged ? 1.6 : 0.9, time);\n'
    '    return stateChanged;\n'
    '  }\n\n'
    '  function advanceLivePhrase(time) {\n'
    '    if (demoMode || !currentFrame) return;\n'
    '    liveDirector.observe(currentFrame);\n'
    '    livePlan = liveDirector.advancePhrase();\n'
    '    applyMixToGraph(currentFrame, 1.1, time);\n'
    '  }',
    '  function commitPendingLiveFrame(time, { allowStateChange = false } = {}) {\n'
    '    if (demoMode || !pendingLiveFrame) return false;\n'
    '    const nextFrame = pendingLiveFrame;\n'
    '    const previousState = currentFrame?.scoreState;\n'
    '    const stateChanged = Boolean(previousState && previousState !== nextFrame.scoreState);\n'
    '    if (stateChanged && !allowStateChange) return false;\n'
    '    currentFrame = nextFrame;\n'
    '    pendingLiveFrame = null;\n'
    '    liveDirector.observe(currentFrame);\n'
    '    if (stateChanged) pad?.releaseAll?.(time);\n'
    '    applyFrameToGraph(\n'
    '      currentFrame,\n'
    '      stateChanged ? LIVE_STATE_TRANSITION_SECONDS : 0.9,\n'
    '      time,\n'
    '    );\n'
    '    return stateChanged;\n'
    '  }\n\n'
    '  function advanceLivePhrase(time, transitionSeconds = 1.1) {\n'
    '    if (demoMode || !currentFrame) return;\n'
    '    liveDirector.observe(currentFrame);\n'
    '    livePlan = liveDirector.advancePhrase();\n'
    '    applyMixToGraph(currentFrame, transitionSeconds, time);\n'
    '  }',
)
replace_once(
    "static/js/sonify/engine.js",
    '    if (!demoMode && shouldApplyPendingPerformance(step)) {\n'
    '      commitPendingLiveFrame(time);\n'
    '    }\n\n'
    '    if (step === 0 && stepIndex > 0) {\n'
    '      phraseIndex += 1;\n'
    '      if (!demoMode) advanceLivePhrase(time);\n'
    '    }',
    '    let liveStateChanged = false;\n'
    '    if (!demoMode && shouldApplyPendingPerformance(step)) {\n'
    '      liveStateChanged = commitPendingLiveFrame(time, {\n'
    '        allowStateChange: canCommitLiveFrameAtStep(\n'
    '          step,\n'
    '          currentFrame?.scoreState,\n'
    '          pendingLiveFrame?.scoreState,\n'
    '        ),\n'
    '      });\n'
    '    }\n\n'
    '    if (step === 0 && stepIndex > 0) {\n'
    '      phraseIndex += 1;\n'
    '      if (!demoMode) {\n'
    '        advanceLivePhrase(\n'
    '          time,\n'
    '          liveStateChanged ? LIVE_STATE_TRANSITION_SECONDS : 1.1,\n'
    '        );\n'
    '      }\n'
    '    }',
)
replace_once(
    "static/js/sonify/engine.js",
    '    applyFrame(frame) {\n'
    '      if (!frame || typeof frame !== "object") return;\n'
    '      liveDirector.observe(frame);\n'
    '      if (demoMode || !initialized || !running) {\n'
    '        currentFrame = frame;\n'
    '        pendingLiveFrame = null;\n'
    '        if (!demoMode && !livePlan) livePlan = liveDirector.advancePhrase();\n'
    '        if (initialized) applyFrameToGraph(frame);\n'
    '        return;\n'
    '      }\n'
    '      pendingLiveFrame = frame;\n'
    '    },',
    '    applyFrame(frame) {\n'
    '      if (!frame || typeof frame !== "object") return;\n'
    '      if (demoMode || !initialized || !running) {\n'
    '        resetLiveStateCandidate();\n'
    '        liveDirector.observe(frame);\n'
    '        currentFrame = frame;\n'
    '        pendingLiveFrame = null;\n'
    '        if (!demoMode && !livePlan) livePlan = liveDirector.advancePhrase();\n'
    '        if (initialized) applyFrameToGraph(frame);\n'
    '        return;\n'
    '      }\n'
    '      if (!acceptLiveFrameState(frame)) {\n'
    '        if (\n'
    '          pendingLiveFrame\n'
    '          && pendingLiveFrame.scoreState !== currentFrame?.scoreState\n'
    '          && pendingLiveFrame.scoreState !== frame.scoreState\n'
    '        ) {\n'
    '          pendingLiveFrame = null;\n'
    '        }\n'
    '        return;\n'
    '      }\n'
    '      liveDirector.observe(frame);\n'
    '      pendingLiveFrame = frame;\n'
    '    },',
)
replace_once(
    "static/js/sonify/engine.js",
    '      demoMode = true;\n      const nextId = nextPerformance.id ?? null;',
    '      resetLiveStateCandidate();\n      demoMode = true;\n      const nextId = nextPerformance.id ?? null;',
)
replace_once(
    "static/js/sonify/engine.js",
    '      currentFrame = frame;\n      activePerformance = nextPerformance;\n      pendingSceneFrame = null;',
    '      resetLiveStateCandidate();\n      currentFrame = frame;\n      activePerformance = nextPerformance;\n      pendingSceneFrame = null;',
)
replace_once(
    "static/js/sonify/engine.js",
    '      pendingLiveFrame: Boolean(pendingLiveFrame),\n      livePlan,',
    '      pendingLiveFrame: Boolean(pendingLiveFrame),\n'
    '      liveStateCandidate,\n'
    '      liveStateCandidateCount,\n'
    '      livePlan,',
)
replace_once(
    "static/js/sonify/engine.js",
    '      liveDirector.reset();\n    },',
    '      resetLiveStateCandidate();\n      liveDirector.reset();\n    },',
)

# Live telemetry uses tight one-shot/procedural bass and a single coherent metal accent.
replace_once(
    "static/js/sonify/samples.js",
    'export function resolveSamplePalette(scoreState, performance = null, phraseIndex = 0) {\n'
    '  const state = normalizedState(scoreState);\n'
    '  const palette = {\n'
    '    kick: sampleIdForEvent("kick", state, 0, phraseIndex, performance),\n'
    '    snare: sampleIdForEvent("snare", state, 0, phraseIndex, performance),\n'
    '    hat: sampleIdForEvent("hat", state, 0, phraseIndex, performance),\n'
    '    metal: sampleIdForEvent("metal", state, 0, phraseIndex, performance),\n'
    '    bass: sampleIdForEvent("bass", state, 0, phraseIndex, performance),\n'
    '    bassLoop: sampleIdForEvent("bassLoop", state, 0, phraseIndex, performance),\n'
    '    lead: sampleIdForEvent("lead", state, 0, phraseIndex, performance),\n'
    '    atmosphere: sampleIdForEvent("atmosphere", state, 0, phraseIndex, performance),\n'
    '    section: sectionForPhrase(state, phraseIndex, performance),\n'
    '    hyperCycle: hyperCycleForPhrase(phraseIndex),\n'
    '  };\n'
    '  return Object.freeze({\n'
    '    ...palette,\n'
    '    signature: Object.values(palette).join(":"),\n'
    '  });\n'
    '}',
    'export function resolveSamplePalette(scoreState, performance = null, phraseIndex = 0) {\n'
    '  const state = normalizedState(scoreState);\n'
    '  const palette = {\n'
    '    kick: sampleIdForEvent("kick", state, 0, phraseIndex, performance),\n'
    '    snare: sampleIdForEvent("snare", state, 0, phraseIndex, performance),\n'
    '    hat: sampleIdForEvent("hat", state, 0, phraseIndex, performance),\n'
    '    metal: sampleIdForEvent("metal", state, 0, phraseIndex, performance),\n'
    '    bass: sampleIdForEvent("bass", state, 0, phraseIndex, performance),\n'
    '    bassLoop: sampleIdForEvent("bassLoop", state, 0, phraseIndex, performance),\n'
    '    lead: sampleIdForEvent("lead", state, 0, phraseIndex, performance),\n'
    '    atmosphere: sampleIdForEvent("atmosphere", state, 0, phraseIndex, performance),\n'
    '    section: sectionForPhrase(state, phraseIndex, performance),\n'
    '    hyperCycle: hyperCycleForPhrase(phraseIndex),\n'
    '  };\n'
    '  if (performance?.liveDirected) {\n'
    '    palette.bassLoop = null;\n'
    '    palette.metal = "perc-stick";\n'
    '    if (palette.lead === "wobbly-synth") palette.lead = "background-saws";\n'
    '  }\n'
    '  return Object.freeze({\n'
    '    ...palette,\n'
    '    signature: Object.values(palette).join(":"),\n'
    '  });\n'
    '}',
)

# Generic non-production preview workflow for future System SYMPHONY branches.
preview = """name: Cloudflare Pages preview

on:
  pull_request:
    branches:
      - main
    types:
      - opened
      - synchronize
      - reopened
    paths:
      - ".github/workflows/preview.yml"
      - "_headers"
      - "lab/**"
      - "static/js/sonify/**"

permissions:
  contents: read

concurrency:
  group: ${{ github.repository }}-pages-preview-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  validate:
    name: Validate preview candidate
    if: >-
      github.event.pull_request.head.repo.full_name == github.repository &&
      (startsWith(github.event.pull_request.head.ref, 'feat/system-symphony-') ||
       startsWith(github.event.pull_request.head.ref, 'fix/system-symphony-'))
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Check out preview head
        uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: "22"

      - name: Validate static site and Pages output
        run: |
          set -euo pipefail
          npx --yes html-validate@9.7.1 "**/*.html"
          node --test js/tests/*.test.mjs lab/tests/*.test.mjs static/js/sonify/*.test.js
          python3 scripts/generate_sitemap.py --check-only
          python3 scripts/verify_pages_output.py .
          python3 - <<'PY'
          import json
          from pathlib import Path

          for path in sorted(Path(".").rglob("*.json")):
              if ".git" in path.parts:
                  continue
              json.loads(path.read_text(encoding="utf-8"))
          PY

      - name: Check repository links offline
        uses: lycheeverse/lychee-action@e7477775783ea5526144ba13e8db5eec57747ce8 # v2.9.0
        with:
          args: "--offline --no-progress --include-fragments --root-dir ${{ github.workspace }} ."
          fail: true

  deploy-preview:
    name: Publish branch preview
    needs: validate
    if: >-
      github.event.pull_request.head.repo.full_name == github.repository &&
      (startsWith(github.event.pull_request.head.ref, 'feat/system-symphony-') ||
       startsWith(github.event.pull_request.head.ref, 'fix/system-symphony-'))
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment:
      name: pages-preview
      url: ${{ steps.deploy.outputs.deployment_url }}
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CF_PAGES_DEPLOY_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
      SOURCE_BRANCH: ${{ github.event.pull_request.head.ref }}
      PAGES_BRANCH: system-symphony-pr-${{ github.event.pull_request.number }}
      PROJECT_NAME: atlas-systems
    steps:
      - name: Check out validated head
        uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0
        with:
          ref: ${{ github.event.pull_request.head.sha }}

      - name: Set up Node.js
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: "22"

      - name: Guard production boundary
        run: |
          set -euo pipefail
          case "${SOURCE_BRANCH}" in
            feat/system-symphony-*|fix/system-symphony-*) ;;
            *) echo "Refusing unexpected preview source branch: ${SOURCE_BRANCH}" >&2; exit 1 ;;
          esac
          test "${SOURCE_BRANCH}" != "main"
          test "${PAGES_BRANCH}" != "main"

      - name: Deploy preview with Wrangler
        id: deploy
        run: |
          set -euo pipefail
          output_file="${RUNNER_TEMP}/wrangler-pages-deploy.log"
          npx --yes wrangler@4.109.0 pages deploy . \
            --project-name "${PROJECT_NAME}" \
            --branch "${PAGES_BRANCH}" \
            --commit-dirty=true 2>&1 | tee "${output_file}"
          deployment_url="$(grep -Eo 'https://[A-Za-z0-9._-]+\\.pages\\.dev' "${output_file}" | tail -n 1)"
          test -n "${deployment_url}"
          echo "deployment_url=${deployment_url}" >>"${GITHUB_OUTPUT}"

      - name: Record branch preview alias
        env:
          ATOMIC_URL: ${{ steps.deploy.outputs.deployment_url }}
          PREVIEW_URL: https://system-symphony-pr-${{ github.event.pull_request.number }}.atlas-systems-44t.pages.dev
        run: |
          set -euo pipefail
          {
            echo "## Cloudflare Pages preview"
            echo
            echo "${PREVIEW_URL}"
            echo
            echo "Atomic deployment: ${ATOMIC_URL}"
            echo
            echo "This is a non-production branch deployment. atlas-systems.uk is unchanged."
          } >>"${GITHUB_STEP_SUMMARY}"
"""
write(".github/workflows/preview.yml", preview)

# Regression coverage for the exact failure modes fixed here.
test_content = f'''import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {{
  LIVE_STATE_TRANSITION_SECONDS,
  SYSTEM_SYMPHONY_BUILD_ID,
  canCommitLiveFrameAtStep,
  liveStateConfirmationFrames,
}} from "./engine.js";
import {{ resolveSamplePalette }} from "./samples.js";

test("live state changes require persistence before harmonic state replacement", () => {{
  assert.equal(liveStateConfirmationFrames("healthy", "warning"), 2);
  assert.equal(liveStateConfirmationFrames("healthy", "critical"), 2);
  assert.equal(liveStateConfirmationFrames("healthy", "unknown"), 3);
  assert.equal(liveStateConfirmationFrames("critical", "healthy"), 3);
  assert.equal(LIVE_STATE_TRANSITION_SECONDS, 6);
}});

test("live state changes commit only at phrase boundaries", () => {{
  assert.equal(canCommitLiveFrameAtStep(8, "healthy", "critical"), false);
  assert.equal(canCommitLiveFrameAtStep(16, "healthy", "warning"), false);
  assert.equal(canCommitLiveFrameAtStep(0, "healthy", "critical"), true);
  assert.equal(canCommitLiveFrameAtStep(8, "warning", "warning"), true);
}});

test("live telemetry palette removes bass loops, wobbly lead and AC-unit metal hits", () => {{
  const performance = {{
    liveDirected: true,
    bassLoopTimbre: 1,
    leadTimbre: 3,
    metalTimbre: 0,
    sectionVariant: 0,
  }};
  for (let phrase = 0; phrase < 16; phrase += 1) {{
    const palette = resolveSamplePalette("warning", performance, phrase);
    assert.equal(palette.bassLoop, null);
    assert.notEqual(palette.lead, "wobbly-synth");
    assert.equal(palette.metal, "perc-stick");
  }}
}});

test("Ghost Circuit keeps its richer sample pools", () => {{
  const performance = {{
    liveDirected: false,
    bassLoopTimbre: 1,
    leadTimbre: 3,
    metalTimbre: 0,
    sectionVariant: 0,
  }};
  const palettes = Array.from({{ length: 16 }}, (_, phrase) => (
    resolveSamplePalette("warning", performance, phrase)
  ));
  assert.equal(palettes.some((palette) => palette.bassLoop !== null), true);
  assert.equal(palettes.some((palette) => palette.metal !== "perc-stick"), true);
}});

test("cache contract exposes and revalidates the active System SYMPHONY build", () => {{
  const headers = fs.readFileSync("_headers", "utf8");
  const lab = fs.readFileSync("lab/index.html", "utf8");
  const ui = fs.readFileSync("static/js/sonify/ui.js", "utf8");
  assert.equal(SYSTEM_SYMPHONY_BUILD_ID, "{BUILD_ID}");
  assert.match(headers, /\\/static\\/js\\/sonify\\/\\*[\\s\\S]*Cache-Control: no-cache, max-age=0, must-revalidate/);
  assert.match(headers, new RegExp(`X-Atlas-System-Symphony-Build: ${{SYSTEM_SYMPHONY_BUILD_ID}}`));
  assert.match(lab, new RegExp(`ui\\.js\\?v=${{SYSTEM_SYMPHONY_BUILD_ID}}`));
  assert.match(ui, new RegExp(`engine\\.js\\?v=${{SYSTEM_SYMPHONY_BUILD_ID}}`));
  assert.match(ui, /__ATLAS_SYSTEM_SYMPHONY_BUILD__/);
}});

test("state commit path no longer advances the composition director twice", () => {{
  const source = fs.readFileSync("static/js/sonify/engine.js", "utf8");
  const match = source.match(/function commitPendingLiveFrame[\\s\\S]*?function advanceLivePhrase/);
  assert.ok(match);
  assert.doesNotMatch(match[0], /liveDirector\\.advancePhrase\\(\\)/);
  assert.match(source, /allowStateChange: canCommitLiveFrameAtStep/);
}});
'''
write("static/js/sonify/coherence-cache.test.js", test_content)

print("System SYMPHONY follow-up patch applied successfully")
