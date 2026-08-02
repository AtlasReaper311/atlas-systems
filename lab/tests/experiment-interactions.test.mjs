import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Almost exposes keyboard instructions, focus, and generated-state announcements", () => {
  const html = read("almost/index.html");
  const css = read("almost/almost.css");
  const source = read("almost/almost.js");

  assert.match(html, /id="almost-canvas"[\s\S]*tabindex="0"/);
  assert.match(html, /aria-describedby="almost-description almost-help"/);
  assert.match(html, /id="run-state"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="almost-help" class="sr-only"/);
  assert.match(html, /id="almost-live" class="sr-only" role="status" aria-live="polite"/);
  assert.match(css, /#almost-canvas:focus-visible/);
  assert.match(source, /function announce\(message\)/);
  assert.match(source, /Almost run \$\{String\(seed\)\.padStart\(8, "0"\)\} ready\./);
  assert.match(source, /Almost frame saved\./);
});

test("Drift lets keyboard users dismiss or clear interaction state", () => {
  const html = read("drift/index.html");
  const source = read("drift/drift.js");

  assert.match(html, /aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown P M R Escape"/);
  assert.match(html, /Escape to clear attention or dismiss the verdict/);
  assert.match(source, /function dismissVerdict\(\)/);
  assert.match(source, /case "Escape":/);
  assert.match(source, /Attention field cleared\./);
  assert.match(source, /Verdict dismissed\. Manual attention remains active\./);
});

test("Speculum makes the generated field keyboard-reachable and self-describing", () => {
  const html = read("speculum/index.html");

  assert.match(html, /id="spc-canvas"[\s\S]*tabindex="0"/);
  assert.match(html, /aria-describedby="spc-canvas-help"/);
  assert.match(html, /aria-keyshortcuts="E L Space R N T Escape"/);
  assert.match(html, /id="spc-canvas-help" class="sr-only"/);
  assert.match(html, /Escape to clear trace or pinned focus/);
});

test("The Bearing exposes canvas keyboard control without replacing the simulation", () => {
  const html = read("bearing/index.html");

  assert.match(html, /id="lattice"[\s\S]*tabindex="0"[\s\S]*role="application"/);
  assert.match(html, /aria-describedby="bearing-help bearing-live"/);
  assert.match(html, /aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Space Enter S C R Escape"/);
  assert.match(html, /id="bearing-help" class="sr-only"/);
  assert.match(html, /id="bearing-live" class="sr-only" role="status" aria-live="polite"/);
  assert.match(html, /class="controls" role="group" aria-label="Bearing simulation controls"/);
  assert.match(html, /<ol class="log" id="log" aria-live="polite"><\/ol>/);
  assert.match(html, /function keyboardStep\(event\)/);
  assert.match(html, /severAt\(pointer\.x, pointer\.y, 34 \* DPR\)/);
  assert.match(html, /document\.getElementById\("btn-surge"\)\.click\(\)/);
  assert.match(html, /Keyboard pressure released\./);
  assert.match(html, /#lattice:focus-visible/);
});
