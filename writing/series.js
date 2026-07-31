/**
 * Series Navigation v2.
 *
 * Reads scheduler-owned data-series attributes from article cards, derives the
 * live/next/scheduled state from the DOM, and renders a compact navigable
 * series summary without moving or wrapping scheduler-owned cards.
 */
(function () {
  "use strict";

  var observers = [];

  function text(card, selector) {
    var node = card.querySelector(selector);
    return node ? node.textContent.trim() : "";
  }

  function resolve(card) {
    var id = card.getAttribute("data-series");
    if (!id) return null;

    var part = Number(card.getAttribute("data-series-part"));
    var total = Number(card.getAttribute("data-series-total"));
    var title = card.getAttribute("data-series-title") || "";
    var note = card.getAttribute("data-series-note") || "";
    var publishDate = card.getAttribute("data-series-publish-date") || "";

    if (
      !Number.isInteger(part) ||
      !Number.isInteger(total) ||
      part < 1 ||
      total < 2 ||
      part > total ||
      !title ||
      !/^\d{4}-\d{2}-\d{2}$/.test(publishDate)
    ) {
      throw new Error(
        "Invalid scheduler-owned Writing series metadata for " +
        (text(card, ".article-number") || card.getAttribute("href") || "article card")
      );
    }

    return {
      id: id,
      part: part,
      total: total,
      title: title,
      note: note,
      publishDate: publishDate
    };
  }

  function formatDate(value) {
    if (!value) return "Scheduled";
    var parts = value.split("-");
    if (parts.length !== 3) return "Scheduled";
    var parsed = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    return new Intl.DateTimeFormat("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }).format(parsed);
  }

  function make(tag, className, value) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function addPartChip(card, info) {
    var meta = card.querySelector(".article-meta");
    var number = card.querySelector(".article-number");
    if (!meta || !number || !info.part || !info.total) return;

    var chip = make("span", "series-chip series-injected", "Part " + info.part + " of " + info.total);
    if (number.nextSibling) meta.insertBefore(chip, number.nextSibling);
    else meta.appendChild(chip);
  }

  function setCardState(entry, nextEntry) {
    var card = entry.card;
    var upcoming = card.classList.contains("coming-soon");
    card.classList.remove(
      "series-upcoming",
      "series-next",
      "series-scheduled",
      "series-live",
      "series-compact"
    );

    if (!upcoming) {
      card.classList.add("series-live");
      return;
    }

    card.classList.add("series-compact");
    if (entry === nextEntry) card.classList.add("series-next");
    else card.classList.add("series-scheduled");

    var date = card.querySelector(".article-date");
    if (date && entry.info.publishDate) {
      var label = formatDate(entry.info.publishDate).toUpperCase();
      date.textContent = entry === nextEntry ? "NEXT CHAPTER // " + label : label;
    }

    var cta = card.querySelector(".article-cta");
    if (cta && cta.firstChild) {
      cta.firstChild.nodeValue = entry === nextEntry ? "Next chapter " : "Scheduled ";
    }
  }

  function bannerPart(entry, nextEntry) {
    var published = !entry.card.classList.contains("coming-soon");
    var href = entry.card.getAttribute("href");
    var control = published && href && href !== "#" ? document.createElement("a") : document.createElement("span");
    control.className = "series-banner-part";
    if (published && href && href !== "#") control.href = href;
    else control.setAttribute("aria-disabled", "true");

    control.appendChild(make("span", "series-banner-part-number", "Part " + entry.info.part));
    control.appendChild(make("span", "series-banner-part-title", text(entry.card, ".article-title")));
    control.appendChild(make(
      "span",
      "series-banner-part-state",
      published ? "Live" : (entry === nextEntry ? "Next" : formatDate(entry.info.publishDate))
    ));
    return control;
  }

  function renderBanner(group, nextEntry) {
    var firstInDom = group.entries.slice().sort(function (a, b) {
      return a.domIndex - b.domIndex;
    })[0];
    var ordered = group.entries.slice().sort(function (a, b) {
      return a.info.part - b.info.part;
    });
    var publishedCount = ordered.filter(function (entry) {
      return !entry.card.classList.contains("coming-soon");
    }).length;

    var banner = make("section", "series-banner series-injected");
    var anchorId = "series-" + group.id;
    var staticAnchor = document.getElementById(anchorId);
    if (staticAnchor) staticAnchor.removeAttribute("id");
    banner.id = anchorId;
    banner.style.setProperty("--series-total", String(group.total));
    banner.setAttribute("aria-label", group.title + " series navigation");

    var header = make("div", "series-banner-header");
    var identity = make("div", "series-banner-identity");
    identity.appendChild(make("span", "series-banner-title", group.title));
    var nextScheduled = ordered.find(function (entry) {
      return entry.card.classList.contains("coming-soon");
    });
    var note = nextScheduled
      ? group.total + " parts · " + formatDate(nextScheduled.info.publishDate)
      : group.note;
    identity.appendChild(make("span", "series-banner-note", note));
    header.appendChild(identity);
    header.appendChild(make(
      "span",
      "series-banner-progress",
      publishedCount + " of " + group.total + " published"
    ));
    banner.appendChild(header);

    var parts = make("div", "series-banner-parts");
    ordered.forEach(function (entry) {
      parts.appendChild(bannerPart(entry, nextEntry));
    });
    banner.appendChild(parts);

    firstInDom.card.parentNode.insertBefore(banner, firstInDom.card);
    group.banner = banner;
  }

  function updateBannerVisibility(group) {
    if (!group.banner) return;
    var allHidden = group.entries.every(function (entry) {
      return entry.card.classList.contains("search-hidden") ||
        entry.card.classList.contains("filter-hidden") ||
        entry.card.hidden;
    });
    group.banner.hidden = allHidden;
  }

  function disconnectObservers() {
    observers.forEach(function (observer) {
      observer.disconnect();
    });
    observers = [];
  }

  function apply() {
    disconnectObservers();
    document.querySelectorAll(".series-injected").forEach(function (node) { node.remove(); });
    document.querySelectorAll(".article-entry").forEach(function (card) {
      card.classList.remove(
        "in-series",
        "series-first",
        "series-last",
        "series-next",
        "series-scheduled",
        "series-live",
        "series-compact",
        "series-upcoming"
      );
    });

    var cards = Array.prototype.slice.call(document.querySelectorAll(".article-entry"));
    var groups = {};
    cards.forEach(function (card, domIndex) {
      var info = resolve(card);
      if (!info) return;
      if (!groups[info.id]) {
        groups[info.id] = {
          id: info.id,
          title: info.title,
          note: info.note,
          total: info.total,
          entries: []
        };
      }
      if (groups[info.id].total !== info.total || groups[info.id].title !== info.title) {
        throw new Error("Inconsistent scheduler-owned Writing series metadata for " + info.id);
      }
      groups[info.id].entries.push({ card: card, info: info, domIndex: domIndex });
    });

    Object.keys(groups).forEach(function (id) {
      var group = groups[id];
      var orderedByPart = group.entries.slice().sort(function (a, b) {
        return a.info.part - b.info.part;
      });
      var parts = orderedByPart.map(function (entry) { return entry.info.part; });
      if (new Set(parts).size !== parts.length) {
        throw new Error("Duplicate Writing series part metadata for " + id);
      }
      var nextEntry = orderedByPart.find(function (entry) {
        return entry.card.classList.contains("coming-soon");
      }) || null;

      group.entries.forEach(function (entry) {
        entry.card.classList.add("in-series");
        setCardState(entry, nextEntry);
        addPartChip(entry.card, entry.info);
      });

      var byDom = group.entries.slice().sort(function (a, b) { return a.domIndex - b.domIndex; });
      byDom[0].card.classList.add("series-first");
      byDom[byDom.length - 1].card.classList.add("series-last");
      renderBanner(group, nextEntry);
      updateBannerVisibility(group);

      group.entries.forEach(function (entry) {
        var observer = new MutationObserver(function () {
          updateBannerVisibility(group);
        });
        observer.observe(entry.card, { attributes: true, attributeFilter: ["class"] });
        observers.push(observer);
      });
    });
  }

  apply();
  window.AtlasSeries = {
    refresh: apply,
    disconnect: disconnectObservers
  };
})();
