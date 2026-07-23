# Reliability evidence archive

`specular-route-503-live-2026-07-15.json` is the immutable report artifact
produced by the bounded production canary in
[`atlas-infra` run 29454982522](https://github.com/AtlasReaper311/atlas-infra/actions/runs/29454982522).

The Reliability page displays this archive only when its full report
fingerprint is still present in the public chaos-evidence history. Scheduled
simulation evidence remains the latest assurance run and continues to update
independently.

To replace this archive, use a successful approved live run, preserve the
downloaded report without editing it, and update the fingerprint/source
assertions in `lab/tests/reliability-evidence.test.mjs`.
