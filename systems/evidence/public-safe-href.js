const MAX_HREF_LENGTH = 2048;

export function isPublicSafeHref(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_HREF_LENGTH) {
    return false;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
  if (parsed.hostname === "github.com") {
    return parsed.pathname === "/AtlasReaper311" || parsed.pathname.startsWith("/AtlasReaper311/");
  }
  if (parsed.hostname === "atlas-systems.uk") return true;
  return parsed.hostname === "api.atlas-systems.uk";
}
