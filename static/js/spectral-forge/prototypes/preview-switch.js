"use strict";

/* DEVELOPMENT-ONLY. Not part of the shipped module graph.
 * Loads a Field prototype when the URL has ?proto=<id>.
 * No-ops on production URLs without that query.
 */

const PROTOS = Object.freeze({
  v4: null,
  optical: "/static/js/spectral-forge/prototypes/field-proto-optical.js",
  schlieren: "/static/js/spectral-forge/prototypes/field-proto-schlieren.js",
  interference: "/static/js/spectral-forge/prototypes/field-proto-interference.js",
  cymatic: "/static/js/spectral-forge/prototypes/field-proto-cymatic.js",
  section: "/static/js/spectral-forge/prototypes/field-proto-section.js",
  "flagship-organism": "/static/js/spectral-forge/prototypes/field-proto-flagship-organism.js",
  "living-organism": "/static/js/spectral-forge/prototypes/field-proto-living-organism.js",
  "specimen-core": "/static/js/spectral-forge/prototypes/field-proto-specimen-core.js",
  "signal-monolith": "/static/js/spectral-forge/prototypes/field-proto-signal-monolith.js",
  ferrosphere: "/static/js/spectral-forge/prototypes/field-proto-ferrosphere.js",
  liquid: "/static/js/spectral-forge/prototypes/field-proto-liquid.js",
  ferro: "/static/js/spectral-forge/prototypes/field-proto-ferro.js",
  a: "/static/js/spectral-forge/prototypes/field-proto-a.js",
  b: "/static/js/spectral-forge/prototypes/field-proto-b.js",
  c: "/static/js/spectral-forge/prototypes/field-proto-c.js",
});

const LABELS = Object.freeze({
  v4: "v4 shipped",
  optical: "optical bench",
  schlieren: "schlieren",
  interference: "interference",
  cymatic: "cymatic",
  section: "milled section",
  "flagship-organism": "flagship ferrofluid",
  "living-organism": "living organism",
  "specimen-core": "specimen core",
  "signal-monolith": "signal monolith",
  ferrosphere: "ferrosphere",
  liquid: "liquid",
  ferro: "ferrofluid",
  a: "A crystal",
  b: "B membrane",
  c: "C aperture",
});

const params = new URLSearchParams(location.search);
const requested = params.get("proto");
if (!requested || !Object.prototype.hasOwnProperty.call(PROTOS, requested)) {
  /* Stay silent on the shipped page. */
} else {
  boot(requested);
}

function cleanupPrototypeSurface() {
  document.querySelectorAll(".spectral-field-proto-webgl").forEach((canvas) => {
    try {
      canvas.__atlasDispose?.();
    } catch (error) {
      console.warn("Prototype WebGL cleanup failed.", error);
    }
    if (canvas.isConnected) canvas.remove();
  });

  document.querySelectorAll(".forge-field-stage canvas:not(.spectral-field-proto-webgl)").forEach((canvas) => {
    canvas.style.opacity = "";
    delete canvas.dataset.fieldBackend;
  });
}

async function apply(id) {
  cleanupPrototypeSurface();
  const visuals = await import("/static/js/spectral-forge/visuals.js");
  const modulePath = PROTOS[id];
  if (!modulePath) {
    const shipped = await import("/static/js/spectral-forge/spectral-field-compose-v4.js");
    visuals.SpectralFieldRenderer.prototype.draw = function drawShipped(t) {
      return shipped.draw.call(this, t);
    };
    return;
  }
  const proto = await import(`${modulePath}?preview=${id}`);
  visuals.SpectralFieldRenderer.prototype.draw = function drawProto(t) {
    return proto.draw.call(this, t);
  };
}

function setProtoInUrl(id) {
  const next = new URL(location.href);
  next.searchParams.set("proto", id);
  history.replaceState({}, "", next);
}

async function boot(initial) {
  await waitForCanvas();
  await apply(initial);
  mountBar(initial);
}

function waitForCanvas() {
  return new Promise((resolve) => {
    const tick = () => {
      if (document.querySelector(".forge-play .forge-field-stage canvas")) resolve();
      else requestAnimationFrame(tick);
    };
    tick();
  });
}

function mountBar(current) {
  if (document.getElementById("field-proto-bar")) return;
  const bar = document.createElement("div");
  bar.id = "field-proto-bar";
  bar.setAttribute("role", "navigation");
  bar.setAttribute("aria-label", "Field prototype switcher");
  bar.style.cssText = [
    "position:fixed",
    "top:12px",
    "left:50%",
    "transform:translateX(-50%)",
    "z-index:80",
    "display:flex",
    "flex-wrap:wrap",
    "gap:6px",
    "max-width:min(96vw,1100px)",
    "padding:8px 10px",
    "background:#111118",
    "border:1px solid #2a2a36",
    "font:11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace",
    "color:#e8e8e0",
  ].join(";");

  const note = document.createElement("span");
  note.textContent = "PROTO";
  note.style.cssText = "color:#f5a623;letter-spacing:0.12em;padding:6px 8px 6px 4px;";
  bar.appendChild(note);

  Object.keys(PROTOS).forEach((id) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = LABELS[id];
    btn.dataset.proto = id;
    styleButton(btn, id === current);
    btn.addEventListener("click", async () => {
      await apply(id);
      setProtoInUrl(id);
      bar.querySelectorAll("button").forEach((node) => styleButton(node, node.dataset.proto === id));
    });
    bar.appendChild(btn);
  });

  const back = document.createElement("a");
  back.href = "/static/js/spectral-forge/prototypes/gallery.htm";
  back.textContent = "all stills";
  back.style.cssText = "color:#f5a623;padding:6px 8px;text-decoration:none;margin-left:4px;";
  bar.appendChild(back);

  document.body.appendChild(bar);
}

function styleButton(btn, on) {
  btn.style.cssText = [
    "appearance:none",
    "border:1px solid " + (on ? "#f5a623" : "#2a2a36"),
    "background:" + (on ? "#1a1a24" : "transparent"),
    "color:" + (on ? "#f5a623" : "#e8e8e0"),
    "padding:6px 8px",
    "cursor:pointer",
    "font:inherit",
  ].join(";");
}
