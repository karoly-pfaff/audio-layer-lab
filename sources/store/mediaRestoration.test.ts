import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioLabGet, AudioLabSet, AudioLabState } from './audioLabStoreTypes';
import { defaultSession } from './persistence';
import { mainStateFromSession, makeDefaultLayer, transportStateFromSession } from './audioLabState';

const storage = vi.hoisted(() => ({ loadAudioFile: vi.fn() }));
vi.mock('./mediaStorage', () => ({ loadAudioFile: storage.loadAudioFile }));
vi.mock('../audio/AudioEngine', () => ({ audioEngine: {} }));

import { restoreStoredAudio } from './mediaRestoration';
import { loadCoordinator } from './loadCoordinator';

function createHarness() {
  const session = defaultSession();
  let state = {
    mainTrack: { ...mainStateFromSession(session), name: 'main.wav', assetId: 'main-asset' },
    layers: [
      { ...makeDefaultLayer(0), name: 'layer.wav', assetId: 'layer-asset' },
      makeDefaultLayer(1),
    ],
    transport: transportStateFromSession(session),
    snapshots: [],
    ab: { a: null, b: null },
    statusMessage: null,
  } as unknown as AudioLabState;
  const get = (() => state) as AudioLabGet;
  const set = ((update: Parameters<AudioLabSet>[0]) => {
    const partial = typeof update === 'function' ? update(state) : update;
    state = { ...state, ...partial };
  }) as AudioLabSet;
  const loadMainTrack = vi.fn(async (file: File) => {
    state.mainTrack = { ...state.mainTrack, name: file.name, buffer: {} as AudioBuffer };
  });
  const loadLayer = vi.fn(async (layerId: string, file: File) => {
    state.layers = state.layers.map((layer) =>
      layer.id === layerId ? { ...layer, name: file.name, buffer: {} as AudioBuffer } : layer,
    );
  });
  Object.assign(state, { loadMainTrack, loadLayer });
  return { get, set, state: () => state, loadMainTrack, loadLayer };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadCoordinator.cancelAll();
  storage.loadAudioFile.mockImplementation(
    async (_id: string, name: string) => new File(['audio'], name, { type: 'audio/wav' }),
  );
});

describe('stored media restoration', () => {
  it('restores main and layer files through their normal loading actions', async () => {
    const harness = createHarness();
    await restoreStoredAudio(harness.set, harness.get);
    expect(harness.loadMainTrack).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'main.wav' }),
    );
    expect(harness.loadLayer).toHaveBeenCalledWith(
      'layer-0',
      expect.objectContaining({ name: 'layer.wav' }),
    );
    expect(harness.state().statusMessage).toBeNull();
  });

  it('falls back to manual reload when stored files are missing', async () => {
    storage.loadAudioFile.mockResolvedValue(null);
    const harness = createHarness();
    await restoreStoredAudio(harness.set, harness.get);
    expect(harness.state().mainTrack).toMatchObject({ assetId: null, loadingState: 'remembered' });
    expect(harness.state().layers[0]).toMatchObject({ assetId: null, loadingState: 'remembered' });
    expect(harness.state().statusMessage).toContain('2 stored audio files could not be restored');
  });

  it('does not overwrite a track that changes while storage is being read', async () => {
    let resolveFile!: (file: File | null) => void;
    storage.loadAudioFile.mockReturnValue(
      new Promise<File | null>((resolve) => {
        resolveFile = resolve;
      }),
    );
    const harness = createHarness();
    const restoring = restoreStoredAudio(harness.set, harness.get);
    harness.set({
      mainTrack: { ...harness.state().mainTrack, assetId: 'replacement' },
      layers: harness
        .state()
        .layers.map((layer) => ({ ...layer, assetId: layer.order === 0 ? 'replacement' : null })),
    });
    resolveFile(new File(['audio'], 'stale.wav'));
    await restoring;
    expect(harness.loadMainTrack).not.toHaveBeenCalled();
    expect(harness.loadLayer).not.toHaveBeenCalled();
  });

  it('lets a later manual load win even before it changes the persisted asset id', async () => {
    let resolveFile!: (file: File | null) => void;
    storage.loadAudioFile.mockReturnValue(
      new Promise<File | null>((resolve) => {
        resolveFile = resolve;
      }),
    );
    const harness = createHarness();
    harness.state().layers = [];
    const restoring = restoreStoredAudio(harness.set, harness.get);

    loadCoordinator.beginMain();
    resolveFile(new File(['old'], 'saved-main.wav'));
    await restoring;

    expect(harness.loadMainTrack).not.toHaveBeenCalled();
  });

  it('reports a stored file that can no longer be decoded', async () => {
    const harness = createHarness();
    harness.state().layers = [];
    harness.loadMainTrack.mockImplementation(async () => undefined);
    await restoreStoredAudio(harness.set, harness.get);
    expect(harness.state().statusMessage).toContain('1 stored audio file could not be restored');
  });

  it('does not publish a late restoration failure after its ownership fence is cancelled', async () => {
    const harness = createHarness();
    harness.state().layers = [];
    let current = true;
    harness.loadMainTrack.mockImplementation(async () => {
      current = false;
    });

    await restoreStoredAudio(harness.set, harness.get, () => current);

    expect(harness.state().statusMessage).toBeNull();
  });

  it('stops both main and layer restoration when the fence is already cancelled', async () => {
    const harness = createHarness();

    await restoreStoredAudio(harness.set, harness.get, () => false);

    expect(harness.loadMainTrack).not.toHaveBeenCalled();
    expect(harness.loadLayer).not.toHaveBeenCalled();
    expect(harness.state().statusMessage).toBeNull();
  });

  it('does not publish a late layer failure after its ownership fence is cancelled', async () => {
    const harness = createHarness();
    harness.state().mainTrack.assetId = null;
    let current = true;
    harness.loadLayer.mockImplementation(async () => {
      current = false;
    });

    await restoreStoredAudio(harness.set, harness.get, () => current);

    expect(harness.state().statusMessage).toBeNull();
  });
});
