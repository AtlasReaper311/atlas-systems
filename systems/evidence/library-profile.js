import { latestObservedStage, projectChangeChain, RESULT } from "./change-chain.js";
import { LIBRARY_TOOLKIT_PROFILE } from "./estate-profile.js";
import { LIBRARY_SPECIMEN_RECORD } from "./library-specimen.js";
import { presentLifecycleProfile } from "./lifecycle-profile.js";

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

export function libraryToolkitProjectionProfile(record = {}) {
  const releaseContract = record.releaseContract === true;
  const presentation = presentLifecycleProfile("library-toolkit", { releaseContract });
  return Object.freeze({
    id: LIBRARY_TOOLKIT_PROFILE.id,
    authority: LIBRARY_TOOLKIT_PROFILE.authority,
    subjectType: LIBRARY_TOOLKIT_PROFILE.subjectType,
    notApplicableStages: presentation.notApplicableStages,
    releaseContract,
  });
}

export function projectLibrarySpecimen(record = LIBRARY_SPECIMEN_RECORD) {
  return projectChangeChain(record, libraryToolkitProjectionProfile(record));
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
    releaseContract: true,
  });
}
