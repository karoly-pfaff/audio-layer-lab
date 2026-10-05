export function formatTime(seconds: number): string {
  const t = Math.max(0, seconds);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const tenth = Math.floor((t % 1) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${tenth}`;
}

export function wrapLayerOffset(offset: number, duration: number): number {
  if (duration <= 0) {
    return 0;
  }
  return offset % duration;
}

export function mainPlaybackRatio(position: number, duration: number, loop: boolean): number {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  const safePosition = Math.max(0, position);
  return loop
    ? wrapLayerOffset(safePosition, duration) / duration
    : Math.min(safePosition / duration, 1);
}

export function resolveMasterGain(volume: number, muted: boolean): number {
  return muted ? 0 : volume;
}
