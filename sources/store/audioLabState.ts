import type { LayerState, MainTrackState, TransportState } from '../audio/types';
import { audioEngine } from '../audio/AudioEngine';
import { persistableUrl } from '../utils/urlUtils';
import type { AudioLabState } from './audioLabStoreTypes';
import type { PersistedLayer, PersistedSession } from './persistence';

export function makeDefaultLayer(order: number, id = `layer-${order}`): LayerState {
  return {
    id,
    assetId: null,
    name: '',
    buffer: null,
    volume: 1,
    muted: false,
    loop: true,
    thumbnailUrl: null,
    pan: 0,
    soloed: false,
    order,
    loadingState: 'empty',
    metadata: null,
  };
}

export function layerStateFromPersisted(layer: PersistedLayer): LayerState {
  return {
    id: layer.id,
    assetId: layer.assetId ?? null,
    name: layer.filename ?? '',
    buffer: null,
    volume: layer.volume,
    pan: layer.pan,
    muted: layer.muted,
    soloed: layer.soloed,
    loop: true,
    thumbnailUrl: layer.thumbnailUrl,
    loadingState: layer.assetId ? 'loading' : layer.filename ? 'remembered' : 'empty',
    metadata: null,
    order: layer.order,
    bpm: layer.bpm,
    bpmConfidence: layer.bpmConfidence,
  };
}

export function mainStateFromSession(session: PersistedSession): MainTrackState {
  return {
    id: 'main',
    assetId: session.main.assetId ?? null,
    name: session.main.filename ?? '',
    buffer: null,
    volume: session.main.volume,
    pan: session.main.pan,
    muted: false,
    loop: session.main.loop,
    thumbnailUrl: session.main.thumbnailUrl,
    loadingState: session.main.assetId ? 'loading' : session.main.filename ? 'remembered' : 'empty',
    metadata: null,
    bpm: session.main.bpm,
    bpmConfidence: session.main.bpmConfidence,
    bpmAnalyzing: false,
  };
}

export function transportStateFromSession(session: PersistedSession): TransportState {
  return {
    playing: false,
    masterVolume: session.transport.masterVolume,
    masterMuted: session.transport.masterMuted,
    positionRevision: 0,
  };
}

export function applySessionSettingsToEngine(session: PersistedSession): void {
  audioEngine.setMainVolume(session.main.volume);
  audioEngine.setMainPan(session.main.pan);
  audioEngine.setMainLoop(session.main.loop);
  audioEngine.setMasterVolume(session.transport.masterVolume);
  audioEngine.setMasterMute(session.transport.masterMuted);
  session.layers.forEach((layer) => {
    audioEngine.setLayerVolume(layer.id, layer.volume);
    audioEngine.setLayerPan(layer.id, layer.pan);
    audioEngine.setLayerMute(layer.id, layer.muted);
    audioEngine.setLayerSolo(layer.id, layer.soloed);
  });
}

export function buildPersistedSession(state: AudioLabState): PersistedSession {
  return {
    version: 4,
    savedAt: new Date().toISOString(),
    main: {
      assetId: state.mainTrack.assetId ?? null,
      loop: state.mainTrack.loop,
      volume: state.mainTrack.volume,
      pan: state.mainTrack.pan,
      filename: state.mainTrack.name || null,
      thumbnailUrl: persistableUrl(state.mainTrack.thumbnailUrl),
      bpm: state.mainTrack.bpm ?? null,
      bpmConfidence: state.mainTrack.bpmConfidence ?? null,
    },
    layers: state.layers.map((layer) => ({
      id: layer.id,
      assetId: layer.assetId ?? null,
      order: layer.order,
      volume: layer.volume,
      pan: layer.pan,
      muted: layer.muted,
      soloed: layer.soloed,
      filename: layer.name || null,
      thumbnailUrl: persistableUrl(layer.thumbnailUrl),
      bpm: layer.bpm ?? null,
      bpmConfidence: layer.bpmConfidence ?? null,
    })),
    transport: {
      masterVolume: state.transport.masterVolume,
      masterMuted: state.transport.masterMuted,
    },
    snapshots: state.snapshots,
    ab: state.ab,
  };
}
