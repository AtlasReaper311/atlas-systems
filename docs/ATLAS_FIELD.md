# AtlasField consumer contract

`AtlasField` is the shared generative field primitive used by the Atlas Systems homepage and selected Lab surfaces. The renderer owns simulation, adaptive particle budgets, pointer response, reduced-motion behaviour, visibility pausing and one-instance-per-host lifecycle. Consumers own composition, contrast and readability.

## Public modules

- `/static/js/atlas-field.js` exports the renderer, presets and pure helpers.
- `/static/js/atlas-field-consumer.js` exports the declarative consumer layer.
- `/static/css/atlas-field-consumer.css` provides neutral surface layering.

## Presets

- `hero`: high-density interactive field for a primary page hero.
- `ambient`: low-contrast, non-interactive atmosphere behind content.
- `card`: bounded, non-interactive treatment for a contained surface.

A preset is a performance and behaviour baseline, not a finished visual composition. Each surface must still define local opacity, masks, gradients and content protection.

## Directory header compositions

The Work, Writing and Systems directory headers share one formatting contract while keeping distinct visual identities:

- `topology-current` on `/systems/`: horizontally stretched cyan and green flow, sparse amber routing accents, node points and route traces;
- `build-fragments` on `/work/`: clipped amber-led fragments, grid alignment and short assembly-like traces;
- `editorial-drift` on `/writing/`: sparse warm strands, diagonal drift and faint ruled structure.

All three use the `ambient` preset. Their differences come from seed, density, domain colours, light behaviour, masks, transforms and decorative CSS. New header identities should extend this composition layer rather than adding a renderer preset for every page.

The shared header contract normalises:

- eyebrow treatment;
- title family, scale and line height;
- supporting-copy width, size and line height;
- vertical rhythm and minimum height;
- mobile behaviour;
- reduced-motion behaviour.

A composition may change atmosphere and silhouette. It must not change heading semantics, hide essential information, or use decorative colour as evidence of live status.

## Declaring a consumer

```js
import {
  defineAtlasFieldConsumer,
  mountAtlasFieldConsumer,
} from "/static/js/atlas-field-consumer.js?v=<asset-version>";

export const EXAMPLE_FIELD = defineAtlasFieldConsumer({
  selector: "[data-example-field]",
  preset: "ambient",
  stateKey: "atlasExampleFieldState",
  hostClasses: ["example-atlas-field"],
  errorLabel: "Example AtlasField",
  options: {
    seed: "atlas-example-field-v1",
    pointer: { enabled: false },
  },
});

mountAtlasFieldConsumer(EXAMPLE_FIELD);
```

The helper validates the selector and preset, freezes nested option groups, applies `atlas-field-surface` plus a preset class, records `ready` or `unavailable` state, and returns the existing canvas on repeated mounting.

## Lifecycle and accessibility

The renderer creates a decorative canvas with `aria-hidden="true"` and `role="presentation"`. It pauses while off-screen or while the document is hidden, renders a static frame for reduced-motion users, and returns the same controller for repeated calls on one host.

Consumers must not place essential information in the field. Text, status, navigation and diagrams remain ordinary DOM content above it.

## CSS ownership

The shared stylesheet owns only:

- positioning and clipping;
- canvas layering and pointer transparency;
- content stacking;
- screen blending for ambient and card surfaces;
- reduced-motion transition suppression.

Local consumer CSS owns:

- opacity and colour treatment;
- masks and focal placement;
- readability veils;
- backing plates for diagrams or controls;
- responsive adjustments.

This split prevents a reusable primitive from forcing identical composition across unrelated pages.

## Asset versioning

Every changed browser entrypoint must receive a fresh query-string identity. Version the consumer module, its stylesheet, and any page or shell that imports them. Do not rely on a page-level query parameter to invalidate nested modules.

Current mutable field assets are also served with `Cache-Control: no-store, max-age=0` in `_headers`.

## Verification

A new consumer must include:

1. a repository test that bounds its selector and preset;
2. a browser smoke that brings the host into view;
3. exactly one canvas assertion;
4. non-zero CSS and bitmap dimensions;
5. animated frame advancement or a reduced-motion static frame;
6. visible-pixel sampling at a surface-appropriate threshold;
7. no AtlasField console or page errors.

A mounted canvas is not sufficient evidence. The rendered pixels must be visible.
