# Atlas Systems — Writing Voice & Style Guide

## Purpose
This document defines the writing style, tone, and formatting rules for all case study articles on atlas-systems.uk. Follow these rules precisely so every article reads consistently and authentically.

---

## Voice
The articles are written in first person by Atlas Reaper. The tone is:
- **Direct and precise** — says what it means, no filler
- **Technically confident** — uses correct terminology without over-explaining basics
- **Honest about problems** — documents failures and root causes as clearly as solutions
- **Not performative** — does not dramatise achievements or use motivational language

The reader is assumed to be a senior engineer or technical recruiter. Write as if explaining to a capable peer, not a beginner.

---

## Punctuation rules
- **No em dashes** (`—`) for extending thoughts or asides. Use a semicolon, brackets, or a new sentence instead.
- Brackets `()` for parenthetical asides
- Semicolons for closely related clauses
- Commas to extend a thought naturally within a sentence
- Em dashes are only acceptable in project titles (e.g. `SlamPunk — Dynamic Mix Engine`) and never in body prose

**Wrong:** "The system failed — which caused a cascade."
**Right:** "The system failed; this caused a cascade."
**Right:** "The system failed (which caused a cascade)."

---

## Sentence structure
- Lead with the subject and verb — do not bury them
- Avoid passive voice where possible
- One idea per sentence when dealing with technical cause/effect
- Short sentences for problem statements. Longer sentences are fine for explanations with commas.

---

## Specific words and phrases to avoid
- "In order to" → use "to"
- "It is worth noting that" → just say it
- "Leveraged" → use "used"
- "Utilised" → use "used"
- "Robust" as a vague positive
- "Seamless" unless describing something that is literally seamless
- "Cutting-edge", "state-of-the-art"
- "This allowed me to" (overused) → vary with "this meant", "this gave", "this enabled"
- Any phrase that sounds like a CV bullet point — write in full prose

---

## Technical writing rules
- All tool/node/object names are in `code style`: `metro`, `poly~`, `pattr`, `coll`
- File names in code style: `ATLAS_BOOTSTRAP.bat`, `velocity-int1.mp3`
- Paths in code style: `/mnt/l/Ollama/models`
- Numbers under 10 are written as words in prose; 10 and above as numerals
- Measurements always use numerals: `140 BPM`, `200Hz`, `-30.0 dB`, `5ms`

---

## Structure of a section
Each section follows this pattern:
1. Opening sentence that states what this section is about
2. The detail — technical explanation, process, decisions
3. Where relevant: a callout box summarising the key point
4. No summary sentence at the end restating what was just said — trust the reader

---

## Phase documentation voice
When writing about an engineering problem, use this voice pattern:

**Problem statement:** Short, factual. What was attempted and what went wrong.
**Root cause callout:** One or two sentences only. Precise technical cause, no fluff.
**Resolution:** How it was fixed. Explain the logic behind the fix, not just what was done.
**Resolution callout:** A one-line summary of the fix.

The resolution should explain *why* the solution works, not just describe what was changed.

---

## What to include vs exclude

**Include:**
- The specific values, parameters, thresholds used (e.g. `-30.0 dB threshold, 4.0 ratio, 1ms attack`)
- The reasoning behind architectural decisions
- What was tried first and why it failed
- The transferable principle the problem/solution demonstrates

**Exclude:**
- Step-by-step instructions that read like a tutorial
- Obvious context the reader already has (don't explain what Docker is)
- Self-congratulatory framing ("I was proud of", "this was a real achievement")
- Filler transitions ("Moving on to...", "Next, I will discuss...")

---

## Outcomes section voice
The outcomes grid is factual (label + value). The two closing paragraphs follow this pattern:

**Paragraph 1:** What the system achieved technically. Concrete, specific.
**Paragraph 2:** The broader insight. What does this project demonstrate beyond itself? What is the transferable principle? This should be the most thoughtful sentence in the article.

---

## Bio reference
The author is Atlas Reaper — final year student at Abertay University, Saltire Scholar, audio systems engineer and AI infrastructure builder. Projects span game audio (SlamPunk, UE5), generative systems (SONIN, Max/MSP), and local AI infrastructure (Ramone, Ollama/Docker/WSL2).

---

## Existing articles for reference
Read these for tone and structure before writing a new one:
- W-01 SONIN: `/writing/sonin-generative-system/`
- W-02 SlamPunk: `/writing/slampunk-dynamic-mix-engine/`
- W-03 Ramone: `/writing/ramone-local-ai-system/`

The Ramone article is the strongest reference for voice. The SONIN article is the strongest reference for phase documentation structure.
