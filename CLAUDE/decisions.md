# Atlas Systems — Technical Decisions Log

## Infrastructure

### Hosting
- **Decision:** Cloudflare Pages via native Git integration
- **Date:** May 2026
- **Detail:** Cloudflare watches `main` branch of `atlas-doc-viewer` 
  directly. Auto-deploys to `cv.atlas-systems.uk` on every push. 
  No GitHub Actions involved in production.
- **Why:** Simpler than Actions for static sites, zero config 
  drift, free tier sufficient.

### CI/CD
- **Decision:** Cloudflare native integration in production; 
  GitHub Actions pattern documented but dormant
- **Detail:** `atlas-doc-viewer/.github/workflows/deploy-pages.yml` 
  exists as a fallback — would deploy via Cloudflare API token 
  if native integration was removed. Not firing in production.
- **Why:** Redundancy documented intentionally. Pattern is 
  reusable for future repos that need Actions.

### Docker
- **Decision:** Local pipeline working, not yet in production
- **Detail:** `atlas-infra/docker/hello-atlas` → `Dockerfile` + 
  `server.py` → Python HTTP server with `/health` and `/` 
  endpoints → confirmed working locally on port 8081
- **Status:** Foundation is proven. Next step is docker-compose 
  for multi-container orchestration.

### Repo Structure
- `atlas-doc-viewer` — main site repo, deploys to 
  `cv.atlas-systems.uk` via Cloudflare native integration
- `atlas-infra` — infrastructure and Docker experiments

---

## Site Design

### Aesthetic
- **Decision:** Dark/terminal aesthetic
- **Why:** Matches the technical identity of Atlas Systems, 
  signals intentionality to senior engineers

### Stack
- **Decision:** Static HTML/CSS/JS to start
- **Why:** Plugs directly into Cloudflare Pages pipeline, 
  hand-crafted signals fundamentals over framework dependency. 
  React components can be added selectively later.

---

## What Doesn't Exist Yet (known gaps)
- No GitHub Actions workflow firing in production
- No automated testing before deploy
- No docker-compose for multi-container orchestration
- No AWS integration

---

## Decisions Pending
- Final colour palette and typography (dark/terminal direction set)
- Whether to use Hugo/Docusaurus for the Knowledge Base (Pillar 1)
- GitHub repo naming convention for Logic Legos (Pillar 2)

---

## Update Log
- 2026-05-28: Document created, Pillars 1 and 3 complete