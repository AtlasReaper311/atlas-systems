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

export const KIND_COLOR = {
  probe: 0x8a8a93,  /* the registry's heartbeat: quiet, grey */
  tunnel: 0x4ade80, /* the LAN lifeline earns the one green */
  default: 0xf5a623 /* everything else moves in brand amber */
};

export function kindColor(kind) {
  return KIND_COLOR[kind] || KIND_COLOR.default;
}

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
  const hint = document.createElement("div");
  hint.className = "smap3d-hint";
  hint.textContent = "drag to orbit \u00B7 scroll to zoom \u00B7 click a node";

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x0a0a0f, 1);
  layer.appendChild(renderer.domElement);
  layer.appendChild(labelLayer);
  layer.appendChild(toggle);
  layer.appendChild(hint);
  host.appendChild(layer);
  setTimeout(() => hint.classList.add("smap3d-hint-gone"), 6000);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0a0f, 0.03);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 140);

  scene.add(new THREE.AmbientLight(0x2a2a34, 1.6));
  const key = new THREE.DirectionalLight(0xf5ead6, 1.15);
  key.position.set(7, 11, 5);
  scene.add(key);

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
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x181820, roughness: 0.85, metalness: 0.15, flatShading: true });
  const baseMatDark = new THREE.MeshStandardMaterial({ color: 0x0e0e13, roughness: 1, metalness: 0, flatShading: true });
  const kvMat = new THREE.MeshStandardMaterial({
    color: 0x181820, roughness: 0.8, flatShading: true,
    emissive: 0xf5a623, emissiveIntensity: 0.3
  });

  const { W, H } = vm.getState();
  const nodeViews = new Map(); /* id -> view */
  const pickMeshes = [];
  const spinners = [];
  const bobbers = [];

  function makeNodeView(n) {
    const r = ROLE[n.role] || ROLE.worker;
    const p = worldFromLayout(n.x, n.y, W, H);
    const s = n.hub ? 1.35 : 1;
    const group = new THREE.Group();
    group.position.set(p.x, 0, p.z);
    group.scale.setScalar(s);

    const base = new THREE.Mesh(r.base, baseMat);
    base.position.y = r.baseY;
    base.userData.nodeId = n.id;
    group.add(base);

    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x101016, roughness: 0.6, flatShading: true,
      emissive: 0xf5a623, emissiveIntensity: 0.9
    });
    const core = new THREE.Mesh(r.core, coreMat);
    core.position.y = r.coreY;
    if (r.coreZ) core.position.z = r.coreZ;
    group.add(core);

    const label = document.createElement("span");
    label.className = "smap3d-label" + (n.hub ? " smap3d-label-hub" : "");
    label.textContent = n.label;
    labelLayer.appendChild(label);

    if (r.spin) spinners.push(base), spinners.push(core);
    scene.add(group);
    pickMeshes.push(base);

    const view = {
      node: n, group, base, core, coreMat, label,
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
    view.coreMat.emissive.setHex(v.core);
    view.coreMat.emissiveIntensity = v.intensity;
    view.base.material = v.dark ? baseMatDark : baseMat;
  }

  function makeKvView(kv) {
    const p = worldFromLayout(kv.x, kv.y, W, H);
    const mesh = new THREE.Mesh(GEO.kv, kvMat);
    mesh.position.set(p.x, 0.62, p.z);
    scene.add(mesh);
    bobbers.push(mesh);
    const label = document.createElement("span");
    label.className = "smap3d-label smap3d-label-kv";
    label.textContent = kv.label;
    labelLayer.appendChild(label);
    return { mesh, label, world: mesh.position };
  }

  const kvViews = vm.getState().kv.map(makeKvView);

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

  function rebuildEdges() {
    if (edgeLines) { scene.remove(edgeLines); edgeLines.geometry.dispose(); }
    if (points) { scene.remove(points); points.geometry.dispose(); }

    const st = vm.getState();
    const defs = [];
    st.edges.concat(st.probes).forEach((e) => {
      const a = nodeViews.get(e.from);
      const b = nodeViews.get(e.to);
      if (a && b) defs.push({ a, b, kind: e.kind });
    });

    /* KV access lines: owned storage sits beside its Worker; a short
       amber thread makes the ownership legible. */
    st.kv.forEach((kv, i) => {
      const p = nodeViews.get(kv.parent);
      if (p && kvViews[i]) defs.push({ a: p, b: kvViews[i], kind: "kv", kvTarget: true });
    });

    const linePos = [];
    const lineCol = [];
    const cA = new THREE.Color();
    edgeRuntime = defs.map((d) => {
      const from = portPos(d.a);
      const to = d.kvTarget ? d.b.world.clone() : portPos(d.b);
      linePos.push(from.x, from.y, from.z, to.x, to.y, to.z);
      cA.setHex(d.kind === "tunnel" ? 0x1f3a2b : d.kind === "probe" ? 0x1d1d26 : 0x2b2820);
      lineCol.push(cA.r, cA.g, cA.b, cA.r, cA.g, cA.b);
      return { from, to, kind: d.kind, a: d.a, b: d.b, kvTarget: !!d.kvTarget, len: from.distanceTo(to) };
    });

    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(linePos, 3));
    lg.setAttribute("color", new THREE.Float32BufferAttribute(lineCol, 3));
    edgeLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }));
    scene.add(edgeLines);

    const counts = allocateParticles(edgeRuntime.map((e) => e.len), particleCap);
    particles = [];
    edgeRuntime.forEach((e, i) => {
      for (let k = 0; k < counts[i]; k++) {
        particles.push({
          edge: e,
          t: (k / counts[i] + Math.random() * 0.1) % 1,
          speed: (0.10 + Math.random() * 0.07) / Math.max(0.8, e.len * 0.28),
          color: new THREE.Color(kindColor(e.kind))
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
    st.nodes.forEach((n) => {
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

  vm.getState().nodes.forEach((n) => nodeViews.set(n.id, makeNodeView(n)));
  rebuildEdges();
  vm.onUpdate(syncFromVM);

  /* ── Camera: custom orbit, iso-leaning, with idle drift ──────────
     ~50 lines instead of OrbitControls: clamps and drift become
     first-class instead of fought for, and the vendored surface stays
     one file. The drift is additive over the user's angle, so the
     diorama breathes without stealing the camera back. */
  const orbit = { az: -0.62, el: 0.62, r: 27, vAz: 0, vEl: 0, target: new THREE.Vector3(0, 0.35, 0) };
  let lastInteract = 0;
  let dragging = false, downX = 0, downY = 0, lastX = 0, lastY = 0, moved = 0;

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
    dragging = true; moved = 0;
    downX = lastX = ev.clientX; downY = lastY = ev.clientY;
    lastInteract = performance.now();
    el2.setPointerCapture && el2.setPointerCapture(ev.pointerId);
  });
  el2.addEventListener("pointermove", (ev) => {
    pointer.x = ev.clientX; pointer.y = ev.clientY; pointer.fresh = true;
    if (!dragging) return;
    const dx = ev.clientX - lastX, dy = ev.clientY - lastY;
    lastX = ev.clientX; lastY = ev.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    orbit.vAz = -dx * 0.005; orbit.vEl = dy * 0.004;
    orbit.az += orbit.vAz; orbit.el = Math.max(0.3, Math.min(1.05, orbit.el + orbit.vEl));
    lastInteract = performance.now();
  });
  el2.addEventListener("pointerup", (ev) => {
    dragging = false;
    if (moved < 6) pick(ev.clientX, ev.clientY);
  });
  el2.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    orbit.r = Math.max(16, Math.min(44, orbit.r + ev.deltaY * 0.012));
    lastInteract = performance.now();
  }, { passive: false });

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

    applyCamera(t);

    /* Node breathing, flicker, spin, bob */
    nodeViews.forEach((view) => {
      const v = view.visual;
      if (!v) return;
      if (v.stutter) {
        view.coreMat.emissiveIntensity = v.intensity * (0.5 + 0.5 * stutterGate(t, view.seed));
      } else if (v.flow > 0 && !v.dark) {
        view.coreMat.emissiveIntensity = v.intensity * (0.92 + 0.08 * Math.sin(t * 1.3 + view.seed));
      }
    });
    for (let i = 0; i < spinners.length; i++) spinners[i].rotation.y = t * 0.4;
    for (let i = 0; i < bobbers.length; i++) bobbers[i].position.y = 0.62 + Math.sin(t * 1.1 + i) * 0.04;

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
      priority: view.node.hub ? 4 : view.node.role === "worker" ? 3 : view.node.role === "local" ? 2 : 1,
    }));
    kvViews.forEach((kv) => labels.push({ el: kv.label, world: kv.world, yOff: 0.22, priority: 0 }));
    labels
      .sort((a, b) => b.priority - a.priority)
      .forEach((item) => projectLabel(item, rect, labelSlots));

    renderer.render(scene, camera);
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
    const x = (tmpV.x * 0.5 + 0.5) * rect.w;
    const y = (-tmpV.y * 0.5 + 0.5) * rect.h;
    if (x < -80 || x > rect.w + 80 || y < -40 || y > rect.h + 40) {
      labelEl.style.opacity = "0";
      return;
    }
    const w = labelEl.offsetWidth || 92;
    const h = labelEl.offsetHeight || 18;
    const box = { l: x - w / 2, r: x + w / 2, t: y - h - 4, b: y + 4 };
    if (priority < 4 && labelSlots.some((slot) => overlaps(box, slot))) {
      labelEl.style.opacity = "0";
      return;
    }
    labelSlots.push(box);
    const d = camera.position.distanceTo(tmpV.set(world.x, 0, world.z));
    labelEl.style.zIndex = String(10 + priority);
    labelEl.style.opacity = String(Math.max(0.45, Math.min(1, 1.45 - d / 42)));
    labelEl.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
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
