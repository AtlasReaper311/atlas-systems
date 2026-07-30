import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adoption = await readFile(
  new URL("../../docs/public-interface-phase-6-footer-adoption.md", import.meta.url),
  "utf8",
);

test("Phase 6 adoption cites the canonical accepted ADR paths", () => {
  assert.match(adoption, /ADR-0008-public-interface-system-v2\.md/);
  assert.match(adoption, /ADR-0009-classic-writing-footer-exception\.md/);

  assert.doesNotMatch(adoption, /ADR-0008-public-interface-programme-governance\.md/);
  assert.doesNotMatch(adoption, /ADR-0009-classic-writing-article-footer-exception\.md/);
});
