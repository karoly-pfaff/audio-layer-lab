import { describe, it, expect } from 'vitest';
import { computeRMS, rmsToNormalized, smoothLevel, clampLevel } from './meters';

describe('computeRMS', () => {
  it('returns 0 for silence', () => {
    expect(computeRMS(new Float32Array(256).fill(0))).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(computeRMS(new Float32Array(0))).toBe(0);
  });

  it('returns the constant value for a DC signal', () => {
    expect(computeRMS(new Float32Array(256).fill(0.5))).toBeCloseTo(0.5, 5);
  });

  it('returns ~0.707 for a full-scale sine wave', () => {
    const N = 512;
    const data = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      data[i] = Math.sin((2 * Math.PI * i) / N);
    }
    expect(computeRMS(data)).toBeCloseTo(Math.SQRT1_2, 2);
  });

  it('is always non-negative even for negative-only signals', () => {
    expect(computeRMS(new Float32Array(16).fill(-0.8))).toBeGreaterThanOrEqual(0);
  });
});

describe('rmsToNormalized', () => {
  it('returns 0 for silence', () => {
    expect(rmsToNormalized(0)).toBe(0);
  });

  it('returns 0 for values below threshold', () => {
    expect(rmsToNormalized(1e-7)).toBe(0);
  });

  it('returns 1 for full-scale DC (rms = 1)', () => {
    expect(rmsToNormalized(1)).toBe(1);
  });

  it('returns 0.5 for -30 dBFS', () => {
    const rms = Math.pow(10, -30 / 20);
    expect(rmsToNormalized(rms)).toBeCloseTo(0.5, 5);
  });

  it('clamps over-full-scale values to 1', () => {
    expect(rmsToNormalized(2)).toBe(1);
  });

  it('clamps negative rms to 0', () => {
    // negative input is below the 1e-6 threshold
    expect(rmsToNormalized(-1)).toBe(0);
  });
});

describe('smoothLevel', () => {
  it('returns target when factor is 0', () => {
    expect(smoothLevel(0.8, 0.2, 0)).toBeCloseTo(0.2, 5);
  });

  it('returns current when factor is 1', () => {
    expect(smoothLevel(0.8, 0.2, 1)).toBeCloseTo(0.8, 5);
  });

  it('interpolates midpoint at factor 0.5', () => {
    expect(smoothLevel(1.0, 0.0, 0.5)).toBeCloseTo(0.5, 5);
  });
});

describe('clampLevel', () => {
  it('clamps below 0 to 0', () => {
    expect(clampLevel(-0.5)).toBe(0);
  });

  it('clamps above 1 to 1', () => {
    expect(clampLevel(1.5)).toBe(1);
  });

  it('passes through values in range', () => {
    expect(clampLevel(0)).toBe(0);
    expect(clampLevel(0.5)).toBe(0.5);
    expect(clampLevel(1)).toBe(1);
  });
});
