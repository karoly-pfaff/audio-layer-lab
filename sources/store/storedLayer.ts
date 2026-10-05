import { parseBpmConfidence, type BpmConfidence } from '../audio/types';
import { persistableUrl } from '../utils/urlUtils';
import { boundedString, clampFinite, parseAssetId, parseBpm, uniqueId } from '../utils/validation';
import { MAX_LAYER_COUNT } from './constants';

export interface StoredLayer {
  id: string;
  assetId?: string | null;
  order: number;
  volume: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
  filename: string | null;
  thumbnailUrl: string | null;
  bpm: number | null;
  bpmConfidence: BpmConfidence | null;
}

export function parseStoredLayer(raw: unknown, defaults: StoredLayer): StoredLayer {
  if (typeof raw !== 'object' || raw === null) {
    return defaults;
  }
  const value = raw as Record<string, unknown>;
  const legacySlot =
    typeof value['slot'] === 'number' && Number.isFinite(value['slot'])
      ? value['slot']
      : defaults.order;
  return {
    id: boundedString(value['id'], 80) ?? `layer-${legacySlot}`,
    assetId: parseAssetId(value['assetId']),
    order: clampFinite(value['order'], 0, MAX_LAYER_COUNT - 1, legacySlot),
    volume: clampFinite(value['volume'], 0, 1, defaults.volume),
    pan: clampFinite(value['pan'], -1, 1, defaults.pan),
    muted: typeof value['muted'] === 'boolean' ? value['muted'] : defaults.muted,
    soloed: typeof value['soloed'] === 'boolean' ? value['soloed'] : defaults.soloed,
    filename: boundedString(value['filename'], 512),
    thumbnailUrl:
      typeof value['thumbnailUrl'] === 'string' ? persistableUrl(value['thumbnailUrl']) : null,
    bpm: parseBpm(value['bpm']),
    bpmConfidence: parseBpmConfidence(value['bpmConfidence']),
  };
}

export function normalizeStoredLayers<T extends StoredLayer>(layers: T[]): T[] {
  const usedIds = new Set<string>();
  return layers.slice(0, MAX_LAYER_COUNT).map((layer, order) => ({
    ...layer,
    id: uniqueId(layer.id, `layer-${order}`, usedIds),
    order,
  }));
}
