const SEARCH_ENDPOINT = "https://api.atlas-systems.uk/v1/search";
const MAX_RESULTS = 5;
const MIN_QUERY_LENGTH = 2;
const QUERY_LIMIT = 500;
const TIMEOUT_MS = 8000;

let overlay = null;
let previousFocus = null;
let controller = null;
let timer = null;

export function isAtlasOwnedHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "atlas-systems.uk" || host.endsWith(".atlas-systems.uk");
}

function resultHref(hit) {
  const repository = String(hit.source_repo || hit.repo || "");
  const path = String(hit.file_path || hit.path || "");
  if (repository === "atlas-systems" && /\.html?$/i.test(path)) {
    return "https://atlas-systems.uk/" + path.replace(/^\/+/, "").replace(/index\.html?$/i, "");
  }
  if (repository && path) {
    return "https://github.com/AtlasReaper311/" + encodeURIComponent(repository) +
      "/blob/main/" + path.split("/").map(encodeURIComponent).join("/");
  }
  return null;
}

function displayText(value, limit = 220) {
  const cleaned = String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= limit) return cleaned;
  return cleaned.slice(0, limit).replace(/\s+\S*$/, "") + "...";
}

function buildOverlay() {
  const root = document.createElement("div");
  root.className = "atlas-search-root";
  root.hidden = true;

  const scrim = document.createElement("button");
  scrim.type = "button";
  scrim.className = "atlas-search-scrim";
  scrim.setAttribute("aria-label", "Close estate search");

  const panel = document.createElement("section");
  panel.className = "atlas-search-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Search the Atlas Systems estate");

  const heading = document.createElement("p");
  heading.className = "atlas-search-heading";
  heading.textContent = "ATLAS ESTATE // search";

  const input = document.createElement("input");
  input.type = "search";
  input.className = "atlas-search-input";
  input.placeholder = "search the estate...";
  input.maxLength = QUERY_LIMIT;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", "Search query");
  input.setAttribute("aria-controls", "atlas-search-results");

  const status = document.createElement("p");
  status.className = "atlas-search-status";
  status.setAttribute("aria-live", "polite");
  status.textContent = "type at least two characters";

  const results = document.createElement("ol");
  results.id = "atlas-search-results";
  results.className = "atlas-search-results";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "atlas-search-close";
  close.textContent = "Close";

  panel.append(heading, input, status, results, close);
  root.append(scrim, panel);
  document.body.appendChild(root);

  return { root, scrim, panel, input, status, results, close };
}

function clearResults() {
  overlay.results.replaceChildren();
}

function renderResults(data) {
  clearResults();
  const hits = Array.isArray(data && data.hits) ? data.hits.slice(0, MAX_RESULTS) : [];
  if (!hits.length) {
    overlay.status.textContent = "no matches in the public estate corpus";
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const hit of hits) {
    const item = document.createElement("li");
    item.className = "atlas-search-result";
    const href = resultHref(hit);
    const main = document.createElement(href ? "a" : "div");
    main.className = "atlas-search-result-main";
    if (href) {
      main.href = href;
      const destination = new URL(href);
      if (!isAtlasOwnedHost(destination.hostname)) {
        main.target = "_blank";
        main.rel = "noopener noreferrer";
      }
    }

    const label = document.createElement("strong");
    label.textContent = String(hit.source_repo || hit.repo || "estate") + "/" +
      String(hit.file_path || hit.path || "document");
    const excerpt = document.createElement("span");
    excerpt.textContent = displayText(hit.text || hit.excerpt || "");
    main.append(label, excerpt);
    item.appendChild(main);
    fragment.appendChild(item);
  }
  overlay.results.appendChild(fragment);
  overlay.status.textContent = `${hits.length} ${hits.length === 1 ? "result" : "results"}`;
}

async function runSearch(query) {
  if (controller) controller.abort();
  controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  overlay.status.textContent = "searching...";
  try {
    const url = new URL(SEARCH_ENDPOINT);
    url.searchParams.set("q", query);
    url.searchParams.set("top_k", String(MAX_RESULTS));
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (response.status === 429) {
      overlay.status.textContent = "search rate limit reached; try again shortly";
      clearResults();
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderResults(await response.json());
  } catch (error) {
    if (error && error.name === "AbortError") return;
    clearResults();
    overlay.status.textContent = "estate search unavailable";
  } finally {
    window.clearTimeout(timeout);
  }
}

function closeSearch() {
  if (!overlay || overlay.root.hidden) return;
  if (controller) controller.abort();
  if (timer) window.clearTimeout(timer);
  overlay.root.hidden = true;
  document.body.classList.remove("atlas-search-open");
  if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
  previousFocus = null;
}

function openSearch(trigger) {
  if (!overlay) overlay = buildOverlay();
  previousFocus = trigger || document.activeElement;
  overlay.root.hidden = false;
  document.body.classList.add("atlas-search-open");
  overlay.input.focus();
  overlay.input.select();
}

function trapFocus(event) {
  const links = Array.from(overlay.panel.querySelectorAll("a[href], button, input"))
    .filter((element) => !element.disabled && !element.hidden);
  if (!links.length) return;
  const first = links[0];
  const last = links[links.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function installEstateSearch() {
  document.querySelectorAll("[data-estate-search-open]").forEach((trigger) => {
    trigger.addEventListener("click", () => openSearch(trigger));
  });

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && !event.altKey && key === "k") {
      event.preventDefault();
      openSearch(document.activeElement);
    } else if (key === "escape") {
      closeSearch();
    }
  });

  if (!overlay) overlay = buildOverlay();
  overlay.scrim.addEventListener("click", closeSearch);
  overlay.close.addEventListener("click", closeSearch);
  overlay.panel.addEventListener("keydown", (event) => {
    if (event.key === "Tab") trapFocus(event);
  });
  overlay.input.addEventListener("input", () => {
    const query = overlay.input.value.trim();
    if (timer) window.clearTimeout(timer);
    if (query.length < MIN_QUERY_LENGTH) {
      if (controller) controller.abort();
      clearResults();
      overlay.status.textContent = query ? "keep typing..." : "type at least two characters";
      return;
    }
    timer = window.setTimeout(() => void runSearch(query), 250);
  });
}
