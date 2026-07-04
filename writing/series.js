/**
 * series.js
 * Groups article cards on the Writing page into visible series: a rail
 * down the left edge, a node per part, a "part n / N" chip in the meta
 * column, and a banner above the first card of the group.
 *
 * Data source, in priority order:
 *   1. data-series / data-series-part / data-series-total /
 *      data-series-title / data-series-state attributes on the card.
 *      This is the real contract; build_article.py emits these from the
 *      frontmatter keys documented in series-frontmatter-convention.md.
 *   2. The FALLBACK map below, keyed by W-number. It exists so the
 *      treatment works today, before the generator learns the frontmatter
 *      keys. Delete an entry from it the day that article's card ships
 *      with real attributes; delete the whole map when all do.
 *
 * Scheduler safety: publish_scheduled.py inserts published cards at its
 * marker and rotates coming-soon cards. This script never wraps cards in
 * containers and never moves them; it only classifies what it finds, in
 * document order, at load. Adjacency (which cards share a rail run) is
 * recomputed from the live DOM every page load, so the scheduler can
 * reorder, insert, and retire cards without this file caring.
 */
(function () {
  "use strict";

  /* Interim source of truth until the generator emits data-series
     attributes; see header. Keyed by the .article-number text. */
  var FALLBACK = {
    "W-05": { id: "pipeline-observability", part: 1 },
    "W-06": { id: "pipeline-observability", part: 2 },
    "W-07": { id: "pipeline-observability", part: 3 }
  };

  var SERIES_META = {
    "pipeline-observability": {
      title: "Pipeline & Observability",
      total: 3,
      note: "3 parts · through september 2026"
    }
  };

  function resolve(card) {
    var id = card.getAttribute("data-series");
    if (id) {
      return {
        id: id,
        part: parseInt(card.getAttribute("data-series-part"), 10) || 0,
        total: parseInt(card.getAttribute("data-series-total"), 10) || 0,
        title: card.getAttribute("data-series-title") || (SERIES_META[id] && SERIES_META[id].title) || id,
        note: (SERIES_META[id] && SERIES_META[id].note) || ""
      };
    }
    var numEl = card.querySelector(".article-number");
    var num = numEl ? numEl.textContent.trim() : "";
    var fb = FALLBACK[num];
    if (!fb) return null;
    var meta = SERIES_META[fb.id] || {};
    return { id: fb.id, part: fb.part, total: meta.total || 0, title: meta.title || fb.id, note: meta.note || "" };
  }

  function apply() {
    /* Idempotent: strip anything a previous pass injected, then reapply.
       Costs nothing at this scale and makes refresh() safe to expose. */
    document.querySelectorAll(".series-injected").forEach(function (el) { el.remove(); });
    document.querySelectorAll(".article-entry").forEach(function (c) {
      c.classList.remove("in-series", "series-first", "series-last");
    });

    var cards = Array.prototype.slice.call(document.querySelectorAll(".article-entry"));
    var bannerDone = {};
    var prevInfo = null;
    var prevCard = null;

    cards.forEach(function (card) {
      var info = resolve(card);
      if (!info) {
        /* A non-series card ends any open run; close it before resetting,
           otherwise the last part of a series followed by ordinary cards
           never receives its series-last cap (caught by the smoke test). */
        if (prevCard && prevInfo) prevCard.classList.add("series-last");
        prevInfo = null; prevCard = null; return;
      }

      card.classList.add("in-series");

      /* Run boundaries: a run starts when the previous sibling card is not
         the same series. Cards of one series are expected to be adjacent
         (the page is reverse-chronological and series publish in
         sequence); if something foreign ever lands between them, each
         side becomes its own run and the rail breaks cleanly instead of
         drawing a line through an unrelated card. */
      var continues = prevInfo && prevInfo.id === info.id && prevCard && prevCard.nextElementSibling === card;
      if (!continues) {
        card.classList.add("series-first");
        if (prevCard && prevInfo) prevCard.classList.add("series-last");

        if (!bannerDone[info.id]) {
          bannerDone[info.id] = true;
          var banner = document.createElement("div");
          banner.className = "series-banner series-injected";
          banner.innerHTML =
            '<span class="series-banner-title"></span>' +
            '<span class="series-banner-note"></span>';
          banner.querySelector(".series-banner-title").textContent = info.title;
          banner.querySelector(".series-banner-note").textContent = info.note;
          card.parentNode.insertBefore(banner, card);
        }
      }

      var metaCol = card.querySelector(".article-meta");
      var numEl = card.querySelector(".article-number");
      if (metaCol && info.part && info.total) {
        var chip = document.createElement("span");
        chip.className = "series-chip series-injected";
        chip.textContent = "part " + info.part + " / " + info.total;
        if (numEl && numEl.nextSibling) metaCol.insertBefore(chip, numEl.nextSibling);
        else metaCol.insertBefore(chip, metaCol.firstChild);
      }

      prevInfo = info;
      prevCard = card;
    });

    if (prevCard && prevInfo) prevCard.classList.add("series-last");
  }

  apply();
  window.AtlasSeries = { refresh: apply };
})();
