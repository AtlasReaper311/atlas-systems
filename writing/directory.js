/**
 * Writing directory v2.
 *
 * Scheduler markup remains the source of order and publication state.
 * This module adds a featured duplicate, editorial group headings, and a
 * second composable visibility class for type filtering. Card search keeps
 * sole ownership of .search-hidden.
 */
(function () {
  "use strict";

  var contract = window.AtlasWritingDirectoryContract;
  if (!contract) {
    throw new Error("Writing directory content-type contract is unavailable");
  }

  var cards = Array.prototype.slice.call(document.querySelectorAll(".article-entry"));
  var filters = Array.prototype.slice.call(document.querySelectorAll("[data-writing-filter]"));
  var feature = document.querySelector(".writing-feature");
  var empty = document.getElementById("card-search-empty");
  if (!cards.length || !filters.length) return;

  function text(card, selector) {
    var node = card.querySelector(selector);
    return node ? node.textContent.trim() : "";
  }

  function isVisible(card) {
    return !card.classList.contains("search-hidden") && !card.classList.contains("filter-hidden");
  }

  function makeHeading(label, title, copy) {
    var wrapper = document.createElement("div");
    wrapper.className = "editorial-directory-heading writing-group-heading";
    wrapper.dataset.directoryGenerated = "true";
    wrapper.innerHTML = '<div class="section-label"></div><h2></h2><p></p>';
    wrapper.querySelector(".section-label").textContent = label;
    wrapper.querySelector("h2").textContent = title;
    wrapper.querySelector("p").textContent = copy;
    return wrapper;
  }

  function installGroupHeadings() {
    document.querySelectorAll("[data-directory-generated]").forEach(function (node) {
      node.remove();
    });

    var firstSeriesCard = cards.find(function (card) {
      return card.hasAttribute("data-series");
    });
    var seriesAnchor = document.querySelector(".series-banner") || firstSeriesCard;
    var firstPublished = cards.find(function (card) {
      return !card.classList.contains("coming-soon");
    });

    if (seriesAnchor) {
      seriesAnchor.parentNode.insertBefore(
        makeHeading(
          "Series",
          "One system, followed across several decisions.",
          "Parts remain grouped while publication state and order stay scheduler-owned."
        ),
        seriesAnchor
      );
    }
    if (firstPublished) {
      firstPublished.parentNode.insertBefore(
        makeHeading(
          "All writing",
          "Case studies and technical notes.",
          "Published and scheduled entries remain traceable through their permanent W-numbers."
        ),
        firstPublished
      );
    }
  }

  function updateFeature() {
    if (!feature) return;
    var published = cards.find(function (card) {
      return !card.classList.contains("coming-soon");
    });
    if (!published) {
      feature.hidden = true;
      return;
    }

    var publishedType = contract.contentType(published);
    feature.hidden = false;
    feature.querySelector(".writing-feature-number").textContent = text(published, ".article-number");
    feature.querySelector(".writing-feature-date").textContent = text(published, ".article-date");
    feature.querySelector(".writing-feature-kicker").textContent =
      text(published, ".tag.highlight") + " / " + (publishedType === "series" ? "Series" : "Case study");
    feature.querySelector("h2").textContent = text(published, ".article-title");
    feature.querySelector(".writing-feature-summary").textContent = text(published, ".article-summary");
    feature.querySelector(".writing-feature-link").href = published.getAttribute("href");
  }

  function updateSupportingUi() {
    var visible = cards.filter(isVisible);
    var query = document.getElementById("card-search-input");
    var count = document.getElementById("card-search-count");
    var hasActiveSearch = Boolean(query && query.value.trim());
    var activeFilter = filters.find(function (button) {
      return button.classList.contains("is-active");
    });
    var hasActiveType = activeFilter && activeFilter.dataset.writingFilter !== "all";

    if (count) {
      count.textContent = hasActiveSearch || hasActiveType
        ? visible.length + " / " + cards.length
        : "";
    }

    if (empty) {
      empty.hidden = visible.length !== 0 || (!hasActiveSearch && !hasActiveType);
      if (!empty.hidden) empty.textContent = "no writing matches the current search and type filters";
    }

    document.querySelectorAll(".writing-group-heading").forEach(function (heading) {
      var next = heading.nextElementSibling;
      var isSeries = next && next.classList.contains("series-banner");
      heading.hidden = isSeries
        ? !cards.some(function (card) { return card.hasAttribute("data-series") && isVisible(card); })
        : !cards.some(function (card) {
          return contract.contentType(card) === "case-study" && isVisible(card);
        });
    });
  }

  function applyFilter(value) {
    cards.forEach(function (card) {
      var visible = contract.matchesFilter(card, value);
      card.classList.toggle("filter-hidden", !visible);
      if (visible) card.classList.add("visible");
    });
    updateSupportingUi();
  }

  filters.forEach(function (button) {
    button.addEventListener("click", function () {
      filters.forEach(function (candidate) {
        var active = candidate === button;
        candidate.classList.toggle("is-active", active);
        candidate.setAttribute("aria-pressed", String(active));
      });
      applyFilter(button.dataset.writingFilter);
    });
  });

  document.addEventListener("atlas:card-search", updateSupportingUi);
  cards.forEach(function (card) {
    card.dataset.contentType = contract.contentType(card);
  });
  updateFeature();
  installGroupHeadings();
  applyFilter("all");
})();
