"use strict";

import {
  defineAtlasFieldConsumer,
  mountAtlasFieldConsumer,
} from "./atlas-field-consumer.js?v=20260728-directory-header-compositions-v1";

const HEADER_STYLESHEETS = Object.freeze([
  "/static/css/atlas-field-consumer.css?v=20260728-directory-header-compositions-v1",
  "/static/css/directory-header-fields.css?v=20260728-directory-header-compositions-v1",
]);

export const DIRECTORY_HEADER_COMPOSITIONS = Object.freeze({
  systems: defineAtlasFieldConsumer({
    selector: ".page-intro",
    preset: "ambient",
    stateKey: "atlasDirectoryHeaderState",
    hostClasses: ["atlas-page-header", "atlas-page-header--systems", "atlas-header-composition--topology-current"],
    errorLabel: "Systems topology-current header",
    options: {
      seed: "atlas-systems-topology-current-v1",
      canvasClass: "directory-header-field-canvas",
      density: { min: 260, max: 760, reduced: 220, areaDivisor: 1050 },
      domainBreaks: [0.46, 0.76],
      domainStyles: [
        "rgba(74, 222, 128, 0.105)",
        "rgba(56, 189, 248, 0.135)",
        "rgba(245, 166, 35, 0.055)",
      ],
      pointer: { enabled: false },
      light: { radiusMin: 190, radiusRatio: 0.32, smoothing: 0.016 },
    },
  }),
  work: defineAtlasFieldConsumer({
    selector: ".page-header",
    preset: "ambient",
    stateKey: "atlasDirectoryHeaderState",
    hostClasses: ["atlas-page-header", "atlas-page-header--work", "atlas-header-composition--build-fragments"],
    errorLabel: "Work build-fragments header",
    options: {
      seed: "atlas-work-build-fragments-v1",
      canvasClass: "directory-header-field-canvas",
      density: { min: 210, max: 620, reduced: 180, areaDivisor: 1180 },
      domainBreaks: [0.3, 0.72],
      domainStyles: [
        "rgba(245, 166, 35, 0.145)",
        "rgba(232, 232, 224, 0.07)",
        "rgba(56, 189, 248, 0.07)",
      ],
      pointer: { enabled: false },
      light: { radiusMin: 160, radiusRatio: 0.28, smoothing: 0.014 },
    },
  }),
  writing: defineAtlasFieldConsumer({
    selector: ".page-header",
    preset: "ambient",
    stateKey: "atlasDirectoryHeaderState",
    hostClasses: ["atlas-page-header", "atlas-page-header--writing", "atlas-header-composition--editorial-drift"],
    errorLabel: "Writing editorial-drift header",
    options: {
      seed: "atlas-writing-editorial-drift-v1",
      canvasClass: "directory-header-field-canvas",
      density: { min: 140, max: 430, reduced: 130, areaDivisor: 1450 },
      domainBreaks: [0.5, 0.82],
      domainStyles: [
        "rgba(232, 232, 224, 0.075)",
        "rgba(245, 166, 35, 0.075)",
        "rgba(170, 169, 160, 0.045)",
      ],
      pointer: { enabled: false },
      light: { radiusMin: 210, radiusRatio: 0.42, smoothing: 0.012 },
    },
  }),
});

function normalizePath(pathname) {
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

export function compositionForPath(pathname) {
  const path = normalizePath(pathname);
  if (path === "/systems/") return Object.freeze({ name: "systems", definition: DIRECTORY_HEADER_COMPOSITIONS.systems });
  if (path === "/work/") return Object.freeze({ name: "work", definition: DIRECTORY_HEADER_COMPOSITIONS.work });
  if (path === "/writing/") return Object.freeze({ name: "writing", definition: DIRECTORY_HEADER_COMPOSITIONS.writing });
  return null;
}

function ensureStylesheet(href) {
  if (document.head.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

export function mountDirectoryHeaderField(root = document, pathname = window.location.pathname) {
  const composition = compositionForPath(pathname);
  if (!composition) return null;
  HEADER_STYLESHEETS.forEach(ensureStylesheet);
  const documentNode = root.ownerDocument ?? root;
  if (documentNode.body) documentNode.body.dataset.atlasDirectoryHeader = composition.name;
  return mountAtlasFieldConsumer(composition.definition, root);
}

function startDirectoryHeaderField() {
  mountDirectoryHeaderField();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startDirectoryHeaderField, { once: true });
  } else {
    startDirectoryHeaderField();
  }
}
