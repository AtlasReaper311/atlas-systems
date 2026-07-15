/**
 * system-map-scene.js
 * The system map's 3D rendering layer: the same estate, as a living
 * diorama. Loaded lazily by system-map.js only after every gate passes
 * (desktop width, WebGL2, motion allowed, map on screen); consumes the
 * flat map's data through window.AtlasMapVM and renders nothing of its
 * own invention. The SVG map keeps running underneath the canvas, so
 * fallback at any moment (load error, context loss, sustained frame
 * overrun, the flat-view toggle) is: remove the canvas.
 *
 * Design intent, stated once: every Worker on this board is a small
 * structure on a dark plane, and the traffic between them is visible as
 * light pulses travelling the connection lines. Health is behaviour, not
 * tint: a live node breathes and its pulses run steady; a degraded node
 * stutters its flow in bursts; a down node goes dark and its edges go
 * still. Brand palette only (amber accent on near-black), IBM Plex Mono
 * labels, no imported game assets anywhere.
 *
 * Performance budget (documented in the README, enforced here):
 *   - device pixel ratio capped at 1.5
 *   - one draw call for ALL flow particles (single Points, <=260)
 *   - shared low-poly geometries; two shared base materials per role;
 *     one small cloned material per node core (the animated part)
 *   - no shadow maps; one ambient + one directional light; exp2 fog
 *   - render loop pauses off-screen and on hidden tabs
 *   - adaptive: sustained >28ms average halves particles and drops DPR
 *     to 1; sustained >34ms after that tears down to the SVG map
 *
 * Vendored three.js (r180, MIT) lives beside this file; the site's CSP
 * pins script-src to 'self', and widening a deliberate security posture
 * to save repo weight would be the wrong trade.
 */

import * as THREE from "./vendor/three/three.module.min.js";

const LAB_EXCLUDED_WORKERS = new Set(["simple-proxy"]);

/* ── Pure helpers (exported for the smoke test) ─────────────────────── */

export const BOARD_SCALE = 0.034;

export function worldFromLayout(x, y, W, H) {
  return { x: (x - W / 2) * BOARD_SCALE, z: (y - H / 2) * BOARD_SCALE };
}

/**
 * Health as behaviour. flow scales particle speed and brightness on a
 * node's edges; intensity drives its core glow; stutter switches the
 * bursty emission gate on. "down" is deliberately dark and still, per
 * the map's own vocabulary: the red lives in the panel and the list,
 * the diorama shows absence.
 */
export const STATUS_VISUAL = {
  live:     { core: 0xf5a623, intensity: 1.0,  flow: 1.0,  stutter: false, dark: false },
  degraded: { core: 0xf5a623, intensity: 0.8,  flow: 0.5,  stutter: true,  dark: false },
  undoc:    { core: 0x8a8a93, intensity: 0.45, flow: 0.3,  stutter: false, dark: false },
  unknown:  { core: 0x8a8a93, intensity: 0.3,  flow: 0.25, stutter: false, dark: false },
  down:     { core: 0x3a3a44, intensity: 0.12, flow: 0.0,  stutter: false, dark: true  },
  static:   { core: 0xe8e8e0, intensity: 0.32, flow: 1.0,  stutter: false, dark: false }
};

export function statusVisual(status) {
  return STATUS_VISUAL[status] || STATUS_VISUAL.unknown;
}

/** An edge flows at the rate of its weakest endpoint. */
export function edgeFlowFactor(fromStatus, toStatus) {
  return Math.min(statusVisual(fromStatus).flow, statusVisual(toStatus).flow);
}

/**
 * Bursty emission for degraded nodes: a deterministic gate over time so
 * stutter reads as a struggling service, not random noise. Returns the
 * brightness/speed multiplier for this instant.
 */
export function stutterGate(timeSec, seed) {
  const a = Math.sin(timeSec * 7.1 + seed * 13.7);
  const b = Math.sin(timeSec * 2.3 + seed * 5.1);
  return a > 0.1 && b > -0.35 ? 1 : 0.12;
}

/**
 * Particle counts per edge: proportional to length, clamped 3..8, then
 * scaled down together if the global cap would be exceeded. The cap is
 * the budget; distribution is just fairness within it.
 */
export function allocateParticles(edgeLengths, cap) {
  let counts = edgeLengths.map((len) =>
    Math.max(3, Math.min(8, Math.round(len * 1.5)))
  );
  const total = counts.reduce((s, n) => s + n, 0);
  if (total > cap) {
    const k = cap / total;
    counts = counts.map((n) => Math.max(2, Math.floor(n * k)));
  }
  return counts;
}

/* Mirrors the edge custom properties in system-map.css. Colour is signal
   type, dash is the second cue, and weight keeps the tunnel readable. */
export const EDGE_STYLE = {
  binding: { color: 0x8892a8, dash: null, weight: 1.2, opacity: 0.82 },
  tunnel: { color: 0xf5a623, dash: null, weight: 2.2, opacity: 0.98 },
  http: { color: 0x3fb8d0, dash: null, weight: 1.25, opacity: 0.84 },
  poll: { color: 0x7f93e0, dash: [0.08, 0.18], weight: 1.05, opacity: 0.76 },
  probe: { color: 0xc9a24a, dash: [0.12, 0.14], weight: 0.95, opacity: 0.68 },
  dispatch: { color: 0xa274d8, dash: [0.22, 0.12], weight: 1.15, opacity: 0.82 },
  notify: { color: 0xd074c0, dash: null, weight: 1.2, opacity: 0.82 },
  alert: { color: 0xe0654a, dash: null, weight: 1.3, opacity: 0.86 },
  kv: { color: 0xcfc8b8, dash: null, weight: 0.9, opacity: 0.76 },
  default: { color: 0x8892a8, dash: null, weight: 1.1, opacity: 0.78 }
};

export function kindColor(kind) {
  return (EDGE_STYLE[kind] || EDGE_STYLE.default).color;
}

/* Mirrors the role custom properties in system-map.css so SVG and 3D
   encode trust boundaries with the same accents. */
export const ROLE_ACCENT = {
  worker: 0xf5a623,
  site: 0xe8935c,
  local: 0x4aa8d8,
  ext: 0x8891a0,
  infra: 0xf5a623
};

export const MAP_KV = 0xcfc8b8;

/* ── Boot guard ─────────────────────────────────────────────────────── */
/* Node (the smoke test) imports the helpers above; only a real page with
   the flat map's view-model mounted gets a renderer. */
const canBoot =
  typeof window !== "undefined" &&
  typeof document !== "undefined" &&
  window.AtlasMapVM &&
  document.getElementById("system-map-host");

if (canBoot) {
  try {
    boot(window.AtlasMapVM, document.getElementById("system-map-host"));
  } catch (err) {
    window.AtlasMapVM.fallbackToSvg();
  }
}

/* ── Scene ──────────────────────────────────────────────────────────── */

function boot(vm, host) {
  const PARTICLE_CAP_FULL = 260;
  let particleCap = PARTICLE_CAP_FULL;

  /* Layer DOM: canvas + label layer + toggle + hint, all inside one
     wrapper so teardown is one removeChild. The wrapper sits over the
     SVG; the detail panel is a later sibling and paints above both. */
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
  reset.textContent = "reset view";
  reset.setAttribute("aria-label", "Reset the 3D system map view");
  const hint = document.createElement("div");
  hint.className = "smap3d-hint";
  hint.textContent = "drag orbit \u00B7 shift-drag pan \u00B7 double-click focus";

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x0a0a0f, 1);
  layer.appendChild(renderer.domElement);
  layer.appendChild(labelLayer);
  layer.appendChild(toggle);
  layer.appendChild(reset);
  layer.appendChild(hint);
  host.appendChild(layer);
  setTimeout(() => hint.classList.add("smap3d-hint-gone"), 6000);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0a0f, 0.03);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 140);

  scene.add(new THREE.AmbientLight(0x2a2a34, 1.9));
  const key = new THREE.DirectionalLight(0xf5ead6, 1.15);
  key.position.set(7, 11, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x7895aa, 0.28);
  fill.position.set(-6, 4, -7);
  scene.add(fill);

  /* Ground: near-black plane, the site's 64px grid translated into
     world units, and one soft amber pool of light under the board;
     the same radial-glow idiom every live panel on the site uses. */
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x0d0d13, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const grid = new THREE.GridHelper(38, 26, 0x1e1e28, 0x14141c);
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  grid.position.y = 0.01;
  scene.add(grid);

  const glowTex = radialTexture("rgba(245,166,35,0.16)");
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.02;
  scene.add(glow);

  /* ── Node structures ─────────────────────────────────────────────
     One silhouette per role, all low-poly, all built here rather than
     imported: a Worker is a monolith with a lit service band, a local
     service is a hex tank, a Pages site is a slab with a lit front
     edge, the tunnel is literally a ring you pass through, externals
     are floating markers, KV namespaces are small satellites beside
     the Worker that owns them. */
  const GEO = {
    workerBase: new THREE.BoxGeometry(0.52, 1.05, 0.52),
    workerCore: new THREE.BoxGeometry(0.58, 0.16, 0.58),
    localBase: new THREE.CylinderGeometry(0.34, 0.38, 0.8, 6),
    localCore: new THREE.CylinderGeometry(0.37, 0.37, 0.09, 6),
    siteBase: new THREE.BoxGeometry(0.95, 0.1, 0.62),
    siteCore: new THREE.BoxGeometry(0.97, 0.045, 0.1),
    infraBase: new THREE.TorusGeometry(0.3, 0.085, 8, 20),
    infraCore: new THREE.TorusGeometry(0.3, 0.03, 8, 20),
    extBase: new THREE.OctahedronGeometry(0.32, 0),
    extCore: new THREE.OctahedronGeometry(0.14, 0),
    kv: new THREE.BoxGeometry(0.15, 0.15, 0.15)
  };
  const ROLE = {
    worker: { base: GEO.workerBase, core: GEO.workerCore, baseY: 0.525, coreY: 0.83, port: 0.55, label: 1.35 },
    local:  { base: GEO.localBase,  core: GEO.localCore,  baseY: 0.4,   coreY: 0.62, port: 0.45, label: 1.1 },
    site:   { base: GEO.siteBase,   core: GEO.siteCore,   baseY: 0.05,  coreY: 0.1,  port: 0.12, label: 0.55, coreZ: 0.31 },
    infra:  { base: GEO.infraBase,  core: GEO.infraCore,  baseY: 0.42,  coreY: 0.42, port: 0.42, label: 1.0 },
    ext:    { base: GEO.extBase,    core: GEO.extCore,    baseY: 0.55,  coreY: 0.55, port: 0.55, label: 1.15, spin: true }
  };
  const ROLE_INTENSITY = { worker: 1.0, site: 0.92, local: 0.95, infra: 1.08, ext: 0.5 };
  const KV_WORLD_HALF = 0.075 * 1.28;
  const KV_BASE_Y = 1.22;
  const KV_CROWD_RADIUS = 2.25;
  const KV_LIFT_MARGIN = 0.34;
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x181820, roughness: 0.85, metalness: 0.15, flatShading: true });
  const baseMatDark = new THREE.MeshStandardMaterial({ color: 0x0e0e13, roughness: 1, metalness: 0, flatShading: true });
  const kvMat = new THREE.MeshStandardMaterial({
    color: 0x2b2924, roughness: 0.82, flatShading: true,
    emissive: MAP_KV, emissiveIntensity: 0.5
  });

  const { W, H } = vm.getState();
  const nodeViews = new Map(); /* id -> view */
  const pickMeshes = [];
  const spinners = [];

  function makeNodeView(n) {
    const r = ROLE[n.role] || ROLE.worker;
    const accent = ROLE_ACCENT[n.role] || ROLE_ACCENT.worker;
    const roleIntensity = ROLE_INTENSITY[n.role] || ROLE_INTENSITY.worker;
    const p = worldFromLayout(n.x, n.y, W, H);
    const s = n.hub ? 1.35 : 1;
    const group = new THREE.Group();
    group.position.set(p.x, 0, p.z);
    group.scale.setScalar(s);

    const roleBaseMat = baseMat.clone();
    roleBaseMat.emissive.setHex(accent);
    roleBaseMat.emissiveIntensity = n.role === "ext" ? 0.05 : 0.1;
    const roleDarkMat = baseMatDark.clone();
    roleDarkMat.emissive.setHex(accent);
    roleDarkMat.emissiveIntensity = 0.025;

    const base = new THREE.Mesh(r.base, roleBaseMat);
    base.position.y = r.baseY;
    base.userData.nodeId = n.id;
    group.add(base);

    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x101016, roughness: 0.6, flatShading: true,
      emissive: accent, emissiveIntensity: roleIntensity
    });
    const core = new THREE.Mesh(r.core, coreMat);
    core.position.y = r.coreY;
    if (r.coreZ) core.position.z = r.coreZ;
    group.add(core);

    const label = document.createElement("span");
    label.className = "smap3d-label" + (n.hub ? " smap3d-label-hub" : "");
    label.dataset.nodeId = n.id;
    label.dataset.labelPriority = String(n.hub ? 100 : n.role === "worker" ? 80 : n.role === "site" ? 70 : n.role === "local" ? 60 : n.sourceOnly ? 20 : 40);
    label.textContent = n.label;
    labelLayer.appendChild(label);

    if (r.spin) spinners.push(base), spinners.push(core);
    scene.add(group);
    pickMeshes.push(base);

    const view = {
      node: n, group, base, core, coreMat, label, roleBaseMat, roleDarkMat, accent, roleIntensity,
      seed: (n.id.length * 7 + n.id.charCodeAt(0)) % 97,
      portY: r.port * s, labelY: r.label * s,
      world: new THREE.Vector3(p.x, 0, p.z)
    };
    applyStatus(view);
    return view;
  }

  function applyStatus(view) {
    const v = statusVisual(view.node.status || "static");
    view.visual = v;
    view.coreMat.emissive.setHex(view.accent);
    const statusFloor = view.node.role === "worker" ? v.intensity : Math.max(v.intensity, 0.62);
    view.coreBaseIntensity = view.roleIntensity * (v.dark ? 0.18 : statusFloor);
    view.coreMat.emissiveIntensity = view.coreBaseIntensity;
    view.base.material = v.dark ? view.roleDarkMat : view.roleBaseMat;
  }

  function makeKvView(kv) {
    const p = worldFromLayout(kv.x, kv.y, W, H);
    const parent = nodeViews.get(kv.parent);
    const parentWorld = parent ? parent.world : new THREE.Vector3(p.x, 0, p.z);
    let nearbyTop = parent ? parent.labelY : 1.1;
    nodeViews.forEach((view) => {
      const dx = view.world.x - parentWorld.x;
      const dz = view.world.z - parentWorld.z;
      if (Math.sqrt(dx * dx + dz * dz) <= KV_CROWD_RADIUS) nearbyTop = Math.max(nearbyTop, view.labelY);
    });
    const chipY = Math.max(KV_BASE_Y, nearbyTop + KV_LIFT_MARGIN + KV_WORLD_HALF);
    const mesh = new THREE.Mesh(GEO.kv, kvMat);
    mesh.position.set(p.x, chipY, p.z);
    mesh.scale.setScalar(1.28);
    scene.add(mesh);
    const label = document.createElement("span");
    label.className = "smap3d-label smap3d-label-kv";
    label.dataset.labelPriority = "10";
    label.textContent = kv.label;
    labelLayer.appendChild(label);
    return { mesh, label, parent: kv.parent, world: mesh.position, cleared: chipY > KV_BASE_Y + 0.12 };
  }

  let kvViews = [];

  function sceneNodes() {
    return vm.getState().nodes.filter((n) => !LAB_EXCLUDED_WORKERS.has(n.id));
  }

  /* ── Edges + the particle system ─────────────────────────────────
     All connection lines share one LineSegments; all flow particles
     share one Points. Health never rebuilds geometry; it only changes
     per-frame speed and colour. Membership changes (a new orphan
     Worker discovered mid-session) rebuild both, which at this scale
     is a millisecond. */
  let edgeLines = null;
  let points = null;
  let particles = [];
  let edgeRuntime = [];

  const dotTex = radialTexture("rgba(255,255,255,1)");
  const pointsMat = new THREE.PointsMaterial({
    size: 0.16, map: dotTex, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, vertexColors: true, sizeAttenuation: true
  });

  function portPos(view) {
    return new THREE.Vector3(view.world.x, view.portY, view.world.z);
  }

  function stableUnit(a, b, c) {
    const x = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
    return x - Math.floor(x);
  }

  function rebuildEdges() {
    if (edgeLines) {
      scene.remove(edgeLines);
      edgeLines.traverse((line) => {
        if (line.geometry) line.geometry.dispose();
        if (line.material) line.material.dispose();
      });
    }
    if (points) { scene.remove(points); points.geometry.dispose(); }

    const st = vm.getState();
    const defs = [];
    st.edges.concat(st.probes).forEach((e) => {
      const a = nodeViews.get(e.from);
      const b = nodeViews.get(e.to);
      if (a && b) defs.push({ a, b, kind: e.kind });
    });

    /* KV access lines: owned storage sits beside its Worker. */
    st.kv.forEach((kv, i) => {
      const p = nodeViews.get(kv.parent);
      if (p && kvViews[i]) defs.push({ a: p, b: kvViews[i], kind: "kv", kvTarget: true });
    });

    const lineGroups = new Map();
    edgeRuntime = defs.map((d) => {
      const from = portPos(d.a);
      const to = d.kvTarget ? d.b.world.clone().setY(d.b.world.y - KV_WORLD_HALF) : portPos(d.b);
      const style = EDGE_STYLE[d.kind] || EDGE_STYLE.default;
      const bucket = lineGroups.get(d.kind) || { style, pos: [] };
      bucket.pos.push(from.x, from.y, from.z, to.x, to.y, to.z);
      lineGroups.set(d.kind, bucket);
      return { from, to, kind: d.kind, style, a: d.a, b: d.b, kvTarget: !!d.kvTarget, len: from.distanceTo(to) };
    });

    edgeLines = new THREE.Group();
    lineGroups.forEach(({ style, pos }) => {
      const lg = new THREE.BufferGeometry();
      lg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      const opts = {
        color: style.color,
        transparent: true,
        opacity: style.opacity,
        linewidth: style.weight,
        depthWrite: false,
        toneMapped: false
      };
      const mat = style.dash
        ? new THREE.LineDashedMaterial({ ...opts, dashSize: style.dash[0], gapSize: style.dash[1] })
        : new THREE.LineBasicMaterial(opts);
      const line = new THREE.LineSegments(lg, mat);
      if (style.dash) line.computeLineDistances();
      edgeLines.add(line);
    });
    scene.add(edgeLines);

    const flowEdges = edgeRuntime.filter((e) => !e.kvTarget);
    const counts = allocateParticles(flowEdges.map((e) => e.len), particleCap);
    particles = [];
    flowEdges.forEach((e, i) => {
      for (let k = 0; k < counts[i]; k++) {
        particles.push({
          edge: e,
          t: (k / counts[i] + stableUnit(i, k, 1) * 0.1) % 1,
          speed: (0.10 + stableUnit(i, k, 2) * 0.07) / Math.max(0.8, e.len * 0.28),
          color: new THREE.Color(e.style.color)
        });
      }
    });
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(particles.length * 3), 3));
    pg.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(particles.length * 3), 3));
    points = new THREE.Points(pg, pointsMat);
    points.frustumCulled = false;
    scene.add(points);
  }

  function edgeFlow(e, timeSec) {
    const sa = e.a.node ? e.a.node.status : "static";
    const sb = e.b.node ? e.b.node.status : "static";
    let f = edgeFlowFactor(sa || "static", sb || "static");
    const stut =
      (e.a.visual && e.a.visual.stutter) || (e.b.visual && e.b.visual.stutter);
    if (stut && f > 0) f *= stutterGate(timeSec, (e.a.seed || 1) + (e.b.seed || 2));
    return f;
  }

  /* ── Sync from the flat map's data layer ─────────────────────────── */
  function syncFromVM() {
    const st = vm.getState();
    let membershipChanged = false;
    st.nodes.filter((n) => !LAB_EXCLUDED_WORKERS.has(n.id)).forEach((n) => {
      let view = nodeViews.get(n.id);
      if (!view) {
        /* An orphan Worker discovered mid-session: the registry found
           something topology has not learned yet. It appears here the
           same minute it appears on the flat map. */
        view = makeNodeView(n);
        nodeViews.set(n.id, view);
        membershipChanged = true;
      } else {
        applyStatus(view);
      }
    });
    if (membershipChanged || !edgeLines) rebuildEdges();
  }

  sceneNodes().forEach((n) => nodeViews.set(n.id, makeNodeView(n)));
  kvViews = vm.getState().kv.map(makeKvView);
  rebuildEdges();
  vm.onUpdate(syncFromVM);

  /* ── Camera: custom orbit, iso-leaning, with idle drift ──────────
     ~50 lines instead of OrbitControls: clamps and drift become
     first-class instead of fought for, and the vendored surface stays
     one file. The drift is additive over the user's angle, so the
     diorama breathes without stealing the camera back. */
  const defaultOrbit = { az: -0.62, el: 0.62, r: 31, target: new THREE.Vector3(0, 0.35, 0) };
  const orbit = { az: defaultOrbit.az, el: defaultOrbit.el, r: defaultOrbit.r, vAz: 0, vEl: 0, target: defaultOrbit.target.clone() };
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  nodeViews.forEach((view) => {
    bounds.minX = Math.min(bounds.minX, view.world.x);
    bounds.maxX = Math.max(bounds.maxX, view.world.x);
    bounds.minZ = Math.min(bounds.minZ, view.world.z);
    bounds.maxZ = Math.max(bounds.maxZ, view.world.z);
  });
  if (!Number.isFinite(bounds.minX)) {
    bounds.minX = bounds.minZ = -8;
    bounds.maxX = bounds.maxZ = 8;
  }
  const panMargin = 4;
  let lastInteract = 0;
  let dragging = false, downX = 0, downY = 0, lastX = 0, lastY = 0, moved = 0, dragMode = "orbit";
  let targetTween = null;
  const activePointers = new Map();
  let touchGesture = null;

  function clampTarget() {
    orbit.target.x = Math.max(bounds.minX - panMargin, Math.min(bounds.maxX + panMargin, orbit.target.x));
    orbit.target.z = Math.max(bounds.minZ - panMargin, Math.min(bounds.maxZ + panMargin, orbit.target.z));
    orbit.target.y = 0.35;
  }

  function moveTargetTo(world, instant = false) {
    const to = new THREE.Vector3(world.x, 0.35, world.z);
    to.x = Math.max(bounds.minX - panMargin, Math.min(bounds.maxX + panMargin, to.x));
    to.z = Math.max(bounds.minZ - panMargin, Math.min(bounds.maxZ + panMargin, to.z));
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (instant || reduceMotion) {
      orbit.target.copy(to);
      targetTween = null;
      return;
    }
    targetTween = { from: orbit.target.clone(), to, t: 0, dur: 0.42 };
  }

  function updateTargetTween(dt) {
    if (!targetTween) return;
    targetTween.t = Math.min(1, targetTween.t + dt / targetTween.dur);
    const p = targetTween.t * targetTween.t * (3 - 2 * targetTween.t);
    orbit.target.lerpVectors(targetTween.from, targetTween.to, p);
    if (targetTween.t >= 1) targetTween = null;
  }

  function panCamera(dx, dy) {
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    camera.getWorldDirection(forward);
    right.crossVectors(forward, camera.up).normalize();
    forward.y = 0;
    if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
    forward.normalize();
    const scale = orbit.r * 0.0019;
    orbit.target.addScaledVector(right, -dx * scale);
    orbit.target.addScaledVector(forward, dy * scale);
    clampTarget();
  }

  function resetCamera() {
    orbit.az = defaultOrbit.az;
    orbit.el = defaultOrbit.el;
    orbit.r = defaultOrbit.r;
    orbit.vAz = 0;
    orbit.vEl = 0;
    moveTargetTo(defaultOrbit.target, false);
    lastInteract = performance.now();
  }

  function labelsOverlap(a, b, pad) {
    return !(a.right + pad < b.left || a.left - pad > b.right || a.bottom + pad < b.top || a.top - pad > b.bottom);
  }

  function resolveProjectedLabelCollisions() {
    const labels = Array.from(labelLayer.querySelectorAll(".smap3d-label")).sort((a, b) => Number(b.dataset.labelPriority || 0) - Number(a.dataset.labelPriority || 0) || a.textContent.localeCompare(b.textContent));
    const placed = [];
    for (const label of labels) {
      label.style.visibility = "visible";
      const rect = label.getBoundingClientRect();
      if (placed.some((other) => labelsOverlap(rect, other, 5))) label.style.visibility = "hidden";
      else placed.push(rect);
    }
  }

  function applyCamera(timeSec) {
    const idle = performance.now() - lastInteract > 6000;
    const driftAz = idle ? Math.sin(timeSec * 0.11) * 0.05 : 0;
    const driftEl = idle ? Math.sin(timeSec * 0.07) * 0.015 : 0;
    const az = orbit.az + driftAz;
    const el = Math.max(0.3, Math.min(1.05, orbit.el + driftEl));
    camera.position.set(
      orbit.target.x + orbit.r * Math.cos(el) * Math.sin(az),
      orbit.target.y + orbit.r * Math.sin(el),
      orbit.target.z + orbit.r * Math.cos(el) * Math.cos(az)
    );
    camera.lookAt(orbit.target);
  }

  const el2 = renderer.domElement;
  el2.addEventListener("pointerdown", (ev) => {
    activePointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    dragging = true; moved = 0;
    dragMode = (ev.button === 2 || ev.shiftKey) ? "pan" : "orbit";
    downX = lastX = ev.clientX; downY = lastY = ev.clientY;
    lastInteract = performance.now();
    el2.setPointerCapture && el2.setPointerCapture(ev.pointerId);
  });
  el2.addEventListener("pointermove", (ev) => {
    pointer.x = ev.clientX; pointer.y = ev.clientY; pointer.fresh = true;
    if (activePointers.has(ev.pointerId)) activePointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (activePointers.size >= 2) {
      const pts = Array.from(activePointers.values()).slice(0, 2);
      const cx = (pts[0].x + pts[1].x) * 0.5;
      const cy = (pts[0].y + pts[1].y) * 0.5;
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (touchGesture) {
        panCamera(cx - touchGesture.cx, cy - touchGesture.cy);
        orbit.r = Math.max(18, Math.min(52, orbit.r - (dist - touchGesture.dist) * 0.035));
        moved += Math.abs(cx - touchGesture.cx) + Math.abs(cy - touchGesture.cy) + Math.abs(dist - touchGesture.dist);
      }
      touchGesture = { cx, cy, dist };
      lastInteract = performance.now();
      return;
    }
    if (!dragging) return;
    const dx = ev.clientX - lastX, dy = ev.clientY - lastY;
    lastX = ev.clientX; lastY = ev.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (dragMode === "pan") {
      panCamera(dx, dy);
    } else {
      orbit.vAz = -dx * 0.005; orbit.vEl = dy * 0.004;
      orbit.az += orbit.vAz; orbit.el = Math.max(0.3, Math.min(1.05, orbit.el + orbit.vEl));
    }
    lastInteract = performance.now();
  });
  el2.addEventListener("pointerup", (ev) => {
    activePointers.delete(ev.pointerId);
    if (activePointers.size < 2) touchGesture = null;
    dragging = false;
    if (moved < 6 && dragMode === "orbit") pick(ev.clientX, ev.clientY);
  });
  el2.addEventListener("pointercancel", (ev) => {
    activePointers.delete(ev.pointerId);
    if (activePointers.size < 2) touchGesture = null;
    dragging = false;
  });
  el2.addEventListener("contextmenu", (ev) => ev.preventDefault());
  el2.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    orbit.r = Math.max(18, Math.min(52, orbit.r + ev.deltaY * 0.012));
    lastInteract = performance.now();
  }, { passive: false });
  el2.addEventListener("dblclick", (ev) => {
    const id = castAt(ev.clientX, ev.clientY);
    const view = id ? nodeViews.get(id) : null;
    if (view) {
      moveTargetTo(view.world);
      lastInteract = performance.now();
    }
  });
  reset.addEventListener("click", resetCamera);

  /* ── Picking: same panel, new pointer ────────────────────────────── */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pointer = { x: 0, y: 0, fresh: false };
  let hovered = null;

  function castAt(cx, cy) {
    const rect = el2.getBoundingClientRect();
    ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(pickMeshes, false);
    return hits.length ? hits[0].object.userData.nodeId : null;
  }
  function pick(cx, cy) {
    const id = castAt(cx, cy);
    const rect = host.getBoundingClientRect();
    if (id) vm.openDetail(id, cx - rect.left, cy - rect.top);
    else vm.closeDetail();
  }

  /* ── Render loop ─────────────────────────────────────────────────── */
  let raf = 0;
  let running = true;
  let onScreen = true;
  let lastT = performance.now();
  let ema = 16;
  let warm = 0;
  let degraded = false;
  const clock = new THREE.Clock();
  const tmpV = new THREE.Vector3();

  function frame() {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const t = clock.getElapsedTime();

    /* Adaptive budget: measure, degrade once, then be honest and leave. */
    ema = ema * 0.95 + dt * 1000 * 0.05;
    warm++;
    if (warm > 180 && ema > 28 && !degraded) {
      degraded = true;
      renderer.setPixelRatio(1);
      particleCap = Math.floor(PARTICLE_CAP_FULL / 2);
      rebuildEdges();
      warm = 0;
    } else if (warm > 300 && ema > 34 && degraded) {
      teardown();
      return;
    }

    updateTargetTween(dt);
    applyCamera(t);

    /* Node breathing, flicker, spin */
    nodeViews.forEach((view) => {
      const v = view.visual;
      if (!v) return;
      if (v.stutter) {
        view.coreMat.emissiveIntensity = view.coreBaseIntensity * (0.5 + 0.5 * stutterGate(t, view.seed));
      } else if (v.flow > 0 && !v.dark) {
        view.coreMat.emissiveIntensity = view.coreBaseIntensity * (0.92 + 0.08 * Math.sin(t * 1.3 + view.seed));
      }
    });
    for (let i = 0; i < spinners.length; i++) spinners[i].rotation.y = t * 0.4;

    /* The most important detail on the board: flow. One buffer write,
       one draw call. Down edges fade their pulses to black, which under
       additive blending is invisibility, not clutter. */
    if (points) {
      const pos = points.geometry.attributes.position.array;
      const col = points.geometry.attributes.color.array;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const f = edgeFlow(p.edge, t);
        p.t = (p.t + dt * p.speed * 60 * (0.2 + 0.8 * f)) % 1;
        const e = p.edge;
        const x = e.from.x + (e.to.x - e.from.x) * p.t;
        const z = e.from.z + (e.to.z - e.from.z) * p.t;
        const y = e.from.y + (e.to.y - e.from.y) * p.t + Math.sin(Math.PI * p.t) * (e.kvTarget ? 0.05 : 0.16);
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        const bright = f * (0.55 + 0.45 * Math.sin(Math.PI * p.t));
        col[i * 3] = p.color.r * bright;
        col[i * 3 + 1] = p.color.g * bright;
        col[i * 3 + 2] = p.color.b * bright;
      }
      points.geometry.attributes.position.needsUpdate = true;
      points.geometry.attributes.color.needsUpdate = true;
    }

    /* Hover raycast, throttled by pointer freshness */
    if (pointer.fresh && !dragging) {
      pointer.fresh = false;
      const id = castAt(pointer.x, pointer.y);
      if (id !== hovered) {
        hovered = id;
        el2.style.cursor = id ? "pointer" : "";
      }
    }

    /* Labels: project, fade by distance, and drop lower-priority labels
       when screen-space boxes collide. The scene stays legible even when
       the estate grows denser around the Worker cluster. */
    const rect = { w: el2.clientWidth, h: el2.clientHeight };
    const labelSlots = [];
    const labels = [];
    nodeViews.forEach((view) => labels.push({
      el: view.label,
      world: view.world,
      yOff: view.labelY,
      priority: view.node.hub ? 5 : view.node.role === "worker" ? 4 : view.node.role === "local" ? 3 : view.node.role === "site" ? 2 : 2,
    }));
    kvViews.forEach((kv) => labels.push({
      el: kv.label,
      world: kv.world,
      yOff: KV_WORLD_HALF + 0.24,
      priority: kv.cleared ? 5.2 : 1.1
    }));
    labels
      .sort((a, b) => b.priority - a.priority)
      .forEach((item) => projectLabel(item, rect, labelSlots));

    renderer.render(scene, camera);
    resolveProjectedLabelCollisions();
  }

  function overlaps(a, b, pad = 6) {
    return !(
      a.r + pad < b.l ||
      a.l - pad > b.r ||
      a.b + pad < b.t ||
      a.t - pad > b.b
    );
  }

  function projectLabel(item, rect, labelSlots) {
    const { el: labelEl, world, yOff, priority } = item;
    tmpV.set(world.x, yOff + (world.y || 0), world.z).project(camera);
    if (tmpV.z > 1) { labelEl.style.opacity = "0"; return; }
    let x = (tmpV.x * 0.5 + 0.5) * rect.w;
    let y = (-tmpV.y * 0.5 + 0.5) * rect.h;
    if (x < -180 || x > rect.w + 180 || y < -120 || y > rect.h + 120) {
      labelEl.style.opacity = "0";
      return;
    }
    const margin = 12;
    const w = labelEl.offsetWidth || 92;
    const h = labelEl.offsetHeight || 18;
    let left = x - w / 2;
    if (left < margin) left = margin;
    if (left + w > rect.w - margin) left = Math.max(margin, rect.w - margin - w);
    const baseTop = y - h - 4;
    let top = baseTop;
    if (top < margin) top = margin;
    if (top + h > rect.h - margin) top = Math.max(margin, rect.h - margin - h);
    const controlBox = { l: rect.w - 118, r: rect.w - 8, t: 8, b: 48 };
    if (overlaps({ l: left, r: left + w, t: top, b: top + h }, controlBox, 4)) {
      top = Math.min(rect.h - margin - h, controlBox.b + 8);
    }
    const step = h + 7;
    const tops = [top, top + step, top - step, top + step * 2, top - step * 2]
      .map((next) => Math.max(margin, Math.min(rect.h - margin - h, next)));
    const lefts = [left, left + 34, left - 34, left + 68, left - 68]
      .map((next) => Math.max(margin, Math.min(rect.w - margin - w, next)));
    let box = null;
    let chosenTop = top;
    let chosenLeft = left;
    for (let i = 0; i < tops.length; i++) {
      for (let j = 0; j < lefts.length; j++) {
        const nextBox = { l: lefts[j], r: lefts[j] + w, t: tops[i], b: tops[i] + h };
        if (!labelSlots.some((slot) => overlaps(nextBox, slot))) {
          box = nextBox;
          chosenTop = tops[i];
          chosenLeft = lefts[j];
          break;
        }
      }
      if (box) break;
    }
    if (!box) box = { l: left, r: left + w, t: top, b: top + h };
    if (priority < 5 && labelSlots.some((slot) => overlaps(box, slot))) {
      labelEl.style.opacity = "0";
      return;
    }
    if (!labelSlots.some((slot) => overlaps(box, slot))) labelSlots.push(box);
    const d = camera.position.distanceTo(tmpV.set(world.x, 0, world.z));
    labelEl.style.zIndex = String(10 + priority);
    labelEl.style.opacity = String(Math.max(0.62, Math.min(1, 1.55 - d / 48)));
    labelEl.style.transform = `translate(${chosenLeft.toFixed(1)}px, ${chosenTop.toFixed(1)}px)`;
  }

  /* ── Sizing, pausing, and every way out ──────────────────────────── */
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  function setRunning(next) {
    if (next === running) return;
    running = next;
    if (running) { lastT = performance.now(); frame(); }
    else cancelAnimationFrame(raf);
  }
  const io = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    setRunning(onScreen && !document.hidden);
  });
  io.observe(host);
  const onVis = () => setRunning(onScreen && !document.hidden);
  document.addEventListener("visibilitychange", onVis);

  el2.addEventListener("webglcontextlost", (ev) => {
    ev.preventDefault();
    teardown();
  });
  toggle.addEventListener("click", teardown);

  function teardown() {
    cancelAnimationFrame(raf);
    running = false;
    ro.disconnect();
    io.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    dotTex.dispose();
    glowTex.dispose();
    renderer.dispose();
    if (layer.parentNode) layer.parentNode.removeChild(layer);
    vm.fallbackToSvg();
  }

  vm.sceneMounted();
  frame();
}

/* Soft radial dot: the particle sprite and the ground glow share the
   same idea at two sizes, drawn here instead of shipped as an asset. */
function radialTexture(rgba) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, rgba);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
