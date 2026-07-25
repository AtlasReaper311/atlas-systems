/**
 * estate-search/render.js
 *
 * One result-item component used by both the homepage widget and the
 * nav overlay, plus the bridge that hands a result to Ramone.
 *
 * Two tools, two jobs, one hinge. Search is fast literal lookup for
 * someone who already knows roughly what they want; Ramone is cited
 * synthesis for someone who wants it explained. Every rendered result
 * therefore carries a small "ask ramone about this" action: search for
 * the fact, one click to have it explained in context. The bridge only
 * pre-fills Ramone's input, it never submits, so the person can edit
 * the question first.
 *
 * Estate rule honoured throughout: response data reaches the page via
 * textContent and createElement only, never innerHTML.
 */

"use strict";

import "../estate-shell.js";

const GITHUB_OWNER = "AtlasReaper311";
const RAMONE_INPUT_ID = "ramone-mini-input";
const RAMONE_CARD_ID = "ramone-card";
const RAMONE_PAGE_PATH = "/lab/";
const ASK_PARAM = "ask";
const RAMONE_MAX_CHARS = 2000; /* mirrors the Lab composer's own cap */
const GENERIC_STEMS = { readme: true, index: true };

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Compact a retrieved chunk for display: strip tags, unescape the
 * common entities, collapse whitespace, cut on a word boundary. The
 * corpus stores full chunks (case-study HTML included), which are far
 * too long for a result row.
 */
export function displayExcerpt(text, limit) {
  const max = limit || 220;
  let cleaned = String(text || "").replace(/<[^>]+>/g, " ");
  cleaned = cleaned
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const cut = cleaned.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "\u2026";
}

/** "atlas-corpus/app/main.py" style provenance label. */
export function hitLabel(hit) {
  return hit.repo + "/" + hit.path;
}

/**
 * The primary link for a hit:
 *   site HTML       the live page itself (only site HTML is ingested)
 *   local docs      no public URL; these are the gitignored brand and
 *                   context documents, so the row renders unlinked
 *   everything else the file on GitHub, same URL builder the shipped
 *                   widget uses
 */
export function hitPrimaryHref(hit) {
  if (hit.repo === "local") return null;
  if (/\.html?$/i.test(hit.path)) {
    const sitePath = hit.path.replace(/index\.html?$/i, "");
    return "/" + sitePath.replace(/^\/+/, "");
  }
  return "https://github.com/" + GITHUB_OWNER + "/" +
    encodeURIComponent(hit.repo) + "/blob/main/" +
    hit.path.split("/").map(encodeURIComponent).join("/");
}

/**
 * Pull a human topic out of a hit's path: filename stem, digits and
 * separators stripped, hyphens and underscores spaced. Generic stems
 * (README, index) fall back to the parent directory, then the repo,
 * because "explain how readme works" is a question nobody asks.
 */
export function topicFromHit(hit) {
  const segments = String(hit.path || "").split("/").filter(Boolean);
  let candidate = segments.length ? segments[segments.length - 1] : "";
  candidate = candidate.replace(/\.[a-z0-9]+$/i, "");
  if (GENERIC_STEMS[candidate.toLowerCase()] && segments.length > 1) {
    candidate = segments[segments.length - 2];
  }
  candidate = candidate.replace(/^\d+\s*[-_\s]*/, "").replace(/[-_]+/g, " ").trim();
  if (!candidate || GENERIC_STEMS[candidate.toLowerCase()]) return "";
  return candidate;
}

/**
 * Build the pre-filled Ramone question for a hit, e.g. a caching doc in
 * specular-edge becomes "explain how caching works in specular-edge".
 * Case studies and articles ask for the reasoning, because that is what
 * those documents are made of. Always editable, never auto-sent.
 */
export function buildAskRamoneQuestion(hit) {
  const topic = topicFromHit(hit);
  if (!topic) {
    return "explain what " + hit.repo + " is and what it does";
  }
  if (hit.docType === "case-study" || hit.docType === "article") {
    return "explain " + topic + " and the decisions behind it";
  }
  return "explain how " + topic + " works in " + hit.repo;
}

/* ------------------------------------------------------------------ */
/* Ramone bridge                                                       */
/* ------------------------------------------------------------------ */

/**
 * Pre-fill the Lab composer and hand it focus. Dispatching a real input
 * event lets lab-card.js run its own char count, autosize, and send
 * button wiring; this module never reimplements the composer.
 */
function prefillRamoneInput(input, question) {
  input.value = question.slice(0, RAMONE_MAX_CHARS);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();
}

/**
 * Take one hit to Ramone. If the Lab composer is on the current page,
 * scroll to it and pre-fill in place; otherwise navigate to the Lab
 * page with the question carried in the ask query parameter, which
 * installRamonePrefillListener picks up on arrival. Never submits.
 */
export function askRamone(hit) {
  const question = buildAskRamoneQuestion(hit);
  const input = document.getElementById(RAMONE_INPUT_ID);
  if (input) {
    const card = document.getElementById(RAMONE_CARD_ID);
    if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
    prefillRamoneInput(input, question);
    return;
  }
  window.location.href = RAMONE_PAGE_PATH +
    "?" + ASK_PARAM + "=" + encodeURIComponent(question) +
    "#" + RAMONE_CARD_ID;
}

/**
 * Install once on any page that hosts the Ramone composer (the Lab
 * page). Reads ?ask= from the URL, pre-fills the composer, scrolls to
 * the card, and then strips the parameter from history so a refresh
 * does not re-prefill. Harmless everywhere else.
 */
export function installRamonePrefillListener() {
  function run() {
    const input = document.getElementById(RAMONE_INPUT_ID);
    if (!input) return;
    const params = new URLSearchParams(window.location.search);
    const question = (params.get(ASK_PARAM) || "").trim();
    if (!question) return;
    const card = document.getElementById(RAMONE_CARD_ID);
    if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
    prefillRamoneInput(input, question);
    params.delete(ASK_PARAM);
    const rest = params.toString();
    const cleaned = window.location.pathname +
      (rest ? "?" + rest : "") + window.location.hash;
    window.history.replaceState(null, "", cleaned);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}

/* ------------------------------------------------------------------ */
/* Result item                                                         */
/* ------------------------------------------------------------------ */

/**
 * Render one hit as an <li class="es-hit"> shared by every placement:
 *
 *   repo/path   [doc_type]   0.87
 *   excerpt text, compacted and clamped
 *   ask ramone about this
 *
 * options:
 *   onAskRamone(hit)  override the bridge action (defaults to askRamone)
 *   idPrefix          set to receive stable ids for aria-activedescendant
 *   index             item index, combined with idPrefix
 */
export function renderHitItem(hit, options) {
  const opts = options || {};
  const item = document.createElement("li");
  item.className = "es-hit";
  if (opts.idPrefix !== undefined && opts.index !== undefined) {
    item.id = opts.idPrefix + "-" + opts.index;
  }

  const href = hitPrimaryHref(hit);
  const main = document.createElement(href ? "a" : "div");
  main.className = "es-hit-main";
  if (href) {
    main.href = href;
    if (href.indexOf("https://github.com/") === 0) {
      main.target = "_blank";
      main.rel = "noopener noreferrer";
    }
  }

  const label = document.createElement("span");
  label.className = "es-hit-label";
  label.textContent = hitLabel(hit);
  main.appendChild(label);

  if (hit.docType) {
    const badge = document.createElement("span");
    badge.className = "es-hit-badge";
    badge.textContent = hit.docType;
    main.appendChild(badge);
  }

  if (!href) {
    const priv = document.createElement("span");
    priv.className = "es-hit-badge es-hit-badge-private";
    priv.textContent = "private doc";
    main.appendChild(priv);
  }

  const score = document.createElement("span");
  score.className = "es-hit-score";
  score.textContent = hit.score.toFixed(2);
  main.appendChild(score);

  item.appendChild(main);

  const excerpt = document.createElement("p");
  excerpt.className = "es-hit-excerpt";
  excerpt.textContent = displayExcerpt(hit.excerpt);
  item.appendChild(excerpt);

  const actions = document.createElement("div");
  actions.className = "es-hit-actions";
  const ask = document.createElement("button");
  ask.type = "button";
  ask.className = "es-hit-ask";
  ask.textContent = "ask ramone about this";
  ask.setAttribute("aria-label", "ask Ramone about " + hitLabel(hit));
  ask.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    (opts.onAskRamone || askRamone)(hit);
  });
  actions.appendChild(ask);
  item.appendChild(actions);

  return item;
}

/** Convenience: render a whole hits array into a document fragment. */
export function renderHitList(hits, options) {
  const fragment = document.createDocumentFragment();
  hits.forEach(function (hit, index) {
    fragment.appendChild(renderHitItem(hit, Object.assign({}, options, { index: index })));
  });
  return fragment;
}
