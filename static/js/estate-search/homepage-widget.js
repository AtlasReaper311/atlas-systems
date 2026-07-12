/**
 * estate-search/homepage-widget.js
 *
 * The full-size search widget: same chassis as the shipped corpus
 * widget (.cs-w head, form, status line, result list) but sourced from
 * the shared client.js and render.js modules instead of a duplicated
 * inline script, and pointed at /search rather than /ask.
 *
 * That endpoint change is deliberate and is the point of this work:
 * search returns literal ranked hits fast; synthesis and explanation
 * belong to Ramone, one click away on every result. The widget never
 * tries to explain anything.
 *
 * Mounting:
 *   <div data-estate-search></div>            builds its own markup
 *   <section class="cs-w" data-estate-search> reuses existing markup
 *                                              (the Lab corpus panel)
 * or call initEstateSearchWidget(element, options) directly.
 *
 * options: topK (default 8; the overlay caps at 5, the widget is the
 * browsing surface so it shows more, still under the corpus max of 10).
 */

"use strict";

import { getSharedClient, RateLimitError } from "./client.js";
import { renderHitList } from "./render.js";

const DEFAULT_TOP_K = 8;

function buildMarkup(root) {
  root.classList.add("cs-w", "es-widget");
  if (!root.getAttribute("aria-label")) {
    root.setAttribute("aria-label", "Search the Atlas Systems corpus");
  }

  const head = document.createElement("p");
  head.className = "cs-w-head";
  const strong = document.createElement("strong");
  strong.textContent = "ATLAS CORPUS";
  head.appendChild(strong);
  head.appendChild(document.createTextNode(" // search everything the estate has written"));
  root.appendChild(head);

  const form = document.createElement("form");
  form.className = "cs-w-form";

  const prompt = document.createElement("span");
  prompt.className = "cs-w-prompt";
  prompt.setAttribute("aria-hidden", "true");
  prompt.textContent = ">";
  form.appendChild(prompt);

  const label = document.createElement("label");
  label.className = "es-visually-hidden";
  label.textContent = "Search query";

  const input = document.createElement("input");
  input.className = "cs-w-input";
  input.type = "search";
  input.name = "q";
  input.placeholder = "kv write limits";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.maxLength = 500;
  const inputId = "es-widget-q-" + Math.random().toString(36).slice(2, 8);
  input.id = inputId;
  label.htmlFor = inputId;
  form.appendChild(label);
  form.appendChild(input);

  const button = document.createElement("button");
  button.className = "cs-w-btn";
  button.type = "submit";
  button.textContent = "search";
  form.appendChild(button);
  root.appendChild(form);

  const status = document.createElement("p");
  status.className = "cs-w-status";
  status.setAttribute("aria-live", "polite");
  root.appendChild(status);

  const list = document.createElement("ol");
  list.className = "cs-w-results es-results";
  root.appendChild(list);

  return { form: form, input: input, button: button, status: status, list: list };
}

/**
 * Reuse markup the page already ships (the Lab panel keeps its ids and
 * classes untouched); build it only when the container is empty. Either
 * way the behaviour comes from exactly one place.
 */
function resolveParts(root) {
  const form = root.querySelector(".cs-w-form, form");
  const input = root.querySelector(".cs-w-input, input[type=search], input");
  const button = root.querySelector(".cs-w-btn, button[type=submit]");
  const status = root.querySelector(".cs-w-status");
  const list = root.querySelector(".cs-w-results, ol, ul");
  if (form && input && button && status && list) {
    list.classList.add("es-results");
    return { form: form, input: input, button: button, status: status, list: list };
  }
  return buildMarkup(root);
}

export function initEstateSearchWidget(root, options) {
  if (!root || root.dataset.esWidgetReady === "1") return null;
  root.dataset.esWidgetReady = "1";

  const opts = options || {};
  const topK = opts.topK || DEFAULT_TOP_K;
  const client = opts.client || getSharedClient();
  const parts = resolveParts(root);
  let inFlight = false;

  function clearResults() {
    while (parts.list.firstChild) parts.list.removeChild(parts.list.firstChild);
  }

  async function run(query) {
    if (inFlight) return;
    inFlight = true;
    parts.button.disabled = true;
    parts.status.textContent = "searching\u2026";
    clearResults();

    try {
      const result = await client.search(query, { topK: topK });
      if (!result.hits.length) {
        parts.status.textContent =
          "no matches; the corpus indexes the estate docs, not the whole web";
        return;
      }
      const noun = result.hits.length === 1 ? "hit" : "hits";
      const timing = result.fromCache
        ? "cached"
        : (result.tookMs !== null ? result.tookMs + "ms via " + result.endpoint : "via " + result.endpoint);
      parts.status.textContent = result.hits.length + " " + noun + " \u00b7 " + timing;
      parts.list.appendChild(renderHitList(result.hits));
    } catch (err) {
      if (err && err.name === "AbortError") return;
      parts.status.textContent = err instanceof RateLimitError
        ? err.message
        : "corpus unavailable: " + (err && err.message ? err.message : "unknown error");
    } finally {
      inFlight = false;
      parts.button.disabled = false;
    }
  }

  parts.form.addEventListener("submit", function (event) {
    event.preventDefault();
    const query = parts.input.value.trim();
    if (!query) return;
    run(query);
  });

  return { run: run, elements: parts };
}

/* Auto-init every [data-estate-search] container on the page. */
function autoInit() {
  document.querySelectorAll("[data-estate-search]").forEach(function (root) {
    initEstateSearchWidget(root);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", autoInit, { once: true });
} else {
  autoInit();
}
