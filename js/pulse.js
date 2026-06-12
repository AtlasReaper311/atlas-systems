/**
 * pulse.js — live GitHub data for atlas-systems.uk
 *
 * One fetch to github-pulse (api.atlas-systems.uk/pulse) feeds two
 * places on the homepage:
 *
 *   1. The Live signal section's deploy/commit cells, which previously
 *      showed placeholder values. "Last deploy" uses the newest commit
 *      to the site repo, because a push to main is what triggers the
 *      Pages deploy.
 *   2. The GitHub pulse section: totals, language bars, recent commits.
 *      It ships hidden and only reveals once data arrives, so an API
 *      outage costs nothing visually.
 *
 * Everything renders via textContent and createElement, never
 * innerHTML: commit messages are externally influenced strings and must
 * not be able to inject markup.
 */

const PULSE_ENDPOINT = "https://api.atlas-systems.uk/pulse";

// The repo whose pushes deploy this site; drives the Live signal cells.
const SITE_REPO = "atlas-systems";

async function initPulse() {
  let data;
  try {
    const response = await fetch(PULSE_ENDPOINT);
    if (!response.ok) return;
    data = await response.json();
  } catch {
    return; // Silent failure: placeholders stay, page stays whole.
  }

  updateLiveSignal(data);
  updatePulseSection(data);
}

/** Feed the existing Live signal cells with real values. */
function updateLiveSignal(data) {
  const commit =
    data.recentCommits?.find((c) => c.repo === SITE_REPO) ||
    data.recentCommits?.[0];
  if (!commit) return;

  const commitEl = document.getElementById("commit-hash");
  const deployEl = document.getElementById("last-deploy");

  if (commitEl) commitEl.textContent = commit.sha;
  if (deployEl && commit.date) {
    deployEl.textContent =
      new Date(commit.date).toISOString().replace("T", " ").slice(0, 16) +
      " UTC";
  }
}

/** Populate and reveal the GitHub pulse section. */
function updatePulseSection(data) {
  const root = document.getElementById("pulse");
  if (!root) return;

  setText(root, "repos", data.totals.publicRepos);
  setText(root, "commits90", data.totals.commitsLast90Days);
  if (data.languages?.length) {
    setText(root, "top-language", data.languages[0].name);
  }

  renderLanguages(root, data.languages);
  renderCommits(root, data.recentCommits);

  root.hidden = false;
}

function setText(root, key, value) {
  const el = root.querySelector(`[data-pulse="${key}"]`);
  if (el && value !== undefined && value !== null) {
    el.textContent = String(value);
  }
}

/** Proportional language bars in the brand accent. */
function renderLanguages(root, languages) {
  const el = root.querySelector('[data-pulse="languages"]');
  if (!el || !languages?.length) return;

  el.replaceChildren();
  for (const lang of languages.slice(0, 5)) {
    const row = document.createElement("div");
    row.className = "pulse-lang";

    const head = document.createElement("div");
    head.className = "pulse-lang-head";
    const name = document.createElement("span");
    name.textContent = lang.name;
    const percent = document.createElement("span");
    percent.textContent = `${lang.percent}%`;
    head.append(name, percent);

    const track = document.createElement("div");
    track.className = "pulse-lang-track";
    const bar = document.createElement("div");
    bar.className = "pulse-lang-bar";
    track.appendChild(bar);

    row.append(head, track);
    el.appendChild(row);

    // Width set on the next frame so the CSS transition animates the
    // bar growing in, instead of it appearing at full width.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        bar.style.width = `${lang.percent}%`;
      }),
    );
  }
}

/** Terminal-style commit feed: sha, repo, first line of the message. */
function renderCommits(root, commits) {
  const el = root.querySelector('[data-pulse="recent-commits"]');
  if (!el || !commits?.length) return;

  el.replaceChildren();
  for (const commit of commits.slice(0, 6)) {
    const li = document.createElement("li");
    li.className = "pulse-commit";

    const sha = document.createElement("span");
    sha.className = "pulse-commit-sha";
    sha.textContent = commit.sha;

    const repo = document.createElement("span");
    repo.className = "pulse-commit-repo";
    repo.textContent = commit.repo;

    const message = document.createElement("span");
    message.className = "pulse-commit-msg";
    message.textContent = commit.message;

    li.append(sha, repo, message);
    el.appendChild(li);
  }
}

initPulse();
