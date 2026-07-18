<div align="center">
  <img src="https://raw.githubusercontent.com/AtlasReaper311/AtlasReaper311/main/atlas-icon-dark-256.png" width="88" alt="Atlas Systems"/>
</div>

# atlas-systems

```
┌─────────────────────────────────────────────┐
│  ATLAS SYSTEMS // atlas-systems             │
│  the front of the system, showing the       │
│  infrastructure it documents                │
└─────────────────────────────────────────────┘
```

[![Deploy](https://github.com/AtlasReaper311/atlas-systems/actions/workflows/deploy.yml/badge.svg)](https://github.com/AtlasReaper311/atlas-systems/actions)
![Static](https://img.shields.io/badge/static-html%2Fcss%2Fjs-f5a623?style=flat-square&labelColor=0a0a0f)
![Cloudflare Pages](https://img.shields.io/badge/cloudflare-pages-4ade80?style=flat-square&labelColor=0a0a0f)
![Cost](https://img.shields.io/badge/cost-%C2%A30-aaa9a0?style=flat-square&labelColor=0a0a0f)

Live source for [atlas-systems.uk](https://atlas-systems.uk). Hand-built HTML, CSS, and JavaScript with no framework, validated and deployed to Cloudflare Pages through the reusable `atlas-infra` static-site workflow on every push to `main`.

## Stack

- Static HTML, CSS, and JavaScript
- No framework and no build step
- Cloudflare Pages for hosting
- GitHub Actions for validation, publishing, notification, sitemap generation, and corpus refresh
- Live data from `github-pulse`, `site-pulse`, `deploy-watch`, and `atlas-api-public`

## Pipeline

| Stage | Workflow | Trigger | Does |
|---|---|---|---|
| Sitemap | `deploy.yml` | push to `main`, manual dispatch | Regenerates `sitemap.xml` from real file history |
| Static validation | `atlas-infra/validate-static.yml` | called by `deploy.yml` | Runs `html-validate` and offline internal-link checks |
| Deploy | `atlas-infra/validate-static.yml` | validation success | Publishes to Cloudflare Pages through Wrangler |
| Notify | `atlas-infra/validate-static.yml` | always | Reports deploy outcome to Discord and the Lab failure log |
| Corpus refresh | `atlas-corpus/refresh-corpus.yml` | push to `main` | Re-ingests the estate docs into the searchable corpus |
| Outcome verification | `deploy-watch` | Cloudflare cron | Confirms the actual Pages deployment result from Cloudflare's API |
| Branch preview | `preview.yml` | push to `feat/system-symphony-h1-h8-preview` | Validates and publishes a non-production `pages.dev` branch preview |

The push event, validation gate, deploy result, and Cloudflare Pages outcome are separate signals. `deploy.yml` handles the build path; `deploy-watch` independently verifies whether Cloudflare actually produced the expected deployment.

### System SYMPHONY branch preview

The System SYMPHONY preview branch has an intentionally narrow deployment path. Pushing
`feat/system-symphony-h1-h8-preview` runs the complete static-site checks, then
publishes the repository root with Wrangler's non-production `--branch` flag
under the shorter Pages branch name `system-symphony-h1-h8`.
The expected stable alias is
`https://system-symphony-h1-h8.atlas-systems-44t.pages.dev`. The workflow also
records Wrangler's immutable deployment URL in the GitHub environment and job
summary.

The preview job uses the `pages-preview` GitHub environment and the existing
least-privilege `CF_PAGES_DEPLOY_TOKEN` and `CF_ACCOUNT_ID` secrets. It cannot
run for `main`, does not regenerate or commit the sitemap, does not purge the
production zone cache, does not refresh the corpus, and does not send a
production deployment notification. Pushing the named branch is therefore an
explicit preview-deployment action; local work does not publish anything.

The same branch now carries the H9 Ghost Circuit candidate: seeded arpeggio
direction and gating, a separate cyberpunk riff voice, five-phase arrangements,
visible phase and audition controls, a focus A/B mix, codec retry and stricter
resource bounds. Production remains unchanged until the branch is explicitly
approved and merged.

The preview alias is not currently on the production `specular-sonify` and
`deploy-watch` Worker origin allowlists. Demo mode is the complete listening
surface on the branch preview; live mode deliberately remains stale/Unknown for
those feeds until a separate, exact-origin Worker change is reviewed and
approved. The preview workflow does not widen CORS or deploy those Workers.

## Live data

The homepage stops claiming activity and starts showing it. The Live Signal section and GitHub Pulse feed read from real endpoints so the page reflects the estate instead of describing it from memory.

`github-pulse` holds the GitHub token server-side and exposes a cached read-only JSON shape for repository activity. `site-pulse` exposes Cloudflare Analytics in a browser-safe form. `deploy-watch` confirms the latest Cloudflare Pages deployment outcome. `atlas-api-public` exposes the versioned public surface for registry, health, search, stats, and badge data.

## Estate search

The site has one reusable search component in `static/js/estate-search/`.
The homepage widget, the persistent nav overlay, and the Lab corpus
panel all share `client.js` for endpoint failover and `render.js` for
result rows. Search stays literal: it renders ranked corpus hits with
repo, path, type, score, excerpt, and an "ask ramone about this" action.
Ramone remains the synthesis surface and still cites its sources.

Browser search tries the local corpus when previewing on localhost,
then `https://corpus.atlas-systems.uk/search`, then the edge proxy at
`https://api.atlas-systems.uk/v1/search`. Both production hosts are
already present in `_headers` `connect-src`. The full wiring notes live
in `docs/README-estate-search.md`.

Quick verification after changes:

1. Search the homepage widget for `kv write limits` and confirm ranked
   hits render with the Ramone bridge action.
2. Press Ctrl+K or Cmd+K, type `tunnel`, arrow through results, press
   Enter, then Esc and confirm focus returns to the trigger.
3. Click "ask ramone about this" and confirm `/lab/#ramone-card`
   pre-fills the composer without submitting.

## How it fits into Atlas Systems

This repo is the public surface of the estate. [`github-pulse`](https://github.com/AtlasReaper311/github-pulse), [`site-pulse`](https://github.com/AtlasReaper311/site-pulse), [`deploy-watch`](https://github.com/AtlasReaper311/deploy-watch), [`atlas-api-public`](https://github.com/AtlasReaper311/atlas-api-public), and [`atlas-corpus`](https://github.com/AtlasReaper311/atlas-corpus) all feed it; [`atlas-infra`](https://github.com/AtlasReaper311/atlas-infra) defines the deployment shape it runs through.

A portfolio becomes credible when the thing making the claim is wired to the system that proves it.

---

Part of [atlas-systems.uk](https://atlas-systems.uk)
