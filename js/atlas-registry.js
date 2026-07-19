/**
 * Compatibility entry for the native ES module registry client.
 *
 * Existing pages still load this path as a deferred classic script. The actual
 * registry implementation is an ES module and exposes no window global.
 */
void import("/static/js/live/atlas-registry.js?v=20260720-esm-live");
