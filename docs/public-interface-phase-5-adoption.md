# Public interface programme Phase 5 adoption

Status: implementation candidate for exact-head pull-request validation and isolated browser preview.

Recorded: 29 July 2026.

## Scope

This branch adopts the published `atlas-interface-kit v0.3.0` foundation in `atlas-systems` without changing product ownership, generated article output, deployment settings, provider configuration, or the immutable release.

The source release is:

```text
v0.3.0 -> 630c8060ebe61b3f2234cd73ae983b5b41564c3b
```

The release archive and release manifest remain verified by SHA-256:

```text
60dd4a6b4dc308c65aea1b86c01043fe81beab30861058fb3f03f6cdcb393ec4  atlas-interface-kit-0.3.0.tar.gz
77886d2236bc65de0f3812c4c086775a8ef9d2ba08fc4daa5e93f40192a8df2f  atlas-interface-kit-0.3.0.release-manifest.json
```

## Repository-local distribution

The changed v0.3.0 CSS and JSON assets, plus the exact v0.3.0 manifest, are copied verbatim into `static/vendor/atlas-interface/v0.3.0/` and verified against the release bundle manifest.

The font stylesheet, four font binaries, and two font licences are byte-identical between v0.2.0 and v0.3.0. They remain at their existing repository-local v0.2.0 paths during this phase so generated Writing and article HTML does not require direct edits outside `atlas-article-gen` and `atlas-scheduler` ownership. The consumer verifier proves each retained unchanged asset has the exact v0.3.0 byte count and SHA-256 before accepting the overlay.

This is a bounded compatibility bridge, not a remote runtime dependency. No asset is loaded from `atlas-interface-kit` or another Atlas Systems domain. Phase 10 owns removal of the generated-output compatibility path through the generator and scheduler contracts.

## Consumer-owned semantics

`static/js/shared-foundation-semantics.js` implements the accepted additive semantics locally:

- breadcrumbs appear only on selected hierarchical Lab and Systems routes;
- the homepage, top-level directories, generated Writing routes, Operations console, and System Symphony purpose-specific routes remain excluded;
- the global status chip remains `aria-live="off"`;
- a separate polite status announcement is silent for the initial status request and announces only later meaningful label transitions;
- dense regions receive `data-overflow="true"`, an accessible name, and `tabindex="0"` only while horizontal overflow exists;
- the tab stop and generated accessible name are removed when overflow ends.

The interface kit supplies no runtime JavaScript. Trigger logic, wording, route selection, and rendering remain owned by `atlas-systems`.

## Protected boundaries

This phase does not:

- edit generated article HTML or metadata;
- change article prose, ordering, publication timing, or scheduler behaviour;
- change System Symphony audio, mappings, topology, endpoints, or evidence fixtures;
- add a new AtlasField composition;
- change colour, spacing, typography, breakpoints, content widths, or touch-target tokens;
- alter Cloudflare bindings, secrets, provider settings, workflows, or production routes;
- merge or deploy the consumer change.

## Validation boundary

Repository-native pull-request checks and the existing labelled interface-preview workflow are authoritative for the exact branch head. The preview must prove the changed routes in Chromium and Firefox at the blocking viewports plus reporting-only 1920-pixel coverage. Manual visual approval remains required before any merge request.

## Rollback

Before merge, close the pull request and delete the branch. After merge, revert the consumer adoption commit. The immutable `atlas-interface-kit v0.3.0` release remains unchanged in either case.
