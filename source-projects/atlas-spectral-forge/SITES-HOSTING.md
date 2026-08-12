# Sites hosting provenance

These files belong to the original ChatGPT Sites/Vinext hosting scaffold and are not imported by the Spectral Forge client application:

- `.openai/hosting.json`: identifies the original Sites project and declares `d1: null` and `r2: null`.
- `build/sites-vite-plugin.ts`: emits the hosting manifest during the original Sites build.
- `worker/index.ts`: Cloudflare-compatible server entry generated through Vinext.
- `scripts/build-verified.sh`, `scripts/validate-artifact.sh`, and `tests/rendered-html.test.mjs`: validate the Sites deployment artifact.
- `db/`, `drizzle.config.ts`, `drizzle/`, and `examples/d1/`: unused starter scaffold. Spectral Forge does not import it, define a schema, or require a database.
- `app/chatgpt-auth.ts`: unused starter helper. Spectral Forge does not import it or require authentication.

They are retained so this archive remains a faithful direct source export. Local development of the instrument uses `app/`, `public/`, the package manifest, and the Vite/Vinext configuration. No hosted project, credential, secret, external API, D1 database, or R2 bucket is needed to run the application locally.
