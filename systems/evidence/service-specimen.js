export const SERVICE_SPECIMEN = Object.freeze({
  id: "atlas-api-public",
  repository: "AtlasReaper311/atlas-api-public",
  profile: "runtime-worker",
  authority: Object.freeze({
    lifecycle: "ADR-0013",
    profile: "ADR-0014",
    classification: "AtlasReaper311/atlas-infra",
  }),
  endpoints: Object.freeze({
    topology: "https://api.atlas-systems.uk/v1/topology",
    registry: "https://api.atlas-systems.uk/v1/registry",
    meta: "https://api.atlas-systems.uk/v1/_meta",
    live: "https://api.atlas-systems.uk/v1",
    reliability: "https://api.atlas-systems.uk/v1/reliability/services/atlas-api-public",
    source: "https://github.com/AtlasReaper311/atlas-api-public",
    docs: "https://api.atlas-systems.uk/v1/docs",
  }),
});
