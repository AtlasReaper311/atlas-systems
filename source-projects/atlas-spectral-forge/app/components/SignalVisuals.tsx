"use client";

import {
  Mapping,
  ScenarioDefinition,
  ScenarioId,
  SignalId,
  TelemetryFrame,
  transformValue,
} from "../lib/signal-forge";

const CAUSAL_MARKERS: Record<ScenarioId, Array<{ time: number; label: string }>> = {
  normal: [{ time: 20, label: "BOUNDED VARIATION" }, { time: 40, label: "STABLE SETTLE" }],
  traffic: [{ time: 10, label: "DEMAND RISES" }, { time: 20, label: "CPU FOLLOWS" }, { time: 26, label: "LATENCY RISES" }, { time: 35, label: "DEMAND FALLS" }],
  cache: [{ time: 12, label: "CACHE HIT FALLS" }, { time: 18, label: "CPU PRESSURE" }, { time: 25, label: "LATENCY RISES" }, { time: 38, label: "CACHE RESTORES" }],
  flapping: [{ time: 8, label: "COHERENCE LOST" }, { time: 21, label: "STATE REFORMS" }, { time: 34, label: "COHERENCE LOST" }, { time: 52, label: "OSCILLATION STOPS" }],
  creep: [{ time: 8, label: "LATENCY DRIFTS" }, { time: 28, label: "QUEUE ACCUMULATES" }, { time: 45, label: "DEGRADED" }],
  cascade: [{ time: 10, label: "CACHE DEGRADES" }, { time: 18, label: "CPU PRESSURE" }, { time: 28, label: "QUEUE EXPANDS" }, { time: 38, label: "ERRORS ACCELERATE" }, { time: 46, label: "FAILED" }],
  deploy: [{ time: 12, label: "DEPLOY EVENT" }, { time: 20, label: "PRESSURE FOLLOWS" }, { time: 34, label: "RECOVERY" }, { time: 50, label: "STABLE" }],
};

function linePoints(values: number[], width: number, height: number) {
  if (values.length < 2) return `0,${height / 2} ${width},${height / 2}`;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - Math.max(0, Math.min(1, value)) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function Sparkline({
  values,
  label,
}: {
  values: number[];
  label: string;
}) {
  const visible = values.slice(-80);
  const points = linePoints(visible, 130, 28);
  const newest = visible.at(-1) ?? 0;
  const newestX = visible.length > 1 ? 130 : 0;
  const newestY = 28 - newest * 28;

  return (
    <svg
      className="sparkline"
      viewBox="0 0 130 28"
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label} recent normalised history; latest value ${newest.toFixed(3)}`}
    >
      <path d="M0 14H130" className="sparkline__guide" />
      <polyline points={points} className="sparkline__line" />
      <circle cx={newestX} cy={newestY} r="2.2" className="sparkline__point" />
    </svg>
  );
}

export function RouteCable({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <svg className="route-cable" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
      <path d="M1 9 C28 9 72 3 99 3" className="route-cable__base" />
      <path d="M1 9 C28 9 72 3 99 3" className="route-cable__signal" pathLength="100" strokeDasharray={`${Math.max(4, clamped * 100)} 100`} />
      <circle cx={1 + clamped * 98} cy={9 - clamped * 6} r="1.8" className="route-cable__marker" />
    </svg>
  );
}

export function TransformCurve({ mapping }: { mapping: Mapping }) {
  const points = Array.from({ length: 33 }, (_, index) => {
    const input = index / 32;
    let output = transformValue(input, mapping.transform);
    if (mapping.polarity === "REVERSED") output = 1 - output;
    return `${(input * 100).toFixed(2)},${(58 - output * 52).toFixed(2)}`;
  }).join(" ");

  return (
    <svg
      className="transform-curve"
      viewBox="0 0 100 64"
      role="img"
      aria-label={`${mapping.transform.toLowerCase()} transform with ${mapping.polarity.toLowerCase()} polarity`}
    >
      <path d="M0 58H100M6 6V64" className="transform-curve__grid" />
      <polyline points={points} className="transform-curve__line" />
      <text x="2" y="63" className="transform-curve__label">0</text>
      <text x="92" y="63" className="transform-curve__label">1</text>
    </svg>
  );
}

export function Timeline({
  history,
  selectedSignal,
  scenario,
  time,
}: {
  history: TelemetryFrame[];
  selectedSignal: SignalId;
  scenario: ScenarioDefinition;
  time: number;
}) {
  const values = history.map((frame) => frame.normalised[selectedSignal]);
  const points = history.length > 1
    ? history
        .map((frame) => `${((frame.time / 60) * 1000).toFixed(2)},${(88 - frame.normalised[selectedSignal] * 72).toFixed(2)}`)
        .join(" ")
    : "0,88";
  const healthTransitions = history.filter((frame, index) => index > 0 && frame.health !== history[index - 1].health);
  const deployEvents = history.filter((frame, index) => frame.deployEvent && !history[index - 1]?.deployEvent);
  const revealedMarkers = CAUSAL_MARKERS[scenario.id].filter((marker) => marker.time <= time);
  const latest = values.at(-1) ?? 0;

  return (
    <div className="timeline-wrap">
      <svg
        className="timeline"
        viewBox="0 0 1000 104"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${scenario.label} timeline for ${selectedSignal}; playhead ${time.toFixed(1)} seconds; current normalised value ${latest.toFixed(3)}`}
      >
        <defs>
          <linearGradient id="timelineFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="rgba(245,166,35,0.20)" />
            <stop offset="1" stopColor="rgba(245,166,35,0)" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((level) => (
          <line key={level} x1="0" x2="1000" y1={88 - level * 72} y2={88 - level * 72} className="timeline__grid" />
        ))}
        {scenario.phaseBoundaries.slice(1, -1).map((boundary) => (
          <line key={boundary} x1={(boundary / 60) * 1000} x2={(boundary / 60) * 1000} y1="8" y2="94" className="timeline__phase" />
        ))}
        <polyline points={points} className="timeline__signal" />
        {healthTransitions.map((frame) => (
          <g key={`health-${frame.time.toFixed(1)}`}>
            <line x1={(frame.time / 60) * 1000} x2={(frame.time / 60) * 1000} y1="8" y2="94" className="timeline__health" />
            <title>{`${frame.time.toFixed(1)}s health transition to ${frame.health}`}</title>
          </g>
        ))}
        {deployEvents.map((frame) => (
          <g key={`deploy-${frame.time.toFixed(1)}`}>
            <path d={`M${(frame.time / 60) * 1000 - 6} 8h12l-6 9z`} className="timeline__event" />
            <title>{`${frame.time.toFixed(1)}s synthetic deployment event`}</title>
          </g>
        ))}
        <line x1={(time / 60) * 1000} x2={(time / 60) * 1000} y1="4" y2="98" className="timeline__playhead" />
      </svg>
      <div className="timeline__axis" aria-hidden="true">
        <span>00:00</span><span>00:15</span><span>00:30</span><span>00:45</span><span>01:00</span>
      </div>
      <div className="timeline__causes" aria-label="Revealed causal events">
        {revealedMarkers.map((marker) => (
          <span key={`${marker.time}-${marker.label}`} style={{ left: `${(marker.time / 60) * 100}%` }}>
            <i />{marker.label}
          </span>
        ))}
      </div>
    </div>
  );
}
