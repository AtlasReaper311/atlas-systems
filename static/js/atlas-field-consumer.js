import { createAtlasField } from "./atlas-field.js?v=20260727-atlas-field-production-v2";

const VALID_PRESETS = new Set(["hero", "ambient", "card"]);

function freezeOptions(options = {}) {
  return Object.freeze({
    ...options,
    ...(options.density ? { density: Object.freeze({ ...options.density }) } : {}),
    ...(options.pointer ? { pointer: Object.freeze({ ...options.pointer }) } : {}),
    ...(options.light ? { light: Object.freeze({ ...options.light }) } : {}),
    ...(options.domainBreaks ? { domainBreaks: Object.freeze([...options.domainBreaks]) } : {}),
    ...(options.domainStyles ? { domainStyles: Object.freeze([...options.domainStyles]) } : {}),
  });
}

export function defineAtlasFieldConsumer(config = {}) {
  const selector = String(config.selector || "").trim();
  const preset = String(config.preset || config.options?.preset || "").trim();
  if (!selector) throw new TypeError("AtlasField consumer requires a selector");
  if (!VALID_PRESETS.has(preset)) throw new RangeError(`Unknown AtlasField consumer preset: ${preset}`);

  const stateKey = String(config.stateKey || "atlasFieldState").trim();
  const hostClasses = Object.freeze([
    "atlas-field-surface",
    `atlas-field-surface--${preset}`,
    ...((config.hostClasses || []).filter(Boolean)),
  ]);

  return Object.freeze({
    selector,
    preset,
    stateKey,
    hostClasses,
    options: freezeOptions({ ...config.options, preset }),
    errorLabel: String(config.errorLabel || "AtlasField consumer"),
  });
}

export function mountAtlasFieldConsumer(
  definition,
  root = document,
  factory = createAtlasField,
) {
  const host = root.querySelector(definition.selector);
  if (!host) return null;

  if (host.dataset[definition.stateKey] === "ready") {
    return host.querySelector(":scope > canvas.atlas-field-canvas");
  }

  try {
    const controller = factory(host, definition.options);
    if (!controller) {
      host.dataset[definition.stateKey] = "unavailable";
      return null;
    }

    host.classList.add(...definition.hostClasses);
    host.dataset[definition.stateKey] = "ready";
    return controller;
  } catch (error) {
    host.dataset[definition.stateKey] = "unavailable";
    console.error(`${definition.errorLabel} unavailable`, error);
    return null;
  }
}
