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
  const W = 1000;
  const H = 640;
  const PAD = 70;

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
    worker: { x: W * 0.44, y: H * 0.50, spread: 200 },
    site:   { x: W * 0.15, y: H * 0.22, spread: 90 },
    local:  { x: W * 0.84, y: H * 0.52, spread: 120 },
    infra:  { x: W * 0.66, y: H * 0.50, spread: 30 },
    ext:    { x: W * 0.16, y: H * 0.78, spread: 80 }
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
  const REST = { binding: 120, tunnel: 130, http: 100, alert: 190, dispatch: 170, notify: 170, poll: 210, probe: 230 };

  /* ── Build the working node set ──────────────────────────────────────── */
  const topo = window.ATLAS_TOPOLOGY;
  const nodes = topo.nodes.map((n) => ({ ...n, x: 0, y: 0, vx: 0, vy: 0, status: n.role === "worker" ? "unknown" : "static" }));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edges = topo.edges.slice();

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
  function simulate(list, links, ticks) {
    const REPULSE = 26000;
    const SPRING = 0.012;
    const ANCHOR_PULL = 0.012;
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

    /* Fit the settled layout into the padded viewBox. Scaling the result is
       cheaper and more stable than tuning forces to land in-bounds. */
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    list.forEach((n) => {
      if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
    });
    const sx = (W - PAD * 2) / Math.max(1, maxX - minX);
    const sy = (H - PAD * 2) / Math.max(1, maxY - minY);
    const s = Math.min(sx, sy);
    list.forEach((n) => {
      n.x = PAD + (n.x - minX) * s + (W - PAD * 2 - (maxX - minX) * s) / 2;
      n.y = PAD + (n.y - minY) * s + (H - PAD * 2 - (maxY - minY) * s) / 2;
    });
  }

  simulate(nodes, edges, 360);

  /* KV satellites pin beside their parent after the sim; they are owned
     storage, not network peers, and simulating them as peers would let
     repulsion push a namespace away from the Worker that owns it. */
  const kvNodes = topo.kv.map((kv, i) => {
    const p = nodeById.get(kv.parent);
    const side = p && p.x > W / 2 ? -1 : 1;
    return p ? { ...kv, x: p.x + side * 34, y: p.y - 26 - (i % 2) * 6 } : null;
  }).filter(Boolean);

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

  const gProbe = el("g", { class: "smap-layer-probe" }, svg);
  const gEdges = el("g", { class: "smap-layer-edges" }, svg);
  const gKv    = el("g", { class: "smap-layer-kv" }, svg);
  const gNodes = el("g", { class: "smap-layer-nodes" }, svg);

  function drawEdge(parent, a, b, kind, cls) {
    /* Shorten each end so lines meet node borders, not node centres; a line
       buried under a circle reads as a rendering bug, not a connection. */
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const trimA = 18, trimB = 20;
    const x1 = a.x + (dx / d) * trimA, y1 = a.y + (dy / d) * trimA;
    const x2 = b.x - (dx / d) * trimB, y2 = b.y - (dy / d) * trimB;
    return el("line", { x1, y1, x2, y2, class: `smap-edge ${cls || "smap-edge-" + kind}` }, parent);
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
    el("text", { x: n.x, y: n.y + (n.hub ? 34 : 30), class: "smap-label", "text-anchor": "middle" }, g)
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
    el("line", { x1: p.x, y1: p.y, x2: kv.x, y2: kv.y, class: "smap-kv-tether" }, g);
    el("rect", { x: kv.x - 5, y: kv.y - 5, width: 10, height: 10, class: "smap-kv-box" }, g);
    el("text", { x: kv.x, y: kv.y - 10, class: "smap-kv-label", "text-anchor": "middle" }, g)
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
        el("text", { x: n.x, y: n.y + 30, class: "smap-label", "text-anchor": "middle" }, g).textContent = n.label;
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
        link.href = "/lab/system-map-scene.css?v=20260707-map-readability";
        document.head.appendChild(link);
        const s = document.createElement("script");
        s.type = "module";
        s.src = "/lab/system-map-scene.js?v=20260707-map-readability";
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
