const commands = [
  {
    cmd: "atlas map --live",
    out: "declared topology + observed runtime registry resolved",
  },
  {
    cmd: "atlas audio --list",
    out: "System SYMPHONY · Signal Garden · real-time DSP surfaces",
  },
  {
    cmd: "atlas evidence --latest",
    out: "deploy outcomes · GitHub activity · service health · architecture contracts",
  },
  {
    cmd: "atlas corpus --search",
    out: "case studies · ADRs · READMEs · estate context",
  },
];

const HERO_FIELD_LIMITS = Object.freeze({
  min: 420,
  max: 1400,
  reduced: 360,
});

function hashSeed(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed) {
  let state = Number(seed) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function chooseParticleBudget(width, height, capabilities = {}) {
  const areaBudget = Math.round(Math.max(1, width * height) / 900);
  let scale = 1;
  if (capabilities.coarsePointer) scale *= 0.72;
  if (capabilities.saveData) scale *= 0.58;
  if (Number(capabilities.deviceMemory) > 0 && Number(capabilities.deviceMemory) <= 4) scale *= 0.76;
  return clamp(Math.round(areaBudget * scale), HERO_FIELD_LIMITS.min, HERO_FIELD_LIMITS.max);
}

function fieldAngle(x, y, time) {
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

function initTerminal() {
  const input = document.getElementById("terminal-text");
  const output = document.getElementById("terminal-output");
  const cursor = document.getElementById("terminal-cursor");
  if (!input || !output) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  if (reduceMotion) {
    input.textContent = commands[0].cmd;
    output.textContent = commands[0].out;
    if (cursor) cursor.style.animation = "none";
    return;
  }

  async function type(text) {
    input.textContent = "";
    for (const character of text) {
      input.textContent += character;
      await delay(40);
    }
  }

  async function erase() {
    while (input.textContent.length > 0) {
      input.textContent = input.textContent.slice(0, -1);
      await delay(16);
    }
  }

  async function run() {
    await delay(320);
    let index = 0;
    while (true) {
      const item = commands[index % commands.length];
      await type(item.cmd);
      output.textContent = item.out;
      await delay(2800);
      await erase();
      index += 1;
      await delay(240);
    }
  }

  void run();
}

function initHeroField() {
  const hero = document.querySelector(".hero");
  if (!hero || hero.querySelector(".hero-field")) return;

  const canvas = document.createElement("canvas");
  canvas.className = "hero-field";
  canvas.setAttribute("aria-hidden", "true");
  canvas.setAttribute("role", "presentation");
  hero.prepend(canvas);

  const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!context) {
    canvas.remove();
    return;
  }

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const saveData = Boolean(navigator.connection?.saveData);
  const deviceMemory = Number(navigator.deviceMemory || 8);
  const random = createSeededRandom(hashSeed("atlas-systems-home-field-v1"));

  let width = 1;
  let height = 1;
  let particles = new Float32Array(0);
  let targetCount = HERO_FIELD_LIMITS.min;
  let activeCount = targetCount;
  let frame = 0;
  let animationFrame = null;
  let isVisible = true;
  let averageFrameTime = 16.7;
  let previousTimestamp = 0;
  let gradient = null;

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

  function rebuildGradient() {
    gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "rgba(92, 138, 126, 0.42)");
    gradient.addColorStop(0.48, "rgba(164, 174, 158, 0.38)");
    gradient.addColorStop(1, "rgba(245, 166, 35, 0.32)");
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    const pixelRatio = Math.min(1.75, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    targetCount = chooseParticleBudget(width, height, { coarsePointer, saveData, deviceMemory });
    allocateParticles(motionQuery.matches ? HERO_FIELD_LIMITS.reduced : targetCount);
    rebuildGradient();
    if (motionQuery.matches) drawStaticField();
  }

  function drawStaticField() {
    context.clearRect(0, 0, width, height);
    context.beginPath();
    for (let index = 0; index < particles.length; index += 4) {
      const x = particles[index];
      const y = particles[index + 1];
      const angle = fieldAngle(x, y, 0);
      const length = 7 + random() * 10;
      context.moveTo(x, y);
      context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    }
    context.strokeStyle = gradient;
    context.globalAlpha = 0.24;
    context.lineWidth = 0.7;
    context.stroke();
    context.globalAlpha = 1;
    canvas.dataset.mode = "static";
  }

  function adaptParticleCount(timestamp) {
    if (previousTimestamp > 0) {
      const delta = clamp(timestamp - previousTimestamp, 8, 80);
      averageFrameTime = averageFrameTime * 0.94 + delta * 0.06;
    }
    previousTimestamp = timestamp;
    if (frame % 150 !== 0) return;
    if (averageFrameTime > 23 && activeCount > HERO_FIELD_LIMITS.min) {
      activeCount = Math.max(HERO_FIELD_LIMITS.min, Math.floor(activeCount * 0.84));
    } else if (averageFrameTime < 17.5 && activeCount < targetCount) {
      activeCount = Math.min(targetCount, activeCount + 80);
    }
  }

  function render(timestamp) {
    animationFrame = null;
    if (document.hidden || !isVisible || motionQuery.matches) return;

    frame += 1;
    adaptParticleCount(timestamp);
    context.fillStyle = "rgba(10, 10, 15, 0.052)";
    context.fillRect(0, 0, width, height);
    context.beginPath();

    const particleLimit = Math.min(activeCount * 4, particles.length);
    for (let index = 0; index < particleLimit; index += 4) {
      let x = particles[index];
      let y = particles[index + 1];
      let velocityX = particles[index + 2];
      let velocityY = particles[index + 3];
      const angle = fieldAngle(x, y, frame);

      velocityX = velocityX * 0.93 + Math.cos(angle) * 0.24;
      velocityY = velocityY * 0.93 + Math.sin(angle) * 0.24;
      const nextX = x + velocityX;
      const nextY = y + velocityY;

      context.moveTo(x, y);
      context.lineTo(nextX, nextY);

      particles[index] = nextX;
      particles[index + 1] = nextY;
      particles[index + 2] = velocityX;
      particles[index + 3] = velocityY;

      if (
        nextX < -32
        || nextX > width + 32
        || nextY < -32
        || nextY > height + 32
        || random() < 0.00045
      ) {
        seedParticle(index);
      }
    }

    context.strokeStyle = gradient;
    context.globalAlpha = 0.2;
    context.lineWidth = 0.72;
    context.stroke();
    context.globalAlpha = 1;
    canvas.dataset.mode = "animated";
    animationFrame = window.requestAnimationFrame(render);
  }

  function updatePlayback() {
    if (motionQuery.matches) {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
      allocateParticles(HERO_FIELD_LIMITS.reduced);
      drawStaticField();
      return;
    }
    if (!document.hidden && isVisible && animationFrame === null) {
      previousTimestamp = 0;
      animationFrame = window.requestAnimationFrame(render);
    }
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(hero);

  const visibilityObserver = new IntersectionObserver((entries) => {
    isVisible = entries.some((entry) => entry.isIntersecting);
    updatePlayback();
  }, { rootMargin: "160px 0px", threshold: 0.01 });
  visibilityObserver.observe(hero);

  document.addEventListener("visibilitychange", updatePlayback);
  motionQuery.addEventListener?.("change", () => {
    resize();
    updatePlayback();
  });

  resize();
  updatePlayback();
}

function initReveal() {
  const elements = document.querySelectorAll(".reveal");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    elements.forEach((element) => element.classList.add("visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.08 });

  elements.forEach((element) => observer.observe(element));
}

function initNavigation() {
  const path = window.location.pathname;
  document.querySelectorAll(".nav-link, .mobile-nav-item").forEach((link) => {
    const href = link.getAttribute("href");
    if (!href) return;
    const home = href === "/" && path === "/";
    const nested = href !== "/" && path.startsWith(href);
    if (home || nested) link.classList.add("active");
  });
}

function initFooter() {
  const year = document.getElementById("footer-year");
  if (year) year.textContent = String(new Date().getFullYear());
}

function init() {
  initTerminal();
  initHeroField();
  initReveal();
  initNavigation();
  initFooter();
}

if (globalThis.__ATLAS_TEST__) {
  globalThis.__atlasHomepageField = Object.freeze({
    chooseParticleBudget,
    createSeededRandom,
    fieldAngle,
    hashSeed,
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
