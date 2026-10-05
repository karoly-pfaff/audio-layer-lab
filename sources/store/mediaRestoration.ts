import type { AudioLabGet, AudioLabSet } from './audioLabStoreTypes';
import { loadAudioFile } from './mediaStorage';
import { showStatus } from './statusMessages';
import { loadCoordinator } from './loadCoordinator';

interface LayerRestoreTarget {
  id: string;
  assetId: string;
  name: string;
}

type RestoreGuard = () => boolean;

async function restoreMain(
  set: AudioLabSet,
  get: AudioLabGet,
  isCurrent: RestoreGuard,
): Promise<boolean> {
  const target = get().mainTrack;
  if (!target.assetId || target.buffer) {
    return true;
  }
  const token = loadCoordinator.beginMain();
  const file = await loadAudioFile(target.assetId, target.name);
  if (!isCurrent()) {
    return true;
  }
  const current = get().mainTrack;
  if (!loadCoordinator.isMainCurrent(token) || current.assetId !== target.assetId) {
    return true;
  }
  if (file) {
    await get().loadMainTrack(file);
    if (!isCurrent()) {
      return true;
    }
    return get().mainTrack.buffer !== null;
  }
  set((state) => ({
    mainTrack: { ...state.mainTrack, assetId: null, loadingState: 'remembered' },
  }));
  return false;
}

async function restoreLayer(
  set: AudioLabSet,
  get: AudioLabGet,
  target: LayerRestoreTarget,
  isCurrent: RestoreGuard,
): Promise<boolean> {
  const token = loadCoordinator.beginLayer(target.id);
  const file = await loadAudioFile(target.assetId, target.name);
  if (!isCurrent()) {
    return true;
  }
  const current = get().layers.find((layer) => layer.id === target.id);
  if (!loadCoordinator.isLayerCurrent(target.id, token) || current?.assetId !== target.assetId) {
    return true;
  }
  if (file) {
    await get().loadLayer(target.id, file);
    if (!isCurrent()) {
      return true;
    }
    return get().layers.find((layer) => layer.id === target.id)?.buffer !== null;
  }
  set((state) => ({
    layers: state.layers.map((layer) =>
      layer.id === target.id ? { ...layer, assetId: null, loadingState: 'remembered' } : layer,
    ),
  }));
  return false;
}

export async function restoreStoredAudio(
  set: AudioLabSet,
  get: AudioLabGet,
  isCurrent: RestoreGuard = () => true,
): Promise<void> {
  const layerTargets = get().layers.flatMap((layer) =>
    layer.assetId && !layer.buffer
      ? [{ id: layer.id, assetId: layer.assetId, name: layer.name }]
      : [],
  );
  const results = await Promise.all([
    restoreMain(set, get, isCurrent),
    ...layerTargets.map((target) => restoreLayer(set, get, target, isCurrent)),
  ]);
  if (!isCurrent()) {
    return;
  }
  const failures = results.filter((restored) => !restored).length;
  if (failures > 0) {
    showStatus(
      set,
      `${failures} stored audio file${failures === 1 ? '' : 's'} could not be restored — reload manually`,
    );
  }
}
