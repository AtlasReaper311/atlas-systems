# Atlas Systems — Case Study Article Template

## Purpose
This document defines the structure, HTML pattern, and section order for all case study articles published at `atlas-systems.uk/writing/`. Every article must follow this template exactly for visual and structural consistency.

---

## File location
```
writing/[slug]/index.html
```
Example: `writing/ramone-local-ai-system/index.html`

---

## Slug naming convention
Lowercase, hyphen-separated, descriptive. Examples:
- `ramone-local-ai-system`
- `slampunk-dynamic-mix-engine`
- `sonin-generative-system`

---

## Article numbering
Articles are numbered W-01, W-02, W-03 etc. in chronological order of when they were written (oldest = W-01). The writing index page lists them newest first (W-04 at top, W-01 at bottom). Update all article footer links when adding a new article.

---

## Required page sections (in order)

### 1. `<article-header>`
Two-column grid: left sidebar (meta) + right content.

**Left sidebar contains:**
- Back link → `/writing/`
- Article index (e.g. W-03)
- Date written (format: `27 May 2026`)
- Read time (e.g. `~12 min read`)
- Tags (use `.tag.highlight` for primary tag, `.tag` for secondary tags)

**Right content contains:**
- Section label: `Case Study`
- H1 article title (DM Serif Display)
- Subtitle (format: `Project Name — Type // Case Study`)
- Lede paragraph (1–2 sentences, what the article covers and why it matters)

---

### 2. Spec strip
Full-width grid of 5–6 spec cells. Each cell has a label and value. Examples:
- Timeline, Grade, Architecture, BPM Grid, Platform, Models, Engines

---

### 3. Article body
Two-column grid: left TOC (sticky) + right prose.

**TOC:**
- Sticky, disappears on mobile
- Links to all `<section id="">` anchors
- Active state highlights in amber as user scrolls

**Prose sections** (adjust per project, but always include):
- Overview
- Architecture / System overview
- Phase-by-phase problem documentation (minimum 2 phases)
- Technical sections specific to the project
- Outcomes

---

### 4. Article footer
Contains:
- Back link → `/writing/`
- Next article link (chronologically forward) or "Latest article" if most recent

---

## Phase documentation pattern
Each engineering problem follows this exact structure:

```
Phase marker (phase number + title)
↓
Prose describing what happened and what was attempted
↓
Error callout (red border) — Root Cause
↓
Resolution prose
↓
Success callout (green border) — Resolution summary
```

---

## Callout types
| Type | Border colour | Label colour | When to use |
|---|---|---|---|
| Default | amber | amber | Design decisions, architecture notes |
| `.error` | `#e24b4a` | `#e24b4a` | Root cause of a problem |
| `.success` | `#4ade80` | `#4ade80` | Resolution of a problem |
| `.warning` | amber | amber | Important caveats or gotchas |

---

## Outcomes section
Always ends with:
1. An outcomes grid (2x2 or 2x3) with label/value cells
2. Two closing paragraphs: one summarising what was achieved, one identifying the transferable insight or broader principle the project demonstrated

---

## Navigation
Every article must include:
- Desktop nav (same as all other pages)
- Mobile bottom nav with Writing tab active
- `<script src="/js/transitions.js"></script>` as the last script tag
- TOC scroll observer script

---

## Brand variables (copy into every `<style>` block)
```css
:root {
  --bg: #0a0a0f;
  --bg-1: #111118;
  --bg-2: #1a1a24;
  --border: rgba(255,255,255,0.08);
  --border-hi: rgba(255,255,255,0.16);
  --text: #e8e8e0;
  --text-dim: #aaa9a0;
  --text-faint: #555560;
  --accent: #f5a623;
  --accent-dim: rgba(245,166,35,0.12);
  --mono: 'IBM Plex Mono', monospace;
  --serif: 'DM Serif Display', Georgia, serif;
  --nav-h: 56px;
  --content-w: 720px;
}
```

---

## Google Fonts import (required)
```html
<link rel="stylesheet" href="/static/vendor/atlas-interface/v0.2.0/atlas-fonts.css">
```

---

## Tags reference
Use these exact tag names for consistency across the writing index and work page:

| Domain | Tag text |
|---|---|
| Audio | `Audio Systems` |
| Generative | `Generative Audio` |
| Game dev | `Game Dev` |
| AI | `AI / LLMs` |
| DevOps | `DevOps` |
| Hardware | `Hardware` |
| Max/MSP | `Max/MSP` |
| Unreal | `Unreal Engine 5` |
| Docker | `Docker` |
| DSP | `DSP` |

---

## Footer link pattern
After publishing a new article, update every other article's footer to point correctly in chronological order. The footer shows two links: ← previous article and next article →. The oldest article has no previous link. The newest article shows "Latest article" instead of a next link.

Current order (oldest → newest):
1. W-01 — SONIN (`/writing/sonin-generative-system/`)
2. W-02 — SlamPunk (`/writing/slampunk-dynamic-mix-engine/`)
3. W-03 — Ramone (`/writing/ramone-local-ai-system/`)

When adding W-04, update Ramone's footer to point forward to the new article.
