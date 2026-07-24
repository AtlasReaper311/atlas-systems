# Phase G: Public Interface V2 conformance

## Outcome

Declare the representative human-facing Atlas Systems browser surfaces through
the accepted `atlas-control-plane/public-interface-surface/v1` manifest and
validate that declaration against a pinned, merged `atlas-infra` authority.

This is a nonvisual governance adoption. It does not alter page markup,
presentation, publishing ownership, cache policy, routes, runtime data, or
deployment behaviour.

## Declared coverage

- homepage;
- Work;
- Writing;
- one scheduler-owned published article;
- About;
- Systems;
- Lab;
- the representative System Map Lab tool;
- the error surface.

Specialist Lab tools continue to use the same governed shell and their existing
repository-native tests. Machine-facing JSON, health, evidence, telemetry,
audio, and metadata responses remain outside the browser interface manifest.
The preserved noindex Lab console remains behind the governed Lab directory.

## Authority and evidence

- authority repository: `AtlasReaper311/atlas-infra`;
- authority commit: `e40d5a5cee6001df17918f69700aebb85d3d1cdd`;
- policy: `policy/public-interface-system-v2.json`;
- schema: `contracts/v1/public-interface/public-interface-surface.schema.json`;
- validator: `scripts/validate_public_interface.py`;
- declaration: `.atlas/public-interface.json`.

The pull-request job has read-only permissions, checks out the exact candidate
commit, verifies the authority SHA, fails closed on declaration drift, and
retains its JSON report for 14 days.

## Validation

From the sibling Atlas workspace:

```bash
python3 ../atlas-infra/scripts/validate_public_interface.py \
  --root ../atlas-infra \
  --manifest .atlas/public-interface.json
```

Repository-native CI remains responsible for HTML, generated ownership,
browser behaviour, accessibility, links, cache policy, and deployment
contracts. Phase G does not replace the approved browser evidence.

## Rollback

Revert the Phase G commit to remove the manifest and conformance job. No
runtime asset or production route changes as part of this adoption.
