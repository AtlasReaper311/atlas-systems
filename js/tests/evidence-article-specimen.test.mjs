import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { DELIVERY_STAGES, RESULT } from "../../systems/evidence/change-chain.js";
import {
  ARTICLE_DOMAIN_LABELS,
  ARTICLE_SPECIMEN_SUBJECT_ID,
  articleStageLabel,
  parseEvidenceSubject,
  projectArticleSpecimen,
} from "../../systems/evidence/article-profile.js";
import { ARTICLE_SPECIMEN_RECORD } from "../../systems/evidence/article-specimen.js";
import { detailForChangeStage, renderChangeView } from "../../systems/evidence/change-view.js";
import { presentLifecycleProfile, projectLifecycleStages } from "../../systems/evidence/lifecycle-profile.js";

const NOW_RECORD = "2026-09-12T15:31:00Z";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function stageMap(stages) {
  return Object.fromEntries(stages.map((stage) => [stage.stage, stage]));
}

test("Article specimen keeps ADR-0013 order and maps publication labels", () => {
  const chain = projectArticleSpecimen();
  const stages = stageMap(chain.stages);
  assert.deepEqual(chain.stages.map((stage) => stage.stage), [...DELIVERY_STAGES]);
  assert.equal(chain.liveFeed, false);
  assert.equal(chain.profile.id, "article-publication");
  assert.equal(stages.SOURCE.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages.CHECKED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages.MERGED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages["DEPLOYMENT OBSERVED"].result, RESULT.OBSERVED);
  assert.equal(stages.DEPLOYED.result, RESULT.OBSERVED);
  assert.equal(stages["RUNTIME VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(stages["LIVE VERIFIED"].result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.match(stages["DEPLOYMENT OBSERVED"].scope, /SCHEDULER EXECUTED/);
  assert.match(stages.DEPLOYED.scope, /published-source identity/);
  assert.equal(ARTICLE_DOMAIN_LABELS["DEPLOYMENT OBSERVED"], "SCHEDULER EXECUTED");
  assert.equal(articleStageLabel("MERGED"), "MERGED · SCHEDULED");
  assert.equal(chain.nextGap.label, "SOURCE");
  assert.equal(chain.nextGap.result, RESULT.UNKNOWN_NOT_OBSERVED);
});

test("Article runtime stays NOT APPLICABLE and is not missing evidence", () => {
  const stages = stageMap(projectLifecycleStages(
    "article-publication",
    ARTICLE_SPECIMEN_RECORD.observations,
  ));
  assert.equal(stages["RUNTIME VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(stages["RUNTIME VERIFIED"].gap, null);
  assert.match(stages["RUNTIME VERIFIED"].scope, /NOT APPLICABLE/);
  assert.doesNotMatch(stages["RUNTIME VERIFIED"].scope ?? "", /missing evidence$/);
  const presentation = presentLifecycleProfile("article-publication");
  assert.equal(presentation.label, "Article Publication");
  assert.match(presentation.expectedPath, /LIVE VERIFIED/);
  assert.doesNotMatch(presentation.expectedPath, /RUNTIME VERIFIED/);
  assert.match(presentation.expectedSummary, /Scheduler execution is not live verification/);
});

test("Scheduler execution does not become live verification or authored source", () => {
  const eventOnly = projectArticleSpecimen({
    ...ARTICLE_SPECIMEN_RECORD,
    observations: {
      ...ARTICLE_SPECIMEN_RECORD.observations,
      DEPLOYED: undefined,
    },
    extraGaps: [],
  });
  const stages = stageMap(eventOnly.stages);
  assert.equal(stages["DEPLOYMENT OBSERVED"].result, RESULT.OBSERVED);
  assert.equal(stages.DEPLOYED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.match(stages.DEPLOYED.gap, /UNKNOWN \/ NOT OBSERVED/);
  assert.equal(stages.SOURCE.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages["LIVE VERIFIED"].result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages["RUNTIME VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(eventOnly.nextGap.label, "SOURCE");
});

test("Evidence Detail for W-08 DEPLOYED preserves exact published identity", () => {
  const chain = projectArticleSpecimen();
  const deployed = detailForChangeStage(chain, "DEPLOYED");
  assert.equal(deployed.observationResult, RESULT.OBSERVED);
  assert.equal(deployed.lifecycleStage, "DEPLOYED");
  assert.match(deployed.identifier, /e36e544e92bc488f76c3a91224ba72044bd0a031/);
  assert.match(deployed.identifier, /22657bd9d7a1e68e1876920b4ae1075b357a045a/);
  assert.equal(
    deployed.sourceUrl,
    "https://github.com/AtlasReaper311/atlas-systems/commit/e36e544e92bc488f76c3a91224ba72044bd0a031",
  );
  assert.match(deployed.proves, /published-source identity/);
  assert.match(deployed.doesNotProve, /runtime or live/);
  assert.equal(deployed.nextGap.label, "SOURCE");
  const runtime = detailForChangeStage(chain, "RUNTIME VERIFIED");
  assert.equal(runtime.observationResult, RESULT.NOT_APPLICABLE);
  assert.match(runtime.proves, /cannot apply/);
});

test("Change View can select the article specimen without replacing #256", () => {
  const nodes = new Map();
  const created = [];
  function element(tag) {
    const children = [];
    const node = {
      tagName: String(tag).toUpperCase(),
      className: "",
      hidden: false,
      dataset: {},
      textContent: "",
      children,
      childNodes: children,
      replaceChildren(...next) {
        children.length = 0;
        children.push(...next);
      },
      appendChild(child) {
        children.push(child);
        return child;
      },
      append(...next) {
        children.push(...next);
      },
      querySelector() { return null; },
      setAttribute() {},
    };
    created.push(node);
    return node;
  }
  for (const id of [
    "change-chain", "change-reading", "change-review", "change-provenance",
    "change-view-status", "source-change-chain", "change-subjects",
    "change-profile", "change-summary", "change-detail",
    "change-detail-fallback", "change-article-fallback",
  ]) {
    nodes.set(id, element(id.includes("chain") || id.includes("reading") || id.includes("subjects") ? "ol" : "div"));
  }
  globalThis.document = {
    getElementById(id) {
      return nodes.get(id) ?? null;
    },
    createElement: element,
  };
  try {
    const site = renderChangeView(null, { subject: "atlas-systems-256", bind: false });
    assert.equal(site.profile.id, "static-public-site");
    assert.equal(site.subject.pullRequest, 256);
    const article = renderChangeView(null, { subject: ARTICLE_SPECIMEN_SUBJECT_ID, bind: false });
    assert.equal(article.profile.id, "article-publication");
    assert.equal(article.subject.slug, "specular-core-architectural-recovery");
    assert.equal(article.subject.wNumber, "W-08");
    const textOf = (node) => {
      if (!node) return "";
      if (node.children?.length) return node.children.map(textOf).join("");
      return node.textContent ?? "";
    };
    assert.match(nodes.get("change-view-status").textContent, /W-08/);
    assert.match(textOf(nodes.get("change-subjects")), /Article Publication/);
    assert.match(textOf(nodes.get("change-subjects")), /atlas-systems#256/);
  } finally {
    delete globalThis.document;
  }
});

test("Subject query parsing stays bounded to recorded change subjects", () => {
  assert.equal(
    parseEvidenceSubject({ search: "?subject=specular-core-architectural-recovery" }, [
      "atlas-systems-256",
      "specular-core-architectural-recovery",
    ]),
    "specular-core-architectural-recovery",
  );
  assert.equal(
    parseEvidenceSubject({ search: "?subject=not-a-subject" }, [
      "atlas-systems-256",
      "specular-core-architectural-recovery",
    ]),
    "atlas-systems-256",
  );
});

test("W-08 publication date is 2026-08-27 and 2026-08-23 is only date-written", () => {
  assert.equal(ARTICLE_SPECIMEN_RECORD.subject.publishDate, "2026-08-27");
  assert.equal(ARTICLE_SPECIMEN_RECORD.subject.dateWritten, "2026-08-23");
  const specimen = read("systems/evidence/article-specimen.js");
  assert.match(specimen, /publishDate: "2026-08-27"/);
  assert.match(specimen, /dateWritten: "2026-08-23"/);
  assert.doesNotMatch(specimen, /publishDate: "2026-08-23"/);
});

test("Private article-gen and scheduler access does not strengthen public SOURCE/CHECKED/MERGED", () => {
  const stages = stageMap(projectArticleSpecimen().stages);
  assert.equal(stages.SOURCE.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages.CHECKED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages.MERGED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  const specimen = read("systems/evidence/article-specimen.js");
  assert.doesNotMatch(specimen, /private in this runtime/);
  assert.match(specimen, /no approved public-safe projection establishes the exact AUTHORED source identity/);
  assert.match(specimen, /generator VALIDATED record/);
  assert.match(specimen, /scheduler SCHEDULED queue identity/);
  assert.match(specimen, /Generation is not publication/);
  assert.match(specimen, /Queue sync is not publication/);
  assert.match(specimen, /Scheduler execution is not live verification/);
  assert.match(stages.SOURCE.gap, /no approved public-safe projection/);
  assert.match(stages.CHECKED.gap, /no approved public-safe projection/);
  assert.match(stages.MERGED.gap, /no approved public-safe projection/);
});

test("Recorded article specimen stays public-safe and secret-free", () => {
  const page = read("systems/evidence/index.html");
  const specimen = read("systems/evidence/article-specimen.js");
  const profile = read("systems/evidence/article-profile.js");
  const view = read("systems/evidence/change-view.js");
  assert.match(page, /Inspect W-08 DEPLOYED without JavaScript/);
  assert.match(page, /e36e544e92bc488f76c3a91224ba72044bd0a031/);
  assert.match(page, /22657bd9d7a1e68e1876920b4ae1075b357a045a/);
  assert.match(page, /Article Publication/);
  assert.match(page, /systems\/evidence\/change-view\.js\?v=20260912-article-subject/);
  assert.doesNotMatch(page, /data-evidence-view-tab="article"/);
  assert.doesNotMatch(page, /data-evidence-view-tab="profile"/);
  assert.match(specimen, /recorded-public-projection/);
  assert.match(specimen, /not a live feed/);
  assert.match(specimen, /8b25517f006c1698096af4715dbd0713bcf34dd0/);
  assert.match(specimen, new RegExp(NOW_RECORD));
  assert.match(view, /atlas-scheduler is the only authorised write path/);
  assert.match(view, /persist:\s*true/);
  for (const source of [specimen, profile, view]) {
    assert.doesNotMatch(source, /innerHTML\s*=/);
    assert.doesNotMatch(source, /Authorization|Bearer|secret|token/i);
  }
});

function collectDescendants(node, found = []) {
  for (const child of node.children ?? []) {
    found.push(child);
    collectDescendants(child, found);
  }
  return found;
}

function matchesDataAttr(node, selector) {
  const match = String(selector).match(/^\[data-([a-z-]+)(?:=["']?([^"\]]+)["']?)?\]$/);
  if (!match) return false;
  const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  const actual = node.dataset?.[key];
  if (actual == null || actual === "") return false;
  return match[2] == null || actual === match[2];
}

function createInteractiveNode(tag) {
  const children = [];
  const listeners = new Map();
  const node = {
    tagName: String(tag).toUpperCase(),
    className: "",
    id: "",
    hidden: false,
    type: "",
    tabIndex: -1,
    dataset: {},
    attributes: {},
    children,
    childNodes: children,
    parentNode: null,
    textContent: "",
    addEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    dispatchEvent(event) {
      const next = { ...event, target: event.target ?? this, currentTarget: this };
      for (const handler of listeners.get(event.type) ?? []) handler(next);
      return true;
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name]; },
    removeAttribute(name) { delete this.attributes[name]; },
    appendChild(child) {
      child.parentNode = this;
      children.push(child);
      return child;
    },
    append(...next) {
      for (const child of next) this.appendChild(child);
    },
    replaceChildren(...next) {
      for (const child of children) child.parentNode = null;
      children.length = 0;
      for (const child of next) this.appendChild(child);
    },
    contains(other) {
      return other === this || collectDescendants(this).includes(other);
    },
    closest(selector) {
      let current = this;
      while (current) {
        if (matchesDataAttr(current, selector)) return current;
        current = current.parentNode;
      }
      return null;
    },
    matches(selector) {
      if (selector.includes("button") && this.tagName === "BUTTON") return true;
      return matchesDataAttr(this, selector);
    },
    querySelector(selector) {
      return collectDescendants(this).find((child) => (
        matchesDataAttr(child, selector) || (selector.includes("button") && child.tagName === "BUTTON")
      )) ?? null;
    },
    querySelectorAll(selector) {
      return collectDescendants(this).filter((child) => (
        matchesDataAttr(child, selector) || (selector.includes("button") && child.tagName === "BUTTON")
      ));
    },
    focus() {},
  };
  return node;
}

test("Change View subject selection persists subject and default claim into URL and history", () => {
  const nodes = new Map();
  const history = [];
  const popstateHandlers = [];
  const locationLike = {
    href: "https://atlas-systems.uk/systems/evidence/?view=change",
    pathname: "/systems/evidence/",
    search: "?view=change",
    hash: "",
  };
  function applyUrl(url) {
    const parsed = new URL(url, "https://atlas-systems.uk");
    locationLike.href = parsed.href;
    locationLike.pathname = parsed.pathname;
    locationLike.search = parsed.search;
    locationLike.hash = parsed.hash;
  }
  for (const id of [
    "change-chain", "change-reading", "change-review", "change-provenance",
    "change-view-status", "source-change-chain", "change-subjects",
    "change-profile", "change-summary", "change-detail",
    "change-detail-fallback", "change-article-fallback",
  ]) {
    nodes.set(id, createInteractiveNode(id.includes("chain") || id.includes("reading") || id.includes("subjects") ? "ol" : "div"));
    nodes.get(id).id = id;
  }
  globalThis.document = {
    getElementById(id) {
      return nodes.get(id) ?? null;
    },
    createElement: createInteractiveNode,
  };
  globalThis.window = {
    history: {
      pushState(state, _title, url) {
        history.push({ state, url });
        applyUrl(url);
      },
    },
    location: locationLike,
    addEventListener(type, handler) {
      if (type === "popstate") popstateHandlers.push(handler);
    },
  };
  try {
    const initial = renderChangeView(null, { bind: true, persist: false });
    assert.equal(initial.subject.pullRequest, 256);
    const subjects = nodes.get("change-subjects");
    const articleCard = subjects.querySelector("[data-subject=specular-core-architectural-recovery]");
    assert.ok(articleCard);
    subjects.dispatchEvent({ type: "click", target: articleCard });
    assert.match(locationLike.search, /subject=specular-core-architectural-recovery/);
    assert.match(locationLike.search, /claim=DEPLOYED/);
    assert.equal(history.at(-1)?.state?.evidenceSubject, ARTICLE_SPECIMEN_SUBJECT_ID);
    assert.equal(history.at(-1)?.state?.evidenceClaim, "DEPLOYED");

    const refreshed = renderChangeView(null, {
      persist: false,
      persistFocus: false,
      location: { ...locationLike },
    });
    assert.equal(refreshed.profile.id, "article-publication");
    assert.equal(refreshed.subject.slug, ARTICLE_SPECIMEN_SUBJECT_ID);
    assert.equal(
      subjects.querySelector("[data-subject=specular-core-architectural-recovery]").attributes["aria-pressed"],
      "true",
    );

    const siteCard = subjects.querySelector("[data-subject=atlas-systems-256]");
    subjects.dispatchEvent({ type: "click", target: siteCard });
    assert.doesNotMatch(locationLike.search, /subject=/);
    assert.match(locationLike.search, /claim=MERGED/);
    assert.equal(history.at(-1)?.state?.evidenceSubject, null);
    assert.equal(history.at(-1)?.state?.evidenceClaim, "MERGED");

    applyUrl(history[0].url);
    for (const handler of popstateHandlers) handler();
    const afterPop = renderChangeView(null, {
      persist: false,
      persistFocus: false,
      location: { ...locationLike },
    });
    assert.equal(afterPop.profile.id, "article-publication");
    assert.equal(afterPop.subject.slug, ARTICLE_SPECIMEN_SUBJECT_ID);
    assert.match(locationLike.search, /subject=specular-core-architectural-recovery/);
    assert.match(locationLike.search, /claim=DEPLOYED/);
  } finally {
    delete globalThis.document;
    delete globalThis.window;
  }
});
