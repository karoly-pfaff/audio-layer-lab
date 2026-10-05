import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { AudioEngine as AudioEngineInstance } from './AudioEngine';

class FakeAudioParam {
  value = 0;
  targets: number[] = [];
  cancelledAt: number[] = [];
  values: Array<{ value: number; at: number }> = [];
  ramps: Array<{ value: number; at: number }> = [];

  setTargetAtTime(value: number): void {
    this.value = value;
    this.targets.push(value);
  }

  cancelScheduledValues(at: number): void {
    this.cancelledAt.push(at);
  }

  setValueAtTime(value: number, at: number): void {
    this.value = value;
    this.values.push({ value, at });
  }

  linearRampToValueAtTime(value: number, at: number): void {
    this.value = value;
    this.ramps.push({ value, at });
  }
}

class FakeNode {
  connect(): void {}
}

class FakeSource extends FakeNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  starts: Array<{ offset: number }> = [];
  stopped = false;
  throwOnStop = false;

  start(_when: number, offset: number): void {
    this.starts.push({ offset });
  }

  stop(): void {
    if (this.throwOnStop) {
      throw new Error('already stopped');
    }
    this.stopped = true;
  }
}

class FakeGain extends FakeNode {
  gain = new FakeAudioParam();
}

class FakePanner extends FakeNode {
  pan = new FakeAudioParam();
}

class FakeAnalyser extends FakeNode {
  fftSize = 256;
  smoothingTimeConstant = 0;
  sample = 0;

  getFloatTimeDomainData(array: Float32Array): void {
    array.fill(this.sample);
  }
}

class FakeContext {
  currentTime = 0;
  state = 'running';
  destination = {};
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  panners: FakePanner[] = [];
  analysers: FakeAnalyser[] = [];
  resumeCalls = 0;
  decodedInput: ArrayBuffer | null = null;
  decodedBuffer = makeBuffer();

  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }

  createBufferSource(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }

  createStereoPanner(): FakePanner {
    const panner = new FakePanner();
    this.panners.push(panner);
    return panner;
  }

  createChannelSplitter(): FakeNode {
    return new FakeNode();
  }

  createAnalyser(): FakeAnalyser {
    const analyser = new FakeAnalyser();
    this.analysers.push(analyser);
    return analyser;
  }

  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
    return makeBuffer(length, channels, sampleRate);
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    return Promise.resolve();
  }

  decodeAudioData(input: ArrayBuffer): Promise<AudioBuffer> {
    this.decodedInput = input;
    return Promise.resolve(this.decodedBuffer);
  }
}

function makeBuffer(length = 1, channels = 1, sampleRate = 100): AudioBuffer {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return {
    duration: length / sampleRate,
    length,
    numberOfChannels: channels,
    sampleRate,
    getChannelData: (channel: number) => data[channel]!,
  } as AudioBuffer;
}

type EngineConstructor = new (context?: AudioContext) => AudioEngineInstance;
let AudioEngine: EngineConstructor;

beforeAll(async () => {
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        return new FakeContext();
      }
    },
  );
  ({ AudioEngine } = await import('./AudioEngine'));
});

describe('AudioEngine', () => {
  it('exposes the context, resumes only suspended contexts, and decodes files', async () => {
    const context = new FakeContext();
    const engine = new AudioEngine(context as unknown as AudioContext);
    expect(engine.audioContext).toBe(context);

    await engine.resumeContext();
    expect(context.resumeCalls).toBe(0);
    context.state = 'suspended';
    await engine.resumeContext();
    context.state = 'interrupted';
    await engine.resumeContext();
    expect(context.resumeCalls).toBe(2);

    const bytes = new ArrayBuffer(8);
    const file = { arrayBuffer: vi.fn(async () => bytes) } as unknown as File;
    await expect(engine.decodeFile(file)).resolves.toBe(context.decodedBuffer);
    expect(file.arrayBuffer).toHaveBeenCalledOnce();
    expect(context.decodedInput).toBe(bytes);
  });

  it('clamps master controls and preserves volume changes while muted', () => {
    const context = new FakeContext();
    const engine = new AudioEngine(context as unknown as AudioContext);
    const master = context.gains[0]!.gain;

    engine.setMasterVolume(2);
    engine.setMasterMute(true);
    engine.setMasterVolume(0.35);
    engine.setMasterVolume(Number.NaN);
    engine.setMasterMute(false);

    expect(master.targets).toEqual([1, 0, 0.35]);
  });

  it('does not enter playing state without audio', () => {
    const engine = new AudioEngine(new FakeContext() as unknown as AudioContext);
    expect(engine.play()).toBe(false);
    expect(engine.playing).toBe(false);
  });

  it('controls an active main track, meters it, and clamps seeks', () => {
    const context = new FakeContext();
    const engine = new AudioEngine(context as unknown as AudioContext);
    const buffer = makeBuffer(1_000, 2, 100);
    engine.setMainVolume(0.4);
    engine.setMainPan(-0.25);
    engine.setMainLoop(true);
    engine.setMainBuffer(buffer);

    expect(engine.getMainDuration()).toBe(10);
    expect(engine.play()).toBe(true);
    expect(engine.play()).toBe(true);
    engine.setMainVolume(4);
    engine.setMainVolume(Number.NaN);
    engine.setMainPan(-4);
    engine.setMainPan(Number.POSITIVE_INFINITY);
    engine.setMainLoop(false);

    expect(context.gains[2]!.gain.targets).toEqual([1, 1]);
    expect(context.panners[0]!.pan.targets).toEqual([-1, -1]);
    expect(context.sources[0]!.loop).toBe(false);
    expect(context.gains[1]!.gain.cancelledAt).toEqual([0]);
    expect(context.gains[1]!.gain.values).toEqual([{ value: 0, at: 0 }]);
    expect(context.gains[1]!.gain.ramps[0]!.value).toBe(1);

    context.analysers[0]!.sample = 0.5;
    context.analysers[1]!.sample = 0.25;
    const levels = engine.getStereoLevels();
    expect(levels.left).toBeGreaterThan(levels.right);
    expect(levels.right).toBeGreaterThan(0);

    context.currentTime = 3;
    expect(engine.currentTime).toBe(3);
    engine.seek(20);
    expect(engine.currentTime).toBe(10);
    expect(engine.playing).toBe(true);
    engine.pause();
    expect(engine.currentTime).toBe(10);
    engine.pause();
    engine.seek(-5);
    expect(engine.currentTime).toBe(0);
    engine.seek(Number.NaN);
    expect(engine.currentTime).toBe(0);
  });

  it('seeks layer-only playback and wraps offsets to the loop duration', () => {
    const context = new FakeContext();
    const engine = new AudioEngine(context as unknown as AudioContext);
    engine.setLayerBuffer('loop', makeBuffer(200, 1, 100));
    expect(engine.getLayerDuration('loop')).toBe(2);
    expect(engine.getLayerDuration('missing')).toBe(0);
    engine.seek(5);
    expect(engine.currentTime).toBe(5);
    engine.play();
    expect(context.sources[0]!.starts[0]!.offset).toBe(1);

    engine.stop();
    engine.setLayerBuffer('zero', makeBuffer(0, 1, 100));
    engine.seek(4);
    engine.play();
    expect(context.sources[context.sources.length - 1]!.starts[0]!.offset).toBe(0);
  });

  it('keeps an absolute seek position when the main track loops', () => {
    const context = new FakeContext();
    const engine = new AudioEngine(context as unknown as AudioContext);
    engine.setMainBuffer(makeBuffer(1_000, 1, 100));
    engine.setMainLoop(true);

    engine.seek(17);
    expect(engine.currentTime).toBe(17);
    engine.play();
    expect(context.sources[0]!.starts[0]!.offset).toBe(7);
  });

  it('replaces the main source at the current offset while playing', () => {
    const context = new FakeContext();
    const engine = new AudioEngine(context as unknown as AudioContext);
    engine.setMainBuffer(makeBuffer(1_000, 1, 100));
    expect(engine.play()).toBe(true);
    context.currentTime = 2;
    engine.setMainBuffer(makeBuffer(1_000, 1, 100));
    expect(context.sources).toHaveLength(2);
    expect(context.sources[0]!.stopped).toBe(true);
    expect(context.sources[1]!.starts[0]!.offset).toBe(2);
    expect(engine.playing).toBe(true);
  });

  it('wraps a looped main offset when playback resumes after the buffer duration', () => {
    const context = new FakeContext();
    const engine = new AudioEngine(context as unknown as AudioContext);
    engine.setMainLoop(true);
    engine.setMainBuffer(makeBuffer(1_000, 1, 100));
    engine.play();
    context.currentTime = 12;
    engine.pause();
    engine.play();

    expect(context.sources[1]!.starts[0]!.offset).toBe(2);
  });

  it('starts a layer loaded during active playback', () => {
    const context = new FakeContext();
    const engine = new AudioEngine(context as unknown as AudioContext);
    engine.setMainBuffer(makeBuffer(1_000, 1, 100));
    engine.play();
    context.currentTime = 1.5;
    engine.setLayerBuffer('drums', makeBuffer(1_000, 1, 100));
    expect(context.sources).toHaveLength(2);
    expect(context.sources[1]!.starts[0]!.offset).toBe(1.5);
  });

  it('applies layer volume, pan, mute, solo, and replacement while playing', () => {
    const context = new FakeContext();
    const engine = new AudioEngine(context as unknown as AudioContext);
    engine.setLayerVolume('drums', 0.6);
    engine.setLayerVolume('drums', Number.NaN);
    engine.setLayerPan('drums', 0.4);
    engine.setLayerPan('drums', Number.NaN);
    engine.setLayerMute('drums', true);
    engine.setLayerBuffer('drums', makeBuffer(1_000, 1, 100));
    engine.play();

    const effectiveGain = context.gains[2]!.gain;
    expect(effectiveGain.value).toBe(0);
    expect(context.panners[0]!.pan.value).toBe(0.4);
    engine.setLayerMute('drums', false);
    engine.setLayerSolo('drums', true);
    engine.setLayerPan('drums', 4);
    expect(effectiveGain.targets[effectiveGain.targets.length - 1]).toBe(0.6);
    const panTargets = context.panners[0]!.pan.targets;
    expect(panTargets[panTargets.length - 1]).toBe(1);

    const firstSource = context.sources[0]!;
    engine.setLayerBuffer('drums', makeBuffer(500, 1, 100));
    expect(firstSource.stopped).toBe(true);
    expect(context.sources).toHaveLength(2);
  });

  it('recalculates effective gains after removing the soloed layer', () => {
    const context = new FakeContext();
    const engine = new AudioEngine(context as unknown as AudioContext);
    engine.setLayerBuffer('solo', makeBuffer());
    engine.setLayerBuffer('other', makeBuffer());
    engine.setLayerVolume('other', 0.7);
    engine.setLayerSolo('solo', true);
    engine.play();
    const otherEffectiveGain = context.gains[4]!;
    expect(otherEffectiveGain.gain.value).toBe(0);
    engine.removeLayerBuffer('solo');
    const targets = otherEffectiveGain.gain.targets;
    expect(targets[targets.length - 1]).toBe(0.7);
  });

  it('reports natural main-track completion and stops layer playback', () => {
    const context = new FakeContext();
    const engine = new AudioEngine(context as unknown as AudioContext);
    const ended = vi.fn();
    engine.setMainEndedHandler(ended);
    engine.setMainBuffer(makeBuffer());
    engine.setLayerBuffer('layer', makeBuffer());
    engine.play();
    context.sources[0]!.onended?.();
    expect(ended).toHaveBeenCalledOnce();
    expect(engine.playing).toBe(false);
    expect(context.sources[1]!.stopped).toBe(true);
  });

  it('ignores stale end events and completes after loop is disabled', () => {
    const context = new FakeContext();
    const engine = new AudioEngine(context as unknown as AudioContext);
    const ended = vi.fn();
    engine.setMainEndedHandler(ended);
    engine.setMainBuffer(makeBuffer());
    engine.play();
    const staleEnd = context.sources[0]!.onended;
    engine.setMainBuffer(makeBuffer());
    staleEnd?.();
    expect(engine.playing).toBe(true);
    expect(ended).not.toHaveBeenCalled();

    engine.stop();
    engine.setMainLoop(true);
    engine.play();
    const loopingSource = context.sources[context.sources.length - 1]!;
    expect(loopingSource.onended).toBeTypeOf('function');
    engine.setMainLoop(false);
    loopingSource.onended?.();
    expect(engine.playing).toBe(false);
    expect(ended).toHaveBeenCalledOnce();
  });

  it('clears main audio without stopping remaining layers', () => {
    const context = new FakeContext();
    const engine = new AudioEngine(context as unknown as AudioContext);
    engine.setMainBuffer(makeBuffer());
    engine.setLayerBuffer('bed', makeBuffer());
    engine.play();
    engine.clearMainBuffer();
    expect(engine.playing).toBe(true);
    expect(engine.getMainDuration()).toBe(0);
    engine.removeLayerBuffer('bed');
    expect(engine.playing).toBe(false);
  });

  it('clears the only main source and tolerates already-stopped nodes', () => {
    const context = new FakeContext();
    const engine = new AudioEngine(context as unknown as AudioContext);
    engine.setMainBuffer(makeBuffer());
    engine.play();
    context.sources[0]!.throwOnStop = true;
    expect(() => engine.clearMainBuffer()).not.toThrow();
    expect(engine.playing).toBe(false);

    engine.setLayerBuffer('fragile', makeBuffer());
    engine.play();
    context.sources[context.sources.length - 1]!.throwOnStop = true;
    expect(() => engine.removeLayerBuffer('fragile')).not.toThrow();
  });

  it('tolerates a layer throwing during natural main completion', () => {
    const context = new FakeContext();
    const engine = new AudioEngine(context as unknown as AudioContext);
    engine.setMainBuffer(makeBuffer());
    engine.setLayerBuffer('fragile', makeBuffer());
    engine.play();
    context.sources[1]!.throwOnStop = true;
    expect(() => context.sources[0]!.onended?.()).not.toThrow();
    expect(engine.playing).toBe(false);
  });

  it('stops when the last active audio source is removed', () => {
    const engine = new AudioEngine(new FakeContext() as unknown as AudioContext);
    engine.setLayerBuffer('only-layer', makeBuffer());
    engine.play();
    engine.removeLayerBuffer('only-layer');
    expect(engine.playing).toBe(false);
    expect(engine.currentTime).toBe(0);
  });

  it('resets a paused layer-only transport before a shorter main is loaded', () => {
    const context = new FakeContext();
    const engine = new AudioEngine(context as unknown as AudioContext);
    engine.setLayerBuffer('only-layer', makeBuffer(1_000, 1, 100));
    engine.play();
    context.currentTime = 3;
    engine.pause();
    expect(engine.currentTime).toBe(3);

    engine.removeLayerBuffer('only-layer');
    expect(engine.currentTime).toBe(0);
    engine.setMainBuffer(makeBuffer(100, 1, 100));
    engine.play();

    expect(context.sources[context.sources.length - 1]?.starts[0]?.offset).toBe(0);
  });
});
