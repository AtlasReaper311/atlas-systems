import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const html = read('lab/speculum/index.html');
const css = read('lab/speculum/speculum-polish-v5.css');
const js = read('lab/speculum/speculum-polish-v5.js');
const evidence = read('scripts/capture_speculum_evidence.mjs');
const workflow = read('.github/workflows/speculum-preview-evidence.yml');

test('Speculum exposes bounded presentation and frame export controls', () => {
  assert.match(html, /id="spc-present"[^>]*aria-pressed="false"/);
  assert.match(html, /id="spc-export"/);
  assert.match(html, /id="spc-polish-status"[^>]*aria-live="polite"/);
  assert.match(html, /id="spc-trace-completion"[^>]*aria-hidden="true"/);
  assert.match(html, /speculum-polish-v5\.css\?v=20260727-polish-v5/);
  assert.match(html, /speculum-polish-v5\.js\?v=20260728-interaction-v6/);
  assert.match(html, /speculum-interaction-v6\.js\?v=20260728-interaction-v6/);
  assert.match(css, /\.reduced\[hidden\]\s*\{[\s\S]*display:\s*none\s*!important/);
});

test('rail regions remain in strict flow and presentation mode expands the field', () => {
  assert.match(css, /\.rail\s*\{[\s\S]*display:\s*flex\s*!important/);
  assert.match(css, /\.controls\s*\{[\s\S]*max-height:\s*39%[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /\.detail\s*\{[\s\S]*max-height:\s*none\s*!important[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /\.field\.is-presenting\s+\.rail,[\s\S]*\.field\.is-presenting\s+\.field-keys\s*\{[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.controls,[\s\S]*\.detail,[\s\S]*\.ledger-wrap[\s\S]*overflow:\s*visible/);
  assert.match(css, /@media \(max-width: 353px\)[\s\S]*width:\s*calc\(100% \+ 32px\)[\s\S]*border-left:\s*0[\s\S]*border-right:\s*0/);
});

test('pointer input is mapped into the canvas logical coordinate system', () => {
  assert.match(js, /function remapPointerEvent\(event\)/);
  assert.match(js, /logicalWidth = canvas\.width \/ dpr/);
  assert.match(js, /logicalHeight = canvas\.height \/ dpr/);
  assert.match(js, /clientX: rect\.left \+ \(event\.clientX - rect\.left\) \* scaleX/);
  assert.match(js, /clientY: rect\.top \+ \(event\.clientY - rect\.top\) \* scaleY/);
  assert.match(js, /canvas\.addEventListener\('pointerdown', remapPointerEvent, \{ signal, capture: true \}\)/);
});

test('completion pulse is restrained and honours reduced motion', () => {
  assert.match(css, /@keyframes spc-trace-travel/);
  assert.match(css, /@keyframes spc-trace-arrival/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none/);
  assert.match(js, /TRACE_VISIBLE_MS = 2600/);
  assert.match(js, /not live execution evidence/);
  assert.match(js, /MutationObserver/);
  assert.match(js, /ResizeObserver/);
});

test('frame export remains browser-local and no shareable state is introduced', () => {
  assert.match(js, /canvas\.toBlob/);
  assert.match(js, /URL\.createObjectURL/);
  assert.match(js, /download = utcFilename\(\)/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|history\.|location\.(?:hash|search)|URLSearchParams/);
  assert.doesNotMatch(js, /fetch\s*\(/);
});

test('browser evidence covers viewports, zoom, reduced motion, dossier, ledger, trace, presentation and export', () => {
  for (const width of ['320', '375', '768', '1024', '1440']) assert.match(evidence, new RegExp(`width: ${width}`));
  assert.match(evidence, /text-200/);
  assert.match(evidence, /browser-zoom-200/);
  assert.match(evidence, /deviceScaleFactor:\s*2/);
  assert.match(evidence, /reducedMotion:\s*'reduce'/);
  assert.match(evidence, /openCentreDossier/);
  assert.match(evidence, /populateLedger/);
  assert.match(evidence, /verifyPresentation/);
  assert.match(evidence, /verifyExport/);
  assert.match(evidence, /verifyTraceCompletion/);
  assert.match(evidence, /controlsOverlapDetail/);
  assert.match(evidence, /detailOverlapLedger/);
  assert.match(evidence, /waitFor\(\{ state: 'attached' \}\)/);
  assert.match(evidence, /getBoundingClientRect\(\)/);
  assert.doesNotMatch(evidence, /#spc-canvas'\)\.waitFor\(\{ state: 'visible' \}\)/);
});

test('focused preview workflow runs and retains Speculum evidence', () => {
  assert.match(workflow, /lab\/speculum\/\*\*/);
  assert.match(workflow, /scripts\/capture_speculum_evidence\.mjs/);
  assert.match(workflow, /node --check scripts\/capture_speculum_evidence\.mjs/);
  assert.match(workflow, /playwright install --with-deps chromium firefox/);
  assert.match(workflow, /Capture stateful viewport matrix/);
  assert.match(workflow, /name: speculum-preview-evidence/);
});
