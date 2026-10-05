import { parseBpmConfidence, type BpmConfidence } from '../audio/types';
import type { MainTrackState, LayerState, TransportState } from '../audio/types';
import { LAYER_COUNT, MAX_LAYER_COUNT } from './constants';
import { persistableUrl } from '../utils/urlUtils';
import { boundedString, clampFinite, parseAssetId, parseBpm } from '../utils/validation';
import { normalizeStoredLayers, parseStoredLayer, type StoredLayer } from './storedLayer';

export const MAX_SNAPSHOTS = 12;
export const MAX_NAME_LENGTH = 40;

type SnapshotLayer = StoredLayer;

export interface MixSnapshot {
  id: string;
  name: string;
  createdAt: string;
  main: {
    assetId?: string | null;
    volume: number;
    pan: number;
    loop: boolean;
    filename: string | null;
    thumbnailUrl: string | null;
    bpm: number | null;
    bpmConfidence: BpmConfidence | null;
  };
  masterVolume: number;
  masterMuted: boolean;
  layers: SnapshotLayer[];
}

export interface ABSlots {
  a: MixSnapshot | null;
  b: MixSnapshot | null;
}

function generateSnapshotId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function buildMixSnapshot(
  main: Pick<
    MainTrackState,
    'assetId' | 'volume' | 'pan' | 'loop' | 'name' | 'thumbnailUrl' | 'bpm' | 'bpmConfidence'
  >,
  transport: Pick<TransportState, 'masterVolume' | 'masterMuted'>,
  layers: LayerState[],
  name: string,
): MixSnapshot {
  return {
    id: generateSnapshotId(),
    name: name.slice(0, MAX_NAME_LENGTH),
    createdAt: new Date().toISOString(),
    main: {
      assetId: main.assetId ?? null,
      volume: main.volume,
      pan: main.pan,
      loop: main.loop,
      filename: main.name || null,
      thumbnailUrl: persistableUrl(main.thumbnailUrl),
      bpm: main.bpm ?? null,
      bpmConfidence: main.bpmConfidence ?? null,
    },
    masterVolume: transport.masterVolume,
    masterMuted: transport.masterMuted,
    layers: layers.map((l) => ({
      id: l.id,
      assetId: l.assetId ?? null,
      order: l.order,
      volume: l.volume,
      pan: l.pan,
      muted: l.muted,
      soloed: l.soloed,
      filename: l.name || null,
      thumbnailUrl: persistableUrl(l.thumbnailUrl),
      bpm: l.bpm ?? null,
      bpmConfidence: l.bpmConfidence ?? null,
    })),
  };
}

// orderIndex is the fallback position used when the raw data has no id/order/slot.
function parseSnapshotLayer(raw: unknown, orderIndex: number): SnapshotLayer {
  const def: SnapshotLayer = {
    id: `layer-${orderIndex}`,
    assetId: null,
    order: orderIndex,
    volume: 1,
    pan: 0,
    muted: false,
    soloed: false,
    filename: null,
    thumbnailUrl: null,
    bpm: null,
    bpmConfidence: null,
  };
  return parseStoredLayer(raw, def);
}

function parseSnapshotMain(raw: unknown): MixSnapshot['main'] {
  const def = {
    assetId: null,
    volume: 0.8,
    pan: 0,
    loop: false,
    filename: null,
    thumbnailUrl: null,
    bpm: null,
    bpmConfidence: null,
  } as MixSnapshot['main'];
  if (typeof raw !== 'object' || raw === null) {
    return def;
  }
  const r = raw as Record<string, unknown>;
  return {
    assetId: parseAssetId(r['assetId']),
    volume: clampFinite(r['volume'], 0, 1, def.volume),
    pan: clampFinite(r['pan'], -1, 1, def.pan),
    loop: typeof r['loop'] === 'boolean' ? r['loop'] : def.loop,
    filename: boundedString(r['filename'], 512),
    thumbnailUrl: typeof r['thumbnailUrl'] === 'string' ? persistableUrl(r['thumbnailUrl']) : null,
    bpm: parseBpm(r['bpm']),
    bpmConfidence: parseBpmConfidence(r['bpmConfidence']),
  };
}

export function parseSnapshot(raw: unknown): MixSnapshot | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const r = raw as Record<string, unknown>;

  const id = boundedString(r['id'], 80) ?? generateSnapshotId();
  const name = boundedString(r['name'], MAX_NAME_LENGTH) ?? 'Snapshot';
  const createdAt = boundedString(r['createdAt'], 64) ?? new Date().toISOString();
  const masterVolume = clampFinite(r['masterVolume'], 0, 1, 0.8);
  const masterMuted = typeof r['masterMuted'] === 'boolean' ? r['masterMuted'] : false;

  const rawLayers: unknown[] = Array.isArray(r['layers']) ? r['layers'] : [];

  let layers: SnapshotLayer[];
  if (rawLayers.length === 0) {
    // No layer data — LAYER_COUNT defaults (backward compat with old snapshots)
    layers = Array.from({ length: LAYER_COUNT }, (_, i) => parseSnapshotLayer(null, i));
  } else if (
    rawLayers.some(
      (l) =>
        typeof l === 'object' &&
        l !== null &&
        typeof (l as Record<string, unknown>)['slot'] === 'number' &&
        typeof (l as Record<string, unknown>)['id'] !== 'string',
    )
  ) {
    // Old slot-based format: expand to LAYER_COUNT, match by slot or id
    layers = Array.from({ length: LAYER_COUNT }, (_, i) => {
      const defaultId = `layer-${i}`;
      const rawLayer = rawLayers.find(
        (l) =>
          typeof l === 'object' &&
          l !== null &&
          ((l as Record<string, unknown>)['id'] === defaultId ||
            (l as Record<string, unknown>)['slot'] === i),
      );
      return parseSnapshotLayer(rawLayer, i);
    });
  } else {
    // New id/order format: parse each layer in array position (dynamic count)
    layers = rawLayers
      .slice(0, MAX_LAYER_COUNT)
      .map((rawLayer, i) => parseSnapshotLayer(rawLayer, i));
  }

  layers = normalizeStoredLayers(layers);

  return {
    id,
    name,
    createdAt,
    main: parseSnapshotMain(r['main']),
    masterVolume,
    masterMuted,
    layers,
  };
}

export function parseSnapshotList(raw: unknown): MixSnapshot[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const results: MixSnapshot[] = [];
  for (const item of raw) {
    if (results.length >= MAX_SNAPSHOTS) {
      break;
    }
    const parsed = parseSnapshot(item);
    if (parsed !== null) {
      results.push(parsed);
    }
  }
  return results;
}

export function parseABSlots(raw: unknown): ABSlots {
  if (typeof raw !== 'object' || raw === null) {
    return { a: null, b: null };
  }
  const r = raw as Record<string, unknown>;
  return {
    a: r['a'] !== null && r['a'] !== undefined ? parseSnapshot(r['a']) : null,
    b: r['b'] !== null && r['b'] !== undefined ? parseSnapshot(r['b']) : null,
  };
}
