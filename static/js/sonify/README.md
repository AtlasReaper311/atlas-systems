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

System SYMPHONY is the Atlas Systems browser instrument for current estate telemetry. It is one persistent dark cyberpunk composition with four score states, not four separate songs. A hybrid engine combines the original procedural score with curated drums, playable bass one-shots, granular lead fragments and selective atmosphere loops. Telemetry updates reshape tempo, harmony, sample palette, arrangement section, density, brightness and tension without restarting the piece.

Audio never autoplays. The graph and scheduler start only after a user presses Start. Startup asks both Tone and the underlying browser context to resume and sends one silent unlock pulse for browsers that require an immediately scheduled source. If a browser still blocks Web Audio for eight seconds, startup fails closed, the controls re-enable as **Retry audio**, and the status tells the listener to allow audio/autoplay for the site.

## Architecture

```text
GET /sonify (4 s) -------- authoritative measured health ---+
GET /v1/topology (5 min) - identity, layers, dependencies ---+--> poller.js
GET /deploy-watch/latest -- successful deployment identity --+        |
                                                                       v
                                                                  mapping.js
                                                                       |
                                    +----------------------------------+------------------+
                                    v                                  v                  v
                              performance.js                       samples.js           ui.js
                                    |                                  |        compact widget, console,
                             ghost-circuit.js                          |        topology and state preview
                                    +----------------+-----------------+
                                                     v
                                               engine.js + sampler.js
                                      persistent hybrid Tone.js composition
                                            + real master analyser
```

- `mapping.js` is pure JavaScript. It owns topology merging, state derivation, deterministic service identities, neutral null defaults and telemetry-to-score parameters.
- `poller.js` is the only network module. It prevents overlapping requests, bounds fetches below the telemetry interval, establishes event baselines and marks failed telemetry stale.
- `engine.js` owns the continuous procedural score, shared scheduler, service voices, state ramps, deployment motif and real analyser data.
- `samples.js` is pure JavaScript. It owns the versioned thirty-eight-asset manifest, state-specific timbre pools, eight-phrase section cycles and deterministic loop slices.
- `sampler.js` owns Tone.js `Player`, `Sampler` and `GrainPlayer` nodes, isolated layer buses, parallel effects, lazy decoding and procedural fallback state.
- `performance.js` is pure JavaScript. It turns a visible hexadecimal seed plus four macro values into one deterministic curated arrangement without reading or changing telemetry.
- `ghost-circuit.js` is pure JavaScript. It owns the five-phase arrangement director, scale-safe riff grammar, arpeggio ordering, filter motion and bounded transition accents.
- `ui.js` owns the compact widget, dialog, topology, real waveform, table, inspector, live/Demo isolation and accessible performance controls.
- `static/css/system-symphony.css` contains the responsive Atlas-branded presentation and reduced-motion rules.

Tone.js `14.8.49` remains vendored at `/vendor/tone.min.js`. Thirty-eight owner-approved delivery assets live under `/static/audio/system-symphony/`: nineteen drum, percussion and transition one-shots; six tuned bass one-shots; six granular lead or synth loops; four measure-sliced rhythmic bass loops; and three atmosphere loops. They are local and query-versioned. Browsers prefer Opus, retry AAC and then WAV before using the procedural fallback, so the feature adds no runtime dependency, account or paid service. The original source library remains outside the repository and unchanged. `static/audio/system-symphony/AUDIT.md` records all forty-one reviewed sources and the three intentional exclusions.

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

The scheduler rotates across the whole represented estate instead of firing every component together. A D1/A1 drone spans each phrase, overlapping pads refresh every measure, and a shared low counterline guarantees harmonic motion even when foreground service motifs are sparse. Each score state also reserves service-anchor steps, so deterministic density cannot accidentally remove the orchestra for an entire phrase. Demo mode moves the drone and pad into the background and adds a low/mid pulse arpeggiator plus one sparse scale-safe Ghost Circuit riff voice. Recurring arp notes stay between D3 and D4; riffs may make bounded lifts to A4. Family-specific MIDI bounds hold recurring service notes between D1 and D4, with downward-only octave variation. Only the rare deployment motif can rise outside the recurring service register.

## Telemetry mappings

| Signal | Musical result |
| --- | --- |
| Overall estate health | Score state, harmony, tempo, industrial groove and master intensity |
| Service status | Synth family, articulation, density and stability |
| Latency | Low-pass cutoff and spectral openness |
| Uptime / current state | Brightness |
| Error rate | Instability, detuning and note confidence |
| Score state / active incidents | State-specific real drum, smoother bass and filtered atmosphere palettes layered over mode-correct procedural voices |
| New successful deployment | One quantised D-centred hero motif |
| Dependency relationships | Directed topology edges (`A → B` means A depends on B), external boundary nodes and related-node highlighting |
| Service identity | Instrument family, motif, register and stereo position |
| Demo Energy / Motion / Grit / Space | Club tempo, rhythmic movement, industrial saturation and atmospheric depth |
| Demo score seed | Reproducible chord, section order, coherent drum kit, bass voice, atmosphere, arpeggio and effects; Healthy also selects a tonal lead loop and slices |

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

Demo mode clones the latest live merged snapshot in memory and is always labelled `DEMO / SIMULATED`. It enters as `Custom`, preserving the live mixture without activating a performance preset; the four coherent bulk scenes remain opt-in. Direct component status, latency, uptime, error rate, solo, mute and deployment controls modify only that local object and keep the scene labelled `Custom`. A lone Healthy component cannot promote a majority-Unknown custom snapshot to the global Healthy score, while a Warning or Critical component still escalates the score. The poller continues refreshing the underlying live snapshot, so switching back to Live restores the newest real frame without restarting the composition. All, Measured and Unmeasured filters affect both the graph and service table. Resetting from Live or reloading the page discards Demo changes. No mutation endpoint exists in this module.

### Demo performance console

The four telemetry states remain the musical foundation and gain secondary performance names:

| State | Demo scene | Default identity |
| --- | --- | --- |
| Healthy | Night Drive | ~114 BPM nocturnal drive, rounded drums and bass, four D-minor lead fragments per phrase and restrained atmosphere |
| Warning | Grid Pressure | ~117 BPM syncopated pressure, a coherent harder kit, smoother bass and a mode-correct D Phrygian arpeggio |
| Critical | Redline Protocol | ~130 BPM controlled pursuit/combat rhythm, cleanly spaced drums, smoother driven bass and a D Phrygian dominant arpeggio |
| Unknown | Ghost Signal | ~97 BPM menu/loading-screen pulse, fragmented rhythm, a D-suspended arpeggio and one filtered, root-safe texture |

`Energy`, `Motion`, `Grit` and `Space` are bounded macro controls rather than raw synthesizer parameters. They reshape tempo, density, drum pressure, arpeggio and riff movement, saturation, delay, pad weight and reverb while retaining the selected state's scale and register limits. Demo tempo is bounded to `90–134 BPM`; Critical is urgent but deliberately capped instead of becoming an alarm. `Randomise score` generates one visible four-to-eight-character hexadecimal seed. The seed deterministically selects curated chord order, pad voicing, bass rhythm and octave, hat density, coherent sample palette, filtered atmosphere, arpeggio direction and gate, pattern rotation, riff contour and bounded effects. Rhythmic bass sources are restarted as deterministic four-beat fragments on measure boundaries rather than free-running, preventing drift against the drums. Healthy can also select one of six D-minor-normalised lead or synth loops and its slice order. Warning and Critical keep tonal motion procedural so every note remains mode-correct. Ghost uses procedural bass and texture only, avoiding key ambiguity in its D-suspended grammar. Entering a previous value and pressing `Replay seed` restores the same versioned arrangement and sample palette for the current scene and macro values.

Each state advances through its own eight-phrase section cycle. Healthy alternates drive, lift, break and fill sections; Warning adds pressure; Critical adds pursuit, breach and redline; Unknown moves through drift, signal, space and return. A chosen drum kit and bass voice remain stable for the whole phrase; section boundaries may select the next timbre, crossfade atmosphere and trigger a bounded crash without rebuilding the audio graph. Automatic tape-stops do not land on phrase downbeats. Driving scenes keep their snares on beats two and four, their hats on a consistent subdivision and their bass hits free of adjacent retriggers. Ghost Signal retains its deliberately fragmented rhythm.

### H9 Ghost Circuit

Ghost Circuit adds a second compositional layer without changing telemetry truth.
Every seeded performance moves through `Boot`, `Drive`, `Lift`, `Drop` and
`Afterglow` phases. Phase changes are quantised to phrase boundaries and scale
drums, bass, pads, pulse arp and riff independently, creating contrast instead
of making every layer continuously louder.

The existing FM terminal voice is the pulse arpeggiator. Seeded direction,
one/two-octave range, gate length, pattern rotation and four filter-motion modes
make it evolve over successive phrases. A separate three-timbre riff voice
plays one-to-two-bar call-and-response motifs. Riffs are generated
from the active state scale and stay between D3 and A4. Boot can omit the riff;
Drop exposes it; Ghost Signal leaves longer rests and echoes.

The audible mix applies phase strength once at the layer bus instead of again
inside every note velocity. In the normal arrangement the pulse arp and riff
receive bounded boosts while an active riff ducks the sampled lead by roughly
2–3 dB. **Ghost Circuit focus** lowers the backing by about 4 dB for A/B
listening. **Hear arp** and **Hear riff** isolate their target voice over a very
quiet pad and backing. The console shows the current real Ghost phase across a
`Boot → Drive → Lift → Drop → Afterglow` timeline; it no longer relies on the
separate sample-section label to explain the arrangement. These listening
controls update layer gains only; they cannot restart samples, reapply scene
filters or overlap the transport BPM automation.

Demo scene changes are staged as one atomic frame-and-arrangement update on the
next bar. Tempo, master tone, layer buses, sample buses and effects then ramp for
four seconds while the previous pad enters its existing long release and the
incoming pad uses its slow attack. Atmospheres retain their four-second true
crossfade. This keeps Healthy, Warning, Critical and Ghost changes musical and
prevents the previous half-old/half-new measure. Bulk Demo scene buttons also
avoid the separate live-incident impact accent, which previously landed ahead
of the Critical crossfade. Page teardown stops the shared Tone transport before
disposing the audio graph, and both scheduler callbacks reject non-finite times
before they can reach a Tone audio parameter.

The arrangement permits one tape-stop transition at most once per eight phrases
and retains the existing bounded crash accents. Effect wet values, riff gain,
incident accents, service voices and sample voice pools all have explicit caps.
`PERFORMANCE_SCHEMA_VERSION` is included in each arrangement identity so a
future grammar change cannot be mistaken for an exact replay of version 2.

While audio is running, seed and macro changes replace one pending arrangement and activate together at the next measure boundary. This avoids abrupt mid-beat changes. Switching to Live clears the Demo arrangement immediately, including the arpeggiator and performance effects.

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
- Sample playback uses nineteen reusable `Player` nodes, six loaded `Sampler` instruments, twenty-four rotating granular lead voices, eight rotating rhythmic-bass voices and three granular atmosphere players. Per-state low-pass filtering and restrained parallel drive keep the more aggressive voices controlled. No sample node is created inside a scheduler callback.
- Drum, bass, lead, atmosphere and transition layers have isolated buses. Room, lead delay and bass drive are parallel sends, avoiding a single washed-out serial effects chain.
- Demo adds one shared arpeggiator, three selectable monophonic riff timbres, feedback delay and bounded parallel drive; all are allocated once when the graph starts and remain neutral in Live mode.
- The preferred compressed library transfers approximately 3–3.5 MB. Fifteen core assets load first; twenty textures and three atmospheres load in background tiers under immutable query-versioned URLs.
- Service voices leaving topology fade before disposal.
- Incident onset accents are capped at four per observed increase.
- No oscillator, LFO or effect node is created inside the scheduler loop.
- Default user gain is `62%`, followed by compression and a `-2 dB` limiter before output.

## Audio loading and failure modes

- Audio never autoplays and no audio asset is requested during the initial page load.
- Start unlocks the browser audio context, builds the fixed graph, then loads the fifteen-asset core tier and generates the local reverb impulse in parallel. Remaining textures load in background tiers.
- Each asset has a bounded total retry budget. A preferred Opus failure retries AAC, then WAV; complete failure affects only that asset and leaves its procedural layer active.
- A failed sample load never changes telemetry state and never labels an unavailable sound as healthy.
- A browser that cannot unlock Web Audio within eight seconds receives the existing explicit startup error and can retry.
- Asset files are 44.1 kHz, stereo, 16-bit PCM delivery copies. Source files are not rewritten in place.

## Validation

From the repository root:

```bash
npx --yes html-validate@9.7.1 "**/*.html"
node --test js/tests/*.test.mjs lab/tests/*.test.mjs static/js/sonify/*.test.js
node --check static/js/sonify/engine.js
node --check static/js/sonify/ghost-circuit.js
node --check static/js/sonify/mapping.js
node --check static/js/sonify/poller.js
node --check static/js/sonify/sampler.js
node --check static/js/sonify/samples.js
node --check static/js/sonify/ui.js
python3 scripts/generate_sitemap.py --check-only
python3 scripts/verify_pages_output.py .
git diff --check
```

The tests cover all four score states, stale behavior, measured Unknown versus Unmeasured counts, deterministic identities and motifs, safe registers, pad cadence and all voicings, audible bass octave and hat-density changes, arpeggio direction/gate/rotation, Ghost Circuit phase cycles, audibility profiles, single phase attenuation and riff bounds, bar-quantised scene crossfades, transport teardown, transition cooldowns, effect ceilings, versioned replay identity, codec retry and timeout, background-load progress, cleanup, topology merge and failure fallback, incident and deployment baselines, request overlap protection and service voice limits.

Musical quality, speaker translation, clipping margin and two-to-three-minute non-repetition still require a human listening pass because automated tests cannot judge those qualities reliably.

## How it fits into Atlas Systems

System SYMPHONY lives inside [`atlas-systems`](https://github.com/AtlasReaper311/atlas-systems) and reads the current public contracts from [`specular-sonify`](https://github.com/AtlasReaper311/specular-sonify), [`atlas-api-public`](https://github.com/AtlasReaper311/atlas-api-public) and [`deploy-watch`](https://github.com/AtlasReaper311/deploy-watch).

It is an audible operational surface: every displayed or musical state traces back to current public evidence, an explicit measured Unknown, a visible Unmeasured boundary or an explicitly labelled simulated preview.

---

Part of [atlas-systems.uk](https://atlas-systems.uk)
