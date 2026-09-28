export function originOf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function originsForTarget(iframeOriginsByTarget, target) {
  if (iframeOriginsByTarget instanceof Map) return iframeOriginsByTarget.get(target) || [];
  return iframeOriginsByTarget?.[target] || [];
}

function isThirdPartyIframeNode(node, { pageOrigin, iframeOriginsByTarget }) {
  const target = Array.isArray(node?.target) ? node.target : [];
  // A target containing only the iframe selector identifies the Atlas-owned
  // iframe element itself. Only descendants inside that element can be owned
  // by the embedded document.
  if (target.length < 2) return false;
  const origins = originsForTarget(iframeOriginsByTarget, target[0]);
  return origins.length === 1 && Boolean(origins[0]) && origins[0] !== pageOrigin;
}

export function classifyAccessibilityViolations(violations = [], {
  pageOrigin = null,
  iframeOriginsByTarget = new Map(),
} = {}) {
  const atlasBlocking = [];
  const thirdParty = [];
  for (const violation of violations) {
    const thirdPartyOwned = violation.nodes?.length > 0
      && violation.nodes.every((node) => isThirdPartyIframeNode(node, { pageOrigin, iframeOriginsByTarget }));
    if (thirdPartyOwned) {
      thirdParty.push(violation);
    } else if (violation.impact === "serious" || violation.impact === "critical") {
      atlasBlocking.push(violation);
    }
  }
  return { atlasBlocking, thirdParty };
}

export function classifyConsoleErrors(records = [], {
  pageOrigin = null,
  childFrameOrigins: frameOrigins = new Set(),
} = {}) {
  const actionable = records.filter(({ text = "" }) => !/\b503\b/.test(text));
  const origins = frameOrigins instanceof Set ? frameOrigins : new Set(frameOrigins);
  const thirdParty = actionable.filter(({ origin }) => origin && origin !== pageOrigin && origins.has(origin));
  return {
    atlasBlocking: actionable.filter((record) => !thirdParty.includes(record)),
    thirdParty,
  };
}
