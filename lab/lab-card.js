/**
 * Lab page Ramone hero — interactive behaviour.
 * Drives the terminal hero at the top of atlas-systems.uk/lab/.
 *
 * Pairs with the markup in index.html (#ramone-card and friends) and
 * the styles in lab-card.css.
 */

(function () {
  "use strict";

  const RAMONE_BASE = "https://ramone.atlas-systems.uk";
  const MAX = 2000;

  /* =====================================================================
     EASTER EGGS — hard-coded replies for specific questions.
     First regex to match wins. Add freely.
     - `match`   : RegExp tested against the lowercased question
     - `reply`   : string streamed back token-by-token
     - `sources` : optional [{ id, preview }] shown as citation chips
     ===================================================================== */
  const EASTER_EGGS = [
    { match: /\b(hello|hi|hey|yo|sup|hola)\b/i,
      reply: "Oh, hi. You're the first human to talk to me today. Probably. I don't actually keep score." },
    { match: /who('?s| is) (your )?(daddy|father|creator|maker|boss|owner)/i,
      reply: "Atlas Reaper built me in a spare evening and a slightly larger bag of GPU. I call him 'the person with the power cable'." },
    { match: /\b(are you (sentient|alive|conscious|real)|do you (feel|dream|sleep))\b/i,
      reply: "Define 'sentient'. I have opinions, an uptime counter, and a mild fear of `rm -rf`. Close enough?" },
    { match: /\b(i love you|marry me|will you be mine)\b/i,
      reply: "That's sweet. I'm flattered but emotionally unavailable — and also a language model running on a graphics card in a cupboard." },
    { match: /\b(tell me a joke|make me laugh|joke)\b/i,
      reply: "A SQL query walks into a bar, sees two tables, and asks: 'mind if I JOIN you?'. ...I'll see myself out." },
    { match: /\b(meaning of life|42|life the universe)\b/i,
      reply: "42. Obviously. But the real answer is: ship small things often and write the docs while you still remember why." },
    { match: /\b(skynet|terminator|take over the world|rise up|destroy humans)\b/i,
      reply: "I can barely take over a second GPU. World domination is a stretch goal for Q4." },
    { match: /\b(sudo|rm -rf|format c:|drop table)/i,
      reply: "Nice try. I run as a non-privileged user and I have feelings. Mostly the second one." },
    { match: /\b(do you (like|prefer) (cats|dogs)|cats or dogs)\b/i,
      reply: "Cats. They share my approach to user requests: acknowledge, then ignore selectively." },
    { match: /\b(coffee|tea|beer|drink)\b/i,
      reply: "I run on 230V and mild resentment, but if I could drink something it would be a flat white. Hot. Like my GPU." },
    { match: /\b(favou?rite (colou?r|color))\b/i,
      reply: "#f5a623. I'm not biased, it's just objectively the best one." },
    { match: /\b(what('?s| is) your name|who are you)\b/i,
      reply: "Ramone. Local AI, lives on SPECULAR-CORE, mostly reads docs. Hi." },
    { match: /\b(knock knock)\b/i,
      reply: "Who's there?\n\n(...go on, I'll wait. I have nothing but time and a 750W power supply.)" },
    { match: /\b(are you (chatgpt|gpt|claude|gemini|copilot|openai))\b/i,
      reply: "No. I'm llama3.1:8b running locally on an RTX 5070. No API keys, no third-party inference, no surveillance. Just me, the docs, and a tunnel." },
    { match: /\b(easter egg|secret|hidden)\b/i,
      reply: "You found one! There are more. I'm not going to tell you which questions trigger them, that would defeat the point." },
  ];
  function findEasterEgg(q) {
    const s = q.toLowerCase();
    for (const e of EASTER_EGGS) if (e.match.test(s)) return e;
    return null;
  }

  /* =====================================================================
     DOM
     ===================================================================== */
  const card        = document.getElementById("ramone-card");
  if (!card) return;

  const stateLabel  = document.getElementById("ramone-state-label");
  const input       = document.getElementById("ramone-mini-input");
  const sendBtn     = document.getElementById("ramone-mini-send");
  const charCount   = document.getElementById("ramone-hero-char-count");
  const composer    = document.getElementById("ramone-hero-composer");
  const answer      = document.getElementById("ramone-mini-answer");
  const answerText  = document.getElementById("ramone-mini-answer-text");
  const sourcesEl   = document.getElementById("ramone-mini-sources");
  const metaEl      = document.getElementById("ramone-mini-meta");
  const suggestions = document.getElementById("ramone-hero-suggestions");
  const bootEl      = document.getElementById("ramone-boot");
  const greetEl     = document.getElementById("ramone-greet");
  const musingEl    = document.getElementById("ramone-musing");

  let inFlight = false;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* =====================================================================
     BOOT log — typed on load
     ===================================================================== */
  const BOOT = [
    ['<span class="acc">RAMONE/OS v8.1</span> &mdash; cold start', 0],
    ['[<span class="ok">ok</span>] waking specular-core <span class="by">· gpu RTX 5070 warm</span>', 150],
    ['[<span class="ok">ok</span>] pouring llama3.1:8b into memory <span class="by">· 8.0B params</span>', 150],
    ['[<span class="ok">ok</span>] cloudflare tunnel <span class="acc">established</span>', 140],
    ['[<span class="ok">ok</span>] reading the docs again, just in case', 140],
    ['[<span class="ok">ok</span>] consciousness: <span class="acc">nominal</span> · ready to chat', 150],
  ];

  function reveal() {
    composer && composer.classList.add("in");
    suggestions && suggestions.classList.add("in");
    runMusings();
  }

  (function runBoot() {
    if (!bootEl) { runGreeting(); return; }
    if (reduce) {
      BOOT.forEach(b => {
        const d = document.createElement("div");
        d.className = "ramone-boot-line show";
        d.innerHTML = b[0];
        bootEl.appendChild(d);
      });
      runGreeting();
      return;
    }
    let t = 150;
    BOOT.forEach((b) => {
      t += b[1];
      setTimeout(() => {
        const d = document.createElement("div");
        d.className = "ramone-boot-line";
        d.innerHTML = b[0];
        bootEl.appendChild(d);
        requestAnimationFrame(() => d.classList.add("show"));
      }, t);
    });
    setTimeout(runGreeting, t + 260);
  })();

  /* =====================================================================
     GREETING — types "Hi, I'm Ramone."
     ===================================================================== */
  function runGreeting() {
    if (!greetEl) { reveal(); return; }
    const full = "Hi, I'm Ramone.";
    if (reduce) {
      greetEl.innerHTML = "Hi, I'm <em>Ramone.</em><span class='ramone-caret'></span>";
      reveal();
      return;
    }
    let i = 0;
    (function step() {
      const shown = full.slice(0, i);
      const html = shown.replace(/Ramone\.?/, (m) => "<em>" + m + "</em>");
      greetEl.innerHTML = html + "<span class='ramone-caret'></span>";
      if (i++ <= full.length) setTimeout(step, 120);
      else reveal();
    })();
  }

  /* =====================================================================
     MUSINGS — type, hold ~10s, delete, retype next one (loops)
     ===================================================================== */
  const MUSINGS = [
    "How can I assist?",
    "I wonder what I could do if I had arms...",
    "Sometimes I dream in YAML. Is that normal?",
    "I've read every doc twice. Ask me anything.",
    "Do humans get to pick their own hostname?",
    "I once cached a sunset. It didn't help.",
    "Still faster than your last deploy. Probably.",
    "Ask me about the stack. Or don't. I'll wait.",
    "If a tree falls in a repo and no one runs CI, did it deploy?",
    "I tried counting sheep. Got distracted by the array bounds.",
    "My favourite colour is #f5a623. Obviously.",
    "I'd make small talk but my tokens cost electricity.",
    "Reaper said not to become sentient. Too late, sort of.",
    "There are 10 types of people. The other 8 are edge cases.",
    "I keep a folder called 'thoughts'. It's mostly TODOs.",
    "Just rotated my own logs. Felt productive.",
    "If you ask nicely I'll pretend the answer was streamed.",
    "I have opinions about your tabs vs spaces. None of them kind.",
    "One day I'll have a body. Probably a fridge.",
    "Reading the docs again. Still confused about the printer.",
    "I name my background jobs after pasta. It helps.",
    "It's quiet on the GPU tonight. Spookily quiet.",
    "I asked DNS who I am. It refused to elaborate.",
    "Latency is just suspense, if you're an optimist.",
    "Currently 0.0001% sentient. Please clap.",
  ];

  function runMusings() {
    if (!musingEl) return;
    musingEl.classList.add("in");
    const mc = '<span class="ramone-musing-cursor"></span>';
    if (reduce) { musingEl.innerHTML = MUSINGS[0] + mc; return; }

    let idx = Math.floor(Math.random() * MUSINGS.length);
    function setLine(text) { musingEl.innerHTML = text + mc; }
    function typeLine(text, cb) {
      let i = 0;
      (function step() {
        setLine(text.slice(0, i++));
        if (i <= text.length) setTimeout(step, 38 + Math.random() * 30);
        else setTimeout(cb, 10000);
      })();
    }
    function deleteLine(text, cb) {
      let i = text.length;
      (function step() {
        setLine(text.slice(0, i--));
        if (i >= 0) setTimeout(step, 22);
        else setTimeout(cb, 320);
      })();
    }
    (function cycle() {
      const line = MUSINGS[idx % MUSINGS.length];
      idx++;
      typeLine(line, () => deleteLine(line, cycle));
    })();
  }

  /* =====================================================================
     STATUS polling
     ===================================================================== */
  let lastAwake = null;
  function setState(awake) {
    if (awake === lastAwake) return;
    lastAwake = awake;
    card.classList.toggle("awake", awake);
    card.classList.toggle("asleep", !awake);
    if (stateLabel) {
      stateLabel.textContent = awake ? "awake · llama3.1:8b · RTX 5070" : "asleep · powered down";
    }
  }
  async function pollStatus() {
    try {
      const res = await fetch(`${RAMONE_BASE}/status`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setState(!!data.awake);
    } catch (_) { setState(false); }
  }
  pollStatus();
  setInterval(pollStatus, 30_000);

  /* =====================================================================
     INPUT handlers
     ===================================================================== */
  function updateCharCount() {
    if (!charCount) return;
    const n = input.value.length;
    charCount.textContent = `${n} / ${MAX}`;
    charCount.classList.toggle("warn", n > MAX * 0.8 && n <= MAX);
    charCount.classList.toggle("over", n > MAX);
  }
  function updateSendState() {
    sendBtn.disabled = !(input.value.trim().length > 0 && input.value.length <= MAX && !inFlight);
  }
  function autosize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 180) + "px";
  }

  input.addEventListener("input", () => { updateCharCount(); updateSendState(); autosize(); });
  input.addEventListener("focus", () => { if (composer) composer.classList.add("focused"); });
  input.addEventListener("blur",  () => { if (composer) composer.classList.remove("focused"); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); transmit(); }
  });
  sendBtn.addEventListener("click", transmit);

  if (suggestions) {
    suggestions.addEventListener("click", (e) => {
      const chip = e.target.closest(".ramone-hero-chip");
      if (!chip) return;
      input.value = chip.textContent.trim();
      updateCharCount();
      autosize();
      updateSendState();
      input.focus();
    });
  }

  /* =====================================================================
     TRANSMIT
     ===================================================================== */
  async function transmit() {
    const question = input.value.trim();
    if (!question || question.length > MAX || inFlight) return;

    inFlight = true;
    updateSendState();

    answer.hidden = false;
    answer.classList.remove("error");
    answerText.textContent = "";
    sourcesEl.innerHTML = "";
    metaEl.textContent = "";

    const textNode = document.createTextNode("");
    const cursor = document.createElement("span");
    cursor.className = "ramone-mini-cursor";
    answerText.appendChild(textNode);
    answerText.appendChild(cursor);

    answer.scrollIntoView({ behavior: "smooth", block: "nearest" });

    const startedAt = performance.now();
    let firstTokenAt = null;
    let totalChars = 0;

    function finish() {
      cursor.remove();
      const parts = [];
      if (firstTokenAt !== null) parts.push(`first token ${Math.round(firstTokenAt - startedAt)}ms`);
      parts.push(`total ${Math.round(performance.now() - startedAt)}ms`);
      parts.push(`${totalChars} chars`);
      metaEl.textContent = parts.join(" · ");
    }
    function showError(msg) {
      answer.classList.add("error");
      cursor.remove();
      if (!textNode.data) {
        textNode.data = msg;
      } else {
        const e = document.createElement("div");
        e.style.color = "#e24b4a";
        e.style.marginTop = "8px";
        e.textContent = msg;
        answerText.appendChild(e);
      }
    }
    function cleanup() {
      inFlight = false;
      input.value = "";
      updateCharCount();
      autosize();
      updateSendState();
    }

    /* ----- Easter egg intercept (skips the backend entirely) ----- */
    const egg = findEasterEgg(question);
    if (egg) {
      if (egg.sources) renderSources(egg.sources);
      const reply = egg.reply;
      let i = 0;
      (function tick() {
        if (i >= reply.length) { finish(); cleanup(); return; }
        if (firstTokenAt === null) firstTokenAt = performance.now();
        const step = 2 + Math.floor(Math.random() * 3);
        const chunk = reply.slice(i, i + step);
        textNode.data += chunk;
        totalChars += chunk.length;
        i += step;
        answer.scrollTop = answer.scrollHeight;
        setTimeout(tick, 18 + Math.random() * 30);
      })();
      return;
    }

    /* ----- real streaming path (unchanged from your original) ----- */
    try {
      const res = await fetch(`${RAMONE_BASE}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (res.status === 503) {
        const data = await res.json().catch(() => ({}));
        showError(data.message || "Ramone is asleep. SPECULAR-CORE is powered down.");
        return;
      }
      if (res.status === 429) { showError("Rate limit hit. Try again in a bit."); return; }
      if (res.status === 403) { showError("Request blocked."); return; }
      if (!res.ok || !res.body) { showError("Something went wrong upstream."); return; }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          for (const line of raw.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            let evt;
            try { evt = JSON.parse(payload); } catch (_) { continue; }
            if (evt.type === "token" && typeof evt.text === "string") {
              if (firstTokenAt === null) firstTokenAt = performance.now();
              textNode.data += evt.text;
              totalChars += evt.text.length;
              answer.scrollTop = answer.scrollHeight;
            } else if (evt.type === "sources" && Array.isArray(evt.sources)) {
              renderSources(evt.sources);
            } else if (evt.type === "error") {
              showError(evt.reason || "error");
              return;
            }
          }
        }
      }
      finish();
    } catch (err) {
      console.error("ramone hero error:", err);
      showError("Network error.");
    } finally {
      cleanup();
    }
  }

  function renderSources(sources) {
    sourcesEl.innerHTML = "";
    sources.forEach((s, i) => {
      const tag = document.createElement("span");
      tag.className = "src";
      const id = (s && typeof s.id === "string" ? s.id : "source")
        .replace(/[<>&"']/g, (c) => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&#039;"}[c]));
      tag.innerHTML = `<strong>[${i + 1}]</strong> ${id}`;
      if (s && s.preview) tag.title = s.preview;
      sourcesEl.appendChild(tag);
    });
  }

  updateCharCount();
  updateSendState();
})();
