#!/usr/bin/env python3
"""Apply the reviewed Atlas APU production integration to the rollout branch."""

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(
            f"{path}: expected one match, found {count}: {old[:100]!r}"
        )
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


ui = "static/js/sonify/ui.js"
replace_once(
    ui,
    '} from "./engine.js?v=20260720-system-symphony-loop-production-v2";',
    '} from "./apu-production-engine.js?v=20260726-system-symphony-atlas-apu-live-v1";',
)
replace_once(
    ui,
    'import { createPoller } from "./poller.js?v=20260720-system-symphony-loop-production-v2";\n',
    'import { createPoller } from "./poller.js?v=20260720-system-symphony-loop-production-v2";\n'
    'import { buildHybridFrame } from "./apu-hybrid-state.js?v=20260726-system-symphony-evidence-hybrid-v1";\n',
)
replace_once(ui, "Live estate generative score", "Live estate Atlas APU score")
replace_once(ui, "Ghost Circuit demo", "Atlas APU audition")
replace_once(
    ui,
    "Ghost Circuit // performance v2",
    "Atlas APU // deterministic state audition",
)
replace_once(
    ui,
    '<span>Healthy</span><strong>Night Drive</strong>',
    '<span>Healthy</span><strong>Explorer</strong>',
)
replace_once(
    ui,
    '<span>Critical</span><strong>Redline Protocol</strong>',
    '<span>Critical</span><strong>Boss Protocol</strong>',
)
replace_once(
    ui,
    '<span>Unknown</span><strong>Ghost Signal</strong>',
    '<span>Unknown</span><strong>Lost Signal</strong>',
)
replace_once(
    ui,
    'class="symphony-performance__macros"',
    'class="symphony-performance__macros" hidden',
)
replace_once(
    ui,
    'class="symphony-ghost-monitor"',
    'class="symphony-ghost-monitor" hidden',
)
replace_once(
    ui,
    'class="symphony-performance__actions"',
    'class="symphony-performance__actions" hidden',
)

old_metrics = '''          <section class="symphony-metrics" aria-label="Estate metrics">
            <article><span>Score state</span><strong data-metric="state">Unknown</strong></article>
            <article><span>Overall health</span><strong data-metric="health">unknown</strong></article>
            <article><span>Total components</span><strong data-metric="total">0</strong></article>
            <article><span>Measured</span><strong data-metric="measured">0</strong></article>
            <article><span>Warnings</span><strong data-metric="warnings">0</strong></article>
            <article><span>Failures / incidents</span><strong data-metric="failures">0 / 0</strong></article>
            <article><span>Unknown</span><strong data-metric="unknown">0</strong></article>
            <article><span>Unmeasured</span><strong data-metric="unmeasured">0</strong></article>
            <article class="symphony-metric-deploy"><span>Recent deployment</span><strong data-metric="deployment">baseline pending</strong></article>
          </section>
'''
new_metrics = old_metrics + '''
          <section class="symphony-hybrid-state" aria-labelledby="symphony-hybrid-state-title" data-hybrid-state>
            <div class="symphony-hybrid-state__head">
              <div><span>Hybrid score vector</span><h3 id="symphony-hybrid-state-title">One grammar, four audible layers</h3></div>
              <p data-dominant-reason>Waiting for the first evidence frame.</p>
            </div>
            <div class="symphony-state-vector" role="group" aria-label="Current Atlas APU state weights">
              <article class="symphony-state-weight" data-state="healthy"><span>Healthy / Explorer</span><strong data-state-weight="healthy">0%</strong></article>
              <article class="symphony-state-weight" data-state="warning"><span>Warning / Grid Pressure</span><strong data-state-weight="warning">0%</strong></article>
              <article class="symphony-state-weight" data-state="critical"><span>Critical / Boss Protocol</span><strong data-state-weight="critical">0%</strong></article>
              <article class="symphony-state-weight" data-state="unknown"><span>Unknown / Lost Signal</span><strong data-state-weight="unknown">100%</strong></article>
            </div>
          </section>
'''
replace_once(ui, old_metrics, new_metrics)

replace_once(
    ui,
    '''  function sourceState(frame = currentFrame) {
    if (mode === "demo") return { key: "demo", label: "DEMO / SIMULATED" };
    if (frame?.stale) return { key: "stale", label: "LIVE DATA STALE" };
    if (lastLiveFrame) return { key: "live", label: "LIVE" };
    return { key: "connecting", label: "CONNECTING" };
  }
''',
    '''  function sourceState(frame = currentFrame) {
    if (mode === "demo") return { key: "demo", label: "DEMO / SIMULATED" };
    if (frame?.evidenceMode === "preview") return { key: "preview", label: "PREVIEW FIXTURE" };
    if (frame?.stale) return { key: "stale", label: "LIVE DATA STALE" };
    if (lastLiveFrame) return { key: "live", label: "LIVE" };
    return { key: "connecting", label: "CONNECTING" };
  }
''',
)
replace_once(
    ui,
    '''  function presentationForVoice(voice) {
    if (!voice.measured && !voice.demoSimulated) {
      return { key: "unmeasured", label: "Unmeasured" };
    }
    return {
      key: voice.status,
      label: STATUS_LABELS[voice.status] ?? STATUS_LABELS.unknown,
    };
  }
''',
    '''  function presentationForVoice(voice) {
    if (voice.evidenceState === "topology-only") {
      return { key: "unmeasured", label: "Unmeasured" };
    }
    if (voice.evidenceState === "reported-unknown" || voice.evidenceState === "stale") {
      return { key: "unknown", label: STATUS_LABELS.unknown };
    }
    if (!voice.measured && !voice.demoSimulated) {
      return { key: "unmeasured", label: "Unmeasured" };
    }
    return {
      key: voice.status,
      label: STATUS_LABELS[voice.status] ?? STATUS_LABELS.unknown,
    };
  }
''',
)
replace_once(
    ui,
    '        voice.demoSimulated ? "preview simulation" : voice.measured ? "measured" : "topology only",',
    '        voice.evidenceLabel ?? (voice.demoSimulated ? "Simulated profile" : voice.measured ? "Current measurement" : "Topology only"),',
)
replace_once(
    ui,
    '''        voice.demoSimulated
          ? "Simulated preview"
          : voice.measured
            ? "Measured by /sonify"
            : "Topology only / unmeasured",''',
    '''        voice.evidenceLabel
          ?? (voice.demoSimulated
            ? "Simulated profile"
            : voice.measured
              ? "Current measurement"
              : "Topology only / unmeasured"),''',
)

hybrid_renderer = '''  function renderHybridState(frame) {
    const weights = frame?.stateVector ?? { healthy: 0, warning: 0, critical: 0, unknown: 1 };
    for (const state of ["healthy", "warning", "critical", "unknown"]) {
      const node = host.querySelector(`[data-state-weight="${state}"]`);
      if (node) node.textContent = `${Math.round((Number(weights[state]) || 0) * 100)}%`;
    }
    const panel = host.querySelector("[data-hybrid-state]");
    if (panel) panel.dataset.dominant = frame?.scoreState ?? "unknown";
    const reason = host.querySelector("[data-dominant-reason]");
    if (reason) {
      reason.textContent = frame?.dominantStateReason
        ?? "Unknown supplies the safe harmonic grammar until current evidence arrives.";
    }
  }

'''
replace_once(
    ui,
    "  function renderMetrics(frame) {\n",
    hybrid_renderer + "  function renderMetrics(frame) {\n",
)
replace_once(
    ui,
    '    metricValue(host, "deployment", deploymentText);\n  }\n',
    '    metricValue(host, "deployment", deploymentText);\n    renderHybridState(frame);\n  }\n',
)

replace_once(
    ui,
    '''    const palette = resolveSamplePalette(
      frame.scoreState,
      performanceArrangement,
      0,
    );
    const leadLabel = palette.lead ?? "procedural";
    const bassLabel = palette.bass?.replace(/^bass-/, "") ?? "procedural";
    const rhythmLabel = palette.bassLoop ?? "one-shot";
    const textureLabel = palette.atmosphere ?? "procedural";
    const arpLabel = performanceArrangement?.arpDirectionLabel ?? "seeded";
    const voicingLabel = performanceArrangement?.padVoicingLabel ?? "triad";
    host.querySelector("[data-performance-status]").textContent =
      `${performanceStatus} // ${palette.section} // arp ${arpLabel} // ${voicingLabel} pads // bass ${bassLabel} // rhythm ${rhythmLabel} // lead ${leadLabel} // texture ${textureLabel}`;
''',
    '''    const weights = frame.stateVector ?? { healthy: 0, warning: 0, critical: 0, unknown: 1 };
    const vectorLabel = ["healthy", "warning", "critical", "unknown"]
      .map((state) => `${state} ${Math.round((Number(weights[state]) || 0) * 100)}%`)
      .join(" / ");
    host.querySelector("[data-performance-status]").textContent =
      `${performanceStatus} // ${vectorLabel} // ${frame.dominantStateReason ?? "deterministic state audition"}`;
''',
)
replace_once(
    ui,
    '''  function currentDemoFrame() {
    return demoMerged ? computeFrame(demoMerged) : null;
  }
''',
    '''  function currentDemoFrame() {
    if (!demoMerged) return null;
    return buildHybridFrame(computeFrame(demoMerged), {
      ...demoMerged,
      stale: false,
    });
  }
''',
)
replace_once(
    ui,
    '''        host.querySelector("[data-important-status]").textContent =
          "Loading hybrid instrument library…";
        await startPromise;
        const stats = engine.getSampleLoadStats();
        host.querySelector("[data-important-status]").textContent = engine.isSampleReady()
          ? stats?.backgroundComplete
            ? `Full hybrid instrument ready: ${stats.loaded}/${stats.totalAssets} assets.`
            : "Core hybrid instrument ready. Lead and atmosphere textures are loading."
          : "Sample library unavailable. Procedural fallback is active.";
''',
    '''        host.querySelector("[data-important-status]").textContent =
          "Initialising the sample-free Atlas APU…";
        await startPromise;
        host.querySelector("[data-important-status]").textContent =
          "Atlas APU ready: six procedural roles, zero streamed or decoded audio assets.";
''',
)
replace_once(
    ui,
    '''  engine.setSampleLoadHandler((stats) => {
    const status = host.querySelector("[data-important-status]");
    if (!status) return;
    if (stats.backgroundComplete) {
      status.textContent = stats.failed > 0
        ? `Hybrid instrument ready: ${stats.loaded}/${stats.totalAssets} assets, ${stats.failed} procedural fallbacks.`
        : stats.fallbacks > 0
          ? `Full hybrid instrument ready: ${stats.loaded}/${stats.totalAssets} assets, ${stats.fallbacks} codec fallbacks.`
          : `Full hybrid instrument ready: ${stats.loaded}/${stats.totalAssets} assets.`;
      return;
    }
    status.textContent = stats.coreReady
      ? `Core hybrid instrument ready. Textures ${stats.completed}/${stats.totalAssets}; ${stats.failed} fallbacks.`
      : stats.failed > 0
        ? `Loading core instrument: ${stats.loaded} ready, ${stats.failed} using fallback.`
        : `Loading core instrument: ${stats.loaded}/${stats.requested} ready.`;
  });
''',
    '''  engine.setSampleLoadHandler(() => {
    const status = host.querySelector("[data-important-status]");
    if (status && engine.isRunning()) {
      status.textContent = "Atlas APU ready: six procedural roles, zero streamed or decoded audio assets.";
    }
  });
''',
)
replace_once(
    ui,
    '''    onFrame(frame, info) {
      lastLiveFrame = frame;
      lastLiveMerged = clone(info.merged);
      latestDeployment = info.deployment ?? latestDeployment;
      host.querySelector("[data-demo-mode]").disabled = false;
      if (mode === "live") {
        applyAndRender(frame);
        if (info.newIncidents > 0) {
          engine.queueIncidentAccent(info.newIncidents);
        }
      }
    },
''',
    '''    onFrame(frame, info) {
      const hybridFrame = buildHybridFrame(frame, info.merged);
      lastLiveFrame = hybridFrame;
      lastLiveMerged = clone(info.merged);
      latestDeployment = info.deployment ?? latestDeployment;
      host.querySelector("[data-demo-mode]").disabled = false;
      if (mode === "live") {
        applyAndRender(hybridFrame);
        if (info.newIncidents > 0) {
          engine.queueIncidentAccent(info.newIncidents);
        }
      }
    },
''',
)
replace_once(
    ui,
    '  const initialFrame = computeFrame({ stale: true, services: [] });\n  applyAndRender(initialFrame);\n',
    '  const initialMerged = { stale: true, services: [] };\n'
    '  const initialFrame = buildHybridFrame(computeFrame(initialMerged), initialMerged);\n'
    '  applyAndRender(initialFrame);\n',
)
replace_once(
    ui,
    "Browser-only performance mode. Scenes, macros and score seeds reshape the local composition while live telemetry continues unchanged underneath.",
    "Browser-only Atlas APU audition. State profiles reshape only the local score while live telemetry continues unchanged underneath.",
)

page_js = "lab/system-symphony/system-symphony-page.js"
replace_once(
    page_js,
    'import "../../static/js/sonify/ui.js?v=20260720-system-symphony-loop-production-v2";',
    'import "../../static/js/sonify/ui.js?v=20260726-system-symphony-atlas-apu-live-v1";',
)
replace_once(
    page_js,
    "const PAGE_OUTPUT_GAIN_PERCENT = 50;",
    "const PAGE_OUTPUT_GAIN_PERCENT = 70;",
)
replace_once(
    page_js,
    "Initialising the existing System Symphony engine.",
    "Initialising the Atlas APU renderer and preserved topology interface.",
)

page_html = "lab/system-symphony/index.html"
replace_once(
    page_html,
    '<link rel="stylesheet" href="/static/css/system-symphony.css?v=20260718-system-symphony-ghost-mix">',
    '<link rel="stylesheet" href="/static/css/system-symphony.css?v=20260718-system-symphony-ghost-mix">\n'
    '  <link rel="stylesheet" href="/static/css/system-symphony-apu-live.css?v=20260726-atlas-apu-live-v1">',
)
replace_once(
    page_html,
    "System Symphony maps a fixed public health frame, service identity, dependency topology, incidents, and successful deployments into a generative score.",
    "System Symphony maps bounded public evidence, service identity, dependency topology, incidents, and successful deployments into a hybrid Atlas APU score.",
)
replace_once(
    page_html,
    "Initialising the existing System Symphony engine.",
    "Initialising the Atlas APU renderer and preserved topology interface.",
)
replace_once(
    page_html,
    "/lab/system-symphony/system-symphony-page.js?v=20260725-batch-h-live-data",
    "/lab/system-symphony/system-symphony-page.js?v=20260726-atlas-apu-live-v1",
)

smoke = "scripts/smoke_system_symphony_preview.mjs"
replace_once(
    smoke,
    "const requestFailures = [];\n",
    "const requestFailures = [];\nconst audioRequests = [];\n",
)
replace_once(
    smoke,
    'page.on("requestfailed", (request) => {\n',
    'page.on("request", (request) => {\n'
    '  if (/\\.(?:wav|mp3|m4a|aac|ogg|opus|flac)(?:\\?|$)/i.test(request.url())) {\n'
    '    audioRequests.push(request.url());\n'
    '  }\n'
    '});\n'
    'page.on("requestfailed", (request) => {\n',
)
replace_once(
    smoke,
    '      samplePalette: window.__symphonyEngine?.getSamplePalette?.() ?? null,\n',
    '      buildId: window.__ATLAS_SYSTEM_SYMPHONY_BUILD__ ?? null,\n'
    '      documentBuild: document.documentElement.dataset.systemSymphonyBuild ?? null,\n'
    '      samplePalette: window.__symphonyEngine?.getSamplePalette?.() ?? null,\n'
    '      composition: window.__symphonyEngine?.getCompositionSnapshot?.() ?? null,\n'
    '      topologyNodes: host?.querySelectorAll("[data-node]").length ?? 0,\n'
    '      serviceRows: host?.querySelectorAll("[data-service-table] tr").length ?? 0,\n'
    '      stateWeightCards: host?.querySelectorAll("[data-state-weight]").length ?? 0,\n'
    '      dominantReason: host?.querySelector("[data-dominant-reason]")?.textContent?.trim() ?? null,\n',
)
replace_once(
    smoke,
    '''  assert.equal(audioState.sampleStats?.coreReady, true, JSON.stringify(audioState, null, 2));
  assert.equal(audioState.sampleStats?.failed, 0, JSON.stringify(audioState, null, 2));
  assert.equal(audioState.sampleStats?.loaded, audioState.sampleStats?.totalAssets, JSON.stringify(audioState, null, 2));
  assert.equal(audioState.samplePalette?.lead, "acid-synth", JSON.stringify(audioState, null, 2));
  assert.notEqual(audioState.samplePalette?.lead, "wobbly-synth");
  assert.notEqual(audioState.samplePalette?.bass, "bass-transformer");
  assert.notEqual(audioState.samplePalette?.bass, "bass-angry");
  assert.ok(audioState.samplePalette?.bassLoop, JSON.stringify(audioState, null, 2));
  assert.equal(audioState.pageOutputGain, 50);
  assert.ok(audioState.sliderValues.length >= 2);
  assert.ok(audioState.sliderValues.every((value) => value === 50));
''',
    '''  assert.match(audioState.buildId ?? "", /atlas-apu-live-v1$/);
  assert.equal(audioState.documentBuild, audioState.buildId);
  assert.equal(audioState.sampleStats?.coreReady, true, JSON.stringify(audioState, null, 2));
  assert.equal(audioState.sampleStats?.sampleFree, true, JSON.stringify(audioState, null, 2));
  assert.equal(audioState.sampleStats?.failed, 0, JSON.stringify(audioState, null, 2));
  assert.equal(audioState.sampleStats?.loaded, 0, JSON.stringify(audioState, null, 2));
  assert.equal(audioState.sampleStats?.totalAssets, 0, JSON.stringify(audioState, null, 2));
  assert.equal(audioState.samplePalette?.lead, "pulse-a", JSON.stringify(audioState, null, 2));
  assert.equal(audioState.samplePalette?.bass, "triangle", JSON.stringify(audioState, null, 2));
  assert.equal(audioState.samplePalette?.section, "sample-free", JSON.stringify(audioState, null, 2));
  assert.equal(audioState.samplePalette?.bassLoop, null);
  assert.ok(audioState.composition?.arrangement?.section, JSON.stringify(audioState, null, 2));
  assert.ok(audioState.topologyNodes > 0, JSON.stringify(audioState, null, 2));
  assert.ok(audioState.serviceRows > 0, JSON.stringify(audioState, null, 2));
  assert.equal(audioState.stateWeightCards, 4);
  assert.ok(audioState.dominantReason, JSON.stringify(audioState, null, 2));
  assert.equal(audioState.pageOutputGain, 70);
  assert.ok(audioState.sliderValues.length >= 2);
  assert.ok(audioState.sliderValues.every((value) => value === 70));
  assert.deepEqual(audioRequests, [], "the live-route APU requested an audio asset");
''',
)
replace_once(
    smoke,
    "    previewEvidence,\n    consoleMessages,",
    "    previewEvidence,\n    audioRequests,\n    consoleMessages,",
)
replace_once(
    smoke,
    "console.log(`System Symphony PR #43 mix preview passed: ${pageUrl}`);",
    "console.log(`System Symphony Atlas APU live-route preview passed: ${pageUrl}`);",
)

deploy = ".github/workflows/deploy.yml"
production_steps = '''
      - name: Check out production smoke tooling
        uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0, Node 24

      - name: Set up Node.js for production smoke
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0, Node 24
        with:
          node-version: "22"

      - name: Install pinned production browser tooling
        run: npm install --no-save --ignore-scripts playwright@1.61.1

      - name: Install Chromium for production smoke
        run: npx playwright install --with-deps chromium

      - name: Verify the live System Symphony Atlas APU and topology map
        env:
          EXPECTED_SHA: ${{ github.sha }}
          SITE_URL: https://atlas-systems.uk
          SYMPHONY_PRODUCTION_OUTPUT_DIR: ${{ runner.temp }}/system-symphony-production-smoke
        run: node scripts/smoke_system_symphony_production.mjs

      - name: Upload production System Symphony evidence
        if: always()
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1, Node 24
        with:
          name: system-symphony-production-smoke
          path: ${{ runner.temp }}/system-symphony-production-smoke
          if-no-files-found: error
          retention-days: 14
'''
replace_once(
    deploy,
    "\n  refresh-corpus:\n",
    production_steps + "\n  refresh-corpus:\n",
)
