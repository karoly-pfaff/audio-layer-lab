import { describe, it, expect } from 'vitest';
import { resolveLayerGain, anyLayerSoloed, resolveAllLayerGains } from './mixer';
import type { LayerState } from './types';

const fakeBuffer = {} as AudioBuffer;

function makeLayer(overrides: Partial<LayerState> = {}): LayerState {
  return {
    id: 'layer-0',
    name: '',
    buffer: null,
    volume: 1,
    muted: false,
    loop: true,
    thumbnailUrl: null,
    loadingState: 'empty',
    metadata: null,
    pan: 0,
    soloed: false,
    order: 0,
    ...overrides,
  };
}

describe('resolveLayerGain', () => {
  it('returns volume when not muted and no solo', () => {
    const layer = makeLayer({ volume: 0.7 });
    expect(resolveLayerGain(layer, false)).toBe(0.7);
  });

  it('returns 0 when muted', () => {
    const layer = makeLayer({ volume: 0.8, muted: true });
    expect(resolveLayerGain(layer, false)).toBe(0);
  });

  it('returns 0 when not soloed but another is soloed', () => {
    const layer = makeLayer({ soloed: false });
    expect(resolveLayerGain(layer, true)).toBe(0);
  });

  it('returns volume when soloed and others are soloed', () => {
    const layer = makeLayer({ volume: 0.6, soloed: true });
    expect(resolveLayerGain(layer, true)).toBe(0.6);
  });

  it('mute takes priority over solo', () => {
    const layer = makeLayer({ muted: true, soloed: true, volume: 1 });
    expect(resolveLayerGain(layer, true)).toBe(0);
  });
});

describe('anyLayerSoloed', () => {
  it('returns false when no layers are soloed', () => {
    const layers = [makeLayer(), makeLayer({ order: 1 })];
    expect(anyLayerSoloed(layers)).toBe(false);
  });

  it('returns true when at least one loaded layer is soloed', () => {
    const layers = [makeLayer(), makeLayer({ order: 1, soloed: true, buffer: fakeBuffer })];
    expect(anyLayerSoloed(layers)).toBe(true);
  });
});

describe('resolveAllLayerGains', () => {
  it('all layers full gain when none muted or soloed', () => {
    const layers = [makeLayer({ order: 0, volume: 0.5 }), makeLayer({ order: 1, volume: 0.8 })];
    expect(resolveAllLayerGains(layers)).toEqual([0.5, 0.8]);
  });

  it('silences non-soloed layers when one loaded layer is soloed', () => {
    const layers = [
      makeLayer({ order: 0, volume: 0.5, soloed: false }),
      makeLayer({ order: 1, volume: 0.8, soloed: true, buffer: fakeBuffer }),
      makeLayer({ order: 2, volume: 1.0, soloed: false }),
    ];
    const gains = resolveAllLayerGains(layers);
    expect(gains[0]).toBe(0);
    expect(gains[1]).toBe(0.8);
    expect(gains[2]).toBe(0);
  });

  it('silences muted layers', () => {
    const layers = [
      makeLayer({ order: 0, volume: 0.9, muted: true }),
      makeLayer({ order: 1, volume: 0.7 }),
    ];
    const gains = resolveAllLayerGains(layers);
    expect(gains[0]).toBe(0);
    expect(gains[1]).toBe(0.7);
  });
});

describe('solo safety — pending layers', () => {
  it('soloed pending layer does not mute loaded non-solo layer', () => {
    const layers = [
      makeLayer({ order: 0, volume: 0.8, buffer: fakeBuffer }),
      makeLayer({ order: 1, soloed: true, buffer: null }),
    ];
    const gains = resolveAllLayerGains(layers);
    expect(gains[0]).toBe(0.8);
  });

  it('soloed loaded layer mutes loaded non-solo layers', () => {
    const layers = [
      makeLayer({ order: 0, volume: 0.8, buffer: fakeBuffer }),
      makeLayer({ order: 1, volume: 0.6, soloed: true, buffer: fakeBuffer }),
    ];
    const gains = resolveAllLayerGains(layers);
    expect(gains[0]).toBe(0);
    expect(gains[1]).toBe(0.6);
  });

  it('multiple loaded solo layers all remain audible', () => {
    const layers = [
      makeLayer({ order: 0, volume: 0.8, soloed: true, buffer: fakeBuffer }),
      makeLayer({ order: 1, volume: 0.6, soloed: true, buffer: fakeBuffer }),
      makeLayer({ order: 2, volume: 1.0, buffer: fakeBuffer }),
    ];
    const gains = resolveAllLayerGains(layers);
    expect(gains[0]).toBe(0.8);
    expect(gains[1]).toBe(0.6);
    expect(gains[2]).toBe(0);
  });

  it('unloaded layers are ignored in solo calculation', () => {
    const layers = [
      makeLayer({ order: 0, volume: 0.7, soloed: true, buffer: null }),
      makeLayer({ order: 1, volume: 0.9, buffer: null }),
      makeLayer({ order: 2, volume: 1.0, buffer: fakeBuffer }),
    ];
    const gains = resolveAllLayerGains(layers);
    expect(gains[2]).toBe(1.0);
  });
});
