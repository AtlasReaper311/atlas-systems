import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCityLayout,
  rectanglesOverlap,
  routeIsOrthogonal,
} from "../system-map-layout.js";

function sourceRepository(index) {
  return {
    id: `atlas-source-${String(index).padStart(2, "0")}`,
    role: "repo",
    kind: "repository",
    sourceOnly: true,
    layer: index % 2 ? "observability" : "reusable-kit",
  };
}

test("district rectangles never overlap", () => {
  const nodes = Array.from({ length: 60 }, (_, index) =>
    sourceRepository(index),
  );

  const layout = buildCityLayout(nodes);

  for (let left = 0; left < layout.districts.length; left += 1) {
    for (
      let right = left + 1;
      right < layout.districts.length;
      right += 1
    ) {
      assert.equal(
        rectanglesOverlap(
          layout.districts[left],
          layout.districts[right],
        ),
        false,
      );
    }
  }
});

test("stress layout gives every node a unique in-district slot", () => {
  const nodes = [
    ...Array.from({ length: 50 }, (_, index) =>
      sourceRepository(index),
    ),
    {
      id: "atlas-api-public",
      role: "worker",
      kind: "worker",
      layer: "public-api",
    },
    {
      id: "atlas-systems",
      role: "site",
      kind: "site",
      layer: "surface",
    },
    {
      id: "specular-edge",
      role: "worker",
      kind: "worker",
      layer: "edge",
    },
  ];

  const layout = buildCityLayout(nodes);
  const positions = new Set();
  const districtByKey = new Map(
    layout.districts.map((district) => [
      district.key,
      district,
    ]),
  );

  for (const node of layout.nodes) {
    const key = `${node.x}|${node.y}`;
    assert.equal(positions.has(key), false);
    positions.add(key);

    const district = districtByKey.get(node.district);
    assert.ok(node.x > district.x);
    assert.ok(node.x < district.x + district.w);
    assert.ok(node.y > district.y);
    assert.ok(node.y < district.y + district.h);
  }
});

test("source-only repositories always enter the source quarter", () => {
  const layout = buildCityLayout([
    sourceRepository(1),
    sourceRepository(2),
  ]);

  assert.deepEqual(
    layout.nodes.map((node) => node.district),
    ["source", "source"],
  );
});

test("explicit runtime districts populate edge works without moving source", () => {
  const layout = buildCityLayout([
    {
      id: "ramone-edge",
      role: "worker",
      kind: "worker",
      layer: "local-ai",
      district: "edge",
    },
    {
      id: "specular-edge",
      role: "local",
      kind: "local-service",
      layer: "edge",
      district: "edge",
    },
    {
      ...sourceRepository(1),
      district: "edge",
    },
  ]);
  const districtById = Object.fromEntries(
    layout.nodes.map((node) => [node.id, node.district]),
  );

  assert.equal(districtById["ramone-edge"], "edge");
  assert.equal(districtById["specular-edge"], "edge");
  assert.equal(districtById["atlas-source-01"], "source");
});

test("shared district corridors receive stable separate lanes", () => {
  const nodes = [
    {
      id: "api-a",
      role: "worker",
      kind: "worker",
      layer: "public-api",
    },
    {
      id: "api-b",
      role: "worker",
      kind: "worker",
      layer: "public-api",
    },
    {
      id: "site-a",
      role: "site",
      kind: "site",
    },
    {
      id: "site-b",
      role: "site",
      kind: "site",
    },
  ];
  const edges = [
    { from: "api-a", to: "site-a", kind: "http" },
    { from: "api-a", to: "site-b", kind: "poll" },
    { from: "api-b", to: "site-a", kind: "probe" },
    { from: "api-b", to: "site-b", kind: "http" },
  ];
  const forward = buildCityLayout(nodes, edges);
  const reversed = buildCityLayout(nodes, [...edges].reverse());
  const routeByKey = (layout) =>
    Object.fromEntries(
      layout.edges.map((edge) => [
        `${edge.from}|${edge.to}|${edge.kind}`,
        edge.route,
      ]),
    );

  assert.deepEqual(
    forward.edges.map((edge) => edge.laneIndex).sort((a, b) => a - b),
    [0, 1, 2, 3],
  );
  assert.ok(forward.edges.every((edge) => edge.laneCount === 4));
  assert.equal(
    new Set(forward.edges.map((edge) => JSON.stringify(edge.route))).size,
    4,
  );
  assert.deepEqual(routeByKey(forward), routeByKey(reversed));
});

test("edge routes are orthogonal and terminate at their nodes", () => {
  const layout = buildCityLayout(
    [
      {
        id: "atlas-api-public",
        role: "worker",
        kind: "worker",
        layer: "public-api",
      },
      {
        id: "atlas-systems",
        role: "site",
        kind: "site",
        layer: "surface",
      },
      sourceRepository(1),
    ],
    [
      {
        from: "atlas-api-public",
        to: "atlas-systems",
        kind: "http",
      },
      {
        from: "atlas-source-01",
        to: "atlas-api-public",
        kind: "poll",
      },
    ],
  );

  const nodeById = new Map(
    layout.nodes.map((node) => [node.id, node]),
  );

  for (const edge of layout.edges) {
    assert.equal(routeIsOrthogonal(edge.route), true);

    const first = edge.route[0];
    const last = edge.route[edge.route.length - 1];
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);

    assert.deepEqual(first, { x: from.x, y: from.y });
    assert.deepEqual(last, { x: to.x, y: to.y });
  }
});
