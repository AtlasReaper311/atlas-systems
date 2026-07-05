/**
 * atlas-terminal.js
 * A real shell over the estate, site-wide, behind the backtick key.
 *
 * Not a command simulator: every data command hits the same live surfaces
 * the rest of the site uses.
 *   ls repos   registry via the shared AtlasRegistry client (one poll loop
 *              site-wide; this is its fourth consumer, not a fifth fetch)
 *   status     same snapshot, summarised with the map's exact vocabulary
 *   search     atlas-corpus GET /search?q= (the public RAG endpoint)
 *   cat decisions.md   the published decisions file, parsed client-side
 *
 * Install: one script tag per page. The module injects its own stylesheet
 * (/css/atlas-terminal.css) and its own nav trigger, so no page markup
 * changes and the pages stay zero-cost until the terminal is opened.
 *
 * Failure states are written in the shell's own voice and never look
 * broken: a down Worker earns a sentence, not a stack trace.
 */
(function () {
  "use strict";

  /* ── Config ──────────────────────────────────────────────────────── */
  var CSS_HREF = "/css/atlas-terminal-card.css";
  var REGISTRY_SRC = "/js/atlas-registry.js";
  var CORPUS_BASE = "https://corpus.atlas-systems.uk";
  var DECISIONS_PATH = "/decisions.md";
  var SEARCH_MIN_INTERVAL_MS = 1200; /* client courtesy gap; the corpus's
                                        per-IP hourly limit is the backstop */
  var SEARCH_CACHE_MAX = 20;
  var DECISIONS_CACHE_MS = 5 * 60 * 1000;
  var SNAPSHOT_TIMEOUT_MS = 6000;
  var HISTORY_MAX = 60;

  var PROMPT = "atlas@edge:~$";
  var EXAMPLE_COMMANDS = [
    "status",
    "ls repos",
    "cat decisions.md",
    "search kv write limits",
    "whoami"
  ];

  /* ── State ───────────────────────────────────────────────────────── */
  var built = false;
  var isOpen = false;
  var overlay, panel, output, input, restoreFocusTo = null, focusTimer = null;
  var history = [];
  var histIdx = -1;
  var draft = "";
  var lastSearchAt = 0;
  var searchInFlight = false;
  var searchCache = new Map(); /* query -> rendered result rows */
  var decisionsCache = { at: 0, entries: null, failed: false };
  var bootShown = false;

  /* ── Small utilities ─────────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function pad(s, n) {
    s = String(s);
    return s.length >= n ? s.slice(0, n - 1) + "\u2026" : s + new Array(n - s.length + 1).join(" ");
  }
  function hashString(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  /* Markdown noise out, meaning in: the terminal is already monospace, so
     bold markers and backticks are clutter rather than emphasis here. */
  function unmd(s) {
    return String(s).replace(/\*\*/g, "").replace(/`/g, "");
  }

  /* ── Stylesheet + registry lazy loaders ──────────────────────────── */
  function ensureCss() {
    if (document.querySelector('link[href="' + CSS_HREF + '"]')) return;
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = CSS_HREF;
    document.head.appendChild(l);
  }

  var registryPromise = null;
  function ensureRegistry() {
    if (window.AtlasRegistry) return Promise.resolve(window.AtlasRegistry);
    if (registryPromise) return registryPromise;
    registryPromise = new Promise(function (resolve) {
      var s = document.createElement("script");
      s.src = REGISTRY_SRC;
      s.defer = true;
      s.onload = function () { resolve(window.AtlasRegistry || null); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
    return registryPromise;
  }

  /* First snapshot as a promise. The shared client emits immediately when
     it already holds one, so on the Lab page this resolves synchronously
     and elsewhere it costs one poll. */
  function waitForSnapshot() {
    return ensureRegistry().then(function (reg) {
      if (!reg) return null;
      return new Promise(function (resolve) {
        var done = false;
        var unsub = reg.subscribe(function (snap) {
          if (done) return;
          done = true;
          resolve(snap);
          setTimeout(function () { if (unsub) unsub(); }, 0);
        });
        setTimeout(function () {
          if (!done) { done = true; resolve(null); if (unsub) unsub(); }
        }, SNAPSHOT_TIMEOUT_MS);
      });
    });
  }

  /* ── Output ──────────────────────────────────────────────────────── */
  function line(html, cls) {
    var d = document.createElement("div");
    d.className = "term-line" + (cls ? " " + cls : "");
    d.innerHTML = html;
    output.appendChild(d);
    output.scrollTop = output.scrollHeight;
    return d;
  }
  function echoCommand(cmd) {
    line('<span class="t-prompt">' + esc(PROMPT) + "</span> " + esc(cmd), "t-echo");
  }
  function gap() { line("&nbsp;", "t-gap"); }

  /* ── Status vocabulary: byte-for-byte the map's rules ────────────── */
  var GLYPH = {
    live: '<span class="t-ok">\u25CF</span>',
    degraded: '<span class="t-warn">\u25D0</span>',
    undoc: '<span class="t-faint">\u25CB</span>',
    down: '<span class="t-err">\u2715</span>',
    unknown: '<span class="t-faint">?</span>'
  };
  function statusOf(w) {
    if (!w.documented) return "undoc";
    var ms = w.meta && typeof w.meta.status === "string" ? w.meta.status.toLowerCase() : "live";
    return ms === "live" || ms === "ok" || ms === "" ? "live" : "degraded";
  }

  /* ── Commands ────────────────────────────────────────────────────── */

  function cmdHelp() {
    line('<span class="t-accent">commands</span>');
    var rows = [
      ["whoami", "who runs this estate"],
      ["ls repos", "live Worker registry (api.atlas-systems.uk)"],
      ["status", "estate health summary from the registry"],
      ["search &lt;query&gt;", "semantic search over the estate docs (atlas-corpus)"],
      ["cat decisions.md", "the latest engineering decisions, from the real file"],
      ["clear", "wipe the scrollback"],
      ["help", "this"]
    ];
    rows.forEach(function (r) {
      line('  <span class="t-cmd">' + pad(r[0], 22) + "</span><span class=\"t-dim\">" + r[1] + "</span>", "t-row");
    });
    line('<span class="t-faint">` toggles the terminal · Esc closes · \u2191\u2193 history</span>');
  }

  function cmdWhoami() {
    [
      '<span class="t-accent">atlas reaper</span> <span class="t-dim">:: audio systems + AI infrastructure</span>',
      '<span class="t-dim">final-year video game development, Abertay University (Saltire Scholar)</span>',
      '<span class="t-dim">junior software engineer, SOH (remote-first healthcare tech)</span>',
      '<span class="t-dim">previously: aeronautical engineering + physics, Glasgow</span>',
      '<span class="t-dim">stack: python \u00B7 c++ \u00B7 js \u00B7 UE5/MetaSounds \u00B7 cloudflare workers \u00B7 actions</span>',
      '<span class="t-dim">this site is the live half of the CV: the map, the telemetry, and this</span>',
      '<span class="t-dim">shell all run against the same estate the case studies describe.</span>',
      '<span class="t-faint">contact: atlas@atlas-systems.uk</span>'
    ].forEach(function (h) { line(h); });
  }

  function cmdLsRepos() {
    var pending = line('<span class="t-dim">contacting registry\u2026</span>');
    waitForSnapshot().then(function (snap) {
      if (!snap || (!snap.ok && !snap.stale)) {
        pending.innerHTML = '<span class="t-err">registry unreachable.</span> <span class="t-dim">the estate exists; the index of it is not answering. try status later.</span>';
        return;
      }
      pending.remove();
      if (snap.stale) {
        line('<span class="t-warn">registry not responding \u00B7 showing the last good snapshot</span>');
      }
      var ws = snap.workers.slice().sort(function (a, b) {
        var order = { live: 0, degraded: 1, undoc: 2, down: 3, unknown: 4 };
        var d = (order[statusOf(a)] || 9) - (order[statusOf(b)] || 9);
        return d !== 0 ? d : a.name.localeCompare(b.name);
      });
      line('<span class="t-faint">' + pad("WORKER", 20) + pad("STATUS", 12) + "DESCRIPTION</span>", "t-row");
      ws.forEach(function (w) {
        var st = statusOf(w);
        var desc = (w.meta && w.meta.description) || w.note || "";
        line(
          "  " + GLYPH[st] + ' <span class="t-cmd">' + pad(esc(w.name), 18) + "</span>" +
          '<span class="t-dim">' + pad(st, 12) + "</span>" +
          '<span class="t-dim">' + esc(desc).slice(0, 56) + "</span>",
          "t-row"
        );
      });
      if (snap.counts) {
        line('<span class="t-faint">' + snap.counts.workers + " workers \u00B7 " +
          snap.counts.documented + " documented \u00B7 " +
          snap.counts.undocumented + " pending /_meta</span>");
      }
    });
  }

  function cmdStatus() {
    var pending = line('<span class="t-dim">contacting registry\u2026</span>');
    waitForSnapshot().then(function (snap) {
      if (!snap || (!snap.ok && !snap.stale)) {
        pending.innerHTML = '<span class="t-err">registry unreachable</span> <span class="t-dim">\u00B7 no live status claimed. the declared topology still renders on /lab/#system-map.</span>';
        return;
      }
      pending.remove();
      var tally = { live: 0, degraded: 0, undoc: 0 };
      snap.workers.forEach(function (w) { tally[statusOf(w)] = (tally[statusOf(w)] || 0) + 1; });
      var built = snap.generatedAt ? snap.generatedAt.slice(11, 16) + "Z" : "unknown";
      line((snap.stale
        ? '<span class="t-warn">\u25D0 estate status \u00B7 STALE snapshot</span>'
        : '<span class="t-ok">\u25CF estate status \u00B7 live</span>'));
      line("  " + GLYPH.live + ' <span class="t-dim">' + pad(tally.live + " live", 14) + "</span>" +
        GLYPH.degraded + ' <span class="t-dim">' + pad(tally.degraded + " degraded", 16) + "</span>" +
        GLYPH.undoc + ' <span class="t-dim">' + tally.undoc + " pending /_meta</span>", "t-row");
      line('<span class="t-faint">registry built ' + esc(built) +
        (snap.fetchedAt ? " \u00B7 fetched " + snap.fetchedAt.toTimeString().slice(0, 5) : "") +
        (snap.warnings && snap.warnings.length ? " \u00B7 " + snap.warnings.length + " discovery warning(s)" : "") +
        "</span>");
      line('<span class="t-faint">full picture: /lab/#system-map</span>');
    });
  }

  /* search :: atlas-corpus. Debounced by minimum interval + in-flight
     lock + a small result cache, so mashing Enter cannot become a way to
     hammer a rate-limited public endpoint from this UI. */
  function cmdSearch(rawQuery) {
    var q = rawQuery.trim().slice(0, 200);
    if (!q) {
      line('<span class="t-dim">usage: search &lt;query&gt; \u00B7 e.g.</span> <span class="t-cmd">search kv write limits</span>');
      return;
    }
    var key = q.toLowerCase();
    if (searchCache.has(key)) {
      renderHits(q, searchCache.get(key), true);
      return;
    }
    var now = Date.now();
    if (searchInFlight) {
      line('<span class="t-dim">one query at a time; the corpus is rate-limited on purpose.</span>');
      return;
    }
    if (now - lastSearchAt < SEARCH_MIN_INTERVAL_MS) {
      line('<span class="t-dim">easy. give it a second between queries.</span>');
      return;
    }
    lastSearchAt = now;
    searchInFlight = true;
    var pending = line('<span class="t-dim">querying corpus\u2026</span>');

    fetch(CORPUS_BASE + "/search?q=" + encodeURIComponent(q) + "&top_k=5", {
      headers: { Accept: "application/json" }
    }).then(function (res) {
      if (res.status === 429) throw { rateLimited: true };
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }).then(function (data) {
      pending.remove();
      var payload = {
        hits: Array.isArray(data.hits) ? data.hits : [],
        tookMs: typeof data.took_ms === "number" ? data.took_ms : null
      };
      searchCache.set(key, payload);
      if (searchCache.size > SEARCH_CACHE_MAX) {
        searchCache.delete(searchCache.keys().next().value);
      }
      renderHits(q, payload, false);
    }).catch(function (err) {
      pending.remove();
      if (err && err.rateLimited) {
        line('<span class="t-warn">corpus rate limit reached for this IP.</span> <span class="t-dim">the hourly window is deliberate; it resets on its own.</span>');
      } else {
        line('<span class="t-err">corpus unreachable.</span> <span class="t-dim">search over the estate docs lives on SPECULAR-CORE behind a tunnel; right now the tunnel is not answering. everything else here still works.</span>');
      }
    }).then(function () { searchInFlight = false; });
  }

  function renderHits(q, payload, fromCache) {
    if (!payload.hits.length) {
      line('<span class="t-dim">no matches for</span> <span class="t-cmd">' + esc(q) + "</span><span class=\"t-dim\">. the corpus indexes the estate docs, not the whole web.</span>");
      return;
    }
    line('<span class="t-accent">' + payload.hits.length + " hit" + (payload.hits.length === 1 ? "" : "s") + "</span>" +
      '<span class="t-faint">' +
      (payload.tookMs !== null ? " \u00B7 " + payload.tookMs + "ms" : "") +
      (fromCache ? " \u00B7 cached" : "") + "</span>");
    payload.hits.forEach(function (h, i) {
      var src = (h.source_repo || "?") + "/" + (h.file_path || "?");
      var snippet = unmd(String(h.text || "")).replace(/\s+/g, " ").trim().slice(0, 150);
      line("  " + '<span class="t-faint">' + (i + 1) + "</span> " +
        '<span class="t-cmd">' + esc(src) + "</span>" +
        '<span class="t-faint"> \u00B7 ' + (typeof h.score === "number" ? h.score.toFixed(2) : "?") + "</span>", "t-row");
      line('    <span class="t-dim">' + esc(snippet) + "\u2026</span>", "t-row");
    });
    line('<span class="t-faint">source of truth: corpus.atlas-systems.uk \u00B7 same endpoint the Lab search uses</span>');
  }

  /* cat decisions.md :: the real file, parsed for the freshest entries.
     Supports the original "### ... _(new YYYY-MM-DD)_" format plus the
     current estate log's "## YYYY-MM - Title" entries. Undated entries
     rank below dated ones rather than being guessed at. */
  function parseDecisions(md) {
    var lines = md.split(/\r?\n/);
    var entries = [];
    var cur = null;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      var h = l.match(/^###\s+(.*)$/);
      if (h) {
        if (cur) entries.push(cur);
        var title = h[1];
        var dm = title.match(/\(new(?:\s+gap)?[,:]?\s*(\d{4}-\d{2}-\d{2})\)/);
        title = title.replace(/_\([^)]*\)_\s*$/, "").trim();
        cur = { title: unmd(title), date: dm ? dm[1] : null, decision: "" };
        continue;
      }
      h = l.match(/^##\s+(\d{4}-\d{2}(?:-\d{2})?)\s+[-\u2013\u2014]\s+(.*)$/);
      if (h) {
        if (cur) entries.push(cur);
        cur = { title: unmd(h[2]).trim(), date: h[1], decision: "" };
        continue;
      }
      if (!cur) continue;
      if (/^##[^#]/.test(l)) { entries.push(cur); cur = null; continue; }
      if (!cur.decision) {
        var d = l.match(/^(?:-\s+)?\*\*Decision[.:]?\*\*\s*(.*)$/);
        if (d) cur.decision = unmd(d[1]).trim();
      }
    }
    if (cur) entries.push(cur);
    var dated = entries.filter(function (e) { return e.date; })
      .sort(function (a, b) { return b.date < a.date ? -1 : b.date > a.date ? 1 : 0; });
    var undated = entries.filter(function (e) { return !e.date; }).reverse();
    return dated.concat(undated);
  }

  function cmdCatDecisions() {
    var now = Date.now();
    if (decisionsCache.entries && now - decisionsCache.at < DECISIONS_CACHE_MS) {
      renderDecisions(decisionsCache.entries);
      return;
    }
    var pending = line('<span class="t-dim">reading decisions.md\u2026</span>');
    fetch(DECISIONS_PATH, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text();
    }).then(function (md) {
      pending.remove();
      var entries = parseDecisions(md);
      decisionsCache = { at: now, entries: entries, failed: false };
      renderDecisions(entries);
    }).catch(function () {
      pending.remove();
      line('<span class="t-dim">decisions.md is not published from this deploy. the file is real; putting it here is a deliberate step, not a default.</span>');
    });
  }

  function renderDecisions(entries) {
    if (!entries.length) {
      line('<span class="t-dim">decisions.md parsed to zero entries, which is its own kind of decision.</span>');
      return;
    }
    line('<span class="t-accent">decisions.md</span> <span class="t-faint">\u00B7 latest ' + Math.min(4, entries.length) + " of " + entries.length + " entries</span>");
    entries.slice(0, 4).forEach(function (e) {
      line('  <span class="t-cmd">' + esc(e.title) + "</span>" +
        (e.date ? ' <span class="t-faint">(' + esc(e.date) + ")</span>" : ""), "t-row");
      if (e.decision) {
        line('    <span class="t-dim">' + esc(e.decision.slice(0, 220)) + (e.decision.length > 220 ? "\u2026" : "") + "</span>", "t-row");
      }
    });
    line('<span class="t-faint">full file: ' + esc(DECISIONS_PATH) + " \u00B7 lessons get banked, not buried</span>");
  }

  /* Unknown commands answer in character, deterministically: the same
     wrong command always earns the same line, because a shell that
     changes its mind reads as random, not dry. */
  var SPECIALS = {
    "sudo": "no.",
    "sudo su": "no.",
    "rm -rf /": "ambition noted. denied.",
    "rm -rf": "ambition noted. denied.",
    "vim": "this is a portfolio, not a hostage situation.",
    "nano": "this is a portfolio, not a hostage situation.",
    "emacs": "this is a portfolio, not a hostage situation. a larger one.",
    "ls": "try: ls repos. the estate is the only directory here.",
    "cat": "only decisions.md is published to this shell. try: cat decisions.md",
    "pwd": "/edge/atlas-systems \u00B7 physically: cloudflare's nearest PoP to you.",
    "ollama": "ollama runs on SPECULAR-CORE, behind the tunnel. this is the edge. try: status",
    "ramone": "ramone answers by voice, on the LAN. out here you get: status, search <query>",
    "whoru": "a shell. you meant whoami.",
    "exit": "__CLOSE__",
    "quit": "__CLOSE__",
    "ping": "the registry does that hourly so you don't have to. try: status"
  };
  var GENERIC = [
    "command not found: {c}. this shell is real; that command is not.",
    "{c}: not on this estate. help lists what is.",
    "no handler for {c}. the estate is small and deliberate; so is this shell.",
    "{c}: unrecognised. four Workers were consulted; none claimed it."
  ];
  function cmdUnknown(raw) {
    var norm = raw.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(SPECIALS, norm)) {
      var sp = SPECIALS[norm];
      if (sp === "__CLOSE__") {
        line('<span class="t-dim">terminal detached.</span>');
        setTimeout(close, 260);
        return;
      }
      line('<span class="t-dim">' + esc(sp) + "</span>");
      return;
    }
    var first = norm.split(/\s+/)[0];
    if (Object.prototype.hasOwnProperty.call(SPECIALS, first) && first !== "cat" && first !== "ls") {
      line('<span class="t-dim">' + esc(SPECIALS[first]) + "</span>");
      return;
    }
    var t = GENERIC[hashString(norm) % GENERIC.length];
    line('<span class="t-dim">' + esc(t).replace(/\{c\}/g, '<span class="t-cmd">' + esc(first) + "</span>") + "</span>");
  }

  /* ── Dispatch ────────────────────────────────────────────────────── */
  function run(raw) {
    var cmd = raw.trim();
    if (!cmd) return;
    echoCommand(cmd);
    if (history[history.length - 1] !== cmd) {
      history.push(cmd);
      if (history.length > HISTORY_MAX) history.shift();
    }
    histIdx = history.length;
    draft = "";

    var lower = cmd.toLowerCase();
    if (lower === "help" || lower === "?") return cmdHelp();
    if (lower === "whoami") return cmdWhoami();
    if (lower === "ls repos" || lower === "ls workers") return cmdLsRepos();
    if (lower === "status") return cmdStatus();
    if (lower === "clear" || lower === "cls") { output.innerHTML = ""; return; }
    if (lower === "cat decisions.md" || lower === "cat /decisions.md" || lower === "decisions") return cmdCatDecisions();
    if (lower.indexOf("search ") === 0) return cmdSearch(cmd.slice(7));
    if (lower === "search") return cmdSearch("");
    return cmdUnknown(cmd);
  }

  /* ── Overlay construction (built once, on first open) ───────────── */
  function build() {
    if (built) return;
    built = true;
    ensureCss();

    overlay = document.createElement("div");
    overlay.className = "term-overlay";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Atlas Systems estate terminal");

    panel = document.createElement("div");
    panel.className = "term-panel";

    var head = document.createElement("div");
    head.className = "term-head";
    head.innerHTML =
      '<span class="term-title"><span class="t-accent">atlas@edge</span> :: estate shell</span>' +
      '<button type="button" class="term-close" aria-label="Close terminal">x</button>';

    var examples = document.createElement("div");
    examples.className = "term-examples";
    examples.setAttribute("aria-label", "Example commands");
    var examplesLabel = document.createElement("span");
    examplesLabel.className = "term-examples-label";
    examplesLabel.textContent = "try";
    examples.appendChild(examplesLabel);
    EXAMPLE_COMMANDS.forEach(function (cmd) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "term-example";
      b.textContent = cmd;
      b.addEventListener("click", function () {
        input.value = "";
        run(cmd);
        queueInputFocus();
      });
      examples.appendChild(b);
    });

    output = document.createElement("div");
    output.className = "term-output";
    output.setAttribute("role", "log");
    output.setAttribute("aria-live", "polite");

    var inputRow = document.createElement("div");
    inputRow.className = "term-input-row";
    var promptEl = document.createElement("span");
    promptEl.className = "t-prompt";
    promptEl.textContent = PROMPT;
    input = document.createElement("input");
    input.className = "term-input";
    input.type = "text";
    input.autocomplete = "off";
    input.autocapitalize = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Terminal command input");
    inputRow.appendChild(promptEl);
    inputRow.appendChild(input);

    panel.appendChild(head);
    panel.appendChild(examples);
    panel.appendChild(output);
    panel.appendChild(inputRow);
    overlay.appendChild(panel);
    (document.documentElement || document.body).appendChild(overlay);

    head.querySelector(".term-close").addEventListener("click", close);
    overlay.addEventListener("pointerdown", function (ev) {
      if (ev.target === overlay) { close(); return; }
    });
    panel.addEventListener("pointerdown", function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest("button, a, input, textarea, select")) return;
      /* Anywhere inside the panel keeps the input live; a terminal whose
         focus wanders is a terminal that feels broken. */
      if (!window.getSelection || String(window.getSelection()) === "") queueInputFocus();
    });

    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        var v = input.value;
        input.value = "";
        run(v);
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        if (!history.length) return;
        if (histIdx === history.length) draft = input.value;
        histIdx = Math.max(0, histIdx - 1);
        input.value = history[histIdx];
        setTimeout(function () { input.setSelectionRange(input.value.length, input.value.length); }, 0);
      } else if (ev.key === "ArrowDown") {
        ev.preventDefault();
        if (histIdx >= history.length) return;
        histIdx = Math.min(history.length, histIdx + 1);
        input.value = histIdx === history.length ? draft : history[histIdx];
        setTimeout(function () { input.setSelectionRange(input.value.length, input.value.length); }, 0);
      }
    });
  }

  function boot() {
    if (bootShown) return;
    bootShown = true;
    line('<span class="t-accent">ATLAS SYSTEMS</span> <span class="t-dim">:: estate shell</span><span class="term-cursor" aria-hidden="true"></span>');
    line('<span class="t-faint">live data \u00B7 the registry, the corpus, and the decisions file are the same ones the rest of the site runs on</span>');
    line('<span class="t-faint">run a command above, or type</span> <span class="t-cmd">help</span> <span class="t-faint">for the full list</span>');
    gap();
    /* Warm the registry quietly so ls/status answer instantly. */
    ensureRegistry();
  }

  /* ── Open/close ──────────────────────────────────────────────────── */
  function queueInputFocus() {
    if (focusTimer !== null) clearTimeout(focusTimer);
    focusTimer = setTimeout(function () {
      focusTimer = null;
      if (isOpen && input) input.focus();
    }, 0);
  }
  function open() {
    build();
    if (isOpen) return;
    isOpen = true;
    restoreFocusTo = document.activeElement;
    overlay.hidden = false;
    document.body.classList.add("term-open");
    boot();
    if (focusTimer !== null) clearTimeout(focusTimer);
    focusTimer = setTimeout(function () {
      focusTimer = null;
      if (isOpen) input.focus();
    }, 30);
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    if (focusTimer !== null) {
      clearTimeout(focusTimer);
      focusTimer = null;
    }
    if (input) input.blur();
    overlay.hidden = true;
    document.body.classList.remove("term-open");
    var target = restoreFocusTo;
    restoreFocusTo = null;
    if (target && target.focus && (!overlay || !overlay.contains(target))) {
      try { target.focus({ preventScroll: true }); }
      catch (e) { target.focus(); }
    }
  }
  function toggle() { if (isOpen) { close(); } else { open(); } }

  /* Backtick opens and closes, console-style; it never fires while the
     visitor is typing in some other field, and Escape always closes. */
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && isOpen) { ev.preventDefault(); close(); return; }
    if (ev.key !== "`" || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    var t = ev.target;
    var editable = t && (t.isContentEditable ||
      (t.tagName === "INPUT" && t !== input) || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
    if (editable) return;
    ev.preventDefault();
    toggle();
  });

  /* ── Triggers: injected, not marked up ───────────────────────────
     Desktop: a `>_` item appended to the existing .nav-links list so it
     inherits the nav's own hover treatment. Small screens: a fixed chip,
     because phones do not have a backtick key. Both exist on every page
     from one script include; CSS decides which is visible. */
  function injectTriggers() {
    var navList = document.querySelector(".nav-links");
    if (navList) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = "#";
      a.className = "nav-link term-nav-trigger";
      a.setAttribute("aria-label", "Open the estate terminal");
      a.textContent = ">_";
      a.addEventListener("click", function (ev) { ev.preventDefault(); toggle(); });
      li.appendChild(a);
      navList.appendChild(li);
    }
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "term-chip";
    chip.setAttribute("aria-label", "Open the estate terminal");
    chip.textContent = ">_";
    chip.addEventListener("click", toggle);
    document.body.appendChild(chip);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectTriggers);
  } else {
    injectTriggers();
  }

  window.AtlasTerminal = { open: open, close: close, toggle: toggle };
})();
