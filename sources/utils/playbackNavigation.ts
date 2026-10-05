export const JUMP_SECONDS = 5;

// Clamp a ratio (0–1) such as a pointer position within a waveform to [0, 1].
export function clampRatio(ratio: number): number {
  return Math.max(0, Math.min(1, ratio));
}

export function clampSeek(seconds: number, duration: number): number {
  if (duration <= 0) {
    return Math.max(0, seconds);
  }
  return Math.max(0, Math.min(seconds, duration));
}

export function jumpOffset(current: number, delta: number, duration: number): number {
  return clampSeek(current + delta, duration);
}

// Returns the looped playhead ratio [0, 1) for a layer waveform.
// Returns undefined when not applicable (not playing or zero-duration).
export function layerPlayhead(
  currentTime: number,
  duration: number,
  playing: boolean,
): number | undefined {
  if (!playing || duration <= 0) {
    return undefined;
  }
  return (currentTime % duration) / duration;
}
