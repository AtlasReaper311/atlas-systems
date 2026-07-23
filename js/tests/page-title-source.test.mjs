import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const script = path.resolve("scripts/normalize_page_titles.py");

function fixture(relativePath, html) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-title-test-"));
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html, "utf8");
  execFileSync("python3", [script, root], { stdio: "pipe" });
  return fs.readFileSync(target, "utf8");
}

test("normalizer converts historical dash titles and synchronizes social titles", () => {
  const html = fixture(
    "work/index.html",
    '<title>Work — Atlas Systems</title>\n<meta property="og:title" content="Work // Atlas Systems">\n<meta name="twitter:title" content="Work // Atlas Systems">\n',
  );
  assert.match(html, /<title>Work \/\/ Atlas Systems<\/title>/);
  assert.match(html, /property="og:title" content="Work \/\/ Atlas Systems"/);
  assert.match(html, /name="twitter:title" content="Work \/\/ Atlas Systems"/);
});

test("normalizer preserves the homepage and already-correct article titles", () => {
  const home = fixture("index.html", "<title>Atlas Systems</title>\n");
  const article = fixture(
    "writing/example/index.html",
    '<title>Example Article // Atlas Systems</title>\n<meta property="og:title" content="Example Article // Atlas Systems">\n',
  );
  assert.equal(home, "<title>Atlas Systems</title>\n");
  assert.match(article, /Example Article \/\/ Atlas Systems/);
});

test("check mode refuses an unnormalized source tree", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-title-check-"));
  fs.mkdirSync(path.join(root, "about"), { recursive: true });
  fs.writeFileSync(path.join(root, "about/index.html"), "<title>About — Atlas Systems</title>\n", "utf8");
  assert.throws(() => execFileSync("python3", [script, "--check", root], { stdio: "pipe" }));
});
