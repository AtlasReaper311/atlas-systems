"use strict";

const STYLESHEETS = Object.freeze([
  "/lab/shared/flagship-counterparts.css?v=20260814-atlas-audio-flagship-v2",
  "/lab/spectral-forge/spectral-forge-flagship-v2.css?v=20260814-atlas-audio-flagship-v2",
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