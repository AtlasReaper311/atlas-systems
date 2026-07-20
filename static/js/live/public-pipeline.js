const TOPOLOGY_URL = "https://api.atlas-systems.uk/v1/topology";
const EVENTS_URL = "https://api.atlas-systems.uk/notify/recent?limit=50";
const DEPLOY_LATEST_URL = "https://api.atlas-systems.uk/deploy-watch/latest";
const CSS_HREF = "/static/css/public-pipeline.css?v=20260720-public-ledger";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Current public runtime repositories. The live public topology is merged on top
// of this reviewed fallback, so new declared public runtimes can appear without
// making an account-wide repository listing a publication signal.
const REVIEWED_PUBLIC_RUNTIME_REPOS = [
  { id: "atlas-api-index", kind: "worker", aliases: ["atlas-api-index"] },
  { id: "atlas-api-public", kind: "worker", aliases: ["atlas-api-public"] },
  { id: "atlas-blackbox", kind: "worker", aliases: ["atlas-blackbox"] },
  { id: "atlas-corpus", kind: "local service", aliases: ["atlas-corpus"] },
  { id: "atlas-daily-digest", kind: "automation", aliases: ["atlas-daily-digest"] },
  { id: "atlas-doc-viewer", kind: "site", aliases: ["atlas-doc-viewer", "cv.atlas-systems.uk"] },
  { id: "atlas-dora", kind: "worker", aliases: ["atlas-dora"] },
  { id: "atlas-notify", kind: "worker", aliases: ["atlas-notify"] },
  { id: "atlas-quota-watch", kind: "worker", aliases: ["atlas-quota-watch"] },
  { id: "atlas-systems", kind: "site", aliases: ["atlas-systems", "atlas-systems.uk"] },
  { id: "deploy-watch", kind: "worker", aliases: ["deploy-watch"] },
  { id: "github-pulse", kind: "worker", aliases: ["github-pulse"] },
  { id: "ramone-edge", kind: "worker", aliases: ["ramone-edge", "ramone.atlas-systems.uk"] },
  { id: "ramone-voice-trigger", kind: "worker", aliases: ["ramone-voice-trigger", "ramone-trigger"] },
  { id: "site-pulse", kind: "worker", aliases: ["site-pulse"] },
  { id: "specular-sonify", kind: "worker", aliases: ["specular-sonify"] },
  { id: "specular-telemetry", kind: "edge", aliases: ["specular-telemetry", "specular-edge"] },
  { id: "status", kind: "site", aliases: ["status", "status.atlas-systems.uk"] },
];

function ensureCss() {
  if (document.querySelector(`link[href="${CSS_HREF}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = CSS_HREF;
  document.head.appendChild(link);
}

function asTime(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function relativeTime(value) {
  const then = asTime(value);
  if (!then) return "no recent event";
  const seconds = Math.max(1, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function tokenMatch(haystack, token) {
  const escaped = String(token)
    .toLowerCase()
    .replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9.-])${escaped}($|[^a-z0-9.-])`).test(haystack);
}

function cloneRepo(repo) {
  return {
    id: repo.id,
    kind: repo.kind || "runtime",
    aliases: [...new Set([repo.id, ...(repo.aliases || [])])],
  };
}

function mergePublicTopology(topology) {
  const repos = new Map(
    REVIEWED_PUBLIC_RUNTIME_REPOS.map((repo) => [repo.id, cloneRepo(repo)]),
  );

  for (const component of topology?.components || []) {
    if (!component || component.source_only === true || !component.repo_name) continue;
    const repoName = String(component.repo_name);
    const current = repos.get(repoName) || {
      id: repoName,
      kind: component.kind || component.layer || "runtime",
      aliases: [repoName],
    };
    current.kind = current.kind || component.kind || component.layer || "runtime";
    current.aliases = [
      ...new Set(
        [
          ...(current.aliases || []),
          repoName,
          component.id,
          component.public_surface,
        ].filter(Boolean),
      ),
    ];
    repos.set(repoName, current);
  }

  return [...repos.values()];
}

function repoForEvent(event, repos) {
  const haystack = [event?.title, event?.message, event?.event]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const ordered = [...repos].sort((a, b) => {
    const aLen = Math.max(...a.aliases.map((alias) => String(alias).length));
    const bLen = Math.max(...b.aliases.map((alias) => String(alias).length));
    return bLen - aLen;
  });

  for (const repo of ordered) {
    if (repo.aliases.some((alias) => tokenMatch(haystack, alias))) return repo.id;
  }
  return null;
}

function isPipelineEvent(event) {
  return /^(deployed:|deploy failed:|blocked:|pages deploy)/i.test(
    event?.title || "",
  );
}

function isActivityEvent(event) {
  return /^push to/i.test(event?.title || "") || event?.event === "github:push";
}

function eventSha(event) {
  const match = `${event?.title || ""} ${event?.message || ""}`.match(
    /\b[0-9a-f]{7,40}\b/i,
  );
  return match ? match[0].slice(0, 7) : null;
}

function eventSummary(event) {
  const title = event?.title || "";
  if (/^pages deploy succeeded/i.test(title)) return "Pages deployment succeeded";
  if (/^pages deploy failed/i.test(title)) return "Pages deployment failed";
  if (/^deployed:/i.test(title)) return "Production deployment completed";
  if (/^deploy failed:/i.test(title)) return "Production deployment failed";
  if (/^blocked:/i.test(title)) return "Validation blocked deployment";
  if (/^push to/i.test(title)) return "Push observed; awaiting deployment evidence";
  return title || event?.event || "Public pipeline event";
}

function syntheticPagesEvent(data) {
  if (!data?.ok || !data.commitSha) return null;
  const ok = data.status === "success";
  return {
    ts: data.endedOn || data.createdOn || data.checkedAt,
    level: ok ? "success" : "failure",
    event: "pages_deploy",
    title: ok ? "Deployed: atlas-systems.uk" : "Deploy failed: atlas-systems.uk",
    message: `Cloudflare Pages ${data.status || "unknown"} [${data.commitSha}]`,
  };
}

function mergeEvents(groups) {
  const seen = new Set();
  const merged = [];
  for (const group of groups) {
    for (const event of group || []) {
      const key = [event?.ts, event?.level, event?.event, event?.title, event?.message]
        .map((value) => value || "")
        .join("\u001f");
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(event);
    }
  }
  return merged.sort((a, b) => asTime(b?.ts) - asTime(a?.ts));
}

function stateForRepos(repos, events) {
  const state = Object.fromEntries(
    repos.map((repo) => [repo.id, { repo, activity: null, status: null, latest: null }]),
  );

  for (const event of events) {
    const repoId = repoForEvent(event, repos);
    if (!repoId || !state[repoId]) continue;
    const row = state[repoId];
    if (!row.latest) row.latest = event;
    if (!row.activity && isActivityEvent(event)) row.activity = event;
    if (!row.status && isPipelineEvent(event)) row.status = event;
  }
  return Object.values(state);
}

function viewState(row) {
  const { activity, status } = row;
  if (status && activity && asTime(activity.ts) > asTime(status.ts)) {
    return { level: "activity", event: activity, label: "activity" };
  }
  if (status) {
    const level = status.level === "failure" ? "failure" : "success";
    return {
      level,
      event: status,
      label: level === "failure" ? "failed" : "deployed",
    };
  }
  if (activity) return { level: "activity", event: activity, label: "activity" };
  return { level: "idle", event: null, label: "no evidence" };
}

function cardSort(a, b) {
  const rank = { failure: 0, activity: 1, success: 2, idle: 3 };
  const aView = viewState(a);
  const bView = viewState(b);
  const rankDiff = rank[aView.level] - rank[bView.level];
  if (rankDiff !== 0) return rankDiff;
  const timeDiff = asTime(bView.event?.ts) - asTime(aView.event?.ts);
  return timeDiff || a.repo.id.localeCompare(b.repo.id);
}

function addText(parent, tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

function renderCard(row) {
  const view = viewState(row);
  const card = document.createElement("a");
  card.className = `pipeline-v2-card ${view.level}`;
  card.href = `https://github.com/AtlasReaper311/${row.repo.id}`;
  card.target = "_blank";
  card.rel = "noopener noreferrer";
  card.setAttribute("aria-label", `Open ${row.repo.id} on GitHub`);

  const top = document.createElement("div");
  top.className = "pipeline-v2-card-top";
  const repoWrap = document.createElement("div");
  repoWrap.className = "pipeline-v2-repo-wrap";
  addText(repoWrap, "div", "pipeline-v2-repo", row.repo.id);
  addText(repoWrap, "span", "pipeline-v2-kind", row.repo.kind || "runtime");

  const state = document.createElement("span");
  state.className = `pipeline-v2-state ${view.level}`;
  const dot = document.createElement("i");
  dot.className = `pipeline-v2-dot ${view.level}`;
  dot.setAttribute("aria-hidden", "true");
  state.appendChild(dot);
  state.appendChild(document.createTextNode(view.label));
  top.appendChild(repoWrap);
  top.appendChild(state);
  card.appendChild(top);

  const meta = document.createElement("div");
  meta.className = "pipeline-v2-meta";
  if (view.event) {
    const sha = eventSha(view.event);
    if (sha) addText(meta, "span", "pipeline-v2-sha", sha);
    if (sha) addText(meta, "span", "", "·");
    addText(meta, "span", "", relativeTime(view.event.ts));
  } else {
    addText(meta, "span", "", "waiting for public deploy evidence");
  }
  card.appendChild(meta);

  addText(
    card,
    "div",
    "pipeline-v2-summary",
    view.event ? eventSummary(view.event) : "No recent public pipeline event in the retained window.",
  );
  return card;
}

function renderShell(section) {
  section.innerHTML = `
    <div class="section-label">Pipeline status</div>
    <div class="pipeline-v2-head">
      <div class="pipeline-v2-title-wrap">
        <span class="pipeline-v2-eyebrow">public estate</span>
        <h2 class="pipeline-v2-title">Deployment ledger.</h2>
        <p class="pipeline-v2-sub">A public-only view of deployment evidence. Runtime health is kept separate so an old deploy record never masquerades as an outage.</p>
      </div>
      <div class="pipeline-v2-updated" id="pipeline-v2-updated">loading public evidence</div>
    </div>
    <div class="pipeline-v2-shell">
      <div class="pipeline-v2-stats" aria-label="Pipeline summary">
        <div class="pipeline-v2-stat"><strong id="pipeline-v2-repos">—</strong><span>public runtimes</span></div>
        <div class="pipeline-v2-stat"><strong id="pipeline-v2-events">—</strong><span>deploy events</span></div>
        <div class="pipeline-v2-stat"><strong id="pipeline-v2-rate">—</strong><span>success rate</span></div>
        <div class="pipeline-v2-stat"><strong id="pipeline-v2-active">—</strong><span>active in 7d</span></div>
      </div>
      <div class="pipeline-v2-toolbar">
        <div class="pipeline-v2-count">Tracking <strong id="pipeline-v2-count">—</strong> declared public runtime repositories</div>
        <div class="pipeline-v2-legend" aria-label="Pipeline state legend">
          <span><i class="pipeline-v2-dot success"></i>deployed</span>
          <span><i class="pipeline-v2-dot activity"></i>activity</span>
          <span><i class="pipeline-v2-dot failure"></i>failed</span>
          <span><i class="pipeline-v2-dot idle"></i>no evidence</span>
        </div>
      </div>
      <div class="pipeline-v2-grid" id="pipeline-v2-grid">
        <div class="pipeline-v2-loading">Loading sanitized public pipeline evidence…</div>
      </div>
      <div class="pipeline-v2-foot">
        <span>Deploy state only. Source: sanitized public event projection plus the declared public topology. Private repository identities never enter this view.</span>
        <a href="https://api.atlas-systems.uk/v1/topology" target="_blank" rel="noopener">inspect topology →</a>
      </div>
    </div>
  `;
}

function setStat(id, value, tone = "") {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = value;
  element.className = tone;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function init() {
  const section = document.getElementById("pipeline-grid-section");
  if (!section) return;
  ensureCss();
  renderShell(section);

  const [topologyResult, eventsResult, deployResult] = await Promise.allSettled([
    fetchJson(TOPOLOGY_URL),
    fetchJson(EVENTS_URL),
    fetchJson(DEPLOY_LATEST_URL),
  ]);

  const topology = topologyResult.status === "fulfilled" ? topologyResult.value : null;
  const repos = mergePublicTopology(topology);
  const publicEvents =
    eventsResult.status === "fulfilled" && Array.isArray(eventsResult.value?.events)
      ? eventsResult.value.events
      : [];
  const pagesEvent =
    deployResult.status === "fulfilled" ? syntheticPagesEvent(deployResult.value) : null;
  const events = mergeEvents([publicEvents, pagesEvent ? [pagesEvent] : []]);
  const rows = stateForRepos(repos, events).sort(cardSort);
  const pipelineEvents = events.filter(isPipelineEvent);
  const successCount = pipelineEvents.filter((event) => event.level === "success").length;
  const failureCount = pipelineEvents.filter((event) => event.level === "failure").length;
  const rateBase = successCount + failureCount;
  const rate = rateBase ? Math.round((successCount / rateBase) * 100) : null;
  const weekAgo = Date.now() - WEEK_MS;
  const activeRepos = new Set(
    pipelineEvents
      .filter((event) => asTime(event.ts) >= weekAgo)
      .map((event) => repoForEvent(event, repos))
      .filter(Boolean),
  );

  setStat("pipeline-v2-repos", repos.length);
  setStat("pipeline-v2-count", repos.length);
  setStat("pipeline-v2-events", pipelineEvents.length);
  setStat(
    "pipeline-v2-rate",
    rate === null ? "—" : `${rate}%`,
    rate === null ? "" : rate >= 90 ? "good" : rate >= 70 ? "warn" : "bad",
  );
  setStat("pipeline-v2-active", activeRepos.size);

  const updated = document.getElementById("pipeline-v2-updated");
  if (updated) {
    const degraded = topologyResult.status !== "fulfilled" || eventsResult.status !== "fulfilled";
    updated.textContent = `${degraded ? "partial public data" : "public data live"} · ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  }

  const grid = document.getElementById("pipeline-v2-grid");
  if (!grid) return;
  grid.innerHTML = "";
  for (const row of rows) grid.appendChild(renderCard(row));
}

init();
