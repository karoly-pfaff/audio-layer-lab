import { describe, it, expect } from 'vitest';
import {
  formatTime,
  mainPlaybackRatio,
  wrapLayerOffset,
  resolveMasterGain,
} from './transportUtils';

describe('formatTime', () => {
  it('formats zero', () => {
    expect(formatTime(0)).toBe('0:00.0');
  });

  it('formats seconds only', () => {
    expect(formatTime(5)).toBe('0:05.0');
    expect(formatTime(59)).toBe('0:59.0');
  });

  it('formats minutes and seconds', () => {
    expect(formatTime(60)).toBe('1:00.0');
    expect(formatTime(90)).toBe('1:30.0');
    expect(formatTime(125)).toBe('2:05.0');
  });

  it('formats tenths of seconds', () => {
    expect(formatTime(0.5)).toBe('0:00.5');
    expect(formatTime(1.9)).toBe('0:01.9');
    expect(formatTime(30.3)).toBe('0:30.3');
  });

  it('clamps negative values to 0', () => {
    expect(formatTime(-1)).toBe('0:00.0');
  });

  it('pads seconds with leading zero', () => {
    expect(formatTime(61)).toBe('1:01.0');
    expect(formatTime(609)).toBe('10:09.0');
  });
});

describe('wrapLayerOffset', () => {
  it('wraps offset within duration', () => {
    expect(wrapLayerOffset(10, 8)).toBe(2);
  });

  it('returns 0 when offset equals duration', () => {
    expect(wrapLayerOffset(8, 8)).toBe(0);
  });

  it('returns offset unchanged when less than duration', () => {
    expect(wrapLayerOffset(3, 8)).toBe(3);
  });

  it('returns 0 for zero duration', () => {
    expect(wrapLayerOffset(10, 0)).toBe(0);
  });

  it('handles large offsets via double-wrap', () => {
    expect(wrapLayerOffset(25, 8)).toBe(1);
  });

  it('returns 0 for zero offset', () => {
    expect(wrapLayerOffset(0, 5)).toBe(0);
  });
});

describe('resolveMasterGain', () => {
  it('returns volume when not muted', () => {
    expect(resolveMasterGain(0.8, false)).toBe(0.8);
  });

  it('returns 0 when muted', () => {
    expect(resolveMasterGain(0.8, true)).toBe(0);
  });

  it('returns 0 when volume is 0 and not muted', () => {
    expect(resolveMasterGain(0, false)).toBe(0);
  });

  it('returns 1 at full volume unmuted', () => {
    expect(resolveMasterGain(1, false)).toBe(1);
  });
});

describe('mainPlaybackRatio', () => {
  it('tracks the audible loop phase after the first pass', () => {
    expect(mainPlaybackRatio(12, 10, true)).toBe(0.2);
  });

  it('clamps non-looping playback and invalid input', () => {
    expect(mainPlaybackRatio(12, 10, false)).toBe(1);
    expect(mainPlaybackRatio(Number.NaN, 10, true)).toBe(0);
    expect(mainPlaybackRatio(5, 0, true)).toBe(0);
  });
});
