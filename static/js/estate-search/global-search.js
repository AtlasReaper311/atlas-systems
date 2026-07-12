/**
 * estate-search/global-search.js
 *
 * The persistent nav search: a cmd+k overlay available on every page.
 * Quick-jump tool, not a browsing surface, so it caps at five results
 * (the homepage widget is where you browse). Same client.js, same
 * render.js item as the widget: exactly one retrieval code path and
 * one result component across the whole site.
 *
 * Open with Cmd+K (mac), Ctrl+K (windows/linux), "/" when focus is not
 * inside a text field, or any element carrying data-estate-search-open.
 * Esc closes. Clicking the scrim closes. Focus returns to whatever
 * opened it. This is an overlay, never a route change.
 *
 * Keyboard and screen reader contract:
 *   input        role=combobox, aria-activedescendant tracks selection
 *   result list  role=listbox, items role=option
 *   arrows       move the selection, wrapping
 *   enter        activates the selected result's primary link
 *   tab          walks the real links and the per-result ask-ramone
 *                action inside a focus trap, so every action is
 *                reachable without a pointer
 *   live region  announces result counts politely
 *
 * Loading this module also installs the Ramone prefill listener, so a
 * single script include per page wires both the overlay and the
 * search-to-Ramone bridge.
 */

"use strict";

import { getSharedClient, RateLimitError } from "./client.js";
import { renderHitList, installRamonePrefillListener } from "./render.js";

const OVERLAY_TOP_K = 5;
const DEBOUNCE_MS = 250;
const MIN_QUERY_CHARS = 2;
const OPTION_ID_PREFIX = "es-gs-option";

let overlay = null;
let state = null;

function isMacLike() {
  const platform = (navigator.userAgentData && navigator.userAgentData.platform) ||
    navigator.platform || "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

function isEditable(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/* ------------------------------------------------------------------ */
/* Overlay construction (lazy, once)                                   */
/* ------------------------------------------------------------------ */

function buildOverlay() {
  const root = document.createElement("div");
  root.className = "es-gs-root";
  root.hidden = true;

  const scrim = document.createElement("div");
  scrim.className = "es-gs-scrim";
  root.appendChild(scrim);

  const panel = document.createElement("div");
  panel.className = "es-gs-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Search the Atlas Systems estate");

  const head = document.createElement("p");
  head.className = "es-gs-head";
  const strong = document.createElement("strong");
  strong.textContent = "ATLAS ESTATE";
  head.appendChild(strong);
  head.appendChild(document.createTextNode(" // search everything the estate has written"));
  panel.appendChild(head);

  const inputRow = document.createElement("div");
  inputRow.className = "es-gs-input-row";

  const ps1 = document.createElement("span");
  ps1.className = "es-gs-ps1";
  ps1.setAttribute("aria-hidden", "true");
  ps1.textContent = ">";
  inputRow.appendChild(ps1);

  const input = document.createElement("input");
  input.className = "es-gs-input";
  input.type = "text";
  input.placeholder = "search the estate\u2026";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.maxLength = 500;
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", "es-gs-list");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-label", "Search query");
  inputRow.appendChild(input);
  panel.appendChild(inputRow);

  const status = document.createElement("p");
  status.className = "es-gs-status";
  status.setAttribute("aria-live", "polite");
  panel.appendChild(status);

  const list = document.createElement("ol");
  list.className = "es-gs-list es-results";
  list.id = "es-gs-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Search results");
  panel.appendChild(list);

  const foot = document.createElement("p");
  foot.className = "es-gs-foot";
  foot.setAttribute("aria-hidden", "true");
  [["\u2191\u2193", "navigate"], ["\u21b5", "open"], ["tab", "actions"], ["esc", "close"]]
    .forEach(function (pair) {
      const kbd = document.createElement("kbd");
      kbd.textContent = pair[0];
      foot.appendChild(kbd);
      foot.appendChild(document.createTextNode(" " + pair[1] + "  "));
    });
  panel.appendChild(foot);

  root.appendChild(panel);
  document.body.appendChild(root);

  return {
    root: root, scrim: scrim, panel: panel,
    input: input, status: status, list: list
  };
}

/* ------------------------------------------------------------------ */
/* State and behaviour                                                 */
/* ------------------------------------------------------------------ */

function ensureOverlay() {
  if (overlay) return overlay;
  overlay = buildOverlay();
  state = {
    open: false,
    previousFocus: null,
    activeIndex: -1,
    hits: [],
    debounceTimer: null,
    controller: null,
    seq: 0
  };
  wire();
  return overlay;
}

function setStatus(text) {
  overlay.status.textContent = text;
}

function clearList() {
  while (overlay.list.firstChild) overlay.list.removeChild(overlay.list.firstChild);
  overlay.input.setAttribute("aria-expanded", "false");
  overlay.input.removeAttribute("aria-activedescendant");
  state.activeIndex = -1;
  state.hits = [];
}

function setActive(index) {
  const items = overlay.list.children;
  if (!items.length) return;
  const bounded = ((index % items.length) + items.length) % items.length;
  if (state.activeIndex >= 0 && items[state.activeIndex]) {
    items[state.activeIndex].classList.remove("is-active");
    items[state.activeIndex].setAttribute("aria-selected", "false");
  }
  state.activeIndex = bounded;
  const item = items[bounded];
  item.classList.add("is-active");
  item.setAttribute("aria-selected", "true");
  overlay.input.setAttribute("aria-activedescendant", item.id);
  item.scrollIntoView({ block: "nearest" });
}

function activateSelection() {
  const items = overlay.list.children;
  if (state.activeIndex < 0 || !items[state.activeIndex]) return;
  const link = items[state.activeIndex].querySelector("a.es-hit-main");
  if (link) link.click();
}

function renderResults(result) {
  clearList();
  state.hits = result.hits;
  if (!result.hits.length) {
    setStatus("no matches; the corpus indexes the estate docs, not the whole web");
    return;
  }
  overlay.list.appendChild(renderHitList(result.hits, { idPrefix: OPTION_ID_PREFIX }));
  Array.prototype.forEach.call(overlay.list.children, function (item) {
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", "false");
  });
  overlay.input.setAttribute("aria-expanded", "true");
  const noun = result.hits.length === 1 ? "result" : "results";
  const timing = result.fromCache
    ? "cached"
    : (result.tookMs !== null ? result.tookMs + "ms via " + result.endpoint : "via " + result.endpoint);
  setStatus(result.hits.length + " " + noun + " \u00b7 " + timing);
  setActive(0);
}

async function runQuery(query) {
  if (state.controller) state.controller.abort();
  state.controller = new AbortController();
  const seq = ++state.seq;
  setStatus("searching\u2026");

  try {
    const result = await getSharedClient().search(query, {
      topK: OVERLAY_TOP_K,
      signal: state.controller.signal
    });
    if (seq !== state.seq) return; /* a newer keystroke superseded this one */
    renderResults(result);
  } catch (err) {
    if (seq !== state.seq) return;
    if (err && err.name === "AbortError") return;
    clearList();
    setStatus(err instanceof RateLimitError
      ? err.message
      : "corpus unavailable: " + (err && err.message ? err.message : "unknown error"));
  }
}

function onInput() {
  const query = overlay.input.value.trim();
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  if (query.length < MIN_QUERY_CHARS) {
    if (state.controller) state.controller.abort();
    state.seq++;
    clearList();
    setStatus(query.length ? "keep typing\u2026" : "type to search; results come from atlas-corpus");
    return;
  }
  state.debounceTimer = setTimeout(function () {
    runQuery(query);
  }, DEBOUNCE_MS);
}

/* Tab stays inside the overlay while it is open. Focusables are
   computed live because the result list changes with every query. */
function trapFocus(event) {
  const focusables = [overlay.input].concat(
    Array.prototype.slice.call(
      overlay.panel.querySelectorAll("a[href], button:not([disabled])")
    )
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function onPanelKeydown(event) {
  switch (event.key) {
    case "Escape":
      event.preventDefault();
      close();
      break;
    case "ArrowDown":
      event.preventDefault();
      setActive(state.activeIndex + 1);
      break;
    case "ArrowUp":
      event.preventDefault();
      setActive(state.activeIndex - 1);
      break;
    case "Home":
      if (document.activeElement === overlay.input && state.hits.length) {
        event.preventDefault();
        setActive(0);
      }
      break;
    case "End":
      if (document.activeElement === overlay.input && state.hits.length) {
        event.preventDefault();
        setActive(state.hits.length - 1);
      }
      break;
    case "Enter":
      if (document.activeElement === overlay.input) {
        event.preventDefault();
        activateSelection();
      }
      break;
    case "Tab":
      trapFocus(event);
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Open and close                                                      */
/* ------------------------------------------------------------------ */

export function open() {
  ensureOverlay();
  if (state.open) return;
  state.open = true;
  state.previousFocus = document.activeElement;
  overlay.root.hidden = false;
  /* two-frame reveal so the CSS transition actually runs */
  requestAnimationFrame(function () {
    overlay.root.setAttribute("data-open", "true");
  });
  document.body.classList.add("es-gs-lock");
  if (!overlay.input.value.trim()) {
    setStatus("type to search; results come from atlas-corpus");
  }
  overlay.input.focus();
  overlay.input.select();
}

export function close() {
  if (!overlay || !state.open) return;
  state.open = false;
  if (state.controller) state.controller.abort();
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  overlay.root.removeAttribute("data-open");
  overlay.root.hidden = true;
  document.body.classList.remove("es-gs-lock");
  if (state.previousFocus && typeof state.previousFocus.focus === "function") {
    state.previousFocus.focus();
  }
  state.previousFocus = null;
}

export function toggle() {
  ensureOverlay();
  if (state.open) close();
  else open();
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function wire() {
  overlay.input.addEventListener("input", onInput);
  overlay.panel.addEventListener("keydown", onPanelKeydown);
  overlay.scrim.addEventListener("mousedown", function (event) {
    if (event.target === overlay.scrim) close();
  });
  /* clicking a result navigates; make sure body scroll unlocks first
     for same-page anchors like /lab/ links */
  overlay.list.addEventListener("click", function (event) {
    if (event.target.closest("a.es-hit-main")) close();
  });
}

function bindGlobalShortcuts() {
  window.addEventListener("keydown", function (event) {
    const key = event.key ? event.key.toLowerCase() : "";
    if ((event.metaKey || event.ctrlKey) && !event.altKey && key === "k") {
      event.preventDefault();
      toggle();
      return;
    }
    if (key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey &&
        !isEditable(event.target) && (!overlay || !state || !state.open)) {
      event.preventDefault();
      open();
    }
  });
}

function bindTriggers() {
  document.querySelectorAll("[data-estate-search-open]").forEach(function (el) {
    if (el.dataset.esGsBound === "1") return;
    el.dataset.esGsBound = "1";
    el.addEventListener("click", function (event) {
      event.preventDefault();
      open();
    });
    const kbd = el.querySelector("[data-estate-search-kbd]");
    if (kbd) kbd.textContent = isMacLike() ? "\u2318K" : "ctrl k";
  });
}

function init() {
  bindGlobalShortcuts();
  bindTriggers();
  installRamonePrefillListener();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
