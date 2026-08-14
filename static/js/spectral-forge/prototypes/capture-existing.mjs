import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const OUT = "/tmp/spectral-field-captures";
const BASE = "http://127.0.0.1:8791/lab/spectral-forge/";

const PROTOS = [
  { id: "v4", module: null },
  { id: "optical", module: "/static/js/spectral-forge/prototypes/field-proto-optical.js" },
  { id: "a", module: "/static/js/spectral-forge/prototypes/field-proto-a.js" },
  { id: "b", module: "/static/js/spectral-forge/prototypes/field-proto-b.js" },
  { id: "c", module: "/static/js/spectral-forge/prototypes/field-proto-c.js" },
];

await fs.mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(45_000);
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".forge-play .forge-field-stage canvas");
await page.waitForTimeout(700);

const vis = await page.evaluate(() => document.visibilityState);
console.log("visibilityState", vis);

async function swap(module) {
  await page.evaluate(async (mod) => {
    const visuals = await import("/static/js/spectral-forge/visuals.js");
    if (!mod) {
      const shipped = await import("/static/js/spectral-forge/spectral-field-compose-v4.js");
      visuals.SpectralFieldRenderer.prototype.draw = function (t) { return shipped.draw.call(this, t); };
      return;
    }
    const proto = await import(mod);
    visuals.SpectralFieldRenderer.prototype.draw = function (t) { return proto.draw.call(this, t); };
  }, module);
}

async function metrics() {
  return page.evaluate(async () => {
    const raf = await new Promise((resolve) => {
      let n = 0;
      const start = performance.now();
      const loop = (t) => {
        n += 1;
        if (t - start < 1000) requestAnimationFrame(loop);
        else resolve(n);
      };
      requestAnimationFrame(loop);
    });
    const c = document.querySelector(".forge-play .forge-field-stage canvas");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    let total = 0;
    let maxL = 0;
    const hueBins = [0, 0, 0, 0]; // cool / amber / other / dark
    for (let i = 0; i < d.length; i += 4 * 53) {
      total += 1;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const l = r + g + b;
      if (l > 70) lit += 1;
      if (l > maxL) maxL = l;
      if (l < 40) hueBins[3] += 1;
      else if (r > g && r > b && r - b > 30) hueBins[1] += 1;
      else if (b >= r) hueBins[0] += 1;
      else hueBins[2] += 1;
    }
    return {
      raf,
      litPct: Math.round((lit / total) * 100),
      maxL,
      cool: hueBins[0],
      amber: hueBins[1],
      other: hueBins[2],
      dark: hueBins[3],
      renderer: c.dataset.fieldRenderer ?? null,
      w: c.width,
      h: c.height,
      vis: document.visibilityState,
    };
  });
}

async function shot(name) {
  const dest = path.join(OUT, `${name}.png`);
  await page.locator(".forge-play .forge-field-stage").screenshot({ path: dest });
  return dest;
}

const results = [];

for (const proto of PROTOS) {
  await swap(proto.module);
  // NORMAL LOAD ~3s
  await page.locator(".forge-scenario-control select").first().selectOption({ index: 0 });
  await page.getByRole("button", { name: /^PLAY$/i }).first().click();
  await page.waitForTimeout(3000);
  const mN = await metrics();
  const pN = await shot(`${proto.id}-normal-3s`);
  console.log(proto.id, "NORMAL", mN, pN);
  results.push({ proto: proto.id, scenario: "normal", ...mN, file: pN });

  // reset then CASCADING ~20s
  const pause = page.getByRole("button", { name: /^(PAUSE|STOP)$/i }).first();
  if (await pause.count()) await pause.click().catch(() => {});
  await page.locator(".forge-scenario-control select").first().selectOption({ index: 5 });
  await page.getByRole("button", { name: /^PLAY$/i }).first().click();
  await page.waitForTimeout(20000);
  const mC = await metrics();
  const pC = await shot(`${proto.id}-cascade-20s`);
  console.log(proto.id, "CASCADE", mC, pC);
  results.push({ proto: proto.id, scenario: "cascade", ...mC, file: pC });

  const stop = page.getByRole("button", { name: /^(PAUSE|STOP)$/i }).first();
  if (await stop.count()) await stop.click().catch(() => {});
}

await fs.writeFile(path.join(OUT, "metrics.json"), JSON.stringify(results, null, 2));
await browser.close();
console.log("done", OUT);
