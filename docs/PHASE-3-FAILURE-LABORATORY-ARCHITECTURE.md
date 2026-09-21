# Phase 3 Failure Laboratory architecture and instrument audit

Status: #283 architecture baseline for the later Phase 3 slices.

Audit snapshot: 2026-09-13, using `atlas-systems/main` at
`b50a084bd904a6f93ce6feab116b72b858275e4c`.

This document is an integration blueprint. It describes current products and
their safe relationships; it does not create a new runtime, establish a new
estate-wide authority, or author a deployment or live-state change.

## 1. Authority and scope

### Current baseline and dependency gate

The #281/#282 prerequisite was rechecked before this worktree was created:

| Plane | Current evidence | Result |
| --- | --- | --- |
| `atlas-systems/main` | `b50a084bd904a6f93ce6feab116b72b858275e4c` | Current remote `main`; the merged Atlas Motion change is the branch base. |
| PR [#282](https://github.com/AtlasReaper311/atlas-systems/pull/282) | Merged, closed, merge commit `b50a084bd904a6f93ce6feab116b72b858275e4c` | Source and GitHub merge state reconciled. |
| Issue [#281](https://github.com/AtlasReaper311/atlas-systems/issues/281) | Closed by #282 | The previous source issue has a deliberate merged outcome. |
| Deploy workflow [run #403](https://github.com/AtlasReaper311/atlas-systems/actions/runs/34761183651) | Run `34761183651`, head `b50a084bd904a6f93ce6feab116b72b858275e4c`, `completed / success` | The exact merge commit reached the repository's deployment workflow. The production custom-domain verification job also completed successfully. |
| Production route | `https://atlas-systems.uk/lab/atlas-motion/` returned HTTP 200 during this audit, with the expected canonical route and `Atlas Motion` heading. The production homepage response carried build-commit metadata matching `b50a084bd904a6f93ce6feab116b72b858275e4c`. | Independent custom-domain/live route evidence is present for the exact merged outcome. A route response is not used as evidence for any other instrument. |

The exact-head workflow set for that commit was terminal and successful at the
time of the audit: Deploy, Pre-deploy Witness, Pull request CI, Public
interface conformance, OpenSSF Scorecard, and CodeQL. CI is recorded separately
from deployment, runtime, and live verification.

### Authority inspected

The current `origin/main` of `AtlasReaper311/atlas-infra` was
`fabca7e997b9efd76c11aec76166b5fb63405abe` when inspected. The following
accepted authority was read from that current tree:

- `docs/2026-completion-roadmap.md`, including the Phase 3 journey and
  scenario vocabulary;
- `docs/adrs/ADR-0008-public-interface-system-v2.md` and
  `policy/public-interface-system-v2.json` for shell, hierarchy, Lab
  directory, accessibility, responsive, reduced-motion, and product-specific
  layout rules;
- `policy/public-interface-evidence-mode-extension-v1.json` and
  `docs/public-interface-successor-evidence-mode-authority.md` for
  `measured`, `stale-measured`, `recorded-replay`, `simulated`, `unavailable`,
  `unknown`, and `not-applicable-unscored` evidence modes;
- `docs/adrs/ADR-0013-estate-wide-evidence-lifecycle.md` and
  `docs/adrs/ADR-0014-evidence-lifecycle-profiles.md` for the separate
  `SOURCE -> CHECKED -> MERGED -> DEPLOYMENT OBSERVED -> DEPLOYED -> RUNTIME
  VERIFIED -> LIVE VERIFIED` lifecycle and profile applicability;
- `docs/adrs/ADR-0017-atlas-twin-public-impact-projection.md`,
  `policy/public-boundary-projections.json`, and the current public-boundary
  projections for Twin and other public surfaces;
- `docs/agent-conventions.md` and `docs/model-policy.md` for the source-of-truth
  order and evidence separation rules.

The repository's historical `docs/PHASE-G-INTERFACE-CONFORMANCE.md` records an
older pinned Infra commit for the original Phase G adoption. That historical
record was not rewritten here; current accepted Infra files above are the
authority for this audit.

Relevant current source heads were also inspected read-only:

| Repository | Current inspected head | Use in this audit |
| --- | --- | --- |
| `AtlasReaper311/atlas-request-xray` | `cb26f4dcede61b61fa82c8b1804b00aec4e688a5` | Upstream Request X-Ray simulator/source contract. |
| `AtlasReaper311/atlas-blackbox` | `333c6d8a19b67172c4fb947ae3ecd76514d5ab21` | Blackbox recorder, incident, and replay contract. |
| `AtlasReaper311/atlas-twin` | `937ac6ab929085f8e8f162dd2344802d2617f3d9` | Offline Twin producer context; no write was made. |
| `AtlasReaper311/atlas-api-public` | `daf91a2bd79ad0e57f004c07849c1cb17ee9178e` | Public Twin projection serving contract. |
| `AtlasReaper311/atlas-motion` | `fd3c720924dfa774f1df3b467ffc176031efc5a7` | Separate in-flight Motion completion stream; issue [#21](https://github.com/AtlasReaper311/atlas-motion/issues/21) remains open. |

Current repository files remain the presentation authority for the local
Atlas Systems copies. External source/contracts are used only where the local
surface consumes or represents them.

### Evidence and authority boundary

Current evidence overrides this snapshot, this document, the issue body,
previous chat context, memory, and historical roadmap copies. A future slice
must refresh the relevant source, GitHub, deployment, runtime, and live
evidence before relying on any statement here.

The accepted evidence extension keeps evidence mode separate from maturity and
runtime state. `Live`, `Replay`, `Generated`, and `Simulated` are directory data
modes; they are not substitutes for the evidence modes above. The lifecycle
ADRs also prohibit inferring a later delivery stage from an earlier one.

This artifact authorises no merge, deployment, provider mutation, live-state
mutation, publication, release, workflow dispatch, or cross-repository write.
The only source change in #283 is this documentation artifact.

## 2. Instrument matrix

The local source paths below are the current Atlas Systems routes inspected in
this audit. A route can be publicly reachable without being a sitemap entry,
manifest entry, or indexed first-class directory destination.

| Instrument | Atlas Systems route and source owner | Current hierarchy | Question and Phase 3 role | Native scenarios / evidence | Smallest safe touchpoint |
| --- | --- | --- | --- | --- | --- |
| Request X-Ray | `/lab/xray/`; local public copy in [`lab/xray/`](../lab/xray/). Upstream simulator: `atlas-request-xray` at the inspected head. | Specialist Lab tool; local route is not separately declared in `.atlas/public-interface.json` and is not in the current sitemap. | **REQUEST** - what happened to this request? | Seven-layer deterministic browser simulator; `simulated`. Native presets include Healthy baseline, Retry storm, Cache stampede, Rate limited, and Cascading timeout. | Link to the existing route with the question, mode, and boundary. Do not add Phase 3 query state; preserve the existing permalink contract only. |
| CASCADE | `/lab/cascade/`; [`lab/cascade/`](../lab/cascade/). | Specialist non-indexed Lab tool; `noindex, follow`; not in the sitemap. | **DEPENDENCIES** - how did a synthetic fault propagate and how did containment change the result? | Deterministic synthetic graph; `simulated`. Database/cache `FAIL`, `DEGRADE`, and `ADD LATENCY`; fallback, async buffer, and graceful-mode toggles. | Route-only handoff with subordinate context. No automatic fault selection or shared state. |
| Consensus | `/lab/consensus/`; [`lab/consensus/`](../lab/consensus/). | Specialist non-indexed Lab tool; `noindex, follow`; not in the sitemap. | **COORDINATION** - how did a fixed three-replica teaching cluster reach quorum and later converge? | Deterministic fixed-leader model; `simulated`. `QUORUM 2/3` / `EVENTUAL`, clean/slow/isolate networks, proposal/append/ack/commit/apply/converge. | Route-only handoff. Do not add protocol claims, automatic writes, or a shared scenario query. |
| Neon Relay | `/lab/neon-relay/`; [`lab/neon-relay/`](../lab/neon-relay/). | Specialist non-indexed Lab tool; `noindex, follow`; not in the sitemap. | **COORDINATION**, as bounded routing, isolation, protection, and repair; not a replacement for Consensus. | Four deterministic synthetic circuit puzzles; `simulated`. Overload, short-to-ground, alternate routing, fuse protection, and reset/reroute. | Route-only or explanatory handoff. Do not call circuit isolation a measured network partition. |
| Atlas Twin context | No separate public Twin UI route. Public contract is `GET /v1/evidence/twin-impact`; current consumer is [`systems/evidence/`](../systems/evidence/). | Twin is a private/offline producer. The public presentation is a Systems Evidence Console context layer served through `atlas-api-public`. | **IMPACT** - which public components or contracts **could be affected**? | Static public projection / generated data. The impact conclusion is exactly `could-be-affected`; Console availability failure remains `UNKNOWN / NOT OBSERVED`. | Link to the Evidence Console Change View. Consume only the accepted public projection; never expose the private producer or strengthen the wording. |
| Blackbox | `/lab/blackbox/`; [`lab/blackbox/`](../lab/blackbox/), backed by the public `atlas-blackbox` Worker/API contract. | Public Lab incident-evidence route; listed in the current sitemap. | **INCIDENT EVIDENCE** - what incident evidence was actually recorded? | Live recorder/status frames are current public observations when successfully read; sealed incidents and reviewed postmortems are `recorded-replay`. | Link to the route and let its own replay/postmortem controls own the record. Do not copy incident IDs or turn replay into live state. |
| Spectral Forge | `/lab/spectral-forge/`; [`lab/spectral-forge/`](../lab/spectral-forge/). | Approved product-layout Lab audio instrument; current Lab card calls it a telemetry sonification instrument and Preview. | Cross-cutting interpretation - what does synthetic changing telemetry sound like? | Deterministic synthetic telemetry; `simulated`. PLAY / FORGE / ANALYSE and native scenarios including NORMAL LOAD, LATENCY CREEP, CACHE COLLAPSE, CASCADING FAILURE, and DEPLOYMENT / RECOVERY. | Secondary cross-cutting link. Do not wrap, restyle, trigger, or re-map the instrument from the journey. |
| System SYMPHONY | `/lab/system-symphony/`; [`lab/system-symphony/`](../lab/system-symphony/). | Approved product-layout Lab audio flagship; current Lab card calls it Telemetry music and Preview. | Cross-cutting interpretation - what does bounded changing system telemetry sound like while uncertainty remains visible? | Live mode can be `measured`, `stale-measured`, or `unknown`; demo is `simulated`; replay/fixture paths are `recorded-replay` or preview fixture evidence. | Secondary cross-cutting link to the existing PLAY / TRACE / REPLAY experience. Never make musical state the incident authority. |
| Atlas Motion | `/lab/atlas-motion/`; [`lab/atlas-motion/`](../lab/atlas-motion/). | Adjacent in-flight mini-flagship; non-participating by default. The current route is an audit snapshot, not a generic Lab card to be absorbed. | Optional surrounding/contextual reference only; not a required journey stage or shared-scenario target. If a later Phase 3 implementation genuinely needs Motion as a participant, that requires a separate owner decision. | Current page snapshot presents EstateBoot as a recorded topology replay and EvidenceChain as a reviewed replay of lifecycle vocabulary. Neither is live telemetry or current recovery proof. | No Phase 3 integration is required. If referenced, use a subordinate route-level contextual link only. Do not depend on current composition count, layout, selector, navigation, or archive implementation. |
| Evidence Console | `/systems/evidence/`; [`systems/evidence/`](../systems/evidence/). | Primary Systems evidence reader, not a Lab instrument. | **IMPACT / INCIDENT EVIDENCE destination** - what named public claim is supported, what is missing, and what remains unknown? | Change specimens are `recorded-replay`; Service/Estate views read current public contracts and preserve measured/unknown results per fact; Twin is generated impact context only. | Destination from the journey for lifecycle/change proof and Twin context. Do not duplicate its Change/Service/Estate views in the Failure Laboratory. |

### Detailed current readings

#### Request X-Ray

- **Source and route:** `lab/xray/index.html` owns the local Atlas Systems
  surface at `/lab/xray/`. The separate upstream repository's current public
  route is `https://xray.atlas-systems.uk/`; this audit does not treat the
  upstream route as a replacement for the local route.
- **Model:** The browser-only model walks Browser, edge, router, API, service,
  cache, and database layers. Retries, timeout budgets, jitter, rate limiting,
  service errors, cache hit/miss/stale state, and database outcomes are
  deterministic. URL state can reproduce an experiment.
- **Proof boundary:** `simulated`. It demonstrates what this bounded request
  model does for a selected synthetic configuration.
- **Non-claims:** It does not measure a real request, call a production
  dependency, establish a current latency, prove a real cascade or incident,
  or prove recovery in the estate.
- **Integration:** A future journey may name the request question and link to
  the existing route. Automatic selection of a preset or new shared query
  vocabulary is not currently a safe deep-link contract.

#### CASCADE

- **Source and route:** `lab/cascade/index.html` and `lab/cascade/cascade-core.js`
  own the local surface at `/lab/cascade/`. The route explicitly presents a
  deterministic synthetic model and `SIMULATED LAB`, and is `noindex, follow`.
- **Model:** The graph contains Edge, API, Core Service, Cache, Database,
  Queue, and Worker. Database/cache faults can fail, degrade, or add latency;
  resilience properties alter containment and buffering outcomes. The core is
  deterministic and does not use production estate data.
- **Proof boundary:** `simulated`. It demonstrates propagation and containment
  inside this synthetic graph.
- **Non-claims:** A displayed root fault is not an observed Atlas dependency
  failure or cascade. Twin topology, route links, or a matching label cannot
  upgrade it to incident evidence.
- **Integration:** A future journey can link to the route with a contextual
  explanation. It must not inject a fault, select a resilience toggle, or
  replace the graph with a shared component.

#### Consensus

- **Source and route:** `lab/consensus/index.html` and
  `lab/consensus/consensus-core.js` own `/lab/consensus/`. The route is
  `noindex, follow` and explicitly labels the model `SIMULATED LAB`.
- **Model:** A fixed leader and two followers form a three-replica cluster.
  Quorum commits after the bounded acknowledgement rule; delayed replicas can
  converge later; healing/catch-up is explicit. `CLEAN`, `SLOW B`, and
  `ISOLATE C` are deterministic network settings.
- **Proof boundary:** `simulated`. This is a fixed-leader teaching model for
  quorum, propagation delay, isolation, and convergence.
- **Non-claims:** The source does not establish Raft, Paxos, or another named
  production protocol. It does not prove production replication, quorum,
  partition, consistency, or recovery.
- **Integration:** The journey may distinguish Consensus from Neon Relay and
  link to this route. It must not add automatic writes, a protocol claim, or a
  shared state machine.

#### Neon Relay

- **Source and route:** `lab/neon-relay/index.html` and
  `lab/neon-relay/neon-relay-core.js` own `/lab/neon-relay/`. The route is
  `noindex, follow` and presents a `SIMULATED CIRCUIT` boundary.
- **Model:** Ignition, Dual Bus, Bypass, and Interlock are four deterministic
  circuit-routing puzzles. The model represents overloaded traces, a
  short-to-ground hazard, protection/fuse phases, alternate routes, and reset
  actions.
- **Proof boundary:** `simulated`. It demonstrates bounded routing and
  protection mechanics in a synthetic circuit.
- **Non-claims:** It does not observe production routing, a real network
  partition, a distributed cascade, physical infrastructure, or recovery of an
  Atlas service.
- **Integration:** Use a distinct coordination/protection link. Do not flatten
  it into Consensus or add a common control rail.

#### Atlas Twin public impact context

- **Source and route:** `atlas-twin` is the offline producer; the current
  public-safe projection is served by `atlas-api-public` from
  `data/twin-impact-projection.json` at
  `https://api.atlas-systems.uk/v1/evidence/twin-impact`. The current consumer
  is the Change View in `/systems/evidence/`.
- **Contract:** The projection uses
  `atlas-control-plane/twin-impact-projection/v1`, public-only identities,
  explicit coverage and unknowns, producer/provenance, and the
  `static-public-projection` distribution mode. `generated_at` is generation
  time, not observation time.
- **Proof boundary:** This is generated relationship/impact context, not one
  of the incident evidence modes. The Console renders loaded context as
  `could be affected` and keeps live-evidence state separate; unavailable or
  malformed data remains `UNKNOWN / NOT OBSERVED`.
- **Non-claims:** It does not prove `was affected`, propagation, failure,
  merge, deployment, runtime, publication, live state, or estate completeness.
  Private or unclassified evidence may remain unknown.
- **Integration:** The only safe public destination is the existing Evidence
  Console. No private Twin route, identifier, or unapproved projection is a
  Phase 3 input. No cross-repository contract change is required for #283.

#### Blackbox

- **Source and route:** The local page at `/lab/blackbox/` is the read-only
  presentation. The current external contract is the `atlas-blackbox` public
  API at `https://api.atlas-systems.uk/blackbox`, with status, incident list,
  incident detail, health, and reviewed postmortem paths.
- **Model and records:** The recorder keeps a bounded rolling window of
  telemetry/event frames, seals an incident around a failure trigger, and can
  attach a reviewed postmortem. The route's replay deck interpolates numeric
  telemetry for playback while preserving exact event timestamps and explicit
  missing values.
- **Evidence modes:** Recorder/status and successfully read current frames are
  current public observations (`measured` at the observation boundary). A
  sealed incident and its replay are `recorded-replay`; a postmortem is
  reviewed record content attached to that incident.
- **Proof boundary:** It proves what the public recorder captured and what the
  reviewed record says. It does not by itself prove root cause, current live
  state, deployment identity, or recovery.
- **Integration:** Link to the Blackbox page, not raw incident data in a new
  shared card. A replay remains historical even when the recorder is currently
  available.

#### Spectral Forge

- **Source and route:** `lab/spectral-forge/` owns the product route
  `/lab/spectral-forge/`, with product layout and an explicit `simulated`
  evidence mode.
- **Model and behaviour:** PLAY runs deterministic synthetic scenarios; FORGE
  changes telemetry-to-sound mappings; ANALYSE exposes signal/audio evidence.
  The current domain model includes request rate, latency, errors, queue,
  cache, CPU, anomaly, health, and phase descriptions. Browser Web Audio is
  procedural and bounded; mute/audio-off and reduced-motion behaviour are part
  of the product.
- **Proof boundary:** `simulated`. It demonstrates how selected synthetic
  telemetry can be mapped to sound and visual state.
- **Non-claims:** It does not measure current health, prove a real cache
  collapse/cascade/recovery, or turn sound into incident evidence.
- **Integration:** Treat it as cross-cutting interpretation. A Phase 3 link
  must not change PLAY/FORGE/ANALYSE, audio, mapping, timing, or scenario
  semantics.

#### System SYMPHONY

- **Source and route:** `lab/system-symphony/` owns the product route
  `/lab/system-symphony/`, with separate PLAY, TRACE, and REPLAY modes and a
  product layout.
- **Model and behaviour:** Live mode reads bounded public `/sonify` telemetry
  and declared topology read-only. Demo mode is local simulation over a
  snapshot. Replay/fixture modes use deterministic browser playback. Service
  evidence can be measured, stale, unknown, or unmeasured; declared topology
  is not live traffic.
- **Evidence modes:** Live source state may be `measured`, `stale-measured`, or
  `unknown`; DEMO is `simulated`; replay/archive/preview fixture content is
  `recorded-replay` or an explicitly labelled preview fixture.
- **Proof boundary:** It can provide a read-only sonification of the source
  state and its uncertainty. Musical state is not incident authority, and
  topology does not prove propagation.
- **Integration:** Keep the product-specific audio, state mapping, controls,
  timing, and replay modes local. A journey link is contextual only and must
  not autoplay or modify live/demo/replay state.

#### Atlas Motion

- **Current snapshot:** `lab/atlas-motion/` owns the current production route
  `/lab/atlas-motion/`, which was independently production/live-reconciled
  above as the #281/#282 dependency. The current page publishes EstateBoot and
  EvidenceChain. It also currently provides local media, a textual/no-JS
  fallback, and provenance. These are current page facts, not a product-
  completion contract or final presentation authority.
- **Separate completion stream:** `atlas-motion#21` remains open for the
  targeted TwinImpact rendering path. A real TwinImpact artifact may later be
  released, and a later Atlas Systems showcase pass may change the composition
  count and presentation mechanics. Phase 3 must not prevent or pre-judge that
  work. Atlas Motion is therefore adjacent and non-participating in the Failure
  Laboratory by default.
- **Evidence mode and boundary:** The current EstateBoot page content is a
  recorded historical topology replay and EvidenceChain is a reviewed replay
  of lifecycle vocabulary. Neither is live telemetry or current recovery proof.
  The lifecycle sequence explains that order is not proof; a rendered
  `LIVE VERIFIED` stage is not a new live observation by the motion page.
- **Non-claims:** It does not currently supply a Failure Laboratory scenario
  target, current Twin impact, incident, runtime, or recovery evidence. The
  presence or absence of a released TwinImpact showcase must remain owned by
  the separate Motion completion stream.
- **Integration:** No Phase 3 integration is required. The future journey may
  mention or link to Motion only as optional surrounding/contextual material.
  If a later Phase 3 slice proposes Motion as a participating instrument, that
  proposal requires a separate owner decision rather than an inference from
  this audit.

#### Evidence Console

- **Source and route:** `systems/evidence/index.html`, with local modules under
  `systems/evidence/`, owns `/systems/evidence/`.
- **Model and behaviour:** Change, Service, and Estate views read distinct
  public-safe records. Change specimens are recorded public projections;
  Service/Estate projections read current public contracts and retain partial,
  failed, and unknown states. Twin is a separate Change View context layer.
- **Evidence modes and proof boundary:** There is no single global mode. The
  view keeps `recorded-replay`, measured supporting observations, and
  `UNKNOWN / NOT OBSERVED` distinct. It answers what a named claim supports and
  what is missing; it is not a fleet-health dashboard or a substitute for
  Blackbox replay.
- **Integration:** It is a destination/context reader for lifecycle and public
  impact proof. The Failure Laboratory must link to it rather than implement a
  second lifecycle console or alter its Twin wording.

## 3. Journey architecture

The visitor journey is a map of independent instruments, not a shared
execution graph:

`REQUEST -> DEPENDENCIES -> COORDINATION -> IMPACT -> INCIDENT EVIDENCE -> RECOVERY`

| Stage | Best current reading | Question answered | Evidence mode | What the journey may say | Smallest future touchpoint |
| --- | --- | --- | --- | --- | --- |
| REQUEST | Request X-Ray | What happened to this request? | `simulated` | A selected synthetic request path can show retries, timeouts, cache behaviour, rate limits, and bounded latency. | Stage explanation plus link to `/lab/xray/`. |
| DEPENDENCIES | CASCADE | How did the problem propagate through dependencies? | `simulated` | A selected synthetic root fault can propagate through CASCADE's declared graph, with containment outcomes visible. | Stage explanation plus route link; no fault injection from the corridor. |
| COORDINATION | Consensus and Neon Relay | How did replicated state, quorum, routing, isolation, and protection behave? | `simulated` | Consensus and Neon Relay show different bounded models and must remain two distinct instruments. | Two separate destinations with separate native questions. |
| IMPACT | Atlas Twin context, read through Evidence Console | Which public components or contracts could be affected? | Generated public projection; live availability is separate and not impact observation | Public Twin context may show relationships that **could be affected**, with coverage/unknowns/provenance. | Link to the Evidence Console Change View. |
| INCIDENT EVIDENCE | Blackbox, with Evidence Console for lifecycle/change proof | What evidence was actually recorded or proven? | Blackbox: measured recorder plus `recorded-replay`; Console: recorded/measured/unknown by view | Blackbox owns captured incident frames and reviewed postmortems. Evidence Console owns named public claim/lifecycle reading. They are complementary, not one generic evidence card. | Two explicitly labelled destinations. |
| RECOVERY | No single authoritative current instrument | What can be truthfully said about recovery? | `unknown` unless a named current record supports a narrower statement; synthetic recovery readings stay `simulated` | The current estate has synthetic recovery outcomes, aftermath/replay, and lifecycle evidence, but no single Phase 3 Recovery Evidence authority. | Show a bounded gap and offer instrument-specific contextual links. Do not invent Phase 6 Recovery Evidence or Architecture Time Machine. |

Spectral Forge and System SYMPHONY are cross-cutting interpretation layers. They
can help a visitor perceive changing synthetic or bounded public telemetry, but
they do not need to be inserted as a seventh linear stage.

The future corridor must not require a common runtime, common simulation state,
shared state machine, common CSS, iframe embedding, unified control system, or
synchronized execution. Each destination keeps its own URL, source, shell,
controls, playback model, evidence mode, accessibility behavior, and product
identity. The corridor owns only explanation, ordering, bounded metadata, and
safe navigation.

## 4. Scenario matrix

The identifiers below are audit labels for the roadmap vocabulary. Issue #284
owns the final shared data contract and stable identifiers. Until then, these
labels must be treated as contextual navigation terms, not a new runtime model.

Atlas Motion is intentionally not a scenario target in this matrix. Its current
replays may be mentioned as optional surrounding material, but it is not part
of the shared scenario contract by default merely because its route is under
`/lab/`.

| Shared scenario | Current mapping and native terminology | Evidence mode | Demonstrates | Cannot infer | Safe future reference / unsupported mapping |
| --- | --- | --- | --- | --- | --- |
| `normal-operation` / Normal operation | **Direct:** Request X-Ray `Healthy baseline`; CASCADE baseline; Consensus `CLEAN` baseline; Neon Relay prime board; Spectral Forge `NORMAL LOAD` - all synthetic. **Contextual:** System SYMPHONY live source when it has measured data, or its labelled demo/replay; Blackbox only where a specific record contains before-failure frames. Atlas Motion is excluded from the shared scenario target set by default. | Mostly `simulated`; System SYMPHONY varies; Blackbox `recorded-replay` where applicable. | A bounded baseline or normal-looking synthetic state in the named instrument. | Current estate health, absence of an incident, or production normality. | Safe as a clearly labelled scenario/context concept for the mapped instruments. Twin, Evidence Console, and Atlas Motion do not represent this scenario target. |
| `latency-creep` / Latency creep | **Direct:** CASCADE `ADD LATENCY`; Spectral Forge `LATENCY CREEP`. **Contextual:** Request X-Ray jitter/latency controls; Consensus `SLOW B` network; System SYMPHONY latency telemetry when its source supports it; Blackbox only for a record-specific latency trace. Neon Relay has no latency model. Atlas Motion is excluded by default. | X-Ray/CASCADE/Consensus/Spectral `simulated`; System SYMPHONY measured/stale/unknown or replay; Blackbox `recorded-replay` for a selected record. | How the named synthetic model or selected evidence changes under delay. | A real latency regression, shared cause, or current production performance. | Safe as contextual navigation with native terms preserved. Atlas Motion has no Phase 3 latency mapping. |
| `cache-collapse` / Cache collapse | **Contextual:** Request X-Ray `Cache stampede` / miss/stale controls; CASCADE cache fault/fallback; System SYMPHONY cache telemetry if present. **Direct:** Spectral Forge `CACHE COLLAPSE`. Atlas Motion is excluded by default. | Synthetic instruments `simulated`; System SYMPHONY measured/stale/unknown or replay. | Synthetic cache pressure and its mapped downstream response in the instrument that models it. | A production cache collapse, observed dependency cascade, or actual impact. | Safe only when native wording remains visible. Consensus, Neon Relay, Blackbox, Twin, Evidence Console, and Atlas Motion have no Phase 3 cache-collapse target. |
| `dependency-failure` / Dependency failure | **Direct:** CASCADE database/cache root fault. **Contextual:** Request X-Ray service error/timeout; Neon Relay branch/fuse/output fault; Spectral Forge `SERVICE FLAPPING` or related synthetic pressure; System SYMPHONY service status; a specific Blackbox incident if its captured record supports the description. Atlas Motion is excluded by default. | Mostly `simulated`; System SYMPHONY may be measured/stale/unknown/replay; Blackbox `recorded-replay` for a named record. | The selected instrument's bounded response to its own synthetic or recorded failure input. | That the corresponding Atlas dependency failed, that the same failure crossed all instruments, or that Twin relationships observed the failure. | Safe as a navigation label only with a mode and boundary. Consensus, Twin, Evidence Console, and Atlas Motion do not directly represent dependency failure. |
| `network-partition` / Network partition | **Contextual model:** Consensus `ISOLATE C` and delayed/heal behavior; Neon Relay isolated feed/branch behavior. These are the closest current instruments, but their native terms must remain visible. Atlas Motion is excluded by default. | `simulated`. | Bounded loss of a link/feed and the resulting synthetic quorum/routing consequences. | A real network partition, Atlas traffic loss, or production coordination event. | Safe as contextual framing, not as an observed incident label. Request X-Ray, CASCADE, Spectral Forge, Blackbox, Twin, Evidence Console, and Atlas Motion have no generic direct partition model. |
| `cascading-failure` / Cascading failure | **Direct:** CASCADE propagation; Spectral Forge `CASCADING FAILURE`. **Contextual:** Request X-Ray `Cascading timeout`; System SYMPHONY incident arc or source telemetry when explicitly labelled; Blackbox selected recorded incident. Atlas Motion is excluded by default. | CASCADE/Spectral/X-Ray `simulated`; System SYMPHONY varies; Blackbox `recorded-replay`. | Propagation or mapped escalation in the named synthetic model, or captured frames in a named incident record. | That a CASCADE graph, Twin relationship, sonification, or label proves a real production cascade. | Safe as contextual navigation when the target's native scenario and mode are shown. Consensus, Neon Relay, Twin, Evidence Console, and Atlas Motion have no direct cascading-failure target. |
| `recovery` / Recovery | **Direct synthetic:** Spectral Forge `DEPLOYMENT / RECOVERY`. **Contextual synthetic:** CASCADE replay/resilience/reset; Consensus heal/catch-up; Neon Relay reset/reroute; Request X-Ray reset/re-run. **Contextual recorded/measured:** Blackbox aftermath/postmortem; System SYMPHONY replay or measured state when a source record supports it; Evidence Console named `LIVE VERIFIED` delivery evidence. Atlas Motion is excluded as a shared scenario target; its EvidenceChain replay may be optional surrounding lifecycle context only. | Synthetic targets `simulated`; Blackbox `recorded-replay`; System SYMPHONY varies; Console is view-specific. | The selected model's recovery-like transition, the recorder's captured aftermath, or a named lifecycle fact. | A universal recovery event, current service recovery, root-cause resolution, or a future Recovery Evidence product. | Safe only as `explore recovery` / `recovery evidence unavailable or unknown` with the exact target boundary. Twin and Atlas Motion have no Phase 3 recovery target; there is no single authoritative Phase 3 recovery stage. |

The matrix deliberately contains unsupported and contextual combinations. A
shared label may explain why a visitor is entering an instrument; it must not
select an internal state, imply a synchronized event, or strengthen simulated,
replayed, generated, stale, unavailable, or unknown data into measured live
truth.

## 5. Product-preservation matrix

Phase 3 is connective tissue. The following are explicit no-change rules for
later issues. A journey link is allowed only if it remains visually and
behaviourally subordinate to the existing product.

| Instrument | Typography, palette, composition, hero, and layout that must remain local | Controls, keyboard, motion, audio, state, and playback that must remain local | Navigation and evidence semantics that must remain local |
| --- | --- | --- | --- |
| Request X-Ray | Preserve the XRAY identity, seven-layer trace composition, hop table, and current route-local visual hierarchy. Do not apply a shared Phase 3 card or global restyle. | Preserve Run request, Replay, permalink, fault toggles, deterministic engine, URL state, keyboard operation, reduced-motion pass, and no-JS explanatory table. No audio behavior is to be added. | Keep the simulated/browser-only boundary and native preset names. A link must not claim measured request or recovery evidence. |
| CASCADE | Preserve the `Failure moves.` hero, node graph, fault/resilience layout, typography, palette, and current synthetic atmosphere. | Preserve fault types, resilience toggles, REPLAY FAULT/RESET, deterministic propagation, focus/keyboard behavior, responsive graph alternative, and reduced motion. | Keep `SIMULATED LAB`, no production-data claim, `noindex, follow`, and current route-local explanation. |
| Consensus | Preserve the calm three-replica composition, protocol rail, node inspector, typography, palette, and product layout. | Preserve QUORUM/EVENTUAL, network settings, fixed leader, write/reset controls, deterministic delays, convergence/heal state, keyboard/touch behavior, and reduced motion. Do not add audio or a protocol rewrite. | Keep the fixed-leader teaching-model wording and `SIMULATED LAB`. Do not rename it Raft/Paxos or present quorum as production evidence. |
| Neon Relay | Preserve the neon circuit board, four-puzzle composition, signal-puzzle atmosphere, typography, palette, and challenge layout. | Preserve relay controls, power/fuse/reset mechanics, challenge progression, trace/readout behavior, keyboard/touch targets, and reduced motion. Do not add a shared toolbar or new runtime. | Keep `SIMULATED CIRCUIT`, noindex behavior, and the distinction between circuit protection and network evidence. |
| Atlas Twin context | Preserve the Evidence Console's Systems hierarchy and the Twin panel's own disclosure/unknown treatment. Do not create a private Twin visual surface. | Preserve loading, malformed, unavailable, and unknown handling; public-safe projection validation; no automatic impact state or scenario mutation. | Preserve `could be affected`, coverage, unknowns, provenance, and all contract limitations. Never write `was affected`, failure, live, or recovery on Twin's behalf. |
| Blackbox | Preserve the recorder/replay-deck composition, timeline, postmortem disclosure, route-specific typography/palette, and evidence-first hierarchy. | Preserve read-only replay, 30x playback, exact event timestamps, interpolated telemetry explanation, missing-frame handling, fetch failure copy, keyboard behavior, and reduced-motion behavior. | Preserve the distinction between current recorder observations, sealed recorded replay, and reviewed postmortem. Do not copy or reinterpret incident records in the corridor. |
| Spectral Forge | Preserve the Forge hero, dark material/palette, product typography, PLAY/FORGE/ANALYSE progressive composition, and analysis surfaces. | Preserve scenario clock, mappings, procedural Web Audio, sample-free/bounded audio behavior, mute/audio-off, keyboard shortcuts, native controls, reduced motion, and deterministic model. No autoplay. | Preserve `SIMULATED`, synthetic telemetry, and the statement that it does not represent current health. Do not make its sound incident evidence. |
| System SYMPHONY | Preserve the product-layout audio flagship, Atlas APU identity, visual score/topology composition, typography, palette, and mode-specific hierarchy. | Preserve PLAY/TRACE/REPLAY, live read-only lock, demo/replay state, audio scheduling/timing, mapping, unknown/unmeasured states, mute, keyboard, reduced motion, and no autoplay. | Preserve measured/stale/unknown/replay/demo labels, declared-topology boundary, source/provenance links, and the fact that musical state is not incident authority. |
| Atlas Motion | Preserve Atlas Motion identity, mini-flagship hierarchy, product-specific visual character, truthful release semantics, released-media provenance, and the route's accessibility character. Do not freeze the current page composition, composition count, stage layout, selector, keyframe/gallery, archive, or showcase presentation. Those mechanics remain owned by the separate Motion completion stream. | Preserve accessibility guarantees, no-JS/textual fallback guarantees where applicable, reduced-motion/accessibility behavior, and any future Motion-owned playback contract. Phase 3 must not freeze today's selector or navigation mechanics, or make its current media arrangement a dependency. | Preserve replay/reviewed-replay boundaries, the distinction from live evidence, provenance, and `order is not proof`: a rendered lifecycle stage is not evidence that the stage occurred. Presence or absence of a released TwinImpact composition remains Motion-stream-owned. Do not absorb, demote, or make it a required Failure Laboratory instrument. |
| Evidence Console | Preserve the Systems page hierarchy, Change/Service/Estate navigation, evidence density, and route-local typography/palette/layout. | Preserve its view state, JS/no-JS fallback, keyboard/focus behavior, malformed/unavailable/unknown handling, and current data loading. | Preserve ADR-0013/0014 lifecycle semantics, view-specific evidence modes, and separate Twin context. The Failure Laboratory links to it and does not clone it. |

Global interface authority still applies around these products: fixed headers
must reserve flow space; focus must remain visible; touch targets remain at
least 44px; mobile widths 320, 375, 768, 1024, and 1440 remain governed where
the current planner requires; Chrome/Firefox, keyboard, reduced motion,
no-JS/progressive enhancement, and no horizontal overflow remain required for
any materially changed route. Those constraints do not author a shared product
skin.

## 6. Failure Laboratory route recommendation

### Recommendation

Reserve `/lab/failure-laboratory/` as the future first-class integrated journey
route. It is currently absent and is intentionally **not implemented in #283**.

The existing `/lab/` remains the Lab directory and the future route should be
one selected journey within that directory. The route should be owned by
`atlas-systems`, use its own corridor/investigation presentation under the
current shell authority, and link outward to the existing instruments. Route
metadata, public-interface registration if needed, sitemap ownership, and
browser evidence belong to the later implementation/closure slices.

This location is the smallest truthful choice because:

- ADR-0008 defines Lab as a directory-with-flagships with expressive,
  product-specific instruments kept local;
- the Phase 3 question is an exploratory systems investigation, not a new
  `/systems/` evidence console, service endpoint, or flagship replacement;
- `/lab/` already separates directory navigation from individual route-local
  product layouts;
- the route can be first-class without making every existing `/lab/` path an
  equal card or an integrated runtime;
- `/systems/evidence/` remains the evidence reader and is a destination for
  public claim/lifecycle context, not the Failure Laboratory home.

The future route may present the six stages, scenario context, evidence modes,
proof boundaries, and links. It must not embed instruments as generic widgets,
share their state, inject their controls, or copy their visual systems.

Atlas Motion is adjacent optional material, not part of the Failure Laboratory
journey contract by default. It remains directly accessible at
`/lab/atlas-motion/` with its mini-flagship hierarchy and is not absorbed,
demoted, or reclassified merely because it is under `/lab/`. The Failure
Laboratory architecture must not depend on Motion's current page state or on
the outcome of its separate completion stream.

The current non-indexed CASCADE, Consensus, and Neon Relay routes may be linked
as deliberate specialist destinations without being silently promoted into the
sitemap. Whether any route becomes first-class or remains deliberately
non-indexed is a later directory/metadata decision, not a reason to change its
product source in #283.

## 7. Future handoff strategy

Handoffs are categories, not a mandatory shared component:

1. **Failure Laboratory -> instrument:** A static, same-tab link to the
   existing canonical Atlas Systems route, preceded by the engineering
   question, evidence mode, and one-sentence proof boundary.
2. **Instrument -> Failure Laboratory:** Add only where a visually secondary
   route-local link fits the approved composition. It may be one-way if a
   return control would damage the instrument's hierarchy.
3. **Continue investigation:** A later-stage link may be offered after the
   instrument's existing secondary content or conclusion. It must not move or
   rename a primary control.
4. **Scenario context:** The corridor may pass a human-readable scenario label
   as explanation. A target may display that context without selecting a
   native fault, changing a state machine, seeking media, starting audio, or
   autoplaying a replay.
5. **Evidence destination:** Blackbox and the Evidence Console remain distinct
   destinations. A Blackbox link means captured/replayed incident evidence; an
   Evidence Console link means a named public claim/lifecycle/impact reading.
6. **Cross-cutting interpretation:** Spectral Forge and System SYMPHONY may be
   presented as another way to perceive change. They are not required stage
   transitions and their outputs do not become incident proof through linking.

Existing native deep-link contracts remain the only safe exceptions:

- Request X-Ray's existing permalink may reproduce its own experiment, but no
  Phase 3 scenario parameter is implied;
- Atlas Motion's current native composition/seek links are an audit snapshot,
  not a Phase 3 dependency. A later slice must use whatever public, safe,
  current Motion navigation contract exists when that slice is implemented;
- System SYMPHONY's existing PLAY/TRACE/REPLAY URL modes remain product-owned.

For CASCADE, Consensus, Neon Relay, Spectral Forge, Blackbox, Twin, and the
Evidence Console, a route-only or route-local explanatory handoff is the safe
default until a later issue proves a native deep-link contract. No cross-link
implies a single synchronized event across instruments.

## 8. Gaps and prerequisites

### Current gaps

- **Recovery:** There is no single current public Recovery Evidence instrument
  for the Phase 3 journey. Recovery must remain `unknown`, unavailable, or a
  narrow synthetic/recorded/lifecycle reading until a separately authorised
  future capability supplies a contract.
- **Shared model:** There is no current Phase 3 scenario/journey data contract.
  #284 must own stable identifiers, direct/contextual/unsupported relations,
  evidence mode, native terminology, and proof boundaries.
- **Integrated route:** `/lab/failure-laboratory/` does not exist yet. #285
  owns its implementation and no-JS/progressive-enhancement surface.
- **Handoffs:** The existing instruments do not share a Phase 3 navigation
  contract. #286 must add only route-safe, product-local handoffs and may
  intentionally leave some routes one-way or untouched.
- **Directory closure:** The current Lab directory and sitemap deliberately do
  not expose every specialist route equally. #287 must reconcile first-class
  promotion, manifest/metadata, sitemap inclusion, and route evidence without
  weakening noindex or mini-flagship boundaries.
- **Current public-interface coverage:** `.atlas/public-interface.json` is a
  representative surface declaration, not a declaration of every specialist
  route. Any later route promotion must follow the current validator and
  authority rather than copying this audit's table into the manifest.

### Cross-repository prerequisites

No cross-repository source change is required for #283. The current public Twin
projection already supplies a public-safe contract, and the current Blackbox
API and System SYMPHONY public telemetry paths are existing contracts.

If a future issue changes the Twin projection schema, coverage, or claim, the
prerequisite is owned across the existing boundaries: `atlas-infra` must govern
the authority/schema, `atlas-twin` must produce the offline analysis, and
`atlas-api-public` must serve the accepted public projection. `atlas-systems`
may consume only the accepted public contract. This issue performs none of
those writes.

If a future issue needs a Blackbox or System SYMPHONY contract change, the
owning repository must change its recorder/producer contract first; the
Failure Laboratory must not reconstruct private or provider data locally.

### Capabilities deliberately not invented

This architecture does not create Recovery Evidence, an Architecture Time
Machine, a new Worker/API/database/runtime, scenario orchestration, a shared
simulation state, an incident narrative, or a stronger Twin/lifecycle claim.

## 9. Downstream issue reconciliation

The current issue sequence remains correctly bounded. The following are
recommendations for implementation, not edits to those issues:

| Issue | Current scope after audit | Reconciliation |
| --- | --- | --- |
| [#284 Shared failure-scenario vocabulary and journey model](https://github.com/AtlasReaper311/atlas-systems/issues/284) | Correctly scoped as a static, repository-local presentation contract. | Keep it. It must not model Atlas Motion as a required scenario target; Motion is excluded by default and may be optional context only after separate owner approval. Its tests should carry the direct/contextual/unsupported distinction, native wording, evidence mode, and proof boundary. Recovery may remain `unknown`/unavailable. |
| [#285 Build integrated Failure Laboratory journey surface](https://github.com/AtlasReaper311/atlas-systems/issues/285) | Correctly scoped as the future public corridor, after #283 and #284. | Keep it. Use `/lab/failure-laboratory/`; the corridor must not depend on Atlas Motion, its current page structure, its current navigation, or the outcome of the separate Motion completion stream. Link to full instruments instead of rebuilding them. |
| [#286 Add bounded Failure Laboratory handoffs](https://github.com/AtlasReaper311/atlas-systems/issues/286) | Correctly scoped as route-local, bounded contextual links. | Keep it. Do not add an Atlas Motion handoff unless it is safe against the then-current Motion product and separately justified by the owner. Use whatever current public-safe Motion navigation contract exists then; do not freeze today's mechanics. One-way or untouched routes remain valid. |
| [#287 Lab directory, sitemap and Failure Laboratory phase closure](https://github.com/AtlasReaper311/atlas-systems/issues/287) | Correctly scoped as the later directory/metadata/closure reconciliation. | Keep it. Preserve Atlas Motion's mini-flagship hierarchy and separate completion stream, but do not assume today's composition count, page mechanics, or TwinImpact presence/absence. Directory closure must not block Motion completion. |

No downstream issue needs a cross-repository write as a prerequisite for the
architecture itself. If a later implementation discovers a new missing public
contract, it must stop at that owning boundary and record the exact contract
before changing `atlas-systems`.

No Phase 3 issue should block the separate Atlas Motion completion stream. A
later participating-Motion proposal is an owner decision, not an implication of
this architecture.

## 10. Audit and validation record

The audit used the current local source, current remote `main`, current GitHub
issue/PR/workflow state, current accepted Infra authority, current external
source heads, and current public contract probes. The following repository
ownership and validation paths were inspected as part of the audit:

- `.atlas/public-interface.json` and `docs/PHASE-G-INTERFACE-CONFORMANCE.md`;
- `lab/index.html`, `lab/shared/shell.js`,
  `lab/shared/lab-shell-contract.js`, and current local Lab tests;
- `scripts/generate_sitemap.py`, `sitemap.xml`, `_headers`,
  `scripts/check_repository_links.py`, `scripts/verify_pages_output.py`, and
  `.pagesignore`;
- `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, and
  `.github/workflows/interface-preview.yml`;
- `docs/EVIDENCE-CONSOLE.md` and the route-local Evidence Console modules.

The doc-only change must pass the repository-native CI checks for HTML/tests,
sitemap, Pages output, JSON, offline links, and whitespace. Because this file
does not change a governed interface path, the current interface-preview path
filter does not by itself require a browser preview; that workflow remains the
authority for any later route or interface change.

The source, merge, deployment, runtime, live verification, and owner-acceptance
states remain separate. This document does not promote any one of them.
