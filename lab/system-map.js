/**
 * system-map.js
 * Live system map for the Lab page.
 *
 * Two data classes merge here:
 *   1. Declared topology (system-map.topology.js): what connects to what.
 *      Bindings and tunnel wiring are config, not API-visible, so they are
 *      declared with source citations rather than fetched.
 *   2. Live registry (js/atlas-registry.js): which Workers exist right now,
 *      whether each returns a valid /_meta, and what that /_meta says.
 *
 * Layout is a seeded force simulation run to convergence BEFORE first paint,
 * then frozen. Reasoning lives in LAYOUT-ALGORITHM.md; the short version is
 * that force-directed gives organic placement that scales as the estate
 * grows, seeding makes it deterministic so the map does not reshuffle on
 * every visit, and freezing means live polls change colour and detail but
 * never yank nodes around mid-read.
 *
 * Status vocabulary (Workers only; nothing else claims liveness):
 *   live      documented in the registry, /_meta healthy    green pulse
 *   degraded  documented but meta.status says otherwise     amber steady
 *   undoc     discovered, no valid /_meta yet               dim, dashed ring
 *   down      declared here, absent from a healthy registry red, dim
 *   unknown   registry itself unreachable                   faint, no claim
 */
(function () {
  "use strict";

  const host = document.getElementById("system-map-host");
  if (!host || !window.ATLAS_TOPOLOGY || !window.AtlasRegistry) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobileQuery = window.matchMedia("(max-width: 720px)");

  /* Layout space is a fixed coordinate system; the SVG viewBox scales it to
     whatever width the container has, so responsiveness costs nothing. */
  const W = 1080;
  const H = 760;
  const PAD = 86;
  const KV_BOX_HALF = 7;
  const KV_BOX_SIZE = KV_BOX_HALF * 2;
  const KV_STALK_LENGTH = 50;
  const KV_LABEL_GAP = 15;
  const KV_FAN_STEP = Math.PI / 10;

  /* ── Seeded randomness ─────────────────────────────────────────────────
     The seed is hashed from the sorted node id list, so the layout is
     byte-identical on every load of the same estate, and changes exactly
     once when the estate itself changes (a new Worker appears). Random
     jitter without a seed would reshuffle the map every visit, which reads
     as instability on a page whose whole point is stability. */
  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ── Role bands ────────────────────────────────────────────────────────
     Soft anchors, not columns. Each role gets a home region the force sim
     pulls toward weakly: the edge (Workers) in the middle, the LAN on the
     right behind the tunnel, Pages sites upper left, externals lower left.
     The regions encode the real trust boundary (public edge vs LAN) without
     hard-coding a single node position. */
  const ANCHORS = {
    worker: { x: W * 0.43, y: H * 0.51, spread: 280 },
    site:   { x: W * 0.14, y: H * 0.20, spread: 170 },
    local:  { x: W * 0.77, y: H * 0.51, spread: 95 },
    infra:  { x: W * 0.66, y: H * 0.46, spread: 48 },
    ext:    { x: W * 0.13, y: H * 0.82, spread: 110 }
  };

  const ROLE_LABELS = {
    worker: "cloudflare worker",
    site: "pages site",
    local: "SPECULAR-CORE service",
    infra: "infrastructure",
    ext: "external"
  };
  const LAB_EXCLUDED_WORKERS = new Set(["simple-proxy"]);

  /* Rest lengths per edge kind: bindings pull tight (they are same-account,
     zero-hop), tunnels hold the LAN visibly apart from the edge, pollers and
     notifications sit long so read paths do not crowd the core. */
  const REST = { binding: 145, tunnel: 180, http: 140, alert: 240, dispatch: 210, notify: 230, poll: 275, probe: 290 };

  /* ── Build the working node set ──────────────────────────────────────── */
  const topo = window.ATLAS_TOPOLOGY;
  const declaredNodes = topo.nodes.filter((n) => !LAB_EXCLUDED_WORKERS.has(n.id));
  const declaredNodeIds = new Set(declaredNodes.map((n) => n.id));
  const nodes = declaredNodes.map((n) => ({ ...n, x: 0, y: 0, vx: 0, vy: 0, status: n.role === "worker" ? "unknown" : "static" }));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edges = topo.edges.filter((e) =>
    declaredNodeIds.has(e.from) &&
    declaredNodeIds.has(e.to) &&
    !LAB_EXCLUDED_WORKERS.has(e.from) &&
    !LAB_EXCLUDED_WORKERS.has(e.to)
  );
  const topologyKv = topo.kv.filter((kv) =>
    declaredNodeIds.has(kv.parent) && !LAB_EXCLUDED_WORKERS.has(kv.parent)
  );

  const seedRand = mulberry32(hashString(nodes.map((n) => n.id).sort().join("|")));

  function placeInitial(n) {
    const a = ANCHORS[n.role] || ANCHORS.worker;
    const t = seedRand() * Math.PI * 2;
    const r = seedRand() * a.spread;
    n.x = a.x + Math.cos(t) * r;
    n.y = a.y + Math.sin(t) * r;
  }
  nodes.forEach(placeInitial);
  /* The hub starts at its anchor so the estate settles around the event
     router instead of the router drifting to wherever repulsion pushed it. */
  const hub = nodes.find((n) => n.hub);
  if (hub) { hub.x = ANCHORS.worker.x; hub.y = ANCHORS.worker.y; }

  /* ── Force simulation ──────────────────────────────────────────────────
     Pairwise repulsion, spring per edge, weak anchor gravity, damping.
     O(n²) per tick is nothing at ~25 nodes; 360 ticks completes in well
     under a frame of budget, which is why it can run synchronously before
     paint instead of animating a settle the visitor has to sit through. */
  function relaxSpacing(list, iterations) {
    const MIN_SEPARATION = 74;
    for (let tick = 0; tick < iterations; tick++) {
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d = Math.sqrt(dx * dx + dy * dy);
          if (d < 0.01) {
            const t = seedRand() * Math.PI * 2;
            dx = Math.cos(t);
            dy = Math.sin(t);
            d = 1;
          }
          if (d >= MIN_SEPARATION) continue;
          const push = (MIN_SEPARATION - d) * 0.5;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
  }

  function simulate(list, links, ticks) {
    const REPULSE = 42000;
    const SPRING = 0.012;
    const ANCHOR_PULL = 0.009;
    const DAMP = 0.82;

    for (let tick = 0; tick < ticks; tick++) {
      const cool = 1 - tick / ticks;

      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) { dx = (seedRand() - 0.5); dy = (seedRand() - 0.5); d2 = 1; }
          const f = (REPULSE / d2) * cool;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f, fy = (dy / d) * f;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }

      for (let e = 0; e < links.length; e++) {
        const a = nodeById.get(links[e].from);
        const b = nodeById.get(links[e].to);
        if (!a || !b) continue;
        const rest = REST[links[e].kind] || 150;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - rest) * SPRING;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }

      for (let k = 0; k < list.length; k++) {
        const n = list[k];
        const a = ANCHORS[n.role] || ANCHORS.worker;
        n.vx += (a.x - n.x) * ANCHOR_PULL;
        n.vy += (a.y - n.y) * ANCHOR_PULL;
        n.vx *= DAMP; n.vy *= DAMP;
        n.x += n.vx; n.y += n.vy;
      }
    }

    relaxSpacing(list, 64);

    /* Fit the settled layout into the padded viewBox. Scaling the result is
       cheaper and more stable than tuning forces to land in-bounds. */
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    list.forEach((n) => {
      if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
    });
    const longestLabel = list.reduce((m, n) => Math.max(m, n.label.length), 0);
    const xPad = Math.max(PAD, Math.min(172, longestLabel * 7.4 + 28));
    const topPad = PAD + 54;
    const bottomPad = PAD + 18;
    const sx = (W - xPad * 2) / Math.max(1, maxX - minX);
    const sy = (H - topPad - bottomPad) / Math.max(1, maxY - minY);
    const s = Math.min(sx, sy);
    list.forEach((n) => {
      n.x = xPad + (n.x - minX) * s + (W - xPad * 2 - (maxX - minX) * s) / 2;
      n.y = topPad + (n.y - minY) * s + (H - topPad - bottomPad - (maxY - minY) * s) / 2;
    });
  }

  simulate(nodes, edges, 360);

  function nodeRadius(n) {
    if (n.hub) return 21;
    if (n.role === "site") return 18;
    if (n.role === "local") return 18;
    if (n.role === "infra") return 20;
    return 16;
  }

  const layoutCentroid = nodes.reduce((sum, n) => {
    sum.x += n.x;
    sum.y += n.y;
    return sum;
  }, { x: 0, y: 0 });
  layoutCentroid.x /= Math.max(1, nodes.length);
  layoutCentroid.y /= Math.max(1, nodes.length);

  function rotateVector(v, radians) {
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
  }

  function normalise(v) {
    const d = Math.sqrt(v.x * v.x + v.y * v.y) || 1;
    return { x: v.x / d, y: v.y / d };
  }

  const kvByParent = new Map();
  topologyKv.forEach((kv) => {
    const list = kvByParent.get(kv.parent) || [];
    list.push(kv);
    kvByParent.set(kv.parent, list);
  });

  /* KV satellites sit on stalks pointing away from the local cluster.
     They stay deterministic because direction derives from frozen node
     positions, parent order, and fixed fan angles. */
  const kvNodes = [];
  kvByParent.forEach((list, parentId) => {
    const p = nodeById.get(parentId);
    if (!p) return;
    const outward = normalise({
      x: (p.x - layoutCentroid.x) * 0.75,
      y: (p.y - layoutCentroid.y) * 0.75 - 90
    });
    list.forEach((kv, i) => {
      const mid = (list.length - 1) / 2;
      const dir = normalise(rotateVector(outward, (i - mid) * KV_FAN_STEP));
      const base = nodeRadius(p) + KV_STALK_LENGTH + KV_BOX_HALF;
      kvNodes.push({
        ...kv,
        kind: "kv",
        dir,
        x: p.x + dir.x * base,
        y: p.y + dir.y * base,
        parentX: p.x,
        parentY: p.y
      });
    });
  });

  function labelWidth(text, scale) {
    return Math.max(30, text.length * scale + 8);
  }

  function boxForLabel(x, y, w, h, anchor) {
    let l = x - w / 2;
    if (anchor === "start") l = x;
    if (anchor === "end") l = x - w;
    return { l, r: l + w, t: y - h, b: y + 4 };
  }

  function boxOverlaps(a, b, pad) {
    return !(
      a.r + pad < b.l ||
      a.l - pad > b.r ||
      a.b + pad < b.t ||
      a.t - pad > b.b
    );
  }

  function overlapArea(a, b, pad) {
    const x = Math.max(0, Math.min(a.r + pad, b.r) - Math.max(a.l - pad, b.l));
    const y = Math.max(0, Math.min(a.b + pad, b.b) - Math.max(a.t - pad, b.t));
    return x * y;
  }

  function clampLabelCandidate(c) {
    const margin = 18;
    let box = boxForLabel(c.x, c.y, c.w, c.h, c.anchor);
    if (box.l < margin) c.x += margin - box.l;
    box = boxForLabel(c.x, c.y, c.w, c.h, c.anchor);
    if (box.r > W - margin) c.x -= box.r - (W - margin);
    box = boxForLabel(c.x, c.y, c.w, c.h, c.anchor);
    if (box.t < margin) c.y += margin - box.t;
    box = boxForLabel(c.x, c.y, c.w, c.h, c.anchor);
    if (box.b > H - margin) c.y -= box.b - (H - margin);
    c.box = boxForLabel(c.x, c.y, c.w, c.h, c.anchor);
    return c;
  }

  function shapeBox(item) {
    const r = item.kind === "kv" ? KV_BOX_HALF + 3 : nodeRadius(item);
    return { l: item.x - r, r: item.x + r, t: item.y - r, b: item.y + r };
  }

  function labelCandidates(item) {
    const r = item.kind === "kv" ? KV_BOX_HALF + 3 : nodeRadius(item);
    const h = item.kind === "kv" ? 14 : 17;
    const w = labelWidth(item.label, item.kind === "kv" ? 6.4 : 8.4);
    if (item.kind === "kv" && item.dir) {
      const anchor = item.dir.x > 0.2 ? "start" : item.dir.x < -0.2 ? "end" : "middle";
      const labelOffset = KV_BOX_HALF + KV_LABEL_GAP;
      return [
        { x: item.x + item.dir.x * labelOffset, y: item.y + item.dir.y * labelOffset + 5, anchor, w, h },
        { x: item.x, y: item.y - KV_BOX_HALF - KV_LABEL_GAP, anchor: "middle", w, h },
        { x: item.x + KV_BOX_HALF + KV_LABEL_GAP, y: item.y + 5, anchor: "start", w, h },
        { x: item.x - KV_BOX_HALF - KV_LABEL_GAP, y: item.y + 5, anchor: "end", w, h }
      ].map(clampLabelCandidate);
    }
    const candidates = [
      { x: item.x, y: item.y + r + 28, anchor: "middle", w, h },
      { x: item.x, y: item.y - r - 14, anchor: "middle", w, h },
      { x: item.x + r + 24, y: item.y + 6, anchor: "start", w, h },
      { x: item.x - r - 24, y: item.y + 6, anchor: "end", w, h },
      { x: item.x + r + 20, y: item.y - r - 8, anchor: "start", w, h },
      { x: item.x - r - 20, y: item.y - r - 8, anchor: "end", w, h },
      { x: item.x + r + 20, y: item.y + r + 20, anchor: "start", w, h },
      { x: item.x - r - 20, y: item.y + r + 20, anchor: "end", w, h }
    ].map(clampLabelCandidate);
    const out = normalise({ x: item.x - layoutCentroid.x, y: item.y - layoutCentroid.y });
    return candidates
      .map((c, i) => {
        const box = c.box || boxForLabel(c.x, c.y, c.w, c.h, c.anchor);
        const centre = { x: (box.l + box.r) / 2, y: (box.t + box.b) / 2 };
        const dir = normalise({ x: centre.x - item.x, y: centre.y - item.y });
        return { c, i, score: dir.x * out.x + dir.y * out.y };
      })
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .map((entry) => entry.c);
  }

  function labelPriority(item) {
    if (item.hub) return 60;
    if (item.role === "worker") return 50;
    if (item.role === "local") return 40;
    if (item.role === "site") return 30;
    if (item.role === "infra") return 25;
    if (item.role === "ext") return 20;
    return 10;
  }

  function placeLabels() {
    const items = nodes.map((n) => ({ ...n, kind: "node", priority: labelPriority(n) }))
      .concat(kvNodes.map((kv) => ({ ...kv, kind: "kv", priority: 10 })));
    const shapeBoxes = items.map((item) => ({ id: item.id, box: shapeBox(item) }));
    const placed = [];
    items.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id)).forEach((item) => {
      let winner = null;
      let best = null;
      let bestScore = Infinity;
      const candidates = labelCandidates(item);
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const hitsLabel = placed.some((p) => boxOverlaps(c.box, p, 8));
        const hitsShape = shapeBoxes.some((s) =>
          s.id !== item.id && boxOverlaps(c.box, s.box, 6)
        );
        const labelScore = placed.reduce((sum, p) => sum + overlapArea(c.box, p, 8), 0);
        const shapeScore = shapeBoxes.reduce((sum, s) =>
          s.id === item.id ? sum : sum + overlapArea(c.box, s.box, 6) * 2, 0
        );
        const score = labelScore + shapeScore + i;
        if (score < bestScore) {
          best = c;
          bestScore = score;
        }
        if (!hitsLabel && !hitsShape) { winner = c; break; }
      }
      if (!winner) winner = best || candidates[0];
      item.labelPlacement = winner;
      placed.push(winner.box);
      const target = item.kind === "kv" ? kvNodes.find((kv) => kv.id === item.id) : nodeById.get(item.id);
      if (target) target.labelPlacement = winner;
    });
  }

  placeLabels();

  /* ── SVG construction ────────────────────────────────────────────────── */
  const SVG_NS = "http://www.w3.org/2000/svg";
  function el(name, attrs, parent) {
    const node = document.createElementNS(SVG_NS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  const svg = el("svg", {
    viewBox: `0 0 ${W} ${H}`,
    class: "smap-svg",
    role: "img",
    "aria-label": "Live map of the Atlas Systems estate. Interactive; each node is focusable."
  });

  const gViewport = el("g", { class: "smap-viewport" }, svg);
  const gProbe = el("g", { class: "smap-layer-probe" }, gViewport);
  const gEdges = el("g", { class: "smap-layer-edges" }, gViewport);
  const gKv    = el("g", { class: "smap-layer-kv" }, gViewport);
  const gNodes = el("g", { class: "smap-layer-nodes" }, gViewport);

  function drawEdge(parent, a, b, kind, cls) {
    /* Shorten each end so lines meet node borders, not node centres; a line
       buried under a circle reads as a rendering bug, not a connection. */
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const trimA = 18, trimB = 20;
    const x1 = a.x + (dx / d) * trimA, y1 = a.y + (dy / d) * trimA;
    const x2 = b.x - (dx / d) * trimB, y2 = b.y - (dy / d) * trimB;
    const baseClass = cls || "smap-edge-" + kind;
    const base = el("line", { x1, y1, x2, y2, class: `smap-edge ${baseClass}` }, parent);
    if (!reduceMotion) {
      el("line", {
        x1, y1, x2, y2,
        class: `smap-edge-direction smap-edge-direction-${kind}`
      }, parent);
    }
    return base;
  }

  edges.forEach((e) => {
    const a = nodeById.get(e.from), b = nodeById.get(e.to);
    if (a && b) e.el = drawEdge(gEdges, a, b, e.kind);
  });

  /* Node shapes are role-coded: circles for Workers and externals, squares
     for Pages sites, diamonds for LAN services, a slim rect for the tunnel.
     Shape carries role so colour is free to carry status. */
  function nodeShape(n, parent) {
    if (n.role === "site") {
      return el("rect", { x: n.x - 11, y: n.y - 11, width: 22, height: 22, rx: 3, class: "smap-shape" }, parent);
    }
    if (n.role === "local") {
      return el("rect", { x: n.x - 10, y: n.y - 10, width: 20, height: 20, rx: 2,
        transform: `rotate(45 ${n.x} ${n.y})`, class: "smap-shape" }, parent);
    }
    if (n.role === "infra") {
      return el("rect", { x: n.x - 14, y: n.y - 7, width: 28, height: 14, rx: 2, class: "smap-shape" }, parent);
    }
    const r = n.hub ? 16 : 12;
    return el("circle", { cx: n.x, cy: n.y, r, class: "smap-shape" }, parent);
  }

  function drawPlacedLabel(item, parent, cls) {
    const p = item.labelPlacement || labelCandidates(item)[0];
    return el("text", {
      x: p.x,
      y: p.y,
      class: cls,
      "text-anchor": p.anchor
    }, parent);
  }

  nodes.forEach((n, i) => {
    const g = el("g", {
      class: `smap-node smap-role-${n.role} smap-st-${n.status}`,
      tabindex: "0",
      role: "button",
      "data-id": n.id,
      "aria-label": `${n.label}, ${ROLE_LABELS[n.role]}`
    }, gNodes);

    if (n.role === "worker") {
      /* The halo is what pulses; keeping it separate from the shape means
         status animation never fights the hover scale on the shape itself. */
      n.haloEl = el("circle", { cx: n.x, cy: n.y, r: n.hub ? 16 : 12, class: "smap-halo" }, g);
      n.ringEl = el("circle", { cx: n.x, cy: n.y, r: (n.hub ? 16 : 12) + 5, class: "smap-ring" }, g);
    }
    n.shapeEl = nodeShape(n, g);
    drawPlacedLabel(n, g, "smap-label")
      .textContent = n.label;
    n.el = g;

    if (!reduceMotion) {
      g.style.opacity = "0";
      g.style.transition = "opacity .45s ease";
      setTimeout(() => { g.style.opacity = "1"; }, 60 + i * 22);
    }
  });

  kvNodes.forEach((kv) => {
    const g = el("g", { class: "smap-kv" }, gKv);
    const p = nodeById.get(kv.parent);
    const dx = kv.x - p.x;
    const dy = kv.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const parentR = nodeRadius(p);
    el("line", {
      x1: p.x + (dx / d) * parentR,
      y1: p.y + (dy / d) * parentR,
      x2: kv.x - (dx / d) * KV_BOX_HALF,
      y2: kv.y - (dy / d) * KV_BOX_HALF,
      class: "smap-kv-tether"
    }, g);
    el("rect", { x: kv.x - KV_BOX_HALF, y: kv.y - KV_BOX_HALF, width: KV_BOX_SIZE, height: KV_BOX_SIZE, rx: 2, class: "smap-kv-box" }, g);
    drawPlacedLabel({ ...kv, kind: "kv" }, g, "smap-kv-label")
      .textContent = kv.label;
  });

  /* ── Detail panel ────────────────────────────────────────────────────── */
  const panel = document.createElement("div");
  panel.className = "smap-panel";
  panel.hidden = true;
  let panelPinned = null; // node id when opened by tap or keyboard, so hover elsewhere does not steal it

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]
    ));
  }

  const STATUS_TEXT = {
    live: "live · /_meta healthy",
    degraded: "degraded",
    undoc: "discovered · no /_meta yet",
    down: "not answering discovery",
    unknown: "registry unreachable",
    static: null
  };

  function panelHtml(n) {
    const rows = [];
    rows.push(`<div class="smap-panel-head"><span class="smap-panel-name">${esc(n.label)}</span>` +
      `<span class="smap-panel-role">${esc(ROLE_LABELS[n.role])}</span></div>`);
    const st = STATUS_TEXT[n.status];
    if (st) rows.push(`<div class="smap-panel-status smap-pst-${esc(n.status)}">${esc(st)}</div>`);
    const desc = (n.meta && n.meta.description) || n.blurb || "";
    if (desc) rows.push(`<div class="smap-panel-desc">${esc(desc)}</div>`);
    if (n.meta && n.meta.version) rows.push(`<div class="smap-panel-kv">version <strong>${esc(n.meta.version)}</strong></div>`);
    if (n.meta && Array.isArray(n.meta.endpoints) && n.meta.endpoints.length) {
      const eps = n.meta.endpoints.slice(0, 6).map((ep) =>
        `<div class="smap-panel-ep"><span class="smap-ep-method">${esc(ep.method || "GET")}</span>` +
        `<span class="smap-ep-path">${esc(ep.path || "")}</span></div>` +
        (ep.description ? `<div class="smap-ep-desc">${esc(ep.description)}</div>` : "")
      ).join("");
      rows.push(`<div class="smap-panel-eps">${eps}</div>`);
    }
    if (n.registryNote && n.status !== "live") {
      rows.push(`<div class="smap-panel-note">${esc(n.registryNote)}</div>`);
    }
    if (n.meta && n.meta.source) {
      rows.push(`<a class="smap-panel-src" href="${esc(n.meta.source)}" target="_blank" rel="noopener noreferrer">repo →</a>`);
    }
    return rows.join("");
  }

  function showPanel(n, atX, atY) {
    panel.innerHTML = panelHtml(n);
    panel.hidden = false;
    /* Position in container space, clamped so the panel never clips outside
       the map; SVG coordinates map to pixels via the current render scale.
       The 3D scene passes explicit host-relative pixels instead, because a
       node's screen position under a movable camera has nothing to do with
       the frozen 2D layout. */
    const rect = host.getBoundingClientRect();
    const scale = rect.width / W;
    let px = typeof atX === "number" ? atX + 18 : n.x * scale + 24;
    let py = typeof atY === "number" ? atY - 12 : n.y * scale - 12;
    const pw = Math.min(300, rect.width - 24);
    if (px + pw > rect.width - 8) px = n.x * scale - pw - 24;
    if (px < 8) px = 8;
    panel.style.maxWidth = pw + "px";
    panel.style.left = px + "px";
    panel.style.top = Math.max(8, Math.min(py, rect.height - 60)) + "px";
  }
  function hidePanel() { panel.hidden = true; panelPinned = null; }

  gNodes.addEventListener("pointerenter", (ev) => {
    const g = ev.target.closest(".smap-node");
    if (g && !panelPinned) showPanel(nodeById.get(g.dataset.id));
  }, true);
  gNodes.addEventListener("pointerleave", (ev) => {
    if (!panelPinned && ev.target.closest(".smap-node")) hidePanel();
  }, true);
  gNodes.addEventListener("click", (ev) => {
    const g = ev.target.closest(".smap-node");
    if (!g) return;
    const id = g.dataset.id;
    if (panelPinned === id) { hidePanel(); return; }
    panelPinned = id;
    showPanel(nodeById.get(id));
  });
  gNodes.addEventListener("keydown", (ev) => {
    const g = ev.target.closest(".smap-node");
    if (!g) return;
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      panelPinned = g.dataset.id;
      showPanel(nodeById.get(g.dataset.id));
    }
  });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") hidePanel(); });
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".smap-node") && !ev.target.closest(".smap-panel")) hidePanel();
  });

  /* ── Live status merge ───────────────────────────────────────────────── */
  const statusLine = document.getElementById("system-map-statusline");
  const banner = document.getElementById("system-map-banner");
  let probesDrawn = false;

  function setNodeStatus(n, status) {
    if (n.status === status) return;
    n.el.classList.remove("smap-st-" + n.status);
    n.status = status;
    n.el.classList.add("smap-st-" + status);
  }

  function applySnapshot(snap) {
    if (!snap.ok && !snap.stale) {
      /* Never reached: show declared topology honestly, claim nothing. */
      nodes.forEach((n) => { if (n.role === "worker") setNodeStatus(n, "unknown"); });
      if (banner) {
        banner.hidden = false;
        banner.textContent = "registry unreachable · showing declared topology, no live status";
      }
      if (statusLine) statusLine.textContent = "";
      return;
    }

    if (banner) {
      if (snap.stale) {
        banner.hidden = false;
        const t = snap.fetchedAt ? snap.fetchedAt.toTimeString().slice(0, 5) : "earlier";
        banner.textContent = `registry not responding · showing last snapshot from ${t}`;
      } else {
        banner.hidden = true;
      }
    }

    const visibleWorkers = snap.workers.filter((w) => !LAB_EXCLUDED_WORKERS.has(w.name));
    const seen = new Set();
    let orphanIndex = 0;

    visibleWorkers.forEach((w) => {
      seen.add(w.name);
      let n = nodeById.get(w.name);

      if (!n) {
        /* Orphan handling: a Worker the topology has never heard of still
           earns a node, placed in the worker band near the registry that
           found it. The map must not hide new infrastructure just because
           this file has not been updated yet. */
        const idx = nodeById.get("atlas-api-index") || hub;
        n = {
          id: w.name, role: "worker", label: w.name,
          blurb: "Discovered by the registry; not yet in the declared topology",
          x: (idx ? idx.x : W / 2) + 60 + (orphanIndex % 3) * 46,
          y: (idx ? idx.y : H / 2) + 70 + Math.floor(orphanIndex / 3) * 46,
          status: "unknown"
        };
        orphanIndex++;
        nodes.push(n);
        nodeById.set(n.id, n);
        const g = el("g", {
          class: `smap-node smap-role-worker smap-st-unknown`,
          tabindex: "0", role: "button", "data-id": n.id,
          "aria-label": `${n.label}, ${ROLE_LABELS.worker}, newly discovered`
        }, gNodes);
        n.haloEl = el("circle", { cx: n.x, cy: n.y, r: 12, class: "smap-halo" }, g);
        n.ringEl = el("circle", { cx: n.x, cy: n.y, r: 17, class: "smap-ring" }, g);
        n.shapeEl = nodeShape(n, g);
        drawPlacedLabel(n, g, "smap-label").textContent = n.label;
        n.el = g;
      }

      n.meta = w.meta;
      n.registryNote = w.note;
      if (w.documented) {
        const ms = w.meta && typeof w.meta.status === "string" ? w.meta.status.toLowerCase() : "live";
        setNodeStatus(n, ms === "live" || ms === "ok" || ms === "" ? "live" : "degraded");
      } else {
        setNodeStatus(n, "undoc");
      }
    });

    /* Declared here, absent from a healthy registry: presumed down. */
    nodes.forEach((n) => {
      if (n.role === "worker" && !seen.has(n.id)) setNodeStatus(n, "down");
    });

    /* Probe edges are the one generated edge class: the registry's target
       list IS the live data, so drawing them from topology would just be a
       second copy that drifts. Drawn once; membership rarely changes. */
    if (!probesDrawn) {
      const idx = nodeById.get("atlas-api-index");
      if (idx) {
        visibleWorkers.forEach((w) => {
          const t = nodeById.get(w.name);
          if (t && t !== idx) drawEdge(gProbe, idx, t, "probe");
        });
        probesDrawn = true;
      }
    }

    if (statusLine) {
      const c = {
        workers: visibleWorkers.length,
        documented: visibleWorkers.filter((w) => w.documented).length
      };
      c.undocumented = c.workers - c.documented;
      statusLine.textContent =
        `${c.workers} workers discovered · ${c.documented} documented · ${c.undocumented} pending /_meta` +
        (snap.generatedAt ? ` · registry built ${snap.generatedAt.slice(11, 16)}Z` : "");
    }

    if (mobileQuery.matches) renderList(snap);

    /* 3D seam: remember the snapshot (probe edges derive from it) and let
       any mounted renderer re-read state. Subscribers are isolated; a
       throwing renderer cannot take the flat map down with it. */
    lastSnap = snap;
    vmSubscribers.forEach((fn) => { try { fn(); } catch (e) { /* isolated */ } });
  }

  /* ── Mobile list ─────────────────────────────────────────────────────
     Below 720px the graph trades readability for spectacle, which is the
     wrong trade on a phone. The list is the same data grouped by role,
     with the same status vocabulary, not a lesser page. */
  const listHost = document.getElementById("system-map-list");
  function renderList(snap) {
    if (!listHost) return;
    const groups = [
      ["Cloudflare Workers", nodes.filter((n) => n.role === "worker")],
      ["SPECULAR-CORE services", nodes.filter((n) => n.role === "local")],
      ["Pages sites", nodes.filter((n) => n.role === "site")],
      ["External", nodes.filter((n) => n.role === "ext" || n.role === "infra")]
    ];
    let html = "";
    groups.forEach(([title, list]) => {
      if (!list.length) return;
      html += `<div class="smap-list-group"><div class="smap-list-title">${esc(title)}</div>`;
      list.forEach((n) => {
        const desc = (n.meta && n.meta.description) || n.blurb || "";
        html += `<div class="smap-list-row smap-st-${esc(n.status)}">` +
          `<span class="smap-list-dot"></span>` +
          `<span class="smap-list-name">${esc(n.label)}</span>` +
          `<span class="smap-list-desc">${esc(desc)}</span></div>`;
      });
      html += `</div>`;
    });
    listHost.innerHTML = html;
  }

  /* ── Mount ───────────────────────────────────────────────────────────── */
  host.appendChild(svg);
  host.appendChild(panel);

  const flatControls = document.createElement("div");
  flatControls.className = "smap-flat-controls";
  flatControls.innerHTML =
    '<button type="button" data-map-zoom="in" aria-label="Zoom in">+</button>' +
    '<button type="button" data-map-zoom="out" aria-label="Zoom out">-</button>' +
    '<button type="button" data-map-zoom="reset" aria-label="Reset map view">reset</button>';
  host.appendChild(flatControls);

  const panZoom = { k: 1, x: 0, y: 0 };
  const panLimit = { x: W * 0.45, y: H * 0.45 };
  function clampPanZoom() {
    panZoom.k = Math.max(1, Math.min(3.2, panZoom.k));
    const extraX = (W * (panZoom.k - 1)) / 2 + panLimit.x;
    const extraY = (H * (panZoom.k - 1)) / 2 + panLimit.y;
    panZoom.x = Math.max(-extraX, Math.min(extraX, panZoom.x));
    panZoom.y = Math.max(-extraY, Math.min(extraY, panZoom.y));
  }
  function applyPanZoom() {
    clampPanZoom();
    gViewport.setAttribute("transform", `translate(${panZoom.x.toFixed(2)} ${panZoom.y.toFixed(2)}) scale(${panZoom.k.toFixed(3)})`);
    host.classList.toggle("smap-zoomed", panZoom.k > 1.001 || Math.abs(panZoom.x) > 0.5 || Math.abs(panZoom.y) > 0.5);
  }
  function svgPoint(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    return ctm ? pt.matrixTransform(ctm.inverse()) : { x: W / 2, y: H / 2 };
  }
  function zoomFlat(delta, clientX, clientY) {
    const before = svgPoint(clientX, clientY);
    const oldK = panZoom.k;
    const nextK = Math.max(1, Math.min(3.2, oldK * delta));
    const ratio = nextK / oldK;
    panZoom.x = before.x - (before.x - panZoom.x) * ratio;
    panZoom.y = before.y - (before.y - panZoom.y) * ratio;
    panZoom.k = nextK;
    applyPanZoom();
  }
  flatControls.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-map-zoom]");
    if (!btn) return;
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (btn.dataset.mapZoom === "in") zoomFlat(1.24, cx, cy);
    else if (btn.dataset.mapZoom === "out") zoomFlat(1 / 1.24, cx, cy);
    else {
      panZoom.k = 1; panZoom.x = 0; panZoom.y = 0; applyPanZoom();
    }
  });
  svg.addEventListener("wheel", (ev) => {
    if (mobileQuery.matches) return;
    ev.preventDefault();
    zoomFlat(ev.deltaY < 0 ? 1.14 : 1 / 1.14, ev.clientX, ev.clientY);
  }, { passive: false });
  let flatDrag = null;
  svg.addEventListener("pointerdown", (ev) => {
    if (mobileQuery.matches || ev.button !== 0) return;
    if (ev.target.closest(".smap-node")) return;
    flatDrag = { x: ev.clientX, y: ev.clientY, px: panZoom.x, py: panZoom.y };
    svg.classList.add("smap-panning");
    svg.setPointerCapture && svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener("pointermove", (ev) => {
    if (!flatDrag) return;
    const rect = svg.getBoundingClientRect();
    panZoom.x = flatDrag.px + ((ev.clientX - flatDrag.x) / Math.max(1, rect.width)) * W;
    panZoom.y = flatDrag.py + ((ev.clientY - flatDrag.y) / Math.max(1, rect.height)) * H;
    applyPanZoom();
  });
  svg.addEventListener("pointerup", () => {
    flatDrag = null;
    svg.classList.remove("smap-panning");
  });
  svg.addEventListener("pointercancel", () => {
    flatDrag = null;
    svg.classList.remove("smap-panning");
  });

  function syncViewMode() {
    const mobile = mobileQuery.matches;
    svg.style.display = mobile ? "none" : "";
    if (listHost) listHost.style.display = mobile ? "" : "none";
    hidePanel();
  }
  syncViewMode();
  if (mobileQuery.addEventListener) mobileQuery.addEventListener("change", () => {
    syncViewMode();
    renderList({});
  });

  /* ── 3D scene seam ────────────────────────────────────────────────────
     The data layer above is the product; rendering is a consumer of it.
     AtlasMapVM is the entire contract the 3D scene gets: live references
     to the merged working set, the same panel, and a way back down. The
     scene overlays the SVG rather than replacing it, so the flat map
     stays warm underneath and fallback is "remove the canvas". */
  var lastSnap = null;
  var vmSubscribers = [];
  window.AtlasMapVM = {
    getState() {
      /* Probe edges are derived, not stored: the registry's target list
         IS the live data, same rule the SVG renderer follows. */
      const probes = [];
      if (lastSnap && nodeById.get("atlas-api-index")) {
        lastSnap.workers.filter((w) => !LAB_EXCLUDED_WORKERS.has(w.name)).forEach((w) => {
          if (nodeById.get(w.name) && w.name !== "atlas-api-index") {
            probes.push({ from: "atlas-api-index", to: w.name, kind: "probe" });
          }
        });
      }
      return { nodes, edges, kv: kvNodes, probes, W, H };
    },
    onUpdate(fn) { vmSubscribers.push(fn); },
    openDetail(id, atX, atY) {
      const n = nodeById.get(id);
      if (n) { panelPinned = n; showPanel(n, atX, atY); }
    },
    closeDetail() { hidePanel(); },
    sceneMounted() { host.classList.add("smap-3d"); },
    fallbackToSvg() { host.classList.remove("smap-3d"); }
  };

  /* Loader: every gate errs toward the flat map. The scene script only
     ever loads when the map is on screen on a WebGL2-capable, motion-ok,
     desktop-width viewport; any failure after that point removes itself. */
  (function maybeMountScene() {
    try {
      if (new URLSearchParams(location.search).get("flat") === "1") return;
      if (mobileQuery.matches || reduceMotion) return;
      const probe = document.createElement("canvas");
      const gl = probe.getContext("webgl2");
      if (!gl) return;
      const inject = () => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "/lab/system-map-scene.css?v=20260707-lab-cache";
        document.head.appendChild(link);
        const s = document.createElement("script");
        s.type = "module";
        s.src = "/lab/system-map-scene.js?v=20260707-lab-cache";
        s.onerror = () => window.AtlasMapVM.fallbackToSvg();
        document.head.appendChild(s);
      };
      if ("IntersectionObserver" in window) {
        const io = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) { io.disconnect(); inject(); }
        }, { rootMargin: "240px" });
        io.observe(host);
      } else {
        inject();
      }
    } catch (e) { /* the flat map is already rendered; nothing to undo */ }
  })();

  window.AtlasRegistry.subscribe(applySnapshot);
})();
