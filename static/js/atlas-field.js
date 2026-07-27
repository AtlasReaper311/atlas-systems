const ZERO_POINTER_FORCE = Object.freeze({ x: 0, y: 0, influence: 0 });
const DEFAULT_DOMAIN_BREAKS = Object.freeze([0.37, 0.67]);

export const ATLAS_FIELD_PRESETS = Object.freeze({
  hero: Object.freeze({
    canvasClass: "hero-field",
    seed: "atlas-systems-home-field-v4",
    density: Object.freeze({ min: 520, max: 1800, reduced: 420, areaDivisor: 720 }),
    dprCap: 1.75,
    domainBreaks: DEFAULT_DOMAIN_BREAKS,
    domainStyles: Object.freeze([
      "rgba(74, 222, 128, 0.16)",
      "rgba(245, 166, 35, 0.18)",
      "rgba(56, 189, 248, 0.15)",
    ]),
    pointer: Object.freeze({
      enabled: true,
      lightInfluence: 0.42,
      radiusMin: 220,
      radiusRatio: 0.34,
      radialStrength: 0.14,
      orbitalStrength: 0.035,
      smoothing: 0.065,
    }),
    light: Object.freeze({ radiusMin: 230, radiusRatio: 0.46, smoothing: 0.025 }),
  }),
  ambient: Object.freeze({
    canvasClass: "atlas-field-ambient",
    seed: "atlas-systems-ambient-field-v1",
    density: Object.freeze({ min: 260, max: 900, reduced: 220, areaDivisor: 1200 }),
    dprCap: 1.5,
    domainBreaks: DEFAULT_DOMAIN_BREAKS,
    domainStyles: Object.freeze([
      "rgba(74, 222, 128, 0.08)",
      "rgba(245, 166, 35, 0.09)",
      "rgba(56, 189, 248, 0.075)",
    ]),
    pointer: Object.freeze({
      enabled: false,
      lightInfluence: 0,
      radiusMin: 0,
      radiusRatio: 0,
      radialStrength: 0,
      orbitalStrength: 0,
      smoothing: 0.04,
    }),
    light: Object.freeze({ radiusMin: 180, radiusRatio: 0.38, smoothing: 0.02 }),
  }),
  card: Object.freeze({
    canvasClass: "atlas-field-card",
    seed: "atlas-systems-card-field-v1",
    density: Object.freeze({ min: 90, max: 260, reduced: 90, areaDivisor: 1600 }),
    dprCap: 1.25,
    domainBreaks: DEFAULT_DOMAIN_BREAKS,
    domainStyles: Object.freeze([
      "rgba(74, 222, 128, 0.07)",
      "rgba(245, 166, 35, 0.08)",
      "rgba(56, 189, 248, 0.065)",
    ]),
    pointer: Object.freeze({
      enabled: false,
      lightInfluence: 0,
      radiusMin: 0,
      radiusRatio: 0,
      radialStrength: 0,
      orbitalStrength: 0,
      smoothing: 0.04,
    }),
    light: Object.freeze({ radiusMin: 120, radiusRatio: 0.34, smoothing: 0.02 }),
  }),
});

const instances = new WeakMap();

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function hashSeed(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed) {
  let state = Number(seed) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export function resolveAtlasFieldOptions(options = {}) {
  const presetName = options.preset || "hero";
  const preset = ATLAS_FIELD_PRESETS[presetName];
  if (!preset) throw new RangeError(`Unknown AtlasField preset: ${presetName}`);

  return Object.freeze({
    preset: presetName,
    canvasClass: options.canvasClass || preset.canvasClass,
    seed: options.seed || preset.seed,
    density: Object.freeze({ ...preset.density, ...(options.density || {}) }),
    dprCap: Number(options.dprCap || preset.dprCap),
    domainBreaks: Object.freeze([...(options.domainBreaks || preset.domainBreaks)]),
    domainStyles: Object.freeze([...(options.domainStyles || preset.domainStyles)]),
    pointer: Object.freeze({ ...preset.pointer, ...(options.pointer || {}) }),
    light: Object.freeze({ ...preset.light, ...(options.light || {}) }),
  });
}

export function chooseParticleBudget(width, height, capabilities = {}, density = ATLAS_FIELD_PRESETS.hero.density) {
  const areaDivisor = Math.max(1, Number(density.areaDivisor) || 1);
  const areaBudget = Math.round(Math.max(1, width * height) / areaDivisor);
  let scale = 1;
  if (capabilities.coarsePointer) scale *= 0.72;
  if (capabilities.saveData) scale *= 0.58;
  if (Number(capabilities.deviceMemory) > 0 && Number(capabilities.deviceMemory) <= 4) scale *= 0.76;
  return clamp(Math.round(areaBudget * scale), density.min, density.max);
}

export function fieldAngle(x, y, time) {
  const scale = 0.0018;
  const nx = x * scale;
  const ny = y * scale;
  const nt = time * 0.00005;
  return (
    Math.sin(nx + nt) * 2.3
    + Math.cos(ny * 1.4 - nt * 0.8) * 2.7
    + Math.sin((nx + ny) * 0.7 + nt * 1.2) * 1.8
    + Math.cos(Math.hypot(nx, ny) * 0.9 - nt) * 2.1
  );
}

export function lightPosition(width, height, timestamp) {
  const phase = timestamp * 0.000055;
  return Object.freeze({
    x: width * (0.72 + Math.cos(phase) * 0.16),
    y: height * (0.42 + Math.sin(phase * 0.83) * 0.2),
  });
}

export function influencedLightPosition(width, height, timestamp, pointer = {}, influence = 0.42) {
  const autonomous = lightPosition(width, height, timestamp);
  if (!pointer.active || influence <= 0) return autonomous;
  const pointerX = clamp(Number(pointer.x) || 0, 0, width);
  const pointerY = clamp(Number(pointer.y) || 0, 0, height);
  const boundedInfluence = clamp(Number(influence) || 0, 0, 1);
  return Object.freeze({
    x: autonomous.x * (1 - boundedInfluence) + pointerX * boundedInfluence,
    y: autonomous.y * (1 - boundedInfluence) + pointerY * boundedInfluence,
  });
}

export function pointerAttraction(x, y, pointer = {}, radius = 0, config = ATLAS_FIELD_PRESETS.hero.pointer) {
  if (!pointer.active || radius <= 0 || config.enabled === false) return ZERO_POINTER_FORCE;

  const pointerX = Number(pointer.x);
  const pointerY = Number(pointer.y);
  if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return ZERO_POINTER_FORCE;

  const deltaX = pointerX - x;
  const deltaY = pointerY - y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance >= radius || distance === 0) return ZERO_POINTER_FORCE;

  const falloff = clamp(1 - distance / radius, 0, 1);
  const influence = falloff * falloff;
  const unitX = deltaX / distance;
  const unitY = deltaY / distance;
  const radialStrength = Number(config.radialStrength) * influence;
  const orbitalStrength = Number(config.orbitalStrength) * influence;

  return Object.freeze({
    x: unitX * radialStrength - unitY * orbitalStrength,
    y: unitY * radialStrength + unitX * orbitalStrength,
    influence,
  });
}

export function createAtlasField(host, options = {}) {
  if (!(host instanceof Element)) throw new TypeError("AtlasField requires a host Element");
  if (instances.has(host)) return instances.get(host);

  const resolved = resolveAtlasFieldOptions(options);
  const canvas = document.createElement("canvas");
  canvas.className = ["atlas-field-canvas", resolved.canvasClass].filter(Boolean).join(" ");
  canvas.setAttribute("aria-hidden", "true");
  canvas.setAttribute("role", "presentation");
  canvas.dataset.atlasFieldPreset = resolved.preset;
  host.prepend(canvas);

  const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!context) {
    canvas.remove();
    return null;
  }

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const saveData = Boolean(navigator.connection?.saveData);
  const deviceMemory = Number(navigator.deviceMemory || 8);
  const random = createSeededRandom(hashSeed(resolved.seed));

  let width = 1;
  let height = 1;
  let particles = new Float32Array(0);
  let targetCount = resolved.density.min;
  let activeCount = targetCount;
  let frame = 0;
  let simulationTime = 0;
  let animationFrame = null;
  let isVisible = true;
  let isPaused = false;
  let averageFrameTime = 16.7;
  let previousTimestamp = 0;
  let pointer = { active: false, x: 0, y: 0 };
  let renderedLight = null;
  let resizeObserver = null;
  let visibilityObserver = null;

  function seedParticle(index) {
    particles[index] = random() * width;
    particles[index + 1] = random() * height;
    particles[index + 2] = 0;
    particles[index + 3] = 0;
  }

  function allocateParticles(count) {
    particles = new Float32Array(count * 4);
    for (let index = 0; index < particles.length; index += 4) seedParticle(index);
    activeCount = count;
  }

  function advanceParticle(index, time, distanceScale = 1, pointerRadius = 0) {
    const x = particles[index];
    const y = particles[index + 1];
    let velocityX = particles[index + 2];
    let velocityY = particles[index + 3];
    const angle = fieldAngle(x, y, time);

    velocityX = velocityX * 0.93 + Math.cos(angle) * 0.3;
    velocityY = velocityY * 0.93 + Math.sin(angle) * 0.3;

    if (pointer.active && pointerRadius > 0) {
      const attraction = pointerAttraction(x, y, pointer, pointerRadius, resolved.pointer);
      velocityX += attraction.x;
      velocityY += attraction.y;
    }

    const nextX = x + velocityX * distanceScale;
    const nextY = y + velocityY * distanceScale;

    particles[index] = nextX;
    particles[index + 1] = nextY;
    particles[index + 2] = velocityX;
    particles[index + 3] = velocityY;

    return { x, y, nextX, nextY, speed: Math.hypot(velocityX, velocityY) };
  }

  function warmField() {
    for (let step = 0; step < 34; step += 1) {
      simulationTime += 2.2;
      for (let index = 0; index < particles.length; index += 4) {
        const segment = advanceParticle(index, simulationTime, 0.72);
        if (
          segment.nextX < -40
          || segment.nextX > width + 40
          || segment.nextY < -40
          || segment.nextY > height + 40
        ) {
          seedParticle(index);
        }
      }
    }
  }

  function drawStaticField() {
    context.clearRect(0, 0, width, height);
    const light = lightPosition(width, height, 0);
    const paths = [new Path2D(), new Path2D(), new Path2D()];

    for (let index = 0; index < particles.length; index += 4) {
      const x = particles[index];
      const y = particles[index + 1];
      const angle = fieldAngle(x, y, simulationTime);
      const length = 8 + random() * 12;
      const distance = Math.hypot(x - light.x, y - light.y);
      const bucket = distance < Math.max(width, height) * 0.22 ? 2 : distance < Math.max(width, height) * 0.4 ? 1 : 0;
      paths[bucket].moveTo(x, y);
      paths[bucket].lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    }

    context.save();
    context.globalCompositeOperation = "lighter";
    const styles = [
      ["rgba(102, 143, 132, 0.18)", 0.7],
      ["rgba(177, 188, 169, 0.25)", 0.9],
      ["rgba(255, 244, 205, 0.38)", 1.08],
    ];
    paths.forEach((path, index) => {
      context.strokeStyle = styles[index][0];
      context.lineWidth = styles[index][1];
      context.stroke(path);
    });
    context.restore();
    canvas.dataset.mode = "static";
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    const pixelRatio = Math.min(resolved.dprCap, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    targetCount = chooseParticleBudget(
      width,
      height,
      { coarsePointer, saveData, deviceMemory },
      resolved.density,
    );
    allocateParticles(motionQuery.matches ? resolved.density.reduced : targetCount);
    renderedLight = lightPosition(width, height, 0);
    warmField();
    if (motionQuery.matches) drawStaticField();
  }

  function adaptParticleCount(timestamp) {
    if (previousTimestamp > 0) {
      const delta = clamp(timestamp - previousTimestamp, 8, 80);
      averageFrameTime = averageFrameTime * 0.94 + delta * 0.06;
      simulationTime += delta * 0.16;
    }
    previousTimestamp = timestamp;
    if (frame % 150 !== 0) return;
    if (averageFrameTime > 23 && activeCount > resolved.density.min) {
      activeCount = Math.max(resolved.density.min, Math.floor(activeCount * 0.84));
    } else if (averageFrameTime < 17.5 && activeCount < targetCount) {
      activeCount = Math.min(targetCount, activeCount + 96);
    }
  }

  function drawLightHalo(light, radius) {
    const halo = context.createRadialGradient(light.x, light.y, 0, light.x, light.y, radius);
    halo.addColorStop(0, "rgba(255, 249, 222, 0.075)");
    halo.addColorStop(0.28, "rgba(201, 211, 187, 0.032)");
    halo.addColorStop(1, "rgba(10, 10, 15, 0)");
    context.fillStyle = halo;
    context.fillRect(light.x - radius, light.y - radius, radius * 2, radius * 2);
  }

  function resolveLight(timestamp) {
    const target = influencedLightPosition(
      width,
      height,
      timestamp,
      pointer,
      resolved.pointer.lightInfluence,
    );
    if (!renderedLight) renderedLight = { ...target };
    const smoothing = pointer.active ? resolved.pointer.smoothing : resolved.light.smoothing;
    renderedLight.x += (target.x - renderedLight.x) * smoothing;
    renderedLight.y += (target.y - renderedLight.y) * smoothing;
    return renderedLight;
  }

  function strokeDomainPaths(domainPaths) {
    domainPaths.forEach((path, index) => {
      context.strokeStyle = resolved.domainStyles[index];
      context.lineWidth = 0.8;
      context.stroke(path);
    });
  }

  function render(timestamp) {
    animationFrame = null;
    if (document.hidden || !isVisible || isPaused || motionQuery.matches) return;

    frame += 1;
    adaptParticleCount(timestamp);

    context.save();
    context.globalCompositeOperation = "source-over";
    context.fillStyle = "rgba(10, 10, 15, 0.018)";
    context.fillRect(0, 0, width, height);

    const light = resolveLight(timestamp);
    const lightRadius = Math.max(resolved.light.radiusMin, Math.min(width, height) * resolved.light.radiusRatio);
    const pointerRadius = resolved.pointer.enabled
      ? Math.max(resolved.pointer.radiusMin, Math.min(width, height) * resolved.pointer.radiusRatio)
      : 0;
    context.globalCompositeOperation = "lighter";
    drawLightHalo(light, lightRadius * 0.58);

    const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    const domainPaths = [new Path2D(), new Path2D(), new Path2D()];
    const glowPath = new Path2D();
    const corePath = new Path2D();
    const particleLimit = Math.min(activeCount * 4, particles.length);

    for (let index = 0; index < particleLimit; index += 4) {
      const segment = advanceParticle(index, simulationTime, 1.08, pointerRadius);
      const distance = Math.hypot(segment.nextX - light.x, segment.nextY - light.y);
      const influence = clamp(1 - distance / lightRadius, 0, 1);
      const energy = clamp((segment.speed - 0.5) / 3.4, 0, 1);
      const bucket = clamp(Math.floor(energy * 2.4 + influence * 1.8), 0, 3);

      paths[bucket].moveTo(segment.x, segment.y);
      paths[bucket].lineTo(segment.nextX, segment.nextY);

      if (energy > 0.18 || influence > 0.18) {
        const position = segment.nextX / width;
        const domain = position < resolved.domainBreaks[0] ? 0 : position < resolved.domainBreaks[1] ? 1 : 2;
        domainPaths[domain].moveTo(segment.x, segment.y);
        domainPaths[domain].lineTo(segment.nextX, segment.nextY);
      }

      if (influence > 0.36 && segment.speed > 1.25) {
        glowPath.moveTo(segment.x, segment.y);
        glowPath.lineTo(segment.nextX, segment.nextY);
      }
      if (influence > 0.74 && segment.speed > 2) {
        corePath.moveTo(segment.x, segment.y);
        corePath.lineTo(segment.nextX, segment.nextY);
      }

      if (
        segment.nextX < -40
        || segment.nextX > width + 40
        || segment.nextY < -40
        || segment.nextY > height + 40
        || random() < 0.0006
      ) {
        seedParticle(index);
      }
    }

    const styles = [
      ["rgba(80, 120, 111, 0.12)", 0.68],
      ["rgba(119, 155, 141, 0.17)", 0.78],
      ["rgba(172, 187, 164, 0.22)", 0.88],
      ["rgba(229, 222, 185, 0.26)", 0.96],
    ];

    paths.forEach((path, index) => {
      context.strokeStyle = styles[index][0];
      context.lineWidth = styles[index][1];
      context.stroke(path);
    });

    strokeDomainPaths(domainPaths);

    context.save();
    context.shadowBlur = 11;
    context.shadowColor = "rgba(232, 236, 207, 0.52)";
    context.strokeStyle = "rgba(221, 225, 199, 0.24)";
    context.lineWidth = 1.15;
    context.stroke(glowPath);
    context.restore();

    context.strokeStyle = "rgba(255, 248, 214, 0.46)";
    context.lineWidth = 0.72;
    context.stroke(corePath);
    context.restore();

    canvas.dataset.mode = "animated";
    canvas.dataset.frame = String(frame);
    canvas.dataset.pointer = pointer.active ? "influenced" : "autonomous";
    animationFrame = window.requestAnimationFrame(render);
  }

  function updatePlayback() {
    if (motionQuery.matches) {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
      allocateParticles(resolved.density.reduced);
      warmField();
      drawStaticField();
      return;
    }
    if (!document.hidden && isVisible && !isPaused && animationFrame === null) {
      previousTimestamp = 0;
      animationFrame = window.requestAnimationFrame(render);
    }
  }

  function updatePointer(event) {
    if (!resolved.pointer.enabled || coarsePointer || motionQuery.matches) return;
    const bounds = canvas.getBoundingClientRect();
    pointer = {
      active: true,
      x: clamp(event.clientX - bounds.left, 0, bounds.width),
      y: clamp(event.clientY - bounds.top, 0, bounds.height),
    };
  }

  function releasePointer() {
    pointer = { ...pointer, active: false };
  }

  function handleMotionChange() {
    releasePointer();
    resize();
    updatePlayback();
  }

  function handleVisibilityChange() {
    updatePlayback();
  }

  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
  } else {
    window.addEventListener("resize", resize, { passive: true });
  }

  if ("IntersectionObserver" in window) {
    visibilityObserver = new IntersectionObserver((entries) => {
      isVisible = entries.some((entry) => entry.isIntersecting);
      updatePlayback();
    }, { rootMargin: "160px 0px", threshold: 0.01 });
    visibilityObserver.observe(host);
  }

  if (resolved.pointer.enabled && !coarsePointer) {
    host.addEventListener("pointermove", updatePointer, { passive: true });
    host.addEventListener("pointerleave", releasePointer, { passive: true });
    host.addEventListener("pointercancel", releasePointer, { passive: true });
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);
  motionQuery.addEventListener?.("change", handleMotionChange);

  const controller = Object.freeze({
    canvas,
    options: resolved,
    pause() {
      isPaused = true;
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
      canvas.dataset.playback = "paused";
    },
    resume() {
      isPaused = false;
      canvas.dataset.playback = "running";
      updatePlayback();
    },
    resize,
    destroy() {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      window.removeEventListener("resize", resize);
      host.removeEventListener("pointermove", updatePointer);
      host.removeEventListener("pointerleave", releasePointer);
      host.removeEventListener("pointercancel", releasePointer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      motionQuery.removeEventListener?.("change", handleMotionChange);
      canvas.remove();
      instances.delete(host);
    },
  });

  instances.set(host, controller);
  resize();
  updatePlayback();
  return controller;
}
