# Atlas Systems

Live source for [atlas-systems.uk](https://atlas-systems.uk) — Atlas Reaper's technical portfolio and live infrastructure environment.

![Deploy Notify](https://github.com/AtlasReaper311/atlas-systems/actions/workflows/notify-deploy.yml/badge.svg)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare%20Pages-F38020?logo=cloudflare&logoColor=white)

---

## What this is

Hand-built HTML, CSS, and JavaScript (no framework), deployed to Cloudflare Pages via native Git integration on every push to `main`. The site is a live demonstration of the infrastructure it documents, not a static CV: commit activity, deploy status, and GitHub stats pull from real data through `github-pulse` and `atlas-notify`, not hardcoded placeholders.

## Stack

- Static HTML / CSS / JavaScript, hand-written, no build step
- Dark/terminal aesthetic (`#0a0a0f` background, amber `#f5a623` accent, IBM Plex Mono + DM Serif Display)
- Cloudflare Pages for hosting and deploy
- GitHub Actions for deploy notifications and a scheduled activity digest

## Pipeline

| Workflow | Trigger | Does |
|---|---|---|
| `notify-deploy.yml` | push to `main` | Posts a Discord embed confirming a deploy was triggered |
| `weekly-digest.yml` | scheduled, every Sunday 18:00 UTC | Pulls commit, PR, and issue activity across all public repos and posts a summary embed |

Both post through Discord webhooks into a dedicated server used as a live infrastructure dashboard.

## Related repos

- [`atlas-notify`](https://github.com/AtlasReaper311/atlas-notify) — Cloudflare Worker event router (Bearer, GitHub HMAC, and Cloudflare webhook auth dialects)
- [`github-pulse`](https://github.com/AtlasReaper311/github-pulse) — Cloudflare Worker GitHub stats proxy with KV caching
- [`ollama-rag-kit`](https://github.com/AtlasReaper311/ollama-rag-kit) — containerised local RAG pipeline (Ollama, ChromaDB, FastAPI)
- [`atlas-doc-viewer`](https://github.com/AtlasReaper311/atlas-doc-viewer) — CV viewer, deployed at [cv.atlas-systems.uk](https://cv.atlas-systems.uk)

## Author

Atlas Reaper. Final-year Game Development student at Abertay University, Saltire Scholar. Audio systems and AI infrastructure.

[atlas-systems.uk](https://atlas-systems.uk) · [GitHub](https://github.com/AtlasReaper311)
