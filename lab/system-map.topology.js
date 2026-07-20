/**
 * system-map.topology.js
 * The declared half of the public system map.
 *
 * Worker nodes get live status from the public registry at runtime. Everything
 * else here is declared because bindings and tunnel wiring are not discoverable
 * through that registry. Private repositories and services are deliberately
 * absent. The runtime registry is fail-closed, so an undeclared account Worker
 * cannot appear as an orphan on the public map.
 *
 * Browser-side consumption and deploy-time flow are omitted to keep the map
 * focused on runtime architecture.
 *
 * Roles: worker | site | local | infra | ext
 * Edge kinds: binding | tunnel | http | alert | dispatch | notify | poll | probe
 */
(function () {
  "use strict";

  var NODES = [
    { id: "atlas-notify", role: "worker", label: "atlas-notify", hub: true,
      blurb: "Event router; central Discord poster" },
    { id: "atlas-api-index", role: "worker", label: "atlas-api-index",
      blurb: "Approved public Worker registry; source of this map's live data" },
    { id: "atlas-api-public", role: "worker", label: "atlas-api-public",
      blurb: "Versioned public API for estate status, docs, RAG stats, search, and badges" },
    { id: "atlas-blackbox", role: "worker", label: "atlas-blackbox",
      blurb: "Rolling incident recorder for public runtime and pipeline signals" },
    { id: "ramone-trigger", role: "worker", label: "ramone-trigger",
      blurb: "Voice-triggered GitHub Actions dispatch" },
    { id: "specular-edge", role: "worker", kind: "worker",
      layer: "edge", district: "edge", label: "specular-edge",
      blurb: "Edge cache in front of SPECULAR-CORE telemetry" },
    { id: "ramone-edge", role: "worker", kind: "worker",
      layer: "edge", district: "edge", label: "ramone-edge",
      blurb: "Public edge in front of the Ramone stack" },
    { id: "github-pulse", role: "worker", label: "github-pulse",
      blurb: "GitHub activity proxy" },
    { id: "site-pulse", role: "worker", label: "site-pulse",
      blurb: "Cloudflare Analytics proxy" },
    { id: "deploy-watch", role: "worker", label: "deploy-watch",
      blurb: "Pages deploy poller" },
    { id: "atlas-dora", role: "worker", label: "atlas-dora",
      blurb: "Aggregate delivery performance metrics" },

    { id: "atlas-systems", role: "site", label: "atlas-systems.uk",
      blurb: "This site; main domain on Cloudflare Pages" },
    { id: "status", role: "site", label: "status.atlas-systems.uk",
      blurb: "Live status page" },
    { id: "atlas-doc-viewer", role: "site", label: "cv.atlas-systems.uk",
      blurb: "CV gate and viewer" },

    { id: "specular-telemetry", role: "local", label: "specular-telemetry",
      blurb: "Hardware telemetry, WSL systemd, port 9000" },
    { id: "atlas-corpus", role: "local", label: "atlas-corpus",
      blurb: "RAG search over public estate docs, port 8092; public at corpus.atlas-systems.uk" },
    { id: "ramone-memory", role: "local", label: "ramone-memory",
      blurb: "Ollama-compatible memory proxy, port 8091; LAN only by design" },
    { id: "ollama", role: "local", label: "ollama",
      blurb: "Local inference, port 11434" },
    { id: "home-assistant", role: "local", label: "home assistant",
      blurb: "Ramone voice pipeline host" },

    { id: "tunnel", role: "infra", label: "cloudflared", blurb: "Tunnel; the only door into the LAN" },
    { id: "github", role: "ext", label: "github", blurb: "Public repos, Actions, workflow_dispatch API" },
    { id: "discord", role: "ext", label: "discord", blurb: "Notification surface; channel per signal class" }
  ];

  var KV = [
    { id: "kv-registry", parent: "atlas-api-index", label: "REGISTRY_KV" },
    { id: "kv-telemetry", parent: "specular-edge", label: "TELEMETRY_KV" },
    { id: "kv-notifylog", parent: "atlas-notify", label: "NOTIFY_LOG" },
    { id: "kv-deploy", parent: "deploy-watch", label: "state KV" }
  ];

  var EDGES = [
    { from: "ramone-trigger", to: "atlas-notify", kind: "binding", label: "alert envelope" },
    { from: "specular-edge", to: "atlas-notify", kind: "binding", label: "alert envelope" },
    { from: "ramone-edge", to: "atlas-notify", kind: "binding", label: "alert envelope" },
    { from: "atlas-api-public", to: "atlas-notify", kind: "binding", label: "infra/rag alerts" },
    { from: "atlas-blackbox", to: "atlas-notify", kind: "binding", label: "incident reports" },
    { from: "atlas-corpus", to: "atlas-notify", kind: "alert", label: "alert envelope" },

    { from: "specular-edge", to: "tunnel", kind: "tunnel", label: "origin fetch" },
    { from: "tunnel", to: "specular-telemetry", kind: "tunnel", label: "port 9000" },
    { from: "tunnel", to: "atlas-corpus", kind: "tunnel", label: "port 8092" },

    { from: "home-assistant", to: "ramone-memory", kind: "http", label: "assist pipeline :8091" },
    { from: "ramone-memory", to: "ollama", kind: "http", label: "proxied :11434" },
    { from: "home-assistant", to: "ramone-trigger", kind: "dispatch", label: "voice deploy" },
    { from: "ramone-trigger", to: "github", kind: "dispatch", label: "workflow_dispatch" },

    { from: "atlas-notify", to: "discord", kind: "notify", label: "channel routing" },
    { from: "github", to: "discord", kind: "notify", label: "CI direct" },

    { from: "github-pulse", to: "github", kind: "poll", label: "activity" },
    { from: "site-pulse", to: "atlas-systems", kind: "poll", label: "zone analytics" },
    { from: "deploy-watch", to: "atlas-systems", kind: "poll", label: "pages deploys" },
    { from: "deploy-watch", to: "status", kind: "poll", label: "pages deploys" },
    { from: "deploy-watch", to: "atlas-doc-viewer", kind: "poll", label: "pages deploys" },
    { from: "atlas-dora", to: "atlas-notify", kind: "binding", label: "aggregate event evidence" },
    { from: "atlas-dora", to: "atlas-blackbox", kind: "binding", label: "incident evidence" },
    { from: "atlas-dora", to: "deploy-watch", kind: "binding", label: "deploy evidence" }
  ];

  window.ATLAS_TOPOLOGY = { nodes: NODES, kv: KV, edges: EDGES };
})();
