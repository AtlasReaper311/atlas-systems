import assert from "node:assert/strict";
import test from "node:test";

import {
  defineAtlasFieldConsumer,
  mountAtlasFieldConsumer,
} from "../../static/js/atlas-field-consumer.js";

class FakeElement {}
globalThis.Element = FakeElement;

function createHost() {
  const classes = new Set();
  const canvas = { nodeName: "CANVAS" };
  return Object.assign(new FakeElement(), {
    dataset: {},
    classList: { add: (...values) => values.forEach((value) => classes.add(value)) },
    querySelector: (selector) => selector.includes("canvas.atlas-field-canvas") ? canvas : null,
    classes,
    canvas,
  });
}

test("consumer definitions validate and freeze their contract", () => {
  const definition = defineAtlasFieldConsumer({
    selector: "[data-field]",
    preset: "ambient",
    stateKey: "atlasExampleState",
    hostClasses: ["example-field"],
    options: {
      density: { min: 10, max: 20 },
      pointer: { enabled: false },
      domainStyles: ["rgba(1, 2, 3, .1)"],
    },
  });

  assert.equal(definition.selector, "[data-field]");
  assert.equal(definition.preset, "ambient");
  assert.equal(definition.options.preset, "ambient");
  assert.ok(definition.hostClasses.includes("atlas-field-surface"));
  assert.ok(definition.hostClasses.includes("atlas-field-surface--ambient"));
  assert.ok(Object.isFrozen(definition));
  assert.ok(Object.isFrozen(definition.options));
  assert.ok(Object.isFrozen(definition.options.density));
  assert.ok(Object.isFrozen(definition.options.domainStyles));
  assert.throws(() => defineAtlasFieldConsumer({ preset: "card" }), /selector/);
  assert.throws(
    () => defineAtlasFieldConsumer({ selector: "main", preset: "unknown" }),
    /Unknown AtlasField consumer preset/,
  );
});

test("mounting records state, classes and remains idempotent", () => {
  const host = createHost();
  const root = { querySelector: () => host };
  const definition = defineAtlasFieldConsumer({
    selector: "[data-field]",
    preset: "card",
    hostClasses: ["example-card-field"],
  });
  let factoryCalls = 0;
  const controller = { pause() {} };
  const factory = () => {
    factoryCalls += 1;
    return controller;
  };

  assert.equal(mountAtlasFieldConsumer(definition, root, factory), controller);
  assert.equal(host.dataset.atlasFieldState, "ready");
  assert.ok(host.classes.has("atlas-field-surface"));
  assert.ok(host.classes.has("atlas-field-surface--card"));
  assert.ok(host.classes.has("example-card-field"));
  assert.equal(mountAtlasFieldConsumer(definition, root, factory), host.canvas);
  assert.equal(factoryCalls, 1);
});

test("mounting records unavailable state when the renderer cannot start", () => {
  const host = createHost();
  const root = { querySelector: () => host };
  const definition = defineAtlasFieldConsumer({ selector: "main", preset: "ambient" });

  assert.equal(mountAtlasFieldConsumer(definition, root, () => null), null);
  assert.equal(host.dataset.atlasFieldState, "unavailable");
});
