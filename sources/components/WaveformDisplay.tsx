import { useEffect, useRef, useCallback } from 'react';
import { clampRatio } from '../utils/playbackNavigation';

interface WaveformDisplayProps {
  buffer: AudioBuffer | null;
  height?: number;
  color?: string;
  playhead?: number;
  duration?: number;
  onSeek?: (ratio: number) => void;
  accessibleLabel?: string;
}

const CANVAS_WIDTH = 800;
const TICK_INTERVAL = 30; // seconds

function renderWaveformToOffscreen(
  buffer: AudioBuffer | null,
  color: string,
  width: number,
  height: number,
  duration: number,
): HTMLCanvasElement {
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext('2d');
  if (!ctx) {
    return offscreen;
  }

  ctx.clearRect(0, 0, width, height);

  if (!buffer) {
    ctx.strokeStyle = color + '28';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 8]);
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    return offscreen;
  }

  const data = buffer.getChannelData(0);
  const step = Math.ceil(data.length / width);
  const amp = height / 2;

  const topY: number[] = [];
  const botY: number[] = [];
  for (let x = 0; x < width; x++) {
    let minS = 0,
      maxS = 0;
    const base = x * step;
    for (let j = 0; j < step; j++) {
      const s = data[base + j] ?? 0;
      if (s < minS) {
        minS = s;
      }
      if (s > maxS) {
        maxS = s;
      }
    }
    topY.push((1 + minS) * amp);
    botY.push((1 + maxS) * amp);
  }

  // Gradient fill — above center
  const gradUp = ctx.createLinearGradient(0, amp, 0, 0);
  gradUp.addColorStop(0, color + '00');
  gradUp.addColorStop(1, color + '3A');
  ctx.fillStyle = gradUp;
  ctx.beginPath();
  ctx.moveTo(0, amp);
  for (let x = 0; x < width; x++) {
    ctx.lineTo(x, topY[x] ?? amp);
  }
  ctx.lineTo(width, amp);
  ctx.closePath();
  ctx.fill();

  // Gradient fill — below center
  const gradDown = ctx.createLinearGradient(0, amp, 0, height);
  gradDown.addColorStop(0, color + '00');
  gradDown.addColorStop(1, color + '3A');
  ctx.fillStyle = gradDown;
  ctx.beginPath();
  ctx.moveTo(0, amp);
  for (let x = 0; x < width; x++) {
    ctx.lineTo(x, botY[x] ?? amp);
  }
  ctx.lineTo(width, amp);
  ctx.closePath();
  ctx.fill();

  // Stroke envelope
  ctx.strokeStyle = color + 'A8';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  for (let x = 0; x < width; x++) {
    if (x === 0) {
      ctx.moveTo(x, topY[x] ?? amp);
    } else {
      ctx.lineTo(x, topY[x] ?? amp);
      ctx.lineTo(x, botY[x] ?? amp);
    }
  }
  ctx.stroke();

  // 30-second tick marks
  if (duration > TICK_INTERVAL) {
    ctx.save();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    for (let t = TICK_INTERVAL; t < duration; t += TICK_INTERVAL) {
      const x = Math.floor((t / duration) * width);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    ctx.restore();
  }

  return offscreen;
}

export function WaveformDisplay({
  buffer,
  height = 48,
  color = '#00e5ff',
  playhead,
  duration = 0,
  onSeek,
  accessibleLabel = 'Seek position',
}: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const lastBufferRef = useRef<AudioBuffer | null>(null);
  const lastColorRef = useRef<string>('');
  const lastDurationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const w = CANVAS_WIDTH;
    const h = height;

    if (
      buffer !== lastBufferRef.current ||
      color !== lastColorRef.current ||
      duration !== lastDurationRef.current
    ) {
      lastBufferRef.current = buffer;
      lastColorRef.current = color;
      lastDurationRef.current = duration;
      offscreenRef.current = renderWaveformToOffscreen(buffer, color, w, h, duration);
    }

    ctx.clearRect(0, 0, w, h);
    if (offscreenRef.current) {
      ctx.drawImage(offscreenRef.current, 0, 0);
    }

    if (playhead !== undefined && playhead >= 0 && playhead <= 1 && buffer) {
      const x = Math.floor(playhead * w);
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.80)';
      ctx.lineWidth = 1;
      ctx.shadowColor = 'rgba(255, 255, 255, 0.45)';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.restore();
    }
  }, [buffer, color, height, playhead, duration]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!onSeek || !buffer) {
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = e.currentTarget.getBoundingClientRect();
      onSeek(clampRatio((e.clientX - rect.left) / rect.width));
    },
    [onSeek, buffer],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!onSeek || !buffer || e.buttons !== 1) {
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      onSeek(clampRatio((e.clientX - rect.left) / rect.width));
    },
    [onSeek, buffer],
  );

  const isSeekable = Boolean(onSeek && buffer);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (!onSeek || !buffer) {
        return;
      }
      const current = clampRatio(playhead ?? 0);
      let next: number | null = null;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        next = current - 0.01;
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        next = current + 0.01;
      } else if (e.key === 'Home') {
        next = 0;
      } else if (e.key === 'End') {
        next = 1;
      }
      if (next !== null) {
        e.preventDefault();
        onSeek(clampRatio(next));
      }
    },
    [buffer, onSeek, playhead],
  );

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={height}
      className={`waveform-canvas${isSeekable ? ' waveform-canvas--seekable' : ''}`}
      style={{ width: '100%', height, touchAction: isSeekable ? 'none' : undefined }}
      role={isSeekable ? 'slider' : undefined}
      tabIndex={isSeekable ? 0 : undefined}
      aria-label={isSeekable ? accessibleLabel : undefined}
      aria-valuenow={isSeekable && playhead !== undefined ? Math.round(playhead * 100) : undefined}
      aria-valuemin={isSeekable ? 0 : undefined}
      aria-valuemax={isSeekable ? 100 : undefined}
      aria-valuetext={
        isSeekable && playhead !== undefined ? `${Math.round(playhead * 100)}%` : undefined
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
    />
  );
}
