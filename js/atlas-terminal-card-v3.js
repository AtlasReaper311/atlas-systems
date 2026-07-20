(function () {
  "use strict";

  var CSS_HREF = "/css/atlas-terminal-card-v3.css?v=20260705-close-hidden";
  var API_ORIGIN = "https://api.atlas-systems.uk";
  var DECISIONS_PATH = "/decisions.md";
  var PROMPT = "atlas@edge:~$";
  var API_TIMEOUT_MS = 7000;
  var SEARCH_TIMEOUT_MS = 9000;
  var OUTPUT_CHAR_LIMIT = 6000;
  var OUTPUT_LINE_LIMIT = 80;
  var HISTORY_MAX = 60;

  var API_ALIASES = {
    api: "/v1",
    v1: "/v1",
    registry: "/v1/registry",
    topology: "/v1/topology",
    reliability: "/v1/reliability",
    objectives: "/v1/reliability/objectives",
    dora: "/dora/metrics"
  };

  var EXAMPLES = [
    "status",
    "ls repos",
    "curl api",
    "search kv write limits",
    "whoami"
  ];

  var built = false;
  var isOpen = false;
  var overlay = null;
  var panel = null;
  var output = null;
  var input = null;
  var restoreFocusTo = null;
  var openScrollX = 0;
  var openScrollY = 0;
  var history = [];
  var historyIndex = -1;
  var historyDraft = "";
  var decisionsCache = null;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>\"]/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;"
      }[character];
    });
  }

  function pad(value, width) {
    var text = String(value == null ? "" : value);
    if (text.length >= width) return text.slice(0, Math.max(1, width - 1)) + "…";
    return text + new Array(width - text.length + 1).join(" ");
  }

  function line(html, className) {
    if (!output) return null;
    var row = document.createElement("div");
    row.className = "term-line" + (className ? " " + className : "");
    row.innerHTML = html;
    output.appendChild(row);
    output.scrollTop = output.scrollHeight;
    return row;
  }

  function echo(command) {
    line('<span class="t-prompt">' + esc(PROMPT) + "</span> " + esc(command), "t-echo");
  }

  function ensureCss() {
    if (document.querySelector('link[href="' + CSS_HREF + '"]')) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CSS_HREF;
    document.head.appendChild(link);
  }

  function restoreScroll() {
    window.scrollTo(openScrollX, openScrollY);
  }

  function focusInput() {
    if (!input || !isOpen) return;
    try {
      input.focus({ preventScroll: true });
    } catch (_error) {
      input.focus();
    }
    restoreScroll();
  }

  function request(path, timeoutMs) {
    var url = new URL(path, API_ORIGIN);
    if (url.origin !== API_ORIGIN) {
      return Promise.reject(new Error("external origins are not available from this shell"));
    }

    var controller = new AbortController();
    var timeout = window.setTimeout(function () {
      controller.abort();
    }, timeoutMs || API_TIMEOUT_MS);

    return fetch(url.href, {
      method: "GET",
      headers: { Accept: "application/json, text/plain;q=0.9" },
      cache: "no-store",
      signal: controller.signal
    }).then(function (response) {
      return response.text().then(function (text) {
        var json = null;
        try {
          json = JSON.parse(text);
        } catch (_error) {
          json = null;
        }
        return { response: response, text: text, json: json, url: url };
      });
    }).finally(function () {
      window.clearTimeout(timeout);
    });
  }

  function publicRepos(topology) {
    var repos = new Map();
    var components = Array.isArray(topology && topology.components) ? topology.components : [];

    components.forEach(function (component) {
      if (!component || typeof component.repo_name !== "string" || !component.repo_name) return;
      var current = repos.get(component.repo_name) || {
        id: component.repo_name,
        runtime: false,
        layer: component.layer || "reusable-kit"
      };
      if (component.source_only !== true) {
        current.runtime = true;
        current.layer = component.layer || current.layer;
      }
      repos.set(component.repo_name, current);
    });

    if (!repos.has("atlas-dora")) {
      repos.set("atlas-dora", { id: "atlas-dora", runtime: true, layer: "observability" });
    }

    return Array.from(repos.values()).sort(function (a, b) {
      if (a.runtime !== b.runtime) return a.runtime ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
  }

  function cmdHelp() {
    line('<span class="t-accent">commands</span>');
    [
      ["status", "public control-plane reachability and publication summary"],
      ["ls repos", "declared public repositories from the public topology"],
      ["ls workers", "approved public Worker registry"],
      ["curl api", "read-only GET against the public Atlas API"],
      ["search <query>", "semantic search through the public corpus gateway"],
      ["cat decisions.md", "latest published engineering decisions"],
      ["whoami", "who runs this estate"],
      ["clear", "wipe the scrollback"]
    ].forEach(function (row) {
      line('  <span class="t-cmd">' + pad(row[0], 22) + '</span><span class="t-dim">' + esc(row[1]) + "</span>", "t-row");
    });
    line('<span class="t-faint">` toggles the terminal · Esc closes · ↑↓ history</span>');
  }

  function cmdWhoami() {
    [
      '<span class="t-accent">atlas reaper</span> <span class="t-dim">:: audio systems + AI infrastructure</span>',
      '<span class="t-dim">final-year video game development, Abertay University (Saltire Scholar)</span>',
      '<span class="t-dim">junior software engineer, SOH (remote-first healthcare tech)</span>',
      '<span class="t-dim">stack: python · c++ · js · UE5/MetaSounds · cloudflare workers · actions</span>',
      '<span class="t-dim">this shell reads the same bounded public control-plane surfaces used by the portfolio.</span>',
      '<span class="t-faint">contact: atlas@atlas-systems.uk</span>'
    ].forEach(function (html) {
      line(html);
    });
  }

  function cmdStatus() {
    var pending = line('<span class="t-dim">contacting public control plane…</span>');
    Promise.allSettled([request("/v1/registry"), request("/v1/topology")]).then(function (results) {
      var registry = results[0].status === "fulfilled" ? results[0].value : null;
      var topology = results[1].status === "fulfilled" ? results[1].value : null;
      var registryOk = Boolean(registry && registry.response.ok && registry.json);
      var topologyOk = Boolean(topology && topology.response.ok && topology.json);

      if (!registryOk && !topologyOk) {
        pending.innerHTML = '<span class="t-err">public control plane unreachable.</span> <span class="t-dim">no estate-health claim is being made.</span>';
        return;
      }

      pending.remove();
      line(registryOk && topologyOk
        ? '<span class="t-ok">● public control plane · reachable</span>'
        : '<span class="t-warn">◐ public control plane · partial</span>');

      if (registryOk) {
        var counts = registry.json.counts || {};
        line('  <span class="t-dim">' + (counts.workers || 0) + " Workers · " + (counts.documented || 0) + " documented · " + (counts.undocumented || 0) + " pending /_meta</span>");
      } else {
        line('  <span class="t-warn">registry unavailable</span>');
      }

      if (topologyOk) {
        var repos = publicRepos(topology.json);
        var runtimeCount = repos.filter(function (repo) { return repo.runtime; }).length;
        line('  <span class="t-dim">' + repos.length + " public repositories · " + runtimeCount + " declared runtime repositories</span>");
      } else {
        line('  <span class="t-warn">topology unavailable</span>');
      }

      line('<span class="t-faint">status reports control-plane reachability and publication state, not host health. runtime health remains on the Lab and status page.</span>');
    });
  }

  function cmdLsRepos() {
    var pending = line('<span class="t-dim">reading public topology…</span>');
    request("/v1/topology").then(function (result) {
      if (!result.response.ok || !result.json) {
        pending.innerHTML = '<span class="t-err">topology unavailable.</span> <span class="t-dim">HTTP ' + result.response.status + "</span>";
        return;
      }
      pending.remove();
      var repos = publicRepos(result.json);
      line('<span class="t-faint">' + pad("REPOSITORY", 24) + pad("ROLE", 12) + "LAYER</span>", "t-row");
      repos.forEach(function (repo) {
        line('  <span class="' + (repo.runtime ? "t-cmd" : "t-dim") + '">' + pad(esc(repo.id), 24) + '</span><span class="t-dim">' + pad(repo.runtime ? "runtime" : "source", 12) + esc(repo.layer) + "</span>", "t-row");
      });
      var runtimeCount = repos.filter(function (repo) { return repo.runtime; }).length;
      line('<span class="t-faint">' + repos.length + " public repositories · " + runtimeCount + " runtime · " + (repos.length - runtimeCount) + " source-only · source: /v1/topology</span>");
    }).catch(function () {
      pending.innerHTML = '<span class="t-err">topology unreachable.</span> <span class="t-dim">the public repository list was not guessed.</span>';
    });
  }

  function cmdLsWorkers() {
    var pending = line('<span class="t-dim">reading public registry…</span>');
    request("/v1/registry").then(function (result) {
      if (!result.response.ok || !result.json) {
        pending.innerHTML = '<span class="t-err">registry unavailable.</span> <span class="t-dim">HTTP ' + result.response.status + "</span>";
        return;
      }
      pending.remove();
      var workers = Array.isArray(result.json.workers) ? result.json.workers : [];
      line('<span class="t-faint">' + pad("WORKER", 22) + pad("META", 12) + "DESCRIPTION</span>", "t-row");
      workers.forEach(function (worker) {
        line('  <span class="t-cmd">' + pad(esc(worker.name || "unknown"), 22) + '</span><span class="t-dim">' + pad(worker.documented ? "documented" : "pending", 12) + esc(worker.description || "") + "</span>", "t-row");
      });
      line('<span class="t-faint">' + workers.length + " approved public Workers · source: /v1/registry</span>");
    }).catch(function () {
      pending.innerHTML = '<span class="t-err">registry unreachable.</span> <span class="t-dim">no private or account-wide fallback is used.</span>';
    });
  }

  function normalizeCurlTarget(raw) {
    var target = String(raw || "").trim();
    if (!target || target.toLowerCase() === "api") return "/v1";
    var withoutApi = target.replace(/^api\s+/i, "").trim();
    if (API_ALIASES[withoutApi.toLowerCase()]) return API_ALIASES[withoutApi.toLowerCase()];
    if (/^https?:\/\//i.test(withoutApi)) {
      var url = new URL(withoutApi);
      if (url.origin !== API_ORIGIN) throw new Error("external origins are not available from this shell");
      return url.pathname + url.search;
    }
    return withoutApi.charAt(0) === "/" ? withoutApi : "/" + withoutApi;
  }

  function cmdCurl(command) {
    var path;
    try {
      path = normalizeCurlTarget(command.replace(/^curl\s+/i, ""));
    } catch (error) {
      line('<span class="t-err">curl blocked.</span> <span class="t-dim">' + esc(error.message) + "</span>");
      return;
    }

    var pending = line('<span class="t-dim">GET ' + esc(path) + "…</span>");
    request(path).then(function (result) {
      var rendered = result.json ? JSON.stringify(result.json, null, 2) : result.text;
      var allLines = rendered.split("\n");
      var bounded = allLines.slice(0, OUTPUT_LINE_LIMIT).join("\n");
      if (bounded.length > OUTPUT_CHAR_LIMIT) bounded = bounded.slice(0, OUTPUT_CHAR_LIMIT);
      var truncated = allLines.length > OUTPUT_LINE_LIMIT || bounded.length < rendered.length;
      pending.innerHTML = '<span class="' + (result.response.ok ? "t-ok" : "t-err") + '">HTTP ' + result.response.status + '</span> <span class="t-faint">' + esc(result.url.pathname + result.url.search) + "</span>";
      line('<span class="t-dim">' + esc(bounded) + "</span>", "t-row");
      if (truncated) line('<span class="t-faint">output truncated in the browser shell; query the endpoint directly for the full document.</span>');
    }).catch(function (error) {
      pending.innerHTML = error && error.name === "AbortError"
        ? '<span class="t-err">request timed out.</span>'
        : '<span class="t-err">public API unreachable.</span> <span class="t-dim">no response was claimed.</span>';
    });
  }

  function cmdSearch(query) {
    query = String(query || "").trim().slice(0, 500);
    if (!query) {
      line('<span class="t-dim">usage: search &lt;query&gt; · e.g. search kv write limits</span>');
      return;
    }

    var pending = line('<span class="t-dim">querying public corpus gateway…</span>');
    request("/v1/search?q=" + encodeURIComponent(query) + "&top_k=5", SEARCH_TIMEOUT_MS).then(function (result) {
      if (!result.response.ok || !result.json) {
        var detail = result.json && (result.json.error || result.json.message) ? (result.json.error || result.json.message) : "HTTP " + result.response.status;
        pending.innerHTML = '<span class="t-err">search unavailable.</span> <span class="t-dim">' + esc(detail) + "</span>";
        if (result.response.status === 503) {
          line('<span class="t-faint">the local RAG host may be asleep or its tunnel unavailable; control-plane commands still work. try: curl api /v1/infra/status</span>');
        }
        return;
      }
      pending.remove();
      var hits = Array.isArray(result.json.hits) ? result.json.hits : [];
      if (!hits.length) {
        line('<span class="t-dim">no matches for</span> <span class="t-cmd">' + esc(query) + "</span>");
        return;
      }
      line('<span class="t-accent">' + hits.length + " hit" + (hits.length === 1 ? "" : "s") + "</span>");
      hits.forEach(function (hit, index) {
        var source = (hit.source_repo || "?") + "/" + (hit.file_path || "?");
        var snippet = String(hit.text || "").replace(/\*\*/g, "").replace(/`/g, "").replace(/\s+/g, " ").trim().slice(0, 150);
        line('  <span class="t-faint">' + (index + 1) + '</span> <span class="t-cmd">' + esc(source) + "</span>", "t-row");
        line('    <span class="t-dim">' + esc(snippet) + (snippet ? "…" : "") + "</span>", "t-row");
      });
      line('<span class="t-faint">source: /v1/search · public Atlas corpus gateway</span>');
    }).catch(function () {
      pending.innerHTML = '<span class="t-err">public search gateway unreachable.</span>';
    });
  }

  function parseDecisions(markdown) {
    var entries = [];
    var lines = markdown.split(/\r?\n/);
    lines.forEach(function (text) {
      var match = text.match(/^##\s+(\d{4}-\d{2}(?:-\d{2})?)\s+[-–—]\s+(.*)$/);
      if (match) entries.push({ date: match[1], title: match[2].replace(/\*\*/g, "").replace(/`/g, "") });
    });
    return entries.slice(0, 4);
  }

  function cmdDecisions() {
    if (decisionsCache) {
      renderDecisions(decisionsCache);
      return;
    }
    var pending = line('<span class="t-dim">reading decisions.md…</span>');
    fetch(DECISIONS_PATH, { cache: "no-store" }).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.text();
    }).then(function (markdown) {
      pending.remove();
      decisionsCache = parseDecisions(markdown);
      renderDecisions(decisionsCache);
    }).catch(function () {
      pending.innerHTML = '<span class="t-dim">decisions.md is not available from this deploy.</span>';
    });
  }

  function renderDecisions(entries) {
    if (!entries.length) {
      line('<span class="t-dim">no dated decisions found.</span>');
      return;
    }
    line('<span class="t-accent">decisions.md</span> <span class="t-faint">· latest entries</span>');
    entries.forEach(function (entry) {
      line('  <span class="t-cmd">' + esc(entry.title) + '</span> <span class="t-faint">(' + esc(entry.date) + ")</span>", "t-row");
    });
  }

  function run(raw) {
    var command = String(raw || "").trim();
    if (!command) return;
    echo(command);

    if (history[history.length - 1] !== command) {
      history.push(command);
      if (history.length > HISTORY_MAX) history.shift();
    }
    historyIndex = history.length;
    historyDraft = "";

    var lower = command.toLowerCase();
    if (lower === "help" || lower === "?") return cmdHelp();
    if (lower === "whoami") return cmdWhoami();
    if (lower === "status") return cmdStatus();
    if (lower === "ls repos") return cmdLsRepos();
    if (lower === "ls workers") return cmdLsWorkers();
    if (lower === "clear" || lower === "cls") {
      output.innerHTML = "";
      return;
    }
    if (lower === "cat decisions.md" || lower === "cat /decisions.md" || lower === "decisions") return cmdDecisions();
    if (lower === "search") return cmdSearch("");
    if (lower.indexOf("search ") === 0) return cmdSearch(command.slice(7));
    if (/^curl(?:\s|$)/i.test(command)) return cmdCurl(command);
    if (lower === "ls") return line('<span class="t-dim">try: ls repos or ls workers.</span>');
    if (lower === "exit" || lower === "quit") return close();
    line('<span class="t-dim">command not found: <span class="t-cmd">' + esc(command.split(/\s+/)[0]) + '</span>. type <span class="t-cmd">help</span>.</span>');
  }

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
    head.innerHTML = '<span class="term-title"><span class="t-accent">atlas@edge</span> :: estate shell</span><button type="button" class="term-close" aria-label="Close terminal">x</button>';

    var examples = document.createElement("div");
    examples.className = "term-examples";
    var label = document.createElement("span");
    label.className = "term-examples-label";
    label.textContent = "try";
    examples.appendChild(label);
    EXAMPLES.forEach(function (command) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "term-example";
      button.textContent = command;
      button.addEventListener("click", function () {
        run(command);
        focusInput();
      });
      examples.appendChild(button);
    });

    output = document.createElement("div");
    output.className = "term-output";
    output.setAttribute("role", "log");
    output.setAttribute("aria-live", "polite");

    var inputRow = document.createElement("div");
    inputRow.className = "term-input-row";
    var prompt = document.createElement("span");
    prompt.className = "t-prompt";
    prompt.textContent = PROMPT;
    input = document.createElement("input");
    input.className = "term-input";
    input.type = "text";
    input.autocomplete = "off";
    input.autocapitalize = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Terminal command input");
    inputRow.appendChild(prompt);
    inputRow.appendChild(input);

    panel.appendChild(head);
    panel.appendChild(examples);
    panel.appendChild(output);
    panel.appendChild(inputRow);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    head.querySelector(".term-close").addEventListener("click", close);
    overlay.addEventListener("pointerdown", function (event) {
      if (!panel.contains(event.target)) close();
    });
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        var value = input.value;
        input.value = "";
        run(value);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!history.length) return;
        if (historyIndex === history.length) historyDraft = input.value;
        historyIndex = Math.max(0, historyIndex - 1);
        input.value = history[historyIndex];
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        if (historyIndex >= history.length) return;
        historyIndex = Math.min(history.length, historyIndex + 1);
        input.value = historyIndex === history.length ? historyDraft : history[historyIndex];
      }
    });
  }

  function boot() {
    if (output.childNodes.length) return;
    line('<span class="t-accent">ATLAS SYSTEMS</span> <span class="t-dim">:: public estate shell</span><span class="term-cursor" aria-hidden="true"></span>');
    line('<span class="t-faint">read-only public control-plane data · no private repository fallback</span>');
    line('<span class="t-faint">type</span> <span class="t-cmd">help</span> <span class="t-faint">for commands</span>');
    line("&nbsp;", "t-gap");
  }

  function open() {
    build();
    if (isOpen) return;
    isOpen = true;
    openScrollX = window.scrollX || 0;
    openScrollY = window.scrollY || 0;
    restoreFocusTo = document.activeElement;
    overlay.hidden = false;
    document.body.classList.add("term-open");
    boot();
    window.setTimeout(focusInput, 30);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    if (input) input.blur();
    overlay.hidden = true;
    document.body.classList.remove("term-open");
    restoreScroll();
    if (restoreFocusTo && restoreFocusTo.focus && !overlay.contains(restoreFocusTo)) {
      try {
        restoreFocusTo.focus({ preventScroll: true });
      } catch (_error) {
        restoreFocusTo.focus();
      }
    }
    restoreFocusTo = null;
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  function injectTriggers() {
    var navList = document.querySelector(".nav-links");
    if (navList && !navList.querySelector(".term-nav-trigger")) {
      var item = document.createElement("li");
      var trigger = document.createElement("a");
      trigger.href = "#";
      trigger.className = "nav-link term-nav-trigger";
      trigger.setAttribute("aria-label", "Open the estate terminal");
      trigger.setAttribute("title", "Open interactive estate shell (`)");
      trigger.textContent = ">_ shell";
      trigger.addEventListener("click", function (event) {
        event.preventDefault();
        toggle();
      });
      item.appendChild(trigger);
      navList.appendChild(item);
    }

    if (!document.querySelector(".term-chip")) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "term-chip";
      chip.setAttribute("aria-label", "Open the estate terminal");
      chip.textContent = ">_";
      chip.addEventListener("click", toggle);
      document.body.appendChild(chip);
    }
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "`" || event.ctrlKey || event.metaKey || event.altKey) return;
    var target = event.target;
    var editable = target && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
    if (editable && target !== input) return;
    event.preventDefault();
    toggle();
  });

  ensureCss();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectTriggers);
  } else {
    injectTriggers();
  }

  window.AtlasTerminal = { open: open, close: close, toggle: toggle };
})();
