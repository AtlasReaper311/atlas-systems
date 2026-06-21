<div align="center">
  <img src="https://raw.githubusercontent.com/AtlasReaper311/AtlasReaper311/main/atlas-icon-dark-256.png" width="88" alt="Atlas Systems"/>
</div>

# atlas-systems

```
┌─────────────────────────────────────────────┐
│  ATLAS SYSTEMS // atlas-systems             │
│  the front of the system,                   │
│  showing the infrastructure it documents    │
└─────────────────────────────────────────────┘
```

[![Deploy Notify](https://github.com/AtlasReaper311/atlas-systems/actions/workflows/notify-deploy.yml/badge.svg)](https://github.com/AtlasReaper311/atlas-systems/actions)
![HTML5](https://img.shields.io/badge/html5-f5a623?style=flat-square&labelColor=0a0a0f)
![CSS3](https://img.shields.io/badge/css3-aaa9a0?style=flat-square&labelColor=0a0a0f)
![JavaScript](https://img.shields.io/badge/javascript-aaa9a0?style=flat-square&labelColor=0a0a0f)
![Cloudflare Pages](https://img.shields.io/badge/cloudflare-pages-4ade80?style=flat-square&labelColor=0a0a0f)

Live source for [atlas-systems.uk](https://atlas-systems.uk). Hand-built HTML, CSS, and JavaScript with no framework, deployed to Cloudflare Pages through native Git integration on every push to `main`.

The site demonstrates the infrastructure it documents rather than describing it. Commit activity, deploy status, and GitHub stats pull from real data through [`github-pulse`](https://github.com/AtlasReaper311/github-pulse) and [`atlas-notify`](https://github.com/AtlasReaper311/atlas-notify); none of it is hardcoded.

## Stack

- Static HTML, CSS, and JavaScript, hand-written, no build step
- Dark terminal aesthetic (`#0a0a0f` background, amber `#f5a623` accent, IBM Plex Mono and DM Serif Display)
- Cloudflare Pages for hosting and deploy
- GitHub Actions for deploy notifications and a scheduled activity digest

## Pipeline

| Workflow | Trigger | Does |
|---|---|---|
| `notify-deploy.yml` | push to `main` | Posts a Discord embed confirming a deploy was triggered |
| `weekly-digest.yml` | scheduled, Sundays 18:00 UTC | Pulls commit, PR, and issue activity across all public repos and posts a summary embed |

Both post through Discord webhooks into a server used as a live infrastructure dashboard.

## Live data

The homepage stops claiming activity and starts showing it. The Live Signal section and GitHub Pulse feed both read from `github-pulse`, a server-side proxy that holds the API token and caches responses, so a page view never touches the GitHub API directly and the token never reaches the browser.

## How it fits into Atlas Systems

This repo is the surface; everything else in the stack feeds it. The deploy badge above is the same workflow that reports into Discord, so the repo page and the dashboard tell the same story from two angles.

The transferable pattern is treating a portfolio as a deployed system: the credibility comes from the thing running and reporting on itself, not from a description of what it would do.

---

Part of [atlas-systems.uk](https://atlas-systems.uk)

