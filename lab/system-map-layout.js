const BOARD_MARGIN = 40;
const DISTRICT_GAP = 28;
const HEADER_HEIGHT = 42;
const CELL_HEIGHT = 72;
const ROUTE_LANE_GAP = 10;

export const DISTRICT_SPECS = [
  {
    key: "surface",
    label: "surface ward",
    row: 0,
    width: 300,
    minHeight: 196,
    cellWidth: 118,
    accent: "#e8935c",
  },
  {
    key: "publicApi",
    label: "control plaza",
    row: 0,
    width: 360,
    minHeight: 196,
    cellWidth: 112,
    accent: "#4ade80",
  },
  {
    key: "source",
    label: "source quarter",
    row: 0,
    width: 560,
    minHeight: 244,
    cellWidth: 126,
    accent: "#f5a623",
  },
  {
    key: "observability",
    label: "ops yard",
    row: 1,
    width: 420,
    minHeight: 244,
    cellWidth: 116,
    accent: "#f5a623",
  },
  {
    key: "edge",
    label: "edge works",
    row: 1,
    width: 340,
    minHeight: 244,
    cellWidth: 110,
    accent: "#f5a623",
  },
  {
    key: "local",
    label: "local valley",
    row: 1,
    width: 460,
    minHeight: 244,
    cellWidth: 124,
    accent: "#48b9dc",
  },
  {
    key: "external",
    label: "outer links",
    row: 2,
    width: 320,
    minHeight: 158,
    cellWidth: 120,
    accent: "#8a8a93",
  },
];

export const DISTRICT_ORDER = DISTRICT_SPECS.map((district) => district.key);

const ROLE_PRIORITY = {
  worker: 0,
  site: 1,
  local: 2,
  infra: 3,
  ext: 4,
  repo: 5,
};

export function normaliseRole(raw) {
  if (
    raw.sourceOnly === true ||
    raw.source_only === true ||
    raw.kind === "repository"
  ) {
    return "repo";
  }

  if (raw.role === "site") return "site";
  if (raw.role === "local") return "local";
  if (raw.role === "ext") return "ext";
  if (raw.role === "infra") return "infra";

  return "worker";
}

export function districtForNode(node) {
  if (node.sourceOnly || node.kind === "repository" || node.role === "repo") {
    return "source";
  }

  if (DISTRICT_ORDER.includes(node.district)) return node.district;

  if (node.role === "site") return "surface";
  if (node.role === "local") return "local";
  if (node.role === "ext") return "external";
  if (node.layer === "public-api") return "publicApi";
  if (node.layer === "observability") return "observability";
  if (node.layer === "edge") return "edge";
  if (node.layer === "infra") return "observability";

  return "publicApi";
}

export function normaliseNode(raw) {
  const sourceOnly =
    raw.sourceOnly === true ||
    raw.source_only === true ||
    raw.kind === "repository";

  const node = {
    ...raw,
    id: raw.id || raw.name,
    label: raw.label || raw.id || raw.name || "unknown",
    role: normaliseRole(raw),
    status: raw.status || (sourceOnly ? "static" : "unknown"),
    kind: raw.kind || (sourceOnly ? "repository" : "worker"),
    layer: raw.layer || "",
    sourceOnly,
    repo: raw.repo || null,
    publicSurface: raw.public_surface || raw.publicSurface || null,
    description: raw.description || raw.blurb || raw.notes || "",
    language: raw.language || null,
    topics: Array.isArray(raw.topics) ? raw.topics.slice() : [],
  };

  node.district = districtForNode(node);
  return node;
}

function nodeSort(a, b) {
  const roleDifference =
    (ROLE_PRIORITY[a.role] ?? 99) - (ROLE_PRIORITY[b.role] ?? 99);

  if (roleDifference !== 0) return roleDifference;

  const layerDifference = String(a.layer).localeCompare(String(b.layer));

  if (layerDifference !== 0) return layerDifference;

  return String(a.id).localeCompare(String(b.id));
}

function groupByDistrict(nodes) {
  const grouped = Object.fromEntries(
    DISTRICT_ORDER.map((key) => [key, []]),
  );

  for (const node of nodes) {
    const key = grouped[node.district] ? node.district : "publicApi";
    grouped[key].push(node);
  }

  for (const members of Object.values(grouped)) {
    members.sort(nodeSort);
  }

  return grouped;
}

function districtMetrics(spec, count) {
  const innerWidth = spec.width - 40;
  const cols = Math.max(1, Math.floor(innerWidth / spec.cellWidth));
  const rows = Math.max(1, Math.ceil(count / cols));
  const height = Math.max(
    spec.minHeight,
    HEADER_HEIGHT + rows * CELL_HEIGHT + 24,
  );

  return {
    ...spec,
    cols,
    rows,
    height,
  };
}

function placeDistrictRows(grouped) {
  const metrics = DISTRICT_SPECS.map((spec) =>
    districtMetrics(spec, grouped[spec.key].length),
  );

  const byRow = new Map();

  for (const district of metrics) {
    if (!byRow.has(district.row)) byRow.set(district.row, []);
    byRow.get(district.row).push(district);
  }

  const rowHeights = new Map();

  for (const [row, districts] of byRow.entries()) {
    rowHeights.set(
      row,
      Math.max(...districts.map((district) => district.height)),
    );
  }

  const rowY = new Map();
  let nextY = BOARD_MARGIN;

  for (const row of [...byRow.keys()].sort((a, b) => a - b)) {
    rowY.set(row, nextY);
    nextY += rowHeights.get(row) + DISTRICT_GAP;
  }

  const placed = [];

  for (const [row, districts] of [...byRow.entries()].sort(
    ([a], [b]) => a - b,
  )) {
    let x = BOARD_MARGIN;

    for (const district of districts) {
      placed.push({
        ...district,
        x,
        y: rowY.get(row),
        h: district.height,
        w: district.width,
        members: grouped[district.key],
      });
      x += district.width + DISTRICT_GAP;
    }
  }

  const firstTwoRows = placed.filter((district) => district.row < 2);
  const width =
    Math.max(
      ...firstTwoRows.map((district) => district.x + district.w),
      ...placed.map((district) => district.x + district.w),
    ) + BOARD_MARGIN;

  const height =
    Math.max(...placed.map((district) => district.y + district.h)) +
    BOARD_MARGIN;

  return {
    width,
    height,
    districts: placed,
  };
}

function placeNodes(districts) {
  const nodes = [];

  for (const district of districts) {
    const innerX = district.x + 20;
    const innerY = district.y + HEADER_HEIGHT;
    const innerWidth = district.w - 40;
    const cellWidth = innerWidth / district.cols;

    district.members.forEach((node, index) => {
      const col = index % district.cols;
      const row = Math.floor(index / district.cols);

      node.x = innerX + cellWidth * (col + 0.5);
      node.y = innerY + CELL_HEIGHT * (row + 0.5);
      node.cellWidth = cellWidth;
      node.cellHeight = CELL_HEIGHT;
      nodes.push(node);
    });
  }

  return nodes;
}

function facingGateway(fromDistrict, toDistrict) {
  const fromCenter = {
    x: fromDistrict.x + fromDistrict.w / 2,
    y: fromDistrict.y + fromDistrict.h / 2,
  };
  const toCenter = {
    x: toDistrict.x + toDistrict.w / 2,
    y: toDistrict.y + toDistrict.h / 2,
  };

  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? {
          side: "right",
          x: fromDistrict.x + fromDistrict.w,
          y: fromCenter.y,
        }
      : {
          side: "left",
          x: fromDistrict.x,
          y: fromCenter.y,
        };
  }

  return dy > 0
    ? {
        side: "bottom",
        x: fromCenter.x,
        y: fromDistrict.y + fromDistrict.h,
      }
    : {
        side: "top",
        x: fromCenter.x,
        y: fromDistrict.y,
      };
}

function edgeSortKey(edge) {
  return [
    edge.from,
    edge.to,
    edge.kind || "http",
    edge.label || "",
  ].join("|");
}

function routeGroupKey(edge, nodeById) {
  const from = nodeById.get(edge.from);
  const to = nodeById.get(edge.to);

  if (from.district === to.district) {
    return `inside:${from.district}`;
  }

  return `between:${[from.district, to.district].sort().join("|")}`;
}

function assignRouteLanes(edges, nodeById) {
  const groups = new Map();

  for (const edge of [...edges].sort((left, right) =>
    edgeSortKey(left).localeCompare(edgeSortKey(right)),
  )) {
    const key = routeGroupKey(edge, nodeById);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(edge);
  }

  const assignments = new Map();

  for (const members of groups.values()) {
    members.forEach((edge, index) => {
      assignments.set(edge, {
        index,
        count: members.length,
      });
    });
  }

  return assignments;
}

function centeredLaneOffset(index, count, gap = ROUTE_LANE_GAP) {
  if (count <= 1) return 0;
  return (index - (count - 1) / 2) * gap;
}

function gatewayLaneOffset(fromGateway, toGateway, index, count) {
  if (count <= 1) return 0;

  const available = Math.max(
    0,
    Math.min(
      fromGateway.side === "left" || fromGateway.side === "right"
        ? fromGateway.district.h / 2 - 30
        : fromGateway.district.w / 2 - 30,
      toGateway.side === "left" || toGateway.side === "right"
        ? toGateway.district.h / 2 - 30
        : toGateway.district.w / 2 - 30,
    ),
  );
  const gap = Math.min(
    ROUTE_LANE_GAP,
    (available * 2) / (count - 1),
  );

  return centeredLaneOffset(index, count, gap);
}

function offsetGateway(gateway, offset) {
  if (gateway.side === "left" || gateway.side === "right") {
    return { ...gateway, y: gateway.y + offset };
  }

  return { ...gateway, x: gateway.x + offset };
}

function compactPoints(points) {
  const compact = [];

  for (const point of points) {
    const previous = compact[compact.length - 1];

    if (!previous || previous.x !== point.x || previous.y !== point.y) {
      compact.push(point);
    }
  }

  return compact;
}

function routeSameDistrict(from, to, district, lane) {
  const offset = centeredLaneOffset(lane.index, lane.count, 8);
  const preferredY = (from.y + to.y) / 2 + offset;
  const minimumY = district.y + HEADER_HEIGHT + 12;
  const maximumY = district.y + district.h - 12;
  const bendY = Math.max(minimumY, Math.min(maximumY, preferredY));

  return compactPoints([
    { x: from.x, y: from.y },
    { x: from.x, y: bendY },
    { x: to.x, y: bendY },
    { x: to.x, y: to.y },
  ]);
}

function routeCrossDistrict(
  from,
  to,
  fromDistrict,
  toDistrict,
  lane,
) {
  const baseFromGate = {
    ...facingGateway(fromDistrict, toDistrict),
    district: fromDistrict,
  };
  const baseToGate = {
    ...facingGateway(toDistrict, fromDistrict),
    district: toDistrict,
  };
  const offset = gatewayLaneOffset(
    baseFromGate,
    baseToGate,
    lane.index,
    lane.count,
  );
  const fromGate = offsetGateway(baseFromGate, offset);
  const toGate = offsetGateway(baseToGate, offset);
  const points = [{ x: from.x, y: from.y }];

  if (fromGate.side === "left" || fromGate.side === "right") {
    points.push({ x: fromGate.x, y: from.y });
  } else {
    points.push({ x: from.x, y: fromGate.y });
  }

  points.push({ x: fromGate.x, y: fromGate.y });

  const verticalTravel =
    fromGate.side === "top" ||
    fromGate.side === "bottom" ||
    toGate.side === "top" ||
    toGate.side === "bottom";

  if (verticalTravel) {
    const corridorY = (fromGate.y + toGate.y) / 2 + offset;
    points.push({ x: fromGate.x, y: corridorY });
    points.push({ x: toGate.x, y: corridorY });
  } else {
    const corridorX = (fromGate.x + toGate.x) / 2 + offset;
    points.push({ x: corridorX, y: fromGate.y });
    points.push({ x: corridorX, y: toGate.y });
  }

  points.push({ x: toGate.x, y: toGate.y });

  if (toGate.side === "left" || toGate.side === "right") {
    points.push({ x: toGate.x, y: to.y });
  } else {
    points.push({ x: to.x, y: toGate.y });
  }

  points.push({ x: to.x, y: to.y });

  return compactPoints(points);
}

function routeEdges(rawEdges, nodes, districts) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const districtByKey = new Map(
    districts.map((district) => [district.key, district]),
  );

  const visibleEdges = rawEdges.filter(
    (edge) => nodeById.has(edge.from) && nodeById.has(edge.to),
  );
  const lanes = assignRouteLanes(visibleEdges, nodeById);

  return visibleEdges
    .map((edge) => {
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      const fromDistrict = districtByKey.get(from.district);
      const toDistrict = districtByKey.get(to.district);
      const lane = lanes.get(edge) || { index: 0, count: 1 };
      const route =
        from.district === to.district
          ? routeSameDistrict(from, to, fromDistrict, lane)
          : routeCrossDistrict(
              from,
              to,
              fromDistrict,
              toDistrict,
              lane,
            );

      return {
        ...edge,
        kind: edge.kind || "http",
        laneIndex: lane.index,
        laneCount: lane.count,
        route,
      };
    });
}

function placeKv(rawKv, nodes) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const countByParent = new Map();

  return rawKv
    .filter((entry) => nodeById.has(entry.parent))
    .map((entry) => {
      const parent = nodeById.get(entry.parent);
      const count = countByParent.get(entry.parent) || 0;
      countByParent.set(entry.parent, count + 1);
      const side = count % 2 === 0 ? -1 : 1;
      const ring = Math.floor(count / 2);
      const x = parent.x + side * (24 + ring * 14);
      const y = parent.y - 28 - ring * 14;

      return {
        ...entry,
        id: entry.id || entry.label,
        x,
        y,
        route: [
          { x: parent.x, y: parent.y },
          { x: parent.x, y },
          { x, y },
        ],
      };
    });
}

export function buildCityLayout(
  rawNodes,
  rawEdges = [],
  rawKv = [],
) {
  const nodes = rawNodes
    .filter((node) => node && (node.id || node.name))
    .map(normaliseNode);

  const grouped = groupByDistrict(nodes);
  const board = placeDistrictRows(grouped);
  const placedNodes = placeNodes(board.districts);
  const edges = routeEdges(rawEdges, placedNodes, board.districts);
  const kv = placeKv(rawKv, placedNodes);

  return {
    width: board.width,
    height: board.height,
    nodes: placedNodes,
    edges,
    kv,
    districts: board.districts,
  };
}

export function rectanglesOverlap(a, b, gap = 0) {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

export function routeIsOrthogonal(route) {
  return route.every((point, index) => {
    if (index === 0) return true;
    const previous = route[index - 1];
    return previous.x === point.x || previous.y === point.y;
  });
}
