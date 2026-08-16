import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DEFAULT_VOICE,
  MATERIAL_AUDIO_VERSION,
  REGIME_VOICE,
  fissionSplit,
  materialPulseInterval,
  materialSlew,
  materialVoice,
  voiceForRegime,
} from "../../static/js/spectral-forge/sonic-material.js";
import { MATERIAL_REGIMES } from "../../static/js/spectral-forge/spectral-field-material.js";

const MATERIAL_URL = new URL("../../static/js/spectral-forge/sonic-material.js", import.meta.url);
const CRYSTAL_URL = new URL("../../static/js/spectral-forge/sonic-crystal.js", import.meta.url);

function physical(regime, overrides = {}) {
  return {
    regime,
    pressure: 0, compression: 0, stretch: 0, viscosity: 0, cohesion: 1,
    instability: 0, propagation: 0, peakRecruitment: 0, surfaceTension: 0.6,
    recovery: 0, memory: 0, scarInfluence: 0,
    ...overrides,
    material: {
      damage: 0, returnPull: 0, supportStrength: 0, domainDisagreement: 0,
      fractureCharge: 0, ...(overrides.material ?? {}),
    },
  };
}

test("every material regime has an audio behaviour", () => {
  for (const regime of MATERIAL_REGIMES) {
    assert.ok(REGIME_VOICE[regime], `regime ${regime} has no sonic behaviour`);
  }
  assert.equal(voiceForRegime("not-a-regime"), DEFAULT_VOICE);
});

test("regimes are behaviourally distinct, not one patch at different amounts", () => {
  /* The previous build differed only in how far one low-pass opened, which made
   * six of seven scenarios spectrally near-identical. Each regime must differ
   * from every other in more than one dimension, or the same thing happens
   * again in a new costume. */
  const axes = ["crystal", "inharmonic", "air", "spread", "drag", "density", "tension", "domains", "floorDrop", "converge"];
  for (const a of MATERIAL_REGIMES) {
    for (const b of MATERIAL_REGIMES) {
      if (a >= b) continue;
      const differing = axes.filter((axis) => Math.abs(REGIME_VOICE[a][axis] - REGIME_VOICE[b][axis]) > 0.05);
      assert.ok(
        differing.length >= 2,
        `${a} and ${b} differ on fewer than two behavioural axes (${differing.join(", ") || "none"})`,
      );
    }
  }
});

test("support loss removes the floor rather than filtering the top", () => {
  const voice = materialVoice(physical("support-loss", { material: { supportStrength: 0.8 } }));
  assert.ok(voice.floorDrop > 0.4, `support loss must drop the floor (${voice.floorDrop})`);
  /* And must not simply mute the material - the upper structure stays. */
  assert.ok(voice.crystal > 0.5, `support loss must not silence the ring (${voice.crystal})`);
});

test("compression tightens time without raising level", () => {
  const calm = materialVoice(physical("coherent"));
  const pressed = materialVoice(physical("compressed", { pressure: 0.9, compression: 0.7 }));
  assert.ok(pressed.density > calm.density * 1.5, "compression must tighten rhythmic spacing");
  assert.ok(pressed.spread < calm.spread, "compression must narrow the image");
  assert.ok(
    materialPulseInterval(2, pressed) < materialPulseInterval(2, calm),
    "compression must shorten the pulse interval",
  );
});

test("viscosity slows everything that slews", () => {
  const calm = materialVoice(physical("coherent"));
  const slow = materialVoice(physical("viscous", { stretch: 0.9, viscosity: 0.8 }));
  assert.ok(slow.drag > 0.5, `viscous regime must drag (${slow.drag})`);
  assert.ok(materialSlew(0.1, slow) > materialSlew(0.1, calm) * 2, "viscous material must take longer to arrive");
  /* Bounded: nothing may stall or click. */
  assert.ok(materialSlew(0.1, slow) <= 4.5);
  assert.ok(materialSlew(0, slow) >= 0.025);
});

test("domain disagreement splits the voice and stays reversible", () => {
  const split = materialVoice(physical("oscillating", { material: { domainDisagreement: 0.8 } }));
  assert.ok(split.domains > 0.5, `oscillating regime must split into domains (${split.domains})`);
  const agreed = materialVoice(physical("oscillating", { material: { domainDisagreement: 0 } }));
  assert.ok(agreed.domains < split.domains, "domains must close again when the material agrees");
});

test("fracture charge loads the upper structure before anything breaks", () => {
  const quiet = materialVoice(physical("structural-failure", { material: { fractureCharge: 0 } }));
  const loaded = materialVoice(physical("structural-failure", { material: { fractureCharge: 3 } }));
  assert.ok(loaded.tension > quiet.tension, "charge must raise harmonic tension");
  assert.ok(loaded.inharmonic > quiet.inharmonic, "charge must push the bank off true");
  /* Loading must be audible as tension, not as absence: the regression that made
   * the crystalline layer collapse to 0.8% of output during a fracture. */
  assert.ok(loaded.crystal > 0.5, `a fracturing body must still ring (${loaded.crystal})`);
});

test("failure destabilises the ring instead of silencing it", () => {
  const healthy = materialVoice(physical("coherent"));
  const failing = materialVoice(physical("structural-failure", {
    cohesion: 0.15, instability: 0.8,
    material: { damage: 0.9, fractureCharge: 3 },
  }));
  assert.ok(
    failing.crystal >= healthy.crystal * 0.55,
    `failure lost too much upper presence (${failing.crystal} vs ${healthy.crystal})`,
  );
  assert.ok(failing.inharmonic > healthy.inharmonic * 4, "failure must be far less in tune");
});

test("reassembly reconverges rather than resetting", () => {
  const recovering = materialVoice(physical("reassembly", { recovery: 0.8, material: { returnPull: 0.7, damage: 0.5 } }));
  assert.ok(recovering.converge > 0.5, `reassembly must reconverge (${recovering.converge})`);
  /* History survives the healing. */
  assert.ok(recovering.scar > 0, "retained damage must leave a sonic trace");
});

test("fission separation follows the physical event and returns", () => {
  const idle = fissionSplit(null);
  assert.equal(idle.active, false);
  assert.equal(idle.separation, 0);

  const apart = fissionSplit({ active: true, phase: "independent", progress: 0.6, gap: 0.9, pinch: 0.2, axis: { x: 0.8 } });
  assert.ok(apart.separation > 0.5, `separated material must read as separated (${apart.separation})`);
  assert.ok(apart.detune > 0, "separation must destabilise the relationship");
  assert.ok(Math.abs(apart.daughterPan) > 0, "the daughter must take a side");

  /* Contact draws the gap closed, and the sound must close with it. */
  const returning = fissionSplit({ active: true, phase: "contact", progress: 0.9, gap: 0.05, pinch: 0, axis: { x: 0.8 } });
  assert.ok(returning.separation < apart.separation, "reconvergence must reduce separation");
});

test("the daughter takes the side the fission axis points", () => {
  const left = fissionSplit({ active: true, phase: "detach", gap: 0.8, pinch: 0, axis: { x: -1 } });
  const right = fissionSplit({ active: true, phase: "detach", gap: 0.8, pinch: 0, axis: { x: 1 } });
  assert.ok(left.daughterPan < 0, "a leftward axis must place the daughter left");
  assert.ok(right.daughterPan > 0, "a rightward axis must place the daughter right");
});

test("material audio stays deterministic and free of scenario knowledge", async () => {
  const [material, crystal] = await Promise.all([
    readFile(MATERIAL_URL, "utf8"),
    readFile(CRYSTAL_URL, "utf8"),
  ]);
  for (const source of [material, crystal]) {
    assert.doesNotMatch(source, /Math\.random\s*\(/);
    assert.doesNotMatch(source, /fetch\(|decodeAudioData/i);
  }
  /* The behaviour table keys on regimes, which are physical, and must never key
   * on a scenario id. */
  assert.doesNotMatch(material, /scenarioId|SCENARIO_BY_ID/);
});

test("every voice value stays bounded whatever the physics does", () => {
  const extremes = [0, 0.5, 1];
  for (const regime of MATERIAL_REGIMES) {
    for (const value of extremes) {
      const voice = materialVoice(physical(regime, {
        pressure: value, compression: value, stretch: value, viscosity: value,
        cohesion: value, instability: value, propagation: value,
        surfaceTension: value, recovery: value, scarInfluence: value,
        material: {
          damage: value, returnPull: value, supportStrength: value,
          domainDisagreement: value, fractureCharge: value * 3,
        },
      }), { active: true, phase: "detach", gap: value, pinch: value, axis: { x: value } });
      for (const [key, entry] of Object.entries(voice)) {
        if (typeof entry !== "number") continue;
        assert.ok(Number.isFinite(entry), `${regime}.${key} is not finite`);
        /* combShift is a resonance multiplier rather than a normalised amount;
         * it is bounded on its own terms below. */
        if (key === "combShift") {
          assert.ok(entry > 0.4 && entry < 2, `${regime}.combShift out of range (${entry})`);
          continue;
        }
        assert.ok(entry >= 0 && entry <= 1, `${regime}.${key} out of range (${entry})`);
      }
    }
  }
});

test("material audio declares its version", () => {
  assert.equal(typeof MATERIAL_AUDIO_VERSION, "string");
});
