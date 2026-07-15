(function () {
  "use strict";

  const host = document.getElementById("system-map-host");
  if (!host) return;

  const LAB_EXCLUDED_WORKERS = new Set(["simple-proxy"]);
  const W = 1180;
  const H = 760;
  const CELL_W = 72;
  const CELL_H = 58;
  const DISTRICT_MARGIN = 22;

  const EDGE_STYLE = {
    binding: { stroke: "#9aa4b4", width: 1.4, dash: "" },
    tunnel: { stroke: "#f5a623", width: 2.7, dash: "" },
    http: { stroke: "#48b9dc", width: 1.5, dash: "" },
    poll: { stroke: "#7d8fe0", width: 1.2, dash: "5 5" },
    probe: { stroke: "#d0ab58", width: 1.1, dash: "3 5" },
    dispatch: { stroke: "#b186ee", width: 1.3, dash: "7 5" },
    notify: { stroke: "#d277cf", width: 1.4, dash: "" },
    alert: { stroke: "#f06d4f", width: 1.5, dash: "" },
    kv: { stroke: "#d5d0c5", width: 1.0, dash: "" },
    default: { stroke: "#9aa4b4", width: 1.2, dash: "" },
  };

  const DISTRICT_LAYOUT = {
    surface: {
      label: "surface ward",
      x: 70,
      y: 70,
      w: 300,
      h: 190,
      accent: "#e8935c",
      fill: "rgba(232,147,92,0.06)",
    },
    publicApi: {
      label: "control plaza",
      x: 380,
      y: 70,
      w: 300,
      h: 190,
      accent: "#4ade80",
      fill: "rgba(74,222,128,0.05)",
    },
    source: {
      label: "source quarter",
      x: 720,
      y: 70,
      w: 390,
      h: 220,
      accent: "#f5a623",
      fill: "rgba(245,166,35,0.05)",
    },
    observability: {
      label: "ops yard",
      x: 70,
      y: 300,
      w: 370,
      h: 240,
      accent: "#f5a623",
      fill: "rgba(245,166,35,0.05)",
    },
    edge: {
      label: "edge works",
      x: 455,
      y: 300,
      w: 290,
      h: 230,
      accent: "#f5a623",
      fill: "rgba(245,166,35,0.05)",
    },
    local: {
      label: "local valley",
      x: 760,
      y: 330,
      w: 350,
      h: 250,
      accent: "#48b9dc",
      fill: "rgba(72,185,220,0.05)",
    },
    external: {
      label: "outer links",
      x: 70,
      y: 580,
      w: 260,
      h: 120,
      accent: "#8a8a93",
      fill: "rgba(138,138,147,0.05)",
    },
  };

  const subscriptions = [];
  let lastSnap = null;
  let svg = null;
  let panel = null;
  let renderState = null;

  function injectStyles() {
    if (document.getElementById("atlas-system-map-overhaul-style")) return;

    const style = document.createElement("style");
    style.id = "atlas-system-map-overhaul-style";
    style.textContent = `
      #system-map-host {
        position: relative;
        min-height: 760px;
        overflow: hidden;
        background:
          linear-gradient(var(--border, rgba(255,255,255,0.08)) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
        background-size: 80px 80px;
        background-color: #0a0a0f;
      }
      #system-map-host .atlas-system-map-svg {
        width: 100%;
        height: auto;
        display: block;
      }
      #system-map-host .atlas-system-map-panel {
        position: absolute;
        left: 18px;
        bottom: 18px;
        width: min(360px, calc(100% - 36px));
        border: 1px solid rgba(255,255,255,0.08);
        background: linear-gradient(180deg, rgba(17,17,24,0.95), rgba(10,10,15,0.96));
        padding: 12px 14px;
        color: #e8e8e0;
        font: 12px/1.55 "IBM Plex Mono", monospace;
        pointer-events: none;
        opacity: 0;
        transform: translateY(12px);
        transition: opacity 0.16s ease, transform 0.16s ease;
      }
      #system-map-host .atlas-system-map-panel[data-open="true"] {
        opacity: 1;
        transform: translateY(0);
      }
      #system-map-host .atlas-system-map-panel h3 {
        margin: 0 0 6px;
        color: #f5a623;
        font: 500 12px/1.35 "IBM Plex Mono", monospace;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      #system-map-host .atlas-system-map-panel p {
        margin: 0 0 6px;
        color: #aaa9a0;
      }
      #system-map-host .atlas-system-map-panel p:last-child {
        margin-bottom: 0;
      }
      #system-map-host .atlas-system-map-panel code {
        color: #e8e8e0;
      }
      .smap-district-title {
        fill: #aaa9a0;
        font: 500 10px/1 "IBM Plex Mono", monospace;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .smap-road {
        stroke: rgba(255,255,255,0.06);
      }
      .smap-edge {
        fill: none;
        stroke-linecap: round;
        opacity: 0.94;
      }
      .smap-node-label {
        fill: #aaa9a0;
        font: 500 10px/1 "IBM Plex Mono", monospace;
        pointer-events: none;
      }
      .smap-node-shape {
        transition: opacity 0.14s ease, transform 0.14s ease;
      }
      .smap-node[data-status="live"] .smap-node-shape {
        stroke: #4ade80;
      }
      .smap-node[data-status="down"] .smap-node-shape,
      .smap-node[data-status="degraded"] .smap-node-shape {
        stroke: #e24b4a;
      }
      .smap-node[data-status="undoc"] .smap-node-shape,
      .smap-node[data-status="unknown"] .smap-node-shape {
        stroke: #f5a623;
      }
      .smap-node[data-role="worker"] .smap-node-shape {
        fill: rgba(245,166,35,0.12);
        stroke-width: 2.2;
      }
      .smap-node[data-role="site"] .smap-node-shape {
        fill: rgba(232,147,92,0.12);
        stroke: #e8935c;
        stroke-width: 2.0;
      }
      .smap-node[data-role="local"] .smap-node-shape {
        fill: rgba(72,185,220,0.12);
        stroke: #48b9dc;
        stroke-width: 2.0;
      }
      .smap-node[data-role="ext"] .smap-node-shape {
        fill: rgba(138,138,147,0.08);
        stroke: #8a8a93;
        stroke-width: 1.7;
        stroke-dasharray: 4 4;
      }
      .smap-node[data-role="repo"] .smap-node-shape {
        fill: rgba(245,166,35,0.08);
        stroke: #f5a623;
        stroke-width: 1.8;
      }
      .smap-node[data-role="infra"] .smap-node-shape {
        fill: rgba(207,200,184,0.06);
        stroke: #cfc8b8;
        stroke-width: 1.6;
      }
      .smap-kv-label {
        fill: #cfc8b8;
        font: 500 9px/1 "IBM Plex Mono", monospace;
        letter-spacing: 0.08em;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function createSvgEl(name, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        el.setAttribute(key, String(value));
      }
    });
    return el;
  }

  function sortById(a, b) {
    return String(a.id).localeCompare(String(b.id));
  }

  function displayName(node) {
    return node.label || node.id || node.name || "unknown";
  }

  function inferDistrict(node) {
    if (node.sourceOnly || node.kind === "repository") return "source";
    if (node.role === "site") return "surface";
    if (node.role === "local") return "local";
    if (node.role === "ext") return "external";
    if (node.layer === "public-api") return "publicApi";
    if (node.layer === "observability") return "observability";
    if (node.layer === "edge") return "edge";
    if (node.layer === "infra") return "observability";
    return "publicApi";
  }

  function normaliseRole(raw) {
    if (raw.sourceOnly === true || raw.source_only === true || raw.kind === "repository") {
      return "repo";
    }
    if (raw.role === "site") return "site";
    if (raw.role === "local") return "local";
    if (raw.role === "ext") return "ext";
    if (raw.role === "infra") return "infra";
    return "worker";
  }

  function normaliseNode(raw) {
    const sourceOnly =
      raw.sourceOnly === true ||
      raw.source_only === true ||
      raw.kind === "repository";
    const node = {
      ...raw,
      id: raw.id || raw.name,
      label: raw.label || raw.id || raw.name,
      role: normaliseRole(raw),
      status: raw.status || "unknown",
      kind: raw.kind || (sourceOnly ? "repository" : "worker"),
      layer: raw.layer || "",
      sourceOnly,
      publicSurface: raw.public_surface || raw.publicSurface || null,
      description: raw.description || raw.notes || "",
      dependsOn: Array.isArray(raw.depends_on) ? raw.depends_on.slice() : [],
    };
    node.district = inferDistrict(node);
    return node;
  }

  function shapeSvg(node, x, y) {
    if (node.role === "site") {
      return createSvgEl("rect", {
        x: x - 13,
        y: y - 13,
        width: 26,
        height: 26,
        rx: 4,
        class: "smap-node-shape",
      });
    }

    if (node.role === "local") {
      const points = [
        [x, y - 14],
        [x + 14, y],
        [x, y + 14],
        [x - 14, y],
      ].map((pair) => pair.join(",")).join(" ");
      return createSvgEl("polygon", {
        points,
        class: "smap-node-shape",
      });
    }

    if (node.role === "ext") {
      return createSvgEl("circle", {
        cx: x,
        cy: y,
        r: 12,
        class: "smap-node-shape",
      });
    }

    if (node.role === "repo") {
      return createSvgEl("rect", {
        x: x - 14,
        y: y - 8,
        width: 28,
        height: 16,
        rx: 3,
        class: "smap-node-shape",
      });
    }

    if (node.role === "infra") {
      return createSvgEl("rect", {
        x: x - 7,
        y: y - 7,
        width: 14,
        height: 14,
        class: "smap-node-shape",
      });
    }

    return createSvgEl("circle", {
      cx: x,
      cy: y,
      r: 14,
      class: "smap-node-shape",
    });
  }

  function buildNodeLayout(nodes) {
    const byDistrict = {};
    Object.keys(DISTRICT_LAYOUT).forEach((key) => {
      byDistrict[key] = [];
    });

    nodes.forEach((node) => {
      const key = DISTRICT_LAYOUT[node.district] ? node.district : "publicApi";
      byDistrict[key].push(node);
    });

    Object.values(byDistrict).forEach((list) => list.sort(sortById));

    const districtState = [];
    Object.entries(DISTRICT_LAYOUT).forEach(([key, district]) => {
      const members = byDistrict[key];
      const innerX = district.x + DISTRICT_MARGIN;
      const innerY = district.y + 36;
      const innerW = district.w - DISTRICT_MARGIN * 2;
      const cols = Math.max(1, Math.floor(innerW / CELL_W));

      members.forEach((node, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        node.x = innerX + col * CELL_W + 24;
        node.y = innerY + row * CELL_H + 22;
      });

      const rows = Math.max(1, Math.ceil(members.length / cols));
      districtState.push({
        key,
        ...district,
        cols,
        rows,
        members,
      });
    });

    return districtState;
  }

  function buildEdgeList(nodes, topo) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const edges = [];

    (topo.edges || []).forEach((edge) => {
      if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) return;
      edges.push({
        from: edge.from,
        to: edge.to,
        kind: edge.kind || "http",
      });
    });

    if (lastSnap && nodeById.has("atlas-api-index")) {
      (lastSnap.workers || []).forEach((worker) => {
        const name = worker.name;
        if (!name || name === "atlas-api-index" || LAB_EXCLUDED_WORKERS.has(name)) return;
        if (!nodeById.has(name)) return;
        edges.push({
          from: "atlas-api-index",
          to: name,
          kind: "probe",
          derived: true,
        });
      });
    }

    return edges;
  }

  function buildKvNodes(nodes, topo) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    return (topo.kv || [])
      .filter((entry) => nodeById.has(entry.parent))
      .map((entry, index) => {
        const parent = nodeById.get(entry.parent);
        const offset = index % 2 === 0 ? -18 : 18;
        return {
          id: entry.id || entry.label,
          label: entry.label,
          parent: entry.parent,
          x: parent.x + offset,
          y: parent.y - 24 - Math.floor(index / 2) * 18,
        };
      });
  }

  function collectNodes() {
    const topo = window.ATLAS_TOPOLOGY || { nodes: [], edges: [], kv: [] };
    const nodes = (topo.nodes || [])
      .filter((node) => !LAB_EXCLUDED_WORKERS.has(node.id))
      .map(normaliseNode);

    const nodeById = new Map(nodes.map((node) => [node.id, node]));

    if (lastSnap) {
      (lastSnap.workers || []).forEach((worker) => {
        const name = worker.name;
        if (!name || LAB_EXCLUDED_WORKERS.has(name)) return;

        const status =
          worker.documented === false
            ? "undoc"
            : worker.status || (worker.ok === false ? "down" : "live");

        if (nodeById.has(name)) {
          nodeById.get(name).status = status;
        } else {
          const orphan = normaliseNode({
            id: name,
            label: name,
            role: "worker",
            kind: "worker",
            layer: "public-api",
            status,
          });
          orphan.district = "publicApi";
          nodes.push(orphan);
          nodeById.set(orphan.id, orphan);
        }
      });
    }

    nodes.sort((a, b) => {
      if (a.sourceOnly !== b.sourceOnly) return a.sourceOnly ? 1 : -1;
      return sortById(a, b);
    });

    return {
      topo,
      nodes,
    };
  }

  function renderDistrict(svgRoot, district) {
    const frame = createSvgEl("rect", {
      x: district.x,
      y: district.y,
      width: district.w,
      height: district.h,
      rx: 18,
      fill: district.fill,
      stroke: "rgba(255,255,255,0.08)",
    });
    svgRoot.appendChild(frame);

    const title = createSvgEl("text", {
      x: district.x + 14,
      y: district.y + 18,
      class: "smap-district-title",
    });
    title.textContent = district.label;
    svgRoot.appendChild(title);

    for (let col = 1; col < district.cols; col += 1) {
      const x = district.x + DISTRICT_MARGIN + col * CELL_W - 12;
      const road = createSvgEl("line", {
        x1: x,
        y1: district.y + 30,
        x2: x,
        y2: district.y + district.h - 16,
        class: "smap-road",
      });
      svgRoot.appendChild(road);
    }

    for (let row = 1; row < district.rows; row += 1) {
      const y = district.y + 36 + row * CELL_H - 7;
      const road = createSvgEl("line", {
        x1: district.x + 12,
        y1: y,
        x2: district.x + district.w - 12,
        y2: y,
        class: "smap-road",
      });
      svgRoot.appendChild(road);
    }
  }

  function showPanel(node) {
    if (!panel) return;
    if (!node) {
      panel.dataset.open = "false";
      panel.innerHTML = "";
      return;
    }

    panel.innerHTML = `
      <h3>${displayName(node)}</h3>
      <p><strong>role</strong> · ${node.role}${node.sourceOnly ? " · source-only repository" : ""}</p>
      <p><strong>status</strong> · ${node.status}</p>
      <p><strong>district</strong> · ${DISTRICT_LAYOUT[node.district] ? DISTRICT_LAYOUT[node.district].label : node.district}</p>
      ${node.description ? `<p>${node.description}</p>` : ""}
      ${node.publicSurface ? `<p><strong>public</strong> · <code>${node.publicSurface}</code></p>` : ""}
    `;
    panel.dataset.open = "true";
  }

  function render() {
    const collected = collectNodes();
    const districts = buildNodeLayout(collected.nodes);
    const edges = buildEdgeList(collected.nodes, collected.topo);
    const kvNodes = buildKvNodes(collected.nodes, collected.topo);
    const nodeById = new Map(collected.nodes.map((node) => [node.id, node]));

    const nextSvg = createSvgEl("svg", {
      class: "atlas-system-map-svg",
      viewBox: `0 0 ${W} ${H}`,
      role: "img",
      "aria-label": "Atlas Systems map of public services, repositories, and estate links",
    });

    const districtsLayer = createSvgEl("g");
    const edgesLayer = createSvgEl("g");
    const kvLayer = createSvgEl("g");
    const nodesLayer = createSvgEl("g");

    districts.forEach((district) => renderDistrict(districtsLayer, district));

    edges.forEach((edge) => {
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      if (!from || !to) return;
      const style = EDGE_STYLE[edge.kind] || EDGE_STYLE.default;
      const line = createSvgEl("line", {
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        class: "smap-edge",
        stroke: style.stroke,
        "stroke-width": style.width,
        "stroke-dasharray": style.dash,
      });
      edgesLayer.appendChild(line);
    });

    kvNodes.forEach((kv) => {
      const line = createSvgEl("line", {
        x1: kv.x,
        y1: kv.y,
        x2: nodeById.get(kv.parent).x,
        y2: nodeById.get(kv.parent).y,
        class: "smap-edge",
        stroke: EDGE_STYLE.kv.stroke,
        "stroke-width": EDGE_STYLE.kv.width,
      });
      kvLayer.appendChild(line);

      const rect = createSvgEl("rect", {
        x: kv.x - 6,
        y: kv.y - 6,
        width: 12,
        height: 12,
        fill: "rgba(207,200,184,0.08)",
        stroke: "#cfc8b8",
      });
      kvLayer.appendChild(rect);

      const label = createSvgEl("text", {
        x: kv.x + 10,
        y: kv.y + 3,
        class: "smap-kv-label",
      });
      label.textContent = kv.label;
      kvLayer.appendChild(label);
    });

    collected.nodes.forEach((node) => {
      const group = createSvgEl("g", {
        class: "smap-node",
        "data-role": node.role,
        "data-status": node.status,
        tabindex: "0",
      });

      const shape = shapeSvg(node, node.x, node.y);
      const label = createSvgEl("text", {
        x: node.x,
        y: node.y - (node.role === "repo" ? 14 : 22),
        "text-anchor": "middle",
        class: "smap-node-label",
      });
      label.textContent = displayName(node);

      group.appendChild(shape);
      group.appendChild(label);

      group.addEventListener("mouseenter", function () {
        showPanel(node);
      });
      group.addEventListener("focus", function () {
        showPanel(node);
      });
      group.addEventListener("mouseleave", function () {
        showPanel(null);
      });
      group.addEventListener("blur", function () {
        showPanel(null);
      });

      nodesLayer.appendChild(group);
    });

    nextSvg.appendChild(districtsLayer);
    nextSvg.appendChild(edgesLayer);
    nextSvg.appendChild(kvLayer);
    nextSvg.appendChild(nodesLayer);

    if (svg) {
      svg.replaceWith(nextSvg);
    } else {
      host.innerHTML = "";
      host.appendChild(nextSvg);
      const nextPanel = document.createElement("div");
      nextPanel.className = "atlas-system-map-panel";
      host.appendChild(nextPanel);
      panel = nextPanel;
    }

    svg = nextSvg;
    renderState = {
      W,
      H,
      nodes: collected.nodes,
      edges,
      kv: kvNodes,
      districts,
    };

    subscriptions.forEach((fn) => fn(renderState));
  }

  function fallbackToSvg() {
    const layer = host.querySelector(".smap3d-layer");
    if (layer) layer.remove();
  }

  function bootViewModel() {
    window.AtlasMapVM = {
      getState() {
        return renderState || { W, H, nodes: [], edges: [], kv: [], districts: [] };
      },
      onUpdate(fn) {
        if (typeof fn === "function") subscriptions.push(fn);
      },
      openDetail(id) {
        if (!renderState) return;
        const node = renderState.nodes.find((entry) => entry.id === id);
        showPanel(node || null);
      },
      fallbackToSvg,
    };
  }

  function tryBoot3D() {
    const can3d =
      window.matchMedia &&
      window.matchMedia("(min-width: 1120px)").matches &&
      !(window.matchMedia("(prefers-reduced-motion: reduce)").matches) &&
      typeof WebGL2RenderingContext !== "undefined";

    if (!can3d) return;

    import(`/lab/system-map-scene.js?v=20260715-district-overhaul`).catch(function () {
      fallbackToSvg();
    });
  }

  function subscribeRegistry() {
    if (!window.AtlasRegistry || typeof window.AtlasRegistry.subscribe !== "function") {
      render();
      return;
    }

    window.AtlasRegistry.subscribe(function (snap) {
      if (snap && (snap.ok || snap.stale)) {
        lastSnap = snap;
      }
      render();
    });
  }

  injectStyles();
  host.style.position = "relative";
  host.style.minHeight = "760px";
  bootViewModel();
  subscribeRegistry();
  tryBoot3D();
})();
