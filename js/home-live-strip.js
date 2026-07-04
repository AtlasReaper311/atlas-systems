/**
 * home-live-strip.js
 * One line under the hero CTA: the estate, live, in nine words. Fed by
 * the same shared registry client the Lab's system map uses
 * (js/atlas-registry.js), so the homepage costs the registry nothing it
 * was not already paying.
 *
 * Three honest states, because the strip's job is credibility:
 *   fresh    green dot, real counts from this hour's registry build
 *   stale    amber dot, last-good counts, says so
 *   never    faint dot, no numbers claimed, still links to the map
 * A strip that showed cached numbers as live, or vanished when the edge
 * hiccuped, would undercut the exact impression it exists to make.
 */
(function () {
  "use strict";

  var strip = document.getElementById("estate-strip");
  var dot = document.getElementById("estate-strip-dot");
  var text = document.getElementById("estate-strip-text");
  if (!strip || !window.AtlasRegistry) return;

  var revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    strip.hidden = false;
    /* The hero children fade up on a 0.15s cadence ending at 0.4s; the
       strip lands one beat after the CTA so the page reads as one
       sequence, not a widget arriving late to it. */
    requestAnimationFrame(function () { strip.classList.add("in"); });
  }

  window.AtlasRegistry.subscribe(function (snap) {
    if (!snap.ok && !snap.stale) {
      /* Registry never reached from this browser: claim no numbers, keep
         the door to the map open. */
      strip.dataset.state = "unknown";
      text.textContent = "estate map · every worker, every binding";
      reveal();
      return;
    }

    strip.dataset.state = snap.stale ? "stale" : "ok";
    if (snap.counts) {
      text.textContent =
        snap.counts.workers + " workers at the edge · " +
        snap.counts.documented + " self-documenting · " +
        (snap.stale ? "last snapshot" : "registry nominal");
    } else {
      text.textContent = "estate registry " + (snap.stale ? "· last snapshot" : "nominal");
    }
    reveal();
  });
})();
