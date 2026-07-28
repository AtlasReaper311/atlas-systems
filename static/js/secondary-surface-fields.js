"use strict";

import { mountAtlasFieldConsumer } from "./atlas-field-consumer.js?v=20260728-consumer-contract-v1";
import { compositionForRoute } from "./atlas-field-composition-registry.js?v=20260728-composition-batch-two-v1";

const STYLESHEET = "/static/css/secondary-surface-fields.css?v=20260728-composition-batch-two-v1";

function ensureStylesheet() {
  if (document.head.querySelector(`link[href="${STYLESHEET}"]`)) return;
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
