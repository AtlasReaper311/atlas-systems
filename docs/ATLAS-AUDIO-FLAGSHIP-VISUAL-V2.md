# Atlas Audio Flagship Visual Checkpoint V

Visual-only checkpoint for the final Atlas Audio flagship programme.

Scope: strengthen the shared LISTEN / DESIGN family identity; restage SYSTEM SYMPHONY as a monumental computational performance surface; preserve its cartridge / Atlas APU boot and all audio behaviour; enlarge SPECTRAL / Forge; make PLAY and FORGE field-first; replace scenario-name-directed Field art with numeric telemetry plus mapped-state derivation; introduce the hybrid crystalline lattice plus spectral aperture Field v4 language.

Excluded: SYSTEM SYMPHONY audio changes, Spectral Forge sonic redesign, PR #239, production deployment, and merge authority.

Review gate: governed non-production preview across SYSTEM SYMPHONY and Spectral Forge PLAY / FORGE / ANALYSE before any merge decision.

## Technical recovery pass

Recorded because several earlier iterations patched symptoms rather than causes.

### One Field renderer

`SpectralFieldRenderer` previously carried the retired line-dominant renderer in
its own class body (`draw`, `drawTraces`, `drawLattice`, `drawFracture`,
`drawSelectedRoute`) and depended on `spectral-field-art.js` running
`Object.assign` over the prototype at import time to shadow it. Whichever
implementation won was decided by module evaluation order, and the legacy code
stayed resident and reachable.

The class now imports the v4 renderer directly. Removed as dead:

- `static/js/spectral-forge/spectral-field-layers.js` (retired v3 layers, imported by nothing)
- `static/js/spectral-forge/spectral-field-compose.js` (compatibility alias, imported by nothing)
- `static/js/spectral-forge/spectral-field-art.js` (prototype installer)
- `static/js/spectral-forge/spectral-field-install.js` (prototype installer)
- `lab/shared/symphony-live-movement.css` (byte-identical duplicate of rules this
  branch had removed from `flagship-counterparts.css`; restored there instead)

### Cache strategy

The module graph imported `spectral-field-compose-v4.js` both with and without a
`?v=` suffix, which makes two instances of the same module. Forge JS now carries
no query strings and is covered by explicit `_headers` rules, matching the
existing convention for `/static/js/**` and `/lab/shared/**`.

### Composition

The dead band above the identity was `lab/shared/lab-shell-layout.css` reserving
`clamp(24px, 3vw, 40px) !important` for every product-layout Lab route. Forge
opts out for its own route only. The Field stage previously assumed 250px of
chrome above it (`calc(100svh - 250px)`) when the measured value was 616px; the
stage now derives from a `--forge-chrome` token set per breakpoint from measured
bounds.

Measured at 1440x900: Field visible in the first viewport went from 283px of
698px (41%) to 356px of 458px (78%), with the stage top moving from 616px to
543px.

The transport also overflowed horizontally at 390px (`scrollWidth` 579 against a
390 viewport) because `minmax(360px, 1fr) auto` cannot fit; it stacks below
900px now. That overflow is a blocking condition in
`scripts/capture_interface_evidence.mjs` and is the most likely cause of the
failing route-derived evidence capture on this branch.

### Browser evidence

`scripts/smoke_spectral_forge_preview.mjs` exists because a still screenshot of
the Field cannot distinguish running, frozen, and fallen-back-to-another-renderer
states. It asserts, in Chromium and Firefox, that requestAnimationFrame actually
runs, that the canvas changes between frames, that `data-field-renderer` stays
`v4-spatial` across PLAY / FORGE / ANALYSE and scenario changes, and that
playback does not restart on a depth switch.
