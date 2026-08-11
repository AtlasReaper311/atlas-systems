import fs from "node:fs";
import process from "node:process";

import {
  allEvidenceRoutes,
  buildEvidencePlan,
  classifyChangedFiles,
} from "./interface-evidence/contract.mjs";

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

const sitemapPath = option("--sitemap", "sitemap.xml");
const changedFilesPath = option("--changed-files");
const outputPath = option("--output", "interface-evidence-plan.json");
const githubOutputPath = option("--github-output");

const sitemapXml = fs.readFileSync(sitemapPath, "utf8");
const routes = allEvidenceRoutes(sitemapXml);
const changedFiles = changedFilesPath
  ? fs.readFileSync(changedFilesPath, "utf8").split(/\r?\n/).filter(Boolean)
  : [];
const classification = classifyChangedFiles({ changedFiles, routes });
const plan = buildEvidencePlan({ sitemapXml, changedRoutes: classification.changed_routes });
const payload = {
  ...plan,
  changed_files: changedFiles,
  classification,
};

fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${outputPath}: ${plan.route_count} routes, ${classification.changed_routes.length} changed route(s)`);

if (githubOutputPath) {
  const lines = [
    `evidence_required=${classification.evidence_required}`,
    `visual_change=${classification.visual_change}`,
    `evidence_contract_change=${classification.evidence_contract_change}`,
    `changed_routes_json=${JSON.stringify(classification.changed_routes)}`,
    `route_count=${plan.route_count}`,
  ];
  fs.appendFileSync(githubOutputPath, `${lines.join("\n")}\n`);
}
