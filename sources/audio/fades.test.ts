import { describe, it, expect, vi } from 'vitest';
import { applyFadeIn, FADE_IN_S } from './fades';

function makeFakeGainNode() {
  return {
    gain: {
      value: 1,
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
  } as unknown as GainNode;
}

describe('applyFadeIn', () => {
  it('cancels scheduled values before ramping', () => {
    const gn = makeFakeGainNode();
    const ctx = { currentTime: 0.5 } as AudioContext;
    applyFadeIn(gn, ctx, 0.8);
    expect(gn.gain.cancelScheduledValues).toHaveBeenCalledWith(0.5);
  });

  it('sets gain to 0 at current time', () => {
    const gn = makeFakeGainNode();
    const ctx = { currentTime: 1.0 } as AudioContext;
    applyFadeIn(gn, ctx, 0.8);
    expect(gn.gain.setValueAtTime).toHaveBeenCalledWith(0, 1.0);
  });

  it('ramps to targetGain over FADE_IN_S', () => {
    const gn = makeFakeGainNode();
    const ctx = { currentTime: 0 } as AudioContext;
    applyFadeIn(gn, ctx, 0.75);
    expect(gn.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.75, FADE_IN_S);
  });

  it('clamps negative targetGain to 0', () => {
    const gn = makeFakeGainNode();
    const ctx = { currentTime: 0 } as AudioContext;
    applyFadeIn(gn, ctx, -0.5);
    expect(gn.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, FADE_IN_S);
  });

  it('passes targetGain of 1 through unchanged', () => {
    const gn = makeFakeGainNode();
    const ctx = { currentTime: 2.5 } as AudioContext;
    applyFadeIn(gn, ctx, 1);
    expect(gn.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 2.5 + FADE_IN_S);
  });

  it('FADE_IN_S is 15ms', () => {
    expect(FADE_IN_S).toBe(0.015);
  });
});
