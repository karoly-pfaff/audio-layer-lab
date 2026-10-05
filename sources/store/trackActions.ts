import { audioEngine } from '../audio/AudioEngine';
import { detectBpm } from '../audio/bpm';
import { checkLoopHealth } from '../audio/loopHealth';
import { revokeArtworkUrl, type AudioMetadata } from '../audio/metadata';
import type { LayerState, MainTrackState, TrackMetadata } from '../audio/types';
import { assignDropFiles } from '../utils/dropAssignment';
import { applyReorder } from '../utils/layerOrder';
import { clampFinite } from '../utils/validation';
import { makeDefaultLayer } from './audioLabState';
import type { AudioLabGet, AudioLabSet, TrackActions } from './audioLabStoreTypes';
import { pruneUnreferencedAudio } from './assetReferences';
import { MAX_LAYER_COUNT } from './constants';
import { mediaStorageFailureReason } from './mediaStorage';
import { generateLayerId } from './persistence';
import { loadCoordinator } from './loadCoordinator';
import { showStatus } from './statusMessages';
import {
  AudioLoadError,
  audioLoadFailureMessage,
  disposeLoadedAudio,
  loadAudioForTrack,
} from './audioFileLoader';
import { fitsSessionAudioBudget } from '../audio/audioMemory';

interface BpmAnalysis {
  buffer: AudioBuffer;
  filename: string;
  token: number;
  layerId?: string;
}

function publicMetadata(metadata: AudioMetadata): TrackMetadata {
  return {
    title: metadata.title,
    artist: metadata.artist,
    album: metadata.album,
  };
}

function restoreMainMedia(current: MainTrackState, previous: MainTrackState): MainTrackState {
  return {
    ...current,
    name: previous.name,
    buffer: previous.buffer,
    thumbnailUrl: previous.thumbnailUrl,
    loadingState: previous.buffer ? previous.loadingState : 'failed',
    metadata: previous.metadata,
    bpm: previous.bpm,
    bpmConfidence: previous.bpmConfidence,
    // The previous analysis was cancelled when this replacement started.
    bpmAnalyzing: false,
  };
}

function restoreLayerMedia(current: LayerState, previous: LayerState): LayerState {
  return {
    ...current,
    name: previous.name,
    buffer: previous.buffer,
    thumbnailUrl: previous.thumbnailUrl,
    loadingState: previous.buffer ? previous.loadingState : 'failed',
    metadata: previous.metadata,
    loopIssues: previous.loopIssues,
    bpm: previous.bpm,
    bpmConfidence: previous.bpmConfidence,
    // Do not restore a pending flag for work that was explicitly cancelled.
    bpmAnalyzing: false,
  };
}

async function loadMainTrack(set: AudioLabSet, get: AudioLabGet, file: File): Promise<void> {
  const previous = get().mainTrack;
  const token = loadCoordinator.beginMain();
  set((state) => ({ mainTrack: { ...state.mainTrack, loadingState: 'loading' } }));

  try {
    const loaded = await loadAudioForTrack(file, loadCoordinator.mainSignal(token));
    if (!fitsSessionAudioBudget(get(), loaded.buffer, { kind: 'main' })) {
      await disposeLoadedAudio(loaded);
      throw new AudioLoadError('Session audio memory limit reached (512 MB maximum)');
    }
    let accepted = false;
    try {
      if (!loadCoordinator.isMainCurrent(token)) {
        revokeArtworkUrl(loaded.metadata.artworkUrl);
        return;
      }
      audioEngine.setMainBuffer(loaded.buffer);
      revokeArtworkUrl(previous.thumbnailUrl);
      set((state) => ({
        mainTrack: {
          ...state.mainTrack,
          assetId: loaded.assetId,
          name: file.name,
          buffer: loaded.buffer,
          thumbnailUrl: loaded.metadata.artworkUrl,
          loadingState: 'loaded',
          metadata: publicMetadata(loaded.metadata),
          bpmAnalyzing: true,
          bpm: null,
          bpmConfidence: null,
        },
      }));
      accepted = true;
    } finally {
      loaded.releaseAsset();
      pruneUnreferencedAudio(get);
    }
    if (!accepted) {
      return;
    }
    if (!loaded.assetId) {
      const reason = mediaStorageFailureReason();
      showStatus(
        set,
        `Audio loaded, but it could not be saved locally${reason ? ` (${reason})` : ''}`,
      );
    }
    void analyzeMainBpm(set, get, { buffer: loaded.buffer, filename: file.name, token });
  } catch (error) {
    if (loadCoordinator.isMainCurrent(token)) {
      set((state) => ({ mainTrack: restoreMainMedia(state.mainTrack, previous) }));
      pruneUnreferencedAudio(get);
      showStatus(set, audioLoadFailureMessage(error));
    }
  }
}

async function analyzeMainBpm(
  set: AudioLabSet,
  get: AudioLabGet,
  analysis: BpmAnalysis,
): Promise<void> {
  const result = await detectBpm(analysis.buffer, loadCoordinator.mainSignal(analysis.token));
  if (
    !loadCoordinator.isMainCurrent(analysis.token) ||
    get().mainTrack.name !== analysis.filename
  ) {
    return;
  }
  set((state) => ({
    mainTrack: {
      ...state.mainTrack,
      bpm: result?.bpm ?? null,
      bpmConfidence: result?.confidence ?? null,
      bpmAnalyzing: false,
    },
  }));
}

async function loadLayer(
  set: AudioLabSet,
  get: AudioLabGet,
  layerId: string,
  file: File,
): Promise<void> {
  const previous = get().layers.find((layer) => layer.id === layerId);
  if (!previous) {
    return;
  }
  const token = loadCoordinator.beginLayer(layerId);
  set((state) => ({
    layers: state.layers.map((layer) =>
      layer.id === layerId ? { ...layer, loadingState: 'loading' } : layer,
    ),
  }));

  try {
    const loaded = await loadAudioForTrack(file, loadCoordinator.layerSignal(layerId, token));
    if (!fitsSessionAudioBudget(get(), loaded.buffer, { kind: 'layer', layerId })) {
      await disposeLoadedAudio(loaded);
      throw new AudioLoadError('Session audio memory limit reached (512 MB maximum)');
    }
    let accepted = false;
    try {
      if (!loadCoordinator.isLayerCurrent(layerId, token)) {
        revokeArtworkUrl(loaded.metadata.artworkUrl);
        return;
      }
      const current = get().layers.find((layer) => layer.id === layerId);
      if (!current) {
        revokeArtworkUrl(loaded.metadata.artworkUrl);
        return;
      }
      const loopIssues = checkLoopHealth(loaded.buffer);
      audioEngine.setLayerBuffer(layerId, loaded.buffer);
      audioEngine.setLayerVolume(layerId, current.volume);
      audioEngine.setLayerPan(layerId, current.pan);
      revokeArtworkUrl(previous.thumbnailUrl);
      set((state) => ({
        layers: state.layers.map((layer) =>
          layer.id === layerId
            ? {
                ...layer,
                assetId: loaded.assetId,
                name: file.name,
                buffer: loaded.buffer,
                thumbnailUrl: loaded.metadata.artworkUrl,
                loadingState: 'loaded',
                metadata: publicMetadata(loaded.metadata),
                loopIssues,
                bpmAnalyzing: true,
                bpm: null,
                bpmConfidence: null,
              }
            : layer,
        ),
      }));
      accepted = true;
    } finally {
      loaded.releaseAsset();
      pruneUnreferencedAudio(get);
    }
    if (!accepted) {
      return;
    }
    if (!loaded.assetId) {
      const reason = mediaStorageFailureReason();
      showStatus(
        set,
        `Audio loaded, but it could not be saved locally${reason ? ` (${reason})` : ''}`,
      );
    }
    void analyzeLayerBpm(set, get, {
      buffer: loaded.buffer,
      filename: file.name,
      token,
      layerId,
    });
  } catch (error) {
    if (loadCoordinator.isLayerCurrent(layerId, token)) {
      set((state) => ({
        layers: state.layers.map((layer) =>
          layer.id === layerId ? restoreLayerMedia(layer, previous) : layer,
        ),
      }));
      pruneUnreferencedAudio(get);
      showStatus(set, audioLoadFailureMessage(error));
    }
  }
}

async function analyzeLayerBpm(
  set: AudioLabSet,
  get: AudioLabGet,
  analysis: BpmAnalysis,
): Promise<void> {
  const layerId = analysis.layerId;
  if (!layerId) {
    return;
  }
  const result = await detectBpm(
    analysis.buffer,
    loadCoordinator.layerSignal(layerId, analysis.token),
  );
  const current = get().layers.find((layer) => layer.id === layerId);
  if (
    !loadCoordinator.isLayerCurrent(layerId, analysis.token) ||
    current?.name !== analysis.filename
  ) {
    return;
  }
  set((state) => ({
    layers: state.layers.map((layer) =>
      layer.id === layerId
        ? {
            ...layer,
            bpm: result?.bpm ?? null,
            bpmConfidence: result?.confidence ?? null,
            bpmAnalyzing: false,
          }
        : layer,
    ),
  }));
}

export function createTrackActions(set: AudioLabSet, get: AudioLabGet): TrackActions {
  return {
    loadMainTrack: (file) => loadMainTrack(set, get, file),
    clearMainTrack: () => {
      loadCoordinator.cancelMain();
      revokeArtworkUrl(get().mainTrack.thumbnailUrl);
      audioEngine.clearMainBuffer();
      audioEngine.setMainLoop(false);
      set((state) => ({
        mainTrack: {
          ...state.mainTrack,
          assetId: null,
          name: '',
          buffer: null,
          loop: false,
          thumbnailUrl: null,
          loadingState: 'empty',
          metadata: null,
          bpm: null,
          bpmConfidence: null,
          bpmAnalyzing: false,
        },
        transport: { ...state.transport, playing: audioEngine.playing },
      }));
      pruneUnreferencedAudio(get);
    },
    setMainVolume: (volume) => {
      const safeVolume = clampFinite(volume, 0, 1, get().mainTrack.volume);
      audioEngine.setMainVolume(safeVolume);
      set((state) => ({ mainTrack: { ...state.mainTrack, volume: safeVolume } }));
    },
    setMainPan: (pan) => {
      const safePan = clampFinite(pan, -1, 1, get().mainTrack.pan);
      audioEngine.setMainPan(safePan);
      set((state) => ({ mainTrack: { ...state.mainTrack, pan: safePan } }));
    },
    setMainLoop: (loop) => {
      audioEngine.setMainLoop(loop);
      set((state) => ({ mainTrack: { ...state.mainTrack, loop } }));
    },
    addLayer: () => {
      const { layers } = get();
      if (layers.length >= MAX_LAYER_COUNT) {
        showStatus(set, `Layer limit reached (${MAX_LAYER_COUNT})`);
        return;
      }
      const id = generateLayerId();
      audioEngine.setLayerVolume(id, 1);
      audioEngine.setLayerPan(id, 0);
      audioEngine.setLayerMute(id, false);
      audioEngine.setLayerSolo(id, false);
      set((state) => ({
        layers: [...state.layers, makeDefaultLayer(state.layers.length, id)],
      }));
    },
    loadLayer: (layerId, file) => loadLayer(set, get, layerId, file),
    removeLayer: (layerId) => {
      const { layers } = get();
      const layer = layers.find((candidate) => candidate.id === layerId);
      if (!layer) {
        return;
      }
      if (layers.length <= 1) {
        showStatus(set, 'At least one layer is required');
        return;
      }
      loadCoordinator.cancelLayer(layerId);
      revokeArtworkUrl(layer.thumbnailUrl);
      audioEngine.removeLayerBuffer(layerId);
      set((state) => ({
        layers: state.layers
          .filter((candidate) => candidate.id !== layerId)
          .map((candidate, order) => ({ ...candidate, order })),
        transport: { ...state.transport, playing: audioEngine.playing },
      }));
      pruneUnreferencedAudio(get);
    },
    reorderLayer: (layerId, targetOrder) => {
      set((state) => ({ layers: applyReorder(state.layers, layerId, targetOrder) }));
    },
    setLayerVolume: (layerId, volume) => {
      const current = get().layers.find((layer) => layer.id === layerId)?.volume ?? 1;
      const safeVolume = clampFinite(volume, 0, 1, current);
      audioEngine.setLayerVolume(layerId, safeVolume);
      set((state) => ({
        layers: state.layers.map((layer) =>
          layer.id === layerId ? { ...layer, volume: safeVolume } : layer,
        ),
      }));
    },
    setLayerPan: (layerId, pan) => {
      const current = get().layers.find((layer) => layer.id === layerId)?.pan ?? 0;
      const safePan = clampFinite(pan, -1, 1, current);
      audioEngine.setLayerPan(layerId, safePan);
      set((state) => ({
        layers: state.layers.map((layer) =>
          layer.id === layerId ? { ...layer, pan: safePan } : layer,
        ),
      }));
    },
    setLayerMute: (layerId, muted) => {
      audioEngine.setLayerMute(layerId, muted);
      set((state) => ({
        layers: state.layers.map((layer) => (layer.id === layerId ? { ...layer, muted } : layer)),
      }));
    },
    setLayerSolo: (layerId, soloed) => {
      audioEngine.setLayerSolo(layerId, soloed);
      set((state) => ({
        layers: state.layers.map((layer) => (layer.id === layerId ? { ...layer, soloed } : layer)),
      }));
    },
    dropLayerFiles: (files) => {
      const assignment = assignDropFiles(files, get().layers);
      assignment.assignments.forEach(({ layerId, file }) => void get().loadLayer(layerId, file));
      let skipped = assignment.skipped;
      assignment.overflowFiles.forEach((file) => {
        if (get().layers.length >= MAX_LAYER_COUNT) {
          skipped += 1;
          return;
        }
        get().addLayer();
        const currentLayers = get().layers;
        const layer = currentLayers[currentLayers.length - 1];
        if (layer) {
          void get().loadLayer(layer.id, file);
        }
      });
      if (skipped > 0) {
        showStatus(
          set,
          `${skipped} file${skipped === 1 ? '' : 's'} skipped — not audio or layer limit reached`,
        );
      }
    },
  };
}
