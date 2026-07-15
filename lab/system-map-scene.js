import * as THREE from "./vendor/three/three.module.min.js";

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
      color: 0x14141c,
      roughness: 0.92,
      metalness: 0.04,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: 0x181820,
      emissive: accent,
      emissiveIntensity:
        node.status === "live"
          ? 0.72
          : node.status === "down"
            ? 0.16
            : 0.38,
      roughness: 0.72,
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
  if (node.role === "repo") return repositoryBuilding(node);
  if (node.role === "site") return siteBuilding(node);
  if (node.role === "local") return localBuilding(node);
  if (node.role === "ext") return externalBuilding(node);
  if (node.role === "infra") return infraBuilding(node);
  return workerBuilding(node);
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
    "drag orbit · shift-drag pan · wheel zoom · double-click focus";

  layer.append(labels, hint);
  stage.insertBefore(layer, stage.firstChild);
  window.setTimeout(
    () => hint.classList.add("is-hidden"),
    5200,
  );

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, 1.5),
  );
  renderer.setClearColor(0x0a0a0f, 1);
  layer.insertBefore(renderer.domElement, labels);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0a0f, 0.022);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 180);
  const target = new THREE.Vector3();
  const orbit = {
    yaw: 0.82,
    pitch: 0.68,
    distance: 24,
    panX: 0,
    panZ: 0,
  };

  scene.add(new THREE.AmbientLight(0x2a2a34, 1.85));

  const keyLight = new THREE.DirectionalLight(0xf5ead6, 1.1);
  keyLight.position.set(8, 12, 6);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x7895aa, 0.28);
  fillLight.position.set(-7, 4, -8);
  scene.add(fillLight);

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
  let hovered = null;
  let particleGeometry = null;
  let particleRoutes = [];
  const nodeViews = [];
  const districtViews = [];
  const kvViews = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

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
      panX: 0,
      panZ: 0,
    };

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
        color: 0x0d0d13,
        roughness: 1,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    boardGroup.add(ground);

    const grid = new THREE.GridHelper(
      Math.max(width, height),
      34,
      0x1d1d26,
      0x12121a,
    );
    grid.material.transparent = true;
    grid.material.opacity = 0.42;
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
          color: 0x111118,
          roughness: 0.96,
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
          opacity: 0.36,
        }),
      );
      outline.position.copy(plate.position);
      districtGroup.add(outline);

      const roadMaterial = new THREE.LineBasicMaterial({
        color: 0x23232d,
        transparent: true,
        opacity: 0.88,
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

  function buildBuildings(state) {
    clearGroup(buildingGroup);
    nodeViews.length = 0;

    for (const node of state.nodes) {
      const building = createBuilding(node);
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
      target.x + x + orbit.panX,
      target.y + y,
      target.z + z + orbit.panZ,
    );
    camera.lookAt(
      target.x + orbit.panX,
      target.y,
      target.z + orbit.panZ,
    );
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

  function raycast(event) {
    const rectangle =
      renderer.domElement.getBoundingClientRect();

    pointer.x =
      ((event.clientX - rectangle.left) /
        rectangle.width) *
        2 -
      1;
    pointer.y =
      -(
        (event.clientY - rectangle.top) /
        rectangle.height
      ) *
        2 +
      1;

    raycaster.setFromCamera(pointer, camera);

    const intersection = raycaster
      .intersectObjects(buildingGroup.children, true)
      .find((result) => result.object.userData.node);

    return intersection?.object.userData.node || null;
  }

  renderer.domElement.addEventListener(
    "pointermove",
    (event) => {
      if (drag) return;

      const node = raycast(event);

      if (node?.id === hovered?.id) return;

      hovered = node;

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
      hovered = null;
      vm.clearDetail();
    },
  );

  renderer.domElement.addEventListener(
    "pointerdown",
    (event) => {
      drag = {
        x: event.clientX,
        y: event.clientY,
        shift: event.shiftKey,
      };
      renderer.domElement.setPointerCapture(
        event.pointerId,
      );
    },
  );

  renderer.domElement.addEventListener(
    "pointermove",
    (event) => {
      if (!drag) return;

      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;

      if (drag.shift) {
        orbit.panX -= dx * 0.012;
        orbit.panZ -= dy * 0.012;
      } else {
        orbit.yaw -= dx * 0.006;
        orbit.pitch = Math.max(
          0.28,
          Math.min(
            1.18,
            orbit.pitch - dy * 0.005,
          ),
        );
      }
    },
  );

  renderer.domElement.addEventListener(
    "pointerup",
    (event) => {
      drag = null;
      renderer.domElement.releasePointerCapture(
        event.pointerId,
      );
    },
  );

  renderer.domElement.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const minimum =
        Math.max(9, defaultOrbit.distance * 0.38);
      const maximum =
        Math.max(34, defaultOrbit.distance * 1.7);

      orbit.distance = Math.max(
        minimum,
        Math.min(
          maximum,
          orbit.distance + event.deltaY * 0.014,
        ),
      );
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
      target.set(position.x, 0, position.z);
      orbit.panX = 0;
      orbit.panZ = 0;
      orbit.distance = Math.max(
        8,
        defaultOrbit.distance * 0.42,
      );
      vm.openDetail(node.id);
    },
  );

  function reset() {
    if (!defaultOrbit) return;

    Object.assign(orbit, defaultOrbit);
    target.set(0, 0, 0);
    hovered = null;
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
