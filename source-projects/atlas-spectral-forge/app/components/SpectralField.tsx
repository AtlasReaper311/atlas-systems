"use client";

import { useEffect, useMemo, useRef } from "react";
import { AudioParameters } from "../lib/audio-engine";
import {
  Mapping,
  PlaybackState,
  ScenarioId,
  SIGNAL_BY_ID,
  TARGET_BY_ID,
  TelemetryFrame,
  calculateMapping,
} from "../lib/signal-forge";

interface SpectralFieldProps {
  frame: TelemetryFrame;
  outputs: AudioParameters;
  scenarioId: ScenarioId;
  playback: PlaybackState;
  audioEnabled: boolean;
  muted: boolean;
  selectedMapping: Mapping | null;
  soloRoute: boolean;
  variant: "A" | "B";
  compact?: boolean;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const targetNormalised = (id: keyof AudioParameters, value: number) => {
  const definition = TARGET_BY_ID[id];
  return clamp((value - definition.min) / (definition.max - definition.min));
};

function tracePath(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  phase: number,
  divergence: number,
  density: number,
  asymmetry: number,
  trace: number,
) {
  const points = 420 + Math.round(density * 180);
  context.beginPath();
  for (let index = 0; index <= points; index += 1) {
    const t = (index / points) * Math.PI * 2;
    const crystal = 1 + Math.cos(t * (6 + trace)) * (0.035 + density * 0.035);
    const interference = Math.sin(t * (11 + trace * 2) + phase * 0.37) * divergence * 0.075;
    const leftPropagation = (1 - Math.cos(t)) * asymmetry * (trace === 1 ? 0.18 : 0.08);
    const x = centerX
      + Math.cos(t * 2 + phase * (0.16 + trace * 0.04)) * radiusX * (crystal + interference)
      + Math.sin(t * 5 + phase) * radiusX * divergence * 0.04
      - leftPropagation * radiusX;
    const y = centerY
      + Math.sin(t * (3 + trace * 0.18) + phase * (0.12 + divergence * 0.08)) * radiusY * (crystal - interference)
      + Math.cos(t * 7 - phase * 0.22) * radiusY * divergence * 0.07
      + Math.sin(t) * asymmetry * radiusY * 0.08;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

export function SpectralField({
  frame,
  outputs,
  scenarioId,
  playback,
  audioEnabled,
  muted,
  selectedMapping,
  soloRoute,
  variant,
  compact = false,
}: SpectralFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestRef = useRef({ frame, outputs, playback, selectedMapping, soloRoute });

  useEffect(() => {
    latestRef.current = { frame, outputs, playback, selectedMapping, soloRoute };
  }, [frame, outputs, playback, selectedMapping, soloRoute]);

  const selectedCalculation = selectedMapping
    ? calculateMapping(selectedMapping, frame.normalised[selectedMapping.source])
    : null;

  const accessibleSummary = useMemo(() => {
    const pressure = Math.round((frame.normalised.anomaly_score * 0.55 + frame.normalised.error_rate * 0.25 + frame.normalised.queue_depth * 0.2) * 100);
    const route = selectedMapping
      ? ` Selected route ${SIGNAL_BY_ID[selectedMapping.source].label} to ${TARGET_BY_ID[selectedMapping.target].label}.`
      : " Combined mapped sonic state.";
    return `Spectral Field for ${scenarioId}; ${frame.health.toLowerCase()} simulated state; structural pressure ${pressure} percent.${route}`;
  }, [frame, scenarioId, selectedMapping]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let animationFrame = 0;
    let previousTimestamp = performance.now();
    let visualTime = latestRef.current.frame.time;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = (timestamp: number) => {
      animationFrame = requestAnimationFrame(draw);
      const current = latestRef.current;
      const elapsed = Math.min(0.05, (timestamp - previousTimestamp) / 1000);
      previousTimestamp = timestamp;
      if (current.playback === "PLAYING" && !reducedMotion) visualTime += elapsed;
      else visualTime = current.frame.time;

      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#09090e";
      context.fillRect(0, 0, width, height);

      const values = current.frame.normalised;
      const filter = targetNormalised("filter_cutoff", current.outputs.filter_cutoff);
      const instability = targetNormalised("instability", current.outputs.instability);
      const density = targetNormalised("texture_density", current.outputs.texture_density);
      const pulse = targetNormalised("pulse_rate", current.outputs.pulse_rate);
      const widthState = targetNormalised("stereo_width", current.outputs.stereo_width);
      const errorTexture = targetNormalised("error_texture", current.outputs.error_texture);
      const brightness = targetNormalised("harmonic_brightness", current.outputs.harmonic_brightness);
      const pressure = clamp(values.anomaly_score * 0.48 + values.error_rate * 0.24 + values.queue_depth * 0.2 + values.cpu_load * 0.08);
      const cacheDisruption = clamp(1 - values.cache_hit_rate);
      const latencyStretch = 1 + values.latency_ms * 0.46;
      const asymmetry = clamp(cacheDisruption * 0.42 + instability * 0.38 + errorTexture * 0.2);
      const coherence = clamp(1 - pressure * 0.64 - instability * 0.22, 0.18, 1);
      const sourceFocus = current.selectedMapping ? values[current.selectedMapping.source] : 0.5;
      const focus = current.selectedMapping ? (current.soloRoute ? 1 : 0.62) : 0;

      const centerX = width * (0.5 + asymmetry * 0.035 * Math.sin(visualTime * 0.17));
      const centerY = height * (0.5 + pressure * 0.025);
      const baseRadius = Math.min(width, height) * (compact ? 0.29 : 0.33);
      const radiusX = baseRadius * (0.92 + widthState * 0.34) * (1 - pressure * 0.13);
      const radiusY = baseRadius * (0.78 + filter * 0.24) * latencyStretch;
      const phase = visualTime * (0.28 + pulse * 0.8);

      const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius * 1.55);
      glow.addColorStop(0, `rgba(116, 190, 255, ${0.035 + brightness * 0.045})`);
      glow.addColorStop(0.48, `rgba(108, 99, 255, ${0.02 + instability * 0.04})`);
      glow.addColorStop(1, "rgba(10,10,15,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      context.save();
      context.translate(centerX, centerY);
      context.rotate(asymmetry * 0.12 * Math.sin(phase * 0.37));
      context.translate(-centerX, -centerY);

      const spokes = 12;
      for (let ring = 1; ring <= 3; ring += 1) {
        context.beginPath();
        for (let index = 0; index <= spokes; index += 1) {
          const angle = (index / spokes) * Math.PI * 2;
          const fracture = 1 + Math.sin(angle * 5 + scenarioId.length + visualTime * 0.08) * pressure * 0.06;
          const x = centerX + Math.cos(angle) * radiusX * (ring / 3) * fracture;
          const y = centerY + Math.sin(angle) * radiusY * (ring / 3) * (1 + asymmetry * Math.cos(angle) * 0.09);
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.closePath();
        context.strokeStyle = `rgba(188, 228, 255, ${0.055 + coherence * 0.055 - ring * 0.008})`;
        context.lineWidth = Math.max(1, ratio * 0.55);
        context.stroke();
      }

      const hues = [
        [116, 208, 255],
        [127, 136, 255],
        [211, 203, 255],
      ];
      hues.forEach((rgb, trace) => {
        tracePath(
          context,
          centerX,
          centerY,
          radiusX * (0.76 + trace * 0.07),
          radiusY * (0.66 + trace * 0.06),
          phase + trace * 0.94,
          instability + pressure * 0.28,
          density,
          asymmetry,
          trace,
        );
        const selectedOpacity = current.selectedMapping ? (trace === Math.floor(sourceFocus * 3) % 3 ? 0.9 : 0.12) : 0.42 + coherence * 0.24;
        context.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${selectedOpacity})`;
        context.lineWidth = Math.max(1, ratio * (trace === 0 ? 1.05 : 0.72));
        context.shadowBlur = reducedMotion ? 0 : 7 * ratio * (brightness + 0.3);
        context.shadowColor = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.28)`;
        context.stroke();
      });

      if (current.selectedMapping) {
        const calculation = calculateMapping(current.selectedMapping, values[current.selectedMapping.source]);
        const beamY = centerY + (calculation.transformed - 0.5) * radiusY * 0.38;
        context.shadowBlur = current.soloRoute ? 14 * ratio : 6 * ratio;
        context.shadowColor = "rgba(245,166,35,0.5)";
        context.strokeStyle = `rgba(245,166,35,${0.42 + focus * 0.4})`;
        context.lineWidth = Math.max(1, ratio * (current.soloRoute ? 1.45 : 0.85));
        context.beginPath();
        context.moveTo(width * 0.06, centerY + (sourceFocus - 0.5) * radiusY * 0.5);
        context.bezierCurveTo(width * 0.28, centerY, width * 0.7, beamY, width * 0.94, beamY);
        context.stroke();
      }

      context.restore();

      context.shadowBlur = 0;
      context.fillStyle = "rgba(232,232,224,0.42)";
      context.font = `${Math.max(9, 10 * ratio)}px IBM Plex Mono, monospace`;
      context.textAlign = "center";
      context.fillText(current.soloRoute ? "ISOLATED ROUTE FIELD" : "COMBINED MAPPED FIELD", centerX, height - 16 * ratio);
    };

    animationFrame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrame);
  }, [compact, scenarioId]);

  return (
    <figure className={`spectral-field ${compact ? "spectral-field--compact" : ""} ${selectedMapping ? "is-inspecting" : ""} ${soloRoute ? "is-solo" : ""}`}>
      <canvas ref={canvasRef} role="img" aria-label={accessibleSummary} />
      <figcaption className="spectral-field__status">
        <span><i className={`field-status field-status--${playback.toLowerCase()}`} />{playback}</span>
        <span>MAPPING {variant}</span>
        <span>{audioEnabled ? (muted ? "MAPPED STATE / OUTPUT MUTED" : "MAPPED STATE / AUDIO OUTPUT") : "MAPPED STATE / AUDIO NOT ENABLED"}</span>
      </figcaption>
      {selectedMapping && selectedCalculation && (
        <div className="spectral-route-overlay" aria-label="Selected route through the Spectral Field">
          <span className="spectral-route-overlay__source">
            <small>{SIGNAL_BY_ID[selectedMapping.source].label}</small>
            <strong>{frame.values[selectedMapping.source].toFixed(SIGNAL_BY_ID[selectedMapping.source].decimals)} {SIGNAL_BY_ID[selectedMapping.source].unit}</strong>
          </span>
          <span className="spectral-route-overlay__transform">
            <small>{selectedMapping.transform}</small>
            <strong>{selectedCalculation.transformed.toFixed(3)}</strong>
          </span>
          <span className="spectral-route-overlay__target">
            <small>{TARGET_BY_ID[selectedMapping.target].label}</small>
            <strong>{selectedCalculation.output.toFixed(TARGET_BY_ID[selectedMapping.target].decimals)} {TARGET_BY_ID[selectedMapping.target].unit}</strong>
          </span>
        </div>
      )}
    </figure>
  );
}
