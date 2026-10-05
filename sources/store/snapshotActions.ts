import type { AudioLabGet, AudioLabSet, SnapshotActions } from './audioLabStoreTypes';
import { pruneUnreferencedAudio } from './assetReferences';
import { loadCoordinator } from './loadCoordinator';
import { restoreStoredAudio } from './mediaRestoration';
import { buildMixSnapshot, MAX_NAME_LENGTH, MAX_SNAPSHOTS, type MixSnapshot } from './snapshots';
import { applySnapshotToEngine, buildSnapshotApplication } from './snapshotApplication';
import { showStatus } from './statusMessages';
import { transportCoordinator } from './transportCoordinator';

function applyMixSnapshot(
  set: AudioLabSet,
  get: AudioLabGet,
  snapshot: MixSnapshot,
  message: string,
): void {
  loadCoordinator.cancelAll();
  transportCoordinator.cancelPendingPlay();
  const state = get();
  const application = buildSnapshotApplication(
    snapshot,
    state.mainTrack,
    state.layers,
    state.transport,
  );
  applySnapshotToEngine(snapshot, application);
  set({
    mainTrack: application.mainTrack,
    layers: application.layers,
    transport: application.transport,
  });
  void restoreStoredAudio(set, get);
  pruneUnreferencedAudio(get);
  showStatus(set, message);
}

function duplicateSnapshot(original: MixSnapshot): MixSnapshot {
  return {
    ...original,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: `${original.name.slice(0, MAX_NAME_LENGTH - 7)} (copy)`.trim(),
    layers: original.layers.map((layer) => ({ ...layer })),
    main: { ...original.main },
  };
}

export function createSnapshotActions(set: AudioLabSet, get: AudioLabGet): SnapshotActions {
  return {
    saveSnapshot: (name) => {
      const state = get();
      if (state.snapshots.length >= MAX_SNAPSHOTS) {
        showStatus(set, `Snapshot limit reached (${MAX_SNAPSHOTS})`);
        return;
      }
      const snapshotName =
        name?.trim().slice(0, MAX_NAME_LENGTH) || `Snapshot ${state.snapshots.length + 1}`;
      const snapshot = buildMixSnapshot(
        state.mainTrack,
        state.transport,
        state.layers,
        snapshotName,
      );
      set((current) => ({ snapshots: [...current.snapshots, snapshot] }));
      showStatus(set, 'Snapshot saved');
    },
    applySnapshot: (id) => {
      const snapshot = get().snapshots.find((candidate) => candidate.id === id);
      if (snapshot) {
        applyMixSnapshot(set, get, snapshot, 'Snapshot applied — press play to audition');
      }
    },
    renameSnapshot: (id, name) => {
      const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
      if (!trimmed) {
        return;
      }
      set((state) => ({
        snapshots: state.snapshots.map((snapshot) =>
          snapshot.id === id ? { ...snapshot, name: trimmed } : snapshot,
        ),
      }));
      showStatus(set, 'Snapshot renamed');
    },
    duplicateSnapshot: (id) => {
      const state = get();
      if (state.snapshots.length >= MAX_SNAPSHOTS) {
        showStatus(set, `Snapshot limit reached (${MAX_SNAPSHOTS})`);
        return;
      }
      const original = state.snapshots.find((snapshot) => snapshot.id === id);
      if (original) {
        set((current) => ({ snapshots: [...current.snapshots, duplicateSnapshot(original)] }));
        showStatus(set, 'Snapshot duplicated');
      }
    },
    deleteSnapshot: (id) => {
      set((state) => ({
        snapshots: state.snapshots.filter((snapshot) => snapshot.id !== id),
      }));
      pruneUnreferencedAudio(get);
      showStatus(set, 'Snapshot deleted');
    },
    assignAB: (slot) => {
      const state = get();
      const snapshot = buildMixSnapshot(
        state.mainTrack,
        state.transport,
        state.layers,
        slot.toUpperCase(),
      );
      set((current) => ({ ab: { ...current.ab, [slot]: snapshot } }));
      showStatus(set, `Mix assigned to ${slot.toUpperCase()}`);
    },
    applyAB: (slot) => {
      const snapshot = get().ab[slot];
      if (snapshot) {
        applyMixSnapshot(
          set,
          get,
          snapshot,
          `${slot.toUpperCase()} applied — press play to audition`,
        );
      }
    },
  };
}
