const commands = [
  {
    cmd: "atlas map --live",
    out: "declared topology + observed runtime registry resolved",
  },
  {
    cmd: "atlas audio --list",
    out: "System SYMPHONY · Signal Garden · real-time DSP surfaces",
  },
  {
    cmd: "atlas evidence --latest",
    out: "deploy outcomes · GitHub activity · service health · architecture contracts",
  },
  {
    cmd: "atlas corpus --search",
    out: "case studies · ADRs · READMEs · estate context",
  },
];

function initTerminal() {
  const input = document.getElementById("terminal-text");
  const output = document.getElementById("terminal-output");
  const cursor = document.getElementById("terminal-cursor");
  if (!input || !output) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  if (reduceMotion) {
    input.textContent = commands[0].cmd;
    output.textContent = commands[0].out;
    if (cursor) cursor.style.animation = "none";
    return;
  }

  async function type(text) {
    input.textContent = "";
    for (const character of text) {
      input.textContent += character;
      await delay(40);
    }
  }

  async function erase() {
    while (input.textContent.length > 0) {
      input.textContent = input.textContent.slice(0, -1);
      await delay(16);
    }
  }

  async function run() {
    await delay(320);
    let index = 0;
    while (true) {
      const item = commands[index % commands.length];
      await type(item.cmd);
      output.textContent = item.out;
      await delay(2800);
      await erase();
      index += 1;
      await delay(240);
    }
  }

  void run();
}

async function initHeroField() {
  const hero = document.querySelector(".hero");
  if (!hero) return;

  try {
    const { createAtlasField } = await import("/static/js/atlas-field.js?v=20260727-boundary");
    createAtlasField(hero, { preset: "hero" });
  } catch (error) {
    hero.dataset.atlasFieldState = "unavailable";
    console.warn("AtlasField could not initialise", error);
  }
}

function initReveal() {
  const elements = document.querySelectorAll(".reveal");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    elements.forEach((element) => element.classList.add("visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.08 });

  elements.forEach((element) => observer.observe(element));
}

function initNavigation() {
  const path = window.location.pathname;
  document.querySelectorAll(".nav-link, .mobile-nav-item").forEach((link) => {
    const href = link.getAttribute("href");
    if (!href) return;
    const home = href === "/" && path === "/";
    const nested = href !== "/" && path.startsWith(href);
    if (home || nested) link.classList.add("active");
  });
}

function initFooter() {
  const year = document.getElementById("footer-year");
  if (year) year.textContent = String(new Date().getFullYear());
}

function init() {
  initTerminal();
  void initHeroField();
  initReveal();
  initNavigation();
  initFooter();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
