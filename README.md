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

The push event, validation gate, deploy result, and Cloudflare Pages outcome are separate signals. `deploy.yml` handles the build path; `deploy-watch` independently verifies whether Cloudflare actually produced the expected deployment.

## Live data

The homepage stops claiming activity and starts showing it. The Live Signal section and GitHub Pulse feed read from real endpoints so the page reflects the estate instead of describing it from memory.

`github-pulse` holds the GitHub token server-side and exposes a cached read-only JSON shape for repository activity. `site-pulse` exposes Cloudflare Analytics in a browser-safe form. `deploy-watch` confirms the latest Cloudflare Pages deployment outcome. `atlas-api-public` exposes the versioned public surface for registry, health, search, stats, and badge data.

## How it fits into Atlas Systems

This repo is the public surface of the estate. [`github-pulse`](https://github.com/AtlasReaper311/github-pulse), [`site-pulse`](https://github.com/AtlasReaper311/site-pulse), [`deploy-watch`](https://github.com/AtlasReaper311/deploy-watch), [`atlas-api-public`](https://github.com/AtlasReaper311/atlas-api-public), and [`atlas-corpus`](https://github.com/AtlasReaper311/atlas-corpus) all feed it; [`atlas-infra`](https://github.com/AtlasReaper311/atlas-infra) defines the deployment shape it runs through.

A portfolio becomes credible when the thing making the claim is wired to the system that proves it.

---

Part of [atlas-systems.uk](https://atlas-systems.uk)
