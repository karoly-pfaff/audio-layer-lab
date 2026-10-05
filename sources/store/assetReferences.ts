import type { AudioLabGet, AudioLabState } from './audioLabStoreTypes';
import type { MixSnapshot } from './snapshots';
import { pruneStoredAudio } from './mediaStorage';
import {
  loadDurableSessionForCleanup,
  type PersistedSession,
  sessionPersistenceHealthy,
} from './persistence';

function addSnapshotAssets(ids: Set<string>, snapshot: MixSnapshot | null): void {
  if (!snapshot) {
    return;
  }
  if (snapshot.main.assetId) {
    ids.add(snapshot.main.assetId);
  }
  snapshot.layers.forEach((layer) => {
    if (layer.assetId) {
      ids.add(layer.assetId);
    }
  });
}

export function referencedAssetIds(state: AudioLabState): Set<string> {
  const ids = new Set<string>();
  if (state.mainTrack.assetId) {
    ids.add(state.mainTrack.assetId);
  }
  state.layers.forEach((layer) => {
    if (layer.assetId) {
      ids.add(layer.assetId);
    }
  });
  state.snapshots.forEach((snapshot) => addSnapshotAssets(ids, snapshot));
  addSnapshotAssets(ids, state.ab.a);
  addSnapshotAssets(ids, state.ab.b);
  return ids;
}

function persistedAssetIds(session: PersistedSession): Set<string> {
  const ids = new Set<string>();
  if (session.main.assetId) {
    ids.add(session.main.assetId);
  }
  session.layers.forEach((layer) => {
    if (layer.assetId) {
      ids.add(layer.assetId);
    }
  });
  session.snapshots.forEach((snapshot) => addSnapshotAssets(ids, snapshot));
  addSnapshotAssets(ids, session.ab.a);
  addSnapshotAssets(ids, session.ab.b);
  return ids;
}

export function pruneDurableUnreferencedAudio(): Promise<void> {
  if (!sessionPersistenceHealthy()) {
    return Promise.resolve();
  }
  return pruneStoredAudio(() => {
    // The durable commit, not newer in-memory state, is the deletion authority.
    // Reading it inside the queued mutation also covers saves that fail after GC is queued.
    const session = loadDurableSessionForCleanup();
    return session ? persistedAssetIds(session) : null;
  });
}

export function pruneUnreferencedAudio(_get: AudioLabGet): void {
  void pruneDurableUnreferencedAudio();
}
