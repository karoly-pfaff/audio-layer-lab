import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerState, MainTrackState, TransportState } from '../audio/types';
import type { MixSnapshot } from './snapshots';

const engine = vi.hoisted(() => ({
  stop: vi.fn(),
  clearMainBuffer: vi.fn(),
  removeLayerBuffer: vi.fn(),
  setMasterVolume: vi.fn(),
  setMasterMute: vi.fn(),
  setMainVolume: vi.fn(),
  setMainPan: vi.fn(),
  setMainLoop: vi.fn(),
  setLayerVolume: vi.fn(),
  setLayerPan: vi.fn(),
  setLayerMute: vi.fn(),
  setLayerSolo: vi.fn(),
}));
const metadata = vi.hoisted(() => ({ revokeArtworkUrl: vi.fn() }));

vi.mock('../audio/AudioEngine', () => ({
  audioEngine: engine,
}));
vi.mock('../audio/metadata', () => ({ revokeArtworkUrl: metadata.revokeArtworkUrl }));

import { applySnapshotToEngine, buildSnapshotApplication } from './snapshotApplication';

function main(overrides: Partial<MainTrackState> = {}): MainTrackState {
  return {
    id: 'main',
    name: 'song.wav',
    buffer: {} as AudioBuffer,
    volume: 0.8,
    pan: 0,
    muted: false,
    loop: false,
    thumbnailUrl: 'blob:main',
    loadingState: 'loaded',
    metadata: null,
    ...overrides,
  };
}

function layer(id: string, name: string, buffer: AudioBuffer | null): LayerState {
  return {
    id,
    name,
    buffer,
    volume: 1,
    pan: 0,
    muted: false,
    soloed: false,
    loop: true,
    thumbnailUrl: `blob:${id}`,
    loadingState: buffer ? 'loaded' : 'loading',
    metadata: null,
    order: 0,
  };
}

const transport: TransportState = {
  playing: true,
  masterVolume: 0.8,
  masterMuted: false,
  positionRevision: 0,
};

function snapshot(overrides: Partial<MixSnapshot> = {}): MixSnapshot {
  return {
    id: 'snapshot',
    name: 'Mix',
    createdAt: '',
    main: {
      volume: 0.7,
      pan: 0.2,
      loop: true,
      filename: 'song.wav',
      thumbnailUrl: null,
      bpm: 120,
      bpmConfidence: 'high',
    },
    masterVolume: 0.6,
    masterMuted: true,
    layers: [],
    ...overrides,
  };
}

describe('buildSnapshotApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retains a loaded buffer only when its identity matches', () => {
    const current = main({ assetId: 'asset-a' });
    const saved = snapshot({ main: { ...snapshot().main, assetId: 'asset-a' } });
    const result = buildSnapshotApplication(saved, current, [], transport);
    expect(result.mainTrack.buffer).toBe(current.buffer);
    expect(result.clearMainBuffer).toBe(false);
    expect(result.transport.playing).toBe(false);
  });

  it('does not treat matching filenames as content identity when asset ids are unavailable', () => {
    const current = main({ assetId: null });
    const result = buildSnapshotApplication(snapshot(), current, [], transport);
    expect(result.mainTrack.buffer).toBeNull();
    expect(result.clearMainBuffer).toBe(true);
    expect(result.mainTrack.loadingState).toBe('remembered');
  });

  it('clears a different main file and restores its remembered identity', () => {
    const result = buildSnapshotApplication(
      snapshot({ main: { ...snapshot().main, filename: 'other.wav' } }),
      main(),
      [],
      transport,
    );
    expect(result.mainTrack.name).toBe('other.wav');
    expect(result.mainTrack.buffer).toBeNull();
    expect(result.mainTrack.loadingState).toBe('remembered');
    expect(result.clearMainBuffer).toBe(true);
    expect(result.artworkUrlsToRevoke).toContain('blob:main');
  });

  it('never carries a loading layer across snapshot application', () => {
    const savedLayer = {
      id: 'drums',
      order: 0,
      volume: 0.5,
      pan: 0,
      muted: false,
      soloed: false,
      filename: 'drums.wav',
      thumbnailUrl: null,
      bpm: null,
      bpmConfidence: null,
    };
    const result = buildSnapshotApplication(
      snapshot({ layers: [savedLayer] }),
      main(),
      [layer('drums', 'drums.wav', null)],
      transport,
    );
    expect(result.layers[0].loadingState).toBe('remembered');
    expect(result.layers[0].buffer).toBeNull();
    expect(result.clearLayerIds).toContain('drums');
  });

  it('removes layers absent from the snapshot', () => {
    const result = buildSnapshotApplication(
      snapshot(),
      main(),
      [layer('obsolete', 'old.wav', {} as AudioBuffer)],
      transport,
    );
    expect(result.layers).toEqual([]);
    expect(result.clearLayerIds).toContain('obsolete');
  });

  it('turns snapshot entries without filenames into genuinely empty tracks', () => {
    const savedLayer = {
      id: 'empty-layer',
      order: 0,
      volume: 1,
      pan: 0,
      muted: false,
      soloed: false,
      filename: null,
      thumbnailUrl: null,
      bpm: null,
      bpmConfidence: null,
    };
    const result = buildSnapshotApplication(
      snapshot({
        main: { ...snapshot().main, filename: null },
        layers: [savedLayer],
      }),
      main({ thumbnailUrl: 'https://example.test/main.jpg' }),
      [layer('empty-layer', 'old.wav', {} as AudioBuffer)],
      transport,
    );

    expect(result.mainTrack).toMatchObject({ name: '', loadingState: 'empty', buffer: null });
    expect(result.layers[0]).toMatchObject({ name: '', loadingState: 'empty', buffer: null });
    expect(result.artworkUrlsToRevoke).not.toContain('https://example.test/main.jpg');
  });

  it('uses saved artwork when matching loaded tracks have no current thumbnail', () => {
    const currentLayer = { ...layer('drums', 'drums.wav', {} as AudioBuffer), thumbnailUrl: null };
    const savedLayer = {
      id: 'drums',
      order: 0,
      volume: 1,
      pan: 0,
      muted: false,
      soloed: false,
      filename: 'drums.wav',
      thumbnailUrl: 'https://example.test/drums.jpg',
      bpm: null,
      bpmConfidence: null,
    };
    const result = buildSnapshotApplication(
      snapshot({
        main: { ...snapshot().main, thumbnailUrl: 'https://example.test/main.jpg' },
        layers: [savedLayer],
      }),
      main({ thumbnailUrl: null }),
      [currentLayer],
      transport,
    );

    expect(result.mainTrack.thumbnailUrl).toBe('https://example.test/main.jpg');
    expect(result.layers[0]?.thumbnailUrl).toBe('https://example.test/drums.jpg');
  });

  it('does not reuse same-named audio when the content asset ids differ', () => {
    const savedLayer = {
      ...snapshot().layers[0],
      id: 'layer-0',
      filename: 'same.wav',
      assetId: `sha256-${'a'.repeat(64)}`,
    } as MixSnapshot['layers'][number];
    const target = snapshot({
      main: {
        ...snapshot().main,
        filename: 'same.wav',
        assetId: `sha256-${'a'.repeat(64)}`,
      },
      layers: [savedLayer],
    });
    const currentMain = main({
      name: 'same.wav',
      assetId: `sha256-${'b'.repeat(64)}`,
    });
    const currentLayer = {
      ...layer('layer-0', 'same.wav', {} as AudioBuffer),
      assetId: `sha256-${'b'.repeat(64)}`,
    };

    const result = buildSnapshotApplication(target, currentMain, [currentLayer], transport);

    expect(result.mainTrack).toMatchObject({
      assetId: target.main.assetId,
      buffer: null,
      loadingState: 'remembered',
    });
    expect(result.layers[0]).toMatchObject({
      assetId: savedLayer.assetId,
      buffer: null,
      loadingState: 'remembered',
    });
    expect(result.clearMainBuffer).toBe(true);
    expect(result.clearLayerIds).toContain('layer-0');
  });

  it('applies destructive buffer cleanup and mixer state to the audio engine', () => {
    const target = snapshot({
      main: { ...snapshot().main, filename: 'replacement.wav' },
      layers: [],
    });
    const application = buildSnapshotApplication(
      target,
      main(),
      [layer('obsolete', 'old.wav', {} as AudioBuffer)],
      transport,
    );

    applySnapshotToEngine(target, application);

    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(engine.clearMainBuffer).toHaveBeenCalledTimes(1);
    expect(engine.removeLayerBuffer).toHaveBeenCalledWith('obsolete');
    expect(metadata.revokeArtworkUrl.mock.calls.map(([url]) => url)).toEqual([
      'blob:main',
      'blob:obsolete',
    ]);
    expect(engine.setMasterVolume).toHaveBeenCalledWith(0.6);
    expect(engine.setMainPan).toHaveBeenCalledWith(0.2);
  });
});
