/**
 * Atlas Systems — Unified Live Signal
 * Replaces the three separate fetch blocks in index.html with a single
 * shared state object, coordinated polling, and animated transitions.
 *
 * DROP-IN: remove the three IIFE blocks (loadDeployInfo, loadBackendHealth,
 * checkSystemStatus) from your <script> tag and add:
 *   <script src="/js/live-signal.js" defer></script>
 */

(function () {

  // ── CONFIG ────────────────────────────────────────────────────────────────
  const POLL_INTERVAL_MS = 60_000;   // re-check every 60 s
  const COUNTDOWN_TICK_MS = 1_000;   // update countdown every 1 s

  const DEPLOY_URL   = 'https://api.atlas-systems.uk/deploy-watch/latest';

  const SERVICES = [
    { key: 'atlas-notify', name: 'atlas-notify', url: 'https://api.atlas-systems.uk/notify/health' },
    { key: 'github-pulse', name: 'github-pulse', url: 'https://api.atlas-systems.uk/pulse'         },
    { key: 'site-pulse',   name: 'site-pulse',   url: 'https://api.atlas-systems.uk/site-pulse/health' },
    { key: 'deploy-watch', name: 'deploy-watch', url: 'https://api.atlas-systems.uk/deploy-watch/health' },
  ];

  // ── SHARED STATE ──────────────────────────────────────────────────────────
  const state = {
    deploy: { status: 'loading', data: null },       // loading | ok | error
    services: Object.fromEntries(
      SERVICES.map(s => [s.key, { status: 'loading' }])
    ),
    lastChecked: null,       // Date of last completed poll
    nextCheck: null,         // Date of next scheduled poll
    checking: false,
  };

  // ── DERIVE OVERALL HEALTH ─────────────────────────────────────────────────
  function overallHealth() {
    const statuses = SERVICES.map(s => state.services[s.key].status);
    const upCount  = statuses.filter(s => s === 'ok').length;
    const total    = SERVICES.length;

    if (statuses.some(s => s === 'loading')) return { level: 'loading', upCount, total };
    if (upCount === total)                   return { level: 'nominal',  upCount, total };
    if (upCount >= Math.ceil(total / 2))     return { level: 'degraded', upCount, total };
    return                                          { level: 'critical', upCount, total };
  }

  // ── FETCH ALL ─────────────────────────────────────────────────────────────
  async function fetchDeploy() {
    try {
      const res  = await fetch(DEPLOY_URL, { cache: 'no-store' });
      const data = await res.json();
      state.deploy = { status: 'ok', data };
    } catch {
      state.deploy = { status: 'error', data: null };
    }
  }

  async function fetchService(svc) {
    try {
      const res = await fetch(svc.url, { cache: 'no-store' });
      state.services[svc.key] = { status: res.ok ? 'ok' : 'error' };
    } catch {
      state.services[svc.key] = { status: 'error' };
    }
  }

  async function pollAll() {
    if (state.checking) return;
    state.checking = true;
    renderCountdown(); // show "checking…" immediately

    await Promise.all([
      fetchDeploy(),
      ...SERVICES.map(fetchService),
    ]);

    state.lastChecked = new Date();
    state.nextCheck   = new Date(Date.now() + POLL_INTERVAL_MS);
    state.checking    = false;

    renderAll();
  }

  // ── RENDER: NAV STATUS DOT ────────────────────────────────────────────────
  function renderNavDot() {
    const dot   = document.querySelector('.status-dot');
    const label = document.getElementById('nav-build-status');
    if (!dot || !label) return;

    const { level, upCount, total } = overallHealth();

    const config = {
      loading:  { bg: 'var(--accent)',  shadow: 'rgba(245,166,35,0.15)',  text: 'checking…'      },
      nominal:  { bg: '#4ade80',        shadow: 'rgba(74,222,128,0.15)',  text: 'systems nominal' },
      degraded: { bg: '#f5a623',        shadow: 'rgba(245,166,35,0.15)',  text: `${upCount}/${total} operational` },
      critical: { bg: '#e24b4a',        shadow: 'rgba(226,75,74,0.15)',   text: 'major outage'   },
    }[level];

    transition(dot, () => {
      dot.style.background  = config.bg;
      dot.style.boxShadow   = `0 0 0 3px ${config.shadow}`;
      dot.style.animation   = level === 'nominal' ? 'pulse 2.5s ease-in-out infinite' : 'none';
    });
    label.textContent = config.text;
  }

  // ── RENDER: DEPLOY INFO ───────────────────────────────────────────────────
  function renderDeploy() {
    const lastDeployEl = document.getElementById('last-deploy');
    const commitEl     = document.getElementById('commit-hash');
    const buildEl      = document.getElementById('build-status');
    if (!lastDeployEl) return;

    const { status, data } = state.deploy;

    if (status === 'loading') {
      [lastDeployEl, commitEl, buildEl].forEach(el => { if (el) el.textContent = 'checking…'; });
      return;
    }

    if (status === 'error' || !data?.commitSha) {
      [lastDeployEl, commitEl, buildEl].forEach(el => { if (el) el.textContent = '—'; });
      return;
    }

    const when = data.endedOn || data.createdOn;
    lastDeployEl.textContent = when
      ? new Date(when).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
      : '—';

    if (commitEl) {
      commitEl.innerHTML = data.commitUrl
        ? `<a href="${data.commitUrl}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;">${data.commitSha}</a>`
        : data.commitSha;
    }

    if (buildEl) {
      const map = {
        success: { text: 'passing', color: '#4ade80' },
        failure: { text: 'failing', color: '#e24b4a' },
      };
      const cfg = map[data.status] ?? { text: data.status || '—', color: 'var(--accent)' };
      transition(buildEl, () => {
        buildEl.textContent   = cfg.text;
        buildEl.style.color   = cfg.color;
      });
    }
  }

  // ── RENDER: BACKEND GRID ──────────────────────────────────────────────────
  function buildBackendGrid() {
    const grid = document.getElementById('backendGrid');
    if (!grid) return;

    // Only build the DOM once
    if (grid.dataset.built) return;
    grid.dataset.built = '1';

    grid.innerHTML = SERVICES.map(s => `
      <div class="signal-cell">
        <div class="signal-label">${s.name}</div>
        <div class="signal-value mono" id="backend-${s.key}" style="color:var(--text-dim)">checking…</div>
      </div>
    `).join('');
  }

  function renderBackendGrid() {
    SERVICES.forEach(s => {
      const el = document.getElementById(`backend-${s.key}`);
      if (!el) return;

      const { status } = state.services[s.key];
      const cfg = {
        loading: { text: 'checking…', color: 'var(--text-dim)' },
        ok:      { text: 'operational', color: '#4ade80'        },
        error:   { text: 'unreachable', color: '#e24b4a'        },
      }[status];

      // only animate if value is actually changing
      if (el.textContent !== cfg.text) {
        transition(el, () => {
          el.textContent  = cfg.text;
          el.style.color  = cfg.color;
        });
      }
    });
  }

  // ── RENDER: COUNTDOWN ─────────────────────────────────────────────────────
  function renderCountdown() {
    const el = document.getElementById('signal-countdown');
    if (!el) return;

    if (state.checking) {
      el.textContent = 'checking…';
      el.style.color = 'var(--accent)';
      return;
    }

    if (!state.nextCheck || !state.lastChecked) {
      el.textContent = '';
      return;
    }

    const secsUntil = Math.max(0, Math.round((state.nextCheck - Date.now()) / 1000));
    const checkedAt = state.lastChecked.toISOString().slice(11, 19) + ' UTC';

    el.textContent = `last checked ${checkedAt} · next in ${secsUntil}s`;
    el.style.color = 'var(--text-faint)';
  }

  // ── RENDER: ALL ───────────────────────────────────────────────────────────
  function renderAll() {
    renderNavDot();
    renderDeploy();
    renderBackendGrid();
    renderCountdown();
  }

  // ── TRANSITION HELPER ─────────────────────────────────────────────────────
  // Brief opacity flash so status changes are visually noticeable
  function transition(el, mutateFn) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      mutateFn(); return;
    }
    el.style.transition = 'opacity 0.2s ease';
    el.style.opacity    = '0';
    setTimeout(() => {
      mutateFn();
      el.style.opacity = '1';
    }, 200);
  }

  // ── INJECT COUNTDOWN ROW ──────────────────────────────────────────────────
  // Adds a small "last checked / next in Xs" line above the backend grid
  function injectCountdownEl() {
    const section = document.querySelector('.section .section-label');
    if (!section) return;

    // Find the Live Signal section specifically
    const liveSection = [...document.querySelectorAll('.section')].find(s =>
      s.querySelector('.section-label')?.textContent.trim() === 'Live signal'
    );
    if (!liveSection || liveSection.querySelector('#signal-countdown')) return;

    const row = document.createElement('div');
    row.style.cssText = `
      font-size: 11px;
      letter-spacing: 0.08em;
      margin-top: 0.75rem;
      margin-bottom: 2rem;
      display: flex;
      align-items: center;
      gap: 1rem;
    `;

    // Refresh button
    const btn = document.createElement('button');
    btn.textContent = '↻ refresh';
    btn.style.cssText = `
      font-family: var(--mono);
      font-size: 11px;
      letter-spacing: 0.08em;
      color: var(--text-dim);
      background: none;
      border: 1px solid var(--border);
      padding: 0.2rem 0.6rem;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.color = 'var(--text)';
      btn.style.borderColor = 'var(--border-hi)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.color = 'var(--text-dim)';
      btn.style.borderColor = 'var(--border)';
    });
    btn.addEventListener('click', () => {
      state.nextCheck = null;
      pollAll();
    });

    const countdown = document.createElement('span');
    countdown.id = 'signal-countdown';
    countdown.style.color = 'var(--text-faint)';

    row.appendChild(countdown);
    row.appendChild(btn);

    // Insert after the section-label
    const label = liveSection.querySelector('.section-label');
    label.after(row);
  }

  // ── BOOT ──────────────────────────────────────────────────────────────────
  function init() {
    buildBackendGrid();
    injectCountdownEl();

    // Initial render with loading state
    renderAll();

    // First poll immediately
    pollAll();



  // Inject the Delta-Tracked Loop:
  let lastTick = performance.now();
  let lastPoll = performance.now();

  function systemLoop(timestamp) {
  const deltaTick = timestamp - lastTick;
  const deltaPoll = timestamp - lastPoll;

  // 1. Precise 1-second countdown tick
  if (deltaTick >= COUNTDOWN_TICK_MS) {
    renderCountdown();
    // Subtract remainder to prevent mathematical drift over time
    lastTick = timestamp - (deltaTick % COUNTDOWN_TICK_MS); 
  }

  // 2. Precise 60-second telemetry poll
  if (deltaPoll >= POLL_INTERVAL_MS) {
    pollAll();
    lastPoll = timestamp - (deltaPoll % POLL_INTERVAL_MS);
  }

  requestAnimationFrame(systemLoop);
}

// Initialize loop
  requestAnimationFrame(systemLoop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
