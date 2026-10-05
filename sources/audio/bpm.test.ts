import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  normalizeBpm,
  maybeHalfDoubleMatch,
  getBpmRelation,
  areBpmsCompatible,
  formatBpm,
  detectBpm,
  resetBpmSchedulerForTests,
} from './bpm';
import { analyzeBpmSamples } from './bpmAlgorithm';

afterEach(() => {
  resetBpmSchedulerForTests();
  vi.unstubAllGlobals();
});

// ── normalizeBpm ──────────────────────────────────────────────────────────────

describe('normalizeBpm', () => {
  it('returns value already in [60, 120) unchanged', () => {
    expect(normalizeBpm(90)).toBe(90);
    expect(normalizeBpm(60)).toBe(60);
  });

  it('halves values at or above 120', () => {
    expect(normalizeBpm(120)).toBe(60);
    expect(normalizeBpm(140)).toBeCloseTo(70);
  });

  it('doubles values below 60', () => {
    expect(normalizeBpm(40)).toBe(80);
    expect(normalizeBpm(30)).toBe(60);
  });

  it('handles 240 (two halvings)', () => {
    expect(normalizeBpm(240)).toBe(60);
  });
});

// ── maybeHalfDoubleMatch ──────────────────────────────────────────────────────

describe('maybeHalfDoubleMatch', () => {
  it('matches 70 vs 140 (exact double)', () => {
    expect(maybeHalfDoubleMatch(70, 140)).toBe(true);
  });

  it('matches 85 vs 170 (exact double)', () => {
    expect(maybeHalfDoubleMatch(85, 170)).toBe(true);
  });

  it('matches equal values', () => {
    expect(maybeHalfDoubleMatch(120, 120)).toBe(true);
  });

  it('matches values close after normalization', () => {
    expect(maybeHalfDoubleMatch(100, 102)).toBe(true);
  });

  it('handles detector tolerance across the 60/120 octave boundary', () => {
    expect(maybeHalfDoubleMatch(60, 119.9)).toBe(true);
    expect(maybeHalfDoubleMatch(59.9, 120)).toBe(true);
    expect(maybeHalfDoubleMatch(61, 119)).toBe(true);
  });

  it('returns false for unrelated tempos', () => {
    expect(maybeHalfDoubleMatch(80, 120)).toBe(false);
  });
});

// ── getBpmRelation ────────────────────────────────────────────────────────────

describe('getBpmRelation', () => {
  it('returns compatible for values within 2 BPM', () => {
    expect(getBpmRelation(120, 121)).toBe('compatible');
    expect(getBpmRelation(120, 120)).toBe('compatible');
  });

  it('returns close for values within 5 BPM', () => {
    expect(getBpmRelation(120, 124)).toBe('close');
    expect(getBpmRelation(100, 95)).toBe('close');
  });

  it('returns halfDouble for half/double relations', () => {
    expect(getBpmRelation(70, 140)).toBe('halfDouble');
    expect(getBpmRelation(85, 170)).toBe('halfDouble');
  });

  it('returns mismatch for unrelated tempos', () => {
    expect(getBpmRelation(90, 130)).toBe('mismatch');
    expect(getBpmRelation(60, 95)).toBe('mismatch');
  });
});

// ── areBpmsCompatible ─────────────────────────────────────────────────────────

describe('areBpmsCompatible', () => {
  it('is true for compatible', () => {
    expect(areBpmsCompatible(120, 121)).toBe(true);
  });

  it('is true for close', () => {
    expect(areBpmsCompatible(120, 124)).toBe(true);
  });

  it('is true for halfDouble', () => {
    expect(areBpmsCompatible(70, 140)).toBe(true);
  });

  it('is false for mismatch', () => {
    expect(areBpmsCompatible(90, 130)).toBe(false);
  });
});

// ── formatBpm ─────────────────────────────────────────────────────────────────

describe('formatBpm', () => {
  it('returns empty string for null', () => {
    expect(formatBpm(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatBpm(undefined)).toBe('');
  });

  it('formats integer BPM without prefix', () => {
    expect(formatBpm(120)).toBe('120 BPM');
  });

  it('rounds fractional BPM to nearest integer', () => {
    expect(formatBpm(124.7)).toBe('125 BPM');
    expect(formatBpm(92.3)).toBe('92 BPM');
  });

  it('adds ~ prefix for low confidence', () => {
    expect(formatBpm(92, 'low')).toBe('~92 BPM');
  });

  it('does not add prefix for high confidence', () => {
    expect(formatBpm(120, 'high')).toBe('120 BPM');
  });

  it('does not add prefix for medium confidence', () => {
    expect(formatBpm(120, 'medium')).toBe('120 BPM');
  });

  it('does not add prefix when confidence is undefined', () => {
    expect(formatBpm(120, undefined)).toBe('120 BPM');
  });
});

// ── normalizeBpm boundary conditions ──────────────────────────────────────────

describe('normalizeBpm boundary conditions', () => {
  it('returns 119.9 unchanged (just below 120)', () => {
    expect(normalizeBpm(119.9)).toBeCloseTo(119.9);
  });

  it('folds 120 down to 60 (boundary inclusive)', () => {
    expect(normalizeBpm(120)).toBe(60);
  });

  it('handles very high BPM via repeated halving (480 → 60)', () => {
    expect(normalizeBpm(480)).toBe(60);
  });

  it('handles very low BPM via repeated doubling (15 → 60)', () => {
    expect(normalizeBpm(15)).toBe(60);
  });

  it('handles 300 BPM correctly (300 → 75)', () => {
    expect(normalizeBpm(300)).toBeCloseTo(75);
  });
});

// ── getBpmRelation boundary ───────────────────────────────────────────────────

describe('getBpmRelation boundary conditions', () => {
  it('returns compatible for exact diff of 2', () => {
    expect(getBpmRelation(100, 102)).toBe('compatible');
  });

  it('returns close for exact diff of 5', () => {
    expect(getBpmRelation(100, 105)).toBe('close');
  });

  it('returns mismatch for diff of 6 with no half/double relation', () => {
    expect(getBpmRelation(100, 106)).toBe('mismatch');
  });

  it('returns halfDouble for triple-tempo relation (75 vs 300)', () => {
    // normalizeBpm(75) = 75, normalizeBpm(300) = 75 — exact match
    expect(getBpmRelation(75, 300)).toBe('halfDouble');
  });
});

// ── formatBpm edge cases ──────────────────────────────────────────────────────

describe('formatBpm edge cases', () => {
  it('returns empty string for null confidence with null bpm', () => {
    expect(formatBpm(null, null)).toBe('');
  });

  it('adds ~ prefix for low confidence regardless of integer/fractional value', () => {
    expect(formatBpm(128.4, 'low')).toBe('~128 BPM');
  });

  it('does not add prefix for null confidence argument', () => {
    expect(formatBpm(110, null)).toBe('110 BPM');
  });
});

// ── detectBpm (async smoke test) ──────────────────────────────────────────────

describe('detectBpm', () => {
  function makeAudioBuffer(durationS: number, sampleRate = 44100, channels = 1): AudioBuffer {
    const len = Math.round(durationS * sampleRate);
    const data = new Float32Array(len);
    // Synthesize a 120 BPM pulse (2 Hz beat) to give music-tempo detectable content
    const beatInterval = sampleRate / 2;
    for (let i = 0; i < len; i++) {
      if (i % beatInterval < sampleRate * 0.01) {
        data[i] = 0.8;
      }
    }
    return {
      duration: durationS,
      length: len,
      numberOfChannels: channels,
      sampleRate,
      getChannelData: () => data,
      copyFromChannel: () => {},
      copyToChannel: () => {},
    } as unknown as AudioBuffer;
  }

  it('returns null or a valid BpmResult for a 30s pulse signal (no throw)', async () => {
    const result = await detectBpm(makeAudioBuffer(30, 8_000));
    expect(result === null || (typeof result.bpm === 'number' && result.bpm > 0)).toBe(true);
  });

  it('returns null gracefully for a very short buffer (no throw)', async () => {
    const result = await detectBpm(makeAudioBuffer(0.1));
    expect(result === null || typeof result.bpm === 'number').toBe(true);
  });

  it('returns null or valid result for silent buffer (no throw)', async () => {
    const len = 44100 * 5;
    const silentBuffer = {
      duration: 5,
      length: len,
      numberOfChannels: 1,
      sampleRate: 44100,
      getChannelData: () => new Float32Array(len),
      copyFromChannel: () => {},
      copyToChannel: () => {},
    } as unknown as AudioBuffer;
    const result = await detectBpm(silentBuffer);
    expect(result).toBeNull();
  });

  it('handles stereo buffer without throwing', async () => {
    const result = await detectBpm(makeAudioBuffer(10, 44100, 2));
    expect(result === null || (typeof result.bpm === 'number' && result.bpm > 0)).toBe(true);
  });

  it('runs analysis in a worker and returns its validated result', async () => {
    class FakeWorker {
      onmessage: ((event: MessageEvent<{ bpm: number | null }>) => void) | null = null;
      onerror: (() => void) | null = null;
      terminate = vi.fn();

      postMessage(): void {
        queueMicrotask(() => this.onmessage?.({ data: { bpm: 120 } } as MessageEvent));
      }
    }
    vi.stubGlobal('Worker', FakeWorker);

    await expect(detectBpm(makeAudioBuffer(1, 8_000))).resolves.toEqual({
      bpm: 120,
      confidence: 'high',
    });
  });

  it('cancels active worker analysis', async () => {
    const terminate = vi.fn();
    class HangingWorker {
      onmessage = null;
      onerror = null;
      terminate = terminate;
      postMessage(): void {}
    }
    vi.stubGlobal('Worker', HangingWorker);
    const controller = new AbortController();
    const pending = detectBpm(makeAudioBuffer(1, 8_000), controller.signal);
    await Promise.resolve();
    controller.abort();

    await expect(pending).resolves.toBeNull();
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it('handles worker errors and validates medium, low, and missing tempo results', async () => {
    const responses: Array<number | null> = [50, 30, null, Number.NaN];
    class RespondingWorker {
      onmessage: ((event: MessageEvent<{ bpm: number | null }>) => void) | null = null;
      onerror: (() => void) | null = null;
      terminate(): void {}
      postMessage(): void {
        const bpm = responses.shift() ?? null;
        queueMicrotask(() => this.onmessage?.({ data: { bpm } } as MessageEvent));
      }
    }
    vi.stubGlobal('Worker', RespondingWorker);
    await expect(detectBpm(makeAudioBuffer(0.1))).resolves.toMatchObject({
      confidence: 'medium',
    });
    await expect(detectBpm(makeAudioBuffer(0.1))).resolves.toMatchObject({ confidence: 'low' });
    await expect(detectBpm(makeAudioBuffer(0.1))).resolves.toBeNull();
    await expect(detectBpm(makeAudioBuffer(0.1))).resolves.toBeNull();

    class FailingWorker extends RespondingWorker {
      override postMessage(): void {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Worker', FailingWorker);
    await expect(detectBpm(makeAudioBuffer(0.1))).resolves.toBeNull();
  });

  it('bounds its worker queue and handles cancellation or input failures', async () => {
    class HangingWorker {
      onmessage = null;
      onerror = null;
      terminate(): void {}
      postMessage(): void {}
    }
    vi.stubGlobal('Worker', HangingWorker);
    const pending = Array.from({ length: 5 }, () => detectBpm(makeAudioBuffer(0.1)));
    await Promise.resolve();
    resetBpmSchedulerForTests();
    await expect(Promise.all(pending)).resolves.toEqual([null, null, null, null, null]);

    const aborted = new AbortController();
    aborted.abort();
    await expect(detectBpm(makeAudioBuffer(0.1), aborted.signal)).resolves.toBeNull();
    await expect(
      detectBpm({
        ...makeAudioBuffer(0.1),
        getChannelData: () => {
          throw new Error('unavailable channel');
        },
      } as AudioBuffer),
    ).resolves.toBeNull();
  });

  it('yields while mixing a longer buffer before dispatching worker analysis', async () => {
    class FakeWorker {
      onmessage: ((event: MessageEvent<{ bpm: number | null }>) => void) | null = null;
      onerror = null;
      terminate(): void {}
      postMessage(): void {
        queueMicrotask(() => this.onmessage?.({ data: { bpm: 120 } } as MessageEvent));
      }
    }
    vi.stubGlobal('Worker', FakeWorker);
    await expect(detectBpm(makeAudioBuffer(33, 8_000))).resolves.toMatchObject({ bpm: 120 });
  });
});

describe('BPM algorithm sample-rate handling', () => {
  function pulseSignal(sampleRate: number): Float32Array {
    const data = new Float32Array(sampleRate * 15);
    const beatInterval = sampleRate / 2;
    for (let index = 0; index < data.length; index++) {
      if (index % beatInterval < sampleRate * 0.01) {
        data[index] = 0.8;
      }
    }
    return data;
  }

  it.each([44_100, 48_000, 96_000])(
    'detects a 120 BPM pulse at %i Hz',
    (sampleRate) => {
      const result = analyzeBpmSamples(pulseSignal(sampleRate), sampleRate);
      expect(result).not.toBeNull();
      expect(result!).toBeGreaterThanOrEqual(119);
      expect(result!).toBeLessThanOrEqual(121);
    },
    15_000,
  );

  it('rejects invalid inputs and non-finite tempo extraction results', () => {
    expect(analyzeBpmSamples(new Float32Array(), 44_100)).toBeNull();
    expect(analyzeBpmSamples(new Float32Array([1]), 0)).toBeNull();
    expect(analyzeBpmSamples(new Float32Array([1]), Number.NaN)).toBeNull();
  });
});
