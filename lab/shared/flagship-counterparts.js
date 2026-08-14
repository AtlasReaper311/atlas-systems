"use strict";

const STYLESHEETS = Object.freeze([
  "/lab/shared/flagship-counterparts.css?v=20260814-atlas-audio-flagship-v3",
  "/lab/spectral-forge/spectral-forge-flagship-v2.css?v=20260814-atlas-audio-flagship-v3",
]);

const ROUTES = Object.freeze({
  "/lab/system-symphony/": Object.freeze({
    href: "/lab/spectral-forge/",
    family: "LISTEN",
    counterpartFamily: "DESIGN",
    prefix: "SYSTEM",
    signature: "SYMPHONY",
    title: "Spectral Forge",
    thesis: "Design how a system becomes sound.",
    source: "SYSTEM SYMPHONY",
  }),
  "/lab/spectral-forge/": Object.freeze({
    href: "/lab/system-symphony/",
    family: "DESIGN",
    counterpartFamily: "LISTEN",
    prefix: "SPECTRAL",
    signature: "Forge",
    title: "SYSTEM SYMPHONY",
    thesis: "Listen to a system.",
    source: "SPECTRAL Forge",
  }),
});

const SYMPHONY_ROLES = Object.freeze(["clock", "pulse", "memory", "thermal", "signal", "contention", "recovery"]);
const SYMPHONY_STATE_SEVERITY = Object.freeze({ healthy: 0.08, warning: 0.42, critical: 0.9, unknown: 0.24 });

function normalizePath(pathname) {
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

function ensureStylesheets(pathname) {
  for (const href of STYLESHEETS) {
    if (href.includes("spectral-forge-flagship-v2") && pathname !== "/lab/spectral-forge/") continue;
    const base = href.split("?")[0];
    if (document.head.querySelector(`link[href^="${base}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }
}

function identitySurface(pathname) {
  if (pathname === "/lab/spectral-forge/") {
    return {
      title: document.querySelector(".forge-product-identity h1"),
      copy: document.querySelector(".forge-product-identity p"),
    };
  }
  if (pathname === "/lab/system-symphony/") {
    return {
      title: document.querySelector("#symphony-page-title"),
      copy: document.querySelector(".symphony-flagship .focus-lede"),
    };
  }
  return { title: null, copy: null };
}

function createFamilyMark(documentNode, family) {
  const mark = documentNode.createElement("p");
  mark.className = "atlas-audio-family__mark";
  const glyph = documentNode.createElement("span");
  glyph.className = "atlas-audio-family__glyph";
  glyph.setAttribute("aria-hidden", "true");
  const text = documentNode.createElement("span");
  text.textContent = `ATLAS AUDIO // ${family}`;
  mark.append(glyph, text);
  return mark;
}

function decorateIdentity(pathname, definition) {
  const { title, copy } = identitySurface(pathname);
  if (!title || title.dataset.atlasAudioFamilyReady === "true") return;

  const documentNode = title.ownerDocument;
  const mark = createFamilyMark(documentNode, definition.family);
  title.parentElement?.insertBefore(mark, title);

  title.classList.add("atlas-audio-title", pathname === "/lab/system-symphony/" ? "atlas-audio-title--listen" : "atlas-audio-title--design");
  title.replaceChildren();

  const prefix = documentNode.createElement("span");
  prefix.className = "atlas-audio-title__prefix";
  prefix.textContent = definition.prefix;

  const signature = pathname === "/lab/spectral-forge/"
    ? documentNode.createElement("em")
    : documentNode.createElement("span");
  signature.className = "atlas-audio-title__signature";
  signature.textContent = definition.signature;
  title.append(prefix, signature);
  title.dataset.atlasAudioFamilyReady = "true";

  if (copy && !copy.parentElement?.querySelector(".atlas-audio-family__counterpart")) {
    const link = documentNode.createElement("a");
    link.className = "atlas-audio-family__counterpart";
    link.href = definition.href;
    link.setAttribute("aria-label", `${definition.counterpartFamily}: open ${definition.title}`);
    link.innerHTML = `<span>${definition.counterpartFamily}</span><strong>${definition.title}</strong><i aria-hidden="true">→</i>`;
    copy.insertAdjacentElement("afterend", link);
  }
}

function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicUnit(seed, index) {
  const value = Math.sin((seed + index * 71.371) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function symphonyState(cartridge, flagship) {
  const raw = String(cartridge?.dominantState ?? flagship?.dataset.scoreState ?? "unknown").toLowerCase();
  if (["healthy", "warning", "critical", "unknown"].includes(raw)) return raw;
  return "unknown";
}

function scoreDensity(cartridge, role) {
  const entry = cartridge?.scorePlan?.roles?.[role] ?? {};
  for (const candidate of [entry.density, entry.pressure, entry.load, entry.intensity]) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) return Math.max(0, Math.min(1, numeric));
  }
  if (role === "clock") return 0.72;
  if (role === "contention") return Number(entry.alerts) > 0 ? 0.62 : 0.12;
  if (role === "recovery") return entry.active === true ? 0.48 : 0.12;
  return 0.3;
}

function resizeCanvas(canvas) {
  const ratio = Math.min(1.75, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, ratio };
}

function drawSymphonyArchitecture(context, surface, time) {
  const canvas = surface.querySelector("canvas");
  const flagship = document.querySelector("[data-symphony-flagship]");
  if (!canvas || !flagship) return;

  const { width, height, ratio } = resizeCanvas(canvas);
  const cartridge = window.__ATLAS_APU_CARTRIDGE__ ?? null;
  const state = symphonyState(cartridge, flagship);
  const severity = SYMPHONY_STATE_SEVERITY[state] ?? SYMPHONY_STATE_SEVERITY.unknown;
  const seedText = String(cartridge?.frameSeed ?? cartridge?.seed ?? cartridge?.replaySeed ?? "A7A5");
  const seed = hashText(`${seedText}:${state}`) / 4294967296;
  const moving = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const phase = moving ? time * (0.00018 + severity * 0.00008) : seed * Math.PI * 2;
  const breath = moving ? 0.5 + Math.sin(phase * 6.2) * 0.5 : 0.5;
  const vanishingX = width * (0.57 + severity * 0.025 * Math.sin(phase * 1.7));
  const vanishingY = height * (0.48 + severity * 0.045 * Math.cos(phase * 1.3));

  surface.dataset.state = state;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#07070b";
  context.fillRect(0, 0, width, height);

  const wash = context.createRadialGradient(vanishingX, vanishingY, 0, vanishingX, vanishingY, Math.max(width, height) * 0.66);
  wash.addColorStop(0, `rgba(245,166,35,${0.035 + breath * 0.025})`);
  wash.addColorStop(0.28, `rgba(116,208,255,${0.018 + (1 - severity) * 0.02})`);
  wash.addColorStop(0.7, `rgba(127,136,255,${severity * 0.025})`);
  wash.addColorStop(1, "rgba(7,7,11,0)");
  context.fillStyle = wash;
  context.fillRect(0, 0, width, height);

  context.save();
  context.lineWidth = Math.max(1, ratio * 0.5);
  for (let ray = 0; ray < 17; ray += 1) {
    const p = ray / 16;
    const edgeX = width * (0.03 + p * 0.94);
    context.beginPath();
    context.moveTo(vanishingX, vanishingY);
    context.lineTo(edgeX, height * 0.96);
    context.strokeStyle = `rgba(170,204,228,${0.014 + (ray % 4 === 0 ? 0.018 : 0)})`;
    context.stroke();
  }
  for (let row = 0; row < 8; row += 1) {
    const p = row / 7;
    const y = vanishingY + (height * 0.48) * (p ** 1.65);
    const spread = width * (0.05 + p * 0.52);
    context.beginPath();
    context.moveTo(vanishingX - spread, y);
    context.lineTo(vanishingX + spread, y);
    context.strokeStyle = `rgba(170,204,228,${0.018 + p * 0.018})`;
    context.stroke();
  }
  context.restore();

  const coreWidth = width * (0.23 + severity * 0.02);
  const coreHeight = height * (0.34 + severity * 0.04);
  const tilt = severity * 0.045 * Math.sin(phase * 2.1);
  context.save();
  context.translate(vanishingX, vanishingY);
  context.rotate(tilt);
  context.translate(-vanishingX, -vanishingY);
  for (let layer = 5; layer >= 0; layer -= 1) {
    const inset = layer * ratio * 13;
    const alpha = 0.025 + (5 - layer) * 0.014 + (layer === 0 ? 0.045 : 0);
    context.strokeStyle = layer === 0 ? `rgba(245,166,35,${0.24 + breath * 0.08})` : `rgba(164,211,240,${alpha})`;
    context.lineWidth = Math.max(1, ratio * (layer === 0 ? 0.9 : 0.48));
    context.strokeRect(vanishingX - coreWidth / 2 - inset, vanishingY - coreHeight / 2 - inset * 0.45, coreWidth + inset * 2, coreHeight + inset * 0.9);
  }
  context.restore();

  const laneTop = height * 0.18;
  const laneBottom = height * 0.82;
  SYMPHONY_ROLES.forEach((role, roleIndex) => {
    const density = scoreDensity(cartridge, role);
    const laneP = roleIndex / (SYMPHONY_ROLES.length - 1);
    const y = laneTop + (laneBottom - laneTop) * laneP;
    const offset = (laneP - 0.5) * height * severity * 0.045 * Math.sin(phase * 2.8 + roleIndex);
    const startX = width * 0.05;
    const endX = width * 0.94;

    context.beginPath();
    context.moveTo(startX, y + offset);
    context.bezierCurveTo(width * 0.3, y + offset, vanishingX - coreWidth * 0.6, vanishingY + (laneP - 0.5) * coreHeight * 0.7, vanishingX, vanishingY + (laneP - 0.5) * coreHeight * 0.36);
    context.bezierCurveTo(vanishingX + coreWidth * 0.56, vanishingY + (laneP - 0.5) * coreHeight * 0.72, width * 0.72, y - offset, endX, y - offset);
    context.strokeStyle = `rgba(${roleIndex === 5 ? "245,166,35" : roleIndex % 2 ? "127,136,255" : "116,208,255"},${0.055 + density * 0.13})`;
    context.lineWidth = Math.max(1, ratio * (0.48 + density * 0.32));
    context.stroke();

    for (let step = 0; step < 16; step += 1) {
      const stepP = step / 15;
      const x = startX + (endX - startX) * stepP;
      const random = deterministicUnit(seed * 9000 + roleIndex * 47.1, step);
      const active = role === "clock" ? step % 4 === 0 : random < density;
      const localSeverity = severity * Math.sin(stepP * Math.PI);
      const nodeY = y + offset * (1 - stepP * 2) + Math.sin(stepP * Math.PI * 2 + phase * 4 + roleIndex) * localSeverity * height * 0.018;
      const size = ratio * (active ? 2.2 + density * 2.2 : 1.2);
      context.beginPath();
      context.arc(x, nodeY, size, 0, Math.PI * 2);
      context.fillStyle = active
        ? roleIndex === 5
          ? `rgba(245,166,35,${0.3 + density * 0.48})`
          : `rgba(190,226,255,${0.24 + density * 0.42})`
        : "rgba(170,204,228,0.06)";
      context.fill();
    }
  });

  if (severity > 0.34) {
    const planes = 2 + Math.round(severity * 3);
    for (let plane = 0; plane < planes; plane += 1) {
      const x = width * (0.36 + deterministicUnit(seed * 13000, plane) * 0.42);
      const lean = (deterministicUnit(seed * 17000, plane) - 0.5) * width * 0.08 * severity;
      context.beginPath();
      context.moveTo(x - lean, height * 0.12);
      context.lineTo(x + lean, height * 0.88);
      context.strokeStyle = `rgba(211,203,255,${0.025 + severity * 0.08})`;
      context.lineWidth = Math.max(1, ratio * 0.52);
      context.stroke();
    }
  }

  context.save();
  context.textAlign = "center";
  context.font = `${Math.max(8, 9 * ratio)}px "IBM Plex Mono", monospace`;
  context.fillStyle = "rgba(232,232,224,0.34)";
  context.fillText("ATLAS APU-01", vanishingX, vanishingY - coreHeight * 0.57);
  context.fillStyle = "rgba(245,166,35,0.62)";
  context.fillText(state.toUpperCase(), vanishingX, vanishingY + coreHeight * 0.62);
  context.restore();
}

function installSymphonyArchitecture(pathname) {
  if (pathname !== "/lab/system-symphony/") return;
  const top = document.querySelector(".symphony-flagship__top");
  if (!top || top.querySelector("[data-symphony-score-architecture]")) return;

  const surface = document.createElement("div");
  surface.className = "symphony-score-architecture";
  surface.dataset.symphonyScoreArchitecture = "";
  surface.dataset.state = "unknown";
  surface.setAttribute("aria-hidden", "true");

  const canvas = document.createElement("canvas");
  const legend = document.createElement("div");
  legend.className = "symphony-score-architecture__legend";
  legend.innerHTML = "<span>APU SCORE BUS</span><span>7 ROLES / 16 STEPS</span><span>STATE-DERIVED</span>";
  surface.append(canvas, legend);
  top.appendChild(surface);

  let frame = 0;
  let lastPaint = 0;
  let active = true;
  const paint = (timestamp = performance.now()) => {
    if (!active) return;
    if (document.visibilityState !== "hidden" && timestamp - lastPaint >= 32) {
      drawSymphonyArchitecture(canvas.getContext("2d"), surface, timestamp);
      lastPaint = timestamp;
    }
    frame = window.requestAnimationFrame(paint);
  };

  const cover = document.querySelector("[data-current-cartridge-cover]");
  const observer = cover ? new MutationObserver(() => drawSymphonyArchitecture(canvas.getContext("2d"), surface, performance.now())) : null;
  observer?.observe(cover, { attributes: true, attributeFilter: ["data-state"] });
  const resizeObserver = new ResizeObserver(() => drawSymphonyArchitecture(canvas.getContext("2d"), surface, performance.now()));
  resizeObserver.observe(surface);
  paint();

  window.addEventListener("pagehide", () => {
    active = false;
    if (frame) window.cancelAnimationFrame(frame);
    observer?.disconnect();
    resizeObserver.disconnect();
  }, { once: true });
}

function insertionAnchor(pathname) {
  if (pathname === "/lab/spectral-forge/") return document.querySelector('.forge-play .forge-field-stage');
  if (pathname === "/lab/system-symphony/") return document.querySelector(".symphony-stage");
  return null;
}

export function installFlagshipCounterpart() {
  const pathname = normalizePath(window.location.pathname);
  const counterpart = ROUTES[pathname];
  if (!counterpart) return null;

  ensureStylesheets(pathname);
  decorateIdentity(pathname, counterpart);
  installSymphonyArchitecture(pathname);

  const existing = document.querySelector("[data-flagship-counterpart]");
  if (existing) return existing;

  const anchor = insertionAnchor(pathname);
  if (!anchor) return null;

  const documentNode = anchor.ownerDocument;
  const aside = documentNode.createElement("aside");
  aside.className = "lab-flagship-counterpart";
  aside.dataset.flagshipCounterpart = "";
  aside.setAttribute("aria-label", `${counterpart.source} audio counterpart`);

  const family = createFamilyMark(documentNode, counterpart.counterpartFamily);
  family.classList.add("lab-flagship-counterpart__family");

  const link = documentNode.createElement("a");
  link.className = "lab-flagship-counterpart__link";
  link.href = counterpart.href;

  const title = documentNode.createElement("strong");
  title.textContent = counterpart.title;
  const thesis = documentNode.createElement("span");
  thesis.textContent = counterpart.thesis;
  const route = documentNode.createElement("span");
  route.className = "lab-flagship-counterpart__route";
  route.textContent = `OPEN ${counterpart.counterpartFamily} →`;
  link.append(title, thesis, route);
  aside.append(family, link);
  anchor.insertAdjacentElement("afterend", aside);
  return aside;
}