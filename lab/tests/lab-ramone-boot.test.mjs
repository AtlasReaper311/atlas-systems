import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const labHtml = fs.readFileSync("lab/index.html", "utf8");
const labCard = fs.readFileSync("lab/lab-card.js", "utf8");

test("Ramone boot room fits the six cold-start lines above the greeting", () => {
  assert.match(labHtml, /\.lab-ramone-section \.ramone-boot \{ max-height:9\.75rem; overflow:hidden; \}/);
  assert.match(labHtml, /lab-card\.js\?v=20260811-boot-on-scroll/);
});

test("Ramone cold-start plays once when the hero is at least 40% visible", () => {
  assert.match(labCard, /let bootStarted = false/);
  assert.match(labCard, /IntersectionObserver/);
  assert.match(labCard, /threshold:\s*\[\s*0\.4\s*\]/);
  assert.match(labCard, /intersectionRatio >= 0\.4/);
  assert.match(labCard, /reading the docs again, just in case/);
  assert.match(labCard, /consciousness:.*nominal.*ready to chat/);
});
