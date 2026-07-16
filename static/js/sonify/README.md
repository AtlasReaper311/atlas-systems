<div align="center">
  <img src="https://raw.githubusercontent.com/AtlasReaper311/AtlasReaper311/main/atlas-icon-dark-256.png" width="88" alt="Atlas Systems"/>
</div>

# System SYMPHONY

```
┌─────────────────────────────────────────────┐
│  ATLAS SYSTEMS // System SYMPHONY           │
│  a generative orchestra for live telemetry  │
└─────────────────────────────────────────────┘
```

![Runtime](https://img.shields.io/badge/runtime-browser_audio-f5a623?style=flat-square&labelColor=0a0a0f)
![Tests](https://img.shields.io/badge/tests-node_test-4ade80?style=flat-square&labelColor=0a0a0f)
![Audio](https://img.shields.io/badge/audio-tone.js_14.8.49-aaa9a0?style=flat-square&labelColor=0a0a0f)
![Cost](https://img.shields.io/badge/cost-%C2%A30-aaa9a0?style=flat-square&labelColor=0a0a0f)

System SYMPHONY is the Atlas Systems browser instrument for current estate telemetry. It is one persistent generative composition with four score states, not four songs. Telemetry updates reshape tempo, harmony, orchestration, density, brightness and tension without restarting the piece.

Audio never autoplays. The graph and scheduler start only after a user presses Start. If a browser does not unlock its audio context within eight seconds, startup fails closed and the controls re-enable instead of hanging.

## Architecture

```text
GET /sonify (4 s) -------- authoritative measured health ---+
GET /v1/topology (5 min) - identity, layers, dependencies ---+--> poller.js
GET /deploy-watch/latest -- successful deployment identity --+        |
                                                                       v
                                                                  mapping.js
                                                                       |
                                  +------------------------------------+------------------+
                                  v                                                       v
                              engine.js                                                  ui.js
                    persistent Tone.js orchestra                     compact widget, console,
                    + real master analyser                           topology and demo lab
```

- `mapping.js` is pure JavaScript. It owns topology merging, state derivation, deterministic service identities, neutral null defaults and telemetry-to-score parameters.
- `poller.js` is the only network module. It prevents overlapping requests, bounds fetches below the telemetry interval, establishes event baselines and marks failed telemetry stale.
- `engine.js` is the only Tone.js module. It owns synthesis, shared effects, bounded scheduling, state ramps, incident rhythm, deployment motif and analyser data.
- `ui.js` owns the compact widget, dialog, topology, real waveform, table, inspector, live/demo isolation and accessible controls.
- `static/css/system-symphony.css` contains the responsive Atlas-branded presentation and reduced-motion rules.

Tone.js `14.8.49` remains vendored at `/vendor/tone.min.js`. No audio samples or licensed third-party assets were added.

## Four score states

| State | Grammar | Tempo | Orchestration |
| --- | --- | ---: | --- |
| Healthy | D Lydian | 68 BPM | Warm low D/A drone, overlapping mid-register pads, soft strings, plucks and woodwinds |
| Warning | D Dorian | 78 BPM | The same grounded bed with darker harmony, stronger pulse and restrained low percussion |
| Critical | D Phrygian | 92 BPM | Persistent low rhythm, urgent service articulations, bass and controlled harmonic tension |
| Unknown | D suspended / restrained whole-tone | 56 BPM | Sparse open intervals, spectral colour and unresolved phrases |

Critical transitions use a sub-second arrangement ramp after the frontend receives the frame. Other state changes use eight-to-ten-second ramps. Sustained audio is not hard-cut except when the user stops playback, when the final user gain fades before the scheduler remains silent.

State policy:

1. Unknown when telemetry is stale or there are no known service states.
2. Critical for any active incident, any down service or overall health below `0.50`.
3. Warning for any degraded service or overall health below `0.95`.
4. Healthy otherwise.

An unknown component does not force the whole score to Unknown while current known measurements exist.

## Honest topology merge

`/sonify` is authoritative for the services it measures. `/v1/topology` supplies component identity, kind, layer, description and dependency edges.

- Every measured service is included, even when it is absent from topology.
- An unmeasured topology component is included as `Unmeasured`; measured services whose current evidence cannot determine health remain `Unknown`.
- An unmeasured `source_only` repository is excluded because source code is not a live service.
- A measured service remains included if its topology record is source-only, because the measurement itself proves that the sonification contract represents it.
- If topology is unavailable, the measured `/sonify` services continue to render and play.
- Null latency, uptime, error-rate and deploy-age fields remain null in the frame and interface.
- Additive evidence-source metadata is displayed when `/sonify` supplies it; registry metadata alone never becomes a health claim.

Neutral musical values keep a null voice playable without fabricating telemetry: neutral filter openness, moderate brightness and zero invented error instability.

## Service identity

A stable FNV-1a hash of the component name selects its motif variation, instrument variation, register and stereo position. The result is deterministic across polls, modes and page visits.

| Estate role | Instrument family |
| --- | --- |
| Local AI, memory and corpus | Chamber strings |
| Public APIs and registries | Woodwinds |
| Observability and telemetry | Restrained pulse / mallet voices |
| Edge and tunnel systems | Muted brass |
| Public surfaces | Harp, felt-piano and plucked voices |
| Infrastructure and deployment | Low strings and bass |
| Storage and KV systems | Spectral bells |

The scheduler rotates across the whole represented estate instead of firing every component together. A low D/A drone spans each phrase and an overlapping chord pad refreshes every measure, so sparse Healthy and Warning service notes still sit inside a persistent bed. Family-specific MIDI bounds and downward-only octave variation keep foreground voices out of the alarm-like upper register.

## Telemetry mappings

| Signal | Musical result |
| --- | --- |
| Overall estate health | Score state, orchestration, tempo and master intensity |
| Service status | Timbre, articulation, density and stability |
| Latency | Low-pass cutoff and spectral openness |
| Uptime / current state | Brightness |
| Error rate | Instability, detuning and note confidence |
| Active incidents | Persistent critical rhythm and tension until resolved |
| New successful deployment | One quantised D-centred hero motif |
| Dependency relationships | Directed topology edges (`A → B` means A depends on B), external boundary nodes and related-node highlighting |
| Service identity | Instrument family, motif, register and stereo position |

## Incidents and deployments

The initial incident count establishes a baseline. An increase may add a quantised onset accent, but critical rhythm and harmony persist for as long as the incident or down state remains. Unchanged polls do not repeat the onset accent.

The current successful deployment also establishes a baseline and produces no page-load motif. A later successful deployment with a different deploy ID or commit SHA produces one five-note hero motif and an amber visual pulse. Failed deployments do not replace the success baseline. Demo mode exposes an explicit local deployment trigger.

## Polling and stale data

- Telemetry: every `4 seconds`.
- Fetch timeout: `3 seconds`, always below the telemetry interval.
- Topology: approximately every `5 minutes`.
- Deployment event check: every `12 seconds`.
- Scheduling uses completion-based timeouts and an in-flight guard, so requests cannot overlap.
- Each source logs once per failure streak.

On telemetry failure, the last raw values remain available for display, the score frame becomes stale, the interface says `LIVE DATA STALE`, the last successful timestamp remains visible, and the orchestra enters Unknown. The next successful poll recovers automatically.

## Live and demo isolation

Live mode only permits audio start/stop, volume, inspection, help and console open/close. It exposes no health, mute, solo or deployment simulation controls.

Demo mode clones the latest live merged snapshot in memory. Direct component status, latency, uptime, error rate, solo, mute and deployment controls modify only that local object. Coherent bulk profiles apply Healthy, Warning, Critical or Unknown status plus matching metrics to every represented component. All, Measured and Unmeasured filters affect both the graph and service table. Switching to Live, resetting from Live or reloading the page discards demo changes. No mutation endpoint exists in this module.

## Accessibility

- Semantic buttons, labelled sliders and labelled numeric inputs.
- Dialog semantics, Escape close, keyboard focus containment and focus return.
- Keyboard-selectable SVG topology nodes plus a parallel service table.
- Text labels accompany every state colour.
- A small `aria-live` region announces only source and score-state changes.
- Mobile uses a full-screen console.
- `prefers-reduced-motion` disables edge and pulse animation while preserving state.
- Stereo positions stay within `-0.72` to `0.72`; every voice remains audible in mono.

## Performance limits

- Maximum represented components and allocated service voices: `32`.
- At most one rotating service note starts per eighth-note scheduler tick.
- Shared low drone, overlapping pad, bass, ambience, compression and limiter nodes are reused.
- Service voices leaving topology fade before disposal.
- Incident onset accents are capped at four per observed increase.
- No oscillator, LFO or effect node is created inside the scheduler loop.
- Default user gain is `62%`, followed by compression and a `-2 dB` limiter before output.

## Validation

From the repository root:

```bash
npx --yes html-validate@9.7.1 "**/*.html"
node --test js/tests/*.test.mjs lab/tests/*.test.mjs static/js/sonify/*.test.js
node --check static/js/sonify/engine.js
node --check static/js/sonify/mapping.js
node --check static/js/sonify/poller.js
node --check static/js/sonify/ui.js
python3 scripts/generate_sitemap.py --check-only
python3 scripts/verify_pages_output.py .
git diff --check
```

The pure tests cover all four score states, stale behavior, measured Unknown versus Unmeasured counts, deterministic identities and motifs, safe family registers, pad cadence and voicing, topology merge and failure fallback, external dependency graphs, component filters, coherent bulk profiles, incident deltas, deployment baselines, request overlap protection and voice counts beyond six.

Musical quality, speaker translation, clipping margin and two-to-three-minute non-repetition still require a human listening pass because automated tests cannot judge those qualities reliably.

## How it fits into Atlas Systems

System SYMPHONY lives inside [`atlas-systems`](https://github.com/AtlasReaper311/atlas-systems) and reads the current public contracts from [`specular-sonify`](https://github.com/AtlasReaper311/specular-sonify), [`atlas-api-public`](https://github.com/AtlasReaper311/atlas-api-public) and [`deploy-watch`](https://github.com/AtlasReaper311/deploy-watch).

It is an audible operational surface: every displayed or musical state traces back to current public evidence, an explicit measured Unknown, a visible Unmeasured boundary or an explicitly labelled local demo simulation.

---

Part of [atlas-systems.uk](https://atlas-systems.uk)
