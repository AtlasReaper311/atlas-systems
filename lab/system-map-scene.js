import * as THREE from "./vendor/three/three.module.min.js";

const canBoot =
  typeof window !== "undefined" &&
  typeof document !== "undefined" &&
  window.AtlasMapVM &&
  document.getElementById("system-map-host");

if (canBoot) {
  try {
    boot(window.AtlasMapVM, document.getElementById("system-map-host"));
  } catch (error) {
    window.AtlasMapVM.fallbackToSvg();
  }
}

function injectStyles() {
  if (document.getElementById("atlas-system-map-3d-style")) return;

  const style = document.createElement("style");
  style.id = "atlas-system-map-3d-style";
  style.textContent = `
    .smap3d-layer {
      position: absolute;
      inset: 0;
      z-index: 2;
      background: transparent;
    }
    .smap3d-layer canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
    .smap3d-labels {
      position: absolute;
      inset: 0;
      pointer-events: none;
      font: 500 10px/1 "IBM Plex Mono", monospace;
      color: #aaa9a0;
    }
    .smap3d-label {
      position: absolute;
      transform: translate(-50%, -50%);
      white-space: nowrap;
      text-shadow: 0 0 16px rgba(10,10,15,0.95);
      opacity: 0.98;
    }
    .smap3d-toggle,
    .smap3d-reset {
      position: absolute;
      top: 12px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(17,17,24,0.92);
      color: #aaa9a0;
      font: 500 10px/1 "IBM Plex Mono", monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 8px 10px;
      cursor: pointer;
    }
    .smap3d-reset { right: 92px; }
    .smap3d-toggle { right: 12px; }
    .smap3d-hint {
      position: absolute;
      left: 16px;
      top: 14px;
      color: #555560;
      font: 500 10px/1 "IBM Plex Mono", monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      transition: opacity 0.18s ease;
    }
    .smap3d-hint-gone { opacity: 0; }
  `;
  document.head.appendChild(style);
}

const WORLD_SCALE = 0.028;

const DISTRICT_COLOR = {
  surface: 0xe8935c,
  publicApi: 0x4ade80,
  source: 0xf5a623,
  observability: 0xf5a623,
  edge: 0xf5a623,
  local: 0x48b9dc,
  external: 0x8a8a93,
};

const EDGE_COLOR = {
  binding: 0x9aa4b4,
  tunnel: 0xf5a623,
  http: 0x48b9dc,
  poll: 0x7d8fe0,
  probe: 0xd0ab58,
  dispatch: 0xb186ee,
  notify: 0xd277cf,
  alert: 0xf06d4f,
  kv: 0xd5d0c5,
  default: 0x9aa4b4,
};

function nodeRole(node) {
  if (node.role === "repo" || node.sourceOnly === true) return "repo";
  if (node.role === "site") return "site";
  if (node.role === "local") return "local";
  if (node.role === "ext") return "ext";
  if (node.role === "infra") return "infra";
  return "worker";
}

function nodeColor(node) {
  if (node.status === "down" || node.status === "degraded") return 0xe24b4a;
  if (node.status === "undoc" || node.status === "unknown") return 0xf5a623;
  if (node.role === "site") return 0xe8935c;
  if (node.role === "local") return 0x48b9dc;
  if (node.role === "ext") return 0x8a8a93;
  if (node.role === "repo") return 0xf5a623;
  return 0x4ade80;
}

function toWorld(x, y, W, H) {
  return {
    x: (x - W / 2) * WORLD_SCALE,
    z: (y - H / 2) * WORLD_SCALE,
  };
}

function buildDistrictMesh(scene, district, W, H) {
  const w = district.w * WORLD_SCALE;
  const h = district.h * WORLD_SCALE;
  const center = toWorld(district.x + district.w / 2, district.y + district.h / 2, W, H);

  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.08, h),
    new THREE.MeshStandardMaterial({
      color: 0x111118,
      roughness: 0.95,
      metalness: 0.02,
    }),
  );
  plate.position.set(center.x, 0.04, center.z);
  scene.add(plate);

  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.08, h)),
    new THREE.LineBasicMaterial({
      color: DISTRICT_COLOR[district.key] || 0xf5a623,
      transparent: true,
      opacity: 0.3,
    }),
  );
  frame.position.copy(plate.position);
  scene.add(frame);

  const roads = new THREE.Group();
  const roadMaterial = new THREE.LineBasicMaterial({
    color: 0x1b1b26,
    transparent: true,
    opacity: 0.85,
  });

  const cols = Math.max(1, district.cols || 1);
  const rows = Math.max(1, district.rows || 1);

  for (let col = 1; col < cols; col += 1) {
    const localX = (-w / 2) + (w / cols) * col;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(localX, 0.081, -h / 2 + 0.18),
      new THREE.Vector3(localX, 0.081, h / 2 - 0.18),
    ]);
    const line = new THREE.Line(geometry, roadMaterial);
    line.position.copy(plate.position);
    roads.add(line);
  }

  for (let row = 1; row < rows; row += 1) {
    const localZ = (-h / 2) + (h / rows) * row;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-w / 2 + 0.18, 0.081, localZ),
      new THREE.Vector3(w / 2 - 0.18, 0.081, localZ),
    ]);
    const line = new THREE.Line(geometry, roadMaterial);
    line.position.copy(plate.position);
    roads.add(line);
  }

  scene.add(roads);
}

function createNodeMesh(node) {
  const role = nodeRole(node);
  let geometry;
  let y = 0.22;

  if (role === "site") {
    geometry = new THREE.BoxGeometry(0.58, 0.12, 0.42);
    y = 0.08;
  } else if (role === "local") {
    geometry = new THREE.CylinderGeometry(0.18, 0.22, 0.48, 6);
    y = 0.24;
  } else if (role === "ext") {
    geometry = new THREE.OctahedronGeometry(0.18, 0);
    y = 0.22;
  } else if (role === "repo") {
    geometry = new THREE.BoxGeometry(0.38, 0.08, 0.22);
    y = 0.06;
  } else if (role === "infra") {
    geometry = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    y = 0.08;
  } else {
    geometry = new THREE.BoxGeometry(0.28, 0.62, 0.28);
    y = 0.31;
  }

  const material = new THREE.MeshStandardMaterial({
    color: 0x13131b,
    emissive: nodeColor(node),
    emissiveIntensity:
      node.status === "live" ? 0.55 : node.status === "down" ? 0.15 : 0.3,
    roughness: 0.9,
    metalness: 0.04,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData = { node };
  return { mesh, y };
}

function boot(vm, host) {
  injectStyles();

  const layer = document.createElement("div");
  layer.className = "smap3d-layer";

  const labelLayer = document.createElement("div");
  labelLayer.className = "smap3d-labels";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "smap3d-toggle";
  toggle.textContent = "flat view";
  toggle.setAttribute("aria-label", "Switch to the flat system map");

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "smap3d-reset";
  reset.textContent = "reset";
  reset.setAttribute("aria-label", "Reset the 3D system map view");

  const hint = document.createElement("div");
  hint.className = "smap3d-hint";
  hint.textContent = "drag orbit · shift-drag pan · wheel zoom · double-click focus";

  layer.appendChild(labelLayer);
  layer.appendChild(toggle);
  layer.appendChild(reset);
  layer.appendChild(hint);
  host.appendChild(layer);
  setTimeout(() => hint.classList.add("smap3d-hint-gone"), 5000);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x0a0a0f, 0);
  layer.insertBefore(renderer.domElement, labelLayer);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0a0f, 0.026);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 140);
  let target = new THREE.Vector3(0, 0, 0);
  let orbit = { yaw: 0.82, pitch: 0.65, distance: 25, panX: 0, panZ: 0 };
  let drag = null;

  scene.add(new THREE.AmbientLight(0x2a2a34, 1.75));
  const keyLight = new THREE.DirectionalLight(0xf5ead6, 1.05);
  keyLight.position.set(6, 10, 5);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x6d8daa, 0.24);
  fillLight.position.set(-6, 3, -7);
  scene.add(fillLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 70),
    new THREE.MeshStandardMaterial({ color: 0x0d0d13, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const boardGrid = new THREE.GridHelper(42, 28, 0x1d1d26, 0x12121a);
  boardGrid.material.transparent = true;
  boardGrid.material.opacity = 0.44;
  boardGrid.position.y = 0.01;
  scene.add(boardGrid);

  const districtsGroup = new THREE.Group();
  const nodesGroup = new THREE.Group();
  const edgesGroup = new THREE.Group();
  const kvGroup = new THREE.Group();
  scene.add(districtsGroup);
  scene.add(edgesGroup);
  scene.add(kvGroup);
  scene.add(nodesGroup);

  const nodeViews = [];
  const kvViews = [];

  function resize() {
    const rect = host.getBoundingClientRect();
    const width = Math.max(100, rect.width);
    const height = Math.max(560, rect.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function applyCamera() {
    const cosPitch = Math.cos(orbit.pitch);
    const x = Math.cos(orbit.yaw) * cosPitch * orbit.distance;
    const y = Math.sin(orbit.pitch) * orbit.distance;
    const z = Math.sin(orbit.yaw) * cosPitch * orbit.distance;
    camera.position.set(target.x + x + orbit.panX, target.y + y, target.z + z + orbit.panZ);
    camera.lookAt(target.x + orbit.panX, target.y, target.z + orbit.panZ);
  }

  function clearGroup(group) {
    while (group.children.length) {
      const child = group.children.pop();
      if (child.geometry) child.geometry.dispose();
      if (child.material && child.material.dispose) child.material.dispose();
      group.remove(child);
    }
  }

  function sync() {
    const state = vm.getState();
    clearGroup(districtsGroup);
    clearGroup(nodesGroup);
    clearGroup(edgesGroup);
    clearGroup(kvGroup);
    labelLayer.innerHTML = "";
    nodeViews.length = 0;
    kvViews.length = 0;

    (state.districts || []).forEach((district) => {
      buildDistrictMesh(districtsGroup, district, state.W, state.H);
    });

    const nodeById = new Map();
    (state.nodes || []).forEach((node) => {
      const point = toWorld(node.x, node.y, state.W, state.H);
      const built = createNodeMesh(node);
      built.mesh.position.set(point.x, built.y, point.z);
      nodesGroup.add(built.mesh);

      const label = document.createElement("span");
      label.className = "smap3d-label";
      label.textContent = node.label || node.id;
      labelLayer.appendChild(label);

      nodeViews.push({
        node,
        mesh: built.mesh,
        label,
      });
      nodeById.set(node.id, node);
    });

    (state.edges || []).forEach((edge) => {
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      if (!from || !to) return;
      const a = toWorld(from.x, from.y, state.W, state.H);
      const b = toWorld(to.x, to.y, state.W, state.H);
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a.x, 0.1, a.z),
        new THREE.Vector3(b.x, 0.1, b.z),
      ]);
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: EDGE_COLOR[edge.kind] || EDGE_COLOR.default,
          transparent: true,
          opacity: 0.82,
        }),
      );
      edgesGroup.add(line);
    });

    (state.kv || []).forEach((kv) => {
      const point = toWorld(kv.x, kv.y, state.W, state.H);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.08),
        new THREE.MeshStandardMaterial({
          color: 0x13131b,
          emissive: 0xcfc8b8,
          emissiveIntensity: 0.35,
          roughness: 1,
          metalness: 0,
        }),
      );
      mesh.position.set(point.x, 0.09, point.z);
      kvGroup.add(mesh);

      const label = document.createElement("span");
      label.className = "smap3d-label";
      label.textContent = kv.label;
      labelLayer.appendChild(label);
      kvViews.push({ kv, mesh, label });
    });
  }

  function projectLabels() {
    const rect = renderer.domElement.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    nodeViews.forEach((entry) => {
      const projected = entry.mesh.position.clone().project(camera);
      const visible = projected.z > -1 && projected.z < 1;
      entry.label.style.display = visible ? "block" : "none";
      if (!visible) return;
      entry.label.style.left = `${((projected.x + 1) * 0.5) * width}px`;
      entry.label.style.top = `${((-projected.y + 1) * 0.5) * height - 16}px`;
    });

    kvViews.forEach((entry) => {
      const projected = entry.mesh.position.clone().project(camera);
      const visible = projected.z > -1 && projected.z < 1;
      entry.label.style.display = visible ? "block" : "none";
      if (!visible) return;
      entry.label.style.left = `${((projected.x + 1) * 0.5) * width + 8}px`;
      entry.label.style.top = `${((-projected.y + 1) * 0.5) * height}px`;
    });
  }

  function animate() {
    requestAnimationFrame(animate);
    applyCamera();
    renderer.render(scene, camera);
    projectLabels();
  }

  renderer.domElement.addEventListener("pointerdown", function (event) {
    drag = {
      x: event.clientX,
      y: event.clientY,
      shift: event.shiftKey,
    };
  });

  window.addEventListener("pointerup", function () {
    drag = null;
  });

  window.addEventListener("pointermove", function (event) {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;

    if (drag.shift) {
      orbit.panX -= dx * 0.01;
      orbit.panZ -= dy * 0.01;
    } else {
      orbit.yaw -= dx * 0.006;
      orbit.pitch = Math.max(0.25, Math.min(1.2, orbit.pitch - dy * 0.005));
    }
  });

  renderer.domElement.addEventListener("wheel", function (event) {
    event.preventDefault();
    orbit.distance = Math.max(11, Math.min(42, orbit.distance + event.deltaY * 0.012));
  }, { passive: false });

  renderer.domElement.addEventListener("dblclick", function () {
    orbit = { yaw: 0.82, pitch: 0.65, distance: 25, panX: 0, panZ: 0 };
  });

  reset.addEventListener("click", function () {
    orbit = { yaw: 0.82, pitch: 0.65, distance: 25, panX: 0, panZ: 0 };
  });

  toggle.addEventListener("click", function () {
    vm.fallbackToSvg();
  });

  vm.onUpdate(sync);
  resize();
  sync();
  animate();
  window.addEventListener("resize", resize);
}
