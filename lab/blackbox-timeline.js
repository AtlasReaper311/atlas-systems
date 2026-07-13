/**
 * blackbox-timeline.js
 * The replay deck for atlas-blackbox incidents.
 *
 * Given one recorded incident, a visitor scrubs through the window
 * second by second and watches the estate's state approach the failure:
 * telemetry gauges move, ring-buffer events land on the track at their
 * exact timestamps, and the trigger sits marked where it hit. Game
 * replay conventions on purpose: the scrubber OPENS at the moment of
 * failure (a kill-cam lands on the hit, you scrub back to see why),
 * and replay runs at 30x because twelve real minutes is a film, not a
 * diagnostic.
 *
 * Honesty rule: telemetry frames are sampled once a minute, so values
 * between samples are linear interpolation and the UI says so. Events
 * are NOT interpolated; each carries its own precise timestamp from the
 * ring buffer and appears at exactly that second.
 *
 * Postmortems: an incident that has been reviewed and published (see
 * atlas-blackbox/scripts/publish-postmortem.mjs) carries hasPostmortem
 * on its incident payload. A small badge next to frames/events/sealed
 * opens a lazy-fetched panel with the write-up; unpublished incidents
 * show nothing extra. Panel HTML comes from the estate's own converter,
 * not arbitrary input, so it is trusted the same way gauge/feed HTML
 * already is in this file.
 *
 * Zero dependencies, same host conventions as the system map. Every
 * remote string is escaped; every fetch failure is a sentence, not a
 * broken widget.
 */
(function () {
  "use strict";
 
  var host = document.getElementById("blackbox-host");
  if (!host) return;
 
  var statusline = document.getElementById("blackbox-statusline");
  var BASE = "https://api.atlas-systems.uk/blackbox";
  var REPLAY_RATE = 30;      /* window-seconds per real second */
  var REPLAY_TICK_MS = 100;
  var FEED_MAX = 12;
 
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
 
  var state = {
    incidents: [],
    current: null,   /* { id, ts, sealed, hasPostmortem, triggers, frames, t0, t1, events } */
    cursor: 0,
    playing: false,
    playTimer: null
  };
 
  var postmortemCache = {}; /* incident id -> { title, html }, this page load only */
 
  /* ── Utilities ───────────────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function hhmmss(ms) {
    var d = new Date(ms);
    function p(n) { return String(n).padStart(2, "0"); }
    return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + ":" + p(d.getUTCSeconds());
  }
  function fetchJson(url) {
    return fetch(url, { headers: { Accept: "application/json" } }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }
  function emit(name, detail) {
    window.dispatchEvent(new CustomEvent("atlas:blackbox:" + name, { detail: detail }));
  }
 
  /* ── Interpolation (exported for the smoke test) ─────────────────── */
  function lerp(a, b, t) {
    if (typeof a !== "number" || typeof b !== "number") return null;
    return a + (b - a) * t;
  }
  /**
   * Telemetry at an arbitrary cursor: find the bracketing frames and
   * lerp the numeric gauges. An offline frame poisons interpolation on
   * its side honestly; a gauge shows a dash rather than a value invented
   * across a gap in the record.
   */
  function telemetryAt(frames, cursorMs) {
    if (!frames.length) return null;
    var f0 = frames[0], f1 = frames[frames.length - 1];
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].ts <= cursorMs) f0 = frames[i];
      if (frames[i].ts >= cursorMs) { f1 = frames[i]; break; }
    }
    var a = f0.telemetry || {}, b = f1.telemetry || {};
    if (a.online === false || b.online === false || a.fetched_ok === false || b.fetched_ok === false) {
      return { online: false };
    }
    var span = f1.ts - f0.ts;
    var t = span > 0 ? (cursorMs - f0.ts) / span : 0;
    var ag = a.gpu || {}, bg = b.gpu || {};
    var ar = a.ram || {}, br = b.ram || {};
    return {
      online: true,
      gpu_util: lerp(ag.utilisation_pct, bg.utilisation_pct, t),
      gpu_temp: lerp(ag.temperature_c, bg.temperature_c, t),
      vram_used: lerp(ag.vram_used_mb, bg.vram_used_mb, t),
      vram_total: bg.vram_total_mb != null ? bg.vram_total_mb : ag.vram_total_mb,
      cpu: lerp(a.cpu_pct, b.cpu_pct, t),
      ram: lerp(ar.pct, br.pct, t)
    };
  }
 
  function flattenEvents(incident) {
    var out = [];
    (incident.frames || []).forEach(function (f) {
      (f.events || []).forEach(function (e) {
        var t = Date.parse(e.ts);
        if (Number.isFinite(t)) out.push({ ms: t, level: e.level, dialect: e.dialect, title: e.title, event: e.event });
      });
    });
    out.sort(function (a, b) { return a.ms - b.ms; });
    return out;
  }
 
  /* ── DOM scaffold ────────────────────────────────────────────────── */
  var els = {};
  function build() {
    host.innerHTML =
      '<style>' +
      '.bbx-postmortem{margin-top:12px;padding:14px 16px;background:#0a0a0f;' +
      'border:1px solid rgba(255,255,255,.1);border-radius:4px}' +
      '.bbx-postmortem-title{color:#f5a623;font-weight:600;font-size:13px;' +
      'letter-spacing:.02em;margin-bottom:8px}' +
      '.bbx-postmortem-body{font-size:13px;line-height:1.6;color:#e8e8e0}' +
      '.bbx-postmortem-body h2{color:#f5a623;font-size:12px;text-transform:uppercase;' +
      'letter-spacing:.08em;margin:14px 0 6px}' +
      '.bbx-postmortem-body h2:first-child{margin-top:0}' +
      '.bbx-postmortem-body p{margin:0 0 10px}' +
      '.bbx-postmortem-body ul{margin:0 0 10px;padding-left:18px}' +
      '.bbx-postmortem-body li{margin:0 0 4px}' +
      '.bbx-postmortem-body code{background:rgba(255,255,255,.08);padding:1px 4px;' +
      'border-radius:3px;font-size:12px}' +
      '.bbx-postmortem-body a{color:#e8e8e0;text-decoration:underline}' +
      '.bbx-badge-postmortem{cursor:pointer;border:none;font:inherit}' +
      '</style>' +
      '<div class="bbx-top">' +
      '  <select class="bbx-picker" aria-label="Choose a recorded incident"></select>' +
      '  <div class="bbx-badges"></div>' +
      "</div>" +
      '<div class="bbx-postmortem" hidden>' +
      '  <div class="bbx-postmortem-title"></div>' +
      '  <div class="bbx-postmortem-body"></div>' +
      "</div>" +
      '<div class="bbx-deck" hidden>' +
      '  <div class="bbx-readout">' +
      '    <span class="bbx-time">--:--:--</span>' +
      '    <span class="bbx-time-note">UTC</span>' +
      '    <button type="button" class="bbx-replay">replay \u00D7' + REPLAY_RATE + "</button>" +
      "  </div>" +
      '  <div class="bbx-track">' +
      '    <div class="bbx-aftermath" aria-hidden="true"></div>' +
      '    <div class="bbx-markers" aria-hidden="true"></div>' +
      '    <input type="range" class="bbx-scrub" step="1000" aria-label="Scrub through the incident window, one second per step">' +
      "  </div>" +
      '  <div class="bbx-gauges"></div>' +
      '  <div class="bbx-feed" aria-label="Events up to the cursor"></div>' +
      '  <div class="bbx-foot">telemetry sampled once a minute; values between samples are interpolated \u00B7 events sit at their exact timestamps</div>' +
      "</div>" +
      '<div class="bbx-empty" hidden></div>';
 
    els.picker = host.querySelector(".bbx-picker");
    els.badges = host.querySelector(".bbx-badges");
    els.postmortem = host.querySelector(".bbx-postmortem");
    els.postmortemTitle = host.querySelector(".bbx-postmortem-title");
    els.postmortemBody = host.querySelector(".bbx-postmortem-body");
    els.deck = host.querySelector(".bbx-deck");
    els.time = host.querySelector(".bbx-time");
    els.replay = host.querySelector(".bbx-replay");
    els.scrub = host.querySelector(".bbx-scrub");
    els.aftermath = host.querySelector(".bbx-aftermath");
    els.markers = host.querySelector(".bbx-markers");
    els.gauges = host.querySelector(".bbx-gauges");
    els.feed = host.querySelector(".bbx-feed");
    els.empty = host.querySelector(".bbx-empty");
 
    els.picker.addEventListener("change", function () { loadIncident(els.picker.value); });
    els.scrub.addEventListener("input", function () {
      stopReplay();
      setCursor(Number(els.scrub.value));
    });
    els.scrub.addEventListener("keydown", function (ev) {
      if (ev.shiftKey && (ev.key === "ArrowLeft" || ev.key === "ArrowRight")) {
        ev.preventDefault();
        stopReplay();
        setCursor(state.cursor + (ev.key === "ArrowRight" ? 10000 : -10000));
      }
    });
    els.replay.addEventListener("click", toggleReplay);
    if (reduceMotion) els.replay.hidden = true;
 
    els.badges.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-postmortem]");
      if (!btn) return;
      togglePostmortem(btn.getAttribute("data-postmortem"), btn);
    });
  }
 
  function setStatusline(html) { if (statusline) statusline.innerHTML = html; }
 
  /* ── Postmortem panel ────────────────────────────────────────────── */
  function resetPostmortemPanel() {
    els.postmortem.hidden = true;
    els.postmortemTitle.textContent = "";
    els.postmortemBody.innerHTML = "";
  }
 
  function togglePostmortem(id, btn) {
    if (!els.postmortem.hidden) {
      els.postmortem.hidden = true;
      if (btn) btn.setAttribute("aria-expanded", "false");
      return;
    }
    if (btn) btn.setAttribute("aria-expanded", "true");
 
    var cached = postmortemCache[id];
    if (cached) {
      els.postmortemTitle.textContent = cached.title;
      els.postmortemBody.innerHTML = cached.html;
      els.postmortem.hidden = false;
      return;
    }
 
    els.postmortemTitle.textContent = "Loading postmortem\u2026";
    els.postmortemBody.innerHTML = "";
    els.postmortem.hidden = false;
 
    fetchJson(BASE + "/incidents/" + encodeURIComponent(id) + "/postmortem").then(function (res) {
      if (!res.ok) throw new Error(res.error || "postmortem fetch failed");
      postmortemCache[id] = { title: res.title, html: res.html };
      els.postmortemTitle.textContent = res.title;
      els.postmortemBody.innerHTML = res.html;
    }).catch(function () {
      els.postmortemTitle.textContent = "Postmortem unavailable";
      els.postmortemBody.innerHTML =
        '<p>This incident is marked as having a postmortem, but it would not load. Try again shortly.</p>';
    });
  }
 
  /* ── Rendering ───────────────────────────────────────────────────── */
  function setCursor(ms) {
    var c = state.current;
    if (!c) return;
    state.cursor = Math.max(c.t0, Math.min(c.t1, ms));
    els.scrub.value = state.cursor;
    els.scrub.setAttribute("aria-valuetext", hhmmss(state.cursor) + " UTC");
    els.time.textContent = hhmmss(state.cursor);
    renderGauges();
    renderFeed();
  }
 
  window.addEventListener("atlas:blackbox:seek-event", function (ev) {
    var c = state.current;
    if (!c || !ev.detail || !ev.detail.ts) return;
    var ms = typeof ev.detail.ts === "number" ? ev.detail.ts : Date.parse(ev.detail.ts);
    if (!Number.isFinite(ms) || ms < c.t0 || ms > c.t1) return;
    stopReplay();
    setCursor(ms);
    var section = document.getElementById("blackbox");
    if (section) section.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
  });
 
  function gaugeRow(label, value, max, unit, text) {
    var pct = value == null || max == null || max === 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
    var display = text != null ? text : (value == null ? "\u2013" : Math.round(value) + unit);
    return '<div class="bbx-gauge"><span class="bbx-gauge-label">' + esc(label) + "</span>" +
      '<span class="bbx-gauge-bar"><span class="bbx-gauge-fill" style="width:' + pct.toFixed(1) + '%"></span></span>' +
      '<span class="bbx-gauge-val">' + esc(display) + "</span></div>";
  }
 
  function renderGauges() {
    var t = telemetryAt(state.current.frames, state.cursor);
    if (!t || t.online === false) {
      els.gauges.innerHTML = '<div class="bbx-offline">SPECULAR-CORE offline or unsampled at this point in the record</div>';
      return;
    }
    els.gauges.innerHTML =
      gaugeRow("gpu", t.gpu_util, 100, "%") +
      gaugeRow("gpu temp", t.gpu_temp, 100, "\u00B0C") +
      gaugeRow("vram", t.vram_used, t.vram_total, "",
        t.vram_used == null ? "\u2013" : (t.vram_used / 1024).toFixed(1) + " / " + (t.vram_total / 1024).toFixed(1) + " GB") +
      gaugeRow("cpu", t.cpu, 100, "%") +
      gaugeRow("ram", t.ram, 100, "%");
    emit("cursor-telemetry", { incident: state.current.id, cursor: state.cursor, telemetry: t });
  }
 
  var DIALECT_LABEL = { github: "ci/cd", cloudflare: "cf", alert: "runtime", drill: "drill" };
  function renderFeed() {
    var visible = state.current.events.filter(function (e) { return e.ms <= state.cursor; });
    var rows = visible.slice(-FEED_MAX).reverse().map(function (e, i) {
      var isTrigger = state.current.triggerMs.indexOf(e.ms) !== -1 && e.level === "failure";
      return '<div class="bbx-ev bbx-ev-' + esc(e.level) + (i === 0 ? " bbx-ev-latest" : "") + '">' +
        '<span class="bbx-ev-t">' + hhmmss(e.ms) + "</span>" +
        '<span class="bbx-ev-dot"></span>' +
        '<span class="bbx-ev-dialect">' + esc(DIALECT_LABEL[e.dialect] || e.dialect || "\u2013") + "</span>" +
        '<span class="bbx-ev-title">' + esc(e.title || e.event || "(untitled event)") + "</span>" +
        (isTrigger ? '<span class="bbx-ev-trig">trigger</span>' : "") +
        "</div>";
    });
    els.feed.innerHTML = rows.length
      ? rows.join("")
      : '<div class="bbx-ev bbx-ev-none">no events yet at this point in the window; the quiet before it</div>';
  }
 
  function renderMarkers() {
    var c = state.current;
    var span = c.t1 - c.t0 || 1;
    var html = "";
    c.events.forEach(function (e) {
      var left = ((e.ms - c.t0) / span) * 100;
      var cls = e.dialect === "github" ? "bbx-mk-deploy" : "bbx-mk-" + (e.level || "info");
      html += '<span class="bbx-mk ' + cls + '" style="left:' + left.toFixed(2) + '%" title="' +
        esc(hhmmss(e.ms) + " \u00B7 " + (e.title || e.event || e.level)) + '"></span>';
    });
    c.triggerMs.forEach(function (ms) {
      var left = ((ms - c.t0) / span) * 100;
      html += '<span class="bbx-mk bbx-mk-trigger" style="left:' + left.toFixed(2) + '%" title="trigger \u00B7 ' + esc(hhmmss(ms)) + '"></span>';
    });
    els.markers.innerHTML = html;
 
    /* Shade the fall: everything after the first trigger is aftermath. */
    var firstTrig = c.triggerMs.length ? Math.min.apply(null, c.triggerMs) : null;
    if (firstTrig != null) {
      var leftPct = ((firstTrig - c.t0) / span) * 100;
      els.aftermath.style.left = leftPct.toFixed(2) + "%";
      els.aftermath.style.display = "";
    } else {
      els.aftermath.style.display = "none";
    }
  }
 
  /* ── Replay ──────────────────────────────────────────────────────── */
  function toggleReplay() {
    if (state.playing) { stopReplay(); return; }
    var c = state.current;
    if (!c) return;
    /* Replay means watching the approach: start from the top of the
       window, not from wherever the cursor was parked. */
    setCursor(c.t0);
    state.playing = true;
    els.replay.textContent = "pause";
    state.playTimer = setInterval(function () {
      var next = state.cursor + REPLAY_RATE * REPLAY_TICK_MS;
      if (next >= c.t1) { setCursor(c.t1); stopReplay(); return; }
      setCursor(next);
    }, REPLAY_TICK_MS);
  }
  function stopReplay() {
    if (state.playTimer) clearInterval(state.playTimer);
    state.playTimer = null;
    state.playing = false;
    els.replay.textContent = "replay \u00D7" + REPLAY_RATE;
  }
 
  /* ── Data flow ───────────────────────────────────────────────────── */
  function loadIncident(id) {
    stopReplay();
    resetPostmortemPanel();
    fetchJson(BASE + "/incidents/" + encodeURIComponent(id)).then(function (inc) {
      var frames = (inc.frames || []).slice().sort(function (a, b) { return a.ts - b.ts; });
      if (!frames.length) {
        els.deck.hidden = true;
        showEmpty("this incident recorded an empty buffer; the box was new when it triggered.");
        return;
      }
      var triggerMs = (inc.triggers || []).map(function (t) { return Date.parse(t.ts); })
        .filter(function (n) { return Number.isFinite(n); });
      state.current = {
        id: inc.id,
        sealed: inc.sealed === true,
        hasPostmortem: Boolean(inc.hasPostmortem),
        frames: frames,
        events: flattenEvents(inc),
        triggerMs: triggerMs,
        t0: frames[0].ts,
        t1: frames[frames.length - 1].ts
      };
      emit("incident", { incident: inc, frameCount: frames.length });
      els.badges.innerHTML =
        '<span class="bbx-badge">' + frames.length + " frames</span>" +
        '<span class="bbx-badge">' + state.current.events.length + " events</span>" +
        '<span class="bbx-badge ' + (state.current.sealed ? "bbx-badge-sealed" : "bbx-badge-open") + '">' +
        (state.current.sealed ? "sealed" : "recording aftermath") + "</span>";
      if (state.current.hasPostmortem) {
        els.badges.innerHTML +=
          '<button type="button" class="bbx-badge bbx-badge-postmortem" data-postmortem="' +
          esc(inc.id) + '" aria-expanded="false">postmortem \u2192</button>';
      }
      els.scrub.min = state.current.t0;
      els.scrub.max = state.current.t1;
      els.empty.hidden = true;
      els.deck.hidden = false;
      renderMarkers();
      /* Land ON the hit; scrubbing back is the visitor's move. */
      setCursor(triggerMs.length ? triggerMs[0] : state.current.t1);
    }).catch(function () {
      showEmpty("that incident would not load; the recorder is reachable but this record was not. try another.");
    });
  }
 
  function showEmpty(msg) {
    els.empty.hidden = false;
    els.empty.innerHTML = '<span class="t-dim">' + esc(msg) + "</span>";
  }
 
  function init() {
    build();
    setStatusline('<span class="t-dim">contacting recorder\u2026</span>');
 
    fetchJson(BASE + "/status").then(function (s) {
      var tick = s.last_tick ? hhmmss(s.last_tick) + " UTC" : "never";
      emit("status", s);
      setStatusline(
        (s.recording ? '<span class="t-ok">\u25CF recording</span>' : '<span class="t-err">\u25CF not recording</span>') +
        ' <span class="t-faint">\u00B7 ' + (s.buffer ? s.buffer.frames : 0) + " frames buffered \u00B7 last tick " + esc(tick) + "</span>"
      );
    }).catch(function () {
      setStatusline('<span class="t-dim">recorder status unavailable</span>');
    });
 
    fetchJson(BASE + "/incidents").then(function (list) {
      state.incidents = list.incidents || [];
      emit("incidents", { incidents: state.incidents });
      if (!state.incidents.length) {
        els.deck.hidden = true;
        showEmpty("no incidents on the shelf. the estate has not failed on record yet; this deck waits for the first one. (a ground test can stage a drill.)");
        return;
      }
      els.picker.innerHTML = state.incidents.map(function (inc) {
        var label = hhmmss(inc.ts) + " \u00B7 " + (inc.trigger && inc.trigger.title ? inc.trigger.title : "failure") +
          (inc.trigger_count > 1 ? " (+" + (inc.trigger_count - 1) + ")" : "") +
          (inc.hasPostmortem ? " \u00B7 postmortem" : "");
        return '<option value="' + esc(inc.id) + '">' + esc(label.slice(0, 72)) + "</option>";
      }).join("");
      loadIncident(state.incidents[0].id);
    }).catch(function () {
      els.deck.hidden = true;
      showEmpty("recorder unreachable. the black box is behind api.atlas-systems.uk; when it answers again, the incidents will still be there. that is the point of it.");
    });
  }
 
  init();
 
  /* Exposed for the smoke test only; nothing on the page depends on it. */
  window.AtlasBlackboxTimeline = { telemetryAt: telemetryAt, lerp: lerp, flattenEvents: flattenEvents };
})();
