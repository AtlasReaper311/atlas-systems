/**
 * SPECULUM / boot
 *
 * Wires the deterministic engine to the route, including the grouped ledger,
 * node dossier, evidence controls, and one guided relationship trace.
 */

import { NODES, RING_ORDER, SNAPSHOT, formatPeriod, summarise } from './topology.js';
import { createEngine } from './engine.js';
import { mountLabSound } from '../shared/lab-explore-sound.js?v=20260811-sound-v4';

const SPEEDS = [
  { value: 1, label: 'Real · 1×', hint: 'Real · literal cadence. Most weekly movement is imperceptible.' },
  { value: 60, label: 'Observe · 60×', hint: 'Observe · one simulated minute per second.' },
  { value: 3600, label: 'Sweep · 3600×', hint: 'Sweep · one simulated hour per second. Repeated ledger paths are grouped.' },
  { value: 86400, label: 'Week · 86400×', hint: 'Week · one simulated day per second. High-frequency observations are grouped.' },
];

const TRACE = Object.freeze({
  ids: ['SPECULAR-CORE', 'specular-telemetry', 'specular-edge', 'atlas-api-public', 'atlas-systems'],
  steps: [
    {
      title: 'Local source',
      copy: 'SPECULAR-CORE hosts the local telemetry, model, corpus, memory, and automation services represented in this public snapshot.',
    },
    {
      title: 'Sample the machine',
      copy: 'specular-telemetry observes the host and Ollama on its verified thirty-second sampler.',
    },
    {
      title: 'Project to the edge',
      copy: 'specular-edge exposes a read-only, last-known-good projection of the local telemetry surface.',
    },
    {
      title: 'Evaluate the public spine',
      copy: 'atlas-api-public includes specular-edge in its reviewed ten-minute reliability evaluation.',
    },
    {
      title: 'Reach the portfolio',
      copy: 'atlas-systems reads the public API projection. This trace explains declared relationships; it does not claim a live run occurred.',
    },
  ],
});

const LEDGER_MAX = 60;
const BUFFER_MAX = 600;
const FLUSH_MS = 180;
const TRACE_MS = 1400;

function el(id) {
  return document.getElementById(id);
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatClock(epochMs) {
  const date = new Date(epochMs);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} `
    + `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}Z`;
}

function scheduleLabel(entry) {
  if (entry.cadence > 0) return `${entry.cadenceKind} every ${formatPeriod(entry.cadence)}`;
  const labels = {
    request: 'request-driven',
    event: 'event-driven',
    manual: 'manual',
    boot: 'boot-triggered',
    continuous: 'continuous host process',
    external: 'external dependency',
  };
  return labels[entry.cadenceKind] || 'not periodic';
}

function setPressed(button, value) {
  if (button) button.setAttribute('aria-pressed', String(Boolean(value)));
}

function appendText(parent, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

export function mount(root) {
  const canvas = root.querySelector('canvas');
  if (!canvas) return null;

  const controller = new AbortController();
  const { signal } = controller;
  const engine = createEngine(canvas, NODES, RING_ORDER);
  const stats = summarise(NODES);
  let startEpoch = Date.now();

  const statsEl = el('spc-stats');
  if (statsEl) {
    statsEl.textContent = [
      `${stats.nodes} public nodes`,
      `${stats.emitters} periodic emitters`,
      `${stats.gazes} attention edges`,
      `${stats.conduits} report paths`,
      `${stats.assumed} assumed periods`,
      `reviewed ${SNAPSHOT.reviewedAt}`,
    ].join('  ·  ');
  }

  const ledger = el('spc-ledger');
  const ledgerContext = el('spc-ledger-context');
  const ledgerAllButton = el('spc-ledger-all');
  const ledgerFocusButton = el('spc-ledger-focus');
  const ledgerPauseButton = el('spc-ledger-pause');
  const buffer = [];
  let ledgerEntries = [];
  let ledgerFilter = 'all';
  let ledgerPaused = false;
  let seen = 0;

  function ledgerFocusIds() {
    const activeTrace = engine.getTrace();
    if (activeTrace) return new Set(activeTrace.ids.slice(0, activeTrace.index + 1));
    const pinned = engine.getPinned();
    return pinned ? new Set([pinned]) : null;
  }

  function setLedgerFilter(next) {
    ledgerFilter = next === 'focus' ? 'focus' : 'all';
    setPressed(ledgerAllButton, ledgerFilter === 'all');
    setPressed(ledgerFocusButton, ledgerFilter === 'focus');
    renderLedger();
  }

  function renderLedger() {
    if (!ledger) return;
    const focusIds = ledgerFocusIds();
    if (ledgerFocusButton) ledgerFocusButton.disabled = !focusIds;
    const visible = ledgerEntries.filter((entry) => {
      if (ledgerFilter !== 'focus') return true;
      return focusIds ? focusIds.has(entry.fromId) || focusIds.has(entry.toId) : false;
    });

    ledger.textContent = '';
    if (ledgerContext) {
      if (ledgerPaused) ledgerContext.textContent = 'Feed paused · simulation continues · buffered observations remain bounded';
      else if (ledgerFilter === 'focus' && focusIds) ledgerContext.textContent = 'Focused relationships · repeated paths are grouped';
      else if (ledgerFilter === 'focus') ledgerContext.textContent = 'Pin a node or run the guided trace to filter the ledger';
      else ledgerContext.textContent = 'All generated observations · repeated paths are grouped';
    }

    if (visible.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'ledger-empty';
      empty.textContent = ledgerFilter === 'focus'
        ? 'No grouped observations involve the current focus yet.'
        : 'The simulation has not generated an observation yet.';
      ledger.appendChild(empty);
      return;
    }

    visible.forEach((entry, index) => {
      const li = document.createElement('li');
      if (index === 0) li.className = 'is-newest';
      const time = document.createElement('span');
      time.className = 'spc-t';
      time.textContent = formatClock(entry.at).slice(11, 19);
      const path = document.createElement('span');
      path.className = 'spc-path';
      path.textContent = `${entry.fromLabel} → ${entry.toLabel}`;
      li.appendChild(time);
      li.appendChild(path);
      if (entry.count > 1) {
        const count = document.createElement('span');
        count.className = 'spc-count-badge';
        count.textContent = `×${entry.count.toLocaleString('en-GB')}`;
        li.appendChild(count);
      }
      ledger.appendChild(li);
    });
  }

  function mergeBufferedObservations() {
    if (ledgerPaused || buffer.length === 0) return;
    const grouped = new Map();
    buffer.splice(0).forEach((entry) => {
      const existing = grouped.get(entry.key);
      if (existing) {
        existing.count += 1;
        existing.at = Math.max(existing.at, entry.at);
      } else {
        grouped.set(entry.key, { ...entry, count: 1 });
      }
    });

    Array.from(grouped.values())
      .sort((left, right) => right.at - left.at)
      .forEach((entry) => {
        const existingIndex = ledgerEntries.findIndex((candidate) => candidate.key === entry.key);
        if (existingIndex >= 0) {
          const existing = ledgerEntries.splice(existingIndex, 1)[0];
          entry.count += existing.count;
        }
        ledgerEntries.unshift(entry);
      });

    ledgerEntries = ledgerEntries
      .sort((left, right) => right.at - left.at)
      .slice(0, LEDGER_MAX);
    renderLedger();
  }

  const unsubscribeObservation = engine.on('observation', (from, to) => {
    seen += 1;
    buffer.push({
      key: `${from.id}->${to.id}`,
      fromId: from.id,
      toId: to.id,
      fromLabel: from.label,
      toLabel: to.label,
      at: startEpoch + engine.getSimTime() * 1000,
    });
    if (buffer.length > BUFFER_MAX) buffer.splice(0, buffer.length - BUFFER_MAX);
  });

  const clockEl = el('spc-clock');
  const countEl = el('spc-count');

  function tickReadouts() {
    if (clockEl) clockEl.textContent = formatClock(startEpoch + engine.getSimTime() * 1000);
    if (countEl) {
      const counters = engine.counters();
      countEl.textContent = `${seen.toLocaleString('en-GB')} generated observations  ·  `
        + `${counters.onProduct.toLocaleString('en-GB')} reached atlas-systems  ·  `
        + 'no live state';
    }
  }

  const readoutTimer = window.setInterval(() => {
    mergeBufferedObservations();
    tickReadouts();
  }, FLUSH_MS);

  const detail = el('spc-detail');
  let lastDetailKey = '\u0000';
  let traceIndex = null;
  let traceTimer = 0;

  function addDossierRow(grid, term, value, className) {
    const row = document.createElement('div');
    row.className = 'dossier-row';
    appendText(row, 'span', 'dossier-term', term);
    appendText(row, 'span', `dossier-value${className ? ` ${className}` : ''}`, value);
    grid.appendChild(row);
  }

  function relationButtons(title, ids) {
    if (!detail || ids.length === 0) return;
    const group = document.createElement('div');
    group.className = 'relation-group';
    appendText(group, 'p', 'spc-sub', title);
    const list = document.createElement('div');
    list.className = 'relation-list';
    ids.forEach((id) => {
      const node = engine.getNode(id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'relation-button';
      button.dataset.focusId = id;
      button.textContent = node ? node.label : id;
      list.appendChild(button);
    });
    group.appendChild(list);
    detail.appendChild(group);
  }

  function renderTraceDetail(activeTrace) {
    if (!detail) return;
    const step = TRACE.steps[activeTrace.index];
    const head = document.createElement('div');
    head.className = 'dossier-head';
    const titleWrap = document.createElement('div');
    appendText(titleWrap, 'h3', '', 'Guided trace');
    appendText(titleWrap, 'p', 'spc-meta', 'local telemetry → public portfolio');
    head.appendChild(titleWrap);
    const badges = document.createElement('div');
    badges.className = 'dossier-badges';
    appendText(badges, 'span', 'dossier-badge is-trace', `step ${activeTrace.index + 1}/${TRACE.ids.length}`);
    head.appendChild(badges);
    detail.appendChild(head);

    appendText(detail, 'p', 'trace-step', step.title);
    appendText(detail, 'p', 'trace-copy', step.copy);

    const progress = document.createElement('div');
    progress.className = 'trace-progress';
    TRACE.ids.forEach((_, index) => {
      const marker = document.createElement('span');
      if (index < activeTrace.index) marker.className = 'is-complete';
      if (index === activeTrace.index) marker.className = 'is-current';
      progress.appendChild(marker);
    });
    detail.appendChild(progress);

    const grid = document.createElement('div');
    grid.className = 'dossier-grid';
    addDossierRow(grid, 'Current node', (engine.getNode(TRACE.ids[activeTrace.index]) || {}).label || TRACE.ids[activeTrace.index]);
    addDossierRow(grid, 'Evidence', 'Declared relationships from the reviewed public snapshot');
    addDossierRow(grid, 'Boundary', 'Explanatory traversal · not a live execution claim');
    detail.appendChild(grid);

    const actions = document.createElement('div');
    actions.className = 'dossier-actions';
    const end = document.createElement('button');
    end.type = 'button';
    end.dataset.traceClear = 'true';
    end.textContent = 'End trace';
    actions.appendChild(end);
    detail.appendChild(actions);
  }

  function renderNodeDossier(id) {
    if (!detail) return;
    const node = engine.getNode(id);
    if (!node) return;
    const pinned = engine.getPinned() === id;
    const watchedBy = NODES.filter((candidate) => candidate.watches.includes(id));

    const head = document.createElement('div');
    head.className = 'dossier-head';
    const titleWrap = document.createElement('div');
    appendText(titleWrap, 'h3', '', node.label);
    appendText(titleWrap, 'p', 'spc-meta', `${node.kind} · ${node.lifecycle}`);
    head.appendChild(titleWrap);
    const badges = document.createElement('div');
    badges.className = 'dossier-badges';
    if (pinned) appendText(badges, 'span', 'dossier-badge is-pinned', 'pinned');
    if (node.state !== 'live') appendText(badges, 'span', 'dossier-badge', node.state);
    head.appendChild(badges);
    detail.appendChild(head);

    appendText(detail, 'p', 'spc-note', node.note);

    const grid = document.createElement('div');
    grid.className = 'dossier-grid';
    addDossierRow(grid, 'Operation', scheduleLabel(node));
    if (node.cadence > 0) {
      addDossierRow(
        grid,
        'Evidence',
        node.verified ? 'Schedule verified' : 'Schedule assumed',
        node.verified ? 'is-verified' : 'is-assumed',
      );
      if (node.source) addDossierRow(grid, 'Source', node.source);
    } else {
      addDossierRow(grid, 'Evidence', `Not applicable · ${scheduleLabel(node)}`);
    }
    addDossierRow(
      grid,
      'Relations',
      `${node.watches.length} observes · ${watchedBy.length} observed by · ${node.reports.length} reports to`,
    );
    detail.appendChild(grid);

    if (pinned) {
      const actions = document.createElement('div');
      actions.className = 'dossier-actions';
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.dataset.clearFocus = 'true';
      clear.textContent = 'Clear focus';
      actions.appendChild(clear);
      detail.appendChild(actions);
    }

    relationButtons('observes', node.watches);
    relationButtons('observed by', watchedBy.map((candidate) => candidate.id));
    relationButtons('reports to', node.reports);
  }

  function renderDetail(force = false) {
    if (!detail) return;
    const activeTrace = engine.getTrace();
    const id = engine.getHovered();
    const key = activeTrace ? `trace:${activeTrace.index}` : `node:${id || ''}:${engine.getPinned() || ''}`;
    if (!force && key === lastDetailKey) return;
    lastDetailKey = key;
    detail.textContent = '';

    if (activeTrace) {
      renderTraceDetail(activeTrace);
      return;
    }

    if (!id) {
      appendText(detail, 'p', 'spc-idle', 'Point at a node. Click to pin it.');
      appendText(
        detail,
        'p',
        'spc-idle-note',
        'Pinned focus reveals directional observation and report paths, filters the ledger, and makes neighbouring nodes selectable.',
      );
      return;
    }

    renderNodeDossier(id);
  }

  const detailTimer = window.setInterval(() => renderDetail(), 120);

  function clearTrace() {
    if (traceTimer) window.clearInterval(traceTimer);
    traceTimer = 0;
    traceIndex = null;
    engine.clearTrace();
    const button = el('spc-trace');
    if (button) button.textContent = 'Guided trace';
    lastDetailKey = '\u0000';
    renderDetail(true);
    renderLedger();
  }

  function startTrace() {
    if (traceTimer) window.clearInterval(traceTimer);
    traceIndex = 0;
    engine.setTrace(TRACE.ids, traceIndex);
    setLedgerFilter('focus');
    const button = el('spc-trace');
    if (button) button.textContent = 'Stop trace';
    lastDetailKey = '\u0000';
    renderDetail(true);
    renderLedger();

    traceTimer = window.setInterval(() => {
      if (traceIndex === null) return;
      if (traceIndex >= TRACE.ids.length - 1) {
        window.clearInterval(traceTimer);
        traceTimer = 0;
        if (button) button.textContent = 'Replay trace';
        return;
      }
      traceIndex += 1;
      engine.setTraceStep(traceIndex);
      lastDetailKey = '\u0000';
      renderDetail(true);
      renderLedger();
    }, TRACE_MS);
  }

  if (detail) {
    detail.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const focusButton = target.closest('[data-focus-id]');
      if (focusButton) {
        clearTrace();
        engine.setPinned(focusButton.dataset.focusId);
        setLedgerFilter('focus');
        lastDetailKey = '\u0000';
        renderDetail(true);
        return;
      }
      if (target.closest('[data-clear-focus]')) {
        engine.clearPin();
        setLedgerFilter('all');
        lastDetailKey = '\u0000';
        renderDetail(true);
        return;
      }
      if (target.closest('[data-trace-clear]')) clearTrace();
    }, { signal });
  }

  const tableHost = el('spc-table');
  if (tableHost) {
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const row = document.createElement('tr');
    ['Node', 'Role', 'Operation', 'Evidence', 'Source', 'Looks at', 'Reports to'].forEach((label) => {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      row.appendChild(th);
    });
    head.appendChild(row);
    table.appendChild(head);

    const body = document.createElement('tbody');
    const nameOf = (id) => (NODES.find((candidate) => candidate.id === id) || { label: id }).label;
    NODES.forEach((node) => {
      const tr = document.createElement('tr');
      const cell = (text, className) => {
        const td = document.createElement('td');
        td.textContent = text;
        if (className) td.className = className;
        tr.appendChild(td);
      };
      cell(node.label);
      cell(`${node.kind}, ${node.lifecycle}`);
      cell(scheduleLabel(node));
      if (node.cadence > 0) {
        cell(node.verified ? 'schedule verified' : 'schedule assumed', node.verified ? 'flag-ok' : 'flag-assumed');
      } else {
        cell('not applicable');
      }
      cell(node.source || 'not applicable');
      cell(node.watches.map(nameOf).join(', ') || 'none');
      cell(node.reports.map(nameOf).join(', ') || 'none');
      body.appendChild(tr);
    });
    table.appendChild(body);
    tableHost.appendChild(table);
  }

  function localPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  canvas.addEventListener('pointermove', (event) => engine.setPointer(localPoint(event)), { signal });
  canvas.addEventListener('pointerleave', () => engine.setPointer(null), { signal });
  const exploreSound = mountLabSound({
    voice: 'speculum',
    button: el('spc-sound'),
  });

  canvas.addEventListener('pointerdown', (event) => {
    const activeTrace = engine.getTrace();
    if (activeTrace) clearTrace();
    engine.setPointer(localPoint(event));
    const id = engine.getHovered();
    if (!id) return;
    const pinned = engine.pin(id);
    setLedgerFilter(pinned ? 'focus' : 'all');
    lastDetailKey = '\u0000';
    renderDetail(true);
    exploreSound.cue(pinned ? 'lock' : 'clear');
  }, { signal });

  const speedWrap = el('spc-speeds');
  if (speedWrap) {
    SPEEDS.forEach((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry.label;
      button.title = entry.hint;
      button.dataset.speed = String(entry.value);
      setPressed(button, entry.value === engine.getSpeed());
      button.addEventListener('click', () => {
        engine.setSpeed(entry.value);
        Array.from(speedWrap.children).forEach((child) => setPressed(child, child === button));
        const hint = el('spc-speed-hint');
        if (hint) hint.textContent = entry.hint;
      }, { signal });
      speedWrap.appendChild(button);
    });
  }

  const evidenceButton = el('spc-evidence');
  const labelsButton = el('spc-labels');
  const pauseButton = el('spc-pause');
  let evidenceOn = false;
  let labelsOn = false;
  let pauseOn = false;

  function setEvidence(value) {
    evidenceOn = Boolean(value);
    setPressed(evidenceButton, evidenceOn);
    engine.setEvidence(evidenceOn);
  }

  function setLabels(value) {
    labelsOn = Boolean(value);
    setPressed(labelsButton, labelsOn);
    engine.setLabels(labelsOn);
  }

  function setFreeze(value) {
    pauseOn = Boolean(value);
    setPressed(pauseButton, pauseOn);
    engine.setPaused(pauseOn);
  }

  evidenceButton?.addEventListener('click', () => setEvidence(!evidenceOn), { signal });
  labelsButton?.addEventListener('click', () => setLabels(!labelsOn), { signal });
  pauseButton?.addEventListener('click', () => setFreeze(!pauseOn), { signal });

  el('spc-reset')?.addEventListener('click', () => {
    clearTrace();
    startEpoch = Date.now();
    seen = 0;
    buffer.length = 0;
    ledgerEntries = [];
    engine.reset();
    renderLedger();
    tickReadouts();
  }, { signal });

  el('spc-step')?.addEventListener('click', () => {
    clearTrace();
    setFreeze(true);
    engine.stepToNextObservation();
    mergeBufferedObservations();
    tickReadouts();
    lastDetailKey = '\u0000';
    renderDetail(true);
  }, { signal });

  el('spc-trace')?.addEventListener('click', () => {
    if (engine.getTrace() && traceTimer) clearTrace();
    else startTrace();
  }, { signal });

  ledgerAllButton?.addEventListener('click', () => setLedgerFilter('all'), { signal });
  ledgerFocusButton?.addEventListener('click', () => setLedgerFilter('focus'), { signal });
  ledgerPauseButton?.addEventListener('click', () => {
    ledgerPaused = !ledgerPaused;
    setPressed(ledgerPauseButton, ledgerPaused);
    ledgerPauseButton.textContent = ledgerPaused ? 'Resume feed' : 'Pause feed';
    if (!ledgerPaused) mergeBufferedObservations();
    renderLedger();
  }, { signal });

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest('input, textarea, select, button, [contenteditable="true"]')) return;
    const key = event.key.toLowerCase();
    if (key === 'e') setEvidence(!evidenceOn);
    if (key === 'l') setLabels(!labelsOn);
    if (key === ' ') { event.preventDefault(); setFreeze(!pauseOn); }
    if (key === 'r') el('spc-reset')?.click();
    if (key === 'n') el('spc-step')?.click();
    if (key === 't') el('spc-trace')?.click();
    if (key === 'escape') {
      if (engine.getTrace()) clearTrace();
      else if (engine.getPinned()) {
        engine.clearPin();
        setLedgerFilter('all');
        lastDetailKey = '\u0000';
        renderDetail(true);
      }
    }
  }, { signal });

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let allowedToRun = !reduced.matches;
  const resizeObserver = new ResizeObserver(() => {
    engine.layout();
    if (!allowedToRun) engine.renderOnce();
  });
  resizeObserver.observe(canvas);
  engine.layout();

  let visible = true;
  const intersectionObserver = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    sync();
  }, { threshold: 0.02 });
  intersectionObserver.observe(canvas);

  function sync() {
    if (allowedToRun && visible && !document.hidden) engine.start();
    else engine.stop();
  }

  document.addEventListener('visibilitychange', sync, { signal });

  if (!allowedToRun) {
    setLabels(true);
    engine.renderOnce();
    const banner = el('spc-reduced');
    if (banner) {
      banner.hidden = false;
      const button = banner.querySelector('button');
      button?.addEventListener('click', () => {
        allowedToRun = true;
        banner.hidden = true;
        sync();
      }, { signal });
    }
  } else {
    sync();
  }

  renderLedger();
  renderDetail(true);
  tickReadouts();

  return {
    engine,
    destroy() {
      controller.abort();
      unsubscribeObservation();
      window.clearInterval(readoutTimer);
      window.clearInterval(detailTimer);
      if (traceTimer) window.clearInterval(traceTimer);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      engine.stop();
    },
  };
}

const root = document.getElementById('speculum');
if (root) mount(root);
