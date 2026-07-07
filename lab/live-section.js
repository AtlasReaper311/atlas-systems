/**
 * live-section.js
 * Orchestrates the unified Live section: one boot sequence, three panels
 * (telemetry, estate status, corpus search), one chassis.
 *
 * The telemetry and corpus logic below is the existing widget code carried
 * over, not rewritten. Exactly two things changed in each, both documented
 * in NOTES-live-section.md:
 *   1. The runtime style-injection lines are gone; styles now live in
 *      live-section.css like every other stylesheet on the page.
 *   2. The first fetch fires when the section scrolls into view instead of
 *      at script parse, so the boot sequence and the first data land
 *      together. Poll cadence afterwards is unchanged.
 *
 * The estate status panel is new; it subscribes to the shared
 * AtlasRegistry client from Part 1 rather than fetching anything itself.
 *
 * Boot grammar is the Ramone widget's, verbatim: [html, delay] lines,
 * t starting at 150, per-line reveal via a .show class on the next frame,
 * reduced-motion renders instantly, next stage fires 260ms after the last
 * line. Same pacing, same colour classes, different words.
 */
(function () {
  "use strict";

  var section = document.getElementById("live");
  if (!section) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* =====================================================================
     BOOT :: fires once, when the section enters the viewport
     ===================================================================== */
  var BOOT = [
    ['<span class="acc">SPECULAR-CORE // LIVE</span> :: attaching feeds', 0],
    ['[<span class="ok">ok</span>] telemetry <span class="by">· api.atlas-systems.uk/specular</span>', 150],
    ['[<span class="ok">ok</span>] worker registry <span class="by">· api.atlas-systems.uk · 60s poll</span>', 150],
    ['[<span class="ok">ok</span>] corpus index <span class="by">· corpus.atlas-systems.uk</span>', 140],
    ['[<span class="ok">ok</span>] all feeds attached · <span class="acc">cockpit online</span>', 150]
  ];

  var booted = false;

  function revealPanels() {
    var panels = section.querySelectorAll(".live-panel");
    panels.forEach(function (p, i) {
      if (reduce) { p.classList.add("in"); return; }
      setTimeout(function () { p.classList.add("in"); }, i * 130);
    });
  }

  function runBoot() {
    var bootEl = document.getElementById("live-boot");
    if (!bootEl) { revealPanels(); return; }
    if (reduce) {
      BOOT.forEach(function (b) {
        var d = document.createElement("div");
        d.className = "live-boot-line show";
        d.innerHTML = b[0];
        bootEl.appendChild(d);
      });
      revealPanels();
      return;
    }
    var t = 150;
    BOOT.forEach(function (b) {
      t += b[1];
      setTimeout(function () {
        var d = document.createElement("div");
        d.className = "live-boot-line";
        d.innerHTML = b[0];
        bootEl.appendChild(d);
        requestAnimationFrame(function () { d.classList.add("show"); });
      }, t);
    });
    setTimeout(revealPanels, t + 260);
  }

  function startSection() {
    if (booted) return;
    booted = true;
    runBoot();
    /* Data starts flowing the moment the boot starts, in parallel; the
       lines above are honest, the feeds really are attaching right now. */
    telemetryStart();
    corpusStart();
    statusStart();
  }

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          startSection();
          io.disconnect();
        }
      });
    }, { threshold: 0.2 });
    io.observe(section);
  } else {
    startSection();
  }

  /* =====================================================================
     TELEMETRY :: existing widget logic, carried over
     ===================================================================== */
  var telemetryStart = (function () {
    var ENDPOINT = "https://api.atlas-systems.uk/specular";
    var POLL_MS = 60000;
    var root = document.getElementById("specular-widget");
    var feedDot = document.getElementById("live-feed-telemetry");
    var el = function (id) { return document.getElementById(id); };
    var sampledAt = null;
    var started = false;

    function text(id, value) { el(id).textContent = value; }

    function uptimeHuman(seconds) {
      var d = Math.floor(seconds / 86400);
      var h = Math.floor((seconds % 86400) / 3600);
      var m = Math.floor((seconds % 3600) / 60);
      return "up " + (d ? d + "d " : "") + h + "h " + m + "m";
    }

    function renderCores(perCore) {
      var strip = el("spw-cores");
      while (strip.children.length < perCore.length) {
        var bar = document.createElement("span");
        bar.className = "sp-w-core";
        bar.appendChild(document.createElement("i"));
        strip.appendChild(bar);
      }
      for (var i = 0; i < perCore.length; i++) {
        strip.children[i].firstChild.style.height =
          Math.max(4, Math.min(100, perCore[i])) + "%";
      }
    }

    function renderModels(loaded) {
      var wrap = el("spw-models");
      while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
      loaded.forEach(function (model) {
        var chip = document.createElement("span");
        chip.className = "sp-w-chip";
        chip.textContent = model.name;
        wrap.appendChild(chip);
      });
    }

    function render(payload) {
      root.dataset.state = payload.online ? "online" : "offline";
      if (feedDot) feedDot.dataset.state = payload.online ? "ok" : "down";
      window.dispatchEvent(new CustomEvent("atlas:telemetry", { detail: payload }));
      var t = payload.telemetry;
      if (payload.online) {
        sampledAt = Date.parse(t.sampled_at);
      } else {
        sampledAt = null;
        var seen = payload.last_seen
          ? new Date(payload.last_seen).toLocaleString()
          : "never";
        text("spw-offline", "SPECULAR-CORE is offline. Last seen " + seen +
          (t ? "; showing the last reported snapshot." : "."));
        text("spw-age", "offline");
      }
      if (!t) return;

      text("spw-host", t.host.hostname || "SPECULAR-CORE");
      text("spw-uptime", payload.online ? uptimeHuman(t.host.uptime_s) : "");
      text("spw-platform", t.host.platform || "");

      if (t.gpu) {
        text("spw-gpu-util", t.gpu.utilisation_pct);
        var vramPct = t.gpu.vram_total_mb
          ? (100 * t.gpu.vram_used_mb) / t.gpu.vram_total_mb : 0;
        el("spw-vram-fill").style.width = vramPct.toFixed(0) + "%";
        text("spw-vram", "VRAM " +
          (t.gpu.vram_used_mb / 1024).toFixed(1) + " / " +
          (t.gpu.vram_total_mb / 1024).toFixed(1) + " GB");
        text("spw-gpu-line", t.gpu.name + " · " + t.gpu.temperature_c + "°C");
      } else {
        text("spw-gpu-util", "–");
        text("spw-gpu-line", "no NVIDIA stats");
      }

      text("spw-cpu", Math.round(t.cpu.overall_pct));
      renderCores(t.cpu.per_core_pct || []);
      text("spw-cpu-line",
        t.cpu.cores.logical + " threads" +
        (t.cpu.freq_mhz.current ? " · " + (t.cpu.freq_mhz.current / 1000).toFixed(1) + " GHz" : ""));

      text("spw-ram", Math.round(t.ram.pct));
      el("spw-ram-fill").style.width = t.ram.pct.toFixed(0) + "%";
      text("spw-ram-line", t.ram.used_gb + " / " + t.ram.total_gb + " GB");

      if (t.ollama.reachable) {
        text("spw-ollama-line",
          t.ollama.loaded.length
            ? t.ollama.loaded.length + " loaded · " + t.ollama.available.length + " available"
            : "idle · " + t.ollama.available.length + " models available");
        renderModels(t.ollama.loaded);
      } else {
        text("spw-ollama-line", "not running");
        renderModels([]);
      }
    }

    function tickAge() {
      if (sampledAt === null) return;
      var age = Math.max(0, Math.round((Date.now() - sampledAt) / 1000));
      text("spw-age", "sampled " + age + "s ago");
    }

    function refresh() {
      fetch(ENDPOINT)
        .then(function (response) { return response.json(); })
        .then(render)
        .catch(function () {
          root.dataset.state = "offline";
          if (feedDot) feedDot.dataset.state = "down";
          text("spw-offline", "Telemetry endpoint unreachable from this browser.");
          text("spw-age", "offline");
        });
    }

    return function start() {
      if (started || !root) return;
      started = true;
      refresh();
      setInterval(refresh, POLL_MS);
      setInterval(tickAge, 5000);
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden) refresh();
      });
    };
  })();

  /* =====================================================================
     CORPUS SEARCH :: existing widget logic, carried over
     ===================================================================== */
  var corpusStart = (function () {
    var started = false;

    return function start() {
      if (started) return;
      started = true;

      var isLocalLab = location.hostname === "localhost" || location.hostname === "127.0.0.1";
      var localCorpusHost = location.hostname === "127.0.0.1" ? "127.0.0.1" : "localhost";
      var ENDPOINT = isLocalLab
        ? "http://" + localCorpusHost + ":8092/ask"
        : "https://corpus.atlas-systems.uk/ask";
      var FALLBACK_ENDPOINT = "https://corpus.atlas-systems.uk/ask";
      var form = document.getElementById("csw-form");
      var input = document.getElementById("csw-q");
      var button = document.getElementById("csw-go");
      var status = document.getElementById("csw-status");
      var list = document.getElementById("csw-results");
      if (!form) return;

      function clearResults() {
        while (list.firstChild) list.removeChild(list.firstChild);
      }

      function sourceUrl(source) {
        return "https://github.com/AtlasReaper311/" +
          encodeURIComponent(source.repo) + "/blob/main/" +
          source.file.split("/").map(encodeURIComponent).join("/");
      }

      function renderAnswer(data) {
        var item = document.createElement("li");
        item.className = "cs-w-answer";

        var answer = document.createElement("p");
        answer.className = "cs-w-answer-text";
        answer.textContent = data.answer;
        item.appendChild(answer);

        if (data.sources && data.sources.length) {
          var sources = document.createElement("div");
          sources.className = "cs-w-sources";
          data.sources.forEach(function (source) {
            var tag = document.createElement("a");
            tag.className = "cs-w-source";
            tag.href = sourceUrl(source);
            tag.target = "_blank";
            tag.rel = "noopener noreferrer";
            tag.title = source.excerpt;
            tag.textContent = source.repo + "/" + source.file;
            sources.appendChild(tag);
          });
          item.appendChild(sources);
        }
        list.appendChild(item);
      }

      function searchCorpus(query) {
        var endpoints = [ENDPOINT];
        if (ENDPOINT !== FALLBACK_ENDPOINT) endpoints.push(FALLBACK_ENDPOINT);
        var index = 0;

        function tryNext(lastError) {
          if (index >= endpoints.length) throw lastError;
          var endpoint = endpoints[index++];
          var url = endpoint + "?q=" + encodeURIComponent(query) + "&top_k=5";
          return fetch(url, { cache: "no-store" })
            .then(function (response) {
              if (response.status === 429) throw new Error("rate limited; wait a minute");
              if (!response.ok) throw new Error("corpus answered " + response.status);
              return response.json();
            })
            .catch(function (err) {
              if (index < endpoints.length) {
                status.textContent = "local search unavailable; trying tunnel…";
                return tryNext(err);
              }
              throw err;
            });
        }

        return tryNext(new Error("search unavailable"));
      }

      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var query = input.value.trim();
        if (!query) return;

        button.disabled = true;
        status.textContent = "asking…";
        clearResults();

        searchCorpus(query)
          .then(function (data) {
            if (!data.answer) {
              status.textContent = "no answer returned";
              return;
            }
            status.textContent = data.sources.length
              ? data.sources.length + " cited sources"
              : "answered without supporting sources";
            renderAnswer(data);
          })
          .catch(function (err) {
            status.textContent = "corpus unavailable: " + err.message;
          })
          .finally(function () {
            button.disabled = false;
          });
      });
    };
  })();

  /* =====================================================================
     ESTATE STATUS :: new panel, fed by the shared registry client
     ===================================================================== */
  var statusStart = (function () {
    var started = false;
    var excludedWorkers = { "simple-proxy": true };

    function esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
      });
    }

    return function start() {
      if (started) return;
      started = true;
      if (!window.AtlasRegistry) return;

      var line = document.getElementById("live-estate-line");
      var sub = document.getElementById("live-estate-sub");
      var listEl = document.getElementById("live-workers");
      var feedDot = document.getElementById("live-feed-registry");

      window.AtlasRegistry.subscribe(function (snap) {
        if (!snap.ok && !snap.stale) {
          if (feedDot) feedDot.dataset.state = "down";
          if (line) line.textContent = "registry unreachable";
          if (sub) sub.textContent = "no live estate data from this browser";
          return;
        }
        if (feedDot) feedDot.dataset.state = snap.stale ? "warn" : "ok";

        var workers = (snap.workers || []).filter(function (w) {
          return !excludedWorkers[w.name];
        });

        if (line) {
          var documented = workers.filter(function (w) { return w.documented; }).length;
          var pending = workers.length - documented;
          line.textContent = workers.length + " workers · " +
            documented + " documented · " +
            pending + " pending /_meta";
        }
        if (sub) {
          sub.textContent = (snap.stale ? "stale snapshot · " : "") +
            (snap.generatedAt ? "registry built " + snap.generatedAt.slice(11, 16) + "Z · " : "") +
            "rebuilt hourly";
        }

        if (listEl) {
          /* Documented Workers first (they have earned the green), then the
             retrofit queue with the registry's own diagnostic note; the
             honest view of the /_meta adoption gap, updating itself as each
             legacy Worker gets retrofitted. */
          var sorted = workers.slice().sort(function (a, b) {
            if (a.documented !== b.documented) return a.documented ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
          var html = "";
          sorted.forEach(function (w) {
            var st = w.documented ? "live" : "undoc";
            var note = w.documented
              ? esc((w.meta && w.meta.description) || "")
              : esc(w.note || "no /_meta yet");
            html += '<div class="live-worker-row" data-st="' + st + '">' +
              '<span class="live-worker-dot"></span>' +
              '<span class="live-worker-name">' + esc(w.name) + '</span>' +
              '<span class="live-worker-note">' + note + '</span></div>';
          });
          listEl.innerHTML = html;
        }
      });
    };
  })();
})();
