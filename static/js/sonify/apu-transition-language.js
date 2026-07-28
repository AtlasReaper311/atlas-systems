/**
 * Canonical state-to-state handover language for System SYMPHONY.
 *
 * This module owns the twelve ordered transitions between the four audible
 * estate states. It does not schedule Web Audio nodes. Consumers use the same
 * definition for score metadata, performance phase selection and transition
 * ornaments so those layers cannot drift into contradictory descriptions.
 */

export const APU_TRANSITION_LANGUAGE_BUILD_ID =
  "20260728-system-symphony-transition-language-v1";

export const APU_TRANSITION_STATES = Object.freeze([
  "healthy",
  "warning",
  "critical",
  "unknown",
]);

const STATE_LABELS = Object.freeze({
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
  unknown: "Unknown",
});

const transition = ({
  from,
  to,
  id,
  phase,
  gesture,
  accent,
}) => Object.freeze({
  key: `${from}>${to}`,
  from,
  to,
  id,
  label: `${STATE_LABELS[from]} -> ${STATE_LABELS[to]}`,
  phase,
  gesture,
  accent,
  durationBars: 1,
  durationSteps: 16,
  mixPolicy: "composed-handover",
  outgoingTail: "preserve",
  harmonicAuthority: "destination",
});

const DEFINITIONS = [
  transition({
    from: "healthy",
    to: "warning",
    id: "pressure-ramp",
    phase: "pressure",
    gesture: "duty cycle tightens, noise doubles, counterline enters",
    accent: "diagnostic-rise",
  }),
  transition({
    from: "healthy",
    to: "critical",
    id: "interrupt-drop",
    phase: "rupture",
    gesture: "impact accent and octave drop transfer authority without cutting the outgoing tail",
    accent: "impact-drop",
  }),
  transition({
    from: "healthy",
    to: "unknown",
    id: "melody-dropout",
    phase: "afterglow",
    gesture: "Explorer notes decay into the carrier while certainty thins",
    accent: "carrier-takeover",
  }),
  transition({
    from: "warning",
    to: "healthy",
    id: "recovery-bloom",
    phase: "recovery",
    gesture: "diagnostic pressure recedes as the Explorer register reopens",
    accent: "rising-resolve",
  }),
  transition({
    from: "warning",
    to: "critical",
    id: "interrupt-drop",
    phase: "rupture",
    gesture: "diagnostic motion resolves into a bounded Boss impact",
    accent: "impact-drop",
  }),
  transition({
    from: "warning",
    to: "unknown",
    id: "pressure-dropout",
    phase: "afterglow",
    gesture: "offbeat pressure fragments into a sustained carrier",
    accent: "fragment-fade",
  }),
  transition({
    from: "critical",
    to: "healthy",
    id: "recovery-bloom",
    phase: "recovery",
    gesture: "bright rising arpeggio opens the Explorer register while Boss weight releases",
    accent: "rising-resolve",
  }),
  transition({
    from: "critical",
    to: "warning",
    id: "pressure-release",
    phase: "recovery",
    gesture: "impact energy falls away while the diagnostic pulse remains active",
    accent: "descending-release",
  }),
  transition({
    from: "critical",
    to: "unknown",
    id: "alarm-dropout",
    phase: "afterglow",
    gesture: "the alarm tail decays into unresolved carrier hum",
    accent: "alarm-decay",
  }),
  transition({
    from: "unknown",
    to: "healthy",
    id: "carrier-resolve",
    phase: "intro",
    gesture: "the carrier resolves into the Explorer tonic before the full motif enters",
    accent: "carrier-resolve",
  }),
  transition({
    from: "unknown",
    to: "warning",
    id: "carrier-resolve-pressure",
    phase: "pressure",
    gesture: "the carrier resolves before the diagnostic counterline takes control",
    accent: "carrier-pressure",
  }),
  transition({
    from: "unknown",
    to: "critical",
    id: "carrier-interrupt",
    phase: "rupture",
    gesture: "the carrier collapses into an interrupt and octave alarm",
    accent: "carrier-impact",
  }),
];

export const APU_TRANSITIONS = Object.freeze(Object.fromEntries(
  DEFINITIONS.map((definition) => [definition.key, definition]),
));

function stateKey(value) {
  return APU_TRANSITION_STATES.includes(value) ? value : "unknown";
}

export function transitionForStates(previousState, nextState) {
  const from = previousState == null ? null : stateKey(previousState);
  const to = stateKey(nextState);
  if (!from || from === to) {
    return Object.freeze({
      key: from ? `${from}>${to}` : `start>${to}`,
      from,
      to,
      id: "steady-state",
      label: `${STATE_LABELS[to]} sustain`,
      phase: null,
      gesture: "current movement continues",
      accent: "none",
      durationBars: 0,
      durationSteps: 0,
      mixPolicy: "hold",
      outgoingTail: "preserve",
      harmonicAuthority: "destination",
    });
  }
  return APU_TRANSITIONS[`${from}>${to}`];
}

export function transitionPhaseForStates(previousState, nextState) {
  return transitionForStates(previousState, nextState).phase;
}

export function transitionDurationSeconds(previousState, nextState, bpm = 100) {
  const plan = transitionForStates(previousState, nextState);
  const safeBpm = Number.isFinite(Number(bpm)) && Number(bpm) > 0 ? Number(bpm) : 100;
  return plan.durationBars * 240 / safeBpm;
}
