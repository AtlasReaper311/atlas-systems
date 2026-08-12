# Atlas Spectral Forge

Frozen, maintainable source export of the Atlas Spectral Forge telemetry sonification instrument.

This handoff preserves the current implementation without a redesign or behavioural change. The application is self-contained: its telemetry is deterministic and synthetic, its mapping and presets are browser-local, and its audio is generated with the Web Audio API. It has no production Atlas Systems data connection, authentication requirement, external API dependency, D1 database, or R2 storage dependency.

## Requirements

- Node.js 22.13 or newer
- npm 10 or newer
- A modern browser with Canvas and Web Audio support

## Local development

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Audio remains inactive until `ENABLE AUDIO` is selected, as required by browser autoplay policy.

## Validation and build

```sh
npm run lint
npm run build
npm test
```

The existing verified build scripts target Linux and use GNU `timeout`. On macOS, install GNU coreutils or run the underlying portable build directly:

```sh
npm exec vinext build
```

## Source layout

- `app/page.tsx`: PLAY, FORGE and ANALYSE workspaces and shared application state
- `app/components/SpectralField.tsx`: deterministic Canvas flagship visualisation
- `app/components/AudioScope.tsx`: actual Web Audio waveform and spectrum analyser
- `app/components/OutputMeter.tsx`: actual post-master RMS and peak metering
- `app/components/SignalVisuals.tsx`: transform graph, sparkline and causal timeline visuals
- `app/lib/signal-forge.ts`: deterministic scenarios, telemetry, mappings, transforms and presets
- `app/lib/audio-engine.ts`: Web Audio graph, synthesis, gain staging and safety limiting
- `app/globals.css`: complete responsive and reduced-motion interface styling
- `public/` and `.vinext/fonts/`: current assets and locally cached font files

## Keyboard controls

- `Space`: play or pause
- `R`: reset the deterministic run
- `M`: mute or unmute
- `1` to `7`: choose a scenario
- `P`: PLAY
- `F`: FORGE
- `A`: ANALYSE
- `?`: help

Keyboard shortcuts are ignored while typing in an input, select, textarea, or editable element.

## Sites-specific files

The application source does not depend on ChatGPT Sites at runtime. The existing `.openai/hosting.json`, `build/`, `worker/`, and Sites validation helpers are retained solely to preserve the exact exported project and its original hosting provenance. `.openai/hosting.json` contains only an opaque project identifier and explicitly declares no D1 or R2 binding. See [`SITES-HOSTING.md`](SITES-HOSTING.md).

## Provenance

Exported from the current Atlas Spectral Forge Sites source at commit `85bb4291d5b390322017d151ff6d1e34d569520d`. See [`SOURCE-PROVENANCE.md`](SOURCE-PROVENANCE.md).
