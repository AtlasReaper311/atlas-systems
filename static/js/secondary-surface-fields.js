"use strict";

import { mountAtlasFieldConsumer } from "./atlas-field-consumer.js?v=20260728-consumer-contract-v1";
import { compositionForRoute } from "./atlas-field-composition-registry.js?v=20260728-evidence-surfaces-v1";

const STYLESHEET = "/static/css/secondary-surface-fields.css?v=20260807-hero-contrast";

function ensureStylesheet() {
  // Match on pathname so the blocking <head> link counts, whatever query it
  // carries. This stylesheet positions the composition canvas; if it arrives
  // after the canvas mounts, the surface lays out in flow and swallows the
  // viewport until it lands.
  const wanted = new URL(STYLESHEET, window.location.origin);
  const present = [...document.head.querySelectorAll('link[rel="stylesheet"][href]')]
    .some((link) => new URL(link.href, window.location.origin).pathname === wanted.pathname);
  if (present) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLESHEET;
  document.head.appendChild(link);
}

export function mountSecondarySurfaceField(root = document, pathname = window.location.pathname) {
  const resolved = compositionForRoute(pathname);
  if (!resolved) return null;
  ensureStylesheet();
  const documentNode = root.ownerDocument ?? root;
  if (documentNode.body) documentNode.body.dataset.atlasComposition = resolved.name;
  return mountAtlasFieldConsumer(resolved.definition, root);
}

function start() {
  mountSecondarySurfaceField();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
