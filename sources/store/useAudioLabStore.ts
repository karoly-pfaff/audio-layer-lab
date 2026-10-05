import { create } from 'zustand';
import { audioEngine } from '../audio/AudioEngine';
import {
  applySessionSettingsToEngine,
  buildPersistedSession,
  layerStateFromPersisted,
  mainStateFromSession,
  transportStateFromSession,
} from './audioLabState';
import type { AudioLabState } from './audioLabStoreTypes';
import { dismissStatus } from './statusMessages';
import { loadSession, saveSession } from './persistence';
import { restoreStoredAudio } from './mediaRestoration';
import { createSessionActions } from './sessionActions';
import { createSnapshotActions } from './snapshotActions';
import { createTrackActions } from './trackActions';
import { createTransportActions } from './transportActions';
import { isSessionOwnershipFenceCurrent, sessionOwnershipFence } from './sessionOwnership';
import { releaseCurrentSession, replaceWithSession } from './sessionLifecycle';
import { sessionIntentCoordinator } from './sessionIntentCoordinator';

const initialSession = loadSession();
applySessionSettingsToEngine(initialSession);

export const useAudioLabStore = create<AudioLabState>((set, get) => {
  audioEngine.setMainEndedHandler(() => {
    set((state) => ({
      transport: {
        ...state.transport,
        playing: false,
        positionRevision: state.transport.positionRevision + 1,
      },
    }));
  });

  return {
    mainTrack: mainStateFromSession(initialSession),
    layers: initialSession.layers.map(layerStateFromPersisted),
    transport: transportStateFromSession(initialSession),
    snapshots: initialSession.snapshots,
    ab: initialSession.ab,
    statusMessage: null,
    ...createTrackActions(set, get),
    ...createTransportActions(set, get),
    ...createSessionActions(set, get),
    ...createSnapshotActions(set, get),
    dismissStatus: () => dismissStatus(set),
  };
});

const SAVE_FAILURE_MESSAGE =
  'Session changes are not being saved — check browser storage or export a preset';
let saveFailureReported = false;

useAudioLabStore.subscribe((state) => {
  sessionIntentCoordinator.noteStateMutation();
  const saved = saveSession(buildPersistedSession(state));
  if (!saved && state.statusMessage !== SAVE_FAILURE_MESSAGE) {
    saveFailureReported = true;
    useAudioLabStore.setState({ statusMessage: SAVE_FAILURE_MESSAGE });
  } else if (saved && saveFailureReported) {
    saveFailureReported = false;
    if (state.statusMessage === SAVE_FAILURE_MESSAGE) {
      useAudioLabStore.setState({ statusMessage: 'Session saving restored' });
    }
  }
});

let restorationGeneration = 0;
let restoration: { fence: string; promise: Promise<boolean> } | null = null;

export function suspendOwnedSessionAudio(): void {
  restorationGeneration += 1;
  restoration = null;
  sessionIntentCoordinator.noteStateMutation();
  releaseCurrentSession(useAudioLabStore.getState);
}

export function restoreOwnedSessionAudio(): Promise<boolean> {
  const fence = sessionOwnershipFence();
  if (!fence) {
    return Promise.resolve(false);
  }
  if (restoration?.fence === fence) {
    return restoration.promise;
  }

  const generation = ++restorationGeneration;
  const promise = (async () => {
    const durableSession = loadSession();
    if (!isSessionOwnershipFenceCurrent(fence) || generation !== restorationGeneration) {
      return false;
    }

    releaseCurrentSession(useAudioLabStore.getState);
    replaceWithSession(useAudioLabStore.setState, durableSession);
    const isCurrent = () =>
      isSessionOwnershipFenceCurrent(fence) && generation === restorationGeneration;
    await restoreStoredAudio(useAudioLabStore.setState, useAudioLabStore.getState, isCurrent);
    return isCurrent();
  })().finally(() => {
    if (restoration?.fence === fence) {
      restoration = null;
    }
  });
  restoration = { fence, promise };
  return promise;
}
