import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync("lab/blackbox/index.html", "utf8");
const script = fs.readFileSync("lab/blackbox/blackbox.js", "utf8");
const shell = fs.readFileSync("lab/shared/shell.js", "utf8");
const sitemap = fs.readFileSync("scripts/generate_sitemap.py", "utf8");
const social = JSON.parse(fs.readFileSync("scripts/og/manifest.json", "utf8"));

test("Blackbox is a first-class public Lab route", () => {
  assert.match(page, /<title>Blackbox \/\/ Atlas Systems<\/title>/);
  assert.match(page, /canonical" href="https:\/\/atlas-systems\.uk\/lab\/blackbox\/"/);
  assert.match(page, /id="blackbox-host"/);
  assert.match(page, /id="blackbox-statusline"/);
  assert.match(page, /human-reviewed postmortems/);
  assert.match(page, /Unknown stays unknown\./);
  assert.match(script, /import "\.\.\/shared\/shell\.js"/);
  assert.match(script, /blackbox-timeline\.js/);
});

test("shared Lab navigation and the Lab directory expose Blackbox", () => {
  assert.match(shell, /label: "Blackbox", href: "\/lab\/blackbox\/"/);
  assert.match(shell, /function installBlackboxDirectoryCard\(\)/);
  assert.match(shell, /title\.textContent = "Blackbox"/);
  assert.match(shell, /mode\.textContent = "Recorded replay"/);
  assert.match(shell, /installBlackboxDirectoryCard\(\)/);
});

test("public route inventories own the Blackbox route", () => {
  assert.match(sitemap, /\("\/lab\/blackbox\/", "monthly", "0\.6"\)/);
  const entry = social.routes.find((item) => item.route === "/lab/blackbox/");
  assert.equal(entry?.html, "lab/blackbox/index.html");
  assert.equal(entry?.file, "blackbox");
});
