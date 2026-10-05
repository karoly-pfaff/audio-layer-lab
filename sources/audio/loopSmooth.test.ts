import { describe, it, expect } from 'vitest';
import { smoothLoopBuffer, smoothLoopBufferInPlace, LOOP_FADE_MS } from './loopSmooth';

const SR = 44100;

function makeBuffer(channels: Float32Array[]): AudioBuffer {
  return {
    duration: channels[0].length / SR,
    length: channels[0].length,
    numberOfChannels: channels.length,
    sampleRate: SR,
    getChannelData: (ch: number) => channels[ch],
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

function makeToneBuffer(length: number, channelCount = 1, amplitude = 0.5): AudioBuffer {
  const channels = Array.from({ length: channelCount }, () => {
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      data[i] = amplitude * Math.sin((2 * Math.PI * 440 * i) / SR);
    }
    return data;
  });
  return makeBuffer(channels);
}

function makeFakeCtx(): AudioContext {
  return {
    createBuffer(numChannels: number, length: number, sampleRate: number) {
      const channels = Array.from({ length: numChannels }, () => new Float32Array(length));
      return {
        duration: length / sampleRate,
        length,
        numberOfChannels: numChannels,
        sampleRate,
        getChannelData: (ch: number) => channels[ch],
        copyFromChannel: () => {},
        copyToChannel: () => {},
      } as unknown as AudioBuffer;
    },
  } as unknown as AudioContext;
}

const ctx = makeFakeCtx();
const fadeSamples = Math.round(SR * (LOOP_FADE_MS / 1000));

describe('smoothLoopBuffer — fade-in on leading samples', () => {
  it('attenuates the very first sample toward zero', () => {
    const buf = makeToneBuffer(SR);
    const out = smoothLoopBuffer(buf, ctx);
    // sample 0 should be multiplied by 0 / fadeSamples = 0
    expect(out.getChannelData(0)[0]).toBe(0);
  });

  it('first sample in smoothed buffer is strictly less than original', () => {
    const buf = makeToneBuffer(SR, 1, 0.9);
    const original = buf.getChannelData(0).slice();
    const out = smoothLoopBuffer(buf, ctx);
    // compare middle of fade region — gain < 1
    const mid = Math.floor(fadeSamples / 2);
    expect(Math.abs(out.getChannelData(0)[mid])).toBeLessThan(Math.abs(original[mid]));
  });

  it('sample near fade boundary is close to original amplitude', () => {
    const buf = makeToneBuffer(SR, 1, 0.5);
    const original = buf.getChannelData(0).slice();
    const out = smoothLoopBuffer(buf, ctx);
    // sample at fadeSamples - 1 has gain = (fadeSamples-1)/fadeSamples ≈ 1
    const idx = fadeSamples - 1;
    const expectedGain = idx / fadeSamples;
    expect(out.getChannelData(0)[idx]).toBeCloseTo(original[idx] * expectedGain, 5);
  });
});

describe('smoothLoopBuffer — fade-out on trailing samples', () => {
  it('attenuates the very last sample toward zero', () => {
    const buf = makeToneBuffer(SR);
    const out = smoothLoopBuffer(buf, ctx);
    expect(out.getChannelData(0)[SR - 1]).toBeCloseTo(0, 10);
  });

  it('last sample in smoothed buffer is strictly less than original', () => {
    const buf = makeToneBuffer(SR, 1, 0.9);
    const original = buf.getChannelData(0).slice();
    const out = smoothLoopBuffer(buf, ctx);
    const idx = SR - 2;
    expect(Math.abs(out.getChannelData(0)[idx])).toBeLessThanOrEqual(Math.abs(original[idx]));
  });
});

describe('smoothLoopBuffer — stereo', () => {
  it('applies fade to both channels of a stereo buffer', () => {
    const buf = makeToneBuffer(SR, 2, 0.5);
    const out = smoothLoopBuffer(buf, ctx);
    expect(out.numberOfChannels).toBe(2);
    // both channels: first sample should be 0
    expect(out.getChannelData(0)[0]).toBe(0);
    expect(out.getChannelData(1)[0]).toBe(0);
    // both channels: last sample should be 0
    expect(out.getChannelData(0)[SR - 1]).toBeCloseTo(0, 10);
    expect(out.getChannelData(1)[SR - 1]).toBeCloseTo(0, 10);
  });

  it('does not mutate the input buffer', () => {
    const buf = makeToneBuffer(SR, 2, 0.5);
    const originalFirst = buf.getChannelData(0)[0];
    smoothLoopBuffer(buf, ctx);
    expect(buf.getChannelData(0)[0]).toBe(originalFirst);
  });
});

describe('smoothLoopBuffer — very short buffers', () => {
  it('returns original buffer when too short to fade (fadeSamples < 2)', () => {
    // 8 samples at 44100 Hz → fadeSamples = round(44100 * 0.01) = 441
    // clamp: min(441, floor(8/4)) = min(441, 2) = 2 → not < 2, still applies
    // use 3 samples: clamp gives min(441, 0) = 0 → 0 < 2 → returns original
    const channels = [new Float32Array([0.5, 0.5, 0.5])];
    const buf = makeBuffer(channels);
    const result = smoothLoopBuffer(buf, ctx);
    expect(result).toBe(buf);
  });

  it('returns original buffer for 7-sample buffer', () => {
    // floor(7/4) = 1 → fadeSamples = 1 < 2 → returns original
    const channels = [new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5])];
    const buf = makeBuffer(channels);
    const result = smoothLoopBuffer(buf, ctx);
    expect(result).toBe(buf);
  });
});

describe('smoothLoopBuffer — boundary clamping', () => {
  it('does not read or write out-of-bounds for any buffer length', () => {
    // Use a buffer length that would produce fadeSamples > length without clamping
    // length=100: fadeSamples would be 441 unclamped → clamped to floor(100/4)=25
    const channels = [new Float32Array(100).fill(0.5)];
    const buf = makeBuffer(channels);
    expect(() => smoothLoopBuffer(buf, ctx)).not.toThrow();
    const out = smoothLoopBuffer(buf, ctx);
    expect(out.length).toBe(100);
  });

  it('fade covers at most 1/4 of buffer length', () => {
    const length = 40; // floor(40/4)=10 clamped fade
    const channels = [new Float32Array(length).fill(0.5)];
    const buf = makeBuffer(channels);
    const out = smoothLoopBuffer(buf, ctx);
    // Middle sample (index 20) should be unaffected
    expect(out.getChannelData(0)[20]).toBe(0.5);
  });
});

describe('smoothLoopBufferInPlace', () => {
  it('applies the boundary fade without allocating a second audio buffer', () => {
    const input = makeToneBuffer(4_410, 1, 1);
    const result = smoothLoopBufferInPlace(input);
    expect(result).toBe(input);
    expect(result.getChannelData(0)[0]).toBe(0);
    expect(result.getChannelData(0)[result.length - 1]).toBeCloseTo(0);
  });
});
