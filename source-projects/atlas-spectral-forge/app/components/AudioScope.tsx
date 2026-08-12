"use client";

import { useEffect, useRef } from "react";

export function AudioScope({
  analyser,
  active,
  muted,
}: {
  analyser: AnalyserNode | null;
  active: boolean;
  muted: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let animationFrame = 0;
    let lastDraw = 0;
    const timeData = analyser ? new Uint8Array(analyser.fftSize) : null;
    const frequencyData = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    const draw = (timestamp: number) => {
      animationFrame = requestAnimationFrame(draw);
      if (timestamp - lastDraw < 33) return;
      lastDraw = timestamp;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      context.clearRect(0, 0, width, height);
      context.fillStyle = "#0a0a0f";
      context.fillRect(0, 0, width, height);
      context.strokeStyle = "rgba(255,255,255,0.055)";
      context.lineWidth = 1;
      for (let line = 1; line < 4; line += 1) {
        context.beginPath();
        context.moveTo(0, (height / 4) * line);
        context.lineTo(width, (height / 4) * line);
        context.stroke();
      }
      for (let line = 1; line < 8; line += 1) {
        context.beginPath();
        context.moveTo((width / 8) * line, 0);
        context.lineTo((width / 8) * line, height);
        context.stroke();
      }

      if (!active || !analyser || !timeData || !frequencyData) {
        context.strokeStyle = "rgba(255,255,255,0.19)";
        context.beginPath();
        context.moveTo(0, height / 2);
        context.lineTo(width, height / 2);
        context.stroke();
        return;
      }

      analyser.getByteTimeDomainData(timeData);
      analyser.getByteFrequencyData(frequencyData);

      context.strokeStyle = muted ? "rgba(170,169,160,0.42)" : "#f5a623";
      context.lineWidth = Math.max(1, ratio);
      context.beginPath();
      const step = width / (timeData.length - 1);
      timeData.forEach((value, index) => {
        const x = index * step;
        const amplitude = (value - 128) / 128;
        const y = Math.max(1, Math.min(height - 1, height / 2 + amplitude * height * 10));
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();

      const bars = 40;
      const barWidth = width / bars;
      for (let index = 0; index < bars; index += 1) {
        const frequencyIndex = Math.floor((index / bars) * Math.min(frequencyData.length, 220));
        const magnitude = Math.pow(frequencyData[frequencyIndex] / 255, 0.42);
        context.fillStyle = muted ? "rgba(170,169,160,0.08)" : `rgba(245,166,35,${0.035 + magnitude * 0.1})`;
        context.fillRect(index * barWidth, height - magnitude * height * 0.45, Math.max(1, barWidth - ratio), magnitude * height * 0.45);
      }
    };

    animationFrame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrame);
  }, [active, analyser, muted]);

  return (
    <div className="audio-scope">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={active ? `Real audio analyser waveform${muted ? ", output muted" : ""}` : "Audio analyser inactive until audio is enabled"}
      />
      <div className="audio-scope__labels" aria-hidden="true">
        <span>{active ? "TIME DOMAIN / FFT · 10× DISPLAY GAIN" : "ANALYSER INACTIVE"}</span>
        <span>{muted ? "MUTED" : active ? "PROCEDURAL BUS" : "NO AUDIO SIGNAL"}</span>
      </div>
    </div>
  );
}
