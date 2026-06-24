/**
 * Lab page Ramone hero — interactive behaviour.
 * Drives the hero section at the top of atlas-systems.uk/lab/
 */

(function () {
  "use strict";

  const RAMONE_BASE = "https://ramone.atlas-systems.uk";
  const MAX = 2000;

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

  let inFlight = false;

  // --- Status polling -------------------------------------------------
  let lastAwake = null;
  function setState(awake) {
    if (awake === lastAwake) return;
    lastAwake = awake;
    card.classList.toggle("awake", awake);
    card.classList.toggle("asleep", !awake);
    if (stateLabel) {
      stateLabel.textContent = awake ? "awake · llama3.1:8b · RTX 5070" : "asleep";
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

  // --- Char counter + send state --------------------------------------
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

  // --- Suggestion chips -----------------------------------------------
  if (suggestions) {
    suggestions.addEventListener("click", (e) => {
      const chip = e.target.closest(".ramone-hero-chip");
      if (!chip) return;
      input.value = chip.textContent;
      updateCharCount();
      autosize();
      updateSendState();
      input.focus();
    });
  }

  // --- Transmit -------------------------------------------------------
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

      cursor.remove();
      const parts = [];
      if (firstTokenAt !== null) parts.push(`first token ${Math.round(firstTokenAt - startedAt)}ms`);
      parts.push(`total ${Math.round(performance.now() - startedAt)}ms`);
      parts.push(`${totalChars} chars`);
      metaEl.textContent = parts.join(" · ");

    } catch (err) {
      console.error("ramone hero error:", err);
      showError("Network error.");
    } finally {
      inFlight = false;
      input.value = "";
      updateCharCount();
      autosize();
      updateSendState();
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
  }

  function renderSources(sources) {
    sourcesEl.innerHTML = "";
    sources.forEach((s, i) => {
      const tag = document.createElement("span");
      tag.className = "src";
      const id = (s && typeof s.id === "string" ? s.id : "source")
        .replace(/[<>&"']/g, (c) => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&#039;"})[c]);
      tag.innerHTML = `<strong>[${i + 1}]</strong> ${id}`;
      if (s && s.preview) tag.title = s.preview;
      sourcesEl.appendChild(tag);
    });
  }

  updateCharCount();
  updateSendState();
})();
