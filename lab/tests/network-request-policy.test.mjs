import assert from "node:assert/strict";
import test from "node:test";

import { isCloudflareInsightsUrl } from "../../scripts/network-request-policy.mjs";

test("Cloudflare Insights filtering accepts only the canonical host and subdomains", () => {
  assert.equal(isCloudflareInsightsUrl("https://cloudflareinsights.com/beacon"), true);
  assert.equal(isCloudflareInsightsUrl("https://static.cloudflareinsights.com/beacon.min.js"), true);
  assert.equal(isCloudflareInsightsUrl("https://STATIC.CLOUDFLAREINSIGHTS.COM./beacon.min.js"), true);
  assert.equal(isCloudflareInsightsUrl("http://cloudflareinsights.com/beacon"), true);
});

test("Cloudflare Insights filtering rejects substring and hostname-confusion URLs", () => {
  assert.equal(isCloudflareInsightsUrl("https://cloudflareinsights.com.evil.example/beacon"), false);
  assert.equal(isCloudflareInsightsUrl("https://evil-cloudflareinsights.com/beacon"), false);
  assert.equal(isCloudflareInsightsUrl("https://example.com/cloudflareinsights.com/beacon"), false);
  assert.equal(isCloudflareInsightsUrl("https://cloudflareinsights.com@evil.example/beacon"), false);
  assert.equal(isCloudflareInsightsUrl("javascript:cloudflareinsights.com"), false);
  assert.equal(isCloudflareInsightsUrl("not a URL containing cloudflareinsights.com"), false);
});
