import { latestObservedStage, projectChangeChain, RESULT } from "./change-chain.js";
import { LIBRARY_TOOLKIT_PROFILE } from "./estate-profile.js";
import { LIBRARY_SPECIMEN_RECORD } from "./library-specimen.js";

export const LIBRARY_SPECIMEN_SUBJECT_ID = "atlas-interface-kit";
export const LIBRARY_SPECIMEN_REPOSITORY = "AtlasReaper311/atlas-interface-kit";

export const LIBRARY_RELEASE_DOMAIN_LABELS = Object.freeze({
  "DEPLOYMENT OBSERVED": "RELEASED event",
  DEPLOYED: "RELEASED identity",
});

export function isLibrarySpecimenSubject(subject = {}) {
  const id = String(subject.id ?? "").trim();
  const repository = String(subject.repository ?? "").trim();
  const repoName = String(subject.repo_name ?? "").trim();
  return id === LIBRARY_SPECIMEN_SUBJECT_ID
    || repository === LIBRARY_SPECIMEN_REPOSITORY
    || repoName === LIBRARY_SPECIMEN_SUBJECT_ID;
}

export function projectLibrarySpecimen(record = LIBRARY_SPECIMEN_RECORD) {
  return projectChangeChain(record, LIBRARY_TOOLKIT_PROFILE);
}

export function libraryStageLabel(stage) {
  const domain = LIBRARY_RELEASE_DOMAIN_LABELS[stage];
  return domain ? `${stage} · ${domain}` : stage;
}

export function attachLibrarySpecimen(subject, record = LIBRARY_SPECIMEN_RECORD) {
  if (!isLibrarySpecimenSubject(subject)) return subject;
  const chain = projectLibrarySpecimen(record);
  const proven = latestObservedStage(chain.stages);
  const provenStage = proven
    ? chain.stages.find((stage) => stage.stage === proven) ?? null
    : null;
  const next = chain.nextGap;
  return Object.freeze({
    ...subject,
    stages: chain.stages,
    latestProvenStage: proven,
    latestProvenResult: provenStage?.result ?? RESULT.UNKNOWN_NOT_OBSERVED,
    nextApplicableMissing: next?.label ?? null,
    specimen: chain,
    evidenceKind: chain.classification,
    domainLabels: LIBRARY_RELEASE_DOMAIN_LABELS,
  });
}
