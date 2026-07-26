# Deployment secrets

This repository deploys through GitHub Actions and inherits the Cloudflare Pages
publishing secrets from the Atlas infrastructure workflow. Secret values must
stay in GitHub; do not copy them into commits, logs, screenshots, issues, or
chat.

## `DISCORD_DEPLOY_WEBHOOK`

`DISCORD_DEPLOY_WEBHOOK` is the Discord incoming webhook URL used by the
pre-deploy witness workflow to record that a push to `main` was observed before
the deploy workflow completes.

Required scope:

- Repository secret on `AtlasReaper311/atlas-systems`
- Available to GitHub Actions on the `main` branch
- Points at the deploy-log Discord channel used for Atlas deployment signals

Rotation checklist:

1. Create the replacement webhook in Discord.
2. Update the GitHub repository secret with the new URL.
3. Re-run or wait for the next `Pre-deploy Witness` workflow on `main`.
4. Confirm the Discord message arrives, then delete the old Discord webhook.

Failure mode:

If this secret is missing or invalid, the witness workflow fails, but the deploy
workflow still owns validation, publishing, and production verification.
