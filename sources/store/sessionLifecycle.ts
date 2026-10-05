import { audioEngine } from '../audio/AudioEngine';
import { revokeArtworkUrl } from '../audio/metadata';
import {
  applySessionSettingsToEngine,
  layerStateFromPersisted,
  mainStateFromSession,
  transportStateFromSession,
} from './audioLabState';
import type { AudioLabGet, AudioLabSet } from './audioLabStoreTypes';
import { loadCoordinator } from './loadCoordinator';
import type { PersistedSession } from './persistence';
import { transportCoordinator } from './transportCoordinator';

export function releaseCurrentSession(get: AudioLabGet): void {
  const state = get();
  loadCoordinator.cancelAll();
  transportCoordinator.cancelPendingPlay();
  revokeArtworkUrl(state.mainTrack.thumbnailUrl);
  state.layers.forEach((layer) => revokeArtworkUrl(layer.thumbnailUrl));
  audioEngine.stop();
  audioEngine.clearMainBuffer();
  state.layers.forEach((layer) => audioEngine.removeLayerBuffer(layer.id));
}

export function replaceWithSession(set: AudioLabSet, session: PersistedSession): void {
  applySessionSettingsToEngine(session);
  set({
    mainTrack: mainStateFromSession(session),
    layers: session.layers.map(layerStateFromPersisted),
    transport: transportStateFromSession(session),
    snapshots: session.snapshots,
    ab: session.ab,
  });
}
