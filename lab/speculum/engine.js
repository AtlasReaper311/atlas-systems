/**
 * SPECULUM / engine
 *
 * A canvas field of nodes. Every node with a cadence rotates a narrow beam at
 * its real schedule. When a beam crosses something that node watches, the
 * target lights and a chord is drawn between them.
 *
 * The only clever part is the time base. Periods in this estate span four
 * orders of magnitude, from a sixty-second telemetry push to a weekly
 * dependency audit. Drawn on one clock, that produces a polyrhythm nobody
 * designed. At real speed the weekly hands are visibly frozen, which is the
 * true picture and also unwatchable, so the interface offers compression.
 *
 * No dependencies. No timers other than requestAnimationFrame. Safe under
 * `script-src 'self'`.
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
  dead: '#2a2a33',
};

const RING_SCALE = { 0: 0, 1: 0.32, 2: 0.62, 3: 0.86, 4: 1.0 };

/** Deterministic small offset per id, so rings do not read as perfect clocks. */
function hashUnit(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function norm(a) {
  const x = a % TAU;
  return x < 0 ? x + TAU : x;
}

export function createEngine(canvas, nodes, ringOrder) {
  const ctx = canvas.getContext('2d', { alpha: false });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const view = new Map();
  nodes.forEach((n) => {
    view.set(n.id, {
      node: n,
      x: 0, y: 0,
      angle: 0,
      lit: 0,
      ring0: hashUnit(n.id) * TAU,
      beam: hashUnit(`${n.id}:phase`) * TAU,
      reach: 0,
      observed: 0,
      dispatched: 0,
    });
  });

  const chords = [];
  const rings = [];

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

  const listeners = { observation: [] };

  /* ------------------------------------------------------------------ */
  /* layout                                                             */
  /* ------------------------------------------------------------------ */

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
    radius = Math.min(width, height) / 2 - (width < 620 ? 26 : 54);

    view.get('atlas-systems').x = cx;
    view.get('atlas-systems').y = cy;

    Object.keys(ringOrder).forEach((key) => {
      const ring = Number(key);
      const ids = ringOrder[key];
      const r = radius * RING_SCALE[ring];
      // Ring 4 is pushed slightly off-circle so the outside world does not
      // read as just another orbit.
      const offset = ring === 4 ? -0.18 : hashUnit(`ring${ring}`) * TAU;
      ids.forEach((id, i) => {
        const v = view.get(id);
        if (!v) return;
        const a = offset + (i / ids.length) * TAU;
        v.angle = a;
        v.x = cx + Math.cos(a) * r;
        v.y = cy + Math.sin(a) * r;
      });
    });

    // Beam reach is the distance to the furthest thing a node actually looks
    // at. A node with only nearby subjects gets a short beam.
    view.forEach((v) => {
      let far = 0;
      v.node.watches.forEach((id) => {
        const t = view.get(id);
        if (!t) return;
        far = Math.max(far, Math.hypot(t.x - v.x, t.y - v.y));
      });
      v.reach = far * 1.06;
    });
  }

  /* ------------------------------------------------------------------ */
  /* simulation                                                         */
  /* ------------------------------------------------------------------ */

  function fire(source, target) {
    const s = view.get(source.id);
    const t = view.get(target);
    if (!s || !t) return;
    t.lit = 1;
    t.observed += 1;
    s.dispatched += 1;
    chords.push({ from: s, to: t, life: 1 });
    rings.push({ x: t.x, y: t.y, life: 1 });
    if (chords.length > 90) chords.splice(0, chords.length - 90);
    if (rings.length > 60) rings.splice(0, rings.length - 60);
    listeners.observation.forEach((fn) => fn(s.node, t.node, simTime));
  }

  function step(dtReal) {
    const dtSim = paused ? 0 : dtReal * speed;
    simTime += dtSim;

    view.forEach((v) => {
      const { cadence } = v.node;
      if (cadence > 0 && v.node.state === 'live' && dtSim > 0) {
        const rotation = (dtSim / cadence) * TAU;
        const fullSweeps = Math.floor(rotation / TAU);
        const remainder = rotation - fullSweeps * TAU;

        // A compressed frame may contain more than one complete sweep. Emit
        // every declared observation rather than silently collapsing multiple
        // periods into one visual event.
        for (let sweep = 0; sweep < fullSweeps; sweep += 1) {
          v.node.watches.forEach((id) => fire(v.node, id));
        }

        if (remainder > 0) {
          v.node.watches.forEach((id) => {
            const t = view.get(id);
            if (!t) return;
            const targetAngle = Math.atan2(t.y - v.y, t.x - v.x);
            if (norm(targetAngle - v.beam) <= remainder) fire(v.node, id);
          });
        }

        // Keep the phase bounded so long-running compressed sessions do not
        // lose trigonometric precision.
        v.beam = norm(v.beam + rotation);
      }
      v.lit *= Math.exp(-dtReal / 0.85);
      if (v.lit < 0.002) v.lit = 0;
    });

    for (let i = chords.length - 1; i >= 0; i -= 1) {
      chords[i].life -= dtReal / 2.2;
      if (chords[i].life <= 0) chords.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i -= 1) {
      rings[i].life -= dtReal / 0.9;
      if (rings[i].life <= 0) rings.splice(i, 1);
    }
  }

  /* ------------------------------------------------------------------ */
  /* focus                                                              */
  /* ------------------------------------------------------------------ */

  function focusId() {
    return pinned || hovered;
  }

  function relatedTo(id) {
    if (!id) return null;
    const set = new Set([id]);
    const n = byId.get(id);
    if (n) {
      n.watches.forEach((t) => set.add(t));
      n.reports.forEach((t) => set.add(t));
    }
    nodes.forEach((other) => {
      if (other.watches.includes(id) || other.reports.includes(id)) set.add(other.id);
    });
    return set;
  }

  function pickNode(px, py) {
    let best = null;
    let bestDist = 22;
    view.forEach((v) => {
      const d = Math.hypot(v.x - px, v.y - py);
      if (d < bestDist) {
        bestDist = d;
        best = v.node.id;
      }
    });
    return best;
  }

  /* ------------------------------------------------------------------ */
  /* drawing                                                            */
  /* ------------------------------------------------------------------ */

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

    // Ring guides. Almost invisible, but they tell you the field has structure.
    ctx.strokeStyle = 'rgba(255,255,255,0.022)';
    [1, 2, 3, 4].forEach((ring) => {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * RING_SCALE[ring], 0, TAU);
      ctx.stroke();
    });
  }

  function drawConduits(focus) {
    ctx.lineWidth = 1;
    nodes.forEach((n) => {
      const s = view.get(n.id);
      n.reports.forEach((id) => {
        const t = view.get(id);
        if (!t) return;
        const inFocus = !focus || (focus.has(n.id) && focus.has(id));
        ctx.strokeStyle = inFocus
          ? 'rgba(232,232,224,0.16)'
          : 'rgba(232,232,224,0.035)';
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        const mx = (s.x + t.x) / 2;
        const my = (s.y + t.y) / 2;
        ctx.quadraticCurveTo(mx + (cx - mx) * 0.22, my + (cy - my) * 0.22, t.x, t.y);
        ctx.stroke();
      });
    });
  }

  function drawBeams(focus) {
    ctx.globalCompositeOperation = 'lighter';
    view.forEach((v) => {
      const { cadence, state } = v.node;
      if (cadence <= 0 || state !== 'live' || v.reach <= 0) return;
      const inFocus = !focus || focus.has(v.node.id);
      const base = inFocus ? 1 : 0.18;
      const unverified = evidence && !v.node.verified;

      const a = v.beam;
      const trail = 0.9;
      const grad = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, v.reach);
      grad.addColorStop(0, `rgba(${PALETTE.accentRGB},${0.16 * base})`);
      grad.addColorStop(0.55, `rgba(${PALETTE.accentRGB},${0.05 * base})`);
      grad.addColorStop(1, `rgba(${PALETTE.accentRGB},0)`);

      if (!unverified) {
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(v.x, v.y);
        ctx.arc(v.x, v.y, v.reach, a - trail, a + 0.035);
        ctx.closePath();
        ctx.fill();
      } else {
        // Evidence mode: an assumed cadence is drawn as a dashed sweep. It
        // still moves, it just stops claiming to be true.
        ctx.strokeStyle = `rgba(${PALETTE.accentRGB},${0.5 * base})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 6]);
        ctx.beginPath();
        ctx.moveTo(v.x, v.y);
        ctx.lineTo(v.x + Math.cos(a) * v.reach, v.y + Math.sin(a) * v.reach);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Leading edge.
      ctx.strokeStyle = `rgba(${PALETTE.accentRGB},${(unverified ? 0.28 : 0.5) * base})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(v.x, v.y);
      ctx.lineTo(v.x + Math.cos(a) * v.reach, v.y + Math.sin(a) * v.reach);
      ctx.stroke();
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawChords(focus) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 1;
    chords.forEach((c) => {
      const inFocus = !focus || (focus.has(c.from.node.id) && focus.has(c.to.node.id));
      const alpha = c.life * c.life * (inFocus ? 0.62 : 0.1);
      ctx.strokeStyle = `rgba(${PALETTE.accentRGB},${alpha})`;
      const mx = (c.from.x + c.to.x) / 2;
      const my = (c.from.y + c.to.y) / 2;
      ctx.beginPath();
      ctx.moveTo(c.from.x, c.from.y);
      ctx.quadraticCurveTo(mx + (cx - mx) * 0.3, my + (cy - my) * 0.3, c.to.x, c.to.y);
      ctx.stroke();
    });
    rings.forEach((r) => {
      const s = 5 + (1 - r.life) * 13;
      ctx.strokeStyle = `rgba(${PALETTE.textRGB},${r.life * 0.4})`;
      ctx.strokeRect(r.x - s / 2, r.y - s / 2, s, s);
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawNode(v, focus) {
    const n = v.node;
    const inFocus = !focus || focus.has(n.id);
    const dim = inFocus ? 1 : 0.16;
    const { x, y } = v;

    if (n.state === 'archived') {
      ctx.strokeStyle = `rgba(85,85,96,${0.5 * dim})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 3, y - 3, 6, 6);
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 3);
      ctx.lineTo(x + 3, y + 3);
      ctx.stroke();
      return;
    }

    if (n.state === 'planned') {
      ctx.strokeStyle = `rgba(85,85,96,${0.75 * dim})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.strokeRect(x - 6, y - 4, 12, 8);
      ctx.setLineDash([]);
      return;
    }

    if (n.kind === 'external') {
      ctx.strokeStyle = `rgba(170,169,160,${(0.35 + v.lit * 0.5) * dim})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 5, y - 5, 10, 10);
      return;
    }

    if (n.kind === 'machine') {
      ctx.strokeStyle = `rgba(232,232,224,${(0.45 + v.lit * 0.5) * dim})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 8, y - 4.5, 16, 9);
      ctx.fillStyle = `rgba(245,166,35,${v.lit * 0.7 * dim})`;
      ctx.fillRect(x - 6, y - 2.5, 12, 5);
      return;
    }

    if (n.kind === 'product') {
      const pulse = 0.5 + v.lit * 0.5;
      ctx.fillStyle = `rgba(26,26,36,${dim})`;
      ctx.fillRect(x - 9, y - 9, 18, 18);
      ctx.strokeStyle = `rgba(245,166,35,${(0.55 + pulse * 0.45) * dim})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 9, y - 9, 18, 18);
      ctx.fillStyle = `rgba(245,166,35,${(0.35 + v.lit * 0.65) * dim})`;
      ctx.fillRect(x - 3, y - 3, 6, 6);
      return;
    }

    const size = n.kind === 'observer' ? 6 : 5;
    const isDormant = n.state === 'dormant';
    const alpha = (isDormant ? 0.3 : 0.55) + v.lit * 0.45;
    ctx.fillStyle = v.lit > 0.05
      ? `rgba(245,166,35,${alpha * dim})`
      : `rgba(${n.kind === 'substrate' ? '85,85,96' : '170,169,160'},${alpha * dim})`;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);

    if (n.kind === 'observer') {
      // Observers get an outer bracket. You can tell what a node is for by
      // looking at it.
      ctx.strokeStyle = `rgba(245,166,35,${(0.2 + v.lit * 0.5) * dim})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 5.5, y - 5.5, 11, 11);
    }
  }

  function drawLabel(v, focus, force) {
    const n = v.node;
    const inFocus = !focus || focus.has(n.id);
    let alpha = 0;
    if (force || alwaysLabels) alpha = inFocus ? 0.75 : 0.1;
    alpha = Math.max(alpha, v.lit * 0.9 * (inFocus ? 1 : 0.2));
    if (focus && focus.has(n.id)) alpha = Math.max(alpha, 0.85);
    if (alpha < 0.03) return;

    const left = v.x < cx;
    ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = left ? 'right' : 'left';
    ctx.textBaseline = 'middle';
    const pad = n.kind === 'product' ? 15 : 11;
    ctx.fillStyle = `rgba(${PALETTE.textRGB},${alpha})`;
    ctx.fillText(n.label, v.x + (left ? -pad : pad), v.y);

    if (evidence && n.cadence > 0) {
      ctx.font = '9px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillStyle = n.verified
        ? `rgba(74,222,128,${alpha * 0.75})`
        : `rgba(226,75,74,${alpha * 0.85})`;
      ctx.fillText(n.verified ? 'confirmed' : 'assumed', v.x + (left ? -pad : pad), v.y + 11);
    } else if (evidence && n.alias) {
      ctx.font = '9px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillStyle = `rgba(${PALETTE.accentRGB},${alpha * 0.7})`;
      ctx.fillText(`deploys as ${n.alias}`, v.x + (left ? -pad : pad), v.y + 11);
    }
  }

  function draw() {
    const focus = relatedTo(focusId());
    drawGrid();
    drawConduits(focus);
    drawBeams(focus);
    drawChords(focus);
    view.forEach((v) => drawNode(v, focus));
    view.forEach((v) => drawLabel(v, focus, v.node.kind === 'product' || v.node.kind === 'machine'));
  }

  /* ------------------------------------------------------------------ */
  /* loop                                                               */
  /* ------------------------------------------------------------------ */

  let raf = 0;
  let last = 0;
  let running = false;

  function frame(now) {
    if (!running) return;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    if (pointer) hovered = pickNode(pointer.x, pointer.y);
    step(dt);
    draw();
    raf = requestAnimationFrame(frame);
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
    renderOnce() {
      draw();
    },
    /** Drive the simulation by hand. Used by the loop, and by tests, so the
     *  beam-crossing maths is checkable outside a browser. */
    advance(dtReal) { step(dtReal); },
    setSpeed(v) { speed = v; },
    getSpeed() { return speed; },
    setPaused(v) { paused = v; },
    isPaused() { return paused; },
    setEvidence(v) { evidence = v; },
    setLabels(v) { alwaysLabels = v; },
    setPointer(p) {
      pointer = p;
      if (!p) hovered = null;
    },
    pin(id) { pinned = pinned === id ? null : id; return pinned; },
    getPinned() { return pinned; },
    getHovered() { return focusId(); },
    getNode(id) { return byId.get(id); },
    getSimTime() { return simTime; },
    counters() {
      const centre = view.get('atlas-systems');
      return {
        onProduct: centre ? centre.observed : 0,
        total: nodes.reduce((sum, n) => sum + view.get(n.id).observed, 0),
      };
    },
    on(event, fn) {
      if (!listeners[event]) return () => {};
      listeners[event].push(fn);
      return () => {
        const index = listeners[event].indexOf(fn);
        if (index >= 0) listeners[event].splice(index, 1);
      };
    },
  };
}
