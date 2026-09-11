import {
  DEFAULT_EVIDENCE_VIEW,
  EVIDENCE_VIEWS,
  evidenceViewHref,
  parseEvidenceView,
} from "./estate-profile.js";

export { DEFAULT_EVIDENCE_VIEW, EVIDENCE_VIEWS, evidenceViewHref, parseEvidenceView };

function byId(id) {
  return typeof document === "undefined" ? null : document.getElementById(id);
}

export function applyEvidenceView(view, options = {}) {
  const selected = EVIDENCE_VIEWS.includes(view) ? view : DEFAULT_EVIDENCE_VIEW;
  const root = options.root ?? (typeof document === "undefined" ? null : document);
  if (!root) return selected;
  const enhanced = options.enhanced !== false;
  const tabs = [...root.querySelectorAll("[data-evidence-view-tab]")];
  const panels = [...root.querySelectorAll("details[data-evidence-view], section[data-evidence-view]")];

  if (enhanced && tabs.length) {
    const nav = byId("evidence-view-nav") ?? root.querySelector(".systems-evidence-views");
    if (nav) {
      nav.setAttribute("role", "tablist");
      nav.dataset.evidenceViews = "enhanced";
    }
  }

  for (const tab of tabs) {
    const name = tab.dataset.evidenceViewTab;
    const isSelected = name === selected;
    if (enhanced) {
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(isSelected));
      tab.setAttribute("tabindex", isSelected ? "0" : "-1");
      tab.setAttribute("aria-controls", `view-${name}`);
    }
    if (isSelected) tab.setAttribute("aria-current", "true");
    else tab.removeAttribute("aria-current");
  }

  for (const panel of panels) {
    const name = panel.dataset.evidenceView;
    const isSelected = name === selected;
    const summary = panel.tagName === "DETAILS" ? panel.querySelector(":scope > summary") : null;
    if (panel.tagName === "DETAILS") {
      panel.open = !enhanced || isSelected;
    }
    if (enhanced) {
      panel.hidden = !isSelected;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", `tab-${name}`);
      if (summary) summary.hidden = true;
    } else {
      panel.hidden = false;
      if (summary) summary.hidden = false;
    }
  }

  const supporting = byId("supporting-records");
  if (supporting && supporting.tagName === "DETAILS" && enhanced && options.closeSupporting !== false) {
    if (options.initial === true) supporting.open = false;
  }
  return selected;
}

export function syncEvidenceViewUrl(view, historyImpl, locationLike) {
  if (!historyImpl || typeof historyImpl.pushState !== "function") return evidenceViewHref(view);
  const loc = locationLike ?? (typeof window === "undefined" ? { pathname: "/systems/evidence/", search: "", hash: "" } : window.location);
  const url = new URL(loc.href ?? `${loc.pathname || "/systems/evidence/"}${loc.search || ""}${loc.hash || ""}`, "https://atlas-systems.uk");
  url.searchParams.set("view", view);
  url.hash = `view-${view}`;
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${loc.pathname || ""}${loc.search || ""}${loc.hash || ""}`;
  if (next !== current) historyImpl.pushState({ evidenceView: view }, "", next);
  return next;
}

function moveTab(tabs, current, delta) {
  if (!tabs.length) return;
  const index = Math.max(0, tabs.findIndex((tab) => tab === current));
  const next = tabs[(index + delta + tabs.length) % tabs.length];
  next?.focus();
  next?.click();
}

export function bindEvidenceViews(options = {}) {
  const root = options.root ?? (typeof document === "undefined" ? null : document);
  const historyImpl = options.history ?? (typeof window === "undefined" ? null : window.history);
  const locationLike = options.location ?? (typeof window === "undefined" ? null : window.location);
  if (!root) return DEFAULT_EVIDENCE_VIEW;

  const select = (view, { persist = true, initial = false } = {}) => {
    const applied = applyEvidenceView(view, { root, enhanced: true, initial });
    if (persist && historyImpl) syncEvidenceViewUrl(applied, historyImpl, locationLike);
    return applied;
  };

  const initial = parseEvidenceView(locationLike ?? {});
  select(initial, { persist: false, initial: true });

  const nav = byId("evidence-view-nav") ?? root.querySelector(".systems-evidence-views");
  const onClick = (event) => {
    const tab = event.target?.closest?.("[data-evidence-view-tab]");
    if (!tab || (nav && !nav.contains(tab))) return;
    event.preventDefault();
    select(tab.dataset.evidenceViewTab);
  };
  const onKey = (event) => {
    if (!nav || event.target?.closest?.("[data-evidence-view-tab]") == null) return;
    const tabs = [...root.querySelectorAll("[data-evidence-view-tab]")];
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveTab(tabs, event.target.closest("[data-evidence-view-tab]"), 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveTab(tabs, event.target.closest("[data-evidence-view-tab]"), -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      tabs[0]?.focus();
      tabs[0]?.click();
    } else if (event.key === "End") {
      event.preventDefault();
      tabs[tabs.length - 1]?.focus();
      tabs[tabs.length - 1]?.click();
    }
  };
  const onPop = () => {
    select(parseEvidenceView(locationLike ?? {}), { persist: false });
  };

  nav?.addEventListener("click", onClick);
  nav?.addEventListener("keydown", onKey);
  if (typeof window !== "undefined") {
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onPop);
  }
  return initial;
}

if (typeof window !== "undefined" && window.document) {
  bindEvidenceViews();
}
