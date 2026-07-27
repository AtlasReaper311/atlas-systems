/**
 * SPECULUM / boot
 *
 * Wires the engine to the page. Owns the ledger, the clock, the detail
 * readout, and the keyboard.
 *
 * The ledger is a sample, not a log. At high time compression the field
 * produces far more observations per second than a person can read, so the
 * ledger takes the newest few every flush and the counter reports the real
 * total. Saying "sample" in the header is cheaper than pretending.
 */

import { NODES, RING_ORDER, SNAPSHOT, formatPeriod, summarise } from './topology.js';
import { createEngine } from './engine.js';

const SPEEDS = [
  { value: 1, label: '1x', hint: 'real time. almost nothing moves. this is the true picture' },
  { value: 60, label: '60x', hint: 'one minute per second' },
  { value: 3600, label: '3600x', hint: 'one hour per second. the weekly audits finally turn' },
];

const LEDGER_MAX = 14;
const FLUSH_MS = 180;
const FLUSH_TAKE = 3;

function el(id) {
  return document.getElementById(id);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatClock(epochMs) {
  const d = new Date(epochMs);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} `
    + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

export function mount(root) {
  const canvas = root.querySelector('canvas');
  if (!canvas) return null;

  const controller = new AbortController();
  const { signal } = controller;
  const engine = createEngine(canvas, NODES, RING_ORDER);
  const stats = summarise(NODES);
  const startEpoch = Date.now();

  /* -- header counts, derived not written ---------------------------- */
  const statsEl = el('spc-stats');
  if (statsEl) {
    statsEl.textContent = [
      `${stats.nodes} public nodes`,
      `${stats.emitters} periodic emitters`,
      `${stats.gazes} attention edges`,
      `${stats.conduits} report paths`,
      `${stats.assumed} unverified periods`,
      `reviewed ${SNAPSHOT.reviewedAt}`,
    ].join('  ·  ');
  }

  /* -- ledger --------------------------------------------------------- */
  const ledger = el('spc-ledger');
  const buffer = [];
  let seen = 0;

  const unsubscribeObservation = engine.on('observation', (from, to) => {
    seen += 1;
    buffer.push({ from: from.label, to: to.label, at: startEpoch + engine.getSimTime() * 1000 });
    if (buffer.length > 200) buffer.splice(0, buffer.length - 200);
  });

  function flush() {
    if (!ledger || buffer.length === 0) return;
    const take = buffer.splice(-FLUSH_TAKE, FLUSH_TAKE).reverse();
    take.forEach((entry) => {
      const li = document.createElement('li');
      const t = document.createElement('span');
      t.className = 'spc-t';
      t.textContent = formatClock(entry.at).slice(11, 19);
      const body = document.createElement('span');
      body.className = 'spc-path';
      body.textContent = `${entry.from} → ${entry.to}`;
      li.appendChild(t);
      li.appendChild(body);
      ledger.insertBefore(li, ledger.firstChild);
    });
    while (ledger.childElementCount > LEDGER_MAX) {
      ledger.removeChild(ledger.lastChild);
    }
    buffer.length = 0;
  }

  /* -- clock and counters --------------------------------------------- */
  const clockEl = el('spc-clock');
  const countEl = el('spc-count');

  function tickReadouts() {
    if (clockEl) clockEl.textContent = formatClock(startEpoch + engine.getSimTime() * 1000);
    if (countEl) {
      const c = engine.counters();
      // Notifications and state changes are outside this generated simulation.
      // The fixed clause prevents an observation count from becoming a false
      // operational claim.
      countEl.textContent = `${seen.toLocaleString('en-GB')} generated observations  ·  `
        + `${c.onProduct.toLocaleString('en-GB')} reached atlas-systems  ·  `
        + 'no live state';
    }
  }

  const readoutTimer = window.setInterval(() => { flush(); tickReadouts(); }, FLUSH_MS);

  /* -- detail readout -------------------------------------------------- */
  const detail = el('spc-detail');
  let lastFocus = '\u0000';

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

  function renderDetail() {
    if (!detail) return;
    const id = engine.getHovered();
    if (id === lastFocus) return;
    lastFocus = id;
    detail.textContent = '';

    if (!id) {
      const p = document.createElement('p');
      p.className = 'spc-idle';
      p.textContent = 'Point at a node. Click to pin it.';
      detail.appendChild(p);
      const note = document.createElement('p');
      note.className = 'spc-idle-note';
      note.textContent = 'Related paths brighten while the rest of the field recedes.';
      detail.appendChild(note);
      return;
    }

    const n = engine.getNode(id);
    const head = document.createElement('h3');
    head.textContent = n.label;
    detail.appendChild(head);

    const meta = document.createElement('p');
    meta.className = 'spc-meta';
    const bits = [n.kind];
    if (engine.getPinned() === id) bits.unshift('pinned');
    if (n.state !== 'live') bits.push(n.state);
    bits.push(scheduleLabel(n));
    if (n.cadence > 0) bits.push(n.verified ? 'period verified' : 'period unverified');
    if (n.alias) bits.push(`deploys as ${n.alias}`);
    meta.textContent = bits.join('  ·  ');
    detail.appendChild(meta);

    const note = document.createElement('p');
    note.className = 'spc-note';
    note.textContent = n.note;
    detail.appendChild(note);

    if (n.source) {
      const source = document.createElement('p');
      source.className = 'spc-source';
      source.textContent = `source: ${n.source}`;
      detail.appendChild(source);
    }

    const watchers = NODES.filter((o) => o.watches.includes(id)).map((o) => o.label);
    const list = (title, items) => {
      if (items.length === 0) return;
      const h = document.createElement('p');
      h.className = 'spc-sub';
      h.textContent = title;
      detail.appendChild(h);
      const ul = document.createElement('ul');
      items.forEach((v) => {
        const li = document.createElement('li');
        li.textContent = v;
        ul.appendChild(li);
      });
      detail.appendChild(ul);
    };
    list('looks at', n.watches.map((w) => (engine.getNode(w) || { label: w }).label));
    list('is looked at by', watchers);
    list('reports to', n.reports.map((w) => (engine.getNode(w) || { label: w }).label));
  }

  const detailTimer = window.setInterval(renderDetail, 120);

  /* -- accessible table ------------------------------------------------ */
  /* Generated from the same array the canvas reads, so the text version and
   * the picture cannot disagree. */
  const tableHost = el('spc-table');
  if (tableHost) {
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const hr = document.createElement('tr');
    ['Node', 'Role', 'Operation', 'Evidence', 'Source', 'Looks at', 'Reports to'].forEach((h) => {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = h;
      hr.appendChild(th);
    });
    head.appendChild(hr);
    table.appendChild(head);

    const body = document.createElement('tbody');
    NODES.forEach((n) => {
      const tr = document.createElement('tr');
      const cell = (text, cls) => {
        const td = document.createElement('td');
        td.textContent = text;
        if (cls) td.className = cls;
        tr.appendChild(td);
      };
      cell(n.alias ? `${n.label} (${n.alias})` : n.label);
      cell(`${n.kind}, ${n.lifecycle}`);
      cell(scheduleLabel(n));
      if (n.cadence > 0) cell(n.verified ? 'verified' : 'unverified', n.verified ? 'flag-ok' : 'flag-assumed');
      else cell('not applicable');
      cell(n.source || 'not applicable');
      const nameOf = (id) => (NODES.find((o) => o.id === id) || { label: id }).label;
      cell(n.watches.map(nameOf).join(', ') || 'none');
      cell(n.reports.map(nameOf).join(', ') || 'none');
      body.appendChild(tr);
    });
    table.appendChild(body);
    tableHost.appendChild(table);
  }

  /* -- pointer --------------------------------------------------------- */
  function localPoint(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  canvas.addEventListener('pointermove', (ev) => engine.setPointer(localPoint(ev)), { signal });
  canvas.addEventListener('pointerleave', () => engine.setPointer(null), { signal });
  canvas.addEventListener('pointerdown', (ev) => {
    engine.setPointer(localPoint(ev));
    const id = engine.getHovered();
    if (id) {
      engine.pin(id);
      lastFocus = '\u0000';
    }
  }, { signal });

  /* -- controls -------------------------------------------------------- */
  const speedWrap = el('spc-speeds');
  if (speedWrap) {
    SPEEDS.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = s.label;
      b.title = s.hint;
      b.dataset.speed = String(s.value);
      b.setAttribute('aria-pressed', String(s.value === engine.getSpeed()));
      b.addEventListener('click', () => {
        engine.setSpeed(s.value);
        Array.from(speedWrap.children).forEach((c) => {
          c.setAttribute('aria-pressed', String(c === b));
        });
        const hint = el('spc-speed-hint');
        if (hint) hint.textContent = s.hint;
      }, { signal });
      speedWrap.appendChild(b);
    });
  }

  function toggle(id, fn, initial) {
    const b = el(id);
    if (!b) return;
    let on = Boolean(initial);
    b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', () => {
      on = !on;
      b.setAttribute('aria-pressed', String(on));
      fn(on);
    }, { signal });
  }

  toggle('spc-evidence', (v) => engine.setEvidence(v), false);
  toggle('spc-labels', (v) => engine.setLabels(v), false);
  toggle('spc-pause', (v) => engine.setPaused(v), false);

  window.addEventListener('keydown', (ev) => {
    const target = ev.target;
    if (target instanceof Element && target.closest('input, textarea, select, button, [contenteditable="true"]')) return;
    const key = ev.key.toLowerCase();
    if (key === 'e') el('spc-evidence')?.click();
    if (key === 'l') el('spc-labels')?.click();
    if (key === ' ') { ev.preventDefault(); el('spc-pause')?.click(); }
    if (key === 'escape' && engine.getPinned()) {
      engine.pin(engine.getPinned());
      lastFocus = '\u0000';
    }
  }, { signal });

  /* -- lifecycle -------------------------------------------------------- */
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let allowedToRun = !reduced.matches;

  const ro = new ResizeObserver(() => {
    engine.layout();
    if (!allowedToRun) engine.renderOnce();
  });
  ro.observe(canvas);
  engine.layout();

  let visible = true;
  const io = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    sync();
  }, { threshold: 0.02 });
  io.observe(canvas);

  document.addEventListener('visibilitychange', sync, { signal });

  function sync() {
    if (allowedToRun && visible && !document.hidden) engine.start();
    else engine.stop();
  }

  if (!allowedToRun) {
    engine.setLabels(true);
    engine.renderOnce();
    const banner = el('spc-reduced');
    if (banner) {
      banner.hidden = false;
      const b = banner.querySelector('button');
      if (b) {
        b.addEventListener('click', () => {
          allowedToRun = true;
          banner.hidden = true;
          sync();
        }, { signal });
      }
    }
  } else {
    sync();
  }

  renderDetail();
  tickReadouts();

  return {
    engine,
    destroy() {
      controller.abort();
      unsubscribeObservation();
      window.clearInterval(readoutTimer);
      window.clearInterval(detailTimer);
      ro.disconnect();
      io.disconnect();
      engine.stop();
    },
  };
}

const root = document.getElementById('speculum');
if (root) mount(root);
