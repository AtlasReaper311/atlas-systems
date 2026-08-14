import { chromium } from "playwright";
import path from "node:path";

const OUT = "/Users/atlasreaper/Personal/.worktrees/pr240/static/js/spectral-forge/prototypes/captures";
const BASE = "http://127.0.0.1:8791/lab/spectral-forge/";
const PROTOS = [
  { id: "flagship-organism", module: "/static/js/spectral-forge/prototypes/field-proto-flagship-organism.js" },
  { id: "living-organism", module: "/static/js/spectral-forge/prototypes/field-proto-living-organism.js" },
  { id: "specimen-core", module: "/static/js/spectral-forge/prototypes/field-proto-specimen-core.js" },
  { id: "signal-monolith", module: "/static/js/spectral-forge/prototypes/field-proto-signal-monolith.js" },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(45_000);
page.on("pageerror", (error) => console.error("PAGEERROR", error.message));
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".forge-play .forge-field-stage canvas");
await page.waitForTimeout(500);

async function swap(module) {
  await page.evaluate(async (mod) => {
    const visuals = await import("/static/js/spectral-forge/visuals.js");
    const proto = await import(`${mod}?t=${Date.now()}`);
    visuals.SpectralFieldRenderer.prototype.draw = function drawProto(t) {
      return proto.draw.call(this, t);
    };
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
    for (let i = 0; i < d.length; i += 4 * 53) {
      total += 1;
      const l = d[i] + d[i + 1] + d[i + 2];
      if (l > 70) lit += 1;
      if (l > maxL) maxL = l;
    }
    return { raf, litPct: Math.round((lit / total) * 100), maxL, renderer: c.dataset.fieldRenderer ?? null, vis: document.visibilityState };
  });
}

for (const proto of PROTOS) {
  await swap(proto.module);
  await page.locator(".forge-scenario-control select").first().selectOption({ index: 0 });
  await page.getByRole("button", { name: /^PLAY$/i }).first().click();
  await page.waitForTimeout(3000);
  const normal = await metrics();
  await page.locator(".forge-play .forge-field-stage").screenshot({ path: path.join(OUT, `${proto.id}-normal-3s.png`) });
  console.log(proto.id, "NORMAL", normal);

  const pause = page.getByRole("button", { name: /^(PAUSE|STOP)$/i }).first();
  if (await pause.count()) await pause.click().catch(() => {});
  await page.locator(".forge-scenario-control select").first().selectOption({ index: 5 });
  await page.getByRole("button", { name: /^PLAY$/i }).first().click();
  await page.waitForTimeout(20000);
  const cascade = await metrics();
  await page.locator(".forge-play .forge-field-stage").screenshot({ path: path.join(OUT, `${proto.id}-cascade-20s.png`) });
  console.log(proto.id, "CASCADE", cascade);
  if (await pause.count()) await pause.click().catch(() => {});
}

await browser.close();
