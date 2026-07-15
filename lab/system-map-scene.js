import * as THREE from "./vendor/three/three.module.min.js";
import {
  clampTarget,
  clampZoom,
  createPanBounds,
  zoomTargetTowardPoint,
} from "./system-map-controls.js";

const vm =
  typeof window !== "undefined"
    ? window.AtlasMapVM
    : null;
const host =
  typeof document !== "undefined"
    ? document.getElementById("system-map-host")
    : null;

if (!vm || !host) {
  throw new Error("System map view model is unavailable.");
}

const WORLD_SCALE = 0.026;

const ROLE_COLOR = {
  worker: 0x4ade80,
  site: 0xe8935c,
  repo: 0xf5a623,
  local: 0x48b9dc,
  ext: 0x8a8a93,
  infra: 0xcfc8b8,
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

const DISTRICT_COLOR = {
  surface: 0xe8935c,
  publicApi: 0x4ade80,
  source: 0xf5a623,
  observability: 0xf5a623,
  edge: 0xf5a623,
  local: 0x48b9dc,
  external: 0x8a8a93,
};

function toWorld(point, state) {
  return new THREE.Vector3(
    (point.x - state.width / 2) * WORLD_SCALE,
    0,
    (point.y - state.height / 2) * WORLD_SCALE,
  );
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();

    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose());
    } else if (child.material) {
      child.material.dispose();
    }
  });
}

function clearGroup(group) {
  for (const child of [...group.children]) {
    group.remove(child);
    disposeObject(child);
  }
}

function statusColor(node) {
  if (node.status === "down" || node.status === "degraded") {
    return 0xe24b4a;
  }

  if (node.status === "undoc" || node.status === "unknown") {
    return 0xf5a623;
  }

  return ROLE_COLOR[node.role] || ROLE_COLOR.infra;
}

function createMaterials(node) {
  const accent = statusColor(node);

  return {
    body: new THREE.MeshStandardMaterial({
      color: 0x30303c,
      roughness: 0.74,
      metalness: 0.06,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: 0x303038,
      emissive: accent,
      emissiveIntensity:
        node.status === "live"
          ? 0.78
          : node.status === "down"
            ? 0.42
            : 0.58,
      roughness: 0.62,
      metalness: 0.08,
    }),
  };
}

function attachNodeData(object, node) {
  object.traverse((child) => {
    child.userData.node = node;
  });
  object.userData.node = node;
}

function workerBuilding(node) {
  const group = new THREE.Group();
  const materials = createMaterials(node);
  const height = 0.78 + (node.id.length % 4) * 0.11;

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, height, 0.46),
    materials.body,
  );
  base.position.y = height / 2;

  const core = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.12, 0.5),
    materials.accent,
  );
  core.position.y = height * 0.72;

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.08, 0.36),
    materials.accent.clone(),
  );
  roof.position.y = height + 0.04;
  roof.material.emissiveIntensity *= 0.7;

  group.add(base, core, roof);
  group.userData.labelY = height + 0.35;
  attachNodeData(group, node);
  return group;
}

function repositoryBuilding(node) {
  const group = new THREE.Group();
  const materials = createMaterials(node);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.22, 0.42),
    materials.body,
  );
  body.position.y = 0.11;

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(0.66, 0.06, 0.46),
    materials.accent,
  );
  roof.position.y = 0.25;

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.02),
    materials.accent.clone(),
  );
  door.position.set(0, 0.08, 0.22);

  group.add(body, roof, door);
  group.userData.labelY = 0.62;
  attachNodeData(group, node);
  return group;
}

function siteBuilding(node) {
  const group = new THREE.Group();
  const materials = createMaterials(node);

  const plaza = new THREE.Mesh(
    new THREE.BoxGeometry(0.76, 0.12, 0.52),
    materials.body,
  );
  plaza.position.y = 0.06;

  const frontage = new THREE.Mesh(
    new THREE.BoxGeometry(0.78, 0.08, 0.08),
    materials.accent,
  );
  frontage.position.set(0, 0.14, 0.22);

  group.add(plaza, frontage);
  group.userData.labelY = 0.52;
  attachNodeData(group, node);
  return group;
}

function localBuilding(node) {
  const group = new THREE.Group();
  const materials = createMaterials(node);

  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.32, 0.68, 6),
    materials.body,
  );
  tower.position.y = 0.34;

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.08, 6),
    materials.accent,
  );
  cap.position.y = 0.7;

  group.add(tower, cap);
  group.userData.labelY = 1.05;
  attachNodeData(group, node);
  return group;
}

function externalBuilding(node) {
  const group = new THREE.Group();
  const materials = createMaterials(node);

  const beacon = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.26, 0),
    materials.accent,
  );
  beacon.position.y = 0.36;

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.24, 0.12, 6),
    materials.body,
  );
  base.position.y = 0.06;

  group.add(base, beacon);
  group.userData.labelY = 0.82;
  attachNodeData(group, node);
  return group;
}

function infraBuilding(node) {
  const group = new THREE.Group();
  const materials = createMaterials(node);

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.3),
    materials.body,
  );
  base.position.y = 0.15;

  const light = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.06, 0.22),
    materials.accent,
  );
  light.position.y = 0.33;

  group.add(base, light);
  group.userData.labelY = 0.7;
  attachNodeData(group, node);
  return group;
}

function createBuilding(node) {
  let building;

  if (node.role === "repo") building = repositoryBuilding(node);
  else if (node.role === "site") building = siteBuilding(node);
  else if (node.role === "local") building = localBuilding(node);
  else if (node.role === "ext") building = externalBuilding(node);
  else if (node.role === "infra") building = infraBuilding(node);
  else building = workerBuilding(node);

  return building;
}

function polylineGeometry(points) {
  return new THREE.BufferGeometry().setFromPoints(points);
}

function routePointAt(route, progress) {
  if (route.length < 2) return route[0] || new THREE.Vector3();

  const lengths = [];
  let total = 0;

  for (let index = 1; index < route.length; index += 1) {
    const length = route[index - 1].distanceTo(route[index]);
    lengths.push(length);
    total += length;
  }

  let remaining = progress * total;

  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index]) {
      const local =
        lengths[index] === 0
          ? 0
          : remaining / lengths[index];
      return route[index]
        .clone()
        .lerp(route[index + 1], local);
    }

    remaining -= lengths[index];
  }

  return route[route.length - 1].clone();
}

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;

  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(
    48,
    48,
    2,
    48,
    48,
    46,
  );
  gradient.addColorStop(0, "rgba(255,255,255,0.92)");
  gradient.addColorStop(0.28, "rgba(255,255,255,0.5)");
  gradient.addColorStop(0.68, "rgba(255,255,255,0.12)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 96, 96);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildScene() {
  const stage = host.querySelector(".smap-city-stage");
  const layer = document.createElement("div");
  layer.className = "smap3d-layer";
  layer.hidden = true;

  const labels = document.createElement("div");
  labels.className = "smap3d-label-layer";

  const hint = document.createElement("div");
  hint.className = "smap3d-hint";
  hint.textContent =
    "drag move · alt/right-drag orbit · wheel zoom · double-click focus";
  hint.setAttribute("role", "note");

  layer.append(labels, hint);
  stage.insertBefore(layer, stage.firstChild);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, 1.5),
  );
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.32;
  renderer.setClearColor(0x13131d, 1);
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute(
    "aria-label",
    "Interactive 3D system map. Drag to move, Alt-drag or right-drag to orbit, use the wheel to zoom, and double-click a node to focus it.",
  );
  layer.insertBefore(renderer.domElement, labels);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x13131d, 0.0095);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 180);
  const target = new THREE.Vector3();
  const orbit = {
    yaw: 0.82,
    pitch: 0.68,
    distance: 24,
  };

  scene.add(new THREE.HemisphereLight(0xc8d5e8, 0x33263f, 1.34));
  scene.add(new THREE.AmbientLight(0x808090, 0.82));

  const keyLight = new THREE.DirectionalLight(0xfff0d6, 1.52);
  keyLight.position.set(8, 12, 6);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x80a9c7, 0.68);
  fillLight.position.set(-7, 4, -8);
  scene.add(fillLight);

  const glowTexture = createGlowTexture();

  const boardGroup = new THREE.Group();
  const districtGroup = new THREE.Group();
  const routeGroup = new THREE.Group();
  const buildingGroup = new THREE.Group();
  const kvGroup = new THREE.Group();
  const particleGroup = new THREE.Group();

  scene.add(
    boardGroup,
    districtGroup,
    routeGroup,
    buildingGroup,
    kvGroup,
    particleGroup,
  );

  let currentState = null;
  let visible = false;
  let drag = null;
  let defaultOrbit = null;
  let panBounds = null;
  let hovered = null;
  let particleGeometry = null;
  let particleRoutes = [];
  const nodeViews = [];
  const districtViews = [];
  const kvViews = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const groundPlane = new THREE.Plane(
    new THREE.Vector3(0, 1, 0),
    0,
  );
  const activePointers = new Map();
  let pinch = null;

  function fitCamera(state) {
    const width = state.width * WORLD_SCALE;
    const height = state.height * WORLD_SCALE;
    const aspect = Math.max(0.6, camera.aspect);
    const verticalFov =
      (camera.fov * Math.PI) / 180;
    const fitHeight =
      height / (2 * Math.tan(verticalFov / 2));
    const fitWidth =
      width /
      (2 * Math.tan(verticalFov / 2) * aspect);
    const distance = Math.max(fitHeight, fitWidth) * 1.34;

    defaultOrbit = {
      yaw: 0.82,
      pitch: 0.68,
      distance: Math.max(16, distance),
    };
    panBounds = createPanBounds(state, WORLD_SCALE);

    Object.assign(orbit, defaultOrbit);
    target.set(0, 0, 0);
  }

  function buildGround(state) {
    clearGroup(boardGroup);

    const width = state.width * WORLD_SCALE + 4;
    const height = state.height * WORLD_SCALE + 4;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshStandardMaterial({
        color: 0x1e1e29,
        roughness: 0.88,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    boardGroup.add(ground);

    const grid = new THREE.GridHelper(
      Math.max(width, height),
      34,
      0x343441,
      0x20202b,
    );
    grid.material.transparent = true;
    grid.material.opacity = 0.62;
    grid.position.y = 0;
    boardGroup.add(grid);
  }

  function buildDistricts(state) {
    clearGroup(districtGroup);
    districtViews.length = 0;

    for (const district of state.districts) {
      const width = district.w * WORLD_SCALE;
      const height = district.h * WORLD_SCALE;
      const centre = toWorld(
        {
          x: district.x + district.w / 2,
          y: district.y + district.h / 2,
        },
        state,
      );

      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.08, height),
        new THREE.MeshStandardMaterial({
          color: 0x24242f,
          roughness: 0.88,
          metalness: 0.02,
        }),
      );
      plate.position.set(centre.x, 0.04, centre.z);
      districtGroup.add(plate);

      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(
          new THREE.BoxGeometry(width, 0.08, height),
        ),
        new THREE.LineBasicMaterial({
          color:
            DISTRICT_COLOR[district.key] || 0xf5a623,
          transparent: true,
          opacity: 0.62,
        }),
      );
      outline.position.copy(plate.position);
      districtGroup.add(outline);

      const roadMaterial = new THREE.LineBasicMaterial({
        color: 0x464655,
        transparent: true,
        opacity: 0.96,
      });
      const innerX = district.x + 20;
      const innerY = district.y + 42;
      const innerWidth = district.w - 40;
      const cellWidth = innerWidth / district.cols;

      for (
        let column = 1;
        column < district.cols;
        column += 1
      ) {
        const x = innerX + column * cellWidth;
        const start = toWorld(
          { x, y: district.y + 34 },
          state,
        );
        const end = toWorld(
          { x, y: district.y + district.h - 12 },
          state,
        );
        start.y = 0.091;
        end.y = 0.091;
        districtGroup.add(
          new THREE.Line(
            polylineGeometry([start, end]),
            roadMaterial,
          ),
        );
      }

      for (let row = 1; row < district.rows; row += 1) {
        const y = innerY + row * 72;
        const start = toWorld(
          { x: district.x + 12, y },
          state,
        );
        const end = toWorld(
          { x: district.x + district.w - 12, y },
          state,
        );
        start.y = 0.091;
        end.y = 0.091;
        districtGroup.add(
          new THREE.Line(
            polylineGeometry([start, end]),
            roadMaterial,
          ),
        );
      }

      const label = document.createElement("span");
      label.className =
        "smap3d-label smap3d-district-label";
      label.textContent = district.label;
      labels.appendChild(label);

      districtViews.push({
        label,
        priority: 120,
        world: new THREE.Vector3(
          centre.x,
          0.22,
          centre.z - height / 2 + 0.25,
        ),
      });
    }
  }

  function buildRoutes(state) {
    clearGroup(routeGroup);
    clearGroup(particleGroup);
    particleRoutes = [];

    for (const edge of state.edges) {
      const points = edge.route.map((point) => {
        const world = toWorld(point, state);
        world.y = edge.kind === "tunnel" ? 0.17 : 0.12;
        return world;
      });

      const line = new THREE.Line(
        polylineGeometry(points),
        new THREE.LineBasicMaterial({
          color: EDGE_COLOR[edge.kind] || EDGE_COLOR.default,
          transparent: true,
          opacity: edge.kind === "probe" ? 0.52 : 0.86,
        }),
      );
      routeGroup.add(line);

      particleRoutes.push({
        edge,
        points,
        phase:
          (edge.from.length + edge.to.length) % 17 / 17,
        speed:
          edge.kind === "tunnel"
            ? 0.11
            : edge.kind === "probe"
              ? 0.045
              : 0.07,
      });
    }

    if (!particleRoutes.length) return;

    particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        new Float32Array(particleRoutes.length * 3),
        3,
      ),
    );

    const colours = new Float32Array(
      particleRoutes.length * 3,
    );

    particleRoutes.forEach((route, index) => {
      const color = new THREE.Color(
        EDGE_COLOR[route.edge.kind] ||
          EDGE_COLOR.default,
      );
      colours[index * 3] = color.r;
      colours[index * 3 + 1] = color.g;
      colours[index * 3 + 2] = color.b;
    });

    particleGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(colours, 3),
    );

    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        size: 0.11,
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      }),
    );
    particleGroup.add(particles);
  }

  function nodeGlow(node) {
    const opacity =
      node.status === "live"
        ? 0.28
        : node.status === "down" || node.status === "degraded"
          ? 0.25
          : 0.22;
    const size =
      node.role === "repo" || node.role === "site"
        ? 2.05
        : node.role === "local"
          ? 2.15
          : 1.9;
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({
        color: statusColor(node),
        map: glowTexture,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );

    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.015;
    glow.renderOrder = 1;
    glow.raycast = () => {};
    glow.userData.baseOpacity = opacity;
    return glow;
  }

  function buildBuildings(state) {
    clearGroup(buildingGroup);
    nodeViews.length = 0;

    for (const node of state.nodes) {
      const building = createBuilding(node);
      const glow = nodeGlow(node);
      building.add(glow);
      building.userData.glow = glow;
      const position = toWorld(node, state);
      building.position.set(
        position.x,
        0.09,
        position.z,
      );
      buildingGroup.add(building);

      const label = document.createElement("span");
      label.className = "smap3d-label smap3d-node-label";
      label.textContent = node.label;
      labels.appendChild(label);

      nodeViews.push({
        node,
        building,
        label,
        priority:
          node.role === "worker"
            ? 90
            : node.role === "site" ||
                node.role === "local"
              ? 80
              : node.role === "repo"
                ? 28
                : 55,
      });
    }
  }

  function setHoveredNode(node) {
    hovered = node;

    for (const view of nodeViews) {
      const glow = view.building.userData.glow;
      if (!glow) continue;

      const baseOpacity = glow.userData.baseOpacity || 0.22;
      glow.material.opacity =
        node?.id === view.node.id
          ? Math.min(0.42, baseOpacity * 1.42)
          : baseOpacity;
    }
  }

  function buildKv(state) {
    clearGroup(kvGroup);
    kvViews.length = 0;

    for (const entry of state.kv) {
      const position = toWorld(entry, state);
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.12),
        new THREE.MeshStandardMaterial({
          color: 0x15151c,
          emissive: 0xcfc8b8,
          emissiveIntensity: 0.34,
          roughness: 1,
        }),
      );
      crate.position.set(position.x, 0.15, position.z);
      kvGroup.add(crate);

      const label = document.createElement("span");
      label.className = "smap3d-label smap3d-kv-label";
      label.textContent = entry.label;
      labels.appendChild(label);

      kvViews.push({
        label,
        priority: 20,
        world: crate.position,
      });
    }
  }

  function update(state) {
    if (!state) return;

    currentState = state;
    labels.replaceChildren();
    buildGround(state);
    buildDistricts(state);
    buildRoutes(state);
    buildBuildings(state);
    buildKv(state);
    fitCamera(state);
    resize();
  }

  function resize() {
    const rectangle = layer.getBoundingClientRect();
    const width = Math.max(100, rectangle.width);
    const height = Math.max(560, rectangle.height);

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function applyCamera() {
    const cosPitch = Math.cos(orbit.pitch);
    const x =
      Math.cos(orbit.yaw) *
      cosPitch *
      orbit.distance;
    const y =
      Math.sin(orbit.pitch) *
      orbit.distance;
    const z =
      Math.sin(orbit.yaw) *
      cosPitch *
      orbit.distance;

    camera.position.set(
      target.x + x,
      target.y + y,
      target.z + z,
    );
    camera.lookAt(target);
  }

  function project(world) {
    const projected = world.clone().project(camera);
    const rectangle = renderer.domElement.getBoundingClientRect();

    return {
      visible: projected.z > -1 && projected.z < 1,
      x: ((projected.x + 1) * 0.5) * rectangle.width,
      y: ((-projected.y + 1) * 0.5) * rectangle.height,
    };
  }

  function overlaps(a, b, padding = 5) {
    return !(
      a.right + padding < b.left ||
      a.left - padding > b.right ||
      a.bottom + padding < b.top ||
      a.top - padding > b.bottom
    );
  }

  function placeLabels() {
    const candidates = [];

    for (const view of districtViews) {
      candidates.push({
        ...view,
        text: view.label.textContent,
        force: true,
      });
    }

    for (const view of nodeViews) {
      const world = view.building.position
        .clone()
        .add(
          new THREE.Vector3(
            0,
            view.building.userData.labelY || 0.8,
            0,
          ),
        );
      const isHovered = hovered?.id === view.node.id;
      const sourceVisible =
        view.node.role !== "repo" ||
        orbit.distance <
          Math.max(12, defaultOrbit.distance * 0.72) ||
        isHovered;

      if (!sourceVisible) {
        view.label.hidden = true;
        continue;
      }

      candidates.push({
        ...view,
        world,
        text: view.node.label,
        priority: isHovered ? 220 : view.priority,
        force: isHovered,
      });
    }

    for (const view of kvViews) {
      if (
        orbit.distance >
        Math.max(11, defaultOrbit.distance * 0.62)
      ) {
        view.label.hidden = true;
        continue;
      }

      candidates.push({
        ...view,
        text: view.label.textContent,
      });
    }

    candidates.sort(
      (a, b) => b.priority - a.priority,
    );

    const placed = [];

    for (const candidate of candidates) {
      const screen = project(candidate.world);

      if (!screen.visible) {
        candidate.label.hidden = true;
        continue;
      }

      const width =
        Math.max(36, candidate.text.length * 6.2 + 10);
      const height = 16;
      const box = {
        left: screen.x - width / 2,
        right: screen.x + width / 2,
        top: screen.y - height,
        bottom: screen.y,
      };
      const blocked =
        !candidate.force &&
        placed.some((other) => overlaps(box, other));

      candidate.label.hidden = blocked;

      if (blocked) continue;

      candidate.label.style.left = `${screen.x}px`;
      candidate.label.style.top = `${screen.y - 10}px`;
      placed.push(box);
    }
  }

  function updateParticles(time) {
    if (!particleGeometry) return;

    const positions =
      particleGeometry.attributes.position.array;

    particleRoutes.forEach((route, index) => {
      const progress =
        (route.phase + time * route.speed) % 1;
      const point = routePointAt(route.points, progress);
      positions[index * 3] = point.x;
      positions[index * 3 + 1] = point.y + 0.04;
      positions[index * 3 + 2] = point.z;
    });

    particleGeometry.attributes.position.needsUpdate = true;
  }

  function setPointer(clientX, clientY) {
    const rectangle =
      renderer.domElement.getBoundingClientRect();

    pointer.x =
      ((clientX - rectangle.left) /
        rectangle.width) *
        2 -
      1;
    pointer.y =
      -(
        (clientY - rectangle.top) /
        rectangle.height
      ) *
        2 +
      1;
  }

  function raycast(event) {
    setPointer(event.clientX, event.clientY);

    raycaster.setFromCamera(pointer, camera);

    const intersection = raycaster
      .intersectObjects(buildingGroup.children, true)
      .find((result) => result.object.userData.node);

    return intersection?.object.userData.node || null;
  }

  function groundPoint(clientX, clientY) {
    setPointer(clientX, clientY);
    raycaster.setFromCamera(pointer, camera);

    const intersection = new THREE.Vector3();
    return raycaster.ray.intersectPlane(
      groundPlane,
      intersection,
    )
      ? intersection
      : null;
  }

  function setBoundedTarget(nextTarget) {
    const bounded = clampTarget(nextTarget, panBounds);
    target.set(bounded.x, 0, bounded.z);
  }

  function panFromScreenDelta(
    startTarget,
    dx,
    dy,
    referenceDistance,
  ) {
    camera.updateMatrixWorld();

    const right = new THREE.Vector3()
      .setFromMatrixColumn(camera.matrixWorld, 0);
    right.y = 0;
    right.normalize();

    const screenUp = new THREE.Vector3()
      .setFromMatrixColumn(camera.matrixWorld, 1);
    screenUp.y = 0;

    if (screenUp.lengthSq() < 0.0001) {
      screenUp.set(-right.z, 0, right.x);
    } else {
      screenUp.normalize();
    }

    const rectangle =
      renderer.domElement.getBoundingClientRect();
    const worldPerPixel =
      (2 *
        Math.tan((camera.fov * Math.PI) / 360) *
        referenceDistance) /
      Math.max(1, rectangle.height);
    const nextTarget = startTarget
      .clone()
      .addScaledVector(right, -dx * worldPerPixel)
      .addScaledVector(screenUp, dy * worldPerPixel);

    setBoundedTarget(nextTarget);
  }

  function pointerSnapshot(event) {
    return {
      id: event.pointerId,
      type: event.pointerType,
      x: event.clientX,
      y: event.clientY,
    };
  }

  function touchMetrics() {
    const touches = [...activePointers.values()].filter(
      (entry) => entry.type === "touch",
    );

    if (touches.length < 2) return null;

    const [first, second] = touches;
    return {
      distance: Math.hypot(
        second.x - first.x,
        second.y - first.y,
      ),
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    };
  }

  function startPinch() {
    const metrics = touchMetrics();
    if (!metrics) return;

    pinch = {
      ...metrics,
      orbitDistance: orbit.distance,
      target: target.clone(),
      point: groundPoint(metrics.x, metrics.y),
    };
    drag = null;
    renderer.domElement.classList.remove("is-moving");
    renderer.domElement.classList.add("is-zooming");
  }

  function finishPointer(event) {
    activePointers.delete(event.pointerId);

    if (
      renderer.domElement.hasPointerCapture(event.pointerId)
    ) {
      renderer.domElement.releasePointerCapture(
        event.pointerId,
      );
    }

    const remainingTouches = [
      ...activePointers.values(),
    ].filter((entry) => entry.type === "touch");

    pinch = null;
    renderer.domElement.classList.remove("is-zooming");

    if (remainingTouches.length === 1) {
      const remaining = remainingTouches[0];
      drag = {
        pointerId: remaining.id,
        mode: "pan",
        x: remaining.x,
        y: remaining.y,
        target: target.clone(),
        distance: orbit.distance,
      };
      renderer.domElement.classList.add("is-moving");
      return;
    }

    drag = null;
    renderer.domElement.classList.remove(
      "is-moving",
      "is-orbiting",
    );
  }

  renderer.domElement.addEventListener(
    "pointermove",
    (event) => {
      activePointers.set(
        event.pointerId,
        pointerSnapshot(event),
      );

      if (pinch) {
        const metrics = touchMetrics();
        if (!metrics || !defaultOrbit) return;

        const nextDistance = clampZoom(
          pinch.orbitDistance *
            (pinch.distance / Math.max(1, metrics.distance)),
          defaultOrbit.distance,
        );
        const zoomedTarget = zoomTargetTowardPoint({
          target: pinch.target,
          point: pinch.point,
          previousDistance: pinch.orbitDistance,
          nextDistance,
          bounds: panBounds,
        });

        orbit.distance = nextDistance;
        panFromScreenDelta(
          new THREE.Vector3(
            zoomedTarget.x,
            0,
            zoomedTarget.z,
          ),
          metrics.x - pinch.x,
          metrics.y - pinch.y,
          pinch.orbitDistance,
        );
        return;
      }

      if (drag?.pointerId === event.pointerId) {
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;

        if (drag.mode === "orbit") {
          orbit.yaw = drag.yaw - dx * 0.006;
          orbit.pitch = Math.max(
            0.28,
            Math.min(1.18, drag.pitch - dy * 0.005),
          );
        } else {
          panFromScreenDelta(
            drag.target,
            dx,
            dy,
            drag.distance,
          );
        }

        return;
      }

      const node = raycast(event);

      if (node?.id === hovered?.id) return;

      setHoveredNode(node);

      if (node) {
        vm.openDetail(node.id);
      } else {
        vm.clearDetail();
      }
    },
  );

  renderer.domElement.addEventListener(
    "pointerleave",
    () => {
      if (drag || pinch) return;
      setHoveredNode(null);
      vm.clearDetail();
    },
  );

  renderer.domElement.addEventListener(
    "pointerdown",
    (event) => {
      if (
        event.pointerType !== "touch" &&
        event.button !== 0 &&
        event.button !== 2
      ) {
        return;
      }

      event.preventDefault();
      activePointers.set(
        event.pointerId,
        pointerSnapshot(event),
      );
      renderer.domElement.setPointerCapture(
        event.pointerId,
      );

      if (
        event.pointerType === "touch" &&
        touchMetrics()
      ) {
        startPinch();
        return;
      }

      const mode =
        event.button === 2 || event.altKey
          ? "orbit"
          : "pan";
      drag = {
        pointerId: event.pointerId,
        mode,
        x: event.clientX,
        y: event.clientY,
        target: target.clone(),
        distance: orbit.distance,
        yaw: orbit.yaw,
        pitch: orbit.pitch,
      };
      renderer.domElement.classList.toggle(
        "is-orbiting",
        mode === "orbit",
      );
      renderer.domElement.classList.toggle(
        "is-moving",
        mode === "pan",
      );
    },
  );

  renderer.domElement.addEventListener(
    "pointerup",
    finishPointer,
  );
  renderer.domElement.addEventListener(
    "pointercancel",
    finishPointer,
  );
  renderer.domElement.addEventListener(
    "contextmenu",
    (event) => event.preventDefault(),
  );

  renderer.domElement.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      if (!defaultOrbit) return;

      applyCamera();
      camera.updateMatrixWorld();

      const previousDistance = orbit.distance;
      const nextDistance = clampZoom(
        previousDistance * Math.exp(event.deltaY * 0.00125),
        defaultOrbit.distance,
      );
      const nextTarget = zoomTargetTowardPoint({
        target,
        point: groundPoint(event.clientX, event.clientY),
        previousDistance,
        nextDistance,
        bounds: panBounds,
      });

      orbit.distance = nextDistance;
      target.set(nextTarget.x, 0, nextTarget.z);
    },
    { passive: false },
  );

  renderer.domElement.addEventListener(
    "dblclick",
    (event) => {
      const node = raycast(event);

      if (!node || !currentState) {
        reset();
        return;
      }

      const position = toWorld(node, currentState);
      setBoundedTarget(position);
      orbit.distance = clampZoom(
        defaultOrbit.distance * 0.42,
        defaultOrbit.distance,
      );
      vm.openDetail(node.id);
    },
  );

  function reset() {
    if (!defaultOrbit) return;

    Object.assign(orbit, defaultOrbit);
    target.set(0, 0, 0);
    setHoveredNode(null);
    vm.clearDetail();
  }

  function setVisible(nextVisible) {
    visible = nextVisible;
    layer.hidden = !nextVisible;

    if (nextVisible) {
      resize();
    }
  }

  let previous = performance.now();

  function animate(now) {
    requestAnimationFrame(animate);

    if (!visible) {
      previous = now;
      return;
    }

    const elapsed = Math.min(0.05, (now - previous) / 1000);
    previous = now;
    applyCamera();
    updateParticles(now / 1000 + elapsed);
    renderer.render(scene, camera);
    placeLabels();
  }

  window.addEventListener("resize", resize);
  requestAnimationFrame(animate);

  return {
    update,
    setVisible,
    reset,
  };
}

try {
  const controller = buildScene();
  vm.register3D(controller);
} catch (error) {
  vm.fail3D(error);
}
