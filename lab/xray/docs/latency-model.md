# Latency model

Every number Request X-Ray shows comes from the constants in `src/engine.js`.
They are a teaching model chosen for legibility, not a measurement of any real
system. This document records what each one is and why it is that value, so a
future change to the model is a decision rather than an accident.

## Request path

| Layer | Cost | Reason |
|---|---|---|
| browser | 5ms | Building and dispatching the request. Cheap, and it should look cheap. |
| edge | 10ms | TLS termination and edge processing at the nearest point of presence. |
| router | 5ms | Resolving which upstream pool owns the path. An internal lookup, so cheaper than the edge. |
| api | 20ms | Handler dispatch and deadline setup, paid once per attempt. |
| service | 40ms | Business logic. The most expensive thing that is not storage. |
| cache | 5ms | A memory lookup. Small enough that a hit reads as almost free. |
| database | 60ms | A real query. The single most expensive hop, which is the point of caching. |

## Response path

A response is cheaper than a decision, so the return hops cost less than the
request hops that produced them.

| Layer | Cost |
|---|---|
| router | 3ms |
| edge | 5ms |
| browser | 8ms |

## Retry backoff

Backoff is exponential from a 30ms base and is added to the api hop of the
attempt it delays, so the waiting is visible on the layer that chose to wait.

| Attempt | Backoff |
|---|---|
| 1 | 0ms |
| 2 | 30ms |
| 3 | 60ms |
| 4 | 120ms |

## Latency variance

With variance on, each layer gains a pseudo-random amount of extra time up to
its own ceiling: edge 40ms, router 10ms, api 10ms, service 60ms, cache 5ms,
database 50ms. Variance only ever adds time.

The generator is seeded from the configuration itself, so a given set of
switches always produces the same trace. That matters because the URL is the
only persistence this tool has; a permalink has to reproduce an experiment
rather than re-roll it.

## Rules the model holds itself to

1. **A failure stops where it is owned.** A request that exhausts its retries
   ends at the api layer, and no response travels back out through the router,
   the edge, or the browser. A rate-limited request ends at the router. Only a
   successful request generates the return trip. The diagram shows where the
   pipeline gave up, not a polite unwind.
2. **The deadline is per attempt, not per request.** Each attempt gets the full
   `timeoutMs`. This is why three retries against a 50ms deadline can spend
   510ms in total without any single attempt exceeding 50ms.
3. **A hop that cannot finish inside the deadline is truncated, not dropped.**
   It appears in the trace with the time it actually had and an outcome of
   `timeout`. When the deadline was already spent before that layer was
   reached, the hop is recorded at 0ms and says so; the call never started.
4. **The summary total always equals the sum of the hops.** There is no
   overhead hiding anywhere. This is asserted in the test suite across every
   retry, deadline, and variance combination.

## Reference traces

These are asserted in `test/engine.test.mjs`. If a model change moves them, the
tests fail before the documentation goes stale.

| Scenario | Total | Downstream calls | Outcome |
|---|---|---|---|
| Healthy baseline | 101ms | 1 | ok |
| Retry storm | 290ms | 3 | exhausted |
| Cache stampede | 470ms | 3 | exhausted |
| Rate limited | 20ms | 0 | rate limited |
| Cascading timeout | 510ms | 4 | exhausted |

The retry storm is the canonical fixture, asserted hop by hop:

```
   5ms  browser   attempt 1  sent
  10ms  edge      attempt 1  forwarded
   5ms  router    attempt 1  routed
  20ms  api       attempt 1  dispatched
  40ms  service   attempt 1  error
  50ms  api       attempt 2  retrying
  40ms  service   attempt 2  error
  80ms  api       attempt 3  retrying
  40ms  service   attempt 3  error
   0ms  api       attempt 3  exhausted
```

## Explanation selection

`src/explanations.js` holds a fixed library of templates. The engine picks one
by matching the shape of the completed trace, in order, and fills it with that
run's numbers. No sentence is generated at runtime, so every sentence the tool
can produce is readable as source.

Two shapes need separating carefully. A cache stampede and a cascading timeout
both end in exhaustion with timeouts on every attempt. They are told apart by
where the time went: if the database was reached on every attempt and each of
those reads used at least half the deadline, the database is the load and the
run is a stampede. Otherwise the deadline was already spent upstream and the
run is a cascading timeout.

The test suite runs all 512 reachable configurations and asserts that none of
them falls through to the unclassified fallback.

## Failure modes of the tool itself

- **A hand-edited permalink.** Out-of-range values are clamped to the nearest
  legal value rather than rejected, so a broken link still loads a working
  experiment. Unknown query parameters are ignored.
- **Fonts unavailable.** The stylesheet imports the two brand typefaces from
  Google Fonts. If that request fails, the page falls back to Georgia and the
  platform monospace, and every other behaviour is unaffected.
- **Reduced motion.** When the visitor has asked for reduced motion, playback
  applies the whole trace in one pass with no animation. The hop table is the
  full non-visual equivalent of the diagram and is always present.
- **Clipboard unavailable.** The copy actions report that the clipboard could
  not be used and point at the address bar instead. Nothing else depends on it.
