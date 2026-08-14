# Spectral Field flagship organism handoff

Status: READY TO CONTINUE

This handoff transfers the local Spectral Forge flagship artwork prototype for another ChatGPT/Codex agent to continue. The chosen direction is **`flagship-organism`**: a living ferrofluid-like Atlas instrument that combines the liquid-organic movement of `living-organism` with the cleaner scientific staging of `specimen-core`.

Do not treat this as shipped. This is prototype-only source on a new PR branch. Do not merge, deploy, publish, or promote into `visuals.js` / `spectral-field-compose-v4.js` without a later explicit owner approval.

## Scope

- Repository: `AtlasReaper311/atlas-systems`
- Worktree used for this pass: `/Users/atlasreaper/Personal/.worktrees/pr240`
- Original base branch/worktree context: `feat/atlas-audio-flagship-visual-v2`
- Original observed HEAD before local prototype commit: `41cdf288d76fb23db44e5a72f5c8471c48767049`
- Surface: `/lab/spectral-forge/`
- Prototype URL: `http://127.0.0.1:8791/lab/spectral-forge/?proto=flagship-organism`
- Gallery URL: `http://127.0.0.1:8791/static/js/spectral-forge/prototypes/gallery.html`

## Evidence Basis

Externally observed:

- Local worktree was inspected directly.
- `lab/spectral-forge/index.html` has one prototype switcher script tag:
  `/static/js/spectral-forge/prototypes/preview-switch.js`
- The shipped renderer remains untouched in `static/js/spectral-forge/visuals.js` and `static/js/spectral-forge/spectral-field-compose-v4.js`.
- The prototype switcher no-ops unless a `?proto=` value is supplied.
- Captures were generated locally at `1440x900`, `deviceScaleFactor: 2`, targeting `.forge-play .forge-field-stage`.
- Playwright asserted `document.visibilityState === "visible"` and renderer IDs during captures.

Conversation-observed:

- Owner selected `flagship-organism` as the winner after comparing the bake-off.
- Owner wants promotion later, not now.
- Owner priorities for the next work are:
  1. make the organism feel more liquid and less triangular;
  2. make cascade more dramatic/repeated;
  3. add FORGE/ANALYSE side-inspector behaviour;
  4. make audio reactivity more obvious;
  5. then mobile/layout polish.
- Owner wants the inspector tone to be both poetic and exact: short art label plus telemetry/mapping facts.
- Owner said the route cue looks acceptable for now but must be judged after material polish.
- Owner wants the chosen object to look like ferrofluid now.
- Owner approved dependencies/WebGL exploration if needed for the project.

Unknown:

- Whether WebGL is now required to reach the final material quality. Canvas2D has been pushed but still reads stylized.
- Whether all CI checks pass on the pushed PR branch.
- Whether the eventual shipped renderer should reuse the prototype switcher architecture or replace the v4 renderer directly.
- Exact final side-inspector layout and copy.
- Exact final mobile composition.

## Current Prototype Stack

Primary chosen files:

- `static/js/spectral-forge/prototypes/field-proto-flagship-organism.js`
- `static/js/spectral-forge/prototypes/field-proto-organism-core.js`
- `static/js/spectral-forge/prototypes/preview-switch.js`
- `static/js/spectral-forge/prototypes/gallery.html`
- `static/js/spectral-forge/prototypes/capture-flagship-bakeoff.mjs`
- `static/js/spectral-forge/prototypes/captures/flagship-organism-normal-3s.png`
- `static/js/spectral-forge/prototypes/captures/flagship-organism-cascade-20s.png`

Comparison/provenance prototype files are kept so the next agent can see the decision trail:

- `field-proto-living-organism.js`
- `field-proto-specimen-core.js`
- `field-proto-signal-monolith.js`
- `field-proto-ferrosphere.js`
- older A/B/C, optical, schlieren, interference, cymatic, section, ferro, and liquid prototype files/captures.

## Chosen Direction

`flagship-organism` is the winner because it combines:

- `living-organism`: asymmetric liquid body, tidal motion, more organic pressure behaviour, route wound/ripple.
- `specimen-core`: cleaner studio staging, more legible field/inspection framing, less chaotic silhouette.

The target is not a literal sphere anymore. It is **ferrofluid-like living matter**: a premium, weird, elegant-brutalist Atlas Systems organism/instrument. PLAY should be pure art. FORGE and ANALYSE should explain cause/effect with a side inspector.

## Owner Decisions

- Promote later, not now.
- Same organism across PLAY / FORGE / ANALYSE.
- PLAY stays art-first and pure.
- FORGE / ANALYSE should expose the mapping through an inspector.
- The organism should be liquid-organic, not alien-mechanical.
- Restrained highlights are allowed: black/gloss/amber with deep violet/indigo/steel.
- Route selection should likely stay in the amber wound / pressure ripple family.
- Hover/focus explanations should be in a side inspector panel, not labels scattered over PLAY.
- The organism may be cropped huge.
- Cascade should repeat shocks as failure increases.
- Recovery/healing should happen when switching back to healthier scenarios, not necessarily within cascade itself.
- Audio-reactive movement should be prominent because this is an instrument, not just a decorative visualization.
- WebGL/Three.js exploration is approved if it is needed to reach the material quality.

## What Was Tried

Rejected or superseded:

- Shipped v4 wireframe/traces: reads as telemetry and was slow.
- A/B/C early concepts: crystal/membrane/aperture did not land as flagship art.
- Optical bench: too diagrammatic and cascade got emptier.
- Schlieren/cymatic/interference/milled section: still too sketch-like or UI-like.
- Ferrofluid trough/liquid side-elevation: read as waveform/UI.
- Original ferrosphere: closer, but too much “black ball with triangles”.
- Three-way bake-off:
  - `living-organism`: best emotional direction, but too chaotic/soft.
  - `specimen-core`: best balanced/performance/readability, but too calm.
  - `signal-monolith`: distinct/brutalist, but too slow/dark and less explanatory.
- First `flagship-organism` material pass added too many oval glossy marks and read as scales/coins, not ferrofluid. Those were pruned.

## Current Visual State

Current `flagship-organism`:

- Large asymmetric black glossy body on a studio light well.
- Reserved dark UI band on the left so overlay text remains readable.
- Subtle specimen-style inspection rings/crosshair inside the artwork.
- Amber route wound/ripple.
- Deterministic mound/cone field driven from `deriveFieldGeometry`.
- Cascade increases spike density and deformation, but still needs stronger repeated shock drama.

Current limitations:

- Still stylized Canvas2D.
- Some spikes can still read as flat triangular facets.
- Ferrofluid material needs a more continuous surface model.
- Audio reactivity exists through mapped geometry/time, but it does not yet visibly feel like an instrument responding to sound.
- FORGE/ANALYSE side inspector is not built yet.
- Mobile/390px overflow validation is not yet complete for the new direction.

## Validation

Local server:

```bash
python3 -m http.server 8791 --directory /Users/atlasreaper/Personal/.worktrees/pr240
```

Flagship capture command used a Playwright harness equivalent to `capture-flagship-bakeoff.mjs`.

Latest local flagship-only capture evidence:

- NORMAL, 1440x900 DPR2:
  - renderer: `proto-flagship-organism`
  - `document.visibilityState`: `visible`
  - `raf`: `48`
  - capture: `static/js/spectral-forge/prototypes/captures/flagship-organism-normal-3s.png`
- CASCADE, 1440x900 DPR2:
  - renderer: `proto-flagship-organism`
  - `document.visibilityState`: `visible`
  - `raf`: `44`
  - capture: `static/js/spectral-forge/prototypes/captures/flagship-organism-cascade-20s.png`

Earlier bake-off evidence after hybrid creation:

- `flagship-organism`: normal `46`, cascade `42`
- `living-organism`: normal `44`, cascade `40`
- `specimen-core`: normal `52`, cascade `50`
- `signal-monolith`: normal `34`, cascade `34`

No shipped tests were run after the latest material-only prototype pass. If this PR is prepared for review beyond prototype discussion, run the repository-native relevant checks.

## Determinism and Technical Rules

Keep these rules:

- Drive visual differences from `deriveFieldGeometry(state, visualTime, width, height)`.
- Do not branch directly on `scenarioId` inside the renderer.
- Do not use per-frame `Math.random()`.
- Use `deterministicUnit` through `unit()` from `proto-core.js`.
- Identical telemetry + mapping + time should produce identical pixels.
- Keep DPR capped at 2.
- Keep selected route as a region/wound/ripple, never five coloured signal traces.
- Amber `#f5a623` is reserved for selected route/exception accents.
- Do not touch audio engine, System Symphony, mapping/score, sonic identity, deployment, or production for this prototype work.

## Recommended Next Work

### 1. Material leap

Recommended path: prototype a WebGL-backed `flagship-organism` surface if Canvas2D cannot convincingly express ferrofluid.

Use existing local `lab/vendor/three/three.module.min.js` if possible. Avoid new dependencies unless there is a clear reason.

What the material needs:

- one continuous black liquid body;
- rounded mound bases that become cones;
- wet specular highlights on the body and tips;
- dark ambient-occlusion-like valleys;
- no pasted-on triangle stickers;
- no oval scale/coin marks;
- restrained indigo/violet midtone only.

Important architecture question:

- The existing shipped `SpectralFieldRenderer` owns a Canvas2D context. A WebGL prototype may need either:
  - a separate overlay canvas inside `.forge-field-stage`, or
  - a renderer replacement strategy that hides/reuses the existing canvas.
- Keep it prototype-only until promotion is explicitly approved.

### 2. Cascade drama

Make cascade feel like repeated impacts:

- shock pulses push through the body;
- spikes erupt in waves;
- body lurches/deforms, then partly stabilizes;
- droplets/shed material appear deterministically;
- still frame at 20s should clearly show damage, not merely more spikes.

Do not use `scenarioId`. Use severity/deformation/fracture/phase/telemetry-derived geometry.

### 3. Audio-reactive instrument behaviour

Make audio linkage visible:

- pulse rate should create visible rhythmic tide;
- displacement should change spike height/mound pressure;
- brilliance should sharpen highlights;
- afterimage/delay may create subtle material memory;
- route focus should visibly change a local region.

### 4. Side inspector

FORGE/ANALYSE should have a side inspector panel that updates on hover/focus.

Tone:

- poetic label first, e.g. `Pressure wound`, `Coherence skin`, `Fracture bloom`;
- exact telemetry/mapping below, e.g. source signal, normalized value, transform, target, output.

Do not clutter PLAY with explanatory labels.

### 5. Mobile/layout polish

After material and inspector:

- verify 390px width;
- ensure no overflow;
- preserve canvas `aria-label`;
- preserve keyboard PLAY/FORGE/ANALYSE controls;
- ensure overlay text remains readable over the art.

## Hazards

- Do not promote into shipped renderer in this PR unless Atlas explicitly says so.
- Do not push generated dependency folders such as `node_modules`.
- Do not include `lab/shared/prototypes/symphony-title-variants.css`; it is unrelated System Symphony work.
- Do not revive horizontal traces or SIGNAL_CHANNELS polylines.
- Do not make cascade visually emptier.
- Do not put black spikes on a black void without a studio plate or readable light model.
- Hidden tabs freeze `requestAnimationFrame`; always assert visible before judging motion.
- WebGL may be the right next step, but it must preserve accessibility, deterministic mapping, and the prototype boundary.

## Exact Continuation Point

Start from:

- `static/js/spectral-forge/prototypes/field-proto-flagship-organism.js`
- `static/js/spectral-forge/prototypes/field-proto-organism-core.js`
- `http://127.0.0.1:8791/lab/spectral-forge/?proto=flagship-organism`

First task for the next agent:

> Make `flagship-organism` look like a genuinely wet ferrofluid organism rather than a stylized Canvas2D body with attached triangular cones. If Canvas2D cannot reach that, build a prototype-only WebGL layer using existing local Three.js, preserving deterministic geometry and leaving shipped renderer files untouched.

## Completion Criteria For Next Pass

- Owner can identify the object as ferrofluid-like without reading the page title.
- Normal load is visibly alive and beautiful, not static.
- Cascade is obviously the same organism under repeated failure shocks.
- Route cue remains amber wound/ripple, not traces.
- PLAY remains art-first.
- FORGE/ANALYSE have a clear plan or implementation for side inspector explanation.
- Browser evidence includes visible rAF metrics and stills for normal/cascade.
- No merge, deploy, production rollout, or shipped renderer promotion unless separately approved.
