import { projectChangeChain } from "./change-chain.js";
import { ARTICLE_SPECIMEN_RECORD } from "./article-specimen.js";
import { presentLifecycleProfile } from "./lifecycle-profile.js";

export const ARTICLE_SPECIMEN_SUBJECT_ID = "specular-core-architectural-recovery";
export const CHANGE_SITE_SUBJECT_ID = "atlas-systems-256";
export const DEFAULT_CHANGE_SUBJECT = CHANGE_SITE_SUBJECT_ID;

export const ARTICLE_PUBLICATION_PROFILE = Object.freeze({
  id: "article-publication",
  authority: "ADR-0014",
  subjectType: "published writing article",
  notApplicableStages: Object.freeze(["RUNTIME VERIFIED"]),
});

export const ARTICLE_DOMAIN_LABELS = Object.freeze({
  SOURCE: "AUTHORED",
  CHECKED: "VALIDATED",
  MERGED: "SCHEDULED",
  "DEPLOYMENT OBSERVED": "SCHEDULER EXECUTED",
  DEPLOYED: "published writing identity",
});

export const CHANGE_SUBJECTS = Object.freeze([
  Object.freeze({
    id: CHANGE_SITE_SUBJECT_ID,
    label: "AtlasReaper311/atlas-systems#256",
    profileId: "static-public-site",
    profileLabel: "Static / Public Site",
    defaultClaim: "MERGED",
  }),
  Object.freeze({
    id: ARTICLE_SPECIMEN_SUBJECT_ID,
    label: "W-08 SPECULAR-CORE: Architectural Recovery",
    profileId: "article-publication",
    profileLabel: "Article Publication",
    defaultClaim: "DEPLOYED",
  }),
]);

export function isArticleSpecimenSubject(subject = {}) {
  const id = String(subject.id ?? subject.slug ?? "").trim();
  return id === ARTICLE_SPECIMEN_SUBJECT_ID;
}

export function articlePublicationProjectionProfile() {
  const presentation = presentLifecycleProfile("article-publication");
  return Object.freeze({
    id: ARTICLE_PUBLICATION_PROFILE.id,
    authority: ARTICLE_PUBLICATION_PROFILE.authority,
    subjectType: ARTICLE_PUBLICATION_PROFILE.subjectType,
    notApplicableStages: presentation.notApplicableStages,
  });
}

export function projectArticleSpecimen(record = ARTICLE_SPECIMEN_RECORD) {
  const chain = projectChangeChain(record, articlePublicationProjectionProfile());
  return Object.freeze({
    ...chain,
    domainLabels: ARTICLE_DOMAIN_LABELS,
  });
}

export function articleStageLabel(stage) {
  const domain = ARTICLE_DOMAIN_LABELS[stage];
  return domain ? `${stage} · ${domain}` : stage;
}

export function parseEvidenceSubject(locationLike = {}, allowed = [], fallback = DEFAULT_CHANGE_SUBJECT) {
  const names = Array.isArray(allowed) ? allowed.map((item) => String(item)) : [];
  const searchValue = locationLike.search ?? "";
  const search = new URLSearchParams(
    String(searchValue).startsWith("?") ? String(searchValue).slice(1) : String(searchValue),
  );
  const fromQuery = String(search.get("subject") ?? "").trim();
  if (fromQuery && names.includes(fromQuery)) return fromQuery;
  return names.includes(fallback) ? fallback : (names[0] ?? fallback);
}

export function changeSubjectCatalog() {
  return CHANGE_SUBJECTS;
}
