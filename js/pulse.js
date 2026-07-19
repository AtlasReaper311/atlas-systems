/**
 * pulse.js - live GitHub activity for atlas-systems.uk
 *
 * One fetch to github-pulse populates the homepage GitHub activity section.
 * Operational deploy, commit, build, backend, navigation-status, and estate-strip
 * surfaces are owned exclusively by live-signal.js.
 *
 * Externally influenced commit strings are rendered with textContent and DOM
 * creation only. They must never be injected through innerHTML.
 */

const PULSE_ENDPOINT = "https://api.atlas-systems.uk/pulse";

async function initPulse() {
  let data;
  try {
    const response = await fetch(PULSE_ENDPOINT);
    if (!response.ok) return;
    data = await response.json();
  } catch {
    return;
  }

  updatePulseSection(data);
}

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
  const element = root.querySelector(`[data-pulse="${key}"]`);
  if (element && value !== undefined && value !== null) {
    element.textContent = String(value);
  }
}

function renderLanguages(root, languages) {
  const element = root.querySelector('[data-pulse="languages"]');
  if (!element || !languages?.length) return;

  element.replaceChildren();
  for (const language of languages.slice(0, 5)) {
    const row = document.createElement("div");
    row.className = "pulse-lang";

    const head = document.createElement("div");
    head.className = "pulse-lang-head";

    const name = document.createElement("span");
    name.textContent = language.name;

    const percent = document.createElement("span");
    percent.textContent = `${language.percent}%`;

    head.append(name, percent);

    const track = document.createElement("div");
    track.className = "pulse-lang-track";

    const bar = document.createElement("div");
    bar.className = "pulse-lang-bar";
    track.appendChild(bar);

    row.append(head, track);
    element.appendChild(row);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bar.style.width = `${language.percent}%`;
      });
    });
  }
}

function renderCommits(root, commits) {
  const element = root.querySelector('[data-pulse="recent-commits"]');
  if (!element || !commits?.length) return;

  element.replaceChildren();
  for (const commit of commits.slice(0, 6)) {
    const item = document.createElement("li");
    item.className = "pulse-commit";

    const sha = document.createElement("span");
    sha.className = "pulse-commit-sha";
    sha.textContent = commit.sha;

    const repo = document.createElement("span");
    repo.className = "pulse-commit-repo";
    repo.textContent = commit.repo;

    const message = document.createElement("span");
    message.className = "pulse-commit-msg";
    message.textContent = commit.message;

    item.append(sha, repo, message);
    element.appendChild(item);
  }
}

initPulse();
