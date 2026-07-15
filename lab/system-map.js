import {
  buildCityLayout,
  DISTRICT_ORDER,
} from "./system-map-layout.js?v=20260715-city-map-final";

const host = document.getElementById("system-map-host");
const statusLine = document.getElementById("system-map-statusline");
const banner = document.getElementById("system-map-banner");

if (!host) {
  throw new Error("System map host is missing.");
}

const EDGE_STYLE = {
  binding: { color: "#9aa4b4", width: 1.7, dash: "" },
  tunnel: { color: "#f5a623", width: 3.1, dash: "" },
  http: { color: "#48b9dc", width: 1.8, dash: "" },
  poll: { color: "#7d8fe0", width: 1.5, dash: "3 7" },
  probe: { color: "#d0ab58", width: 1.3, dash: "5 5" },
  dispatch: { color: "#b186ee", width: 1.7, dash: "9 6" },
  notify: { color: "#d277cf", width: 1.8, dash: "" },
  alert: { color: "#f06d4f", width: 1.9, dash: "" },
  kv: { color: "#d5d0c5", width: 1.2, dash: "" },
  default: { color: "#9aa4b4", width: 1.5, dash: "" },
};

const DISTRICT_LABEL = {
  surface: "surface ward",
  publicApi: "control plaza",
  source: "source quarter",
  observability: "ops yard",
  edge: "edge works",
  local: "local valley",
  external: "outer links",
};

const callbacks = [];
let data =
  window.ATLAS_SYSTEM_MAP_DATA || {
    graph: window.ATLAS_TOPOLOGY || {
      nodes: [],
      edges: [],
      kv: [],
    },
    snapshot: null,
    topology: null,
  };
let state = null;
let sceneController = null;
let mode = "flat";
let flatView = null;
let flatLayer = null;
let mobileList = null;
let detailPanel = null;
let threeButton = null;
let flatButton = null;
let resetButton = null;
let loading = null;

function canUse3D() {
  return (
    window.matchMedia("(min-width: 1120px)").matches &&
    !window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches &&
    typeof WebGL2RenderingContext !== "undefined"
  );
}

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS(
    "http://www.w3.org/2000/svg",
    name,
  );

  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) {
      element.setAttribute(key, String(value));
    }
  }

  return element;
}

function appendText(parent, text) {
  parent.appendChild(document.createTextNode(text));
}

function createShell() {
  host.replaceChildren();
  host.classList.add("smap-city-host");

  const toolbar = document.createElement("div");
  toolbar.className = "smap-view-toolbar";
  toolbar.setAttribute("aria-label", "System map view controls");

  threeButton = document.createElement("button");
  threeButton.type = "button";
  threeButton.className = "smap-view-button";
  threeButton.textContent = "3D view";
  threeButton.disabled = !canUse3D();
  threeButton.addEventListener("click", () => setMode("3d"));

  flatButton = document.createElement("button");
  flatButton.type = "button";
  flatButton.className = "smap-view-button";
  flatButton.textContent = "flat view";
  flatButton.addEventListener("click", () => setMode("flat"));

  resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "smap-view-button smap-view-reset";
  resetButton.textContent = "reset";
  resetButton.addEventListener("click", resetView);

  toolbar.append(threeButton, flatButton, resetButton);

  const stage = document.createElement("div");
  stage.className = "smap-city-stage";

  flatLayer = document.createElement("div");
  flatLayer.className = "smap-flat-layer";
  stage.appendChild(flatLayer);

  loading = document.createElement("div");
  loading.className = "smap-3d-loading";
  loading.textContent = "building estate districts…";
  stage.appendChild(loading);

  detailPanel = document.createElement("aside");
  detailPanel.className = "smap-city-detail";
  detailPanel.dataset.open = "false";
  detailPanel.setAttribute("aria-live", "polite");
  stage.appendChild(detailPanel);

  mobileList = document.createElement("div");
  mobileList.id = "system-map-list";
  mobileList.className = "smap-list";

  host.append(toolbar, stage, mobileList);
}

function updateToolbar() {
  threeButton.setAttribute(
    "aria-pressed",
    String(mode === "3d"),
  );
  flatButton.setAttribute(
    "aria-pressed",
    String(mode === "flat"),
  );
  host.dataset.mapMode = mode;
}

function setMode(nextMode) {
  if (nextMode === "3d" && !sceneController) {
    mode = canUse3D() ? "3d" : "flat";
  } else {
    mode = nextMode;
  }

  flatLayer.hidden = mode !== "flat";

  if (sceneController) {
    sceneController.setVisible(mode === "3d");
  }

  loading.hidden =
    mode !== "3d" || Boolean(sceneController);

  updateToolbar();
}

function resetView() {
  if (mode === "3d" && sceneController) {
    sceneController.reset();
    return;
  }

  if (flatView && state) {
    flatView = {
      x: 0,
      y: 0,
      width: state.width,
      height: state.height,
    };
    applyFlatViewBox();
  }
}

function pathData(points) {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`,
    )
    .join(" ");
}

function districtRoads(svg, district) {
  const innerX = district.x + 20;
  const innerY = district.y + 42;
  const innerWidth = district.w - 40;
  const cellWidth = innerWidth / district.cols;

  for (let column = 1; column < district.cols; column += 1) {
    svg.appendChild(
      createSvgElement("line", {
        x1: innerX + column * cellWidth,
        y1: district.y + 34,
        x2: innerX + column * cellWidth,
        y2: district.y + district.h - 12,
        class: "smap-district-road",
      }),
    );
  }

  for (let row = 1; row < district.rows; row += 1) {
    svg.appendChild(
      createSvgElement("line", {
        x1: district.x + 12,
        y1: innerY + row * 72,
        x2: district.x + district.w - 12,
        y2: innerY + row * 72,
        class: "smap-district-road",
      }),
    );
  }
}

function renderDistrict(svg, district) {
  const group = createSvgElement("g", {
    class: `smap-district smap-district-${district.key}`,
  });

  group.appendChild(
    createSvgElement("rect", {
      x: district.x,
      y: district.y,
      width: district.w,
      height: district.h,
      rx: 18,
      class: "smap-district-frame",
    }),
  );

  group.appendChild(
    createSvgElement("line", {
      x1: district.x + 12,
      y1: district.y + 30,
      x2: district.x + district.w - 12,
      y2: district.y + 30,
      class: "smap-district-header-line",
    }),
  );

  const title = createSvgElement("text", {
    x: district.x + 14,
    y: district.y + 20,
    class: "smap-district-title",
  });
  title.textContent = district.label;
  group.appendChild(title);
  districtRoads(group, district);
  svg.appendChild(group);
}

function appendMultilineLabel(group, node) {
  const label = createSvgElement("text", {
    x: node.x,
    y: node.y + 28,
    "text-anchor": "middle",
    class: "smap-node-label",
  });

  const text = String(node.label);
  const splitAt =
    text.length > 17
      ? Math.max(
          text.lastIndexOf("-", 17),
          text.lastIndexOf("_", 17),
        )
      : -1;

  if (splitAt > 4) {
    const first = createSvgElement("tspan", {
      x: node.x,
      dy: "0",
    });
    first.textContent = text.slice(0, splitAt + 1);

    const second = createSvgElement("tspan", {
      x: node.x,
      dy: "11",
    });
    second.textContent = text.slice(splitAt + 1);

    label.append(first, second);
  } else {
    label.textContent = text;
  }

  group.appendChild(label);
}

function nodeShape(node) {
  if (node.role === "site") {
    return createSvgElement("rect", {
      x: node.x - 15,
      y: node.y - 12,
      width: 30,
      height: 24,
      rx: 4,
      class: "smap-node-shape",
    });
  }

  if (node.role === "repo") {
    return createSvgElement("path", {
      d:
        `M ${node.x - 18} ${node.y - 9} ` +
        `H ${node.x + 18} V ${node.y + 9} ` +
        `H ${node.x - 18} Z ` +
        `M ${node.x - 12} ${node.y - 3} ` +
        `H ${node.x + 12}`,
      class: "smap-node-shape",
    });
  }

  if (node.role === "local") {
    return createSvgElement("polygon", {
      points: [
        [node.x, node.y - 15],
        [node.x + 15, node.y],
        [node.x, node.y + 15],
        [node.x - 15, node.y],
      ]
        .map((point) => point.join(","))
        .join(" "),
      class: "smap-node-shape",
    });
  }

  if (node.role === "ext") {
    return createSvgElement("polygon", {
      points: [
        [node.x, node.y - 14],
        [node.x + 14, node.y],
        [node.x, node.y + 14],
        [node.x - 14, node.y],
      ]
        .map((point) => point.join(","))
        .join(" "),
      class: "smap-node-shape",
    });
  }

  if (node.role === "infra") {
    return createSvgElement("rect", {
      x: node.x - 8,
      y: node.y - 8,
      width: 16,
      height: 16,
      class: "smap-node-shape",
    });
  }

  return createSvgElement("circle", {
    cx: node.x,
    cy: node.y,
    r: 15,
    class: "smap-node-shape",
  });
}

function clearEdgeHighlight() {
  flatLayer
    .querySelectorAll(".smap-route.is-related")
    .forEach((route) => route.classList.remove("is-related"));

  flatLayer
    .querySelectorAll(".smap-route.is-muted")
    .forEach((route) => route.classList.remove("is-muted"));
}

function highlightEdges(nodeId) {
  const routes = flatLayer.querySelectorAll(".smap-route");

  routes.forEach((route) => {
    const related =
      route.dataset.from === nodeId ||
      route.dataset.to === nodeId;

    route.classList.toggle("is-related", related);
    route.classList.toggle("is-muted", !related);
  });
}

function renderNode(svg, node) {
  const group = createSvgElement("g", {
    class: "smap-city-node",
    "data-role": node.role,
    "data-status": node.status,
    tabindex: "0",
  });

  group.appendChild(nodeShape(node));
  appendMultilineLabel(group, node);

  const open = () => {
    showDetail(node);
    highlightEdges(node.id);
  };

  const close = () => {
    clearDetail();
    clearEdgeHighlight();
  };

  group.addEventListener("mouseenter", open);
  group.addEventListener("focus", open);
  group.addEventListener("mouseleave", close);
  group.addEventListener("blur", close);
  group.addEventListener("click", (event) => {
    event.stopPropagation();
    showDetail(node);
    highlightEdges(node.id);
  });

  svg.appendChild(group);
}

function showDetail(node) {
  detailPanel.replaceChildren();

  const title = document.createElement("h3");
  title.textContent = node.label;

  const metadata = document.createElement("p");
  metadata.className = "smap-city-detail-meta";
  metadata.textContent =
    `${node.role}` +
    `${node.sourceOnly ? " · source-only repository" : ""}` +
    ` · ${DISTRICT_LABEL[node.district] || node.district}`;

  const status = document.createElement("p");
  status.className = `smap-city-detail-status is-${node.status}`;
  status.textContent = `status · ${node.status}`;

  detailPanel.append(title, metadata, status);

  if (node.description) {
    const description = document.createElement("p");
    description.textContent = node.description;
    detailPanel.appendChild(description);
  }

  if (node.repo) {
    const link = document.createElement("a");
    link.href = node.repo;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "open source ↗";
    detailPanel.appendChild(link);
  } else if (node.publicSurface) {
    const link = document.createElement("a");
    link.href = node.publicSurface;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "open public surface ↗";
    detailPanel.appendChild(link);
  }

  detailPanel.dataset.open = "true";
}

function clearDetail() {
  detailPanel.dataset.open = "false";
}

function renderFlat() {
  flatLayer.replaceChildren();

  const svg = createSvgElement("svg", {
    class: "smap-city-svg",
    viewBox: `0 0 ${state.width} ${state.height}`,
    role: "img",
    "aria-label":
      "Flat district map of the Atlas Systems estate",
  });

  const districtLayer = createSvgElement("g");
  const routeLayer = createSvgElement("g");
  const kvLayer = createSvgElement("g");
  const nodeLayer = createSvgElement("g");

  state.districts.forEach((district) =>
    renderDistrict(districtLayer, district),
  );

  state.edges.forEach((edge) => {
    const style = EDGE_STYLE[edge.kind] || EDGE_STYLE.default;
    const path = createSvgElement("path", {
      d: pathData(edge.route),
      class: `smap-route smap-route-${edge.kind}`,
      stroke: style.color,
      "stroke-width": style.width,
      "stroke-dasharray": style.dash,
      "data-from": edge.from,
      "data-to": edge.to,
    });
    routeLayer.appendChild(path);
  });

  state.kv.forEach((entry) => {
    kvLayer.appendChild(
      createSvgElement("path", {
        d: pathData(entry.route),
        class: "smap-route smap-route-kv",
        stroke: EDGE_STYLE.kv.color,
        "stroke-width": EDGE_STYLE.kv.width,
      }),
    );

    kvLayer.appendChild(
      createSvgElement("rect", {
        x: entry.x - 6,
        y: entry.y - 6,
        width: 12,
        height: 12,
        class: "smap-kv-node",
      }),
    );

    const label = createSvgElement("text", {
      x: entry.x + 10,
      y: entry.y + 3,
      class: "smap-kv-label",
    });
    label.textContent = entry.label;
    kvLayer.appendChild(label);
  });

  state.nodes.forEach((node) => renderNode(nodeLayer, node));

  svg.append(
    districtLayer,
    routeLayer,
    kvLayer,
    nodeLayer,
  );
  flatLayer.appendChild(svg);

  flatView = {
    x: 0,
    y: 0,
    width: state.width,
    height: state.height,
  };

  installFlatNavigation(svg);
}

function applyFlatViewBox() {
  const svg = flatLayer.querySelector(".smap-city-svg");

  if (!svg || !flatView) return;

  svg.setAttribute(
    "viewBox",
    `${flatView.x} ${flatView.y} ${flatView.width} ${flatView.height}`,
  );
}

function installFlatNavigation(svg) {
  let drag = null;

  svg.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".smap-city-node")) return;

    drag = {
      x: event.clientX,
      y: event.clientY,
      viewX: flatView.x,
      viewY: flatView.y,
    };
    svg.setPointerCapture(event.pointerId);
    svg.classList.add("is-panning");
  });

  svg.addEventListener("pointermove", (event) => {
    if (!drag) return;

    const rect = svg.getBoundingClientRect();
    const dx =
      ((event.clientX - drag.x) / rect.width) *
      flatView.width;
    const dy =
      ((event.clientY - drag.y) / rect.height) *
      flatView.height;

    flatView.x = drag.viewX - dx;
    flatView.y = drag.viewY - dy;
    applyFlatViewBox();
  });

  svg.addEventListener("pointerup", (event) => {
    drag = null;
    svg.releasePointerCapture(event.pointerId);
    svg.classList.remove("is-panning");
  });

  svg.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();

      const rect = svg.getBoundingClientRect();
      const pointerX =
        flatView.x +
        ((event.clientX - rect.left) / rect.width) *
          flatView.width;
      const pointerY =
        flatView.y +
        ((event.clientY - rect.top) / rect.height) *
          flatView.height;
      const scale = event.deltaY > 0 ? 1.12 : 0.89;
      const nextWidth = Math.max(
        state.width * 0.35,
        Math.min(state.width * 1.4, flatView.width * scale),
      );
      const nextHeight =
        nextWidth * (flatView.height / flatView.width);
      const ratioX =
        (pointerX - flatView.x) / flatView.width;
      const ratioY =
        (pointerY - flatView.y) / flatView.height;

      flatView.x = pointerX - ratioX * nextWidth;
      flatView.y = pointerY - ratioY * nextHeight;
      flatView.width = nextWidth;
      flatView.height = nextHeight;
      applyFlatViewBox();
    },
    { passive: false },
  );
}

function renderMobileList() {
  mobileList.replaceChildren();

  for (const districtKey of DISTRICT_ORDER) {
    const members = state.nodes.filter(
      (node) => node.district === districtKey,
    );

    if (!members.length) continue;

    const section = document.createElement("section");
    section.className = "smap-list-group";

    const heading = document.createElement("h3");
    heading.className = "smap-list-title";
    heading.textContent = DISTRICT_LABEL[districtKey];
    section.appendChild(heading);

    for (const node of members) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "smap-list-row";

      const dot = document.createElement("span");
      dot.className = `smap-list-dot is-${node.status}`;

      const name = document.createElement("strong");
      name.className = "smap-list-name";
      name.textContent = node.label;

      const description = document.createElement("span");
      description.className = "smap-list-desc";
      description.textContent =
        node.description ||
        (node.sourceOnly
          ? "public source repository"
          : node.role);

      row.append(dot, name, description);
      row.addEventListener("click", () => showDetail(node));
      section.appendChild(row);
    }

    mobileList.appendChild(section);
  }
}

function updateStatusLine() {
  if (!statusLine) return;

  const workers = state.nodes.filter(
    (node) => node.role === "worker",
  );
  const live = workers.filter(
    (node) => node.status === "live",
  ).length;
  const repositories = new Set(
    state.nodes
      .map((node) => node.repo)
      .filter(Boolean),
  ).size;
  const generatedAt =
    data.topology?.generated_at ||
    data.snapshot?.generatedAt ||
    null;
  const timestamp = generatedAt
    ? ` · topology ${String(generatedAt).slice(11, 16)}Z`
    : "";

  statusLine.textContent =
    `${workers.length} workers · ${live} live · ` +
    `${repositories} public repositories · ` +
    `${state.districts.length} districts${timestamp}`;
}

function renderAll() {
  const graph = data.graph || {
    nodes: [],
    edges: [],
    kv: [],
  };

  state = buildCityLayout(
    graph.nodes || [],
    graph.edges || [],
    graph.kv || [],
  );

  renderFlat();
  renderMobileList();
  updateStatusLine();

  callbacks.forEach((callback) => callback(state));

  if (sceneController) {
    sceneController.update(state);
  }
}

function register3D(controller) {
  sceneController = controller;
  threeButton.disabled = false;
  loading.hidden = true;
  controller.update(state);
  setMode(mode);
}

function fail3D(error) {
  console.warn("3D system map unavailable.", error);
  sceneController = null;
  threeButton.disabled = true;
  setMode("flat");

  if (banner) {
    banner.hidden = false;
    banner.textContent =
      "3D rendering is unavailable in this browser. The flat district map remains complete.";
  }
}

window.AtlasMapVM = {
  getState() {
    return state;
  },
  onUpdate(callback) {
    if (typeof callback === "function") callbacks.push(callback);
  },
  register3D,
  fail3D,
  setMode,
  openDetail(id) {
    const node = state?.nodes.find((candidate) => candidate.id === id);
    if (node) showDetail(node);
  },
  clearDetail,
};

window.addEventListener(
  "atlas:system-map-data",
  (event) => {
    data = event.detail;
    renderAll();
  },
);

createShell();
renderAll();

const preferredMode = canUse3D() ? "3d" : "flat";
setMode(preferredMode);

if (canUse3D()) {
  import(
    "/lab/system-map-scene.js?v=20260715-city-map-final"
  ).catch(fail3D);
}
