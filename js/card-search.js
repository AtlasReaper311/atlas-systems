/**
 * card-search.js
 * Client-side search for the Work and Writing pages. One module, both
 * pages; it detects which card type the page has and indexes accordingly.
 *
 * Composition rule: the Work page's tag filter owns the .hidden class and
 * is untouched. Search owns a second class, .search-hidden. A card is
 * visible only when it carries neither, so the two filters AND together
 * with zero coordination code and zero risk of one wiping the other's
 * state on click.
 *
 * The index is built once at load from each card's real text (title, tags,
 * summary, W/P number), lowercased and cached on the element. Filtering on
 * every keystroke is then a substring test across ~a dozen strings, which
 * needs no debounce to stay instant; the 120ms debounce that is here
 * exists to keep the result-count line from flickering mid-word.
 */
(function () {
  "use strict";

  var input = document.getElementById("card-search-input");
  if (!input) return;

  var countEl = document.getElementById("card-search-count");
  var emptyEl = document.getElementById("card-search-empty");

  /* Page detection: same module serves both card vocabularies. */
  var CONFIGS = [
    { card: ".project-entry", parts: [".project-title", ".project-desc", ".spec-value", ".tech-pill", ".project-index"], attr: "data-tags" },
    { card: ".article-entry", parts: [".article-title", ".article-summary", ".article-subtitle", ".tag", ".article-number", ".section-pill"], attr: null }
  ];

  var config = null;
  var cards = [];
  for (var c = 0; c < CONFIGS.length; c++) {
    var found = document.querySelectorAll(CONFIGS[c].card);
    if (found.length) { config = CONFIGS[c]; cards = Array.prototype.slice.call(found); break; }
  }
  if (!config) return;

  cards.forEach(function (card) {
    var bits = [];
    config.parts.forEach(function (sel) {
      card.querySelectorAll(sel).forEach(function (el) { bits.push(el.textContent); });
    });
    if (config.attr && card.getAttribute(config.attr)) bits.push(card.getAttribute(config.attr));
    card._searchText = bits.join(" ").toLowerCase().replace(/\s+/g, " ");
  });

  function apply(queryRaw) {
    var query = queryRaw.trim().toLowerCase();
    var shown = 0;

    cards.forEach(function (card) {
      var hit = !query || card._searchText.indexOf(query) !== -1;
      card.classList.toggle("search-hidden", !hit);
      if (hit) {
        shown++;
        /* Cards revealed by search may never have crossed the reveal
           observer's threshold; grant .visible directly so a match cannot
           be technically-unhidden yet sitting at opacity 0. */
        if (!card.classList.contains("visible")) card.classList.add("visible");
      }
    });

    if (countEl) {
      countEl.textContent = query ? shown + " / " + cards.length : "";
    }
    if (emptyEl) {
      emptyEl.hidden = !(query && shown === 0);
      if (query && shown === 0) {
        emptyEl.textContent = "no matches for \u201C" + query + "\u201D \u00B7 esc clears";
      }
    }
  }

  var debounce = null;
  input.addEventListener("input", function () {
    clearTimeout(debounce);
    debounce = setTimeout(function () { apply(input.value); }, 120);
  });

  input.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") {
      input.value = "";
      apply("");
      input.blur();
    }
  });

  /* The terminal habit: / focuses search from anywhere on the page, the
     same way it does on GitHub. Skipped while typing in any field. */
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "/") return;
    var t = ev.target;
    var typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    if (typing) return;
    ev.preventDefault();
    input.focus();
  });
})();
