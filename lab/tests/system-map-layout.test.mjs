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
      role: "local",
      kind: "local-service",
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
