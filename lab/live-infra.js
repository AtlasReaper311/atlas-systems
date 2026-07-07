/* live-infra.js :: the Infra Health and RAG Queries panels.
   Fed by atlas-api-public: /v1/infra/status and /v1/rag/stats.
   Same contract as live-section.js: never throws, degrades to honest
   "unreachable" states rather than optimistic placeholders, and stays
   quiet in the console. Vanilla by estate rule. */
(function () {
  "use strict";

  var API = "https://api.atlas-systems.uk/v1";
  var POLL_MS = 60000;

  function $(id) {
    return document.getElementById(id);
  }

  function relTime(iso) {
    if (!iso) return "never";
    var s = Math.floor((Date.now() - Date.parse(iso)) / 1000);
    if (!isFinite(s)) return "unknown";
    if (s < 0) return "just now";
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }

  function getJson(url) {
    return fetch(url, { headers: { accept: "application/json" } }).then(
      function (res) {
        if (!res.ok) throw new Error("http " + res.status);
        return res.json();
      }
    );
  }

  /* ---------------- infra health ---------------- */

  function paintCheck(id, check) {
    var el = $(id);
    if (!el) return;
    if (!check) {
      el.textContent = "no data";
      el.className = "li-w-val";
      return;
    }
    if (check.ok) {
      el.textContent =
        check.latency_ms != null ? "ok · " + check.latency_ms + "ms" : "ok";
      el.className = "li-w-val is-ok";
    } else {
      el.textContent = check.detail || "failing";
      el.className = "li-w-val is-bad";
    }
  }

  function renderInfra(data) {
    window.dispatchEvent(new CustomEvent("atlas:infra:status", { detail: data || {} }));
    var state = $("liw-state");
    if (state) state.setAttribute("data-state", data.overall || "unknown");
    var overall = $("liw-overall");
    if (overall) {
      overall.textContent = data.stale
        ? "down · sentinel silent"
        : data.overall || "unknown";
    }
    var comps = data.components || {};
    paintCheck("liw-ollama", comps.ollama);
    paintCheck("liw-corpus-health", comps.corpus_health);
    paintCheck("liw-corpus-search", comps.corpus_search);
    var ip = $("liw-ip");
    if (ip) {
      ip.textContent = data.wsl_ip
        ? data.ip_changed_at
          ? data.wsl_ip + " · moved " + relTime(data.ip_changed_at)
          : data.wsl_ip
        : "unknown";
      ip.className = "li-w-val";
    }
    var checked = $("liw-checked");
    if (checked) {
      checked.textContent =
        (data.machine || "machine") +
        " · reported " +
        relTime(data.last_report_at);
    }
  }

  function infraUnreachable() {
    var state = $("liw-state");
    if (state) state.setAttribute("data-state", "unknown");
    var overall = $("liw-overall");
    if (overall) overall.textContent = "api unreachable";
    var checked = $("liw-checked");
    if (checked) checked.textContent = "could not reach api.atlas-systems.uk";
  }

  function pollInfra() {
    getJson(API + "/infra/status").then(renderInfra).catch(infraUnreachable);
  }

  /* ---------------- rag queries ---------------- */

  function renderRag(data) {
    var hour = $("lrq-hour");
    if (hour) hour.textContent = String(data.queries_last_hour);
    var today = $("lrq-today");
    if (today) today.textContent = String(data.queries_today);
    var total = $("lrq-total");
    if (total) total.textContent = String(data.queries_total);
    var last = $("lrq-last");
    if (last) last.textContent = relTime(data.last_query_at);
    var checked = $("lrq-checked");
    if (checked) {
      if (data.source === "live") {
        checked.textContent = "live from the corpus";
      } else if (data.source === "last-summary") {
        checked.textContent = "last summary " + relTime(data.last_summary_at);
      } else {
        checked.textContent = "no queries recorded yet";
      }
    }
  }

  function ragUnreachable() {
    var checked = $("lrq-checked");
    if (checked) checked.textContent = "could not reach api.atlas-systems.uk";
  }

  function pollRag() {
    getJson(API + "/rag/stats").then(renderRag).catch(ragUnreachable);
  }

  function boot() {
    if (!$("infra-health") && !$("rag-queries")) return;
    pollInfra();
    pollRag();
    window.setInterval(pollInfra, POLL_MS);
    window.setInterval(pollRag, POLL_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
