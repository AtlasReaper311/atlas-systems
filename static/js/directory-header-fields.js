"use strict";

import {
  defineAtlasFieldConsumer,
  mountAtlasFieldConsumer,
} from "./atlas-field-consumer.js?v=20260728-directory-header-compositions-v2";

const HEADER_STYLESHEETS = Object.freeze([
  "/static/css/atlas-field-consumer.css?v=20260728-directory-header-compositions-v2",
  "/static/css/directory-header-fields.css?v=20260728-directory-header-compositions-v2",
]);

export const DIRECTORY_HEADER_COMPOSITIONS = Object.freeze({
  systems: defineAtlasFieldConsumer({
    selector: ".page-intro",
    preset: "ambient",
    stateKey: "atlasDirectoryHeaderState",
    hostClasses: ["atlas-page-header", "atlas-page-header--systems", "atlas-header-composition--topology-current"],
    errorLabel: "Systems topology-current header",
    options: {
      seed: "atlas-systems-topology-current-v2",
      canvasClass: "directory-header-field-canvas",
      density: { min: 170, max: 480, reduced: 150, areaDivisor: 1550 },
      domainBreaks: [0.5, 0.82],
      domainStyles: [
        "rgba(74, 222, 128, 0.07)",
        "rgba(56, 189, 248, 0.09)",
        "rgba(245, 166, 35, 0.035)",
      ],
      pointer: { enabled: false },
      light: { radiusMin: 80, radiusRatio: 0.12, smoothing: 0.01 },
    },
  }),
  work: defineAtlasFieldConsumer({
    selector: ".page-header",
    preset: "ambient",
    stateKey: "atlasDirectoryHeaderState",
    hostClasses: ["atlas-page-header", "atlas-page-header--work", "atlas-header-composition--build-fragments"],
    errorLabel: "Work build-fragments header",
    options: {
      seed: "atlas-work-build-fragments-v2",
      canvasClass: "directory-header-field-canvas",
      density: { min: 120, max: 340, reduced: 110, areaDivisor: 1900 },
      domainBreaks: [0.28, 0.7],
      domainStyles: [
        "rgba(245, 166, 35, 0.085)",
        "rgba(232, 232, 224, 0.035)",
        "rgba(56, 189, 248, 0.04)",
      ],
      pointer: { enabled: false },
      light: { radiusMin: 65, radiusRatio: 0.1, smoothing: 0.008 },
    },
  }),
  writing: defineAtlasFieldConsumer({
    selector: ".page-header",
    preset: "ambient",
    stateKey: "atlasDirectoryHeaderState",
    hostClasses: ["atlas-page-header", "atlas-page-header--writing", "atlas-header-composition--editorial-drift"],
    errorLabel: "Writing editorial-drift header",
    options: {
      seed: "atlas-writing-editorial-drift-v2",
      canvasClass: "directory-header-field-canvas",
      density: { min: 80, max: 220, reduced: 72, areaDivisor: 2600 },
      domainBreaks: [0.58, 0.9],
      domainStyles: [
        "rgba(232, 232, 224, 0.035)",
        "rgba(245, 166, 35, 0.038)",
        "rgba(170, 169, 160, 0.02)",
      ],
      pointer: { enabled: false },
      light: { radiusMin: 48, radiusRatio: 0.075, smoothing: 0.006 },
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
