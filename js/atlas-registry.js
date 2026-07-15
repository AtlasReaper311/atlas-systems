/**
 * atlas-registry.js
 * One client for the live registry, filtered by the canonical public topology.
 *
 * The system map (Lab), the unified Live section status panel (Lab), and the
 * homepage estate strip all need the same document. Three independent fetch
 * loops would triple the request count and let the three views disagree with
 * each other mid-poll; a single client with subscribers means one request,
 * one snapshot, every consumer rendering the same truth at the same moment.
 *
 * Design notes:
 * - Poll interval is 60s to match the registry's own edge caching rhythm.
 *   Polling faster only re-reads the same cached document.
 * - Last-good snapshot is kept in memory and re-emitted with stale:true when
 *   a poll fails. Consumers decide how to show staleness; the client never
 *   pretends a failed poll produced fresh data, and never drops good data
 *   because one poll failed. Same conditional-state philosophy as the
 *   estate's KV write rule: state changes are events, blips are not.
 * - No localStorage. A hard refresh should show the real current state, not
 *   yesterday's snapshot dressed as live data.
 *
 * API:
 *   AtlasRegistry.subscribe(fn)   fn(snapshot) called immediately if a
 *                                 snapshot exists, then on every poll.
 *                                 Returns an unsubscribe function.
 *   AtlasRegistry.refresh()       force an immediate poll (deduped if one
 *                                 is already in flight).
 *
 * Snapshot shape:
 *   {
 *     ok: bool,            // this emission came from a successful poll
 *     stale: bool,         // data is from an earlier successful poll
 *     fetchedAt: Date|null,
 *     generatedAt: string|null,   // registry's own build timestamp
 *     counts: { workers, documented, undocumented } | null,
 *     warnings: string[],
 *     workers: [ { name, documented, note, probeUrl, via, meta|null } ]
 *   }
 */
(function () {
  "use strict";

  var ENDPOINT = "https://api.atlas-systems.uk/";
  var TOPOLOGY_ENDPOINT = "https://api.atlas-systems.uk/v1/topology";
  var POLL_MS = 60000;

  var subscribers = [];
  var snapshot = null;
  var lastGood = null;
  var inFlight = false;
  var timer = null;
  var topologyPromise = null;

  /* Normalise both shapes the registry has ever produced. The Lab API panel
     already had to learn this the hard way (a shape change rendered a healthy
     backend as "No endpoints reported"), so the shared client owns the
     normalisation once instead of every consumer re-learning it. */
  function normalise(data) {
    var workers = [];

    if (Array.isArray(data.workers)) {
      for (var i = 0; i < data.workers.length; i++) {
        var w = data.workers[i];
        workers.push({
          name: (w.meta && w.meta.name) || w.name || "unknown",
          documented: !!w.documented,
          note: w.note || null,
          probeUrl: w.probe_url || "",
          via: w.via || "",
          meta: w.meta || null
        });
      }
    } else if (Array.isArray(data.endpoints)) {
      /* Legacy flat shape: group endpoints back into per-worker entries so
         consumers only ever see one shape. */
      var byWorker = {};
      for (var j = 0; j < data.endpoints.length; j++) {
        var ep = data.endpoints[j];
        var name = ep.worker || "unknown";
        if (!byWorker[name]) {
          byWorker[name] = {
            name: name,
            documented: true,
            note: null,
            probeUrl: "",
            via: "",
            meta: { name: name, description: "", version: "", endpoints: [], source: ep.source || "" }
          };
        }
        byWorker[name].meta.endpoints.push({
          method: ep.method || "GET",
          path: ep.path || "",
          description: ep.description || ""
        });
      }
      for (var key in byWorker) {
        if (Object.prototype.hasOwnProperty.call(byWorker, key)) workers.push(byWorker[key]);
      }
    }

    return {
      generatedAt: data.generated_at || null,
      counts: data.counts || null,
      warnings: Array.isArray(data.discovery_warnings) ? data.discovery_warnings : [],
      workers: workers
    };
  }

  function fetchJson(url, options) {
    return fetch(url, options).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  function getTopology() {
    if (!topologyPromise) {
      topologyPromise = fetchJson(TOPOLOGY_ENDPOINT, {
        headers: { Accept: "application/json" },
        cache: "no-store"
      }).catch(function (error) {
        topologyPromise = null;
        throw error;
      });
    }

    return topologyPromise;
  }

  function filterToDeclaredWorkers(registry, topology) {
    var components =
      topology && Array.isArray(topology.components)
        ? topology.components
        : [];

    var allowed = {};
    for (var i = 0; i < components.length; i++) {
      var component = components[i];
      if (
        component &&
        component.kind === "worker" &&
        typeof component.name === "string"
      ) {
        allowed[component.name] = true;
      }
    }

    var workers = registry.workers.filter(function (worker) {
      return !!allowed[worker.name];
    });

    return {
      generatedAt: registry.generatedAt,
      warnings: registry.warnings,
      workers: workers,
      counts: {
        workers: workers.length,
        documented: workers.filter(function (worker) {
          return worker.documented;
        }).length,
        undocumented: workers.filter(function (worker) {
          return !worker.documented;
        }).length
      }
    };
  }

  function emit() {
    for (var i = 0; i < subscribers.length; i++) {
      try { subscribers[i](snapshot); } catch (e) { /* one bad consumer must not break the rest */ }
    }
  }

  function poll() {
    if (inFlight) return;
    inFlight = true;

    Promise.all([
      fetchJson(ENDPOINT, {
        headers: { Accept: "application/json" },
        cache: "no-store"
      }),
      getTopology()
    ])
      .then(function (values) {
        var registry = normalise(values[0]);
        var filtered = filterToDeclaredWorkers(registry, values[1]);

        snapshot = {
          ok: true,
          stale: false,
          fetchedAt: new Date(),
          generatedAt: filtered.generatedAt,
          counts: filtered.counts,
          warnings: filtered.warnings,
          workers: filtered.workers
        };
        lastGood = snapshot;
      })
      .catch(function () {
        if (lastGood) {
          snapshot = {
            ok: false,
            stale: true,
            fetchedAt: lastGood.fetchedAt,
            generatedAt: lastGood.generatedAt,
            counts: lastGood.counts,
            warnings: lastGood.warnings,
            workers: lastGood.workers
          };
        } else {
          snapshot = {
            ok: false,
            stale: false,
            fetchedAt: null,
            generatedAt: null,
            counts: null,
            warnings: [],
            workers: []
          };
        }
      })
      .then(function () {
        inFlight = false;
        emit();
      });
  }

  function ensurePolling() {
    if (timer !== null) return;
    poll();
    timer = setInterval(poll, POLL_MS);
    /* Pause polling in hidden tabs; resume with a fresh poll on return.
       A backgrounded tab quietly burning a request a minute serves no one. */
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        if (timer !== null) { clearInterval(timer); timer = null; }
      } else if (timer === null) {
        poll();
        timer = setInterval(poll, POLL_MS);
      }
    });
  }

  window.AtlasRegistry = {
    subscribe: function (fn) {
      subscribers.push(fn);
      ensurePolling();
      if (snapshot) fn(snapshot);
      return function unsubscribe() {
        var idx = subscribers.indexOf(fn);
        if (idx !== -1) subscribers.splice(idx, 1);
      };
    },
    refresh: function () { poll(); }
  };
})();
