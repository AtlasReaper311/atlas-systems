/**
 * SPECULUM / presentation polish v5
 *
 * Adds route-local presentation, export, and guided-trace completion behaviour.
 * It does not persist state, modify the topology, fetch evidence, or claim that
 * the explanatory trace represents a live execution.
 */

import { NODES, RING_ORDER } from './topology.js';

const TAU = Math.PI * 2;
const RING_SCALE = Object.freeze({ 0: 0, 1: 0.32, 2: 0.62, 3: 0.86, 4: 1 });
const TRACE_IDS = Object.freeze([
  'SPECULAR-CORE',
  'specular-telemetry',
  'specular-edge',
  'atlas-api-public',
  'atlas-systems',
]);
const PRESENTATION_EXIT_DISTANCE = 28;
const PRESENTATION_ARM_MS = 800;
const TRACE_VISIBLE_MS = 2600;

function hashUnit(id) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function utcFilename() {
  const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('-', '').replace(/\.\d{3}Z$/, 'Z');
  return `speculum-${stamp}.png`;
}

function canvasLayout(canvas) {
  const width = Math.max(320, canvas.clientWidth);
  const height = Math.max(320, canvas.clientHeight);
  const centreX = width / 2;
  const centreY = height / 2;
  const radius = Math.min(width, height) / 2 - (width < 620 ? 34 : 74);
  const positions = new Map([['atlas-systems', { x: centreX, y: centreY }]]);

  Object.keys(RING_ORDER).forEach((key) => {
    const ring = Number(key);
    const ids = RING_ORDER[key];
    if (!Array.isArray(ids) || ids.length === 0 || ring === 0) return;
    const ringRadius = radius * (RING_SCALE[ring] ?? 1);
    const offset = ring === 4 ? -0.18 : hashUnit(`ring${ring}`) * TAU;
    ids.forEach((id, index) => {
      const angle = offset + (index / ids.length) * TAU;
      positions.set(id, {
        x: centreX + Math.cos(angle) * ringRadius,
        y: centreY + Math.sin(angle) * ringRadius,
      });
    });
  });

  return { width, height, centreX, centreY, positions };
}

function tracePath(layout) {
  const points = TRACE_IDS.map((id) => layout.positions.get(id)).filter(Boolean);
  if (points.length < 2) return '';
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const controlX = midX + (layout.centreX - midX) * 0.12;
    const controlY = midY + (layout.centreY - midY) * 0.12;
    path += ` Q ${controlX.toFixed(2)} ${controlY.toFixed(2)} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
  }
  return path;
}

export function mountSpeculumPolish(root) {
  if (!root) return null;
  const canvas = root.querySelector('#spc-canvas');
  const presentButton = root.querySelector('#spc-present');
  const exportButton = root.querySelector('#spc-export');
  const status = root.querySelector('#spc-polish-status');
  const detail = root.querySelector('#spc-detail');
  const traceOverlay = root.querySelector('#spc-trace-completion');
  if (!(canvas instanceof HTMLCanvasElement)) return null;

  const controller = new AbortController();
  const { signal } = controller;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let presenting = false;
  let presentationReadyAt = 0;
  let presentationOrigin = null;
  let traceComplete = false;
  let traceTimer = 0;

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function setPresenting(value, options = {}) {
    presenting = Boolean(value);
    root.classList.toggle('is-presenting', presenting);
    document.body.classList.toggle('spc-presentation', presenting);
    if (presentButton) {
      presentButton.setAttribute('aria-pressed', String(presenting));
      presentButton.textContent = presenting ? 'Exit presentation' : 'Presentation';
    }
    presentationReadyAt = performance.now() + PRESENTATION_ARM_MS;
    presentationOrigin = null;
    setStatus(presenting ? 'Presentation mode. Move the pointer or press Escape to restore the rail.' : '');
    window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    if (!presenting && options.focus !== false) presentButton?.focus();
  }

  function completionMarkup() {
    const layout = canvasLayout(canvas);
    const path = tracePath(layout);
    const arrival = layout.positions.get('atlas-systems');
    if (!path || !arrival) return '';
    const safePath = escapeXml(path);
    return `
      <svg viewBox="0 0 ${layout.width.toFixed(2)} ${layout.height.toFixed(2)}" preserveAspectRatio="none" aria-hidden="true">
        <path class="spc-trace-base" d="${safePath}"></path>
        <path class="spc-trace-pulse" d="${safePath}"></path>
        <rect class="spc-trace-arrival" x="${(arrival.x - 10).toFixed(2)}" y="${(arrival.y - 10).toFixed(2)}" width="20" height="20"></rect>
      </svg>`;
  }

  function sizeCompletionPath() {
    if (!traceOverlay) return;
    const path = traceOverlay.querySelector('.spc-trace-pulse');
    if (!(path instanceof SVGPathElement)) return;
    const length = Math.max(1, path.getTotalLength());
    path.style.setProperty('--spc-path-length', String(length));
    path.style.setProperty('--spc-pulse-length', String(Math.max(18, length * 0.11)));
  }

  function hideTraceCompletion() {
    if (!traceOverlay) return;
    traceOverlay.classList.remove('is-active');
    if (traceTimer) window.clearTimeout(traceTimer);
    traceTimer = 0;
  }

  function showTraceCompletion() {
    if (!traceOverlay) return;
    if (traceTimer) window.clearTimeout(traceTimer);
    traceOverlay.innerHTML = completionMarkup();
    sizeCompletionPath();
    traceOverlay.classList.remove('is-active');
    void traceOverlay.offsetWidth;
    traceOverlay.classList.add('is-active');
    setStatus('Guided trace complete. The highlighted path is generated explanation, not live execution evidence.');
    traceTimer = window.setTimeout(() => {
      traceOverlay.classList.remove('is-active');
      traceTimer = 0;
    }, reducedMotion.matches ? 1400 : TRACE_VISIBLE_MS);
  }

  async function exportFrame() {
    if (!exportButton) return;
    exportButton.disabled = true;
    exportButton.textContent = 'Exporting';
    setStatus('Preparing the current canvas frame.');
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    try {
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => {
          if (value) resolve(value);
          else reject(new Error('Canvas export returned no image data.'));
        }, 'image/png');
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = utcFilename();
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('PNG frame exported from the current browser canvas.');
    } catch (error) {
      console.error('speculum: frame export failed', error);
      setStatus('Frame export failed in this browser.');
    } finally {
      exportButton.disabled = false;
      exportButton.textContent = 'Export frame';
    }
  }

  presentButton?.addEventListener('click', () => setPresenting(!presenting), { signal });
  exportButton?.addEventListener('click', exportFrame, { signal });

  root.addEventListener('pointermove', (event) => {
    if (!presenting || event.pointerType !== 'mouse' || performance.now() < presentationReadyAt) return;
    if (!presentationOrigin) {
      presentationOrigin = { x: event.clientX, y: event.clientY };
      return;
    }
    const distance = Math.hypot(event.clientX - presentationOrigin.x, event.clientY - presentationOrigin.y);
    if (distance >= PRESENTATION_EXIT_DISTANCE) setPresenting(false, { focus: false });
  }, { signal });

  window.addEventListener('keydown', (event) => {
    if (!presenting || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setPresenting(false);
  }, { signal, capture: true });

  const detailObserver = detail ? new MutationObserver(() => {
    const badge = detail.querySelector('.dossier-badge.is-trace');
    const complete = badge?.textContent?.trim() === `step ${TRACE_IDS.length}/${TRACE_IDS.length}`;
    if (complete && !traceComplete) showTraceCompletion();
    if (!complete && traceComplete) hideTraceCompletion();
    traceComplete = Boolean(complete);
  }) : null;
  detailObserver?.observe(detail, { childList: true, subtree: true, characterData: true });

  const resizeObserver = new ResizeObserver(() => {
    if (!traceOverlay?.classList.contains('is-active')) return;
    traceOverlay.innerHTML = completionMarkup();
    sizeCompletionPath();
  });
  resizeObserver.observe(canvas);

  return {
    setPresenting,
    exportFrame,
    showTraceCompletion,
    destroy() {
      controller.abort();
      detailObserver?.disconnect();
      resizeObserver.disconnect();
      if (traceTimer) window.clearTimeout(traceTimer);
      root.classList.remove('is-presenting');
      document.body.classList.remove('spc-presentation');
    },
  };
}

function boot() {
  const root = document.getElementById('speculum');
  if (root) mountSpeculumPolish(root);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
