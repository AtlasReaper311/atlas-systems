const LAB_SHELL_STABILITY_MS = 280;
const LAB_SHELL_TOLERANCE_PX = 2;

let auditTimer = null;
let stabilityTimer = null;
let pendingFailureKey = "";
let confirmedFailureKey = "";
let observer = null;

function normalizePath(pathname = window.location.pathname) {
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

function selectorFor(element) {
  if (!element) return null;
  if (element.id) return `#${CSS.escape(element.id)}`;
  const classes = [...element.classList]
    .slice(0, 3)
    .map((name) => `.${CSS.escape(name)}`)
    .join("");
  return `${element.tagName.toLowerCase()}${classes}`;
}

function visible(element) {
  if (!element) return false;
  if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function roundedRect(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    selector: selectorFor(element),
    top: Math.round(rect.top * 10) / 10,
    right: Math.round(rect.right * 10) / 10,
    bottom: Math.round(rect.bottom * 10) / 10,
    left: Math.round(rect.left * 10) / 10,
    width: Math.round(rect.width * 10) / 10,
    height: Math.round(rect.height * 10) / 10,
  };
}

function inspectLabShell(root = document) {
  const path = normalizePath();
  const header = root.querySelector(".atlas-header");
  const context = root.querySelector('.lab-context-nav[aria-label="Lab navigation"]');
  const main = root.querySelector("main");
  const heading = [...root.querySelectorAll("main h1")].find(visible) || null;
  const search = root.querySelector(".atlas-search-control");
  const footer = root.querySelector("footer[data-atlas-phase6-footer], footer.lab-tool-footer");
  const current = context?.querySelector('[aria-current="page"]') || null;
  const headerRect = roundedRect(header);
  const contextRect = roundedRect(context);
  const mainRect = roundedRect(main);
  const headingRect = roundedRect(heading);
  const bodyPaddingTop = Number.parseFloat(getComputedStyle(document.body).paddingTop) || 0;
  const layout = document.body.dataset.labLayout || "";
  const failures = [];

  if (!header) failures.push({ rule: "header-present" });
  if (!context) failures.push({ rule: "context-navigation-present" });
  if (!main) failures.push({ rule: "main-present" });
  if (!heading) failures.push({ rule: "visible-h1-present" });
  if (!search) failures.push({ rule: "search-present" });
  if (!footer) failures.push({ rule: "footer-present" });
  if (!layout) failures.push({ rule: "layout-mode-present" });
  if (path !== "/lab/" && context && !current) {
    failures.push({ rule: "current-lab-route-present" });
  }

  if (headerRect && bodyPaddingTop + LAB_SHELL_TOLERANCE_PX < headerRect.height) {
    failures.push({
      rule: "fixed-header-reserved-in-flow",
      bodyPaddingTop,
      header: headerRect,
    });
  }

  if (headerRect && contextRect) {
    if (contextRect.top < headerRect.bottom - LAB_SHELL_TOLERANCE_PX) {
      failures.push({
        rule: "context-navigation-below-header",
        header: headerRect,
        context: contextRect,
      });
    }
    if (contextRect.top > headerRect.bottom + LAB_SHELL_TOLERANCE_PX) {
      failures.push({
        rule: "no-gap-between-header-and-context-navigation",
        header: headerRect,
        context: contextRect,
      });
    }
  }

  if (contextRect && headingRect && headingRect.top < contextRect.bottom + 8) {
    failures.push({
      rule: "heading-clears-context-navigation",
      context: contextRect,
      heading: headingRect,
    });
  }

  return {
    path,
    layout,
    bodyPaddingTop,
    header: headerRect,
    context: contextRect,
    main: mainRect,
    heading: headingRect,
    current: roundedRect(current),
    failures,
  };
}

function auditLabShell(root = document) {
  const result = inspectLabShell(root);
  const documentElement = root.documentElement || document.documentElement;
  const failureKey = JSON.stringify(result.failures);

  if (!result.failures.length) {
    window.clearTimeout(stabilityTimer);
    stabilityTimer = null;
    pendingFailureKey = "";
    confirmedFailureKey = "";
    documentElement.dataset.labShellContract = "pass";
    return result;
  }

  if (failureKey !== pendingFailureKey) {
    pendingFailureKey = failureKey;
    documentElement.dataset.labShellContract = "pending";
    window.clearTimeout(stabilityTimer);
    stabilityTimer = window.setTimeout(() => auditLabShell(root), LAB_SHELL_STABILITY_MS);
    return result;
  }

  documentElement.dataset.labShellContract = "fail";
  if (failureKey !== confirmedFailureKey) {
    console.error(
      `[lab-shell-contract] ${result.failures.length} stable shell failure(s): ${JSON.stringify(result)}`,
    );
    confirmedFailureKey = failureKey;
  }
  return result;
}

function scheduleAudit() {
  window.clearTimeout(auditTimer);
  auditTimer = window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => auditLabShell());
    });
  }, 120);
}

async function startLabShellContract() {
  if (document.readyState !== "complete") {
    await new Promise((resolve) => window.addEventListener("load", resolve, { once: true }));
  }
  try {
    await document.fonts?.ready;
  } catch {
    // Font readiness improves stability but rendered geometry remains authority.
  }
  scheduleAudit();
  window.addEventListener("resize", scheduleAudit, { passive: true });
  if (typeof MutationObserver !== "undefined" && document.body) {
    observer = new MutationObserver(scheduleAudit);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "aria-hidden", "style", "open"],
    });
  }
}

if (typeof document !== "undefined") {
  void startLabShellContract();
}

export {
  LAB_SHELL_STABILITY_MS,
  LAB_SHELL_TOLERANCE_PX,
  auditLabShell,
  inspectLabShell,
};
