/**
 * system-map.topology.js
 * The declared half of the system map.
 *
 * Nodes that are Workers get their live status from the registry at runtime;
 * everything else here (sites, local services, externals, and every edge) is
 * declared, because bindings and tunnel wiring live in wrangler.toml and
 * cloudflared config, which no API exposes. Each edge cites where the
 * relationship is documented so this file can be audited against
 * decisions.md instead of trusted on faith.
 *
 * Deliberately excluded:
 * - Browser-side consumption (Lab fetching its own panels). The map is the
 *   backend's shape; the page you are reading it on is the lens, not a node.
 * - Deploy-time flow (Actions pushing to every repo). Fourteen deploy edges
 *   would bury the runtime story; CI appears only where it is a runtime
 *   actor (ramone-trigger dispatching workflows, Actions posting to Discord).
 *
 * Orphan rule: any Worker the registry discovers that is not listed here is
 * still rendered by system-map.js, unconnected, so a brand new Worker shows
 * up on the map before this file learns its wiring.
 *
 * Roles: worker | site | local | infra | ext
 * Edge kinds: binding | tunnel | http | alert | dispatch | notify | poll | probe
 * (probe edges are generated in system-map.js from live registry data, one
 * per discovered Worker, because the prober's target list IS live data.)
 */
(function () {
  "use strict";

  var NODES = [
    /* ── Cloudflare Workers (status resolved live from the registry) ── */
    { id: "atlas-notify",    role: "worker", label: "atlas-notify",    hub: true,
      blurb: "Event router; central Discord poster" },
    { id: "atlas-api-index", role: "worker", label: "atlas-api-index",
      blurb: "Self-documenting Worker registry; source of this map's live data" },
    { id: "ramone-trigger",  role: "worker", label: "ramone-trigger",
      blurb: "Voice-triggered GitHub Actions dispatch" },
    { id: "specular-edge",   role: "worker", label: "specular-edge",
      blurb: "Edge cache in front of SPECULAR-CORE telemetry" },
    { id: "ramone-edge",     role: "worker", label: "ramone-edge",
      blurb: "Public edge in front of the Ramone stack" },
    { id: "github-pulse",    role: "worker", label: "github-pulse",
      blurb: "GitHub stats proxy" },
    { id: "site-pulse",      role: "worker", label: "site-pulse",
      blurb: "Cloudflare Analytics proxy" },
    { id: "deploy-watch",    role: "worker", label: "deploy-watch",
      blurb: "Pages deploy poller" },
    { id: "atlas-vault",     role: "worker", label: "atlas-vault",
      blurb: "Personal streaming-data backup vault" },
    { id: "atlas-backend",   role: "worker", label: "atlas-backend",
      blurb: "Legacy backend Worker" },

    /* ── Cloudflare Pages sites ── */
    { id: "atlas-systems",    role: "site", label: "atlas-systems.uk",
      blurb: "This site; main domain on Cloudflare Pages" },
    { id: "status",           role: "site", label: "status.atlas-systems.uk",
      blurb: "Live status page" },
    { id: "atlas-doc-viewer", role: "site", label: "cv.atlas-systems.uk",
      blurb: "CV gate and viewer" },

    /* ── SPECULAR-CORE local services (behind the tunnel; the registry
          cannot see these, so no liveness is claimed for them) ── */
    { id: "specular-telemetry", role: "local", label: "specular-telemetry",
      blurb: "Hardware telemetry, WSL systemd, port 9000" },
    { id: "atlas-corpus",       role: "local", label: "atlas-corpus",
      blurb: "RAG search over estate docs, port 8092; public at corpus.atlas-systems.uk" },
    { id: "ramone-memory",      role: "local", label: "ramone-memory",
      blurb: "Ollama-compatible memory proxy, port 8091; LAN only by design" },
    { id: "ollama",             role: "local", label: "ollama",
      blurb: "Local inference, port 11434" },
    { id: "home-assistant",     role: "local", label: "home assistant",
      blurb: "Ramone voice pipeline host" },

    /* ── Connective infrastructure and externals ── */
    { id: "tunnel",  role: "infra", label: "cloudflared", blurb: "Tunnel; the only door into the LAN" },
    { id: "github",  role: "ext",   label: "github",      blurb: "Repos, Actions, workflow_dispatch API" },
    { id: "discord", role: "ext",   label: "discord",     blurb: "Notification surface; channel per signal class" }
  ];

  /* KV namespaces render as small satellites pinned beside their Worker.
     They are storage the Worker owns, not peers on the network, and drawing
     them as full nodes would suggest they can be talked to directly. */
  var KV = [
    { id: "kv-registry",  parent: "atlas-api-index", label: "REGISTRY_KV" },   // src: decisions.md, Registry discovery is read-only
    { id: "kv-telemetry", parent: "specular-edge",   label: "TELEMETRY_KV" },  // src: decisions.md, KV conditional-write rule
    { id: "kv-notifylog", parent: "atlas-notify",    label: "NOTIFY_LOG" },    // src: decisions.md, Lab page ring buffer
    { id: "kv-deploy",    parent: "deploy-watch",    label: "state KV" }       // src: decisions.md, KV conditional-write rule (deploy-watch write guard)
  ];

  var EDGES = [
    /* Worker runtime alerts over the ATLAS_NOTIFY service binding.
       src: decisions.md, Discord routing, clarified 2026-07-02. */
    { from: "ramone-trigger", to: "atlas-notify", kind: "binding", label: "alert envelope" },
    { from: "specular-edge",  to: "atlas-notify", kind: "binding", label: "alert envelope" },
    /* src: decisions.md, Problems encountered: ramone-edge's notify calls
       moved to a service binding after public-hostname 522s. */
    { from: "ramone-edge",    to: "atlas-notify", kind: "binding", label: "alert envelope" },
    /* atlas-corpus consumes the same envelope but lives on the LAN, so it
       reaches atlas-notify over HTTPS rather than a binding.
       src: decisions.md, Discord routing (envelope consumers list). */
    { from: "atlas-corpus",   to: "atlas-notify", kind: "alert",   label: "alert envelope" },

    /* Tunnel wiring. src: decisions.md, Docker, milestone 2026-07-02:
       telemetry and corpus are both tunnelled via the cloudflared instance;
       specular-edge fronts telemetry at api.atlas-systems.uk/specular,
       corpus is public at corpus.atlas-systems.uk. */
    { from: "specular-edge", to: "tunnel",             kind: "tunnel", label: "origin fetch" },
    { from: "tunnel",        to: "specular-telemetry", kind: "tunnel", label: "port 9000" },
    { from: "tunnel",        to: "atlas-corpus",       kind: "tunnel", label: "port 8092" },

    /* Ramone voice and memory paths.
       src: context doc, Logic Lego Suite; decisions.md, ramone-memory is an
       Ollama-compatible proxy / Voice deployment is a client of the pipeline. */
    { from: "home-assistant", to: "ramone-memory",  kind: "http",     label: "assist pipeline :8091" },
    { from: "ramone-memory",  to: "ollama",         kind: "http",     label: "proxied :11434" },
    { from: "home-assistant", to: "ramone-trigger", kind: "dispatch", label: "voice deploy" },
    { from: "ramone-trigger", to: "github",         kind: "dispatch", label: "workflow_dispatch" },

    /* Notification surfaces.
       src: context doc, Discord channel structure; decisions.md, Discord
       routing (two paths by design: envelope via atlas-notify, CI direct). */
    { from: "atlas-notify", to: "discord", kind: "notify", label: "channel routing" },
    { from: "github",       to: "discord", kind: "notify", label: "CI direct curl" },
    { from: "atlas-vault",  to: "discord", kind: "notify", label: "daily vault report" },

    /* Read-side proxies and pollers.
       src: decisions.md, Repo structure (github-pulse, site-pulse,
       deploy-watch descriptions). */
    { from: "github-pulse", to: "github",           kind: "poll", label: "stats" },
    { from: "site-pulse",   to: "atlas-systems",    kind: "poll", label: "zone analytics" },
    { from: "deploy-watch", to: "atlas-systems",    kind: "poll", label: "pages deploys" },
    { from: "deploy-watch", to: "status",           kind: "poll", label: "pages deploys" },
    { from: "deploy-watch", to: "atlas-doc-viewer", kind: "poll", label: "pages deploys" }
  ];

  window.ATLAS_TOPOLOGY = { nodes: NODES, kv: KV, edges: EDGES };
})();
