# Final convergence rollback

Before merge, close the draft pull request and delete `interface/final-convergence-cleanup`.

After merge, revert the exact consumer pull request. The existing automatic deployment from reviewed `main` will publish the reverted revision. No endpoint, secret, provider, database, article, scheduler, or immutable Interface Kit change is part of this cleanup.
