# Deployment control: exact-commit production gate

## Purpose

Production deployment is a separately approved action from merging source. The `Deploy` workflow is `workflow_dispatch`-only,
requires an explicit full commit SHA, validates that SHA against the current `main` head, validates the Pages output,
then pauses for approval before calling the existing pinned deployment workflow.

This implements the rollout boundary accepted by ADR-0008 and
`atlas-infra/policy/public-interface-system-v2.json` without changing the shared deployment implementation.

## Workflow sequence

```text
resolve-commit
  -> verify-pages-output
  -> production-approval
  -> deploy
  -> verify-production
  -> refresh-corpus
```

No production approval request is created until the selected source has passed the repository's Pages-output
validation.

## Exact-commit invariant

The required `commit_sha` input must:

- contain exactly 40 lowercase hexadecimal characters;
- equal the workflow event's `github.sha`;
- equal the freshly fetched `origin/main` head;
- be dispatched with `github.ref` equal to `refs/heads/main`;
- resolve to a commit object in the checked-out repository.

Only the current `main` head is deployable. An older ancestor is deliberately rejected. Reachability alone could
validate one commit while the deployment workflow checks out another after `main` moves; exact equality closes that
gap.

## Reusable workflow boundary

The deploy job keeps the existing immutable pin to
`AtlasReaper311/atlas-infra/.github/workflows/validate-static.yml` and preserves its existing inputs and inherited
secrets.

GitHub associates a called reusable workflow's `github` context with the caller. An `actions/checkout` step in a
workflow called from another repository checks out the caller repository. Because `resolve-commit` has already
proved `commit_sha == github.sha == origin/main`, the called workflow's default checkout and its `build-commit`
injection use the same exact Atlas Systems commit.

## Production approval job

`production-approval` references the `production` GitHub Environment with `deployment: false`.

This means:

- built-in required reviewers and wait timers still apply;
- no GitHub deployment object is created for the approval-only job;
- the job has an empty `GITHUB_TOKEN` permission map;
- the job contains one local no-op record step and references no secret;
- the Environment should contain no deployment credentials because deployment credentials remain repository-owned
  and are passed only to the pinned reusable workflow;
- custom GitHub App deployment-protection rules must not be enabled on this Environment because they require a
  deployment object and are incompatible with `deployment: false`.

Creating or configuring the Environment is a separate provider action. Merging this source does not approve or
perform that action.

## Provider prerequisites

Before merging this deployment-control change, confirm that Cloudflare Pages automatic Git deployments cannot
publish independently of this workflow. For an existing Git-integrated Pages project, Cloudflare's supported control
is to turn off automatic production branch deployments under Build > Branch control. Set automatic preview branch
deployments to `None` as well unless native preview deployments are intentionally retained under a separate approved
contract. A Git-integrated Pages project cannot be converted to Direct Upload after creation, so the required control
is disabling automatic builds rather than assuming the repository connection can be removed.

After merge and before the first dispatch, create or verify the GitHub `production` Environment with:

- built-in required reviewers appropriate for the repository;
- no custom GitHub App deployment-protection rule;
- branch or tag access restricted to `main` where supported;
- no deployment credentials stored in the Environment.

These are manual provider checks and are not performed by this repository change.

## Dispatch procedure

1. Confirm the current `origin/main` head.
2. Dispatch `Deploy` against the `main` branch with `commit_sha` set to that exact full SHA.
3. `resolve-commit` fails closed if the input is malformed, the dispatch ref is not `main`, or any SHA differs.
4. `verify-pages-output` checks out and validates the resolved commit.
5. `production-approval` waits for the Environment's built-in protection rules.
6. On approval, the pinned reusable workflow validates and deploys the same commit.
7. `verify-production` requires the custom domain's `build-commit` marker to match the resolved commit and runs the
   existing production smoke checks.
8. `refresh-corpus` runs only after deployment and production verification succeed.

## Rollback

Rollback uses a reviewed revert commit merged to `main`, followed by an explicit dispatch of that new current-main
commit. The workflow intentionally does not deploy arbitrary historical ancestors.

## Evidence boundary

A merged pull request is source evidence only. Production rollout is proved only by the separately approved workflow
run, successful Cloudflare Pages deployment, exact live `build-commit` match, production smoke evidence, and Corpus
refresh result.
