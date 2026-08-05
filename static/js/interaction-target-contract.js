const TARGET_MINIMUM = 44;
const TARGET_SELECTOR = [
  "button:not([disabled])",
  "summary",
  "input:not([type='hidden']):not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[role='button']:not([aria-disabled='true'])",
  "[role='tab']:not([aria-disabled='true'])",
  ".focus-action",
  ".nav-links a",
  ".wordmark",
  ".lab-context-nav a",
  ".lab-tool-footer a",
  ".atlas-header__nav a",
  ".atlas-header__brand a",
  ".atlas-header__actions a",
  ".atlas-mobile-nav a",
  ".symphony-product-link",
  ".symphony-product-mode-link",
  ".symphony-proof-open",
].join(",");

let auditTimer = null;
let previousFailureKey = "";
let observer = null;

function selectorFor(element) {
  if (element.id) return `#${CSS.escape(element.id)}`;
  const classes = [...element.classList]
    .slice(0, 3)
    .map((name) => `.${CSS.escape(name)}`)
    .join("");
  return `${element.tagName.toLowerCase()}${classes}`;
}

function isVisible(element) {
  if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function auditInteractionTargets(root = document) {
  const failures = [...root.querySelectorAll(TARGET_SELECTOR)]
    .filter(isVisible)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        selector: selectorFor(element),
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
      };
    })
    .filter(({ width, height }) => width + 0.1 < TARGET_MINIMUM || height + 0.1 < TARGET_MINIMUM);

  const documentElement = root.documentElement || document.documentElement;
  const failureKey = JSON.stringify(failures);
  if (failures.length) {
    documentElement.dataset.atlasTargetContract = "fail";
    if (failureKey !== previousFailureKey) {
      console.error(
        `[interaction-target-contract] ${failures.length} visible target(s) are smaller than ${TARGET_MINIMUM}px`,
        failures,
      );
    }
  } else {
    documentElement.dataset.atlasTargetContract = "pass";
  }
  previousFailureKey = failureKey;
  return failures;
}

function scheduleAudit() {
  window.clearTimeout(auditTimer);
  auditTimer = window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => auditInteractionTargets());
    });
  }, 120);
}

async function startInteractionTargetContract() {
  try {
    await document.fonts?.ready;
  } catch {
    // Font readiness is an optimisation only; rendered geometry remains authoritative.
  }
  scheduleAudit();
  window.addEventListener("resize", scheduleAudit, { passive: true });
  if (typeof MutationObserver !== "undefined" && document.body) {
    observer = new MutationObserver(scheduleAudit);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "aria-hidden", "aria-disabled", "style"],
    });
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startInteractionTargetContract, { once: true });
  } else {
    void startInteractionTargetContract();
  }
}

export { TARGET_MINIMUM, TARGET_SELECTOR, auditInteractionTargets };
