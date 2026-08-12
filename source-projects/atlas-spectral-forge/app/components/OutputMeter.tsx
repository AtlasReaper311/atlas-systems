"use client";

import { useEffect, useRef, useState } from "react";

interface MeterState {
  peakDb: number;
  rmsDb: number;
  peakLinear: number;
  rmsLinear: number;
}

const silence: MeterState = { peakDb: -60, rmsDb: -60, peakLinear: 0, rmsLinear: 0 };
const toDb = (value: number) => Math.max(-60, 20 * Math.log10(Math.max(value, 0.001)));

export function OutputMeter({
  analyser,
  active,
  muted,
  compact = false,
}: {
  analyser: AnalyserNode | null;
  active: boolean;
  muted: boolean;
  compact?: boolean;
}) {
  const [meter, setMeter] = useState<MeterState>(silence);
  const heldPeakRef = useRef(-60);

  useEffect(() => {
    if (!active || !analyser || muted) {
      queueMicrotask(() => setMeter(silence));
      return;
    }
    const buffer = new Float32Array(analyser.fftSize);
    let frame = 0;
    let previousUpdate = 0;
    const measure = (timestamp: number) => {
      frame = requestAnimationFrame(measure);
      if (timestamp - previousUpdate < 80) return;
      previousUpdate = timestamp;
      analyser.getFloatTimeDomainData(buffer);
      let peak = 0;
      let squareSum = 0;
      for (const sample of buffer) {
        const absolute = Math.abs(sample);
        if (absolute > peak) peak = absolute;
        squareSum += sample * sample;
      }
      const rms = Math.sqrt(squareSum / buffer.length);
      const peakDb = toDb(peak);
      const rmsDb = toDb(rms);
      heldPeakRef.current = Math.max(peakDb, heldPeakRef.current - 0.7);
      setMeter({
        peakDb: heldPeakRef.current,
        rmsDb,
        peakLinear: Math.max(0, Math.min(1, (heldPeakRef.current + 60) / 60)),
        rmsLinear: Math.max(0, Math.min(1, (rmsDb + 60) / 60)),
      });
    };
    frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [active, analyser, muted]);

  const status = !active ? "NO OUTPUT" : muted ? "MUTED" : "POST-MASTER ANALYSER";

  return (
    <section className={`output-meter ${compact ? "output-meter--compact" : ""}`} aria-label={`Actual audio output meter; ${status.toLowerCase()}`}>
      <div className="output-meter__header">
        <span>OUTPUT</span>
        <small>{status}</small>
      </div>
      <div className="output-meter__readout">
        <span><small>PEAK</small><strong>{active && !muted ? meter.peakDb.toFixed(1) : "−∞"} dBFS</strong></span>
        {!compact && <span><small>RMS</small><strong>{active && !muted ? meter.rmsDb.toFixed(1) : "−∞"} dBFS</strong></span>}
      </div>
      <div className="output-meter__track" aria-hidden="true">
        <i className="output-meter__rms" style={{ width: `${meter.rmsLinear * 100}%` }} />
        <i className="output-meter__peak" style={{ left: `${meter.peakLinear * 100}%` }} />
        <span className="output-meter__ceiling">−1</span>
      </div>
    </section>
  );
}
