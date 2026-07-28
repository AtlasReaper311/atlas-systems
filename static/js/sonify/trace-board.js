/**
 * System SYMPHONY TRACE board geometry.
 *
 * Pure layout maths for the PCB chip board: district assignment, chip
 * placement, Manhattan copper routing and per-chip state tokens. This module
 * touches no DOM and keeps no state, so the board contract is directly
 * testable. Every value here is derived from the merged telemetry/topology
 * frame; nothing about a service is invented locally.
 */

export const TRACE_BOARD_BUILD_ID = "20260728-system-symphony-trace-board-v1";

/**
 * Districts are a deterministic regrouping of the existing `voice.layer`
 * values, not a second source of truth. Layers absent from every list fall
 * through to the measured-surfaces district; external dependency names always
 * land in the boundary district because they have no measured layer at all.
 */
export const TRACE_BOARD_DISTRICTS = Object.freeze([
  Object.freeze({
    id: "sources",
    label: "01 SOURCES / LAN",
    layers: Object.freeze(["local-ai", "reusable-kit"]),
  }),
  Object.freeze({
    id: "edge",
    label: "02 EDGE / TRIGGER",
    layers: Object.freeze(["edge"]),
  }),
  Object.freeze({
    id: "control",
    label: "03 ROUTING / CONTROL",
    layers: Object.freeze(["observability", "infra"]),
  }),
  Object.freeze({
    id: "surfaces",
    label: "04 MEASURED SURFACES",
    layers: Object.freeze(["public-api", "surface", "unknown"]),
  }),
  Object.freeze({
    id: "boundary",
    label: "05 EXTERNAL BOUNDARY",
    layers: Object.freeze([]),
  }),
]);

const BOUNDARY_INDEX = TRACE_BOARD_DISTRICTS.length - 1;
const FALLBACK_INDEX = 3;

export const DESKTOP_BOARD = Object.freeze({
  layout: "desktop",
  /**
   * Sized so five districts fit a 1440px laptop without zooming out: the board
   * plus the inspector rail has to live inside the flagship's inner width.
   * The gutter between columns still has room for a routed trace plus its
   * per-target offset.
   */
  width: 1240,
  originX: 60,
  colPitch: 236,
  y0: 90,
  rowH: 78,
  chipW: 170,
  chipH: 46,
  /**
   * Rows per column. A deep district grows the board downwards, because
   * vertical space is free on a page that already scrolls while horizontal
   * space is what forces the reader to zoom out. Only past `rowCap` does a
   * district spill into extra columns.
   */
  minRows: 6,
  rowCap: 12,
  minHeight: 584,
  labelOffset: 28,
  gutter: 26,
  busInset: 26,
});

/**
 * The narrow board is sized so that a chip still clears the 44px touch
 * minimum after the SVG has been scaled down to a phone-width container. A
 * 320 unit viewBox keeps that scale close to 1:1.
 */
export const MOBILE_BOARD = Object.freeze({
  layout: "mobile",
  width: 320,
  spineX: 22,
  chipX: 44,
  chipW: 264,
  chipH: 56,
  rowH: 64,
  bandH: 30,
  y0: 18,
  gutter: 18,
});

/** State codes are text, so a chip never depends on colour alone. */
export const STATE_CODES = Object.freeze({
  healthy: "OK",
  degraded: "DEGR",
  down: "DOWN",
  unknown: "UNKN",
  unmeasured: "NO MEAS",
  stale: "LAST KNOWN",
});

const GENERIC_KINDS = new Set(["", "component", "service", "measured-service"]);

const LAYER_KIND_TOKEN = Object.freeze({
  "local-ai": "local",
  edge: "worker",
  observability: "worker",
  "public-api": "worker",
  surface: "site",
  infra: "infra",
  "reusable-kit": "kit",
  unknown: "node",
});

export function districtIndexForLayer(layer) {
  const value = String(layer ?? "").trim().toLowerCase();
  const index = TRACE_BOARD_DISTRICTS.findIndex((district) => district.layers.includes(value));
  return index < 0 ? FALLBACK_INDEX : index;
}

/**
 * A short kind token for the chip meta line. Real topology kinds win; the
 * generic placeholders the merge step supplies fall back to the layer so the
 * chip still says what sort of thing it is.
 */
export function chipKindToken(voice) {
  const kind = String(voice?.kind ?? "").trim().toLowerCase();
  if (kind && !GENERIC_KINDS.has(kind)) {
    return kind.replace(/[\s_]+/g, "-").slice(0, 14);
  }
  return LAYER_KIND_TOKEN[String(voice?.layer ?? "unknown")] ?? "node";
}

export function compactLatency(latencyMs) {
  return Number.isFinite(latencyMs) ? `${Math.round(latencyMs)}ms` : "";
}

/**
 * Resolve the visible tokens for one chip.
 *
 * `presentation` is the existing `{ key, label }` pair from the UI so the
 * status vocabulary stays shared. The evidence state is kept separate rather
 * than collapsed into the status, because stale and reported-unknown are
 * different claims and must not render identically.
 */
export function chipStateForVoice(voice, presentation = {}) {
  const status = String(presentation.key ?? "unknown");
  const evidence = String(
    voice?.evidenceState ?? (voice?.measured ? "measured" : "topology-only"),
  );
  const unmeasured = status === "unmeasured";
  const stale = evidence === "stale";
  const kind = chipKindToken(voice);

  // Truth guard: a socket carries no LED and no metric, so an unmeasured
  // component can never be mistaken for a measured one.
  const showLed = !unmeasured;
  const latency = unmeasured ? "" : compactLatency(voice?.latency_ms);
  const showMetric = latency !== "";

  return {
    status,
    evidence,
    unmeasured,
    stale,
    kind,
    showLed,
    showMetric,
    code: stale ? STATE_CODES.stale : STATE_CODES[status] ?? STATE_CODES.unknown,
    label: String(presentation.label ?? "Unknown"),
    meta: showMetric ? `${kind} · ${latency}` : kind,
  };
}

function roundTo(value) {
  return Math.round(value * 100) / 100;
}

function dedupePoints(points) {
  const out = [];
  for (const point of points) {
    const previous = out[out.length - 1];
    if (previous && Math.abs(previous.x - point.x) < 0.01 && Math.abs(previous.y - point.y) < 0.01) {
      continue;
    }
    out.push(point);
  }
  return out;
}

/**
 * Turn an orthogonal polyline into a copper path with 45-degree chamfers at
 * every bend, which is how real board traces turn corners.
 */
export function chamferedPath(points, radius = 9) {
  const path = dedupePoints(points ?? []);
  if (path.length < 2) return "";

  const parts = [`M ${roundTo(path[0].x)} ${roundTo(path[0].y)}`];
  for (let index = 1; index < path.length - 1; index += 1) {
    const previous = path[index - 1];
    const corner = path[index];
    const next = path[index + 1];
    const inLength = Math.hypot(corner.x - previous.x, corner.y - previous.y) || 1;
    const outLength = Math.hypot(next.x - corner.x, next.y - corner.y) || 1;
    const cut = Math.min(radius, inLength / 2, outLength / 2);
    parts.push(
      `L ${roundTo(corner.x - ((corner.x - previous.x) / inLength) * cut)} ${roundTo(corner.y - ((corner.y - previous.y) / inLength) * cut)}`,
      `L ${roundTo(corner.x + ((next.x - corner.x) / outLength) * cut)} ${roundTo(corner.y + ((next.y - corner.y) / outLength) * cut)}`,
    );
  }
  const last = path[path.length - 1];
  parts.push(`L ${roundTo(last.x)} ${roundTo(last.y)}`);
  return parts.join(" ");
}

/**
 * Manhattan route between two placed chips. Long horizontal hops leave the
 * chip rows entirely and run in a bus channel above or below the board so a
 * trace never crosses a chip it has nothing to do with.
 */
export function copperRoute(from, to, options = {}) {
  const {
    offset = 0,
    topBus = 64,
    bottomBus = 546,
    layout = "desktop",
    spineX = MOBILE_BOARD.spineX,
  } = options;

  if (layout === "mobile") {
    const channel = spineX + offset;
    return dedupePoints([
      { x: from.x, y: from.y + from.h / 2 },
      { x: channel, y: from.y + from.h / 2 },
      { x: channel, y: to.y + to.h / 2 },
      { x: to.x, y: to.y + to.h / 2 },
    ]);
  }

  const forward = to.x >= from.x;
  const exitX = forward ? from.x + from.w : from.x;
  const entryX = forward ? to.x : to.x + to.w;
  const exitY = from.y + from.h / 2;
  const entryY = to.y + to.h / 2;
  const direction = forward ? 1 : -1;
  const columnSpan = Math.abs((to.column ?? 0) - (from.column ?? 0));

  if (columnSpan === 0) {
    // Same district: leave and re-enter on the same side through a side channel.
    const channel = Math.max(from.x + from.w, to.x + to.w) + 26 + offset;
    return dedupePoints([
      { x: from.x + from.w, y: exitY },
      { x: channel, y: exitY },
      { x: channel, y: entryY },
      { x: to.x + to.w, y: entryY },
    ]);
  }

  if (columnSpan >= 2) {
    const bus = exitY < (topBus + bottomBus) / 2 ? topBus : bottomBus;
    const stub = 24 + Math.abs(offset);
    return dedupePoints([
      { x: exitX, y: exitY },
      { x: exitX + direction * stub, y: exitY },
      { x: exitX + direction * stub, y: bus + offset },
      { x: entryX - direction * stub, y: bus + offset },
      { x: entryX - direction * stub, y: entryY },
      { x: entryX, y: entryY },
    ]);
  }

  if (Math.abs(exitY - entryY) < 0.5) {
    return dedupePoints([
      { x: exitX, y: exitY },
      { x: entryX, y: entryY },
    ]);
  }

  const middle = (exitX + entryX) / 2 + offset;
  return dedupePoints([
    { x: exitX, y: exitY },
    { x: middle, y: exitY },
    { x: middle, y: entryY },
    { x: entryX, y: entryY },
  ]);
}

/**
 * Place every visible component on the board.
 *
 * Empty districts are skipped rather than left as gaps, so the column a chip
 * lands in is a function of which layers actually carry components.
 */
export function boardGeometry({ voices = [], externalNodes = [], layout = "desktop" } = {}) {
  const metrics = layout === "mobile" ? MOBILE_BOARD : DESKTOP_BOARD;
  const buckets = TRACE_BOARD_DISTRICTS.map(() => []);

  for (const voice of voices) {
    if (!voice?.name) continue;
    buckets[districtIndexForLayer(voice.layer)].push({
      name: voice.name,
      measured: Boolean(voice.measured),
      external: false,
    });
  }
  for (const name of externalNodes) {
    if (!name) continue;
    buckets[BOUNDARY_INDEX].push({ name, measured: false, external: true });
  }
  for (const bucket of buckets) {
    bucket.sort((left, right) => left.name.localeCompare(right.name));
  }

  const chips = new Map();
  const districts = [];

  if (layout === "mobile") {
    let cursor = metrics.y0;
    let column = 0;
    buckets.forEach((bucket, index) => {
      if (!bucket.length) return;
      const band = {
        id: TRACE_BOARD_DISTRICTS[index].id,
        label: TRACE_BOARD_DISTRICTS[index].label,
        column,
        x: metrics.spineX,
        y: cursor,
        count: bucket.length,
        measured: bucket.filter((entry) => entry.measured).length,
      };
      cursor += metrics.bandH;
      bucket.forEach((entry, row) => {
        chips.set(entry.name, {
          x: metrics.chipX,
          y: cursor,
          w: metrics.chipW,
          h: metrics.chipH,
          column,
          row,
          external: entry.external,
          districtId: band.id,
        });
        cursor += metrics.rowH;
      });
      band.height = cursor - band.y;
      districts.push(band);
      cursor += 12;
      column += 1;
    });
    return {
      layout: "mobile",
      width: metrics.width,
      height: cursor + metrics.gutter,
      spineX: metrics.spineX,
      districts,
      chips,
      topBus: 0,
      bottomBus: cursor,
    };
  }

  // Let the deepest district set the row count, so the board stays as narrow
  // as the district count allows and only grows past the cap sideways.
  const deepest = buckets.reduce((most, bucket) => Math.max(most, bucket.length), 0);
  const rowsPerColumn = Math.min(
    metrics.rowCap,
    Math.max(metrics.minRows, deepest),
  );

  let maxRows = 0;
  let column = 0;
  buckets.forEach((bucket, index) => {
    if (!bucket.length) return;
    // Spread an over-cap district over as few columns as will hold it,
    // balanced so the last column is not left with a single stranded chip.
    const span = Math.max(1, Math.ceil(bucket.length / rowsPerColumn));
    const perColumn = Math.ceil(bucket.length / span);
    const x = metrics.originX + column * metrics.colPitch;

    bucket.forEach((entry, position) => {
      const localColumn = Math.floor(position / perColumn);
      const row = position % perColumn;
      maxRows = Math.max(maxRows, row + 1);
      chips.set(entry.name, {
        x: metrics.originX + (column + localColumn) * metrics.colPitch,
        y: metrics.y0 + row * metrics.rowH,
        w: metrics.chipW,
        h: metrics.chipH,
        column: column + localColumn,
        row,
        external: entry.external,
        districtId: TRACE_BOARD_DISTRICTS[index].id,
      });
    });

    districts.push({
      id: TRACE_BOARD_DISTRICTS[index].id,
      label: TRACE_BOARD_DISTRICTS[index].label,
      column,
      span,
      x,
      y: metrics.y0 - metrics.labelOffset,
      width: metrics.chipW + (span - 1) * metrics.colPitch,
      height: perColumn * metrics.rowH,
      count: bucket.length,
      measured: bucket.filter((entry) => entry.measured).length,
    });
    column += span;
  });

  const height = Math.max(
    metrics.minHeight,
    metrics.y0 + maxRows * metrics.rowH + metrics.gutter,
  );

  return {
    layout: "desktop",
    width: Math.max(metrics.width, column * metrics.colPitch + 60),
    height,
    spineX: 0,
    districts,
    chips,
    topBus: metrics.y0 - metrics.busInset,
    bottomBus: height - metrics.busInset - 12,
  };
}

/**
 * Per-target offsets so several traces landing on the same chip stay
 * individually readable instead of overprinting each other.
 */
export function routeOffsets(edges = [], step = 12) {
  const byTarget = new Map();
  for (const edge of edges) {
    if (!byTarget.has(edge.to)) byTarget.set(edge.to, []);
    byTarget.get(edge.to).push(edge);
  }
  const offsets = new Map();
  for (const group of byTarget.values()) {
    group.forEach((edge, index) => {
      offsets.set(`${edge.from} ${edge.to}`, (index - (group.length - 1) / 2) * step);
    });
  }
  return offsets;
}
