# System Symphony Pass D1: Thematic Memory and Song-Plan Authority

## Scope

Pass D1 introduces the bounded long-form composition model described in the Pass D programme. It does not alter the approved D1A audio path.

The phase adds:

- one shared `ATLAS_THEME` identity;
- explicit cycle roles;
- explicit phrase roles;
- deterministic theme transformations;
- evidence-aware cadence intent;
- bounded thematic memory;
- D1 overlays for every D0 baseline journey;
- a no-audio browser inspector for plan and memory review.

The locked 100 BPM transport, sample-free instrument, state evidence mapping, replay ordering, absolute audio scheduling, D1A arpeggios, Boss Protocol power chords, and Lost Signal echoes remain unchanged.

## Authority model

`apu-song-plan.js` is the sole D1 song-plan authority. It receives already-bounded score context and the previous thematic-memory snapshot, then returns a frozen phrase plan.

`apu-thematic-memory.js` owns memory storage and bounded history. It does not choose evidence or schedule sound.

`apu-song-plan-baselines.js` overlays the planner onto the existing D0 journeys. D0 remains unchanged as the Pass C and D1A comparison point.

The D1 authority remains observational during this phase. Later passes may wire its theme transforms, harmonic destinations, orchestration roles, bass roles, rhythm roles, and arpeggio functions into audible decisions after the data model is reviewed.

## Shared thematic genome

D1 selects the recommended model from the programme: one Atlas theme with state-specific treatments.

- Explorer states the theme clearly.
- Grid Pressure strains it through displacement and compression.
- Boss Protocol compresses it into shorter, forceful material.
- Lost Signal fragments it without erasing its identity.
- evidence-backed recovery reprises the same theme rather than starting a new song.

Every plan therefore carries `themeId: "ATLAS_THEME"` plus a state treatment, version and transformation.

## Cycle roles

The bounded cycle model is:

```text
Cycle 0: statement
Cycle 1: development
Cycle 2: contrast
Cycle 3: reprise
Cycle 4: development
Cycle 5: contrast
Cycle 6: reprise
```

The three-role development pattern repeats after the initial statement. This keeps later cycles structurally related without making them byte-identical.

## Phrase roles

Each phrase receives one explicit role selected from the programme vocabulary:

- statement;
- answer;
- restatement;
- sequence;
- development;
- contrast;
- bridge;
- build;
- climax;
- release;
- reprise;
- cadence;
- suspension;
- decay;
- restart.

The current 16-phrase form remains unchanged. D1 annotates its musical function rather than rewriting its played notes.

## Evidence-aware cadence rules

D1 cannot manufacture resolution.

- Critical emits interrupted cadence intent.
- Unknown emits no-cadence intent.
- Warning remains open or suspended.
- Healthy can resolve only from current, non-stale evidence.
- Replay recovery emits recovery cadence intent only when the movement is marked `fromEvidence`.

Unresolved questions remain in memory until a supported resolved or recovery cadence clears them.

## Memory bounds

The default history limit is eight entries per tracked category. The memory stores only composition metadata:

- recent phrase roles;
- recent transformations;
- cadence history;
- recent bass, rhythm and arpeggio functions;
- recent foreground and service roles;
- bounded state history;
- last statement and answer;
- transition origin and destination;
- recovery source theme;
- unresolved question.

It contains no raw telemetry payloads, credentials, provider values, audio nodes or wall-clock decisions.

## Validation

Focused tests prove:

- identical journeys produce byte-equivalent plans and memory;
- memory remains frozen, serialisable and bounded after long runs;
- cycle roles develop rather than repeat identically;
- all state treatments preserve `ATLAS_THEME`;
- Lost Signal fragments rather than erases the theme;
- recent transforms cannot repeat mechanically for three phrases;
- Critical and Unknown cannot resolve;
- incomplete replay cannot claim recovery;
- confirmed replay recovery reprises the shared theme and clears the unresolved question;
- reset reproduces the exact first plan;
- no D1 source uses runtime randomness, wall-clock decisions or audio APIs.

## Review boundary

The diagnostic route is:

```text
/lab/system-symphony-apu-song-plan/
```

It schedules no audio. Approval of D1 confirms the memory and planning architecture, not an audible theme rewrite. Audible motif grammar remains Pass D2, harmonic destinations remain Pass D3, and structural arpeggio composition remains Pass D4.
