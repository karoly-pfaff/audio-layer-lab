import { describe, it, expect } from 'vitest';
import { checkLoopHealth, loopHealthLabel } from './loopHealth';

const SR = 44100;

function makeBuffer(samples: Float32Array | number[], sampleRate = SR): AudioBuffer {
  const data = samples instanceof Float32Array ? samples : new Float32Array(samples);
  return {
    duration: data.length / sampleRate,
    length: data.length,
    numberOfChannels: 1,
    sampleRate,
    getChannelData: () => data,
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

function makeSilentBuffer(durationS: number, sampleRate = SR): AudioBuffer {
  return makeBuffer(new Float32Array(Math.round(durationS * sampleRate)), sampleRate);
}

function makeToneBuffer(durationS: number, amplitude = 0.5, sampleRate = SR): AudioBuffer {
  const len = Math.round(durationS * sampleRate);
  const data = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    data[i] = amplitude * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
  }
  return makeBuffer(data, sampleRate);
}

// ── tooShort ──────────────────────────────────────────────────────────────────

describe('checkLoopHealth — tooShort', () => {
  it('flags buffer shorter than 0.3s', () => {
    const buf = makeToneBuffer(0.1);
    expect(checkLoopHealth(buf)).toContain('tooShort');
  });

  it('flags exactly 0.1s buffer', () => {
    const buf = makeToneBuffer(0.1);
    expect(checkLoopHealth(buf)).toContain('tooShort');
  });

  it('does not flag a 0.5s tone buffer', () => {
    const buf = makeToneBuffer(0.5);
    expect(checkLoopHealth(buf)).not.toContain('tooShort');
  });

  it('returns only tooShort for very short buffers (skips other checks)', () => {
    const buf = makeToneBuffer(0.05);
    const issues = checkLoopHealth(buf);
    expect(issues).toEqual(['tooShort']);
  });
});

// ── loudBoundary ──────────────────────────────────────────────────────────────

describe('checkLoopHealth — loudBoundary', () => {
  it('flags buffer whose first sample exceeds threshold', () => {
    const data = new Float32Array(SR);
    data[0] = 0.9;
    const buf = makeBuffer(data);
    expect(checkLoopHealth(buf)).toContain('loudBoundary');
  });

  it('does not flag buffer with quiet first sample', () => {
    const buf = makeToneBuffer(1.0);
    const issues = checkLoopHealth(buf);
    expect(issues).not.toContain('loudBoundary');
  });

  it('does not flag first sample clearly below threshold', () => {
    const data = new Float32Array(SR);
    data[0] = 0.1;
    const buf = makeBuffer(data);
    expect(checkLoopHealth(buf)).not.toContain('loudBoundary');
  });

  it('flags first sample clearly above threshold', () => {
    const data = new Float32Array(SR);
    data[0] = 0.5;
    const buf = makeBuffer(data);
    expect(checkLoopHealth(buf)).toContain('loudBoundary');
  });
});

// ── leadingSilence ────────────────────────────────────────────────────────────

describe('checkLoopHealth — leadingSilence', () => {
  it('flags buffer with silent first 10%', () => {
    const len = SR;
    const data = new Float32Array(len);
    // first 10% silent, rest loud
    for (let i = Math.floor(len * 0.1); i < len; i++) {
      data[i] = 0.5;
    }
    const buf = makeBuffer(data);
    expect(checkLoopHealth(buf)).toContain('leadingSilence');
  });

  it('does not flag buffer with loud start', () => {
    const buf = makeToneBuffer(1.0, 0.5);
    const issues = checkLoopHealth(buf);
    expect(issues).not.toContain('leadingSilence');
  });
});

// ── trailingSilence ───────────────────────────────────────────────────────────

describe('checkLoopHealth — trailingSilence', () => {
  it('flags buffer with silent last 10%', () => {
    const len = SR;
    const data = new Float32Array(len);
    // first 90% loud, last 10% silent
    for (let i = 0; i < Math.floor(len * 0.9); i++) {
      data[i] = 0.5;
    }
    const buf = makeBuffer(data);
    expect(checkLoopHealth(buf)).toContain('trailingSilence');
  });

  it('does not flag buffer with loud end', () => {
    const buf = makeToneBuffer(1.0, 0.5);
    const issues = checkLoopHealth(buf);
    expect(issues).not.toContain('trailingSilence');
  });
});

// ── clean buffer ─────────────────────────────────────────────────────────────

describe('checkLoopHealth — clean buffer', () => {
  it('returns empty array for a clean tone loop', () => {
    const buf = makeToneBuffer(2.0, 0.3);
    expect(checkLoopHealth(buf)).toEqual([]);
  });
});

// ── fully silent buffer ───────────────────────────────────────────────────────

describe('checkLoopHealth — fully silent', () => {
  it('flags leadingSilence and trailingSilence for a 1s silent buffer', () => {
    const buf = makeSilentBuffer(1.0);
    const issues = checkLoopHealth(buf);
    expect(issues).toContain('leadingSilence');
    expect(issues).toContain('trailingSilence');
    expect(issues).not.toContain('tooShort');
  });
});

// ── loopHealthLabel ───────────────────────────────────────────────────────────

describe('loopHealthLabel', () => {
  it('returns a non-empty string for each issue type', () => {
    const types = ['tooShort', 'loudBoundary', 'leadingSilence', 'trailingSilence'] as const;
    for (const t of types) {
      expect(loopHealthLabel(t).length).toBeGreaterThan(0);
    }
  });
});
