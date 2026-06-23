/**
 * Lab page Ramone card — interactive behaviour.
 * Turnstile removed. KV rate limits on the Worker are the protection layer.
 */

(function () {
  "use strict";

  const RAMONE_BASE = "https://ramone.atlas-systems.uk";

  const card = document.getElementById("ramone-card");
  if (!card) return;

  const stateLabel  = document.getElementById("ramone-state-label");
  const form        = document.getElementById("ramone-mini-form");
  const input       = document.getElementById("ramone-mini-input");
  const sendBtn     = document.getElementById("ramone-mini-send");
  const answer      = document.getElementById("ramone-mini-answer");
  const answerText  = document.getElementById("ramone-mini-answer-text");
  const sourcesEl   = document.getElementById("ramone-mini-sources");
  const metaEl      = document.getElementById("ramone-mini-meta");

  let inFlight = false;

  // --- Status polling -------------------------------------------------
  let lastAwake = null;
  function setState(awake) {
    if (awake === lastAwake) return;
    lastAwake = awake;
    card.classList.toggle("awake", awake);
    card.classList.toggle("asleep", !awake);
    stateLabel.textContent = awake ? "live" : "asleep";
  }
  async function pollStatus() {
    try {
      const res = await fetch(`${RAMONE_BASE}/status`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setState(!!data.awake);
    } catch (_) {
      setState(false);
    }
  }
  pollStatus();
  setInterval(pollStatus, 30_000);

  // --- Composer state -------------------------------------------------
  function updateSendState() {
    sendBtn.disabled = !(input.value.trim().length > 0 && !inFlight);
  }
  input.addEventListener("input", updateSendState);
  form.addEventListener("submit", (e) => { e.preventDefault(); transmit(); });

  // --- Transmit -------------------------------------------------------
  async function transmit() {
    const question = input.value.trim();
    if (!question || inFlight) return;

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
      console.error("ramone card error:", err);
      showError("Network error.");
    } finally {
      inFlight = false;
      input.value = "";
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
        e.style.marginTop = "6px";
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

  updateSendState();
})();
