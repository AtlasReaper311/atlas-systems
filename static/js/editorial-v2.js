(function () {
  "use strict";

  if (window.__atlasEditorialV2) return;
  window.__atlasEditorialV2 = true;

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function sectionLabel(text) {
    return make("div", "editorial-section-label", text);
  }

  function addPageClass(name) {
    document.documentElement.classList.add("editorial-v2");
    document.body.classList.add("editorial-v2-" + name);
  }

  function stableAnchor(entry, fallback) {
    if (entry.id) return entry.id;
    var title = entry.querySelector(".project-title, .article-title");
    var value = title ? title.textContent : fallback;
    var slug = String(value || fallback || "entry")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    entry.id = slug || fallback;
    return entry.id;
  }

  function enhanceWork() {
    var projects = document.querySelector(".projects");
    var header = document.querySelector(".page-header");
    if (!projects || !header || projects.dataset.editorialReady === "true") return;
    projects.dataset.editorialReady = "true";
    addPageClass("work");

    var entries = Array.prototype.slice.call(projects.querySelectorAll(":scope > .project-entry"));
    entries.forEach(function (entry, index) {
      var anchor = stableAnchor(entry, "project-" + (index + 1));
      entry.setAttribute("data-project-position", String(index + 1));
      entry.style.setProperty("--project-order", String(index));
      entry.setAttribute("aria-labelledby", anchor + "-title");
      var title = entry.querySelector(".project-title");
      if (title) title.id = anchor + "-title";

      var achievements = entry.querySelector(".achievements");
      var firstOutcome = achievements && achievements.querySelector(".achievement");
      var info = entry.querySelector(".project-info");
      if (firstOutcome && info && !entry.querySelector(".project-result")) {
        var result = make("aside", "project-result");
        result.appendChild(make("span", "project-result-label", "Result"));
        result.appendChild(make("p", "project-result-copy", firstOutcome.textContent.trim()));
        var desc = entry.querySelector(".project-desc");
        if (desc && desc.nextSibling) info.insertBefore(result, desc.nextSibling);
        else info.appendChild(result);
      }

      var detailNodes = [
        entry.querySelector(".spec-grid"),
        entry.querySelector(".tech-stack"),
        achievements
      ].filter(Boolean);
      if (detailNodes.length && !entry.querySelector(".project-disclosure")) {
        var details = make("details", "project-disclosure");
        var summary = make("summary", "project-disclosure-summary");
        summary.appendChild(make("span", "project-disclosure-title", "Technical detail"));
        summary.appendChild(make("span", "project-disclosure-state", "expand"));
        details.appendChild(summary);
        var body = make("div", "project-disclosure-body");
        detailNodes.forEach(function (node) { body.appendChild(node); });
        details.appendChild(body);
        var links = entry.querySelector(".project-links");
        if (links) info.insertBefore(details, links);
        else info.appendChild(details);
        details.addEventListener("toggle", function () {
          var state = details.querySelector(".project-disclosure-state");
          if (state) state.textContent = details.open ? "collapse" : "expand";
        });
      }
    });

    var overview = make("section", "work-overview");
    overview.setAttribute("aria-labelledby", "work-featured-heading");
    var identity = make("div", "work-overview-copy");
    identity.appendChild(sectionLabel("Featured"));
    var heading = make("h2", "work-overview-heading", "Three builds, three parts of the estate.");
    heading.id = "work-featured-heading";
    identity.appendChild(heading);
    identity.appendChild(make("p", "work-overview-intro", "Ramone represents local AI, SONIN represents autonomous audio systems, and SlamPunk shows real-time game audio under competitive constraints."));
    overview.appendChild(identity);

    var rail = make("nav", "work-featured-rail");
    rail.setAttribute("aria-label", "Featured project index");
    var preferred = [entries[0], entries[2], entries[1]].filter(Boolean);
    preferred.forEach(function (entry) {
      var title = entry.querySelector(".project-title");
      var index = entry.querySelector(".project-index");
      var role = entry.querySelector(".project-role");
      var link = make("a", "work-featured-link");
      link.href = "#" + entry.id;
      link.appendChild(make("span", "work-featured-code", index ? index.textContent.trim() : "Project"));
      link.appendChild(make("strong", "work-featured-title", title ? title.textContent.trim() : "Project"));
      link.appendChild(make("span", "work-featured-role", role ? role.textContent.trim() : "Technical build"));
      rail.appendChild(link);
    });
    overview.appendChild(rail);
    header.insertAdjacentElement("afterend", overview);

    var allHeading = make("div", "editorial-directory-heading");
    allHeading.appendChild(sectionLabel("All projects"));
    allHeading.appendChild(make("p", "editorial-directory-copy", "Open a project for implementation detail, evidence, and direct case-study links."));
    projects.insertAdjacentElement("beforebegin", allHeading);
  }

  function articleType(card) {
    if (card.classList.contains("coming-soon")) return "upcoming";
    if (card.hasAttribute("data-series")) return "series";
    var subtitle = card.querySelector(".article-subtitle");
    return subtitle && /case study/i.test(subtitle.textContent) ? "case-study" : "article";
  }

  function enhanceWriting() {
    var articles = document.querySelector(".articles");
    var header = document.querySelector(".page-header");
    if (!articles || !header || articles.dataset.editorialReady === "true") return;
    articles.dataset.editorialReady = "true";
    addPageClass("writing");

    var cards = Array.prototype.slice.call(articles.querySelectorAll(".article-entry"));
    cards.forEach(function (card) { card.dataset.contentType = articleType(card); });

    var published = cards.find(function (card) { return !card.classList.contains("coming-soon"); });
    if (published) {
      var feature = make("section", "writing-feature");
      feature.setAttribute("aria-labelledby", "writing-feature-heading");
      var meta = make("div", "writing-feature-meta");
      meta.appendChild(sectionLabel("Featured"));
      var number = published.querySelector(".article-number");
      var date = published.querySelector(".article-date");
      meta.appendChild(make("span", "writing-feature-number", number ? number.textContent.trim() : "Latest"));
      meta.appendChild(make("span", "writing-feature-date", date ? date.textContent.trim() : "Published"));
      feature.appendChild(meta);
      var body = make("div", "writing-feature-body");
      var title = published.querySelector(".article-title");
      var summary = published.querySelector(".article-summary");
      var heading = make("h2", "writing-feature-heading", title ? title.textContent.trim() : "Latest writing");
      heading.id = "writing-feature-heading";
      body.appendChild(heading);
      if (summary) body.appendChild(make("p", "writing-feature-summary", summary.textContent.trim()));
      var link = make("a", "writing-feature-link", "Read featured case study");
      link.href = published.getAttribute("href") || "/writing/";
      body.appendChild(link);
      feature.appendChild(body);
      header.insertAdjacentElement("afterend", feature);
    }

    var controls = make("section", "writing-controls");
    controls.setAttribute("aria-label", "Writing filters");
    controls.appendChild(sectionLabel("Browse"));
    var filters = make("div", "writing-filter-row");
    [
      ["all", "All writing"],
      ["case-study", "Case studies"],
      ["series", "Series"],
      ["upcoming", "Upcoming"]
    ].forEach(function (item, index) {
      var button = make("button", "writing-filter" + (index === 0 ? " is-active" : ""), item[1]);
      button.type = "button";
      button.dataset.writingFilter = item[0];
      button.addEventListener("click", function () {
        filters.querySelectorAll(".writing-filter").forEach(function (candidate) {
          candidate.classList.toggle("is-active", candidate === button);
        });
        cards.forEach(function (card) {
          var type = card.dataset.contentType;
          var visible = item[0] === "all" || type === item[0] || (item[0] === "series" && card.hasAttribute("data-series"));
          card.hidden = !visible;
        });
        document.querySelectorAll(".series-banner").forEach(function (banner) {
          banner.hidden = item[0] !== "all" && item[0] !== "series" && item[0] !== "upcoming";
        });
      });
      filters.appendChild(button);
    });
    controls.appendChild(filters);

    var search = document.querySelector(".card-search");
    if (search) search.insertAdjacentElement("beforebegin", controls);
    else articles.insertAdjacentElement("beforebegin", controls);

    var directory = make("div", "editorial-directory-heading writing-directory-heading");
    directory.appendChild(sectionLabel("All writing"));
    directory.appendChild(make("p", "editorial-directory-copy", "Case studies, engineering notes, and scheduled series remain traceable through stable W-numbers."));
    articles.insertAdjacentElement("beforebegin", directory);
  }

  function topologyVisual() {
    var visual = make("div", "about-topology");
    visual.setAttribute("aria-hidden", "true");
    [
      ["systems", "Systems"],
      ["software", "Software / AI"],
      ["audio", "Audio"],
      ["games", "Game development"]
    ].forEach(function (item) {
      var node = make("span", "about-topology-node about-topology-node-" + item[0], item[1]);
      visual.appendChild(node);
    });
    visual.appendChild(make("span", "about-topology-line about-topology-line-a"));
    visual.appendChild(make("span", "about-topology-line about-topology-line-b"));
    visual.appendChild(make("span", "about-topology-line about-topology-line-c"));
    return visual;
  }

  function enhanceAbout() {
    var header = document.querySelector(".page-header");
    var systemSection = document.querySelector(".system-section");
    if (!header || !systemSection || header.dataset.editorialReady === "true") return;
    header.dataset.editorialReady = "true";
    addPageClass("about");

    var role = document.querySelector(".sidebar-role");
    if (role) role.textContent = "Systems engineering / software and AI / audio / game development";
    var thesis = document.querySelector(".thesis");
    if (thesis) thesis.textContent = "I build evidence-led systems across software, local AI, infrastructure, audio, and interactive technology.";
    var intro = document.querySelector(".intro-copy");
    if (intro) intro.textContent = "The route began in music and aeronautical engineering, moved through game development and technical audio, and now centres on systems that can be inspected, evaluated, deployed, and explained.";

    var identityPanel = document.querySelector(".identity-panel");
    if (identityPanel && !identityPanel.querySelector(".about-topology")) {
      identityPanel.insertBefore(topologyVisual(), identityPanel.firstChild);
    }

    var priorities = make("section", "about-priorities");
    priorities.setAttribute("aria-labelledby", "about-priorities-heading");
    var headingWrap = make("div", "about-priorities-heading-wrap");
    headingWrap.appendChild(sectionLabel("Current priorities"));
    var heading = make("h2", "about-priorities-heading", "What I am concentrating on now.");
    heading.id = "about-priorities-heading";
    headingWrap.appendChild(heading);
    headingWrap.appendChild(make("p", "about-priorities-intro", "The common thread is operational clarity: systems should expose their evidence, ownership, failure modes, and deployment state."));
    priorities.appendChild(headingWrap);

    var grid = make("div", "about-priority-grid");
    [
      ["01", "Automation and governance", "Control-plane contracts, bounded automation, deployment evidence, and repeatable repository operations."],
      ["02", "Local AI and grounded retrieval", "Private model serving, memory, retrieval, and evaluation before a model or prompt is promoted."],
      ["03", "Observability and evidence", "Interfaces that separate declaration, observation, health, and publication instead of flattening them into one status."],
      ["04", "Interactive audio systems", "Real-time DSP, generative instruments, and sonification that expose technical behaviour through sound."],
      ["05", "Portfolio-grade infrastructure", "A public estate that is readable, independently deployable, and honest about what is implemented versus live."]
    ].forEach(function (item) {
      var card = make("article", "about-priority-card");
      card.appendChild(make("span", "about-priority-index", item[0]));
      card.appendChild(make("h3", "about-priority-title", item[1]));
      card.appendChild(make("p", "about-priority-copy", item[2]));
      grid.appendChild(card);
    });
    priorities.appendChild(grid);

    var principles = make("div", "about-principles");
    principles.appendChild(sectionLabel("Engineering principles"));
    [
      "Evidence before deployment claims",
      "Explicit ownership and bounded permissions",
      "Fail closed when authority is uncertain",
      "Local-first AI and privacy where practical",
      "Evaluation before model promotion",
      "Automate repetition, not judgement"
    ].forEach(function (text) {
      principles.appendChild(make("span", "about-principle", text));
    });
    priorities.appendChild(principles);
    systemSection.insertAdjacentElement("beforebegin", priorities);
  }

  function enhanceHome() {
    var hero = document.querySelector(".hero");
    if (!hero || hero.dataset.editorialReady === "true") return;
    hero.dataset.editorialReady = "true";
    addPageClass("home");

    document.querySelectorAll('a[href^="/lab/index.html#ramone-card"]').forEach(function (link) {
      link.setAttribute("href", "/systems/#ramone");
    });
    document.querySelectorAll('a[href^="/lab/index.html#system-map"]').forEach(function (link) {
      link.setAttribute("href", "/lab/system-map/");
    });

    var startGrid = document.querySelector(".route-grid");
    if (startGrid && !startGrid.querySelector('[href="/systems/"]')) {
      var systems = make("a", "route-card route-card-systems");
      systems.href = "/systems/";
      systems.appendChild(make("span", "eyebrow", "route / directory"));
      systems.appendChild(make("span", "route-title", "Browse the Systems"));
      systems.appendChild(make("span", "route-desc", "Public products, portfolio destinations, and engineering interfaces with clear ownership and maturity."));
      startGrid.insertBefore(systems, startGrid.firstChild);
    }
  }

  function init() {
    var path = window.location.pathname;
    if (path.startsWith("/work")) enhanceWork();
    else if (path.startsWith("/writing") && path.replace(/\/$/, "") === "/writing") enhanceWriting();
    else if (path.startsWith("/about")) enhanceAbout();
    else if (path === "/" || path === "/index.html") enhanceHome();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  window.AtlasEditorialV2 = { init: init };
})();
