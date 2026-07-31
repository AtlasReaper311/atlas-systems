(function (root, factory) {
  "use strict";
  root.AtlasWritingDirectoryContract = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var FILTERS = Object.freeze(["all", "case-study", "series", "upcoming"]);

  function contentType(card) {
    if (!card || !card.classList || typeof card.hasAttribute !== "function") {
      throw new TypeError("Writing content type requires an article card");
    }
    if (card.classList.contains("coming-soon")) return "upcoming";
    if (card.hasAttribute("data-series")) return "series";
    return "case-study";
  }

  function matchesFilter(card, value) {
    if (FILTERS.indexOf(value) === -1) {
      throw new RangeError("Unknown Writing filter: " + value);
    }
    return value === "all" || contentType(card) === value;
  }

  return Object.freeze({
    filters: FILTERS,
    contentType: contentType,
    matchesFilter: matchesFilter
  });
});
