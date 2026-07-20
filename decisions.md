# Atlas Systems — decisions

A record of architectural and operational choices made on this estate.
Each entry says what was decided, why, and where the consequences live.
Entries are dated and additive: if a later decision overrides an earlier
one, the earlier one stays in place with a note.

The audience is a senior engineer joining this codebase six months from
now and asking "why is it like this?" The answers here should mean they
don't have to ask.

---

## 2026-06 — Reusable workflows as the deployment standard

**Decision.** All deployable repos use one of two reusable workflows
defined in `atlas-infra/.github/workflows/`:
- `deploy-worker.yml` for every Cloudflare Worker
- `validate-static.yml` for every Cloudflare Pages static site

Each repo holds a thin caller workflow (~12 lines) that names the
reusable workflow, passes a label and optional flags, and forwards
secrets with `secrets: inherit`.

**Why.** Before this, five Worker repos and three static sites each had
their own deploy.yml. Five near-identical files meant five places to
update on every change to the deploy shape; in practice that meant the
files drifted, and changes to one rarely propagated to the others. The
reusable workflow makes the pipeline definition canonical: a change to
the template propagates everywhere by Git ref resolution at workflow
queue time.

**Consequences.**
- Worker repos: public Worker repositories use the shared deployment workflow; private callers remain source-owned and are not enumerated on public surfaces.
- Static repos: `atlas-systems`, `status`, `atlas-doc-viewer`.
- Adding a new repo of either kind is a copy of a 12-line template.
- A change to the pipeline shape (a new lint step, a different Node
  version, a different Discord embed format) is one PR to atlas-infra.

**Tradeoff acknowledged.** Reusable workflows pin to a Git ref. Caller
repos that reference `@main` will pick up changes immediately, including
breaking ones. The alternative — pinning to a tag like `@v1` — was not
chosen because the rollout was small and same-day, but if breakage
becomes a problem later, switching callers to a tag ref is a one-line
change per repo.

---

## 2026-06 — atlas-notify deploys on workflow_run, not push

**Decision.** Unlike the other four Workers, atlas-notify's deploy
workflow triggers on `workflow_run` of its existing `ci.yml`
(workflow name: "CI"), filtered to runs that concluded successfully on
main.

```yaml
on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]
    branches: [main]

jobs:
  deploy:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
```

**Why.** atlas-notify is the only Worker with a real test suite (Vitest,
12 tests covering all three auth dialects). Running tests inside the
deploy workflow would mean running them twice on every push — once in
ci.yml, once in deploy.yml — and the two test runs would post to two
different Discord channels (ci-cd and api-deploys), giving the
impression of two independent gates when there's really one.

`workflow_run` puts the CI suite in front of the deploy as a real gate,
without duplication. The ci-cd channel stays the source of truth for
test results; the api-deploys channel stays the source of truth for
deploy outcomes.

**Tradeoff.** `workflow_run` only fires after CI completes, so deploys
are slightly slower than a direct push trigger (the CI run has to
finish first). For atlas-notify specifically this is correct: never
deploy a router that fails its own auth-dialect tests.

---

## 2026-06 — Two Cloudflare deploy tokens, scoped narrowly

**Decision.** The estate uses two separate Cloudflare API tokens for
deployment, never one account-wide token.

| Secret name | Cloudflare permissions | Used by |
|---|---|---|
| `CF_WORKERS_DEPLOY_TOKEN` | Workers Scripts: Edit, Workers Routes: Edit | every Worker repo |
| `CF_PAGES_DEPLOY_TOKEN` | Cloudflare Pages: Edit | every static-site repo |
| `CF_CACHE_PURGE_TOKEN` | Zone cache purge only | optional post-deploy static-site cache invalidation |

`CF_ACCOUNT_ID` accompanies the deploy tokens. `CF_ZONE_ID` accompanies
`CF_CACHE_PURGE_TOKEN`. Tokens are stored as per-repo GitHub Actions secrets
(no org-level secrets — AtlasReaper311 is a user account).

**Why.** A leaked Workers token can edit Worker scripts and routes, but
not Pages projects, DNS, or anything else. A leaked Pages token can
deploy Pages projects but cannot touch Workers. The blast radius of any
single token leak is bounded by the token's permission class, not by
the breadth of the account.

**Cache purge is separate.** Static-site deploys may purge the Cloudflare
edge cache after `wrangler pages deploy`, but that uses `CF_CACHE_PURGE_TOKEN`,
not the Pages deploy token. This keeps deployment and cache invalidation as
separate permissions while preventing stale JavaScript assets from lingering
after a successful deploy.

**Runtime secrets are separate.** Tokens that Workers themselves use at
runtime (e.g. deploy-watch's Pages: Read token, site-pulse's Zone
Analytics: Read token) are set on the Worker with `wrangler secret put`,
not in GitHub Actions, and have their own narrower scope. The
deploy-time and runtime token paths never share credentials.

---

## 2026-06 — Routes use zone_id, never zone_name

**Decision.** Every `routes = [...]` entry in every `wrangler.toml` uses
the literal Cloudflare zone ID, not the human-readable zone name.

Correct:
```toml
{ pattern = "api.atlas-systems.uk/notify*", zone_id = "8ba6350a..." }
```

Wrong (will fail in CI):
```toml
{ pattern = "api.atlas-systems.uk/notify*", zone_name = "atlas-systems.uk" }
```

**Why.** Resolving a zone name to a zone ID requires Account: Read
permission on the token making the call. The narrowly-scoped
`CF_WORKERS_DEPLOY_TOKEN` deliberately lacks that permission. Local
`wrangler deploy` runs with a broader interactive token and resolves
names fine; CI runs with a scoped token and silently fails with
"Could not find zone." Using `zone_id` everywhere removes the asymmetry
between local and CI deploys.

**How this was caught.** atlas-notify's wildcard route was set to
`zone_name`, the named route to `zone_id`. The named route deployed
fine; the wildcard failed on every CI run. Fixed in the same commit
that rewired atlas-notify to the reusable workflow.

---

## 2026-06 — Named environments inherit nothing

**Decision.** Every `[env.dev]` block in every `wrangler.toml`
redeclares `vars`, `kv_namespaces`, and any other binding the Worker
reads from. Dev environments deliberately omit `routes` and `triggers`.

```toml
[env.dev]
workers_dev = true

[env.dev.vars]
CACHE_TTL_SECONDS = "60"
# ... redeclared, not inherited from the top level

[[env.dev.kv_namespaces]]
binding = "PULSE_CACHE"
id = "<dev-namespace-id>"  # separate from production
```

**Why.** Wrangler's named environments do not inherit `vars`,
`kv_namespaces`, `routes`, or `triggers` from the top level of the
config. A dev environment that doesn't redeclare its bindings deploys
with them empty — a silent failure that only shows up at runtime as
missing environment variables or undefined KV namespaces.

Dev environments must not declare production routes (`api.atlas-systems.uk/...`)
or production triggers (`crons`) for safety: a dev Worker must not
claim production traffic or run scheduled jobs against production
state. `workers_dev = true` reaches the dev Worker at a separate
`workers.dev` URL.

---

## 2026-06 — html-validate ruleset relaxed for portfolio style

**Decision.** Across all three static-site repos, the html-validate
config extends `html-validate:recommended` but disables three rules and
demotes one to a warning:

```json
{
  "extends": ["html-validate:recommended"],
  "rules": {
    "no-implicit-button-type": "off",
    "no-trailing-whitespace": "off",
    "no-raw-characters": "warn",
    "void-style": "off",
    "attribute-boolean-style": "off",
    "no-inline-style": "off",
    "long-title": "off"
  }
}
```

**Why.** The recommended ruleset surfaced ~67 violations across the
seven HTML files on first run. Each was reviewed:
- `no-implicit-button-type` — buttons outside a `<form>` default to
  type="button" already; adding it is style preference, not a real
  hazard. The site has no forms.
- `no-trailing-whitespace` — invisible characters with no functional
  impact; stylistic only.
- `no-raw-characters` — most raw `&` characters were in Google Fonts
  URLs and human-readable section titles ("Composition & Synthesis")
  that all major browsers render correctly. Demoted to warning so they
  show in logs without failing the build.
- The four `style` rules were already off in the original config.

**What remained.** Genuine accessibility issues (bare `<nav>` landmarks
needing aria-labels; gallery-dot buttons needing aria-labels; an `<img>`
with no `src` attribute) were fixed in code, not relaxed away. The
ruleset's job is to catch things users notice; cosmetic style
preferences belong in code review, not in CI.

**Tradeoff acknowledged.** A future contributor might add a button
inside a form expecting `type="button"` by default, when the actual
default in a form is `type="submit"`. If the site ever grows forms,
the rule should be re-enabled, and any existing buttons inside the new
forms audited.

---

## 2026-06 — Hard gate on static sites, not soft monitoring

**Decision.** All three static-site repos disconnected Cloudflare's
native Git integration. The only path to production is now
`wrangler pages deploy` from inside the validated GitHub Actions
workflow. A failed validate job means a failed deploy job means
nothing reaches production.

**Why.** The alternative considered was keeping native Git integration
on and running validation in parallel — a "soft gate" where a broken
HTML tag would still ship and the GitHub status check would just go
red afterwards. Soft gates report on harm after it lands; hard gates
prevent it. The harm being prevented (a broken nav, a dead `<img>`, a
malformed page) is exactly the kind of regression that's costly and
embarrassing on a portfolio site whose purpose is to demonstrate
production discipline.

**Cutover safety.** For each site, the Actions workflow ran in
parallel with native integration for two to three pushes first, to
confirm reliability before disconnecting native. The order was:
1. Add the workflow.
2. Let it run alongside native for several pushes.
3. Disconnect native only after multiple green Actions runs.
4. Verify by pushing once more and confirming only one new deployment
   appeared in the Pages dashboard (from Wrangler, not from GitHub).

This sequence meant at no point could a broken Actions run take the
site down: until step 3, the native integration was still the real
deploy path; after step 3, the Actions run was proven reliable.

---

## 2026-06 — Three Discord channels, one signal per channel

**Decision.** Pipeline outcomes route to three dedicated channels:

| Channel | Signal | Webhook secret |
|---|---|---|
| `#api-deploys` | every Worker deploy outcome | `DISCORD_API_DEPLOYS_WEBHOOK` |
| `#deploy-log` | every static-site deploy outcome | `DISCORD_DEPLOY_WEBHOOK` |
| `#ci-cd` | CI/test outcomes (atlas-notify, atlas-kit-python-rag) | `DISCORD_CICD_WEBHOOK` |

**Why.** A single firehose channel buries useful signal. Three
narrow channels mean each one's silence is meaningful: if `#ci-cd` is
quiet and `#api-deploys` is quiet, the day was uneventful. If
`#api-deploys` has reds, you know exactly which class of deploy failed
before reading the message.

Notifications are sent directly via `curl` from inside the reusable
workflows, not routed through atlas-notify, because (a) the workflows
are self-contained and don't depend on the router being up, and (b)
the existing event-router envelope adds a layer of indirection that
isn't useful for outcomes whose schema is already stable.

**Open question, deferred.** A future architecture flowing pipeline
events *through* atlas-notify (so they also populate the Lab page
Failure log) would unify the event bus but add a dependency. Not done
in this rollout; revisit when the Failure log proves out.

---

## 2026-06 — Three pipeline shapes, no fourth

**Decision.** Every repo on the estate fits one of three shapes:

| Shape | Validation | Deploy | Outcome notification |
|---|---|---|---|
| **Worker** | wrangler dry-run + ESLint (+ Vitest where present) | wrangler deploy | api-deploys |
| **Static site** | html-validate + lychee | wrangler pages deploy | deploy-log |
| **Library / Kit** | language-native (ruff/mypy/pytest, or docker compose build) | none — published as code | ci-cd |

A repo that doesn't fit one of these shapes is treated as a signal that
either the shape list is wrong (and needs extending deliberately, with
its own reusable workflow) or the repo itself is doing too many things.

**Why.** Three shapes are tractable to keep in your head; ten are not.
The cost of forcing a fourth pattern into existence is the
maintenance burden of a fourth template. Worth paying when justified;
not worth paying for one-off needs that the existing shapes mostly
cover.

---

## 2026-06 — atlas-infra documents itself

**Decision.** atlas-infra is not just a folder of reusable workflows;
it carries `docs/CICD-DECISIONS.md` (the reference index of patterns)
and `docs/decisions.md` (this file). A new repo's owner can copy a
template, read the docs, and have working CI/CD without anyone
explaining anything.

**Why.** Tribal knowledge dies. Infrastructure that documents itself
survives. The `decisions.md` model — what was decided, why, what
consequences flow from it — works because the audience is a future
engineer, who may be future-you with no memory of tonight's session.

This file is appended to, never rewritten. A decision being overridden
gets a follow-up entry citing the original. The history of why this
estate is shaped the way it is should be reconstructible from this
document.

---

## 2026-07 — Ramone uses Chroma-backed, reference-gated session memory

**Decision.** Ramone's public Q&A flow now accepts a client-generated
UUID v4 `session_id` and stores recent user/assistant turns in a
dedicated Chroma collection, separate from the Atlas documentation
collection. The standalone Ramone page and the Lab widget share the
same browser key, `ramone:session_id`, so a visitor can continue a
conversation across both public surfaces. Both surfaces also expose a
visible "new conversation" control that clears that key and reloads.

`ramone-edge` only validates and forwards the session id. It never
reads, writes, logs, or stores raw conversation memory. Memory lives in
`ollama-rag-kit` behind the existing `ATLAS_SECRET` boundary.

**Ollama API choice.** The streaming path moved from Ollama's
`/api/generate` endpoint to `/api/chat`. This was a deliberate
architecture change, not incidental refactoring: `/api/generate` takes
one prompt string, while `/api/chat` has a native `messages` shape that
can carry system instructions, reference history, and the current
RAG-grounded user prompt without manual prompt concatenation.

**History injection rule.** Stored turns are not replayed blindly on
every request. A small reference detector injects history only when the
current question appears to depend on prior context, such as "it",
"that", "your previous answer", "first", or "second". Standalone
questions stay clean RAG calls even when the browser has an active
session.

When history is injected, it is transformed into a reference-only
system block containing prior assistant answers only. Prior user turns
are deliberately omitted because they often contain one-off formatting
instructions or prompt-shaping requests. This prevents a past request
like "answer as First: X. Second: Y." from becoming a standing rule on
later unrelated questions.

**Why.** Memory is useful for natural follow-ups ("what does it do?",
"what was second?") but dangerous if prior instructions are given fresh
authority. The chosen design gives Ramone continuity for references
while preserving the RAG contract: factual answers still come from the
numbered context blocks, and old formatting does not bleed into new
questions.

**Verification.**
- `ramone-edge`: `npm run check`, `npm run lint`, and Vitest all pass
  after adding the reset control and `has_memory` notification field.
- `ollama-rag-kit`: the rebuilt Docker container passed 30 pytest tests
  copied into `/tmp/tests`, including streaming/memory integration tests.
- Live health check returned `status=ok`, Ollama reachable, Chroma
  reachable, and 239 indexed chunks.
- Live behavior check: after a forced `First:/Second:` answer, an
  unrelated "How does the CI/CD pipeline work?" question answered in
  normal prose instead of carrying the old format forward.
- Live follow-up check: asking what was after `Second` in the previous
  answer resolved to ChromaDB.

**Consequences.**
- `MEMORY_CONTEXT_TURNS=0` remains the kill switch for both reads and
  writes.
- The memory collection is `ramone_sessions`; document evidence remains
  in `atlas_docs`.
- Future tests should keep covering both failure modes: failed model
  generations must not write memory, and standalone questions must not
  receive history.
- The Lab widget and standalone Ramone page intentionally share one
  session key unless a future product decision makes separate
  conversations more useful.

---

## 2026-07 — Ramone voice deploy requires live HA wiring and secret sync

**Decision.** Ramone voice deploy is a Home Assistant client of the
`ramone-voice-trigger` Worker, not a separate deployment system. The
live HA config must include all four caller pieces: a conversation
automation, `script.github_trigger`, `rest_command.github_trigger`, and
the custom repo sentence list. HA must also store a local
`ramone_trigger_secret` whose value matches the Worker's current
`TRIGGER_SECRET`.

**Why.** The Worker can be deployed and healthy while voice deploy is
still dead if the HA caller files were never merged, or if the Worker
secret was rotated without updating HA's `secrets.yaml`. That failure
looks like "Ramone deploy is broken", but the root cause is caller
configuration, not GitHub Actions or Cloudflare.

**Consequences.**
- After rotating the Worker `TRIGGER_SECRET`, update HA's
  `ramone_trigger_secret` locally and restart or reload HA.
- Do not paste the real secret into chat, logs, docs, or source.
- A placeholder secret is useful for config validation but should
  produce `401 unauthorised` until replaced.
- Keep the raw Ollama integration and the Ramone memory proxy clearly
  labelled so the voice pipeline does not silently bypass memory.

**Verification.**
- HA config check should pass after adding the caller wiring.
- `GET https://api.atlas-systems.uk/trigger/_meta` from the HA container
  should return the `ramone-trigger` metadata.
- A POST with the placeholder secret should return `401 unauthorised`.
- A real end-to-end deploy test requires the user-held secret and should
  be confirmed by Discord notification plus the GitHub Actions run.
