import path from "node:path";

export const EVIDENCE_SCHEMA_VERSION = "atlas-systems/browser-evidence/v2";
export const PLAN_SCHEMA_VERSION = "atlas-systems/browser-evidence-plan/v1";

export const STANDARD_VIEWPORTS = Object.freeze([
  Object.freeze({ name: "320", width: 320, height: 760, authority: "required" }),
  Object.freeze({ name: "375", width: 375, height: 812, authority: "required" }),
  Object.freeze({ name: "768", width: 768, height: 900, authority: "required" }),
  Object.freeze({ name: "1024", width: 1024, height: 900, authority: "required" }),
  Object.freeze({ name: "1440", width: 1440, height: 1000, authority: "required" }),
  Object.freeze({ name: "1920", width: 1920, height: 1080, authority: "reporting-only" }),
]);

export const SEMANTIC_VIEWPORT_NAMES = Object.freeze(["375", "1440"]);
export const NON_INDEXED_ROUTES = Object.freeze([
  "/lab/console/",
  "/lab/cascade/",
  "/lab/system-symphony/roms/",
  "/lab/system-symphony/build-log/",
  "/lab/system-symphony/radio/",
  "/404.html",
]);

const EVIDENCE_CONTRACT_PATHS = Object.freeze([
  ".github/workflows/interface-preview.yml",
  ".github/workflows/speculum-preview-evidence.yml",
  ".github/workflows/preview.yml",
  "scripts/capture_interface_evidence.mjs",
  "scripts/capture_batch_h_evidence.mjs",
  "scripts/capture_speculum_evidence.mjs",
  "scripts/plan_interface_evidence.mjs",
  "scripts/generate_sitemap.py",
  "js/tests/interface-evidence-contract.test.mjs",
  "js/tests/batch-h-browser-evidence.test.mjs",
]);

const GLOBAL_VISUAL_PATHS = Object.freeze([
  "index.html",
  "404.html",
  "static/css/estate-shell.css",
  "static/css/atlas-field-consumer.css",
  "static/css/directory-header-fields.css",
  "static/css/card-signatures.css",
  "static/css/editorial-surfaces-v2.css",
  "static/css/v2-directory-pages.css",
  "static/js/estate-shell.js",
  "static/js/estate-status.js",
  "static/js/enable-enhancements.js",
  "static/js/card-signatures.js",
]);

const VISUAL_EXTENSIONS = new Set([".html", ".css", ".js", ".svg"]);

function unique(values) {
  return [...new Set(values)];
}

function routeSlug(route) {
  if (route === "/") return "home";
  if (route === "/404.html") return "not-found";
  return route.replace(/^\//, "").replace(/\/$/, "").replaceAll("/", "-");
}

function routeKind(route) {
  if (route === "/") return "homepage";
  if (route === "/404.html") return "error";
  if (route === "/work/") return "work";
  if (route === "/writing/") return "writing";
  if (route.startsWith("/writing/")) return "article";
  if (route === "/lab/") return "lab";
  if (route.startsWith("/lab/")) return "lab-tool";
  if (route === "/systems/") return "systems";
  if (route.startsWith("/systems/")) return "systems-detail";
  if (route === "/about/") return "about";
  return "standard";
}

function routeProfile(route) {
  if (route === "/lab/bearing/") return "bearing";
  if (route === "/lab/speculum/") return "speculum";
  if (route.startsWith("/lab/system-symphony/")) return "system-symphony";
  if (route === "/404.html") return "error";
  return "standard-shell";
}

function activeSection(route) {
  if (route === "/") return "home";
  const first = route.split("/").filter(Boolean)[0];
  return first || "home";
}

export function parseSitemapRoutes(xmlText) {
  const routes = [];
  for (const match of xmlText.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = new URL(match[1].trim());
    if (url.origin !== "https://atlas-systems.uk") {
      throw new Error(`Unexpected sitemap origin: ${url.origin}`);
    }
    routes.push(url.pathname);
  }
  return unique(routes);
}

export function allEvidenceRoutes(xmlText) {
  return unique([...parseSitemapRoutes(xmlText), ...NON_INDEXED_ROUTES]);
}

function representativePaths(routes) {
  const firstArticle = routes.find((route) => route.startsWith("/writing/") && route !== "/writing/");
  return new Set([
    "/",
    "/work/",
    "/writing/",
    firstArticle,
    "/lab/",
    "/lab/system-map/",
    "/lab/system-symphony/",
    "/lab/bearing/",
    "/lab/speculum/",
    "/systems/",
    "/systems/observability/",
    "/about/",
    "/404.html",
  ].filter(Boolean));
}

export function routeDescriptor(route, { representative = false, changed = false } = {}) {
  const profile = routeProfile(route);
  const kind = routeKind(route);
  const expanded = representative || changed;
  const viewportNames = expanded
    ? STANDARD_VIEWPORTS.map(({ name }) => name)
    : [...SEMANTIC_VIEWPORT_NAMES];
  return Object.freeze({
    name: routeSlug(route),
    path: route,
    kind,
    profile,
    activeSection: activeSection(route),
    requiresStandardShell:
      kind === "lab"
      || kind === "lab-tool"
      || profile === "standard-shell"
      || profile === "system-symphony"
      || profile === "error",
    representative,
    changed,
    viewportNames,
    screenshotViewportNames: expanded ? viewportNames : [],
  });
}

export function buildEvidencePlan({ sitemapXml, changedRoutes = [] }) {
  const routes = allEvidenceRoutes(sitemapXml);
  const known = new Set(routes);
  for (const route of changedRoutes) {
    if (!known.has(route)) throw new Error(`Changed route is not in the evidence inventory: ${route}`);
  }
  const representatives = representativePaths(routes);
  const changed = new Set(changedRoutes);
  const descriptors = routes.map((route) => routeDescriptor(route, {
    representative: representatives.has(route),
    changed: changed.has(route),
  }));
  return Object.freeze({
    schema_version: PLAN_SCHEMA_VERSION,
    sitemap_route_count: parseSitemapRoutes(sitemapXml).length,
    route_count: descriptors.length,
    required_viewports: STANDARD_VIEWPORTS.filter(({ authority }) => authority === "required").map(({ width }) => width),
    reporting_viewports: STANDARD_VIEWPORTS.filter(({ authority }) => authority === "reporting-only").map(({ width }) => width),
    changed_routes: [...changed],
    routes: descriptors,
  });
}

function routeFromIndexPath(filePath) {
  if (filePath === "index.html") return "/";
  if (filePath === "404.html") return "/404.html";
  if (!filePath.endsWith("/index.html")) return null;
  return `/${filePath.slice(0, -"index.html".length)}`;
}

function routePrefixFromPath(filePath) {
  const parts = filePath.split("/");
  if (parts[0] === "lab" && parts.length >= 2) return `/lab/${parts[1]}/`;
  if (parts[0] === "systems" && parts.length >= 2 && parts[1] !== "index.html") return `/systems/${parts[1]}/`;
  if (parts[0] === "writing" && parts.length >= 2 && parts[1] !== "index.html") return `/writing/${parts[1]}/`;
  if (parts[0] === "work") return "/work/";
  if (parts[0] === "about") return "/about/";
  return null;
}

function visualPath(filePath) {
  if (GLOBAL_VISUAL_PATHS.includes(filePath)) return true;
  if (filePath.startsWith("static/vendor/atlas-interface/")) return true;
  if (filePath.startsWith("lab/shared/")) return true;
  if (filePath.startsWith("static/css/") || filePath.startsWith("static/js/")) {
    return VISUAL_EXTENSIONS.has(path.extname(filePath));
  }
  return VISUAL_EXTENSIONS.has(path.extname(filePath));
}

export function classifyChangedFiles({ changedFiles, routes }) {
  const allRoutes = unique(routes);
  const routeSet = new Set(allRoutes);
  const changedRoutes = new Set();
  let globalVisualChange = false;
  let visualChange = false;
  let evidenceContractChange = false;

  for (const filePath of changedFiles.map((value) => value.trim()).filter(Boolean)) {
    if (EVIDENCE_CONTRACT_PATHS.includes(filePath) || filePath.startsWith("scripts/interface-evidence/")) {
      evidenceContractChange = true;
    }
    if (!visualPath(filePath)) continue;
    visualChange = true;

    if (GLOBAL_VISUAL_PATHS.includes(filePath) || filePath.startsWith("static/vendor/atlas-interface/")) {
      globalVisualChange = true;
      continue;
    }
    if (filePath.startsWith("lab/shared/")) {
      for (const route of allRoutes.filter((candidate) => candidate === "/lab/" || candidate.startsWith("/lab/"))) {
        changedRoutes.add(route);
      }
      continue;
    }
    if (filePath.startsWith("static/css/article-") || filePath.startsWith("static/css/editorial-")) {
      for (const route of allRoutes.filter((candidate) => candidate.startsWith("/writing/"))) changedRoutes.add(route);
      continue;
    }
    if (filePath.includes("card-signatures")) {
      for (const route of allRoutes.filter((candidate) => candidate === "/lab/" || candidate === "/systems/")) changedRoutes.add(route);
      continue;
    }

    const exact = routeFromIndexPath(filePath);
    if (exact && routeSet.has(exact)) {
      changedRoutes.add(exact);
      continue;
    }
    const prefix = routePrefixFromPath(filePath);
    if (prefix && routeSet.has(prefix)) {
      changedRoutes.add(prefix);
      continue;
    }

    globalVisualChange = true;
  }

  if (globalVisualChange) {
    for (const route of allRoutes) changedRoutes.add(route);
  }

  return Object.freeze({
    visual_change: visualChange,
    evidence_contract_change: evidenceContractChange,
    evidence_required: visualChange || evidenceContractChange,
    changed_routes: [...changedRoutes],
  });
}