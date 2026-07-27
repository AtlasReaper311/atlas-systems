/*
 * Atlas APU flagship enhancements — option 2A "Stage & Drawer, elevated"
 * lab/system-symphony/symphony-flagship-2a.js
 *
 * Additive. This module does NOT modify system-symphony-page.js.
 * It reads the cartridge that page.js already publishes and paints four
 * surfaces the instrument previously had no visual for:
 *
 *   1. data-score-state on [data-symphony-flagship]  (accent follows the estate)
 *   2. [data-score-grid]      7 APU roles x 16 steps, drawn from scorePlan
 *   3. [data-cartridge-sleeve] cover art generated from the frame seed
 *   4. [data-frame-ribbon]     last 60 dominant states, click to replay
 *   5. [data-cartridge-boot]   one-shot boot, suppressed for reduced motion
 *
 * Hook: page.js assigns window.__ATLAS_APU_CARTRIDGE__ and writes
 * data-state onto [data-current-cartridge-cover] on every frame
 * (renderCartridge + syncSummary). Observing that one attribute gives us a
 * change signal for free, with no edit to the existing module.
 */

const ROLES = Object.freeze(["clock", "pulse", "memory", "thermal", "signal", "contention", "recovery"]);
const ROLE_LABELS = Object.freeze({
  clock: "Clock", pulse: "Pulse", memory: "Memory", thermal: "Thermal",
  signal: "Signal", contention: "Contention", recovery: "Recovery",
});
const STATES = Object.freeze(["healthy", "warning", "critical", "unknown"]);
const STEPS = 16;
const RIBBON_LENGTH = 60;
const BOOT_MS = 2600;
const BOOT_SESSION_KEY = "atlas-system-symphony-cartridge-boot-v1";

const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/* ---------------------------------------------------------------- seeded -- */

function fnv(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function xorshift(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
}

/* ------------------------------------------------------------ cartridge -- */

function currentCartridge() {
  return window.__ATLAS_APU_CARTRIDGE__ ?? null;
}

function dominantState(cartridge) {
  const state = String(cartridge?.dominantState ?? "").toLowerCase();
  return STATES.includes(state) ? state : "unknown";
}

function frameSeed(cartridge) {
  return String(cartridge?.frameSeed ?? cartridge?.seed ?? cartridge?.replaySeed ?? "A7A5");
}

/* A role is measured when the score plan actually carries a lane for it.
   Anything else is drawn as an explicit blank, never as a healthy rest. */
function roleIsMeasured(plan, role) {
  const entry = plan?.roles?.[role];
  if (!entry) return false;
  if (entry.measured === false) return false;
  if (entry.state === "unmeasured" || entry.lane === "unmeasured") return false;
  return true;
}

/* Density is read from the plan where the plan states it, and otherwise
   derived from the role's own fields. No invented telemetry. */
function roleDensity(plan, role) {
  const entry = plan?.roles?.[role] ?? {};
  const candidates = [entry.density, entry.pressure, entry.load, entry.intensity];
  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return Math.max(0, Math.min(1, numeric));
  }
  if (role === "clock") return 1;
  if (role === "contention") return Number(entry.alerts) > 0 ? 0.55 : 0;
  if (role === "recovery") return entry.active === true ? 0.24 : 0.06;
  return 0.34;
}

/* ----------------------------------------------------------- score grid -- */

function buildScoreGrid(grid, cartridge) {
  const plan = cartridge?.scorePlan ?? null;
  const state = dominantState(cartridge);
  const seed = frameSeed(cartridge);
  grid.replaceChildren();
  grid.dataset.scoreState = state;

  for (const role of ROLES) {
    const measured = roleIsMeasured(plan, role);
    const density = roleDensity(plan, role);
    const random = xorshift(fnv(`${seed}:${state}:${role}`));

    const row = document.createElement("div");
    row.className = "symphony-score-grid__row";
    row.dataset.measured = String(measured);

    const label = document.createElement("span");
    label.className = "symphony-score-grid__label";
    label.textContent = ROLE_LABELS[role];

    const lane = document.createElement("div");
    lane.className = "symphony-score-grid__lane";
    lane.setAttribute("role", "img");

    let hits = 0;
    for (let step = 0; step < STEPS; step += 1) {
      const cell = document.createElement("i");
      cell.className = "symphony-score-grid__cell";
      if (!measured) {
        cell.dataset.cell = "unmeasured";
      } else {
        const roll = random();
        const hit = role === "clock" ? step % 4 === 0 : roll < density;
        const strong = role === "clock" ? step === 0 : hit && roll < density * 0.38;
        cell.dataset.cell = strong ? "accent" : hit ? "hit" : "rest";
        if (hit) hits += 1;
      }
      lane.append(cell);
    }

    lane.setAttribute(
      "aria-label",
      measured
        ? `${ROLE_LABELS[role]}: ${hits} of ${STEPS} steps sound in the current frame.`
        : `${ROLE_LABELS[role]}: unmeasured. This lane is blank because no measurement exists, not because the estate is healthy.`,
    );

    row.append(label, lane);
    grid.append(row);
  }

  const seedNode = document.querySelector("[data-score-grid-seed]");
  if (seedNode) seedNode.textContent = `Seed ${seed} · deterministic`;
}

function movePlayhead(grid, step) {
  grid.style.setProperty("--score-step", String(step % STEPS));
}

/* -------------------------------------------------------------- sleeve --- */

function paintSleeve(sleeve, cartridge) {
  const state = dominantState(cartridge);
  const seed = frameSeed(cartridge);
  if (sleeve.dataset.sleeveSeed === `${seed}:${state}`) return;
  sleeve.dataset.sleeveSeed = `${seed}:${state}`;

  const art = sleeve.querySelector("[data-sleeve-art]");
  if (!art) return;
  const random = xorshift(fnv(`cover:${seed}:${state}`));
  const bands = [];
  let x = 4;
  while (x < 92) {
    const width = 0.9 + random() * 3.4;
    const tone = random();
    const band = document.createElement("i");
    band.className = "symphony-sleeve__band";
    band.dataset.tone = tone > 0.78 ? "accent" : tone > 0.44 ? "mid" : "cool";
    const top = random() * 18;
    const height = Math.min(42 + random() * 44, 100 - top);
    band.style.left = `${x.toFixed(2)}%`;
    band.style.width = `${width.toFixed(2)}%`;
    band.style.top = `${top.toFixed(1)}%`;
    band.style.height = `${height.toFixed(1)}%`;
    bands.push(band);
    x += width + 1.1 + random() * 5.4;
  }
  art.replaceChildren(...bands);

  const serial = sleeve.querySelector("[data-sleeve-serial]");
  if (serial) {
    serial.textContent = `APU-01 / ${seed} / ${fnv(seed + state).toString(16).slice(0, 6).toUpperCase()}`;
  }
}

/* -------------------------------------------------------------- ribbon --- */

const ribbonHistory = [];

function pushRibbonFrame(cartridge) {
  const state = dominantState(cartridge);
  const last = ribbonHistory[ribbonHistory.length - 1];
  if (last && last.state === state && last.seed === frameSeed(cartridge)) return false;
  ribbonHistory.push({
    state,
    seed: frameSeed(cartridge),
    replaySeed: String(cartridge?.replaySeed ?? "A7A5"),
    time: cartridge?.frameTime ?? null,
  });
  while (ribbonHistory.length > RIBBON_LENGTH) ribbonHistory.shift();
  return true;
}

function renderRibbon(ribbon) {
  ribbon.replaceChildren();
  const total = ribbonHistory.length;
  ribbonHistory.forEach((entry, index) => {
    const age = total > 1 ? (index / (total - 1)) ** 1.4 : 1;
    const stripe = document.createElement("button");
    stripe.type = "button";
    stripe.className = "symphony-frame-ribbon__frame";
    stripe.dataset.state = entry.state;
    stripe.style.setProperty("--frame-age", (0.16 + age * 0.8).toFixed(2));
    const when = entry.time ? ` at ${entry.time}` : "";
    stripe.title = `${entry.state}${when}`;
    stripe.setAttribute("aria-label", `Replay the ${entry.state} frame${when}.`);
    stripe.addEventListener("click", () => {
      const seedInput = document.querySelector("[data-page-replay-seed]");
      const profile = document.querySelector("[data-page-replay-profile]");
      if (seedInput) seedInput.value = entry.replaySeed;
      if (profile) profile.value = entry.state;
      document.querySelector("[data-page-replay-apply]")?.click();
    });
    ribbon.append(stripe);
  });
  const count = document.querySelector("[data-frame-ribbon-count]");
  if (count) count.textContent = `Last ${total} frame${total === 1 ? "" : "s"}`;
}

/* ---------------------------------------------------------------- boot --- */

function runBoot() {
  const boot = document.querySelector("[data-cartridge-boot]");
  if (!boot) return;
  if (reduceMotion()) {
    boot.remove();
    return;
  }
  try {
    if (window.sessionStorage?.getItem(BOOT_SESSION_KEY) === "played") {
      boot.remove();
      return;
    }
    window.sessionStorage?.setItem(BOOT_SESSION_KEY, "played");
  } catch {
    // Storage can be disabled; the animation remains harmlessly one-shot per page load.
  }
  boot.dataset.running = "true";
  window.setTimeout(() => {
    boot.dataset.running = "false";
    window.setTimeout(() => boot.remove(), 520);
  }, BOOT_MS);
}

/* --------------------------------------------------------------- wiring -- */

function paintAll() {
  const cartridge = currentCartridge();
  const flagship = document.querySelector("[data-symphony-flagship]");
  if (flagship) flagship.dataset.scoreState = dominantState(cartridge);

  const grid = document.querySelector("[data-score-grid]");
  if (grid) buildScoreGrid(grid, cartridge);

  const sleeve = document.querySelector("[data-cartridge-sleeve]");
  if (sleeve) paintSleeve(sleeve, cartridge);

  const ribbon = document.querySelector("[data-frame-ribbon]");
  if (ribbon && pushRibbonFrame(cartridge)) renderRibbon(ribbon);
}

function startPlayhead() {
  const grid = document.querySelector("[data-score-grid]");
  const host = document.getElementById("system-symphony-widget");
  if (!grid) return;
  let step = 0;
  const bpm = () => {
    const value = Number(String(currentCartridge()?.tempo ?? "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(value) && value > 20 ? value : 100;
  };
  let timer = null;
  const tick = () => {
    const running = host?.dataset.running === "1";
    grid.dataset.running = String(running);
    if (running) {
      step = (step + 1) % STEPS;
      movePlayhead(grid, step);
    }
    timer = window.setTimeout(tick, (60000 / bpm()) / 4);
  };
  tick();
  window.addEventListener("pagehide", () => window.clearTimeout(timer), { once: true });
}

function observeCartridge() {
  const cover = document.querySelector("[data-current-cartridge-cover]");
  if (!cover) return;
  const observer = new MutationObserver(paintAll);
  observer.observe(cover, { attributes: true, attributeFilter: ["data-state"] });
  window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
}

function initialise() {
  runBoot();
  paintAll();
  observeCartridge();
  startPlayhead();
  /* page.js paints asynchronously after the first frame resolves; repaint on a
     short settle so the grid is never left on placeholder values. */
  window.setTimeout(paintAll, 1200);
  window.setTimeout(paintAll, 4000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialise, { once: true });
} else {
  initialise();
}
