import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import { runSystemSymphonyProductionLoudnessProof } from "./run_system_symphony_production_loudness.mjs";

const siteUrl = process.env.SITE_URL ?? process.env.PREVIEW_URL;
if (!siteUrl) throw new Error("SITE_URL or PREVIEW_URL is required");

const expectedSha = process.env.EXPECTED_SHA;
if (!/^[0-9a-f]{40}$/i.test(expectedSha ?? "")) {
  throw new Error("EXPECTED_SHA must be a full 40-character commit SHA");
}

const outputDir = process.env.SYMPHONY_PRODUCTION_OUTPUT_DIR
  ?? path.join(process.cwd(), ".tmp", "system-symphony-production-loudness");
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});

try {
  const evidence = await runSystemSymphonyProductionLoudnessProof({
    browser,
    siteUrl,
    expectedSha,
    outputDir,
  });
  console.log(
    `Aligned System Symphony production loudness proof passed: ${evidence.programmeSummary.measuredBars} bars, ${evidence.transitionSummary.measuredTransitionCount} transitions`,
  );
} finally {
  await browser.close();
}
