const compositionLinks = [...document.querySelectorAll("[data-motion-composition]")];
const seekLinks = [...document.querySelectorAll("[data-motion-seek]")];

function updateCompositionState() {
  const requested = window.location.hash.replace(/^#/, "");
  const active = compositionLinks.find((link) => link.getAttribute("href") === `#${requested}`)
    ?? compositionLinks[0];

  compositionLinks.forEach((link) => {
    if (link === active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function formatSeconds(value) {
  const minutes = Math.floor(value / 60).toString().padStart(2, "0");
  const seconds = (value % 60).toFixed(2).padStart(5, "0");
  return `${minutes}:${seconds}`;
}

function installChapterSeeking() {
  seekLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const video = document.getElementById(link.dataset.videoId ?? "");
      const time = Number(link.dataset.time);

      // Keep the anchor fallback when the media is unavailable or metadata has
      // not loaded yet. That means the chapter remains useful with no JS and
      // does not trap the visitor on a broken player.
      if (!video || !Number.isFinite(time) || !Number.isFinite(video.duration)) return;

      try {
        const targetTime = Math.min(time, video.duration);
        video.currentTime = targetTime;
        // Some browsers expose duration before the local media buffer accepts
        // a seek. Keep the native transcript fallback unless the position
        // actually moved, so the status message never over-promises.
        if (Math.abs(video.currentTime - targetTime) > 0.05) return;
        const status = link.closest(".atlas-motion-chapters")?.querySelector("[data-motion-seek-status]");
        if (status) {
          status.textContent = `${link.textContent.trim().replace(/\s+/g, " ")} · video position ${formatSeconds(targetTime)}. Playback remains paused.`;
        }
        event.preventDefault();
      } catch {
        // The native transcript anchor is the safe fallback if a browser
        // refuses to seek the released media.
      }
    });
  });
}

updateCompositionState();
installChapterSeeking();
window.addEventListener("hashchange", updateCompositionState);
