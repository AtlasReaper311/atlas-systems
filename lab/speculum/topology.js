/**
 * SPECULUM / public topology snapshot
 *
 * A reviewed public projection of Atlas Systems attention paths. Repository
 * classification comes from atlas-infra. Runtime relationships come from the
 * public estate manifest and direct repository configuration. Periodic cadence
 * comes from the owning repository's current workflow, Worker configuration,
 * timer documentation, or sampler documentation.
 *
 * Private repository identities are deliberately absent. This file is a dated
 * snapshot, not a live registry client.
 */

export const SNAPSHOT = Object.freeze({
  reviewedAt: '2026-07-27',
  classificationAuthority: 'AtlasReaper311/atlas-infra/policy/public-repository-classifications.json',
  classificationFingerprint: 'sha256:30f47de465c1117fda375b70b7d156d73f4b39622873133c756f7fa06539c6a0',
  topologyAuthority: 'AtlasReaper311/atlas-api-public/data/estate.manifest.json',
  topologyBlob: '4fb554265a60c320f74500af1cfebc9465921484',
  scope: 'public projection only',
});

function node({
  id,
  label = id,
  ring,
  kind,
  lifecycle = 'production',
  cadence = 0,
  cadenceKind = 'request',
  verified = true,
  source = null,
  watches = [],
  reports = [],
  note,
}) {
  return Object.freeze({
    id,
    label,
    ring,
    kind,
    lifecycle,
    cadence,
    cadenceKind,
    verified,
    source,
    state: 'live',
    watches: Object.freeze([...watches]),
    reports: Object.freeze([...reports]),
    note,
  });
}

export const CENTRE = node({
  id: 'atlas-systems',
  ring: 0,
  kind: 'product',
  cadenceKind: 'request',
  watches: ['github-pulse', 'site-pulse', 'deploy-watch', 'atlas-api-public'],
  note: 'the public site, portfolio, Lab, writing surface, and centre of this projection',
});

export const NODES = Object.freeze([
  CENTRE,

  // Ring 1: public and publicly documented runtime services.
  node({
    id: 'status', ring: 1, kind: 'service', cadenceKind: 'request',
    watches: ['atlas-api-public', 'atlas-api-index'],
    note: 'public reliability surface, evaluated when a person opens it',
  }),
  node({
    id: 'atlas-doc-viewer', ring: 1, kind: 'service', lifecycle: 'active', cadenceKind: 'request',
    note: 'public document viewer at cv.atlas-systems.uk',
  }),
  node({
    id: 'atlas-api-public', ring: 1, kind: 'observer', cadence: 600, cadenceKind: 'cron',
    source: 'AtlasReaper311/atlas-api-public:wrangler.toml [triggers] */10',
    watches: [
      'atlas-api-index', 'github-pulse', 'specular-edge', 'atlas-corpus',
      'specular-sentinel', 'site-pulse', 'deploy-watch', 'ramone-trigger',
      'atlas-blackbox', 'atlas-quota-watch', 'ramone-edge', 'atlas-dora',
    ],
    reports: ['atlas-notify'],
    note: 'versioned public API spine and ten-minute reliability evaluator',
  }),
  node({
    id: 'atlas-api-index', ring: 1, kind: 'observer', cadence: 3600, cadenceKind: 'cron',
    source: 'AtlasReaper311/atlas-api-index:wrangler.toml [triggers] 7 * * * *',
    watches: ['atlas-notify', 'deploy-watch', 'github-pulse', 'ramone-edge', 'ramone-trigger', 'site-pulse', 'specular-edge'],
    reports: ['atlas-api-public'],
    note: 'hourly registry discovery, offset seven minutes from the hour',
  }),
  node({
    id: 'atlas-notify', ring: 1, kind: 'service', cadenceKind: 'event',
    reports: ['discord'],
    note: 'event router with a bounded public projection and external notification sinks',
  }),
  node({
    id: 'github-pulse', ring: 1, kind: 'observer', cadenceKind: 'request',
    watches: ['github'], reports: ['atlas-systems'],
    note: 'request-driven GitHub activity proxy; cache periods are not schedules',
  }),
  node({
    id: 'site-pulse', ring: 1, kind: 'observer', cadence: 86400, cadenceKind: 'cron',
    source: 'AtlasReaper311/site-pulse:wrangler.toml [triggers] 0 23 * * *',
    watches: ['cloudflare', 'atlas-systems'], reports: ['atlas-systems'],
    note: 'daily public site analytics refresh at 23:00 UTC',
  }),
  node({
    id: 'deploy-watch', ring: 1, kind: 'observer', cadence: 300, cadenceKind: 'cron',
    source: 'AtlasReaper311/deploy-watch:wrangler.toml [triggers] */5',
    watches: ['cloudflare', 'atlas-systems'], reports: ['atlas-notify', 'status'],
    note: 'five-minute Pages deployment outcome monitor',
  }),
  node({
    id: 'atlas-blackbox', ring: 1, kind: 'observer', cadenceKind: 'event',
    watches: ['specular-telemetry', 'atlas-notify'], reports: ['atlas-dora'],
    note: 'event-driven flight recorder for incident replay',
  }),
  node({
    id: 'specular-edge', label: 'specular-edge', ring: 1, kind: 'service', cadenceKind: 'request',
    watches: ['specular-telemetry', 'cloudflared'], reports: ['atlas-api-public'],
    note: 'public edge projection of local telemetry and last-known-good state',
  }),
  node({
    id: 'atlas-corpus', ring: 1, kind: 'service', cadenceKind: 'manual',
    watches: ['github', 'ollama'], reports: ['atlas-api-public', 'ramone-memory'],
    note: 'public estate knowledge service; ingestion is explicitly triggered rather than scheduled here',
  }),
  node({
    id: 'ramone-edge', ring: 1, kind: 'service', cadenceKind: 'request',
    watches: ['cloudflared', 'specular-edge', 'ollama', 'ramone-memory'],
    note: 'public Worker face for local Ramone services',
  }),
  node({
    id: 'ramone-memory', ring: 1, kind: 'service', lifecycle: 'active', cadenceKind: 'request',
    watches: ['ollama'], reports: ['ramone-edge', 'home-assistant'],
    note: 'local memory layer with no direct public route',
  }),
  node({
    id: 'ramone-trigger', label: 'ramone-trigger', ring: 1, kind: 'service', cadenceKind: 'request',
    watches: ['github'],
    note: 'authenticated allowlisted workflow dispatch',
  }),
  node({
    id: 'specular-sonify', ring: 1, kind: 'service', cadenceKind: 'request',
    watches: ['specular-telemetry'],
    note: 'read-only telemetry-derived sonification frame',
  }),
  node({
    id: 'atlas-quota-watch', ring: 1, kind: 'observer', cadence: 86400, cadenceKind: 'cron',
    source: 'AtlasReaper311/atlas-quota-watch:wrangler.toml [triggers] 45 6 * * *',
    watches: ['cloudflare'], reports: ['atlas-notify'],
    note: 'daily quota and cost watchdog at 06:45 UTC',
  }),
  node({
    id: 'atlas-dora', ring: 1, kind: 'observer', cadenceKind: 'request',
    watches: ['atlas-notify', 'atlas-blackbox', 'deploy-watch', 'atlas-api-public'],
    note: 'request-driven aggregate delivery and recovery metrics',
  }),
  node({
    id: 'atlas-daily-digest', ring: 1, kind: 'observer', cadence: 86400, cadenceKind: 'cron',
    source: 'AtlasReaper311/atlas-daily-digest:wrangler.toml [triggers] 0 12 * * *',
    watches: ['atlas-notify', 'ollama'], reports: ['discord', 'home-assistant'],
    note: 'daily previous-day digest at 12:00 UTC',
  }),

  // Ring 2: periodic observers and the host they can see from inside.
  node({
    id: 'SPECULAR-CORE', ring: 2, kind: 'machine', cadenceKind: 'continuous',
    note: 'current local host for telemetry, Ollama, corpus, memory, and automation services',
  }),
  node({
    id: 'specular-telemetry', ring: 2, kind: 'observer', cadence: 30, cadenceKind: 'sampler',
    source: 'AtlasReaper311/specular-telemetry:README.md background sample interval',
    watches: ['SPECULAR-CORE', 'ollama'], reports: ['specular-edge'],
    note: 'local hardware and service sampler every thirty seconds',
  }),
  node({
    id: 'specular-sentinel', ring: 2, kind: 'observer', cadence: 300, cadenceKind: 'timer',
    source: 'AtlasReaper311/specular-sentinel:README.md five-minute systemd timer',
    watches: ['SPECULAR-CORE', 'atlas-corpus', 'ollama'], reports: ['atlas-api-public'],
    note: 'five-minute local reachability report from inside WSL2',
  }),
  node({
    id: 'atlas-journey-watch', ring: 2, kind: 'observer', lifecycle: 'active', cadence: 21600, cadenceKind: 'cron',
    source: 'AtlasReaper311/atlas-journey-watch:.github/workflows/journey-watch.yml 17 */6 * * *',
    watches: ['atlas-systems', 'status', 'atlas-api-public', 'atlas-api-index', 'ramone-edge', 'atlas-corpus'],
    reports: ['atlas-notify'],
    note: 'six-hourly synthetic journeys through public user paths',
  }),
  node({
    id: 'atlas-dep-audit', ring: 2, kind: 'observer', lifecycle: 'active', cadence: 604800, cadenceKind: 'cron',
    source: 'AtlasReaper311/atlas-dep-audit:.github/workflows/audit.yml 41 8 * * 1',
    watches: ['github', 'atlas-api-public', 'atlas-infra', 'osv'], reports: ['atlas-notify'],
    note: 'weekly public dependency, provenance, and contract assurance',
  }),
  node({
    id: 'atlas-resource-audit', ring: 2, kind: 'observer', lifecycle: 'active', cadence: 604800, cadenceKind: 'cron',
    source: 'AtlasReaper311/atlas-resource-audit:.github/workflows/audit.yml 41 7 * * 1',
    watches: ['cloudflare', 'atlas-infra'],
    note: 'weekly read-only reconciliation of declared public Cloudflare resources',
  }),
  node({
    id: 'atlas-gardener', ring: 2, kind: 'observer', lifecycle: 'active', cadenceKind: 'manual',
    watches: ['atlas-dep-audit', 'atlas-infra', 'github'],
    note: 'bounded remediation planner; current general flow has no estate scan schedule',
  }),

  // Ring 3: public policy, reusable tooling, and source substrate.
  node({ id: 'atlas-infra', ring: 3, kind: 'substrate', lifecycle: 'active', cadenceKind: 'manual', note: 'ADRs, policy, contracts, and reusable workflow authority' }),
  node({ id: 'worker-meta-kit', ring: 3, kind: 'substrate', lifecycle: 'active', cadenceKind: 'manual', note: 'reusable metadata and alert envelope helpers' }),
  node({ id: 'atlas-interface-kit', ring: 3, kind: 'substrate', lifecycle: 'active', cadenceKind: 'manual', note: 'versioned browser interface foundations' }),
  node({ id: 'atlas-kit-python-rag', ring: 3, kind: 'substrate', lifecycle: 'active', cadenceKind: 'manual', note: 'starter template, not a runtime service' }),
  node({ id: 'atlas-bootstrap', ring: 3, kind: 'substrate', lifecycle: 'active', cadenceKind: 'boot', watches: ['SPECULAR-CORE'], note: 'machine reconstruction and boot-time networking repair' }),
  node({ id: 'atlas-badges', ring: 3, kind: 'tool', lifecycle: 'active', cadenceKind: 'manual', watches: ['github'], note: 'evidence-backed README badge generator and CLI' }),
  node({ id: 'ollama-rag-kit', ring: 3, kind: 'substrate', lifecycle: 'active', cadenceKind: 'manual', watches: ['ollama'], note: 'containerised runtime RAG kit and reusable source' }),
  node({ id: 'dotgithub', label: '.github', ring: 3, kind: 'substrate', lifecycle: 'active', cadenceKind: 'manual', note: 'account-level community health defaults' }),
  node({ id: 'profile', label: 'AtlasReaper311', ring: 3, kind: 'substrate', lifecycle: 'active', cadenceKind: 'manual', watches: ['github-pulse'], note: 'public GitHub profile and estate entry point' }),

  // Ring 4: dependencies outside the repository projection.
  node({ id: 'cloudflared', ring: 4, kind: 'external', cadenceKind: 'continuous', watches: ['SPECULAR-CORE'], note: 'tunnel bridge between local services and the public edge' }),
  node({ id: 'ollama', ring: 4, kind: 'external', cadenceKind: 'continuous', watches: ['SPECULAR-CORE'], note: 'local model runtime' }),
  node({ id: 'home-assistant', label: 'Home Assistant', ring: 4, kind: 'external', cadenceKind: 'event', watches: ['ramone-memory'], note: 'local automation consumer' }),
  node({ id: 'discord', label: 'Discord', ring: 4, kind: 'external', cadenceKind: 'event', note: 'external notification sink' }),
  node({ id: 'github', label: 'GitHub', ring: 4, kind: 'external', cadenceKind: 'external', note: 'source, workflow, and repository evidence provider' }),
  node({ id: 'cloudflare', label: 'Cloudflare', ring: 4, kind: 'external', cadenceKind: 'external', note: 'public edge, Pages, Workers, analytics, KV, and tunnels' }),
  node({ id: 'osv', label: 'OSV', ring: 4, kind: 'external', cadenceKind: 'external', note: 'public vulnerability advisory source' }),
]);

export const RING_ORDER = Object.freeze({
  1: Object.freeze([
    'atlas-api-public', 'atlas-api-index', 'atlas-notify', 'status', 'atlas-doc-viewer',
    'github-pulse', 'site-pulse', 'deploy-watch', 'atlas-blackbox', 'specular-edge',
    'atlas-corpus', 'ramone-edge', 'ramone-memory', 'ramone-trigger', 'specular-sonify',
    'atlas-quota-watch', 'atlas-dora', 'atlas-daily-digest',
  ]),
  2: Object.freeze([
    'specular-sentinel', 'specular-telemetry', 'SPECULAR-CORE', 'atlas-journey-watch',
    'atlas-dep-audit', 'atlas-gardener', 'atlas-resource-audit',
  ]),
  3: Object.freeze([
    'atlas-infra', 'worker-meta-kit', 'atlas-interface-kit', 'atlas-kit-python-rag',
    'atlas-bootstrap', 'atlas-badges', 'ollama-rag-kit', 'dotgithub', 'profile',
  ]),
  4: Object.freeze(['github', 'cloudflare', 'osv', 'cloudflared', 'ollama', 'home-assistant', 'discord']),
});

export function formatPeriod(seconds) {
  if (!seconds) return 'not periodic';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.round(seconds / 86400)}d`;
  return `${Math.round(seconds / 604800)}w`;
}

export function summarise(nodes) {
  const emitters = nodes.filter((entry) => entry.cadence > 0 && entry.state === 'live');
  const gazes = nodes.reduce((sum, entry) => sum + entry.watches.length, 0);
  const conduits = nodes.reduce((sum, entry) => sum + entry.reports.length, 0);
  const assumed = emitters.filter((entry) => !entry.verified).length;
  const meanPeriod = emitters.length
    ? emitters.reduce((sum, entry) => sum + entry.cadence, 0) / emitters.length
    : 0;
  return { nodes: nodes.length, emitters: emitters.length, gazes, conduits, assumed, meanPeriod };
}
