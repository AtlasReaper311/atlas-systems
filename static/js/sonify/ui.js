/**
 * ui.js :: the floating control, and the module's entry point.
 *
 * Self-initialises on DOMContentLoaded, so the integration cost is one
 * <script type="module"> tag and zero inline script (the site's CSP is
 * script-src 'self'; a bootstrap snippet in the page would need
 * 'unsafe-inline' to be load-bearing, and it should not be).
 *
 * Estate widget idiom, same as specular-widget and corpus-search: one
 * scoped class prefix (.sn-), site tokens with hex fallbacks so the
 * control renders correctly even on a page that forgot a token, and
 * every piece of response data written via textContent, never
 * innerHTML.
 *
 * The control doubles as a compact status widget: polling starts on
 * page load, so the health readout and the six service dots are live
 * even for users who never unmute. Audio itself starts only on the
 * toggle press: Tone.start() must run inside a user gesture per
 * browser autoplay policy, and telemetry that sings uninvited would be
 * bad manners regardless.
 */

import { createEngine, DEFAULT_USER_GAIN } from "./engine.js";
import { createPoller } from "./poller.js";
import { CURATED_SERVICES } from "./mapping.js";

const WIDGET_ID = "sonify-widget";

/**
 * Status dot colours reuse the estate palette: the green/red pair from
 * specular-widget's online/offline dot, the amber accent token for
 * degraded, the faint text token for unknown.
 */
const STYLE = `
.sn-w {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 300;
  display: grid;
  gap: 8px;
  min-width: 208px;
  padding: 10px 12px;
  background: var(--bg-1, #111118);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  border-radius: 6px;
  font-family: var(--mono, "IBM Plex Mono", monospace);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text, #e8e8e0);
}
.sn-w * { box-sizing: border-box; }
.sn-head { display: flex; align-items: center; gap: 10px; }
.sn-toggle {
  flex: none;
  background: transparent;
  border: 1px solid var(--accent, #f5a623);
  border-radius: 4px;
  color: var(--accent, #f5a623);
  font: inherit;
  font-size: 11px;
  letter-spacing: 0.06em;
  padding: 3px 10px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.sn-toggle:hover { background: rgba(245, 166, 35, 0.12); }
.sn-toggle:focus-visible {
  outline: 1px solid var(--accent, #f5a623);
  outline-offset: 2px;
}
.sn-toggle:disabled { opacity: 0.5; cursor: wait; }
.sn-readout {
  margin-left: auto;
  color: var(--text-dim, #aaa9a0);
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.sn-health { color: var(--text, #e8e8e0); }
.sn-inc[data-alert="1"] { color: #e24b4a; }
.sn-dots { display: flex; gap: 6px; }
.sn-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-faint, #555560);
}
.sn-dot[data-status="healthy"] { background: #4ade80; }
.sn-dot[data-status="degraded"] { background: var(--accent, #f5a623); }
.sn-dot[data-status="down"] { background: #e24b4a; }
.sn-vol {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-faint, #555560);
  font-size: 11px;
  letter-spacing: 0.06em;
}
.sn-vol input {
  flex: 1 1 auto;
  min-width: 0;
  accent-color: var(--accent, #f5a623);
}
.sn-w[data-stale="1"] .sn-readout,
.sn-w[data-stale="1"] .sn-dots { opacity: 0.45; }
/* Clear the 56px fixed mobile nav at the site's mobile breakpoint. */
@media (max-width: 680px) {
  .sn-w { right: 12px; bottom: 72px; }
}
`;

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  return node;
}

export function initSonify() {
  if (document.getElementById(WIDGET_ID)) return; // idempotent

  const engine = createEngine();

  /* ---------------- DOM ---------------- */

  const root = el("section", "sn-w", {
    id: WIDGET_ID,
    role: "region",
    "aria-label": "Estate sonification",
  });

  const style = document.createElement("style");
  style.textContent = STYLE;

  const head = el("div", "sn-head");
  const toggle = el("button", "sn-toggle", {
    type: "button",
    "aria-pressed": "false",
    "aria-label": "Start estate sonification",
  });
  toggle.textContent = "start";

  const readout = el("div", "sn-readout", { "aria-live": "polite" });
  const healthSpan = el("span", "sn-health");
  healthSpan.textContent = "health --%";
  const sep = document.createElement("span");
  sep.textContent = " \u00b7 ";
  const incSpan = el("span", "sn-inc");
  incSpan.textContent = "inc -";
  readout.append(healthSpan, sep, incSpan);
  head.append(toggle, readout);

  const dots = el("div", "sn-dots", { "aria-hidden": "false" });
  const dotByName = new Map();
  for (const name of CURATED_SERVICES) {
    const dot = el("span", "sn-dot", {
      "data-status": "unknown",
      title: `${name}: unknown`,
      role: "img",
      "aria-label": `${name}: unknown`,
    });
    dots.append(dot);
    dotByName.set(name, dot);
  }

  const vol = el("label", "sn-vol");
  const volText = document.createElement("span");
  volText.textContent = "vol";
  const slider = el("input", "", {
    type: "range",
    min: "0",
    max: "100",
    step: "1",
    value: String(Math.round(DEFAULT_USER_GAIN * 100)),
    "aria-label": "Sonification volume",
  });
  vol.append(volText, slider);

  root.append(style, head, dots, vol);
  document.body.append(root);

  /* ---------------- Wiring ---------------- */

  function setToggleState(runningNow) {
    toggle.textContent = runningNow ? "mute" : "start";
    toggle.setAttribute("aria-pressed", String(runningNow));
    toggle.setAttribute(
      "aria-label",
      runningNow ? "Mute estate sonification" : "Start estate sonification",
    );
  }

  toggle.addEventListener("click", async () => {
    toggle.disabled = true;
    try {
      if (engine.isRunning()) {
        engine.pause();
        setToggleState(false);
      } else {
        await engine.start();
        setToggleState(true);
      }
    } catch (err) {
      // Most likely cause: vendored Tone.js missing. Say what is wrong
      // and how to fix it; the widget stays useful as a status readout.
      console.error("sonify: audio failed to start", err);
      toggle.textContent = "audio n/a";
      toggle.setAttribute("aria-label", "Audio unavailable; see console");
    } finally {
      toggle.disabled = false;
    }
  });

  slider.addEventListener("input", () => {
    engine.setUserVolume(Number(slider.value) / 100);
  });

  function renderFrame(frame) {
    healthSpan.textContent = `health ${Math.round(frame.overallHealth * 100)}%`;
    incSpan.textContent = `inc ${frame.activeIncidents}`;
    incSpan.setAttribute(
      "data-alert",
      frame.activeIncidents > 0 ? "1" : "0",
    );
    for (const voice of frame.voices) {
      const dot = dotByName.get(voice.name);
      if (!dot) continue;
      dot.setAttribute("data-status", voice.status);
      dot.setAttribute("title", `${voice.name}: ${voice.status}`);
      dot.setAttribute("aria-label", `${voice.name}: ${voice.status}`);
    }
  }

  const poller = createPoller({
    onFrame(frame, { newIncidents }) {
      engine.applyFrame(frame);
      if (newIncidents > 0) engine.queueIncidentHits(newIncidents);
      renderFrame(frame);
    },
    onStatus({ failing }) {
      // Honest-status idiom: stale data dims rather than lies. The
      // last known values stay visible, per the hold rule.
      root.setAttribute("data-stale", failing ? "1" : "0");
    },
  });

  // Poll from page load, muted or not: the readout and dots are the
  // widget's always-on half, and the engine banks frames so the first
  // unmuted moment already reflects the live estate.
  poller.start();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSonify, { once: true });
} else {
  initSonify();
}
