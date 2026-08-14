# Spectral Field ferrosphere — local handoff for Codex

This file is **uncommitted** and **local-only**. It is not on PR #240. Do not merge, push, or deploy from this pass.

Give Codex this whole file (or the prompt section). The Atlas handoff above the prompt is context; the prompt is the instruction.

---

# Atlas Handoff

## Status

READY TO CONTINUE

## Handoff purpose

Transfer the Spectral Field **ferrosphere** art-direction prototype so another agent (Codex) can refine it locally. Bounded work: make `field-proto-ferrosphere.js` read as glossy ferrofluid like the owner’s studio reference, with cascade changing the whole body. Not a final shipped renderer. Not a merge. Not a deploy.

## Evidence basis

Externally observed:

- Worktree `/Users/atlasreaper/Personal/.worktrees/pr240` on `feat/atlas-audio-flagship-visual-v2`.
- HEAD `41cdf288d76fb23db44e5a72f5c8471c48767049` (`fix(forge): collapse to one Field renderer and repair first-viewport composition`).
- Branch tracks `origin/feat/atlas-audio-flagship-visual-v2`.
- Shipped renderer remains `spectral-field-compose-v4.js` via `visuals.js`.
- Uncommitted: `static/js/spectral-forge/prototypes/`, `lab/shared/prototypes/`, `lab/spectral-forge/index.html` (one script tag for `preview-switch.js`).

Conversation-observed:

- Owner rejected A/B/C, optical, trough-as-waveform, and thin lines on black.
- Owner chose liquid over metal, then rejected the trough: did not read as liquid, cascade invisible, felt like UI.
- Owner attached a studio ferrosphere photo (smooth left, dense spikes right, high gloss, light beige ground).
- A Canvas2D ferrosphere prototype exists; last measured ~84–85 rAF at 1440×900 DPR 2 with `visibilityState === "visible"`.
- No merge, deploy, or audio change. Tests were not re-run after prototype files were added.
- Local static server: `http://127.0.0.1:8791` (8790 may serve the wrong directory).

User-reported:

- Refine this and make it way better; ask all questions needed.
- Changes stay local.

Unknowns:

- Whether cascade stills are distinct enough after the last terminator punch.
- PR #240 CI / preview freshness vs this uncommitted prototype.
- Owner answer on WebGL vs Canvas2D.

## Scope

- Repository: `AtlasReaper311/atlas-systems`
- Worktree: `/Users/atlasreaper/Personal/.worktrees/pr240`
- Surface: Spectral Forge Field only (`/lab/spectral-forge/`)
- Workstream: uncommitted prototype `proto-ferrosphere`

## Current repository state

- Working branch `feat/atlas-audio-flagship-visual-v2`, HEAD `41cdf288d76fb23db44e5a72f5c8471c48767049`.
- PR #240 is draft and must not be merged. Uncommitted prototype work is **not** on that head.

## Completed and observed

- Branch head has the technical recovery: one Field renderer, cache/`_headers`, first-viewport composition, smoke script. Shipped artwork is still v4 spatial.
- Uncommitted prototype stack: swap harness, gallery, captures, ferrosphere module.
- `preview-switch.js` no-ops unless `?proto=` is set.

## Pending work

- Refine `field-proto-ferrosphere.js` until it reads as liquid and cascade rewrites the body.
- Recapture NORMAL vs CASCADE stills; assert `rafPerSecond > 10` before trusting motion.
- Ask the owner questions below before WebGL, stage-fill, or promoting to the shipped renderer.
- Do not merge, push, or deploy unless the owner later asks.

## Unverified or stale claims

- Opening-brief CI/preview claims were not re-checked after local prototype files.
- Ferrosphere is local-only; it is not on the PR preview.

## Validation and checks

- Playwright captures of ferrosphere NORMAL (~3 s) and CASCADE (~20 s) were run; last log ~85 rAF, renderer `proto-ferrosphere`.
- `lab/tests/*.test.mjs` and `scripts/smoke_spectral_forge_preview.mjs` were **not** re-run after prototype work.
- Do not judge motion if `document.visibilityState === "hidden"`.

## Action boundaries

### Local source

Approved: prototype files under `static/js/spectral-forge/prototypes/`. Do not replace `visuals.js` / `spectral-field-compose-v4.js` without a later owner decision.

### Git and GitHub

No commit, push, PR update, or merge. Do not merge PR #240.

### Workflow dispatch

None.

### External provider

None.

### Live rollout

Deferred. Do not deploy.

### Secrets and permissions

None. Playwright: `PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright"`.

## Failed attempts and hazards

- Centred circular forms in a **dark** void read as HUD. Light well is why black liquid can read; keep overlay type readable.
- Trough / side-elevation spikes read as a waveform. Do not go back to a 2D mountain-range silhouette.
- Optical bench and v4 traces read as telemetry. Do not draw `SIGNAL_CHANNELS` as coloured paths.
- Hidden tab freezes rAF.
- Port 8790 may serve the wrong root; this worktree was served on **8791**.
- Unary minus before `**` is a SyntaxError (`-((x) / y) ** 2`).
- Per-pixel allocations kill fps. Bound spike counts; reuse buffers.
- Canvas2D cones on a shaded disc will not match the reference mesh. Ask before WebGL.

## Owner decisions and approvals

Ask, do not guess:

1. Stay Canvas2D, or argue WebGL and wait for yes.
2. Keep the studio light well, or force a fully dark Atlas Field.
3. Full sphere as a specimen vs cropped full-bleed planet.
4. Cascade: spikes invade smooth side, sphere deforms, droplets shed — which are mandatory.
5. Selected route cue. No coloured traces.
6. Promote to shipped renderer later, or keep prototype-only. Default: prototype-only.
7. Overlay lockup vs light well contrast.

Rollout is not intended.

## Exact continuation point

Refine `static/js/spectral-forge/prototypes/field-proto-ferrosphere.js` locally. Preview: `http://127.0.0.1:8791/lab/spectral-forge/?proto=ferrosphere`.

## Work-allocation state

Not observed. Do not create an allocation entry for this local prototype pass.

## Completion criteria

- NORMAL reads as a ferrofluid body, not a UI widget or waveform.
- CASCADE is a damaged form of the same sphere, readable with audio muted.
- Same identity in PLAY (3:1), FORGE (near-square), ANALYSE.
- `rafPerSecond > 10` in a visible tab; target 55–60 fps at 1440×900 DPR 2.
- Driven only by `deriveFieldGeometry` + `deterministicUnit`.
- Shipped v4 unchanged unless the owner later asks to promote.
- No merge, no deploy, no audio edits.

---

# Codex prompt

You are continuing Atlas Systems Spectral Field work. LOCAL SOURCE ONLY.

## Who / where

Owner: Atlas (software engineer). Repo: AtlasReaper311/atlas-systems.
Worktree (use this, not the main clone): `/Users/atlasreaper/Personal/.worktrees/pr240`
Branch: `feat/atlas-audio-flagship-visual-v2`
HEAD (committed): `41cdf288d76fb23db44e5a72f5c8471c48767049`
PR #240 is draft — do not merge, do not push unless asked, do not deploy.

Main clone `/Users/atlasreaper/Personal/atlas-systems` may be on another branch. Stay in the worktree.

## What you are doing

Refine the UNCOMMITTED ferrosphere prototype until it feels like the owner’s studio reference: a glossy black ferrofluid sphere, smooth on one side, dense sharp cones on the other, wet speculars, studio light. Make cascade obviously rewrite that same body.

This is still a prototype, not the shipped Field. Do not replace `visuals.js` / `spectral-field-compose-v4.js` unless Atlas later says “promote this.”

Primary file:

- `static/js/spectral-forge/prototypes/field-proto-ferrosphere.js`

Allowed to touch (local, uncommitted):

- `static/js/spectral-forge/prototypes/proto-core.js`
- `static/js/spectral-forge/prototypes/preview-switch.js`
- `static/js/spectral-forge/prototypes/gallery.html`
- `static/js/spectral-forge/prototypes/captures/` (new stills)
- `lab/spectral-forge/index.html` (already has one preview-switch script tag; do not expand shipped behaviour)

Do not touch: audio engine, System Symphony, mapping/score, sonic identity, PR merge, production, Cloudflare, tests unless you break a shipped import (you should not).

## Reference

Owner reference photo (smooth left, spikes right, beige studio, high gloss):

- `/Users/atlasreaper/.cursor/projects/Users-atlasreaper-Personal-worktrees-pr240/assets/ferrofluid-204425b8-756e-4b83-961b-09ef00107af5.png`

Target: an engineer who hid the page title should not think this is a generic web-audio visualiser.

## How to run (local)

Port 8790 may be the wrong root. Serve the worktree:

```bash
python3 -m http.server 8791 --directory /Users/atlasreaper/Personal/.worktrees/pr240
```

Open:

- http://127.0.0.1:8791/lab/spectral-forge/?proto=ferrosphere
- http://127.0.0.1:8791/static/js/spectral-forge/prototypes/gallery.html

Playwright: `/Users/atlasreaper/Personal/atlas-systems/node_modules`

```bash
PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright"
```

Always assert `document.visibilityState === "visible"` and `rafPerSecond > 10` before judging motion. Hidden tabs freeze rAF.

Swap harness (if not using `?proto=`): patch `SpectralFieldRenderer.prototype.draw` to `field-proto-ferrosphere.js` `draw`.

Capture stills at 1440×900, `deviceScaleFactor` 2:

- `.forge-play .forge-field-stage`
- scenario index 0 = 01 NORMAL LOAD (~3s)
- scenario index 5 = 06 CASCADING FAILURE (~20s of PLAY)

## Hard technical rules

- Drive EVERY visual difference from `deriveFieldGeometry(state, visualTime, width, height)` in `static/js/spectral-forge/spectral-field-geometry.js`. Never `if (scenarioId === ...)`.
- No `Math.random()` per frame. Use `deterministicUnit` from `spectral-field-model.js`.
- Identical telemetry + mapping + time => identical pixels.
- Canvas2D is the medium. If you believe WebGL is required to match the photo, STOP and ask Atlas first. Justify vs architecture, 55–60 fps, accessibility, maintenance, determinism. Do not add a 3D library on your own.
- Performance: 55–60 fps at 1440×900 DPR 2. Bound spike count. Reuse arrays on the renderer instance. No per-pixel object allocation. DPR cap 2.
- `prefers-reduced-motion`: the host renderer already draws a static frame; do not break that.
- Same identity in PLAY (~3:1), FORGE (~square), ANALYSE (~wide). Not three artworks.
- Selected route = a region of the sphere (longitude gore / taller spikes / tip glints). NEVER five coloured `SIGNAL_CHANNELS` traces.
- Amber (`#f5a623`) only for selected route. No rainbow, no generic neon, no cyan-everything.
- Accessibility: do not break keyboard PLAY/FORGE/ANALYSE, canvas `aria-label`, or 390px overflow.

Current geometry → sphere mapping (improve if needed, keep deterministic):

- aperture / bodyStrength → smooth vs spiked fraction, volume
- displacement / emissionRate → spike length and density
- brilliance → specular hardness
- phaseDisagreement → lean / irregularity
- lateralSpread → slight oblate
- stretch / deformation / severity / fractureBias / signature.fracturePlane → squash, spike invasion of the smooth side, shed droplets
- selectedMapping via `routeBand()` in `proto-core.js` → gore + amber tips

## What already failed (do not repeat)

0. Shipped v4: wireframe + cyan/amber traces, 9 fps, reads as telemetry.
1. A crystalline shells: low-poly, centred, dead 3:1 margins.
2. B membrane: 8% coverage, glowing blob.
3. C aperture machine: sci-fi iris, “cheap.”
4. Optical bench: ray diagram / line chart; cascade got emptier (16%→7%).
5. Schlieren / cymatic / interference / milled section: sketches only; owner did not pick them as the object.
6. Liquid TROUGH (`field-proto-liquid.js`): owner said spikes do not read as liquid, cascade doesn’t show, feels like UI. Side-elevation mountain range = waveform. Do not revive it as the hero.

Recurring kills: horizontal traces; centred faint object in a black void; flat translucent polygons; narrow muddy hue; adding more elements instead of material; `SIGNAL_CHANNELS` as polylines.

## What “way better” means on THIS object

The current ferrosphere is a shaded ellipse plus Canvas2D cones in a studio light well. Owner wants it closer to the photo:

- Reads as viscous glossy liquid, not a sea-urchin sticker or a 2D icon.
- Smooth → mounds → cones → needles as a continuous surface, not a hard hat of triangles glued on.
- Specular: broad highlight on the smooth side; sharp glints on spike tips; valleys dark (AO).
- Indigo/violet only as a hint in the midtones, not a glow wash.
- NORMAL LOAD already beautiful and still, then breathing.
- CASCADE: the same sphere damaged — spikes eat the smooth hemisphere and/or the body deforms and sheds droplets. Must be obvious in a still, not only in motion.
- Studio plate is why black liquid reads. Do not put black spikes on a black canvas again.
- Keep white UI overlays readable (SPECTRAL FIELD, REQUEST RATE, “The mapping is moving”) — darken the well under the lockup or place the sphere so type is not on beige.
- 3:1: either a photographed specimen with studio void (intentional) or a closer crop. Do not leave black empty flanks around a tiny ball.

## Ask Atlas before you guess (do not silently pick)

1. Canvas2D polish vs WebGL displacement sphere — which are you willing to take? (Default until you answer: Canvas2D.)
2. Keep the light-well studio plate, or must the Field stay fully dark Atlas (`#0a0a0f`) even if liquid reads worse?
3. Full sphere as a specimen in the 3:1 plate, or cropped full-bleed (camera inside the sphere’s width)?
4. Cascade mandatory ingredients: (a) spikes invade smooth side, (b) sphere deforms, (c) droplets shed. Which are required vs optional?
5. Selected route: amber tip glints on a gore, a local “magnetic” patch of longer spikes, or something else? No traces.
6. How close to the photo’s beige cyclorama vs staying inside Atlas dark chrome?
7. Is overlay type allowed to sit on the artwork, or should the sphere leave a dark band bottom-left?
8. After this prototype is good, do you want it promoted to the shipped renderer, or keep `?proto=` only?

If a choice would take more than an hour and isn’t in the list above, ask.

## Process

1. Read `field-proto-ferrosphere.js`, `proto-core.js`, `spectral-field-geometry.js`, `preview-switch.js`. Do not “improve” by importing A/B/C/optical/trough code.
2. Ask any blocking questions first if you cannot proceed without 1–8.
3. Iterate locally. Measure fps and lit coverage; capture NORMAL 3s and CASCADE 20s into `prototypes/captures/ferrosphere-*.png`.
4. Leave a short note: what changed, fps, what still isn’t photo-real, what you need from Atlas.
5. Do not commit unless Atlas asks. Do not merge PR 240. Do not deploy.

Start by opening the live proto URL and the reference PNG, then improve the ferrosphere material and cascade, not the rest of Spectral Forge.
