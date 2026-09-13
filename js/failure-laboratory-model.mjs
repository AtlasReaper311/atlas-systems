import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const MODEL_PATH = new URL("../data/failure-laboratory-model.json", import.meta.url);
export const MODEL_SCHEMA = "atlas-systems/failure-laboratory-model/v1";
export const ACCEPTED_EVIDENCE_MODES = Object.freeze([
  "measured",
  "stale-measured",
  "recorded-replay",
  "simulated",
  "unavailable",
  "unknown",
  "not-applicable-unscored",
]);
export const RELATIONSHIP_TYPES = Object.freeze([
  "direct",
  "contextual",
  "cross-cutting",
  "unsupported",
]);
export const STAGE_IDS = Object.freeze([
  "request",
  "dependencies",
  "coordination",
  "impact",
  "incident-evidence",
  "recovery",
]);
export const SCENARIO_IDS = Object.freeze([
  "normal-operation",
  "latency-creep",
  "cache-collapse",
  "dependency-failure",
  "network-partition",
  "cascading-failure",
  "recovery",
]);
export const PRIVATE_PATH_PATTERN = /(?:^|[\\/])(?:private|tmp|Users|home)(?:[\\/]|$)|(?:^|[\\/])\.\.(?:[\\/]|$)|(?:^[a-z]+:|^\/\/)/i;

const SOURCE_TYPES = new Set([
  "synthetic",
  "recorded",
  "live-public",
  "lifecycle-record",
]);

export function loadFailureLaboratoryModel(modelPath = MODEL_PATH) {
  const filePath = modelPath instanceof URL ? fileURLToPath(modelPath) : modelPath;
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function serializeFailureLaboratoryModel(model) {
  return `${JSON.stringify(model, null, 2)}\n`;
}

export function routeFilePath(rootDir, route) {
  if (!isSafePublicRoute(route)) {
    throw new Error(`unsafe public route: ${route}`);
  }
  const root = path.resolve(rootDir);
  const relativeRoute = route.slice(1, -1);
  const candidate = path.resolve(root, relativeRoute, "index.html");
  const relative = path.relative(root, candidate);
  if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error(`public route escapes repository root: ${route}`);
  }
  return candidate;
}

export function isSafePublicRoute(route) {
  return (
    typeof route === "string" &&
    route.startsWith("/") &&
    route.endsWith("/") &&
    route.length > 1 &&
    !route.includes("?") &&
    !route.includes("#") &&
    !route.includes("\\") &&
    !route.includes("//") &&
    !PRIVATE_PATH_PATTERN.test(route)
  );
}

function fail(pathName, message) {
  throw new Error(`${pathName}: ${message}`);
}

function requireString(value, pathName) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(pathName, "must be a non-empty string");
  }
}

function requireBoolean(value, pathName) {
  if (typeof value !== "boolean") fail(pathName, "must be boolean");
}

function requireArray(value, pathName) {
  if (!Array.isArray(value)) fail(pathName, "must be an array");
}

function requireUnique(values, pathName) {
  if (new Set(values).size !== values.length) fail(pathName, "must contain unique values");
}

function requireExactValues(actual, expected, pathName) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    fail(pathName, `must equal ${JSON.stringify(expected)}`);
  }
}

function requireEnum(value, allowed, pathName) {
  if (!allowed.includes(value)) fail(pathName, `must be one of ${allowed.join(", ")}`);
}

function requireStringArray(value, pathName) {
  requireArray(value, pathName);
  value.forEach((item, index) => requireString(item, `${pathName}[${index}]`));
}

function validateInstrument(instrument, index, rootDir) {
  const prefix = `instruments[${index}]`;
  requireString(instrument?.id, `${prefix}.id`);
  requireString(instrument?.label, `${prefix}.label`);
  requireString(instrument?.journeyRole, `${prefix}.journeyRole`);
  requireString(instrument?.phaseRole, `${prefix}.phaseRole`);
  requireString(instrument?.question, `${prefix}.question`);
  requireString(instrument?.proofBoundary, `${prefix}.proofBoundary`);
  requireStringArray(instrument?.nonClaims, `${prefix}.nonClaims`);
  requireStringArray(instrument?.nativeEvidenceModes, `${prefix}.nativeEvidenceModes`);
  instrument.nativeEvidenceModes.forEach((mode, modeIndex) => {
    requireEnum(mode, ACCEPTED_EVIDENCE_MODES, `${prefix}.nativeEvidenceModes[${modeIndex}]`);
  });

  const canonical = instrument.canonical;
  if (!canonical || typeof canonical !== "object") fail(`${prefix}.canonical`, "must be an object");
  requireString(canonical.repository, `${prefix}.canonical.repository`);
  requireString(canonical.sourcePath, `${prefix}.canonical.sourcePath`);
  requireString(canonical.route, `${prefix}.canonical.route`);
  if (canonical.repository !== "AtlasReaper311/atlas-systems") {
    fail(`${prefix}.canonical.repository`, "must point to the local public Atlas Systems owner");
  }
  if (canonical.sourcePath.startsWith("/") || PRIVATE_PATH_PATTERN.test(canonical.sourcePath)) {
    fail(`${prefix}.canonical.sourcePath`, "must not expose a private or machine-local path");
  }
  if (!canonical.sourcePath.endsWith("/index.html")) {
    fail(`${prefix}.canonical.sourcePath`, "must identify a canonical route index.html");
  }
  if (!isSafePublicRoute(canonical.route)) {
    fail(`${prefix}.canonical.route`, "must be a safe local public route");
  }
  const routePath = routeFilePath(rootDir, canonical.route);
  if (!existsSync(routePath)) {
    fail(`${prefix}.canonical.route`, "must resolve to an existing local route index.html");
  }
  if (path.relative(path.resolve(rootDir), routePath).startsWith("..")) {
    fail(`${prefix}.canonical.route`, "must stay inside the repository");
  }
  const expectedRoutePath = path.resolve(rootDir, canonical.sourcePath);
  if (routePath !== expectedRoutePath) {
    fail(`${prefix}.canonical`, "route and sourcePath must resolve to the same file");
  }
  if (instrument.id === "atlas-twin-context") {
    if (instrument.claimLanguage !== "could be affected") {
      fail(`${prefix}.claimLanguage`, "must preserve the accepted Twin wording");
    }
    if (instrument.nativeEvidenceModes.length !== 0) {
      fail(`${prefix}.nativeEvidenceModes`, "Twin context is not an incident evidence mode");
    }
  }
}

function validateStage(stage, index, stageMap, instrumentMap) {
  const prefix = `journey.stages[${index}]`;
  requireString(stage?.id, `${prefix}.id`);
  requireString(stage?.label, `${prefix}.label`);
  if (!Number.isInteger(stage?.order)) fail(`${prefix}.order`, "must be an integer");
  requireString(stage?.question, `${prefix}.question`);
  requireArray(stage?.instrumentAssociations, `${prefix}.instrumentAssociations`);
  requireUnique(
    stage.instrumentAssociations.map((association) => association.instrumentId),
    `${prefix}.instrumentAssociations.instrumentId`,
  );
  stage.instrumentAssociations.forEach((association, associationIndex) => {
    const associationPath = `${prefix}.instrumentAssociations[${associationIndex}]`;
    requireString(association?.instrumentId, `${associationPath}.instrumentId`);
    if (!instrumentMap.has(association.instrumentId)) {
      fail(`${associationPath}.instrumentId`, "must reference a canonical instrument");
    }
    requireEnum(association.relationshipType, RELATIONSHIP_TYPES, `${associationPath}.relationshipType`);
    requireBoolean(association.required, `${associationPath}.required`);
    if (instrumentMap.get(association.instrumentId).journeyRole === "cross-cutting" && association.required) {
      fail(`${associationPath}.required`, "cross-cutting instruments cannot be mandatory linear stages");
    }
    if (association.relationshipType === "cross-cutting" && association.required) {
      fail(`${associationPath}.required`, "cross-cutting relationships cannot be mandatory linear stages");
    }
  });
  if (stage.nextStageId !== null && !stageMap.has(stage.nextStageId)) {
    fail(`${prefix}.nextStageId`, "must reference another stage or be null for the final stage");
  }
  if (stage.id === "recovery") {
    const gap = stage.evidenceGap;
    if (!gap || typeof gap !== "object") fail(`${prefix}.evidenceGap`, "must describe the recovery gap");
    requireString(gap.status, `${prefix}.evidenceGap.status`);
    requireString(gap.summary, `${prefix}.evidenceGap.summary`);
    requireStringArray(gap.allowedEvidenceModes, `${prefix}.evidenceGap.allowedEvidenceModes`);
    gap.allowedEvidenceModes.forEach((mode, modeIndex) => {
      requireEnum(mode, ACCEPTED_EVIDENCE_MODES, `${prefix}.evidenceGap.allowedEvidenceModes[${modeIndex}]`);
    });
    requireString(gap.nonClaim, `${prefix}.evidenceGap.nonClaim`);
  }
}

function validateReading(reading, readingPath, relationship) {
  if (!reading || typeof reading !== "object") fail(readingPath, "must be an object");
  requireEnum(reading.evidenceMode, ACCEPTED_EVIDENCE_MODES, `${readingPath}.evidenceMode`);
  requireEnum(reading.sourceType, [...SOURCE_TYPES], `${readingPath}.sourceType`);
  requireString(reading.nativeScenario, `${readingPath}.nativeScenario`);
  requireString(reading.demonstrates, `${readingPath}.demonstrates`);
  requireStringArray(reading.doesNotProve, `${readingPath}.doesNotProve`);
  if (!relationship.evidenceModes.includes(reading.evidenceMode)) {
    fail(`${readingPath}.evidenceMode`, "must be listed on the relationship");
  }

  const mode = reading.evidenceMode;
  const sourceType = reading.sourceType;
  if (sourceType === "synthetic" && mode !== "simulated") {
    fail(`${readingPath}.evidenceMode`, "synthetic readings must be simulated");
  }
  if (sourceType === "recorded" && mode !== "recorded-replay") {
    fail(`${readingPath}.evidenceMode`, "recorded readings must be recorded-replay");
  }
  if (sourceType === "lifecycle-record" && !["recorded-replay", "unknown", "unavailable"].includes(mode)) {
    fail(`${readingPath}.evidenceMode`, "lifecycle records must remain recorded, unknown, or unavailable");
  }
  if (sourceType === "live-public" && !["measured", "stale-measured", "unknown", "unavailable"].includes(mode)) {
    fail(`${readingPath}.evidenceMode`, "live-public readings must retain their current/stale/unknown boundary");
  }
  if (mode === "recorded-replay" && !["recorded", "lifecycle-record"].includes(sourceType)) {
    fail(`${readingPath}.sourceType`, "recorded-replay cannot come from a synthetic or unclassified source");
  }
  if (["measured", "stale-measured"].includes(mode) && sourceType !== "live-public") {
    fail(`${readingPath}.sourceType`, "measured evidence requires a bounded live-public source");
  }
}

function validateScenario(scenario, index, instrumentMap, stageMap) {
  const prefix = `scenarios[${index}]`;
  requireString(scenario?.id, `${prefix}.id`);
  requireString(scenario?.label, `${prefix}.label`);
  requireString(scenario?.question, `${prefix}.question`);
  const boundary = scenario.interpretationBoundary;
  if (!boundary || typeof boundary !== "object") fail(`${prefix}.interpretationBoundary`, "must be an object");
  requireStringArray(boundary.neverMeans, `${prefix}.interpretationBoundary.neverMeans`);
  requireArray(scenario.relationships, `${prefix}.relationships`);
  if (scenario.relationships.length !== instrumentMap.size) {
    fail(`${prefix}.relationships`, "must contain one explicit relationship for every instrument");
  }
  requireUnique(
    scenario.relationships.map((relationship) => relationship.instrumentId),
    `${prefix}.relationships.instrumentId`,
  );

  const normalText = boundary.neverMeans.join(" ").toLowerCase();
  if (scenario.id === "normal-operation" && !normalText.includes("current atlas estate is healthy")) {
    fail(`${prefix}.interpretationBoundary.neverMeans`, "must reject a current-estate-health interpretation");
  }
  const partitionText = boundary.neverMeans.join(" ").toLowerCase();
  if (scenario.id === "network-partition" && !partitionText.includes("real network partition")) {
    fail(`${prefix}.interpretationBoundary.neverMeans`, "must reject a real observed partition interpretation");
  }

  scenario.relationships.forEach((relationship, relationshipIndex) => {
    const relationshipPath = `${prefix}.relationships[${relationshipIndex}]`;
    requireString(relationship?.instrumentId, `${relationshipPath}.instrumentId`);
    if (!instrumentMap.has(relationship.instrumentId)) {
      fail(`${relationshipPath}.instrumentId`, "must reference a canonical instrument");
    }
    requireEnum(relationship.supportType, RELATIONSHIP_TYPES, `${relationshipPath}.supportType`);
    requireArray(relationship.stageIds, `${relationshipPath}.stageIds`);
    relationship.stageIds.forEach((stageId, stageIndex) => {
      if (!stageMap.has(stageId)) fail(`${relationshipPath}.stageIds[${stageIndex}]`, "must reference a journey stage");
    });
    requireUnique(relationship.stageIds, `${relationshipPath}.stageIds`);
    requireStringArray(relationship.evidenceModes, `${relationshipPath}.evidenceModes`);
    requireUnique(relationship.evidenceModes, `${relationshipPath}.evidenceModes`);
    relationship.evidenceModes.forEach((mode, modeIndex) => {
      requireEnum(mode, ACCEPTED_EVIDENCE_MODES, `${relationshipPath}.evidenceModes[${modeIndex}]`);
    });
    requireArray(relationship.readings, `${relationshipPath}.readings`);
    requireString(relationship.proofBoundary, `${relationshipPath}.proofBoundary`);
    requireStringArray(relationship.nonClaims, `${relationshipPath}.nonClaims`);

    if (relationship.supportType === "unsupported") {
      if (relationship.readings.length !== 0) fail(`${relationshipPath}.readings`, "unsupported relationships cannot carry readings");
      requireExactValues(relationship.evidenceModes, ["not-applicable-unscored"], `${relationshipPath}.evidenceModes`);
      requireString(relationship.unsupportedReason, `${relationshipPath}.unsupportedReason`);
    } else {
      if (relationship.readings.length === 0) fail(`${relationshipPath}.readings`, "supported relationships require evidence readings");
      relationship.readings.forEach((reading, readingIndex) => validateReading(reading, `${relationshipPath}.readings[${readingIndex}]`, relationship));
      const readingModes = [...new Set(relationship.readings.map((reading) => reading.evidenceMode))];
      if (readingModes.length !== relationship.evidenceModes.length || readingModes.some((mode) => !relationship.evidenceModes.includes(mode))) {
        fail(`${relationshipPath}.evidenceModes`, "must enumerate the modes carried by its readings");
      }
    }

    if (scenario.id === "normal-operation") {
      const claims = relationship.readings.map((reading) => reading.demonstrates.toLowerCase()).join(" ");
      if (/(?:current atlas estate|estate is healthy|production normality)/.test(claims)) {
        fail(`${relationshipPath}.readings`, "normal-operation cannot claim current estate health");
      }
    }
    if (scenario.id === "network-partition") {
      const claims = relationship.readings.map((reading) => reading.demonstrates.toLowerCase()).join(" ");
      if (/(?:observed atlas|production partition|real atlas network partition|atlas traffic)/.test(claims)) {
        fail(`${relationshipPath}.readings`, "network-partition cannot claim a real observed Atlas partition");
      }
    }
    const instrument = instrumentMap.get(relationship.instrumentId);
    if (instrument.journeyRole === "cross-cutting" && relationship.supportType !== "cross-cutting" && relationship.supportType !== "contextual" && relationship.supportType !== "unsupported") {
      fail(`${relationshipPath}.supportType`, "cross-cutting instruments must remain cross-cutting or contextual");
    }
    if (instrument.id === "atlas-twin-context" && relationship.supportType !== "unsupported") {
      fail(`${relationshipPath}.supportType`, "Twin context cannot become a shared scenario target");
    }
  });
}

function validateNarratives(narratives, scenarioMap, instrumentMap, stageMap) {
  requireArray(narratives, "narratives");
  requireUnique(narratives.map((narrative) => narrative.id), "narratives.id");
  narratives.forEach((narrative, index) => {
    const prefix = `narratives[${index}]`;
    requireString(narrative?.id, `${prefix}.id`);
    requireString(narrative?.label, `${prefix}.label`);
    requireString(narrative?.description, `${prefix}.description`);
    requireArray(narrative.steps, `${prefix}.steps`);
    requireArray(narrative.omittedStageIds, `${prefix}.omittedStageIds`);
    narrative.omittedStageIds.forEach((stageId, stageIndex) => {
      if (!stageMap.has(stageId)) fail(`${prefix}.omittedStageIds[${stageIndex}]`, "must reference a journey stage");
    });
    requireString(narrative.omissionReason, `${prefix}.omissionReason`);
    narrative.steps.forEach((step, stepIndex) => {
      const stepPath = `${prefix}.steps[${stepIndex}]`;
      requireString(step?.stageId, `${stepPath}.stageId`);
      requireString(step?.scenarioId, `${stepPath}.scenarioId`);
      requireString(step?.instrumentId, `${stepPath}.instrumentId`);
      requireEnum(step.supportType, RELATIONSHIP_TYPES, `${stepPath}.supportType`);
      requireBoolean(step.required, `${stepPath}.required`);
      if (!stageMap.has(step.stageId)) fail(`${stepPath}.stageId`, "must reference a journey stage");
      if (!scenarioMap.has(step.scenarioId)) fail(`${stepPath}.scenarioId`, "must reference a scenario");
      if (!instrumentMap.has(step.instrumentId)) fail(`${stepPath}.instrumentId`, "must reference an instrument");
      const relationship = scenarioMap
        .get(step.scenarioId)
        .relationships.find((candidate) => candidate.instrumentId === step.instrumentId);
      if (!relationship || relationship.supportType !== step.supportType || !relationship.stageIds.includes(step.stageId)) {
        fail(stepPath, "must reference the matching scenario/instrument relationship and stage");
      }
      if (instrumentMap.get(step.instrumentId).journeyRole === "cross-cutting" && step.required) {
        fail(`${stepPath}.required`, "cross-cutting narrative steps cannot be mandatory");
      }
      if (!step.required) requireString(step.qualification, `${stepPath}.qualification`);
    });
  });
}

export function validateFailureLaboratoryModel(model, { rootDir = fileURLToPath(new URL("../", import.meta.url)) } = {}) {
  if (!model || typeof model !== "object") fail("model", "must be an object");
  if (model.schema !== MODEL_SCHEMA) fail("model.schema", `must be ${MODEL_SCHEMA}`);
  if (model.version !== 1) fail("model.version", "must be 1");
  requireString(model.purpose, "model.purpose");
  const authority = model.authority;
  if (!authority || typeof authority !== "object") fail("model.authority", "must be an object");
  requireString(authority.architectureDocument, "model.authority.architectureDocument");
  requireString(authority.owner, "model.authority.owner");
  requireString(authority.futureRoute, "model.authority.futureRoute");
  if (!isSafePublicRoute(authority.futureRoute)) {
    fail("model.authority.futureRoute", "must be a safe reserved local public route");
  }
  if (authority.futureRouteStatus !== "reserved-not-implemented") {
    fail("model.authority.futureRouteStatus", "must keep the public Failure Laboratory route unimplemented");
  }
  if (existsSync(routeFilePath(rootDir, authority.futureRoute))) {
    fail("model.authority.futureRoute", "must not have a public route implementation in this issue");
  }

  requireExactValues(model.evidenceModes, ACCEPTED_EVIDENCE_MODES, "model.evidenceModes");
  requireExactValues(model.relationshipTypes, RELATIONSHIP_TYPES, "model.relationshipTypes");

  requireArray(model.instruments, "instruments");
  requireUnique(model.instruments.map((instrument) => instrument.id), "instruments.id");
  const instrumentMap = new Map(model.instruments.map((instrument) => [instrument.id, instrument]));
  model.instruments.forEach((instrument, index) => validateInstrument(instrument, index, rootDir));
  if (instrumentMap.has("atlas-motion") || [...instrumentMap.keys()].some((id) => id.includes("motion"))) {
    fail("instruments", "Atlas Motion cannot be a Phase 3 instrument");
  }

  const journey = model.journey;
  if (!journey || typeof journey !== "object") fail("journey", "must be an object");
  requireExactValues(journey.sequence, STAGE_IDS, "journey.sequence");
  requireArray(journey.stages, "journey.stages");
  requireUnique(journey.stages.map((stage) => stage.id), "journey.stages.id");
  const stageMap = new Map(journey.stages.map((stage) => [stage.id, stage]));
  requireExactValues([...stageMap.keys()], STAGE_IDS, "journey.stages.id");
  journey.stages.forEach((stage, index) => validateStage(stage, index, stageMap, instrumentMap));
  journey.stages.forEach((stage, index) => {
    if (stage.order !== index + 1) fail(`journey.stages[${index}].order`, "must be deterministic and contiguous");
    const expectedNext = index === journey.stages.length - 1 ? null : journey.stages[index + 1].id;
    if (stage.nextStageId !== expectedNext) fail(`journey.stages[${index}].nextStageId`, "must follow the declared sequence");
  });

  requireArray(model.scenarios, "scenarios");
  requireExactValues(model.scenarios.map((scenario) => scenario.id), SCENARIO_IDS, "scenarios.id");
  requireUnique(model.scenarios.map((scenario) => scenario.id), "scenarios.id");
  const scenarioMap = new Map(model.scenarios.map((scenario) => [scenario.id, scenario]));
  model.scenarios.forEach((scenario, index) => validateScenario(scenario, index, instrumentMap, stageMap));

  validateNarratives(model.narratives, scenarioMap, instrumentMap, stageMap);

  const constraints = model.constraints;
  if (!constraints || typeof constraints !== "object") fail("constraints", "must be an object");
  if (constraints.scenarioLabelsAreContextOnly !== true) fail("constraints.scenarioLabelsAreContextOnly", "must remain true");
  if (constraints.crossCuttingInstrumentsAreNotLinearStages !== true) fail("constraints.crossCuttingInstrumentsAreNotLinearStages", "must remain true");
  if (constraints.twinImpactClaim !== "could be affected") fail("constraints.twinImpactClaim", "must preserve the accepted Twin wording");
  if (constraints.twinImpactIsNotIncidentEvidence !== true) fail("constraints.twinImpactIsNotIncidentEvidence", "must remain true");
  if (!constraints.atlasMotion || constraints.atlasMotion.participation !== "excluded" || constraints.atlasMotion.requiredJourneyInstrument !== false || constraints.atlasMotion.sharedScenarioTarget !== false || constraints.atlasMotion.dependency !== false) {
    fail("constraints.atlasMotion", "must exclude Atlas Motion from Phase 3 participation");
  }
  if (!constraints.recovery || constraints.recovery.singleAuthoritativeInstrument !== null) {
    fail("constraints.recovery.singleAuthoritativeInstrument", "must preserve the current Recovery Evidence gap");
  }
  requireStringArray(constraints.prohibitedClaims, "constraints.prohibitedClaims");

  return model;
}

export function validateLoadedFailureLaboratoryModel(options) {
  const model = loadFailureLaboratoryModel(options?.modelPath ?? MODEL_PATH);
  return validateFailureLaboratoryModel(model, options);
}
