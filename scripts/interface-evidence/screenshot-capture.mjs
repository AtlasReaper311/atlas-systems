import path from "node:path";

// Chromium and Firefox reject full-page screenshots once either image dimension
// becomes too large.  Keep a margin below that browser limit so the fallback is
// predictable instead of depending on which browser happens to run the job.
export const DEFAULT_MAX_SAFE_SCREENSHOT_DIMENSION = 30_000;

export function segmentScrollPositions({ documentHeight, viewportHeight }) {
  if (!Number.isFinite(documentHeight) || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    throw new Error("documentHeight and viewportHeight must be finite, positive measurements");
  }
  const finalPosition = Math.max(0, documentHeight - viewportHeight);
  const positions = [];
  for (let scrollY = 0; scrollY < finalPosition; scrollY += viewportHeight) positions.push(scrollY);
  if (!positions.length || positions.at(-1) !== finalPosition) positions.push(finalPosition);
  return positions;
}

export async function measureDocument(page) {
  const measurement = await page.evaluate(() => ({
    documentWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
    documentHeight: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }));
  for (const [key, value] of Object.entries(measurement)) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`invalid document measurement ${key}=${value}`);
  }
  return measurement;
}

function safeEnvelopeExceeded(measurement, maxDimension) {
  return Math.max(measurement.documentWidth, measurement.documentHeight) > maxDimension;
}

export async function captureDeterministicScreenshots(page, {
  directory,
  browserName,
  viewportName,
  routeName,
  includeViewport = false,
  maxDimension = DEFAULT_MAX_SAFE_SCREENSHOT_DIMENSION,
}) {
  if (!directory || !browserName || !viewportName || !routeName) {
    throw new Error("directory, browserName, viewportName, and routeName are required");
  }
  const measurement = await measureDocument(page);
  const stem = `${browserName}-${viewportName}-${routeName}`;
  const evidence = {
    captureMode: null,
    document: measurement,
    safeMaxDimension: maxDimension,
    fallbackReason: null,
    fullPage: null,
    segments: [],
    viewport: null,
  };
  let fullPageError = null;
  const oversized = safeEnvelopeExceeded(measurement, maxDimension);

  if (!oversized) {
    try {
      const fullPage = `${stem}-full.png`;
      await page.screenshot({ path: path.join(directory, fullPage), fullPage: true });
      evidence.fullPage = `screenshots/${fullPage}`;
      evidence.captureMode = "full-page";
    } catch (error) {
      fullPageError = error;
      evidence.fallbackReason = `full-page capture failed: ${error.message}`;
    }
  } else {
    evidence.fallbackReason = `document exceeds safe screenshot envelope: ${Math.max(measurement.documentWidth, measurement.documentHeight)} > ${maxDimension}`;
  }

  if (!evidence.fullPage) {
    const positions = segmentScrollPositions(measurement);
    try {
      for (const [index, scrollY] of positions.entries()) {
        await page.evaluate((position) => window.scrollTo(0, position), scrollY);
        const filename = `${stem}-segment-${String(index + 1).padStart(2, "0")}.png`;
        await page.screenshot({ path: path.join(directory, filename), fullPage: false });
        evidence.segments.push({
          path: `screenshots/${filename}`,
          index,
          scrollY,
          height: Math.min(measurement.viewportHeight, measurement.documentHeight - scrollY),
        });
      }
      evidence.captureMode = oversized ? "segmented" : "segmented-fallback";
    } catch (error) {
      const normal = fullPageError ? `; normal full-page error: ${fullPageError.message}` : "";
      throw new Error(`segmented screenshot capture failed: ${error.message}${normal}`);
    }
  }

  if (includeViewport) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const filename = `${stem}-viewport.png`;
    try {
      await page.screenshot({ path: path.join(directory, filename), fullPage: false });
      evidence.viewport = `screenshots/${filename}`;
    } catch (error) {
      throw new Error(`viewport screenshot capture failed: ${error.message}`);
    }
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  return evidence;
}
