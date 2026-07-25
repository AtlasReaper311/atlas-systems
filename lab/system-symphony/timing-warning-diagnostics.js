(() => {
  "use strict";

  const PREVIEW_HOST = "system-symphony-pr-43.atlas-systems-44t.pages.dev";
  const WARNING_TEXT = "Events scheduled inside of scheduled callbacks";

  if (window.location.hostname !== PREVIEW_HOST) return;

  const nativeWarn = console.warn.bind(console);
  const stacks = [];

  console.warn = (...args) => {
    const text = args.map((value) => {
      if (value instanceof Error) return `${value.name}: ${value.message}`;
      return String(value);
    }).join(" ");

    if (text.includes(WARNING_TEXT) && stacks.length < 4) {
      const stack = new Error("System Symphony Tone timing warning").stack ?? "stack unavailable";
      stacks.push(stack);
      nativeWarn(...args, `\n${stack}`);
      return;
    }

    nativeWarn(...args);
  };

  window.__ATLAS_TONE_WARNING_STACKS__ = stacks;
})();
