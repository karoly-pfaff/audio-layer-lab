export function computeRMS(data: Float32Array): number {
  if (data.length === 0) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const sample = data[i] ?? 0;
    sum += sample * sample;
  }
  return Math.sqrt(sum / data.length);
}

// Map RMS amplitude to 0..1 using a -60 dBFS..0 dBFS scale.
export function rmsToNormalized(rms: number): number {
  if (rms < 1e-6) {
    return 0;
  }
  const dBFS = 20 * Math.log10(rms);
  return Math.max(0, Math.min(1, (dBFS + 60) / 60));
}

export function smoothLevel(current: number, target: number, factor: number): number {
  return current * factor + target * (1 - factor);
}

export function clampLevel(value: number): number {
  return Math.max(0, Math.min(1, value));
}
