<div align="center">
  <img src="https://raw.githubusercontent.com/AtlasReaper311/AtlasReaper311/main/atlas-icon-dark-256.png" width="88" alt="Atlas Systems"/>
</div>

# System SYMPHONY

```
┌─────────────────────────────────────────────┐
│  ATLAS SYSTEMS // System SYMPHONY           │
│  a cyberpunk score for live telemetry       │
└─────────────────────────────────────────────┘
```

![Runtime](https://img.shields.io/badge/runtime-browser_audio-f5a623?style=flat-square&labelColor=0a0a0f)
![Tests](https://img.shields.io/badge/tests-node_test-4ade80?style=flat-square&labelColor=0a0a0f)
![Audio](https://img.shields.io/badge/audio-tone.js_14.8.49-aaa9a0?style=flat-square&labelColor=0a0a0f)
![Cost](https://img.shields.io/badge/cost-%C2%A30-aaa9a0?style=flat-square&labelColor=0a0a0f)

System SYMPHONY is the Atlas Systems browser instrument for current estate telemetry. It is one persistent dark cyberpunk composition with four score states, not four separate songs. Telemetry updates reshape tempo, harmony, synth families, industrial rhythm, density, brightness and tension without restarting the piece.

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
                 persistent Tone.js composition                      compact widget, console,
                    + real master analyser                         topology and state preview
```

- `mapping.js` is pure JavaScript. It owns topology merging, state derivation, deterministic service identities, neutral null defaults and telemetry-to-score parameters.
- `poller.js` is the only network module. It prevents overlapping requests, bounds fetches below the telemetry interval, establishes event baselines and marks failed telemetry stale.
- `engine.js` is the only Tone.js module. It owns synthesis, family buses, shared effects, bounded scheduling, state ramps, industrial rhythm, quantised Demo arrangements, deployment motif and analyser data.
- `performance.js` is pure JavaScript. It turns a visible hexadecimal seed plus four macro values into one deterministic curated arrangement without reading or changing telemetry.
- `ui.js` owns the compact widget, dialog, topology, real waveform, table, inspector, live/Demo isolation and accessible performance controls.
- `static/css/system-symphony.css` contains the responsive Atlas-branded presentation and reduced-motion rules.

Tone.js `14.8.49` remains vendored at `/vendor/tone.min.js`. No audio samples or licensed third-party assets were added.

## Four score states

| State | Grammar | Tempo | Orchestration |
| --- | --- | ---: | --- |
| Healthy | D Aeolian | 72 BPM | Sub-bass D/A power rail, overlapping detuned pads, a low terminal counterline, relay bass and a restrained industrial drum machine |
| Warning | D Phrygian | 82 BPM | The same continuous composition with a syncopated counterline, darker filtering and more voltage in the service motifs |
| Critical | D Phrygian dominant | 96 BPM | The liked critical kick pattern, fuller machine percussion, urgent low voices and controlled harmonic tension |
| Unknown | D suspended | 60 BPM | A quieter but continuous overlapping pad, low suspended counterline, fragmented drums, tape noise and unresolved signals |

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
- Additive evidence-source, health-detail and measured-at metadata is displayed when `/sonify` supplies it; registry metadata alone never becomes a health claim.

The `/sonify` contract is pinned to the exact twenty-one nodes rendered by the console. `atlas-api-public` supplies current public and service-binding probe verdicts, `github-pulse` supplies bounded current-main or scheduled-workflow evidence for the three non-runtime components, the telemetry snapshot supplies its own measured fact, and `specular-sonify` proves only its executing request handler. Missing, stale or unreadable evidence remains `unknown`; it is never promoted to healthy.

Neutral musical values keep a null voice playable without fabricating telemetry: neutral filter openness, moderate brightness and zero invented error instability.

## Service identity

A stable FNV-1a hash of the component name selects its motif variation, instrument variation, register and stereo position. The result is deterministic across polls, modes and page visits.

| Estate role | Instrument family |
| --- | --- |
| Public surfaces | Detuned terminal pads and CRT phosphor haze |
| Public APIs and registries | Packet sequencers and modem arpeggios |
| Observability and telemetry | Industrial telemetry pulses and relay percussion |
| Edge and tunnel systems | Corroded saws and cold gateway voltage |
| Local AI, memory and corpus | Sub-core drones and neural power rails |
| Infrastructure and deployment | Relay bass and mainframe low voices |
| Reusable kits and unmatched roles | Tape signals and damaged data tones |

The scheduler rotates across the whole represented estate instead of firing every component together. A D1/A1 drone spans each phrase, overlapping pads refresh every measure, and a shared low counterline guarantees harmonic motion even when foreground service motifs are sparse. Each score state also reserves service-anchor steps, so deterministic density cannot accidentally remove the orchestra for an entire phrase. Demo mode can add one shared low/mid terminal sequence, but recurring Demo notes remain at or below C4. Family-specific MIDI bounds hold recurring service notes between D1 and D4, with downward-only octave variation. Only the rare deployment motif can rise to F-sharp 4.

## Telemetry mappings

| Signal | Musical result |
| --- | --- |
| Overall estate health | Score state, harmony, tempo, industrial groove and master intensity |
| Service status | Synth family, articulation, density and stability |
| Latency | Low-pass cutoff and spectral openness |
| Uptime / current state | Brightness |
| Error rate | Instability, detuning and note confidence |
| Score state / active incidents | One shared drum machine that grows from restrained Healthy pulse to the preserved Critical kick pattern |
| New successful deployment | One quantised D-centred hero motif |
| Dependency relationships | Directed topology edges (`A → B` means A depends on B), external boundary nodes and related-node highlighting |
| Service identity | Instrument family, motif, register and stereo position |
| Demo Energy / Motion / Grit / Space | Tempo pressure, rhythmic movement, industrial saturation and atmospheric depth |
| Demo score seed | Reproducible chord, bass, percussion, melody and effect variation |

## Incidents and deployments

The initial incident count establishes a baseline. An increase may add a quantised onset accent, but critical rhythm and harmony persist for as long as the incident or down state remains. Unchanged polls do not repeat the onset accent.

The current successful deployment also establishes a baseline and produces no page-load motif. A later successful deployment with a different deploy ID or commit SHA produces one five-note hero motif and an amber visual pulse. Failed deployments do not replace the success baseline. Preview mode exposes an explicit browser-only deployment trigger.

## Polling and stale data

- Telemetry: every `4 seconds`.
- Fetch timeout: `3 seconds`, always below the telemetry interval.
- Topology: approximately every `5 minutes`.
- Deployment event check: every `12 seconds`.
- Scheduling uses completion-based timeouts and an in-flight guard, so requests cannot overlap.
- Each source logs once per failure streak.

On telemetry failure, the last raw values remain available for display, the score frame becomes stale, the interface says `LIVE DATA STALE`, the last successful timestamp remains visible, and the composition enters Unknown. The next successful poll recovers automatically.

## Live and Demo isolation

Live mode only permits audio start/stop, volume, inspection, help and console open/close. It exposes no health, performance, mute, solo or deployment simulation controls.

Demo mode clones the latest live merged snapshot in memory and is always labelled `DEMO / SIMULATED`. Direct component status, latency, uptime, error rate, solo, mute and deployment controls modify only that local object. Coherent bulk scenes apply Healthy, Warning, Critical or Unknown status plus matching metrics to every represented component. The poller continues refreshing the underlying live snapshot, so switching back to Live restores the newest real frame without restarting the composition. All, Measured and Unmeasured filters affect both the graph and service table. Resetting from Live or reloading the page discards Demo changes. No mutation endpoint exists in this module.

### Demo performance console

The four telemetry states remain the musical foundation and gain secondary performance names:

| State | Demo scene |
| --- | --- |
| Healthy | Night Drive |
| Warning | Grid Pressure |
| Critical | Redline Protocol |
| Unknown | Ghost Signal |

`Energy`, `Motion`, `Grit` and `Space` are bounded macro controls rather than raw synthesizer parameters. They reshape tempo, density, drum pressure, terminal-sequence movement, saturation, delay, pad weight and reverb while retaining the selected state's scale and register limits. `Randomise score` generates one visible four-to-eight-character hexadecimal seed. The seed deterministically selects curated chord order, bass syncopation, drum fills, melody rotation and effects variation. Entering a previous value and pressing `Replay seed` restores the same arrangement for the current scene and macro values.

While audio is running, seed and macro changes replace one pending arrangement and activate together at the next measure boundary. This avoids abrupt mid-beat changes. Switching to Live clears the Demo arrangement immediately, including the terminal sequence and performance effects.

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
- Shared low drone, overlapping pad, terminal counterline, relay bass, drum machine, tape texture, compression and limiter nodes are reused.
- Demo adds one shared terminal synth, feedback delay and service distortion node; all are allocated once when the graph starts and remain neutral in Live mode.
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

The pure tests cover all four score states, stale behavior, measured Unknown versus Unmeasured counts, deterministic identities and motifs, safe family registers, pad cadence and voicing, finite off-grid bass events, eight-phrase non-drum layer persistence, deterministic performance seeds, bounded macros, measure-boundary activation, Demo terminal registers, seeded bass and percussion continuity, topology merge and failure fallback, external dependency graphs, component filters, coherent bulk profiles, incident deltas, deployment baselines, request overlap protection and voice counts beyond six.

Musical quality, speaker translation, clipping margin and two-to-three-minute non-repetition still require a human listening pass because automated tests cannot judge those qualities reliably.

## How it fits into Atlas Systems

System SYMPHONY lives inside [`atlas-systems`](https://github.com/AtlasReaper311/atlas-systems) and reads the current public contracts from [`specular-sonify`](https://github.com/AtlasReaper311/specular-sonify), [`atlas-api-public`](https://github.com/AtlasReaper311/atlas-api-public) and [`deploy-watch`](https://github.com/AtlasReaper311/deploy-watch).

It is an audible operational surface: every displayed or musical state traces back to current public evidence, an explicit measured Unknown, a visible Unmeasured boundary or an explicitly labelled simulated preview.

---

Part of [atlas-systems.uk](https://atlas-systems.uk)
