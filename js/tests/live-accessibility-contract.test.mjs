import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const paths = {
  homeLive: new URL("static/js/live/home-live-signal.js", root),
  homeEntry: new URL("js/live-signal.js", root),
  homeCss: new URL("css/live-state-contract.css", root),
  homepage: new URL("index.html", root),
  symphonyUi: new URL("static/js/sonify/ui.js", root),
};

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([key, url]) => [key, await readFile(url, "utf8")]),
  ),
);

test("homepage live state uses one narrow polite atomic announcement region", () => {
  assert.match(sources.homeLive, /region\.setAttribute\("role", "status"\)/);
  assert.match(sources.homeLive, /region\.setAttribute\("aria-live", "polite"\)/);
  assert.match(sources.homeLive, /region\.setAttribute\("aria-atomic", "true"\)/);
  assert.match(sources.homeCss, /\.live-status-announcer\s*\{/);

  const navStatus = sources.homepage.match(/<a[^>]*class="nav-status"[^>]*>/)?.[0] ?? "";
  const estateStrip = sources.homepage.match(/<a[^>]*id="estate-strip"[^>]*>/)?.[0] ?? "";
  assert.ok(navStatus);
  assert.ok(estateStrip);
  assert.doesNotMatch(navStatus, /role="status"/);
  assert.doesNotMatch(estateStrip, /role="status"/);
});

test("high-frequency countdown updates remain silent", () => {
  assert.match(sources.homeLive, /countdown\.setAttribute\("aria-live", "off"\)/);
  assert.doesNotMatch(sources.homeLive, /countdown\.setAttribute\("role", "status"\)/);
});

test("homepage announcements are transition-driven and skip the initial baseline", () => {
  assert.match(
    sources.homeLive,
    /if \(!announcedState\) \{\s*announcedState = current;\s*return;\s*\}/,
  );
  assert.match(sources.homeLive, /Atlas Systems status degraded\./);
  assert.match(sources.homeLive, /Atlas Systems status unavailable\./);
  assert.match(sources.homeLive, /Atlas Systems status recovered\./);
  assert.match(sources.homeLive, /Estate registry data is stale\./);
  assert.match(sources.homeLive, /Estate registry data recovered and is current\./);
  assert.match(sources.homeLive, /Deployment succeeded/);
  assert.match(sources.homeLive, /if \(messages\.length\) region\.textContent = messages\.join\(" "\)/);
});

test("System SYMPHONY keeps announcements on dedicated status surfaces", () => {
  assert.match(
    sources.symphonyUi,
    /class="symphony-important-status" data-important-status aria-live="polite"/,
  );
  assert.match(sources.symphonyUi, /if \(message === lastAnnouncement\) return;/);
  assert.doesNotMatch(sources.symphonyUi, /class="system-symphony"[^>]*aria-live=/);
  assert.doesNotMatch(sources.symphonyUi, /class="symphony-console"[^>]*aria-live=/);
});

test("compatibility loader requests the Vector Five controller version", () => {
  assert.match(
    sources.homeEntry,
    /home-live-signal\.js\?v=20260720-vector-five/,
  );
});
