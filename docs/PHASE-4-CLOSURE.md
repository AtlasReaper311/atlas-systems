# Phase 4 Model Promotion Observatory closure

Phase 4 is the public, read-only explanation of why a model was considered
suitable for a named capability. The final public surface is the [Model
Promotion Observatory](/systems/model-promotion/), separate from the [Evidence
Console](/systems/evidence/).

## Accepted authority and implementation

- Atlas Infra public projection authority: `dedad3acb5be7124876dfc40ee63e358286053cf`.
- Accepted atlas-eval-harness public evidence: `58a6008318957af7f4f6380798eadc820bc5b440`.
- Observatory foundation, PR #303: merged as `d6418f86148b322c655efff9a73ee2bc38654492`.
- Capability comparison and Regression Microscope, PR #308: source head `445005512309bd9f3a80ab54f339f9ac13ba747b`, merged as `e7b5f266e1b4132cf7918a1cec8265878ba78e35`.

The Observatory consumes only accepted public-safe projection fields. It does
not consume private evaluation records.

## Public capability and candidate set

The shipped capability set is:

- `ramone-rag-generation`;
- `ramone-live-chat`;
- `corpus-retrieval`;
- `daily-digest-synthesis`;
- `postmortem-drafting`.

The two comparison candidates are `qwen3.5-mtp` and `qwen3:14b`. Comparison is
capability-scoped. There is no universal ranking or winner.

The public trail preserves only observed or contract-defined states:

`EVAL PREPARED -> EVALUATION -> HUMAN REVIEW -> PROMOTION`

For the accepted RAG records, qwen3.5-mtp is 3/3, human reviewed, and
promotion approved. qwen3:14b is 3/3, review pending, and promotion not
approved. The qwen3:14b postmortem record is 6/7 and evaluated-failed with the
known `format-contract-failure` category. The qwen3:14b Daily Digest record is
1/3 and evaluated-failed, while its regression state remains
`unknown-not-observed`. Missing stages remain pending, unknown, or not-required
according to the accepted projection.

The accepted regression vocabulary is limited to
`unsupported-fabrication`, `failed-abstention`, `grounding-failure`,
`unsupported-causal-claim`, and `format-contract-failure`. The public surface
does not reproduce prompts, answers, private context, or reasoning traces.

## Evidence Console relationship

The Evidence Console answers: “What proves this operational or public claim?”
The Model Promotion Observatory answers: “Why was this model considered
suitable for this capability?” The two surfaces link to each other for context
but remain separate products. Model Promotion is not a fourth Evidence Console
view and does not copy model comparison data into Console views.

## Privacy and deployment boundary

The public route is reproducible from the accepted public-safe receipts stored
under `systems/model-promotion/evidence/`. The shipped source and receipts
exclude private prompts, raw answers, reasoning traces, private source context,
private repository identities, local paths, hosts, IP addresses, private
endpoints, secrets, internal evidence URIs, private incidents, and unsupported
runtime configuration.

`PROMOTION APPROVED != DEPLOYED`. A receipt does not prove model installation,
current routing, Open WebUI or Home Assistant state, provider state, runtime
health, service health, or current live model identity. A website deployment is
separate from model deployment.

## Browser and deployment evidence

PR #308 exact-head browser evidence was accepted from run `35685901254` at
source head `445005512309bd9f3a80ab54f339f9ac13ba747b`. The route-derived
capture completed through the approved workflow with pinned Chromium and
Firefox tooling. The retained artifact is
`public-interface-preview-evidence-445005512309bd9f3a80ab54f339f9ac13ba747b`
with digest
`sha256:a36043ecb962e98ae51be851a95e20d01d755610307d15cde3a056063e85588c`.
This is historical evidence for the exact PR #308 head.

The PR #308 merge revision completed the normal production deployment and
custom-domain verification path in run `35692247677`. The observed jobs
included Pages output validation, HTML and link validation, Cloudflare Pages
deployment, edge-cache purge, custom-domain verification, commit identity
confirmation, and corpus refresh. This proves that merged source revision's
website rollout path. It does not prove model deployment or model runtime
state.

## Evidence state and residual gaps

The source, pull request, merge, deployment, and live layers remain separate:

| Layer | Closure record |
| --- | --- |
| Source | Observatory, comparison, regression, linkage, privacy tests, and this record are committed in the Phase 4.6 source change. |
| Pull request | The closure change is reviewed through one bounded draft PR for issue #298. |
| Merge | Not performed by this task. |
| Website deployment | Not performed by this task for the closure head. Prior #303 and #308 deployment records remain exact-head evidence. |
| Live verification | Closure-head custom-domain and live verification remain pending until an owner-authorized merge and automatic deployment complete. |

Residual gaps are explicit: the public receipts do not contain runtime model
identity or live routing evidence; qwen3:14b is not newly promoted; failed and
unknown regression states remain as published; and future capabilities require
new accepted public-safe projections. No model evaluation, promotion, routing,
provider, or runtime mutation is part of Phase 4 closure.

## Tracker recommendation

Issues #296 and #297 are technically satisfied by their merged implementations
and independently observed rollout evidence, subject to the owner deciding
whether to close them. Issue #298 is ready for owner merge review only after
its exact-head checks and any required browser approval are satisfied. Issue
#299 remains the programme tracker and should not be closed until the closure
change is merged, its production rollout is observed, and the custom-domain
route is independently verified.
