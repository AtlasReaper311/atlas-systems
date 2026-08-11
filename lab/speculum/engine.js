/**
 * SPECULUM / engine
 *
 * Canvas rendering and deterministic simulation for the reviewed public
 * topology snapshot. The engine does not fetch live state or mutate providers.
 */

const TAU = Math.PI * 2;

const PALETTE = {
  bg: '#0a0a0f',
  grid: 'rgba(255,255,255,0.03)',
  faint: '#555560',
  dim: '#aaa9a0',
  text: '#e8e8e0',
  accent: '#f5a623',
  accentRGB: '245,166,35',
  textRGB: '232,232,224',
  live: '#4ade80',
  liveRGB: '74,222,128',
  dead: '#2a2a33',
  role: {
    product: '245,166,35',
    observer: '72,185,220',
    service: '207,200,184',
    tool: '207,200,184',
    substrate: '85,85,96',
    machine: '232,147,92',
    external: '138,138,147',
  },
};

function roleRGB(kind) {
  return PALETTE.role[kind] || PALETTE.role.service;
}

const RING_SCALE = { 0: 0, 1: 0.32, 2: 0.62, 3: 0.86, 4: 1.0 };
const RING_LABELS = {
  1: 'runtime',
  2: 'observers',
  3: 'governance + tooling',
  4: 'external dependencies',
};

function hashUnit(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function norm(angle) {
  const value = angle % TAU;
  return value < 0 ? value + TAU : value;
}

function relationSet(nodes, byId, id) {
  if (!id) return null;
  const related = new Set([id]);
  const node = byId.get(id);
  if (node) {
    node.watches.forEach((target) => related.add(target));
    node.reports.forEach((target) => related.add(target));
  }
  nodes.forEach((candidate) => {
    if (candidate.watches.includes(id) || candidate.reports.includes(id)) related.add(candidate.id);
  });
  return related;
}

export function createEngine(canvas, nodes, ringOrder) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const view = new Map();

  nodes.forEach((node) => {
    const beam0 = hashUnit(`${node.id}:phase`) * TAU;
    view.set(node.id, {
      node,
      x: 0,
      y: 0,
      lit: 0,
      beam: beam0,
      beam0,
      reach: 0,
      observed: 0,
      dispatched: 0,
    });
  });

  const chords = [];
  const rings = [];
  const listeners = { observation: [], reset: [] };

  let width = 0;
  let height = 0;
  let cx = 0;
  let cy = 0;
  let radius = 0;
  let simTime = 0;
  let speed = 60;
  let paused = false;
  let evidence = false;
  let alwaysLabels = false;
  let pointer = null;
  let hovered = null;
  let pinned = null;
  let trace = null;

  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    width = Math.max(320, rect.width);
    height = Math.max(320, rect.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cx = width / 2;
    cy = height / 2;
    radius = Math.min(width, height) / 2 - (width < 620 ? 34 : 74);

    const centre = view.get('atlas-systems');
    if (centre) {
      centre.x = cx;
      centre.y = cy;
    }

    Object.keys(ringOrder).forEach((key) => {
      const ring = Number(key);
      const ids = ringOrder[key];
      const r = radius * RING_SCALE[ring];
      const offset = ring === 4 ? -0.18 : hashUnit(`ring${ring}`) * TAU;
      ids.forEach((id, index) => {
        const item = view.get(id);
        if (!item) return;
        const angle = offset + (index / ids.length) * TAU;
        item.x = cx + Math.cos(angle) * r;
        item.y = cy + Math.sin(angle) * r;
      });
    });

    view.forEach((item) => {
      let far = 0;
      item.node.watches.forEach((id) => {
        const target = view.get(id);
        if (!target) return;
        far = Math.max(far, Math.hypot(target.x - item.x, target.y - item.y));
      });
      item.reach = far * 1.06;
    });
  }

  function fire(source, targetId) {
    const from = view.get(source.id);
    const to = view.get(targetId);
    if (!from || !to) return;
    to.lit = 1;
    to.observed += 1;
    from.dispatched += 1;
    chords.push({ from, to, life: 1 });
    rings.push({ x: to.x, y: to.y, life: 1 });
    if (chords.length > 48) chords.splice(0, chords.length - 48);
    if (rings.length > 36) rings.splice(0, rings.length - 36);
    listeners.observation.forEach((listener) => listener(from.node, to.node, simTime));
  }

  function advanceSimulation(dtSim, dtVisual) {
    if (dtSim <= 0) return;
    simTime += dtSim;

    view.forEach((item) => {
      const { cadence } = item.node;
      if (cadence > 0 && item.node.state === 'live') {
        const rotation = (dtSim / cadence) * TAU;
        const fullSweeps = Math.floor(rotation / TAU);
        const remainder = rotation - fullSweeps * TAU;

        for (let sweep = 0; sweep < fullSweeps; sweep += 1) {
          item.node.watches.forEach((id) => fire(item.node, id));
        }

        if (remainder > 0) {
          item.node.watches.forEach((id) => {
            const target = view.get(id);
            if (!target) return;
            const targetAngle = Math.atan2(target.y - item.y, target.x - item.x);
            if (norm(targetAngle - item.beam) <= remainder) fire(item.node, id);
          });
        }

        item.beam = norm(item.beam + rotation);
      }
    });

    const fade = Math.max(0, dtVisual);
    view.forEach((item) => {
      item.lit *= Math.exp(-fade / 0.58);
      if (item.lit < 0.002) item.lit = 0;
    });

    for (let index = chords.length - 1; index >= 0; index -= 1) {
      chords[index].life -= fade / 1.35;
      if (chords[index].life <= 0) chords.splice(index, 1);
    }
    for (let index = rings.length - 1; index >= 0; index -= 1) {
      rings[index].life -= fade / 0.62;
      if (rings[index].life <= 0) rings.splice(index, 1);
    }
  }

  function step(dtReal) {
    if (paused) {
      advanceSimulation(0, dtReal);
      return;
    }
    advanceSimulation(dtReal * speed, dtReal);
  }

  function nextObservationDelta() {
    let next = Infinity;
    view.forEach((item) => {
      if (item.node.cadence <= 0 || item.node.state !== 'live') return;
      item.node.watches.forEach((targetId) => {
        const target = view.get(targetId);
        if (!target) return;
        const targetAngle = Math.atan2(target.y - item.y, target.x - item.x);
        let delta = norm(targetAngle - item.beam);
        if (delta < 1e-7) delta = TAU;
        next = Math.min(next, (delta / TAU) * item.node.cadence);
      });
    });
    return Number.isFinite(next) ? next : 0;
  }

  function reset() {
    simTime = 0;
    chords.length = 0;
    rings.length = 0;
    view.forEach((item) => {
      item.beam = item.beam0;
      item.lit = 0;
      item.observed = 0;
      item.dispatched = 0;
    });
    listeners.reset.forEach((listener) => listener());
    renderOnce();
  }

  function focusId() {
    return pinned || hovered;
  }

  function currentFocusSet() {
    if (trace) return new Set(trace.ids);
    return relationSet(nodes, byId, focusId());
  }

  function pickNode(px, py) {
    let best = null;
    let bestDistance = 24;
    view.forEach((item) => {
      const distance = Math.hypot(item.x - px, item.y - py);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = item.node.id;
      }
    });
    return best;
  }

  function drawGrid() {
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = PALETTE.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = (cx % 80) - 80; x < width; x += 80) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, height);
    }
    for (let y = (cy % 80) - 80; y < height; y += 80) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(width, Math.round(y) + 0.5);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    [1, 2, 3, 4].forEach((ring) => {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * RING_SCALE[ring], 0, TAU);
      ctx.stroke();
    });

    ctx.font = '9px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(170,169,160,0.30)';
    [1, 2, 3, 4].forEach((ring) => {
      const angle = -2.12;
      const r = radius * RING_SCALE[ring];
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      ctx.fillText(RING_LABELS[ring], x, y - 10);
    });
  }

  function curveControl(from, to, bend = 0.22) {
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    return {
      x: mx + (cx - mx) * bend,
      y: my + (cy - my) * bend,
    };
  }

  function drawArrow(to, control, colour, alpha, size = 5) {
    const angle = Math.atan2(to.y - control.y, to.x - control.x);
    ctx.fillStyle = colour.replace('ALPHA', String(alpha));
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
      to.x - Math.cos(angle - 0.55) * size,
      to.y - Math.sin(angle - 0.55) * size,
    );
    ctx.lineTo(
      to.x - Math.cos(angle + 0.55) * size,
      to.y - Math.sin(angle + 0.55) * size,
    );
    ctx.closePath();
    ctx.fill();
  }

  function drawCurve(from, to, colour, alpha, widthValue = 1, dashed = false, bend = 0.22) {
    const control = curveControl(from, to, bend);
    ctx.strokeStyle = colour.replace('ALPHA', String(alpha));
    ctx.lineWidth = widthValue;
    if (dashed) ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(control.x, control.y, to.x, to.y);
    ctx.stroke();
    if (dashed) ctx.setLineDash([]);
    return control;
  }

  function drawRelationships(focus) {
    nodes.forEach((node) => {
      const from = view.get(node.id);
      if (!from) return;
      node.reports.forEach((targetId) => {
        const to = view.get(targetId);
        if (!to) return;
        const active = focus && focus.has(node.id) && focus.has(targetId);
        drawCurve(
          from,
          to,
          'rgba(232,232,224,ALPHA)',
          focus ? (active ? 0.26 : 0.018) : 0.045,
          active ? 1.2 : 1,
          true,
        );
      });
    });

    if (!focus) return;

    nodes.forEach((node) => {
      const from = view.get(node.id);
      if (!from || !focus.has(node.id)) return;

      node.watches.forEach((targetId) => {
        if (!focus.has(targetId)) return;
        const to = view.get(targetId);
        if (!to) return;
        const control = drawCurve(from, to, 'rgba(245,166,35,ALPHA)', 0.48, 1.25, false, 0.18);
        drawArrow(to, control, 'rgba(245,166,35,ALPHA)', 0.65, 5.5);
      });

      node.reports.forEach((targetId) => {
        if (!focus.has(targetId)) return;
        const to = view.get(targetId);
        if (!to) return;
        const control = drawCurve(from, to, 'rgba(232,232,224,ALPHA)', 0.38, 1.1, true, 0.26);
        drawArrow(to, control, 'rgba(232,232,224,ALPHA)', 0.52, 5);
      });
    });
  }

  function drawBeams(focus) {
    ctx.globalCompositeOperation = 'lighter';
    view.forEach((item) => {
      const { cadence, state } = item.node;
      if (cadence <= 0 || state !== 'live' || item.reach <= 0) return;
      const inFocus = !focus || focus.has(item.node.id);
      const base = inFocus ? 1 : 0.08;
      const assumed = evidence && !item.node.verified;
      const angle = item.beam;
      const trail = 0.34;
      const gradient = ctx.createRadialGradient(item.x, item.y, 0, item.x, item.y, item.reach);
      gradient.addColorStop(0, `rgba(${PALETTE.accentRGB},${0.12 * base})`);
      gradient.addColorStop(0.58, `rgba(${PALETTE.accentRGB},${0.035 * base})`);
      gradient.addColorStop(1, `rgba(${PALETTE.accentRGB},0)`);

      if (!assumed) {
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(item.x, item.y);
        ctx.arc(item.x, item.y, item.reach, angle - trail, angle + 0.025);
        ctx.closePath();
        ctx.fill();
      }

      ctx.strokeStyle = `rgba(${PALETTE.accentRGB},${(assumed ? 0.22 : 0.40) * base})`;
      ctx.lineWidth = 1;
      if (assumed) ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.moveTo(item.x, item.y);
      ctx.lineTo(
        item.x + Math.cos(angle) * item.reach,
        item.y + Math.sin(angle) * item.reach,
      );
      ctx.stroke();
      if (assumed) ctx.setLineDash([]);
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawChords(focus) {
    ctx.globalCompositeOperation = 'lighter';
    chords.forEach((chord) => {
      const connected = focus && focus.has(chord.from.node.id) && focus.has(chord.to.node.id);
      const strength = focus ? (connected ? 0.72 : 0.035) : 0.30;
      const alpha = chord.life * chord.life * strength;
      drawCurve(chord.from, chord.to, 'rgba(245,166,35,ALPHA)', alpha, 1, false, 0.30);
    });
    rings.forEach((ring) => {
      const size = 5 + (1 - ring.life) * 13;
      ctx.strokeStyle = `rgba(${PALETTE.textRGB},${ring.life * 0.28})`;
      ctx.strokeRect(ring.x - size / 2, ring.y - size / 2, size, size);
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawTrace() {
    if (!trace || trace.ids.length < 2) return;
    ctx.save();
    for (let index = 0; index < trace.ids.length - 1; index += 1) {
      const from = view.get(trace.ids[index]);
      const to = view.get(trace.ids[index + 1]);
      if (!from || !to) continue;
      const completed = index < trace.index;
      const current = index === trace.index - 1;
      const alpha = completed ? (current ? 0.95 : 0.65) : 0.12;
      const control = drawCurve(from, to, 'rgba(245,166,35,ALPHA)', alpha, current ? 2.4 : 1.5, false, 0.12);
      drawArrow(to, control, 'rgba(245,166,35,ALPHA)', alpha, current ? 8 : 6);
    }
    ctx.restore();
  }

  function drawEvidenceMark(item, dim) {
    if (!evidence || item.node.cadence <= 0) return;
    const x = item.x + 7;
    const y = item.y - 7;
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, TAU);
    if (item.node.verified) {
      ctx.fillStyle = `rgba(${PALETTE.liveRGB},${0.9 * dim})`;
      ctx.fill();
    } else {
      ctx.strokeStyle = `rgba(${PALETTE.accentRGB},${0.9 * dim})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawNode(item, focus) {
    const node = item.node;
    const inFocus = !focus || focus.has(node.id);
    const dim = inFocus ? 1 : 0.08;
    const active = focusId() === node.id || (trace && trace.ids[trace.index] === node.id);
    const { x, y } = item;

    if (node.state === 'archived') {
      ctx.strokeStyle = `rgba(85,85,96,${0.5 * dim})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 3, y - 3, 6, 6);
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 3);
      ctx.lineTo(x + 3, y + 3);
      ctx.stroke();
      return;
    }

    if (node.state === 'planned') {
      ctx.strokeStyle = `rgba(85,85,96,${0.75 * dim})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.strokeRect(x - 6, y - 4, 12, 8);
      ctx.setLineDash([]);
      return;
    }

    if (node.kind === 'external') {
      const rgb = roleRGB('external');
      ctx.strokeStyle = `rgba(${rgb},${(0.45 + item.lit * 0.5) * dim})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 5, y - 5, 10, 10);
    } else if (node.kind === 'machine') {
      const rgb = roleRGB('machine');
      ctx.strokeStyle = `rgba(${rgb},${(0.55 + item.lit * 0.4) * dim})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 8, y - 4.5, 16, 9);
      ctx.fillStyle = `rgba(${rgb},${(0.35 + item.lit * 0.55) * dim})`;
      ctx.fillRect(x - 6, y - 2.5, 12, 5);
    } else if (node.kind === 'product') {
      const rgb = roleRGB('product');
      const pulse = 0.5 + item.lit * 0.5;
      ctx.fillStyle = `rgba(26,26,36,${dim})`;
      ctx.fillRect(x - 9, y - 9, 18, 18);
      ctx.strokeStyle = `rgba(${rgb},${(0.55 + pulse * 0.45) * dim})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 9, y - 9, 18, 18);
      ctx.fillStyle = `rgba(${rgb},${(0.35 + item.lit * 0.65) * dim})`;
      ctx.fillRect(x - 3, y - 3, 6, 6);
    } else {
      const size = node.kind === 'observer' ? 6 : 5;
      const dormant = node.state === 'dormant';
      const alpha = (dormant ? 0.3 : 0.55) + item.lit * 0.45;
      const rgb = roleRGB(node.kind);
      ctx.fillStyle = `rgba(${rgb},${alpha * dim})`;
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
      if (node.kind === 'observer') {
        ctx.strokeStyle = `rgba(${rgb},${(0.25 + item.lit * 0.5) * dim})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 5.5, y - 5.5, 11, 11);
      }
    }

    drawEvidenceMark(item, dim);

    if (active) {
      const pulse = 12 + Math.sin(simTime * 0.08) * 2;
      ctx.strokeStyle = trace
        ? `rgba(${PALETTE.liveRGB},0.85)`
        : `rgba(${PALETTE.accentRGB},0.85)`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - pulse / 2, y - pulse / 2, pulse, pulse);
    }
  }

  function drawLabel(item, focus, force) {
    const node = item.node;
    const inFocus = !focus || focus.has(node.id);
    let alpha = 0;
    if (force || alwaysLabels) alpha = inFocus ? 0.72 : 0.05;
    const recent = Math.max(0, (item.lit - 0.42) / 0.58);
    alpha = Math.max(alpha, recent * 0.72 * (inFocus ? 1 : 0.10));
    const active = focusId();
    if (active === node.id) alpha = Math.max(alpha, 0.98);
    else if (focus && focus.has(node.id)) alpha = Math.max(alpha, 0.62);
    if (trace && trace.ids.includes(node.id)) alpha = Math.max(alpha, 0.82);
    if (alpha < 0.04) return;

    const left = item.x < cx;
    ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = left ? 'right' : 'left';
    ctx.textBaseline = 'middle';
    const pad = node.kind === 'product' ? 15 : 11;
    ctx.fillStyle = `rgba(${PALETTE.textRGB},${alpha})`;
    ctx.fillText(node.label, item.x + (left ? -pad : pad), item.y);
  }

  function draw() {
    const focus = currentFocusSet();
    drawGrid();
    drawRelationships(focus);
    drawBeams(focus);
    drawChords(focus);
    drawTrace();
    view.forEach((item) => drawNode(item, focus));
    view.forEach((item) => drawLabel(item, focus, item.node.kind === 'product'));
  }

  let raf = 0;
  let last = 0;
  let running = false;

  function frame(now) {
    if (!running) return;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    if (pointer && !trace) hovered = pickNode(pointer.x, pointer.y);
    step(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  function renderOnce() {
    draw();
  }

  return {
    layout,
    start() {
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    renderOnce,
    advance(dtReal) { step(dtReal); },
    reset,
    stepToNextObservation() {
      const delta = nextObservationDelta();
      if (delta <= 0) return 0;
      advanceSimulation(delta + 1e-6, 0.18);
      renderOnce();
      return delta;
    },
    setSpeed(value) { speed = value; },
    getSpeed() { return speed; },
    setPaused(value) { paused = value; },
    isPaused() { return paused; },
    setEvidence(value) { evidence = value; renderOnce(); },
    setLabels(value) { alwaysLabels = value; renderOnce(); },
    setPointer(point) {
      pointer = point;
      if (!point) hovered = null;
    },
    pin(id) {
      trace = null;
      pinned = pinned === id ? null : id;
      return pinned;
    },
    setPinned(id) {
      trace = null;
      pinned = id || null;
      return pinned;
    },
    clearPin() { pinned = null; },
    getPinned() { return pinned; },
    getHovered() { return focusId(); },
    getNode(id) { return byId.get(id); },
    getSimTime() { return simTime; },
    setTrace(ids, index = 0) {
      pinned = null;
      hovered = null;
      trace = { ids: [...ids], index: Math.max(0, Math.min(index, ids.length - 1)) };
      renderOnce();
    },
    setTraceStep(index) {
      if (!trace) return;
      trace.index = Math.max(0, Math.min(index, trace.ids.length - 1));
      renderOnce();
    },
    clearTrace() { trace = null; renderOnce(); },
    getTrace() { return trace ? { ids: [...trace.ids], index: trace.index } : null; },
    counters() {
      const centre = view.get('atlas-systems');
      return {
        onProduct: centre ? centre.observed : 0,
        total: nodes.reduce((sum, node) => sum + view.get(node.id).observed, 0),
      };
    },
    on(event, listener) {
      if (!listeners[event]) return () => {};
      listeners[event].push(listener);
      return () => {
        const index = listeners[event].indexOf(listener);
        if (index >= 0) listeners[event].splice(index, 1);
      };
    },
  };
}
