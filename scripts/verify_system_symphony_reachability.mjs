import fs from "node:fs";
import path from "node:path";

const DEFAULT_ENTRY = "lab/system-symphony-apu/index.html";
const entry = process.argv[2] ?? DEFAULT_ENTRY;
const root = process.cwd();
const forbidden = [
  /^static\/audio\/system-symphony\//,
  /^static\/js\/sonify\/(?:samples|sampler|asset-loader|engine|ghost-circuit)\.js$/,
];
const forbiddenSource = [
  /\bTone\.Player\b/,
  /\bTone\.Sampler\b/,
  /\bTone\.ToneAudioBuffer\b/,
  /\bcreateHybridSampler\b/,
  /\bresolveSamplePalette\b/,
  /static\/audio\/system-symphony\//,
];

function normalizeSpec(specifier, fromFile) {
  if (!specifier || /^(?:https?:)?\/\//.test(specifier)) return null;
  const clean = specifier.split("?")[0].split("#")[0];
  if (!clean || clean.startsWith("data:") || clean.startsWith("blob:")) return null;
  if (clean.startsWith("/")) return clean.slice(1);
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), clean));
}

function readSiteFile(file) {
  const fullPath = path.join(root, file);
  if (!fullPath.startsWith(root) || !fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, "utf8");
}

function dependenciesFor(file, source) {
  const specs = [];
  if (file.endsWith(".html")) {
    for (const match of source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
      specs.push(match[1]);
    }
    for (const match of source.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
      if (/\.css(?:\?|$)/.test(match[1])) specs.push(match[1]);
    }
  }
  if (/\.(?:mjs|js|css|html)$/.test(file)) {
    for (const match of source.matchAll(/(?:import\s+(?:[^"']+\s+from\s+)?|import\s*\(|export\s+[^"']*from\s+)["']([^"']+)["']/g)) {
      specs.push(match[1]);
    }
  }
  return specs.map((specifier) => normalizeSpec(specifier, file)).filter(Boolean);
}

const seen = new Set();
const queue = [entry];
const missing = [];

while (queue.length) {
  const file = queue.shift();
  if (seen.has(file)) continue;
  seen.add(file);
  const source = readSiteFile(file);
  if (source === null) {
    missing.push(file);
    continue;
  }
  for (const dependency of dependenciesFor(file, source)) {
    if (!seen.has(dependency)) queue.push(dependency);
  }
}

const reachable = [...seen].sort();
const forbiddenFiles = reachable.filter((file) => forbidden.some((pattern) => pattern.test(file)));
const forbiddenMatches = [];

for (const file of reachable) {
  const source = readSiteFile(file);
  if (source === null) continue;
  for (const pattern of forbiddenSource) {
    if (pattern.test(source)) forbiddenMatches.push(`${file}: ${pattern}`);
  }
}

if (missing.length || forbiddenFiles.length || forbiddenMatches.length) {
  console.error(`System Symphony reachability guard failed for ${entry}`);
  if (missing.length) console.error(`Missing dependencies:\n${missing.map((item) => `- ${item}`).join("\n")}`);
  if (forbiddenFiles.length) console.error(`Forbidden reachable files:\n${forbiddenFiles.map((item) => `- ${item}`).join("\n")}`);
  if (forbiddenMatches.length) console.error(`Forbidden source references:\n${forbiddenMatches.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}

console.log(`System Symphony reachability guard passed for ${entry}`);
console.log(`Reachable files: ${reachable.length}`);
