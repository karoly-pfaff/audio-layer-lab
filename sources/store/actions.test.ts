import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerState, MainTrackState } from '../audio/types';
import type { AudioLabGet, AudioLabSet, AudioLabState } from './audioLabStoreTypes';

const engine = vi.hoisted(() => ({
  audioContext: { sampleRate: 48_000 },
  currentTime: 10,
  playing: false,
  clearMainBuffer: vi.fn(),
  decodeFile: vi.fn(),
  getMainDuration: vi.fn(() => 20),
  pause: vi.fn(),
  play: vi.fn(() => true),
  removeLayerBuffer: vi.fn(),
  resumeContext: vi.fn(() => Promise.resolve()),
  seek: vi.fn(),
  setLayerBuffer: vi.fn(),
  setLayerMute: vi.fn(),
  setLayerPan: vi.fn(),
  setLayerSolo: vi.fn(),
  setLayerVolume: vi.fn(),
  setMainBuffer: vi.fn(),
  setMainLoop: vi.fn(),
  setMainPan: vi.fn(),
  setMainVolume: vi.fn(),
  setMasterMute: vi.fn(),
  setMasterVolume: vi.fn(),
  stop: vi.fn(),
}));

const metadata = vi.hoisted(() => ({
  extractMetadata: vi.fn(),
  revokeArtworkUrl: vi.fn(),
}));
const bpm = vi.hoisted(() => ({ detectBpm: vi.fn() }));
const loopHealth = vi.hoisted(() => ({ checkLoopHealth: vi.fn() }));
const presets = vi.hoisted(() => ({ downloadPreset: vi.fn() }));
const persistence = vi.hoisted(() => ({
  generateLayerId: vi.fn(() => 'layer-generated'),
}));
const mediaStorage = vi.hoisted(() => ({
  mediaStorageFailureReason: vi.fn(),
  requestPersistentStorage: vi.fn(),
  storeAudioFileForSession: vi.fn(),
}));
const assetReferences = vi.hoisted(() => ({
  pruneDurableUnreferencedAudio: vi.fn(),
  pruneUnreferencedAudio: vi.fn(),
}));

vi.mock('../audio/AudioEngine', () => ({ audioEngine: engine }));
vi.mock('../audio/metadata', () => ({
  extractMetadata: metadata.extractMetadata,
  revokeArtworkUrl: metadata.revokeArtworkUrl,
}));
vi.mock('../audio/bpm', () => ({ detectBpm: bpm.detectBpm }));
vi.mock('../audio/loopHealth', () => ({ checkLoopHealth: loopHealth.checkLoopHealth }));
vi.mock('./presets', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, downloadPreset: presets.downloadPreset };
});
vi.mock('./persistence', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    generateLayerId: persistence.generateLayerId,
  };
});
vi.mock('./mediaStorage', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    mediaStorageFailureReason: mediaStorage.mediaStorageFailureReason,
    requestPersistentStorage: mediaStorage.requestPersistentStorage,
    storeAudioFileForSession: mediaStorage.storeAudioFileForSession,
  };
});
vi.mock('./assetReferences', () => ({
  pruneDurableUnreferencedAudio: assetReferences.pruneDurableUnreferencedAudio,
  pruneUnreferencedAudio: assetReferences.pruneUnreferencedAudio,
}));

import { createSessionActions } from './sessionActions';
import { createSnapshotActions } from './snapshotActions';
import { createTrackActions } from './trackActions';
import { createTransportActions } from './transportActions';
import { defaultSession } from './persistence';
import { serializePreset } from './presets';
import { makeDefaultLayer, mainStateFromSession, transportStateFromSession } from './audioLabState';
import { loadCoordinator } from './loadCoordinator';
import { transportCoordinator } from './transportCoordinator';
import { dismissStatus, showStatus } from './statusMessages';
import { MAX_LAYER_COUNT } from './constants';

function audioBuffer(duration = 8): AudioBuffer {
  return {
    duration,
    length: duration * 44_100,
    numberOfChannels: 2,
    sampleRate: 44_100,
    getChannelData: () => new Float32Array(8),
  } as unknown as AudioBuffer;
}

interface Harness {
  actions: ReturnType<typeof createSessionActions> &
    ReturnType<typeof createSnapshotActions> &
    ReturnType<typeof createTrackActions> &
    ReturnType<typeof createTransportActions>;
  get: AudioLabGet;
  set: AudioLabSet;
}

function createHarness(overrides: Partial<AudioLabState> = {}): Harness {
  const session = defaultSession();
  let state = {
    mainTrack: mainStateFromSession(session),
    layers: session.layers.map((layer, order) => makeDefaultLayer(order, layer.id)),
    transport: transportStateFromSession(session),
    snapshots: [],
    ab: { a: null, b: null },
    statusMessage: null,
    ...overrides,
  } as AudioLabState;
  const get = (() => state) as AudioLabGet;
  const set = ((update: Parameters<AudioLabSet>[0]) => {
    const partial = typeof update === 'function' ? update(state) : update;
    state = { ...state, ...partial };
  }) as AudioLabSet;
  const actions = {
    ...createSessionActions(set, get),
    ...createSnapshotActions(set, get),
    ...createTrackActions(set, get),
    ...createTransportActions(set, get),
  };
  Object.assign(state, actions, { dismissStatus: () => dismissStatus(set) });
  return { actions, get, set };
}

function loadedMain(overrides: Partial<MainTrackState> = {}): MainTrackState {
  return {
    id: 'main',
    name: 'main.wav',
    buffer: audioBuffer(),
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

function loadedLayer(order = 0, overrides: Partial<LayerState> = {}): LayerState {
  return {
    ...makeDefaultLayer(order, `layer-${order}`),
    name: `layer-${order}.wav`,
    buffer: audioBuffer(),
    thumbnailUrl: `blob:layer-${order}`,
    loadingState: 'loaded',
    ...overrides,
  };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  loadCoordinator.cancelAll();
  transportCoordinator.cancelPendingPlay();
  engine.currentTime = 10;
  engine.playing = false;
  engine.getMainDuration.mockReturnValue(20);
  engine.play.mockReturnValue(true);
  engine.resumeContext.mockResolvedValue(undefined);
  engine.decodeFile.mockResolvedValue(audioBuffer());
  metadata.extractMetadata.mockResolvedValue({
    title: 'Title',
    artist: 'Artist',
    album: 'Album',
    artworkUrl: null,
  });
  bpm.detectBpm.mockResolvedValue({ bpm: 120, confidence: 'high' });
  loopHealth.checkLoopHealth.mockReturnValue([]);
  persistence.generateLayerId.mockReturnValue('layer-generated');
  mediaStorage.requestPersistentStorage.mockResolvedValue(true);
  mediaStorage.mediaStorageFailureReason.mockReturnValue(null);
  mediaStorage.storeAudioFileForSession.mockResolvedValue({
    id: `sha256-${'a'.repeat(64)}`,
    release: vi.fn(),
  });
  localStorage.clear();
});

describe('transport actions', () => {
  it('plays after resuming, and reports a rejected browser audio unlock', async () => {
    const harness = createHarness();
    harness.actions.play();
    await flushAsyncWork();
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(harness.get().transport.playing).toBe(true);

    engine.resumeContext.mockRejectedValueOnce(new Error('blocked'));
    harness.actions.play();
    await flushAsyncWork();
    expect(harness.get().statusMessage).toContain('Audio blocked');
  });

  it('does not mark playback active when the engine has nothing to play', async () => {
    const harness = createHarness();
    engine.play.mockReturnValueOnce(false);
    harness.actions.play();
    await flushAsyncWork();
    expect(harness.get().transport.playing).toBe(false);
  });

  it('does not let a pending play resume override a later stop command', async () => {
    let resume!: () => void;
    engine.resumeContext.mockReturnValueOnce(new Promise<void>((resolve) => (resume = resolve)));
    const harness = createHarness();

    harness.actions.play();
    harness.actions.stop();
    resume();
    await flushAsyncWork();

    expect(engine.play).not.toHaveBeenCalled();
    expect(harness.get().transport.playing).toBe(false);
  });

  it('handles pause, stop, seeking, jumps, master controls, and playability', () => {
    const harness = createHarness();
    harness.actions.pause();
    harness.actions.stop();
    harness.actions.seekTo(7);
    harness.actions.seekToStart();
    harness.actions.jumpBack(50);
    harness.actions.jumpForward(50);
    expect(engine.seek.mock.calls.map(([value]) => value)).toEqual([7, 0, 0, 20]);
    expect(harness.get().transport.positionRevision).toBe(6);

    harness.actions.setMasterVolume(2);
    expect(harness.get().transport.masterVolume).toBe(1);
    harness.actions.setMasterVolume(Number.NaN);
    expect(harness.get().transport.masterVolume).toBe(1);
    harness.actions.toggleMasterMute();
    expect(harness.get().transport.masterMuted).toBe(true);
    expect(harness.actions.canPlay()).toBe(false);

    harness.set({ mainTrack: loadedMain() });
    expect(harness.actions.canPlay()).toBe(true);
    harness.set({ mainTrack: { ...loadedMain(), buffer: null }, layers: [loadedLayer()] });
    expect(harness.actions.canPlay()).toBe(true);
  });

  it('preserves the absolute transport timeline for jumps while the main track loops', () => {
    const harness = createHarness({ mainTrack: loadedMain({ loop: true }) });
    engine.getMainDuration.mockReturnValue(10);

    engine.currentTime = 12;
    harness.actions.jumpForward(5);
    engine.currentTime = 22;
    harness.actions.jumpBack(5);

    expect(engine.seek.mock.calls.map(([value]) => value)).toEqual([17, 17]);
  });
});

describe('snapshot actions', () => {
  it('saves, renames, duplicates, deletes, and assigns snapshots', () => {
    const harness = createHarness({ mainTrack: loadedMain(), layers: [loadedLayer()] });
    harness.actions.saveSnapshot('  First mix  ');
    expect(harness.get().snapshots[0]?.name).toBe('First mix');
    harness.actions.renameSnapshot(harness.get().snapshots[0]!.id, '  Renamed  ');
    expect(harness.get().snapshots[0]?.name).toBe('Renamed');
    harness.actions.renameSnapshot(harness.get().snapshots[0]!.id, '   ');
    expect(harness.get().snapshots[0]?.name).toBe('Renamed');
    harness.actions.duplicateSnapshot(harness.get().snapshots[0]!.id);
    expect(harness.get().snapshots).toHaveLength(2);
    expect(harness.get().snapshots[1]?.name).toBe('Renamed (copy)');
    harness.actions.deleteSnapshot(harness.get().snapshots[0]!.id);
    expect(harness.get().snapshots).toHaveLength(1);
    harness.actions.assignAB('a');
    expect(harness.get().ab.a?.name).toBe('A');
  });

  it('uses a default name and enforces the snapshot limit', () => {
    const harness = createHarness();
    harness.actions.saveSnapshot();
    expect(harness.get().snapshots[0]?.name).toBe('Snapshot 1');
    const snapshot = harness.get().snapshots[0]!;
    harness.set({
      snapshots: Array.from({ length: 12 }, (_, index) => ({ ...snapshot, id: `${index}` })),
    });
    harness.actions.saveSnapshot('Blocked');
    harness.actions.duplicateSnapshot(snapshot.id);
    expect(harness.get().snapshots).toHaveLength(12);
    expect(harness.get().statusMessage).toContain('limit reached');
  });

  it('applies saved and A/B snapshots while ignoring missing ids and slots', () => {
    const harness = createHarness({ mainTrack: loadedMain(), layers: [loadedLayer()] });
    harness.actions.saveSnapshot('Saved');
    const snapshotId = harness.get().snapshots[0]!.id;
    harness.actions.applySnapshot('missing');
    harness.actions.applySnapshot(snapshotId);
    expect(harness.get().statusMessage).toContain('Snapshot applied');
    expect(engine.stop).toHaveBeenCalled();

    harness.actions.applyAB('b');
    harness.actions.assignAB('b');
    harness.actions.applyAB('b');
    expect(harness.get().statusMessage).toContain('B applied');
  });
});

describe('session and status actions', () => {
  it('resets media, engine state, snapshots, and persistence', () => {
    const harness = createHarness({
      mainTrack: loadedMain(),
      layers: [loadedLayer(0), loadedLayer(1)],
      snapshots: [{}] as AudioLabState['snapshots'],
    });
    harness.actions.resetSession();
    expect(metadata.revokeArtworkUrl).toHaveBeenCalledWith('blob:main');
    expect(engine.removeLayerBuffer).toHaveBeenCalledTimes(2);
    expect(assetReferences.pruneUnreferencedAudio).toHaveBeenCalledTimes(1);
    expect(harness.get().layers).toHaveLength(5);
    expect(harness.get().snapshots).toEqual([]);
    expect(harness.get().statusMessage).toBe('Session reset');
  });

  it('exports the current session', () => {
    const harness = createHarness();
    harness.actions.exportPreset();
    expect(presets.downloadPreset).toHaveBeenCalledTimes(1);
    expect(harness.get().statusMessage).toBe('Preset exported');
  });

  it('imports valid presets with and without snapshot state', async () => {
    const harness = createHarness({ mainTrack: loadedMain(), layers: [loadedLayer()] });
    const plainSession = defaultSession();
    await harness.actions.importPreset({
      text: vi.fn().mockResolvedValue(JSON.stringify(serializePreset(plainSession))),
    } as unknown as File);
    expect(harness.get().statusMessage).toBe('Preset imported — reload audio files to play');

    const snapshotHarness = createHarness();
    snapshotHarness.actions.saveSnapshot('Included');
    const withSnapshot = defaultSession();
    withSnapshot.snapshots = snapshotHarness.get().snapshots;
    await harness.actions.importPreset({
      text: vi.fn().mockResolvedValue(JSON.stringify(serializePreset(withSnapshot))),
    } as unknown as File);
    expect(harness.get().statusMessage).toContain('imported with snapshots');
  });

  it('does not let an older pending import overwrite a newer reset or import', async () => {
    const harness = createHarness({ mainTrack: loadedMain() });
    let finishOldRead!: (value: string) => void;
    const oldRead = new Promise<string>((resolve) => {
      finishOldRead = resolve;
    });
    const oldSession = defaultSession();
    oldSession.main.filename = 'older-import.wav';
    const pending = harness.actions.importPreset({
      size: 100,
      text: vi.fn(() => oldRead),
    } as unknown as File);

    harness.actions.resetSession();
    finishOldRead(JSON.stringify(serializePreset(oldSession)));
    await pending;
    expect(harness.get().mainTrack.name).toBe('');
    expect(harness.get().statusMessage).toBe('Session reset');

    let finishFirstRead!: (value: string) => void;
    const firstRead = new Promise<string>((resolve) => {
      finishFirstRead = resolve;
    });
    const first = harness.actions.importPreset({
      size: 100,
      text: vi.fn(() => firstRead),
    } as unknown as File);
    const newerSession = defaultSession();
    newerSession.main.filename = 'newer-import.wav';
    await harness.actions.importPreset({
      size: 100,
      text: vi.fn().mockResolvedValue(JSON.stringify(serializePreset(newerSession))),
    } as unknown as File);
    finishFirstRead(JSON.stringify(serializePreset(oldSession)));
    await first;

    expect(harness.get().mainTrack.name).toBe('newer-import.wav');
  });

  it('reports malformed and invalid preset files', async () => {
    const harness = createHarness();
    await harness.actions.importPreset({
      text: vi.fn().mockResolvedValue('{broken'),
    } as unknown as File);
    expect(harness.get().statusMessage).toBe('Invalid preset file');
    await harness.actions.importPreset({
      text: vi.fn().mockRejectedValue(new Error('read failed')),
    } as unknown as File);
    expect(harness.get().statusMessage).toBe('Invalid preset file');
  });

  it('rejects oversized preset files before reading them', async () => {
    const harness = createHarness();
    const text = vi.fn();
    await harness.actions.importPreset({ size: 2 * 1024 * 1024 + 1, text } as unknown as File);
    expect(text).not.toHaveBeenCalled();
    expect(harness.get().statusMessage).toBe('Preset file is too large (2 MB maximum)');
  });

  it('sets and dismisses status directly', () => {
    const harness = createHarness();
    showStatus(harness.set, 'Ready');
    expect(harness.get().statusMessage).toBe('Ready');
    dismissStatus(harness.set);
    expect(harness.get().statusMessage).toBeNull();
  });
});

describe('track actions', () => {
  it('updates and safely clamps main and layer mix controls', () => {
    const harness = createHarness({
      mainTrack: loadedMain(),
      layers: [loadedLayer(), loadedLayer(1)],
    });
    harness.actions.setMainVolume(2);
    harness.actions.setMainPan(-2);
    harness.actions.setMainLoop(true);
    harness.actions.setLayerVolume('layer-0', -1);
    harness.actions.setLayerPan('layer-0', 2);
    harness.actions.setLayerMute('layer-0', true);
    harness.actions.setLayerSolo('layer-0', true);
    expect(harness.get().mainTrack).toMatchObject({ volume: 1, pan: -1, loop: true });
    expect(harness.get().layers[0]).toMatchObject({ volume: 0, pan: 1, muted: true, soloed: true });
    expect(engine.setLayerSolo).toHaveBeenCalledWith('layer-0', true);
  });

  it('clears main media and preserves the engine playback result', () => {
    engine.playing = true;
    const harness = createHarness({ mainTrack: loadedMain() });
    harness.actions.clearMainTrack();
    expect(engine.clearMainBuffer).toHaveBeenCalledTimes(1);
    expect(harness.get().mainTrack).toMatchObject({
      name: '',
      buffer: null,
      loadingState: 'empty',
    });
    expect(harness.get().transport.playing).toBe(true);
  });

  it('adds, reorders, removes, and bounds layers', () => {
    const harness = createHarness({ layers: [loadedLayer(0), loadedLayer(1)] });
    harness.actions.addLayer();
    const layersAfterAdd = harness.get().layers;
    expect(layersAfterAdd[layersAfterAdd.length - 1]?.id).toBe('layer-generated');
    harness.actions.reorderLayer('layer-generated', 0);
    expect(harness.get().layers[0]?.id).toBe('layer-generated');
    harness.actions.removeLayer('missing');
    harness.actions.removeLayer('layer-generated');
    expect(harness.get().layers.map((layer) => layer.order)).toEqual([0, 1]);

    harness.set({
      layers: Array.from({ length: MAX_LAYER_COUNT }, (_, order) => makeDefaultLayer(order)),
    });
    harness.actions.addLayer();
    expect(harness.get().layers).toHaveLength(MAX_LAYER_COUNT);
    expect(harness.get().statusMessage).toContain('Layer limit reached');
    harness.set({ layers: [makeDefaultLayer(0)] });
    harness.actions.removeLayer('layer-0');
    expect(harness.get().statusMessage).toBe('At least one layer is required');
  });

  it('loads main audio and completes asynchronous BPM analysis', async () => {
    const harness = createHarness();
    const file = new File(['audio'], 'main.wav', { type: 'audio/wav' });
    await harness.actions.loadMainTrack(file);
    await flushAsyncWork();
    expect(engine.setMainBuffer).toHaveBeenCalledTimes(1);
    expect(harness.get().mainTrack).toMatchObject({
      assetId: `sha256-${'a'.repeat(64)}`,
      name: 'main.wav',
      loadingState: 'loaded',
      bpm: 120,
      bpmConfidence: 'high',
      bpmAnalyzing: false,
    });
    expect(harness.get().mainTrack.thumbnailUrl).toBeNull();
  });

  it('keeps decoded audio usable when local media storage is unavailable', async () => {
    mediaStorage.storeAudioFileForSession.mockResolvedValueOnce(null);
    mediaStorage.mediaStorageFailureReason.mockReturnValueOnce('QuotaExceededError');
    const harness = createHarness();
    await harness.actions.loadMainTrack(new File(['audio'], 'unsaved.wav', { type: 'audio/wav' }));
    expect(harness.get().mainTrack).toMatchObject({
      name: 'unsaved.wav',
      assetId: null,
      loadingState: 'loaded',
    });
    expect(harness.get().statusMessage).toBe(
      'Audio loaded, but it could not be saved locally (QuotaExceededError)',
    );
  });

  it('loads playable audio when metadata and BPM analysis produce no result', async () => {
    metadata.extractMetadata.mockRejectedValueOnce(new Error('unsupported tags'));
    bpm.detectBpm.mockResolvedValueOnce(null);
    const harness = createHarness();

    await harness.actions.loadMainTrack(new File(['audio'], 'untagged.wav', { type: 'audio/wav' }));
    await flushAsyncWork();

    expect(harness.get().mainTrack).toMatchObject({
      name: 'untagged.wav',
      metadata: { title: null, artist: null, album: null },
      bpm: null,
      bpmConfidence: null,
      bpmAnalyzing: false,
    });
    expect(harness.get().mainTrack.buffer).not.toBeNull();
  });

  it('rejects audio that exceeds compressed or decoded resource limits', async () => {
    const harness = createHarness();
    const oversizedFile = new File(['small fixture'], 'huge.wav');
    Object.defineProperty(oversizedFile, 'size', { value: 100 * 1024 * 1024 + 1 });
    await harness.actions.loadMainTrack(oversizedFile);
    expect(engine.decodeFile).not.toHaveBeenCalled();
    expect(harness.get().statusMessage).toBe('Audio file is too large (100 MB maximum)');

    metadata.extractMetadata.mockResolvedValueOnce({
      title: null,
      artist: null,
      album: null,
      artworkUrl: 'blob:estimated-too-large',
      decodedBytesEstimate: 256 * 1024 * 1024 + 1,
    });
    await harness.actions.loadMainTrack(new File(['audio'], 'estimated-huge.wav'));
    expect(engine.decodeFile).not.toHaveBeenCalled();
    expect(metadata.revokeArtworkUrl).toHaveBeenCalledWith('blob:estimated-too-large');
    expect(harness.get().statusMessage).toBe('Decoded audio is too large (256 MB maximum)');

    engine.decodeFile.mockResolvedValueOnce({
      ...audioBuffer(),
      length: 34_000_000,
      numberOfChannels: 2,
    } as AudioBuffer);
    await harness.actions.loadMainTrack(new File(['audio'], 'decoded-huge.wav'));
    expect(harness.get().statusMessage).toBe('Decoded audio is too large (256 MB maximum)');
  });

  it('enforces a global decoded-audio budget across the session', async () => {
    const largeBuffer = {
      ...audioBuffer(),
      length: 50_000_000,
      numberOfChannels: 2,
    } as AudioBuffer;
    const layers = [
      loadedLayer(0, { buffer: largeBuffer }),
      loadedLayer(1, { buffer: largeBuffer }),
    ];
    const harness = createHarness({ layers });
    engine.decodeFile.mockResolvedValueOnce({
      ...audioBuffer(),
      length: 34_000_000,
      numberOfChannels: 1,
    } as AudioBuffer);

    await harness.actions.loadMainTrack(new File(['audio'], 'over-budget.wav'));

    expect(harness.get().mainTrack.buffer).toBeNull();
    expect(harness.get().statusMessage).toBe('Session audio memory limit reached (512 MB maximum)');
  });

  it('moves an unrestored track to a retryable failed state after decode failure', async () => {
    engine.decodeFile.mockRejectedValueOnce(new Error('decode failed'));
    const remembered = mainStateFromSession(defaultSession());
    remembered.assetId = `sha256-${'c'.repeat(64)}`;
    remembered.name = 'remembered.wav';
    remembered.loadingState = 'loading';
    const harness = createHarness({ mainTrack: remembered });

    await harness.actions.loadMainTrack(new File(['broken'], 'remembered.wav'));

    expect(harness.get().mainTrack).toMatchObject({
      name: 'remembered.wav',
      buffer: null,
      loadingState: 'failed',
    });
    expect(harness.get().statusMessage).toBe('Failed to decode audio');
  });

  it('ignores BPM analysis that completes after the main track is cleared', async () => {
    let resolveBpm!: (result: { bpm: number; confidence: 'high' }) => void;
    bpm.detectBpm.mockReturnValueOnce(new Promise((resolve) => (resolveBpm = resolve)));
    const harness = createHarness();

    await harness.actions.loadMainTrack(new File(['audio'], 'late-bpm.wav'));
    harness.actions.clearMainTrack();
    resolveBpm({ bpm: 140, confidence: 'high' });
    await flushAsyncWork();

    expect(harness.get().mainTrack).toMatchObject({
      name: '',
      bpm: null,
      bpmConfidence: null,
      loadingState: 'empty',
    });
  });

  it('restores main media after decode failure and disposes stale artwork', async () => {
    const previous = loadedMain();
    const harness = createHarness({ mainTrack: previous });
    engine.decodeFile.mockRejectedValueOnce(new Error('decode'));
    metadata.extractMetadata.mockResolvedValueOnce({
      title: null,
      artist: null,
      album: null,
      artworkUrl: 'blob:new-artwork',
    });
    await harness.actions.loadMainTrack(new File(['bad'], 'bad.wav', { type: 'audio/wav' }));
    expect(harness.get().mainTrack.buffer).toBe(previous.buffer);
    expect(harness.get().statusMessage).toBe('Failed to decode audio');
    expect(metadata.revokeArtworkUrl).toHaveBeenCalledWith('blob:new-artwork');

    let resolveDecode!: (buffer: AudioBuffer) => void;
    engine.decodeFile.mockReturnValueOnce(new Promise((resolve) => (resolveDecode = resolve)));
    metadata.extractMetadata.mockResolvedValueOnce({
      title: null,
      artist: null,
      album: null,
      artworkUrl: 'blob:stale',
    });
    const pending = harness.actions.loadMainTrack(
      new File(['audio'], 'stale.wav', { type: 'audio/wav' }),
    );
    loadCoordinator.cancelMain();
    resolveDecode(audioBuffer());
    await pending;
    expect(metadata.revokeArtworkUrl).toHaveBeenCalledWith('blob:stale');
  });

  it('loads layers, analyzes BPM, and handles missing and failed targets', async () => {
    const harness = createHarness({ layers: [makeDefaultLayer(0), makeDefaultLayer(1)] });
    const file = new File(['audio'], 'layer.wav', { type: 'audio/wav' });
    await harness.actions.loadLayer('missing', file);
    expect(engine.decodeFile).not.toHaveBeenCalled();

    loopHealth.checkLoopHealth.mockReturnValueOnce(['tooShort']);
    await harness.actions.loadLayer('layer-0', file);
    await flushAsyncWork();
    expect(engine.setLayerBuffer).toHaveBeenCalledWith('layer-0', expect.anything());
    expect(harness.get().layers[0]).toMatchObject({
      name: 'layer.wav',
      loadingState: 'loaded',
      loopIssues: ['tooShort'],
      bpm: 120,
      bpmAnalyzing: false,
    });

    engine.decodeFile.mockRejectedValueOnce(new Error('decode'));
    await harness.actions.loadLayer('layer-0', new File(['bad'], 'bad.wav', { type: 'audio/wav' }));
    expect(harness.get().layers[0]?.name).toBe('layer.wav');
    expect(harness.get().statusMessage).toBe('Failed to decode audio');
  });

  it('does not restore a BPM pending flag after replacement cancels that analysis', async () => {
    const previous = loadedLayer(0, { bpmAnalyzing: true, bpm: null, bpmConfidence: null });
    const harness = createHarness({ layers: [previous] });
    engine.decodeFile.mockRejectedValueOnce(new Error('decode'));

    await harness.actions.loadLayer('layer-0', new File(['bad'], 'replacement.wav'));

    expect(harness.get().layers[0]).toMatchObject({
      name: previous.name,
      buffer: previous.buffer,
      bpmAnalyzing: false,
    });
  });

  it('discards a decoded layer when its load is cancelled or its target disappears', async () => {
    let resolveCancelled!: (buffer: AudioBuffer) => void;
    engine.decodeFile.mockReturnValueOnce(new Promise((resolve) => (resolveCancelled = resolve)));
    metadata.extractMetadata.mockResolvedValueOnce({
      title: null,
      artist: null,
      album: null,
      artworkUrl: 'blob:cancelled',
    });
    const cancelledHarness = createHarness({
      layers: [makeDefaultLayer(0), makeDefaultLayer(1)],
    });
    const cancelledLoad = cancelledHarness.actions.loadLayer(
      'layer-0',
      new File(['audio'], 'cancelled.wav'),
    );
    cancelledHarness.actions.removeLayer('layer-0');
    resolveCancelled(audioBuffer());
    await cancelledLoad;
    expect(engine.setLayerBuffer).not.toHaveBeenCalledWith('layer-0', expect.anything());
    expect(metadata.revokeArtworkUrl).toHaveBeenCalledWith('blob:cancelled');

    vi.clearAllMocks();
    let resolveMissing!: (buffer: AudioBuffer) => void;
    engine.decodeFile.mockReturnValueOnce(new Promise((resolve) => (resolveMissing = resolve)));
    metadata.extractMetadata.mockResolvedValueOnce({
      title: null,
      artist: null,
      album: null,
      artworkUrl: 'blob:missing-target',
    });
    mediaStorage.storeAudioFileForSession.mockResolvedValueOnce({
      id: `sha256-${'b'.repeat(64)}`,
      release: vi.fn(),
    });
    const missingHarness = createHarness({
      layers: [makeDefaultLayer(0), makeDefaultLayer(1)],
    });
    const missingLoad = missingHarness.actions.loadLayer(
      'layer-0',
      new File(['audio'], 'missing.wav'),
    );
    missingHarness.set({ layers: [makeDefaultLayer(0, 'layer-1')] });
    resolveMissing(audioBuffer());
    await missingLoad;
    expect(engine.setLayerBuffer).not.toHaveBeenCalled();
    expect(metadata.revokeArtworkUrl).toHaveBeenCalledWith('blob:missing-target');
  });

  it('keeps an unsaved layer playable and completes a no-result BPM analysis', async () => {
    mediaStorage.storeAudioFileForSession.mockResolvedValueOnce(null);
    mediaStorage.mediaStorageFailureReason.mockReturnValueOnce(null);
    bpm.detectBpm.mockResolvedValueOnce(null);
    const harness = createHarness({ layers: [makeDefaultLayer(0), makeDefaultLayer(1)] });

    await harness.actions.loadLayer('layer-0', new File(['audio'], 'temporary.wav'));
    await flushAsyncWork();

    expect(harness.get().layers[0]).toMatchObject({
      name: 'temporary.wav',
      assetId: null,
      loadingState: 'loaded',
      bpm: null,
      bpmConfidence: null,
      bpmAnalyzing: false,
    });
    expect(harness.get().statusMessage).toBe('Audio loaded, but it could not be saved locally');
  });

  it('assigns dropped files, creates overflow layers, and reports skipped files', () => {
    const harness = createHarness({ layers: [makeDefaultLayer(0)] });
    const loadLayer = vi.fn();
    const addLayer = vi.fn(() => {
      const layers = harness.get().layers;
      harness.set({
        layers: [...layers, makeDefaultLayer(layers.length, `overflow-${layers.length}`)],
      });
    });
    Object.assign(harness.get(), { loadLayer, addLayer });
    harness.actions.dropLayerFiles([
      new File([''], 'one.wav', { type: 'audio/wav' }),
      new File([''], 'two.wav', { type: 'audio/wav' }),
      new File([''], 'notes.txt', { type: 'text/plain' }),
    ]);
    expect(addLayer).toHaveBeenCalledTimes(1);
    expect(loadLayer).toHaveBeenCalledTimes(2);
    expect(harness.get().statusMessage).toContain('1 file skipped');

    harness.set({
      layers: Array.from({ length: MAX_LAYER_COUNT }, (_, order) => loadedLayer(order)),
    });
    harness.actions.dropLayerFiles([new File([''], 'overflow.wav', { type: 'audio/wav' })]);
    expect(harness.get().statusMessage).toContain('1 file skipped');

    harness.actions.dropLayerFiles([
      new File([''], 'notes.txt', { type: 'text/plain' }),
      new File([''], 'cover.png', { type: 'image/png' }),
    ]);
    expect(harness.get().statusMessage).toContain('2 files skipped');
  });
});
