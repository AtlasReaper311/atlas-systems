import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyCurrentEventState,
  describeAudioState,
} from "../system-symphony/replay/recorded-replay.js";

const root = new URL("../../", import.meta.url);
const read = (relative) => readFileSync(new URL(relative, root), "utf8");

function createEventButtons(count = 4) {
  return Array.from({ length: count }, (_, index) => {
    const attributes = new Map();
    const classes = new Set();
    return {
      dataset: { replayPosition: String(index) },
      classList: {
        toggle(name, enabled) {
          if (enabled) classes.add(name);
          else classes.delete(name);
        },
        contains(name) {
          return classes.has(name);
        },
      },
      setAttribute(name, value) {
        attributes.set(name, value);
      },
      removeAttribute(name) {
        attributes.delete(name);
      },
      getAttribute(name) {
        return attributes.get(name) ?? null;
      },
    };
  });
}

function assertCurrentEvent(buttons, position) {
  const current = buttons.filter((button) => button.classList.contains("is-current"));
  assert.equal(current.length, 1);
  assert.equal(current[0].dataset.replayPosition, String(position));
  assert.equal(current[0].getAttribute("aria-current"), "step");
  for (const button of buttons) {
    if (button !== current[0]) {
      assert.equal(button.getAttribute("aria-current"), null);
      assert.equal(button.classList.contains("is-current"), false);
    }
  }
}

test("historical replay route is visibly recorded, historical, and not live", () => {
  const page = read("lab/system-symphony/replay/index.html");
  assert.match(page, /RECORDED REPLAY/);
  assert.match(page, /HISTORICAL/);
  assert.match(page, /NOT LIVE/);
  assert.match(page, /inc-20260705-234935/);
  assert.match(page, /data-evidence-mode="recorded-replay"/);
  assert.match(page, /root cause, visitor impact, incident duration or live recovery/i);
  assert.match(page, /No raw telemetry, private runtime detail, or Blackbox payload/);
});

test("muted and no-JS presentation contains the complete four-event text equivalent", () => {
  const page = read("lab/system-symphony/replay/index.html");
  for (const timestamp of [
    "2026-07-05T23:48:50.649Z",
    "2026-07-05T23:49:08.770Z",
    "2026-07-05T23:49:35.670Z",
    "2026-07-05T23:51:03.675Z",
  ]) assert.match(page, new RegExp(timestamp.replaceAll(".", "\\.")));
  assert.match(page, /<noscript>/);
  assert.match(page, /Causality is not established/);
  assert.match(page, /this does not verify live recovery/);
});

test("controls preserve explicit audio consent, pause/reset/mute state, focus, and reduced motion", () => {
  const page = read("lab/system-symphony/replay/index.html");
  const ui = read("lab/system-symphony/replay/recorded-replay.js");
  const css = read("static/css/system-symphony-recorded-replay.css");
  for (const name of ["start-audio", "play", "pause", "reset", "mute"]) {
    assert.match(page, new RegExp(`data-recorded-replay-${name}`));
  }
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /data-audio-consent="false"/);
  assert.match(ui, /ArrowRight/);
  assert.match(ui, /ArrowLeft/);
  assert.match(ui, /state\.position = 0/);
  assert.match(ui, /state\.muted = !state\.muted/);
  assert.match(ui, /RECORDED_REPLAY_PRESENTATION_STEP_MS/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /focus-visible/);
  assert.doesNotMatch(ui, /blackbox\/incidents/);
  assert.doesNotMatch(ui.slice(0, ui.indexOf("function ensureAudio")), /new AudioContextClass/);
  assert.match(ui, /startAudio\);/);
});

test("current event marker survives list rebuilds across replay controls and keyboard movement", () => {
  const ui = read("lab/system-symphony/replay/recorded-replay.js");
  assert.ok(ui.indexOf("renderEventList();") < ui.indexOf("applyCurrentEventState(document.querySelectorAll"));

  let position = 0;
  let buttons = createEventButtons();
  applyCurrentEventState(buttons, position);
  assertCurrentEvent(buttons, 0);

  position = 1;
  buttons = createEventButtons();
  applyCurrentEventState(buttons, position);
  assertCurrentEvent(buttons, 1);

  buttons = createEventButtons();
  applyCurrentEventState(buttons, position);
  assertCurrentEvent(buttons, 1);

  position = 0;
  buttons = createEventButtons();
  applyCurrentEventState(buttons, position);
  assertCurrentEvent(buttons, 0);

  position = 2;
  buttons = createEventButtons();
  applyCurrentEventState(buttons, position);
  assertCurrentEvent(buttons, 2);

  position = 1;
  buttons = createEventButtons();
  applyCurrentEventState(buttons, position);
  assertCurrentEvent(buttons, 1);

  position = 2;
  buttons = createEventButtons();
  applyCurrentEventState(buttons, position);
  assertCurrentEvent(buttons, 2);

  position = 0;
  buttons = createEventButtons();
  applyCurrentEventState(buttons, position);
  assertCurrentEvent(buttons, 0);

  position = 3;
  buttons = createEventButtons();
  applyCurrentEventState(buttons, position);
  assertCurrentEvent(buttons, 3);
});

test("audio consent copy stays truthful while the interpretation remains muted", () => {
  const ui = read("lab/system-symphony/replay/recorded-replay.js");
  assert.doesNotMatch(ui, /Audio is unlocked\. Press Play to hear/);
  assert.match(describeAudioState({ audioConsent: true, muted: true }), /unlocked and remains muted/);
  assert.match(describeAudioState({ audioConsent: true, muted: true }), /Unmute, then Play/);
  assert.doesNotMatch(describeAudioState({ audioConsent: true, muted: true }), /unmuted/);
  assert.match(describeAudioState({ audioConsent: true, muted: false }), /unlocked and unmuted/);
  assert.match(describeAudioState({ audioConsent: true, muted: false }), /Select Play/);
});

test("System SYMPHONY links the historical replay without changing the synthetic fixture", () => {
  const page = read("lab/system-symphony/index.html");
  const fixture = read("lab/system-symphony/black-box/incident-arcs.json");
  assert.match(page, /Open historical replay/);
  assert.match(page, /replay\/\?incident=inc-20260705-234935/);
  assert.match(fixture, /INC-APU-20260726-001/);
  assert.match(fixture, /"source": "fixture"/);
});

test("Evidence Console keeps the incident as one supporting record, not a new top-level view", () => {
  const page = read("systems/evidence/index.html");
  assert.match(page, /id="supporting-records"/);
  assert.match(page, /recorded-incident-record-title/);
  assert.match(page, /Open System SYMPHONY replay/);
  assert.match(page, /follow-up success observed; live recovery not verified/i);
  assert.doesNotMatch(page, /data-evidence-view-tab="recorded-replay"/);
  assert.doesNotMatch(page, /data-evidence-view-tab="incident"/);
});
