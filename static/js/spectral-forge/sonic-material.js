"use strict";

/* Regime-driven material audio.
 *
 * The organism already has a causal physics: seven material regimes, each
 * permitting a different mechanism, with accumulated fracture charge, retained
 * damage and scars. None of it reached the audio, which knew only a five-value
 * health enum mapped to five interval ratios. Measured, that made six of the
 * seven scenarios spectrally near-identical - Latency Creep and Deployment sat
 * 1.6% apart - because they were one patch with the low-pass opened by different
 * amounts.
 *
 * Here a regime owns a *behaviour*, not a parameter value. The table sets how
 * the material sounds when worked in that way; the live physical state sets how
 * much. Two scenarios therefore diverge because their physics diverges, which is
 * the same reason they look different.
 *
 * Nothing in this module is random. Every value derives from the physical
 * snapshot or from a seeded constant, so a run sounds the same twice.
 */

import { clamp } from "./domain.js";

export const MATERIAL_AUDIO_VERSION = "3.0";
export const CRYSTAL_PARTIALS = 5;

/* Inharmonic ratios, not a harmonic series. A harmonic stack reads as one
 * pitched note; struck crystal and glass ring on ratios that never quite agree,
 * which is what makes the upper register sound like a material rather than a
 * synth lead. Chosen to land the bank between roughly 1 and 5 kHz on the 92 Hz
 * base, which is where the instrument previously had nothing at all. */
export const CRYSTAL_RATIOS = Object.freeze([11.03, 17.47, 25.94, 36.82, 50.61]);

/* How each regime works the material.
 *
 * crystal    upper-register presence
 * inharmonic how far the bank is pushed off its ratios (cents scale)
 * air        high noise band, the sound of surface rather than body
 * spread     stereo width target
 * drag       envelope and filter slew multiplier - viscous time
 * density    rhythmic pressure: closer spacing, tighter envelopes
 * tension    harmonic loading that does not resolve
 * domains    competing detuned voices that keep resolving and re-splitting
 * floorDrop  spectral support removed from beneath the tone
 * converge   active reconvergence of pitch, phase and image
 * combShift  crystal comb resonance, shifted off the base
 */
export const REGIME_VOICE = Object.freeze({
  coherent: Object.freeze({
    crystal: 1, inharmonic: 0.05, air: 0.58, spread: 0.6, drag: 0,
    density: 0.28, tension: 0, domains: 0, floorDrop: 0, converge: 0, combShift: 1,
  }),
  compressed: Object.freeze({
    crystal: 0.84, inharmonic: 0.12, air: 0.32, spread: 0.32, drag: 0,
    density: 0.78, tension: 0.2, domains: 0, floorDrop: 0, converge: 0, combShift: 0.94,
  }),
  "support-loss": Object.freeze({
    crystal: 0.86, inharmonic: 0.2, air: 0.44, spread: 0.56, drag: 0.12,
    density: 0.34, tension: 0.26, domains: 0, floorDrop: 1, converge: 0, combShift: 1.14,
  }),
  oscillating: Object.freeze({
    crystal: 0.88, inharmonic: 0.26, air: 0.5, spread: 0.8, drag: 0,
    density: 0.44, tension: 0.22, domains: 1, floorDrop: 0, converge: 0, combShift: 1,
  }),
  viscous: Object.freeze({
    crystal: 0.78, inharmonic: 0.14, air: 0.26, spread: 0.48, drag: 0.88,
    density: 0.26, tension: 0.3, domains: 0, floorDrop: 0, converge: 0, combShift: 0.86,
  }),
  "structural-failure": Object.freeze({
    crystal: 0.82, inharmonic: 0.6, air: 0.4, spread: 0.88, drag: 0.24,
    density: 0.52, tension: 0.9, domains: 0.4, floorDrop: 0.3, converge: 0, combShift: 0.76,
  }),
  reassembly: Object.freeze({
    crystal: 0.94, inharmonic: 0.08, air: 0.64, spread: 0.44, drag: 0.32,
    density: 0.26, tension: 0.06, domains: 0, floorDrop: 0, converge: 1, combShift: 1.06,
  }),
});

export const DEFAULT_VOICE = REGIME_VOICE.coherent;

export function voiceForRegime(regime) {
  return REGIME_VOICE[regime] ?? DEFAULT_VOICE;
}

/* Blends the regime's behaviour with the live physical amounts.
 *
 * The regime decides which way the material is being worked; these values decide
 * how hard. Keeping them separate is what stops the result being a lookup table
 * with seven presets - the same regime at different stress reads differently,
 * and the transition between regimes is carried by the physical values rather
 * than by a jump between rows. */
export function materialVoice(physical, fission) {
  const p = physical ?? {};
  const material = p.material ?? null;
  const voice = voiceForRegime(p.regime);

  const cohesion = clamp(p.cohesion ?? 1);
  const instability = clamp(p.instability ?? 0);
  const stretch = clamp(p.stretch ?? 0);
  const compression = clamp(p.compression ?? 0);
  const pressure = clamp(p.pressure ?? 0);
  const propagation = clamp(p.propagation ?? 0);
  const surfaceTension = clamp(p.surfaceTension ?? 0);
  const recovery = clamp(p.recovery ?? 0);
  const scar = clamp(p.scarInfluence ?? 0);
  const damage = clamp(Number(material?.damage ?? 0));
  const returnPull = clamp(Number(material?.returnPull ?? 0));
  const supportStrength = clamp(Number(material?.supportStrength ?? 0));
  const domainDisagreement = clamp(Number(material?.domainDisagreement ?? 0));
  /* Fracture charge runs past 1 before it releases, which is exactly the part
   * that should be audible as loading. */
  const charge = clamp(Number(material?.fractureCharge ?? 0) / 3);

  const split = fissionSplit(fission);

  return {
    regime: p.regime ?? "coherent",

    /* Failure destabilises the ring; it does not silence it. Tying presence
     * hard to cohesion made the crystalline layer collapse from 7.6% of output
     * to 0.8% exactly during a fracture - the upper register disappeared at the
     * one moment it was supposed to carry the event, leaving failure duller and
     * quieter rather than beautiful and uneasy. Coherence now costs a little
     * presence and buys a lot of instability, and accumulating charge lifts the
     * bank so loading is audible before anything breaks. */
    crystal: clamp(
      voice.crystal * (0.82 + cohesion * 0.18) * (1 - damage * 0.12)
      + charge * 0.25
      /* The three arcs must be audible in the spectrum, not only in tuning and
       * image - detune and panning barely move a summed spectrum, and measured,
       * the arcs were arriving within 0.3% of each other on every spectral axis.
       * Strain covers the material as the connection narrows; separation
       * releases it as the body parts; reconvergence clarifies it as the
       * daughters return. Loading, release, return. */
      - split.strain * 0.16
      + split.separation * 0.2
      + split.attraction * 0.1,
    ),

    /* Detuning of the upper bank. Charge loads it well before anything visibly
     * breaks, which is the "something is coming" the split needs. */
    inharmonic: clamp(voice.inharmonic + charge * 0.42 + instability * 0.22 + split.detune),

    /* Damaged surface, not absent surface. The arcs move it too: a narrowing
     * connection closes the surface down, an opening gap exposes it. */
    air: clamp(
      voice.air * (0.5 + surfaceTension * 0.5) * (1 - damage * 0.15)
      * (1 - split.strain * 0.45) * (1 + split.separation * 0.7),
    ),

    /* Width narrows under pressure and opens as material separates. */
    spread: clamp(voice.spread * (1 - compression * 0.3) + split.spread * 0.55 + domainDisagreement * 0.2),

    /* Viscous time. Everything that slews takes longer to arrive. */
    drag: clamp(voice.drag * (0.4 + stretch * 0.6) + Number(p.viscosity ?? 0) * 0.25),

    /* Rhythmic pressure without level: closer spacing, tighter envelopes. */
    density: clamp(voice.density * (0.55 + pressure * 0.45) + compression * 0.2),

    /* Harmonic loading that does not resolve. Strain adds to it while the
     * connection is still narrowing, and drops away once the material has
     * actually parted - the tension is released by the break, not by the
     * separation continuing. */
    tension: clamp(
      voice.tension * (0.4 + charge * 0.6) + charge * 0.35 + propagation * 0.12
      + split.strain * 0.3
      /* The break relieves the load. Without this the tension saturated and
       * stayed saturated straight through the separation, so the one moment
       * that should feel like release sounded identical to the build. */
      - split.separation * 0.45,
    ),

    /* Competing domains: two voices that keep pulling apart and agreeing again. */
    domains: clamp(voice.domains * (0.35 + domainDisagreement * 0.65) + split.domains),

    /* Support removed from beneath the tone rather than filtered off the top. */
    floorDrop: clamp(voice.floorDrop * (0.3 + supportStrength * 0.7) + propagation * 0.15),

    /* Reconvergence: pitch, phase and image pulled back together. Attraction
     * during a closing gap counts as reconvergence even mid-event, which is what
     * makes the return audible as the material being drawn back rather than as
     * the separation simply ending. */
    converge: clamp(voice.converge * (0.3 + Math.max(recovery, returnPull) * 0.7) + split.attraction * 0.55),

    combShift: voice.combShift,

    /* Retained history. A body that has fractured keeps a trace after it heals. */
    scar: clamp(scar * 0.7 + damage * 0.3),

    charge,
    damage,
    split,
  };
}

/* The separation, as the audio needs it.
 *
 * Phases come from the physical fission model, so the sound follows the same
 * event the viewer is watching rather than a parallel script. Each phase
 * contributes what it physically is: gather loads, neck and pinch pull the
 * relationship apart, detach separates, independent holds them apart, return and
 * contact bring them back, settle leaves a trace. */
export function fissionSplit(fission) {
  const idle = {
    active: false, phase: "idle", progress: 0,
    strain: 0, separation: 0, attraction: 0,
    detune: 0, spread: 0, domains: 0, daughterPan: 0, voices: 1,
  };
  if (!fission?.active) return idle;

  const phase = fission.phase ?? "idle";
  const progress = clamp(fission.progress ?? 0);
  const pinch = clamp(fission.pinch ?? 0);
  const gap = clamp(fission.gap ?? 0);
  const gather = clamp(fission.gather ?? 0);
  const scar = clamp(fission.scar ?? 0);
  const count = Math.max(1, Number(fission.count ?? 1));

  /* Three arcs, each read from the quantity that physically defines it, so the
   * progression is a continuous function of the material rather than ten cued
   * sound effects. The phases are not branched on: pinch is the narrowing
   * connection, gap is the opening distance, and the scar is what remains once
   * the gap has closed again.
   *
   *   strain      the connection narrowing while nothing has yet parted
   *   separation  actual distance between two independent masses
   *   attraction  the gap closing under return pull
   */
  const strain = clamp(pinch * 0.86 + gather * 0.3) * (1 - gap * 0.72);
  const separation = clamp(gap * 0.92 + (fission.independent ? 0.08 : 0));
  const attraction = clamp(scar * 0.5 + Math.max(0, 0.62 - gap) * (progress > 0.62 ? 1.3 : 0));

  return {
    active: true,
    phase,
    progress,
    strain,
    separation,
    attraction,

    /* Strain tightens the relationship without opening the image; separation is
     * what actually pulls the voices apart. Keeping those separate is what makes
     * the build read as loading rather than as an early split. */
    detune: clamp(strain * 0.46 + separation * 0.54),
    spread: clamp(separation * (1 - attraction * 0.55)),
    domains: clamp(separation * 0.85 + strain * 0.25),

    /* How many related material voices are sounding. */
    voices: separation > 0.18 ? count : 1,

    /* Which side the daughter takes. Deterministic from the fission axis so the
     * sound separates the same way the picture does. */
    daughterPan: clamp((fission.axis?.x ?? 0) * 0.5 + 0.5, 0, 1) * 2 - 1,
  };
}

/* Slew time for a target, in seconds.
 *
 * Viscous material takes longer to arrive everywhere, which is what makes Creep
 * read as slow rather than merely quiet. Bounded so nothing can stall or click.
 */
export function materialSlew(base, voice) {
  const drag = clamp(voice?.drag ?? 0);
  return Math.min(4.5, Math.max(0.025, base * (1 + drag * 3.2)));
}

/* Pulse interval in seconds. Density tightens spacing without touching level. */
export function materialPulseInterval(pulseRate, voice) {
  const rate = Math.min(8, Math.max(0.25, pulseRate || 1));
  const density = clamp(voice?.density ?? 0);
  return 1 / (rate * (1 + density * 0.55));
}
