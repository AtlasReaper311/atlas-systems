export function isCloudflareInsightsUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    return (url.protocol === "https:" || url.protocol === "http:")
      && (hostname === "cloudflareinsights.com" || hostname.endsWith(".cloudflareinsights.com"));
  } catch {
    return false;
  }
}
