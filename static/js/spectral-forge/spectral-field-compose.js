"use strict";

// Compatibility entry point for code that still imports the historical compose
// module. Spectral Field v4 is the only active renderer. Keeping this alias
// prevents playback, resize, or stale integration paths from resurrecting the
// retired line-dominant renderer.
export { draw } from "./spectral-field-compose-v4.js?v=20260814-field-4-single-renderer";
