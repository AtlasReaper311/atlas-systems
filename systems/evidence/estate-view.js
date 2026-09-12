import { RESULT } from "./change-chain.js";
import {
  ESTATE_TOPOLOGY_URL,
  estateProfileGroups,
  estateViewStatus,
  parseEvidenceView,
  projectEstateView,
  topologyRecordFromSettled,
} from "./estate-profile.js";
import {
  bindLadderKeyboard,
  claimElementId,
  focusClaimControl,
  parseEvidenceClaim,
  projectEvidenceDetail,
  renderAnswerFirst,
  renderEvidenceDetail,
  renderExpectedPath,
  renderLadderItem,
  renderProfileIdentity,
} from "./evidence-detail.js";
import { libraryStageLabel } from "./library-profile.js";
import { projectProfileIdentity } from "./lifecycle-profile.js";
import { isPublicSafeHref } from "./public-safe-href.js";

const FETCH_TIMEOUT_MS = 6000;
const ESTATE_COLUMNS = 5;
const byId = (id) => document.getElementById(id);

function appendText(parent, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

function resultLabel(result) {
  return result === RESULT.OBSERVED ? "Observed" : result;
}

function safeLink(url, label) {
  if (!isPublicSafeHref(url)) return null;
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = label;
  return link;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

function renderReading(reading) {
  const list = byId("estate-reading");
  if (!list) return;
  list.replaceChildren();
  for (const line of reading.lines) {
    const item = document.createElement("li");
    item.className = `systems-change-reading-line systems-change-reading-line--${line.kind}`;
    item.dataset.result = line.result;
    const label = document.createElement("span");
    label.textContent = `${line.label}: `;
    const value = document.createElement("strong");
    value.textContent = resultLabel(line.result);
    item.append(label, value);
    if (line.scope) appendText(item, "p", "systems-change-scope", line.scope);
    list.appendChild(item);
  }
}

function renderSummary(projection) {
  const roster = projection.reading.lines.find((line) => line.label === "Public topology roster");
  const next = projection.reading.lines.find((line) => line.label === "Proven ADR-0013 delivery stage");
  renderAnswerFirst(byId("estate-summary"), {
    proven: roster
      ? `Public topology roster — ${roster.result}`
      : "No public topology roster",
    provenResult: roster?.result ?? RESULT.UNKNOWN_NOT_OBSERVED,
    nextGap: next ? `${next.label} — ${next.result}` : "Estate-wide delivery snapshot — UNKNOWN / NOT OBSERVED",
    nextGapResult: next?.result ?? RESULT.UNKNOWN_NOT_OBSERVED,
    evidence: "Live public topology",
  });
}

function cell(text, label) {
  const td = document.createElement("td");
  td.textContent = text;
  if (label) td.dataset.label = label;
  return td;
}

function subjectCell(subject) {
  const td = document.createElement("td");
  td.dataset.label = "Subject";
  const name = document.createElement("strong");
  name.textContent = subject.id;
  td.appendChild(name);
  if (subject.repository) {
    appendText(td, "span", "systems-estate-repo", subject.repository);
  }
  return td;
}

function renderSubjectRow(subject, selected) {
  const row = document.createElement("tr");
  row.dataset.result = subject.latestProvenResult;
  row.dataset.profile = subject.profile.id;
  row.dataset.claim = subject.id;
  row.dataset.selected = String(selected);
  row.id = claimElementId(subject.id, "estate");
  if (typeof row.setAttribute === "function") {
    row.setAttribute("tabindex", selected ? "0" : "-1");
    row.setAttribute("aria-selected", String(selected));
  }
  row.append(
    subjectCell(subject),
    cell(subject.profile.label ?? subject.profile.id, "Profile"),
    cell(subject.latestProvenStage ?? "UNKNOWN / NOT OBSERVED", "Latest proven"),
    cell(resultLabel(subject.latestProvenResult), "Result"),
    cell(subject.nextApplicableMissing ?? "none remaining", "Next gap"),
  );
  return row;
}

function emptyRow(message) {
  const row = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = ESTATE_COLUMNS;
  td.textContent = message;
  row.appendChild(td);
  return row;
}

function visibleSubjects(projection, profileId) {
  if (!profileId) return projection.subjects;
  return projection.subjects.filter((subject) => subject.profile.id === profileId);
}

function renderProfileOverview(projection, selectedProfile) {
  const target = byId("estate-profiles");
  if (!target) return;
  target.replaceChildren();
  const groups = estateProfileGroups(projection.subjects);
  if (!groups.length) {
    appendText(target, "p", "systems-change-scope", "No ADR-0014 profile groups are available from the current public topology projection.");
    return;
  }
  const all = document.createElement("button");
  all.type = "button";
  all.className = "systems-evidence-profile-card";
  all.dataset.profile = "";
  all.setAttribute("aria-pressed", String(!selectedProfile));
  appendText(all, "span", null, "All subjects");
  appendText(all, "strong", null, `${projection.subjectCount} subject${projection.subjectCount === 1 ? "" : "s"}`);
  target.appendChild(all);
  for (const group of groups) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "systems-evidence-profile-card";
    card.dataset.profile = group.id;
    card.setAttribute("aria-pressed", String(selectedProfile === group.id));
    appendText(card, "span", null, group.label);
    appendText(card, "strong", null, `${group.count} subject${group.count === 1 ? "" : "s"}`);
    target.appendChild(card);
  }
}

function renderRows(projection, selectedId, profileId = null) {
  const body = byId("estate-rows");
  if (!body) return;
  body.replaceChildren();
  if (projection.fetchFailed) {
    body.appendChild(emptyRow(
      "The public topology source was contacted and did not return a usable roster. FAILED is distinct from UNKNOWN / NOT OBSERVED. Missing delivery evidence is not inferred.",
    ));
    return;
  }
  if (projection.malformed) {
    body.appendChild(emptyRow(
      "The public topology response did not match atlas-public-topology/v3. Malformed estate data fails closed as UNKNOWN / NOT OBSERVED and is not a healthy fleet.",
    ));
    return;
  }
  const subjects = visibleSubjects(projection, profileId);
  if (!subjects.length) {
    body.appendChild(emptyRow(
      profileId
        ? "No public topology subjects match the selected ADR-0014 profile. The complete roster remains available."
        : "Public topology returned no usable subjects. Empty evidence is not a complete estate.",
    ));
    return;
  }
  for (const subject of subjects) {
    body.appendChild(renderSubjectRow(subject, subject.id === selectedId));
  }
}

function selectedSpecimenStage(subject, requested) {
  if (!subject?.stages?.length) return null;
  if (requested && subject.stages.some((stage) => stage.stage === requested)) return requested;
  if (subject.latestProvenStage) return subject.latestProvenStage;
  return subject.stages[0].stage;
}

export function detailForEstateSubject(projection, subjectId, stageName = null) {
  const subject = projection.subjects.find((item) => item.id === subjectId) ?? projection.subjects[0];
  if (!subject) {
    return projectEvidenceDetail({
      view: "estate",
      subject: { label: "Estate roster" },
      stage: "Public topology roster",
      result: projection.fetchFailed ? RESULT.FAILED : RESULT.UNKNOWN_NOT_OBSERVED,
      evidenceType: "live-public-projection",
      classification: projection.classification,
      scope: projection.fetchFailed
        ? "GET /v1/topology was contacted and did not return a usable roster."
        : "No usable public topology subject is selected.",
      nextGap: {
        label: "Proven ADR-0013 delivery stage",
        result: RESULT.UNKNOWN_NOT_OBSERVED,
      },
    });
  }
  if (subject.specimen) {
    const selected = selectedSpecimenStage(subject, stageName);
    const stage = subject.stages.find((item) => item.stage === selected) ?? subject.stages[0];
    const domain = subject.domainLabels?.[stage.stage];
    return projectEvidenceDetail({
      view: "estate",
      subject: {
        id: subject.id,
        repository: subject.repository,
        label: subject.repository ? `${subject.id} (${subject.repository})` : subject.id,
      },
      assertion: domain
        ? `${stage.stage} (${domain}) for ${subject.id}`
        : `${stage.stage} for ${subject.id}`,
      stage: stage.stage,
      result: stage.result,
      evidenceType: subject.evidenceKind ?? "recorded-public-projection",
      classification: subject.specimen.classification,
      identifier: stage.identifier,
      observedAt: stage.observedAt,
      recordedAt: subject.specimen.recordedAt,
      provenance: stage.provenance,
      scope: stage.scope ?? stage.gap,
      evidenceMode: stage.evidenceMode,
      sourceUrl: stage.sourceUrl,
      nextGap: subject.specimen.nextGap,
    });
  }
  const classification = subject.classification;
  const na = subject.notApplicableStages.length
    ? `Not applicable: ${subject.notApplicableStages.join(", ")}.`
    : "No profile-driven NOT APPLICABLE stages.";
  return projectEvidenceDetail({
    view: "estate",
    subject: {
      id: subject.id,
      repository: subject.repository,
      label: subject.repository ? `${subject.id} (${subject.repository})` : subject.id,
    },
    assertion: `Public topology classification for ${subject.id}`,
    stage: subject.latestProvenStage ?? "No proven ADR-0013 stage",
    result: subject.latestProvenResult,
    evidenceType: "live-public-projection",
    classification: projection.classification,
    identifier: subject.id,
    observedAt: subject.observedAt,
    provenance: `GET /v1/topology; ${subject.profile.authority} ${subject.profile.id}; ${classification.provenance ?? "provenance not supplied"}`,
    scope: `${classification.gap ?? ""} Classification lifecycle ${classification.lifecycle ?? "unknown"}, scope ${classification.scope ?? "unknown"}, runtime_service ${classification.runtimeService === null ? "not supplied" : String(classification.runtimeService)}. ${na}`,
    evidenceMode: classification.evidenceMode,
    sourceUrl: subject.sourceUrl ?? subject.repositoryUrl,
    nextGap: subject.nextApplicableMissing
      ? {
        label: subject.nextApplicableMissing,
        result: RESULT.UNKNOWN_NOT_OBSERVED,
        scope: "Public topology and classification are not a delivery chain.",
      }
      : {
        label: "Estate-wide delivery snapshot",
        result: RESULT.UNKNOWN_NOT_OBSERVED,
      },
  });
}

function renderSelectedProfile(projection, selectedId) {
  const subject = projection.subjects.find((item) => item.id === selectedId) ?? projection.subjects[0];
  if (!subject) {
    renderProfileIdentity(byId("estate-subject-profile"), projectProfileIdentity({
      subject: "Estate roster",
      profileId: "unknown-subject",
      classificationNote: "No usable public topology subject is selected. Classification is not delivery.",
    }));
    renderExpectedPath(byId("estate-expected-path"), []);
    return;
  }
  renderProfileIdentity(byId("estate-subject-profile"), projectProfileIdentity({
    subject: subject.repository ? `${subject.id} (${subject.repository})` : subject.id,
    profileId: subject.profile.id,
    releaseContract: Boolean(subject.specimen),
    classificationNote: subject.specimen
      ? "Recorded public-safe release specimen. This subject ships as a GitHub Release artifact, not a runtime service. RELEASED event maps to DEPLOYMENT OBSERVED. RELEASED identity maps to DEPLOYED. Topology classification is not that recorded release chain."
      : subject.profile.id === "library-toolkit"
        ? "Public topology classification is not ADR-0013 delivery evidence. This Library / Toolkit subject has no established release contract, so DEPLOYMENT OBSERVED and DEPLOYED are NOT APPLICABLE. RUNTIME VERIFIED and LIVE VERIFIED cannot apply."
        : "Public topology classification is not ADR-0013 delivery evidence. Applicable later stages stay UNKNOWN / NOT OBSERVED until a named public contract proves them.",
  }));
  if (subject.specimen) {
    renderSpecimenPath(byId("estate-expected-path"), subject, selectedSpecimenStage(subject));
    return;
  }
  renderExpectedPath(byId("estate-expected-path"), subject.stages);
}

function renderSpecimenPath(target, subject, selectedStage) {
  if (!target) return;
  target.replaceChildren();
  target.className = "systems-change-chain systems-evidence-ladder systems-evidence-chain systems-evidence-expected-path";
  if (typeof target.setAttribute === "function") target.setAttribute("role", "list");
  for (const stage of subject.stages) {
    target.appendChild(renderLadderItem({
      id: stage.stage,
      label: libraryStageLabel(stage.stage),
      result: stage.result,
      elementId: claimElementId(stage.stage, "estate"),
    }, {
      selected: stage.stage === selectedStage,
      controlsId: "estate-detail",
    }));
  }
}

function renderSecondary(projection, selectedId) {
  const node = byId("estate-secondary");
  if (!node) return;
  node.replaceChildren();
  const subject = projection.subjects.find((item) => item.id === selectedId) ?? projection.subjects[0];
  if (!subject) {
    appendText(node, "p", null, "Secondary classification fields appear when a subject can be inspected.");
    return;
  }
  const facts = document.createElement("dl");
  facts.className = "systems-evidence-detail-facts";
  const rows = [
    ["Classification lifecycle", subject.classification.lifecycle ?? "not supplied"],
    ["Classification scope", subject.classification.scope ?? "not supplied"],
    ["Runtime service flag", subject.classification.runtimeService === null ? "not supplied" : String(subject.classification.runtimeService)],
    ["Kind / layer", `${subject.kind} · ${subject.layer}`],
    ["Not applicable stages", subject.notApplicableStages.length ? subject.notApplicableStages.join(", ") : "none"],
    ["Profile chosen from", subject.profile.chosenFrom ?? subject.profile.id],
    ["Observed at", subject.observedAt ?? "timestamp unavailable"],
    ["Shipping model", subject.specimen
      ? "Source plus optional GitHub Release artifact. Not loaded by consumers at runtime and not a package-registry publication."
      : null],
    ["RELEASED event mapping", subject.domainLabels?.["DEPLOYMENT OBSERVED"]
      ? `${subject.domainLabels["DEPLOYMENT OBSERVED"]} maps onto DEPLOYMENT OBSERVED. It is not an estate-wide stage.`
      : null],
    ["RELEASED identity mapping", subject.domainLabels?.DEPLOYED
      ? `${subject.domainLabels.DEPLOYED} maps onto DEPLOYED. A GitHub Release is not a running deployment.`
      : null],
    ["Recorded specimen", subject.specimen
      ? `Recorded at ${subject.specimen.recordedAt ?? "time unavailable"}; not a live feed.`
      : null],
  ].filter(([, value]) => value);
  for (const [term, value] of rows) {
    const wrap = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = value;
    wrap.append(dt, dd);
    facts.appendChild(wrap);
  }
  node.appendChild(facts);
  const link = safeLink(subject.repositoryUrl, "Open public source");
  if (link) {
    link.className = "systems-estate-source";
    node.appendChild(link);
  }
}

function renderProvenance(projection) {
  const source = byId("source-estate-view");
  if (source) {
    const age = projection.generatedAt ? `observed ${projection.generatedAt}` : "observation time unavailable";
    const authority = projection.classificationAuthority ?? "classification authority unavailable";
    source.textContent = `${projection.classification}; live public topology; ${age}; ${projection.subjectCount} subjects; authority ${authority}. Roster size is not health.`;
  }
  const note = byId("estate-provenance");
  if (!note) return;
  note.replaceChildren();
  appendText(
    note,
    "p",
    null,
    "This Estate View reads the current public topology projection. Atlas Infra remains classification authority. Topology lifecycle is not ADR-0013 delivery, not deployment, not runtime, and not live verification. There is no public estate-wide delivery snapshot on this path. atlas-interface-kit carries a recorded Library / Toolkit release specimen when selected; that recorded chain is not a live feed and is not estate-wide delivery. Other Library / Toolkit subjects without an established release contract mark DEPLOYMENT OBSERVED and DEPLOYED as NOT APPLICABLE. Other subjects keep later applicable stages UNKNOWN / NOT OBSERVED unless a named public contract proves them. Investigate a named change in Change View or a named Worker in Service View.",
  );
  const from = document.createElement("ul");
  from.className = "systems-change-sources systems-estate-sources";
  for (const item of projection.recordedFrom) {
    const entry = document.createElement("li");
    const link = safeLink(item, item);
    if (link) {
      link.className = "systems-estate-source";
      entry.appendChild(link);
    } else {
      entry.textContent = item;
    }
    from.appendChild(entry);
  }
  note.appendChild(from);
}

function renderStatus(projection) {
  const status = byId("estate-view-status");
  if (!status) return;
  const state = estateViewStatus(projection);
  status.dataset.state = state;
  if (state === "failure") {
    status.textContent = "Public topology for the estate roster FAILED. FAILED is distinct from UNKNOWN / NOT OBSERVED. Missing delivery stages are not success.";
    return;
  }
  if (projection.malformed) {
    status.textContent = "Public topology was malformed. The estate roster remains UNKNOWN / NOT OBSERVED and is not a healthy fleet.";
    return;
  }
  status.textContent = `Public topology roster for ${projection.subjectCount} subject${projection.subjectCount === 1 ? "" : "s"}. Classification is not delivery. Missing ADR-0013 stages remain UNKNOWN / NOT OBSERVED. This is not an estate health badge.`;
}

function selectedSubjectId(projection, requested) {
  if (requested && projection.subjects.some((subject) => subject.id === requested)) return requested;
  return projection.subjects[0]?.id ?? null;
}

function bindEstateRoster(projection) {
  const body = byId("estate-rows");
  const profiles = byId("estate-profiles");
  const path = byId("estate-expected-path");
  if (!body || typeof body.addEventListener !== "function") return;
  if (body.dataset.ladderBound === "true") return;
  body.dataset.ladderBound = "true";
  const names = projection.subjects.map((subject) => subject.id);
  let selectedProfile = null;
  let selectedStage = null;
  const paint = (claim, profileId = selectedProfile, persistFocus = true, stageName = selectedStage) => {
    selectedProfile = profileId || null;
    const visible = visibleSubjects(projection, selectedProfile);
    const next = visible.some((subject) => subject.id === claim)
      ? claim
      : selectedSubjectId({ subjects: visible }, claim);
    const subject = projection.subjects.find((item) => item.id === next) ?? null;
    selectedStage = subject?.specimen ? selectedSpecimenStage(subject, stageName) : null;
    renderProfileOverview(projection, selectedProfile);
    renderRows(projection, next, selectedProfile);
    renderEvidenceDetail(byId("estate-detail"), detailForEstateSubject(projection, next, selectedStage), {
      titleId: "estate-detail-title",
      siblingIdentifiers: [
        ...projection.subjects.map((item) => item.identifier ?? item.id),
        ...(subject?.stages ?? []).map((stage) => stage.identifier),
      ].filter(Boolean),
    });
    renderSelectedProfile(projection, next);
    if (subject?.specimen) {
      renderSpecimenPath(path, subject, selectedStage);
    }
    renderSecondary(projection, next);
    if (persistFocus) {
      if (subject?.specimen && path) focusClaimControl(path, selectedStage);
      else focusClaimControl(body, next);
    }
  };
  const select = (claim) => {
    if (!claim) return;
    selectedStage = null;
    paint(claim, selectedProfile, true, null);
  };
  body.addEventListener("click", (event) => {
    const row = event.target?.closest?.("tr[data-claim]");
    if (!row || !body.contains(row)) return;
    select(row.dataset.claim);
  });
  path?.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-claim]");
    if (!button || !path.contains(button)) return;
    const current = body.querySelector?.('tr[data-selected="true"]')?.dataset?.claim
      ?? selectedSubjectId(projection);
    paint(current, selectedProfile, true, button.dataset.claim);
  });
  profiles?.addEventListener("click", (event) => {
    const card = event.target?.closest?.("[data-profile]");
    if (!card || !profiles.contains(card)) return;
    const nextProfile = card.dataset.profile || null;
    const visible = visibleSubjects(projection, nextProfile);
    selectedStage = null;
    paint(visible[0]?.id ?? selectedSubjectId(projection), nextProfile, false, null);
  });
  bindLadderKeyboard(body, (claim) => select(claim));
  if (path) bindLadderKeyboard(path, (claim) => {
    const current = body.querySelector?.('tr[data-selected="true"]')?.dataset?.claim
      ?? selectedSubjectId(projection);
    paint(current, selectedProfile, true, claim);
  });
  if (typeof window !== "undefined") {
    window.addEventListener("popstate", () => {
      if (parseEvidenceView(window.location) !== "estate") return;
      const claim = parseEvidenceClaim(window.location, names, names[0] ?? null);
      select(claim);
    });
  }
}

function hideLibraryFallback() {
  const fallback = byId("estate-library-fallback");
  if (!fallback) return;
  fallback.hidden = true;
  const specimen = typeof fallback.querySelector === "function"
    ? fallback.querySelector("#claim-estate-deployed")
    : null;
  if (specimen && typeof specimen.removeAttribute === "function") specimen.removeAttribute("id");
}

export function renderEstateView(record, options = {}) {
  const projection = projectEstateView(record);
  hideLibraryFallback();
  renderReading(projection.reading);
  renderSummary(projection);
  const requested = options.claim
    ?? parseEvidenceClaim(
      options.location ?? (typeof window !== "undefined" ? window.location : {}),
      projection.subjects.map((subject) => subject.id),
      projection.subjects[0]?.id ?? null,
    );
  const selected = selectedSubjectId(projection, requested);
  renderProfileOverview(projection, null);
  renderRows(projection, selected, null);
  renderEvidenceDetail(byId("estate-detail"), detailForEstateSubject(projection, selected), {
    titleId: "estate-detail-title",
    siblingIdentifiers: projection.subjects.map((subject) => subject.identifier ?? subject.id).filter(Boolean),
  });
  renderSelectedProfile(projection, selected);
  renderSecondary(projection, selected);
  renderProvenance(projection);
  renderStatus(projection);
  if (options.bind !== false) bindEstateRoster(projection);
  return projection;
}

export async function loadEstateView(fetchImpl = fetchJson) {
  const topology = await Promise.allSettled([fetchImpl(ESTATE_TOPOLOGY_URL)]).then((results) => results[0]);
  return renderEstateView(topologyRecordFromSettled(topology));
}

if (typeof window !== "undefined" && window.document) {
  loadEstateView().catch(() => {
    const status = byId("estate-view-status");
    if (!status) return;
    status.dataset.state = "failure";
    status.textContent = "The Estate View could not load public topology. FAILED is distinct from UNKNOWN / NOT OBSERVED.";
    renderEstateView({ fetchFailed: true, components: [] });
  });
}
