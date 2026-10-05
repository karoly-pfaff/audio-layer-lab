import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioLabState } from './audioLabStoreTypes';
import { defaultSession } from './persistence';
import {
  buildPersistedSession,
  mainStateFromSession,
  makeDefaultLayer,
  transportStateFromSession,
} from './audioLabState';

const storage = vi.hoisted(() => ({ pruneStoredAudio: vi.fn() }));
vi.mock('./mediaStorage', () => ({ pruneStoredAudio: storage.pruneStoredAudio }));
vi.mock('../audio/AudioEngine', () => ({ audioEngine: {} }));

import {
  pruneDurableUnreferencedAudio,
  pruneUnreferencedAudio,
  referencedAssetIds,
} from './assetReferences';
import { saveSession } from './persistence';
import { takeOverSession } from './sessionOwnership';

const CURRENT_MAIN = `sha256-${'1'.repeat(64)}`;
const SHARED_LAYER = `sha256-${'2'.repeat(64)}`;
const SNAPSHOT_MAIN = `sha256-${'3'.repeat(64)}`;

function stateWithAssets(): AudioLabState {
  const session = defaultSession();
  const mainTrack = mainStateFromSession(session);
  mainTrack.assetId = CURRENT_MAIN;
  const layers = [makeDefaultLayer(0)];
  layers[0]!.assetId = SHARED_LAYER;
  const snapshot = {
    id: 'snapshot',
    name: 'Snapshot',
    createdAt: '',
    main: { ...session.main, assetId: SNAPSHOT_MAIN },
    masterVolume: 1,
    masterMuted: false,
    layers: [{ ...session.layers[0]!, assetId: SHARED_LAYER }],
  };
  return {
    mainTrack,
    layers,
    transport: transportStateFromSession(session),
    snapshots: [snapshot],
    ab: { a: snapshot, b: { ...snapshot, id: 'b', main: { ...snapshot.main, assetId: null } } },
    statusMessage: null,
  } as AudioLabState;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  localStorage.clear();
  takeOverSession();
});

describe('asset references', () => {
  it('returns an empty set when neither the mix nor snapshots reference media', () => {
    const state = stateWithAssets();
    state.mainTrack.assetId = null;
    state.layers[0]!.assetId = null;
    state.snapshots = [];
    state.ab = { a: null, b: null };
    expect(referencedAssetIds(state)).toEqual(new Set());
  });

  it('collects unique assets from the current mix, snapshots, and A/B slots', () => {
    expect([...referencedAssetIds(stateWithAssets())].sort()).toEqual([
      CURRENT_MAIN,
      SHARED_LAYER,
      SNAPSHOT_MAIN,
    ]);
  });

  it('prunes everything except currently referenced assets', () => {
    const state = stateWithAssets();
    expect(saveSession(buildPersistedSession(state))).toBe(true);
    pruneUnreferencedAudio(() => state);
    const keepIds = storage.pruneStoredAudio.mock.calls[0]?.[0] as () => ReadonlySet<string> | null;
    expect(keepIds()).toEqual(new Set([CURRENT_MAIN, SHARED_LAYER, SNAPSHOT_MAIN]));
  });

  it('keeps the last durable references when a newer session save fails', () => {
    const durable = stateWithAssets();
    expect(saveSession(buildPersistedSession(durable))).toBe(true);
    pruneUnreferencedAudio(() => durable);
    const keepIds = storage.pruneStoredAudio.mock.calls[0]?.[0] as () => ReadonlySet<string> | null;

    const newer = stateWithAssets();
    newer.mainTrack.assetId = null;
    newer.layers[0]!.assetId = null;
    newer.snapshots = [];
    newer.ab = { a: null, b: null };
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    expect(saveSession(buildPersistedSession(newer))).toBe(false);
    expect(keepIds()).toEqual(new Set([CURRENT_MAIN, SHARED_LAYER, SNAPSHOT_MAIN]));
  });

  it('does not enqueue cleanup while session persistence is unhealthy', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(saveSession(buildPersistedSession(stateWithAssets()))).toBe(false);

    await pruneDurableUnreferencedAudio();

    expect(storage.pruneStoredAudio).not.toHaveBeenCalled();
  });

  it('stops cleanup when the durable commit cannot be parsed', () => {
    const state = stateWithAssets();
    expect(saveSession(buildPersistedSession(state))).toBe(true);
    pruneUnreferencedAudio(() => state);
    localStorage.setItem('audio-layer-lab-session', '{corrupt');
    const keepIds = storage.pruneStoredAudio.mock.calls[0]?.[0] as () => ReadonlySet<string> | null;

    expect(keepIds()).toBeNull();
  });
});
