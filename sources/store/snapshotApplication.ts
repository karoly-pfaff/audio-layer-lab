import { audioEngine } from '../audio/AudioEngine';
import { revokeArtworkUrl } from '../audio/metadata';
import type { LayerState, MainTrackState, TransportState } from '../audio/types';
import type { MixSnapshot } from './snapshots';

export interface SnapshotApplication {
  mainTrack: MainTrackState;
  layers: LayerState[];
  transport: TransportState;
  clearMainBuffer: boolean;
  clearLayerIds: string[];
  artworkUrlsToRevoke: string[];
}

function restoredAssetId(
  sameAudio: boolean,
  currentAssetId: string | null | undefined,
  savedAssetId: string | null | undefined,
): string | null {
  return sameAudio ? (currentAssetId ?? savedAssetId ?? null) : (savedAssetId ?? null);
}

function existingAssetId(track: LayerState | undefined): string | null {
  return track?.assetId ?? null;
}

interface AudioIdentity {
  name: string;
  assetId?: string | null;
}

function isSameAudio(current: AudioIdentity, saved: AudioIdentity, hasBuffer: boolean): boolean {
  if (!hasBuffer) {
    return false;
  }
  if (current.assetId || saved.assetId) {
    return Boolean(current.assetId && saved.assetId && current.assetId === saved.assetId);
  }
  // A filename is presentation data, not content identity. When persistence is unavailable there
  // is no trustworthy identity, so requiring a reload is safer than retaining the wrong audio.
  return false;
}

function buildMainState(
  snapshot: MixSnapshot,
  current: MainTrackState,
): Pick<SnapshotApplication, 'mainTrack' | 'clearMainBuffer' | 'artworkUrlsToRevoke'> {
  const filename = snapshot.main.filename ?? '';
  const sameAudio = isSameAudio(
    current,
    { name: filename, assetId: snapshot.main.assetId },
    current.buffer !== null,
  );
  const artworkUrlsToRevoke =
    !sameAudio && current.thumbnailUrl?.startsWith('blob:') ? [current.thumbnailUrl] : [];

  return {
    mainTrack: {
      ...current,
      assetId: restoredAssetId(sameAudio, current.assetId, snapshot.main.assetId),
      name: filename,
      buffer: sameAudio ? current.buffer : null,
      volume: snapshot.main.volume,
      pan: snapshot.main.pan,
      loop: snapshot.main.loop,
      thumbnailUrl: sameAudio
        ? (current.thumbnailUrl ?? snapshot.main.thumbnailUrl)
        : snapshot.main.thumbnailUrl,
      loadingState: sameAudio ? 'loaded' : filename ? 'remembered' : 'empty',
      metadata: sameAudio ? current.metadata : null,
      bpm: snapshot.main.bpm,
      bpmConfidence: snapshot.main.bpmConfidence,
      bpmAnalyzing: false,
    },
    clearMainBuffer: !sameAudio && current.buffer !== null,
    artworkUrlsToRevoke,
  };
}

interface LayerApplication {
  layer: LayerState;
  clearLayerId: string | null;
  artworkUrlToRevoke: string | null;
}

function buildLayerMedia(
  existing: LayerState | undefined,
  savedThumbnailUrl: string | null,
  filename: string,
  sameAudio: boolean,
): Pick<LayerState, 'buffer' | 'thumbnailUrl' | 'loadingState' | 'metadata' | 'loopIssues'> {
  if (sameAudio && existing) {
    return {
      buffer: existing.buffer,
      thumbnailUrl: existing.thumbnailUrl ?? savedThumbnailUrl,
      loadingState: 'loaded',
      metadata: existing.metadata,
      loopIssues: existing.loopIssues ?? null,
    };
  }
  return {
    buffer: null,
    thumbnailUrl: savedThumbnailUrl,
    loadingState: filename ? 'remembered' : 'empty',
    metadata: null,
    loopIssues: null,
  };
}

function replacedLayerResources(
  existing: LayerState | undefined,
  sameAudio: boolean,
): Pick<LayerApplication, 'clearLayerId' | 'artworkUrlToRevoke'> {
  if (!existing || sameAudio) {
    return { clearLayerId: null, artworkUrlToRevoke: null };
  }
  return {
    clearLayerId: existing.id,
    artworkUrlToRevoke: existing.thumbnailUrl?.startsWith('blob:') ? existing.thumbnailUrl : null,
  };
}

function buildSnapshotLayer(
  savedLayer: MixSnapshot['layers'][number],
  order: number,
  existing: LayerState | undefined,
): LayerApplication {
  const filename = savedLayer.filename ?? '';
  const sameAudio = isSameAudio(
    { name: existing?.name ?? '', assetId: existing?.assetId },
    { name: filename, assetId: savedLayer.assetId },
    existing?.buffer !== null && existing?.buffer !== undefined,
  );
  const media = buildLayerMedia(existing, savedLayer.thumbnailUrl, filename, sameAudio);
  return {
    layer: {
      id: savedLayer.id,
      assetId: restoredAssetId(sameAudio, existingAssetId(existing), savedLayer.assetId),
      order,
      name: filename,
      buffer: media.buffer,
      volume: savedLayer.volume,
      pan: savedLayer.pan,
      muted: savedLayer.muted,
      soloed: savedLayer.soloed,
      loop: true,
      thumbnailUrl: media.thumbnailUrl,
      loadingState: media.loadingState,
      metadata: media.metadata,
      loopIssues: media.loopIssues,
      bpm: savedLayer.bpm,
      bpmConfidence: savedLayer.bpmConfidence,
      bpmAnalyzing: false,
    },
    ...replacedLayerResources(existing, sameAudio),
  };
}

function buildLayerState(snapshot: MixSnapshot, currentLayers: LayerState[]) {
  const currentById = new Map(currentLayers.map((layer) => [layer.id, layer]));
  const snapshotIds = new Set(snapshot.layers.map((layer) => layer.id));
  const clearLayerIds = currentLayers
    .filter((layer) => !snapshotIds.has(layer.id))
    .map((layer) => layer.id);
  const artworkUrlsToRevoke = currentLayers
    .filter((layer) => !snapshotIds.has(layer.id) && layer.thumbnailUrl?.startsWith('blob:'))
    .map((layer) => layer.thumbnailUrl as string);

  const applications = snapshot.layers.map((savedLayer, order) =>
    buildSnapshotLayer(savedLayer, order, currentById.get(savedLayer.id)),
  );
  applications.forEach(({ clearLayerId, artworkUrlToRevoke }) => {
    if (clearLayerId) {
      clearLayerIds.push(clearLayerId);
    }
    if (artworkUrlToRevoke) {
      artworkUrlsToRevoke.push(artworkUrlToRevoke);
    }
  });

  return {
    layers: applications.map(({ layer }) => layer),
    clearLayerIds: [...new Set(clearLayerIds)],
    artworkUrlsToRevoke,
  };
}

export function buildSnapshotApplication(
  snapshot: MixSnapshot,
  currentMain: MainTrackState,
  currentLayers: LayerState[],
  currentTransport: TransportState,
): SnapshotApplication {
  const main = buildMainState(snapshot, currentMain);
  const layer = buildLayerState(snapshot, currentLayers);
  return {
    mainTrack: main.mainTrack,
    layers: layer.layers,
    transport: {
      ...currentTransport,
      playing: false,
      masterVolume: snapshot.masterVolume,
      masterMuted: snapshot.masterMuted,
      positionRevision: currentTransport.positionRevision + 1,
    },
    clearMainBuffer: main.clearMainBuffer,
    clearLayerIds: layer.clearLayerIds,
    artworkUrlsToRevoke: [...main.artworkUrlsToRevoke, ...layer.artworkUrlsToRevoke],
  };
}

export function applySnapshotToEngine(
  snapshot: MixSnapshot,
  application: SnapshotApplication,
): void {
  audioEngine.stop();
  if (application.clearMainBuffer) {
    audioEngine.clearMainBuffer();
  }
  application.clearLayerIds.forEach((layerId) => audioEngine.removeLayerBuffer(layerId));
  application.artworkUrlsToRevoke.forEach(revokeArtworkUrl);
  audioEngine.setMasterVolume(snapshot.masterVolume);
  audioEngine.setMasterMute(snapshot.masterMuted);
  audioEngine.setMainVolume(snapshot.main.volume);
  audioEngine.setMainPan(snapshot.main.pan);
  audioEngine.setMainLoop(snapshot.main.loop);
  snapshot.layers.forEach((layer) => {
    audioEngine.setLayerVolume(layer.id, layer.volume);
    audioEngine.setLayerPan(layer.id, layer.pan);
    audioEngine.setLayerMute(layer.id, layer.muted);
    audioEngine.setLayerSolo(layer.id, layer.soloed);
  });
}
