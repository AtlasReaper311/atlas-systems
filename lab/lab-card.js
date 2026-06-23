/**
 * Lab page Ramone card — interactive behaviour.
 *
 * This script attaches to the #ramone-card element rendered by
 * lab-card.html. It does three things:
 *
 *   1. Polls /status on the Ramone Worker every 30s for the awake dot.
 *   2. Renders a Turnstile widget into the form, blocking submit until
 *      the user has a fresh token.
 *   3. Submits the question to /ask and streams the SSE response into
 *      the in-card answer area.
 *
 * The Worker's ALLOWED_ORIGINS variable must include the Lab page's
 * origin for the fetch calls to succeed (atlas-systems.uk is in the
 * default list shipped with this build).
 *
 * Configuration: set RAMONE_BASE and TURNSTILE_SITE_KEY below. Both are
 * non-secret and live in the page source.
 */

(function () {
  "use strict";

  const RAMONE_BASE = "https://ramone.atlas-systems.uk";
  // Public Turnstile site key. Replace at deploy time with the same
  // value used in ramone-edge's wrangler.toml TURNSTILE_SITE_KEY.
  const TURNSTILE_SITE_KEY = "0x4AAAAAADpZl2kZWXDpcitz";

  // Lazy-load Turnstile so the Lab page does not pay the bytes when
  // Ramone is not visible. The card is far enough down the page that
  // most viewers never see it; only load if the card actually exists.
  const card = document.getElementById("ramone-card");
  if (!card) return;

  ensureTurnstileScript()
    .then(initCard)
    .catch((err) => {
      console.error("ramone card: failed to load Turnstile", err);
      initCard(); // still wire up status polling and links
    });

  function ensureTurnstileScript() {
    return new Promise((resolve, reject) => {
      if (window.turnstile) return resolve();
      const existing = document.querySelector("script[data-ramone-turnstile]");
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", reject);
        return;
      }
      const s = document.createElement("script");
      s.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      s.dataset.ramoneTurnstile = "1";
      s.onload = () => resolve();
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function initCard() {
    const dot = document.getElementById("ramone-dot");
    const stateLabel = document.getElementById("ramone-state-label");
    const form = document.getElementById("ramone-mini-form");
    const input = document.getElementById("ramone-mini-input");
    const sendBtn = document.getElementById("ramone-mini-send");
    const turnstileEl = document.getElementById("ramone-mini-turnstile");
    const answer = document.getElementById("ramone-mini-answer");
    const answerText = document.getElementById("ramone-mini-answer-text");
    const sourcesEl = document.getElementById("ramone-mini-sources");
    const metaEl = document.getElementById("ramone-mini-meta");

    let turnstileToken = null;
    let turnstileWidgetId = null;
    let inFlight = false;

    // --- Turnstile -----------------------------------------------------
    if (window.turnstile && window.turnstile.render) {
      try {
        turnstileWidgetId = window.turnstile.render(turnstileEl, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "dark",
          size: "compact",
          callback: (token) => {
            turnstileToken = token;
            updateSendState();
          },
          "expired-callback": () => {
            turnstileToken = null;
            updateSendState();
          },
          "error-callback": () => {
            turnstileToken = null;
            updateSendState();
          },
        });
      } catch (err) {
        console.warn("ramone card: turnstile render failed", err);
      }
    }

    // --- Status polling -----------------------------------------------
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
        if (!res.ok) throw new Error("status " + res.status);
        const data = await res.json();
        setState(!!data.awake);
      } catch {
        setState(false);
      }
    }
    pollStatus();
    setInterval(pollStatus, 30_000);

    // --- Composer state -----------------------------------------------
    function updateSendState() {
      const has = input.value.trim().length > 0;
      sendBtn.disabled = !(has && turnstileToken && !inFlight);
    }
    input.addEventListener("input", updateSendState);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      transmit();
    });

    async function transmit() {
      const question = input.value.trim();
      if (!question || !turnstileToken || inFlight) return;

      inFlight = true;
      updateSendState();

      // Reveal answer area; reset state from any previous Q.
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
          headers: {
            "content-type": "application/json",
            "x-atlas-turnstile": turnstileToken,
          },
          body: JSON.stringify({ question }),
        });

        // Burn the token. Turnstile is single-use.
        if (window.turnstile && turnstileWidgetId !== null) {
          window.turnstile.reset(turnstileWidgetId);
          turnstileToken = null;
        }

        if (res.status === 503) {
          const data = await res.json().catch(() => ({}));
          showError(
            data.message ||
              "Ramone is asleep right now. SPECULAR-CORE is powered down.",
          );
          return;
        }
        if (res.status === 429) {
          showError("Rate limit hit. Try again in a bit.");
          return;
        }
        if (res.status === 403) {
          showError("Challenge failed. Refresh and try again.");
          return;
        }
        if (!res.ok || !res.body) {
          showError("Something went wrong upstream.");
          return;
        }

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
              try {
                evt = JSON.parse(payload);
              } catch {
                continue;
              }
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
        renderMeta({
          firstTokenMs:
            firstTokenAt !== null ? Math.round(firstTokenAt - startedAt) : null,
          totalMs: Math.round(performance.now() - startedAt),
          chars: totalChars,
        });
      } catch (err) {
        console.error("ramone card transmit error:", err);
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
        const id = (s && typeof s.id === "string" ? s.id : "source").replace(
          /[<>&"']/g,
          (c) =>
            ({
              "<": "&lt;",
              ">": "&gt;",
              "&": "&amp;",
              '"': "&quot;",
              "'": "&#039;",
            })[c],
        );
        tag.innerHTML = `<strong>[${i + 1}]</strong> ${id}`;
        if (s && s.preview) tag.title = s.preview;
        sourcesEl.appendChild(tag);
      });
    }

    function renderMeta(m) {
      const parts = [];
      if (m.firstTokenMs !== null)
        parts.push(`first token ${m.firstTokenMs}ms`);
      parts.push(`total ${m.totalMs}ms`);
      parts.push(`${m.chars} chars`);
      metaEl.textContent = parts.join(" · ");
    }

    updateSendState();
  }
})();
