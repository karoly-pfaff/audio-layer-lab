import { type MixSnapshot, type ABSlots, parseSnapshotList, parseABSlots } from './snapshots';
import { parseBpmConfidence, type BpmConfidence } from '../audio/types';
import { persistableUrl } from '../utils/urlUtils';
import { boundedString, clampFinite, parseAssetId, parseBpm } from '../utils/validation';
import { LAYER_COUNT, MAX_LAYER_COUNT } from './constants';
import { normalizeStoredLayers, parseStoredLayer, type StoredLayer } from './storedLayer';
import { currentSessionOwnershipFence } from './sessionOwnership';

export { LAYER_COUNT, MAX_LAYER_COUNT } from './constants';

const STORAGE_KEY = 'audio-layer-lab-session';
export const SCHEMA_VERSION = 4;
let lastSaveSucceeded = true;

export type PersistedLayer = StoredLayer;

export interface PersistedSession {
  version: number;
  savedAt: string;
  main: {
    assetId?: string | null;
    loop: boolean;
    volume: number;
    pan: number;
    filename: string | null;
    thumbnailUrl: string | null;
    bpm: number | null;
    bpmConfidence: BpmConfidence | null;
  };
  layers: PersistedLayer[];
  transport: {
    masterVolume: number;
    masterMuted: boolean;
  };
  snapshots: MixSnapshot[];
  ab: ABSlots;
}

export function generateLayerId(): string {
  return `layer-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function defaultSession(): PersistedSession {
  return {
    version: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    main: {
      assetId: null,
      loop: false,
      volume: 0.8,
      pan: 0,
      filename: null,
      thumbnailUrl: null,
      bpm: null,
      bpmConfidence: null,
    },
    layers: Array.from({ length: LAYER_COUNT }, (_, i) => ({
      id: `layer-${i}`,
      assetId: null,
      order: i,
      volume: 1,
      pan: 0,
      muted: false,
      soloed: false,
      filename: null,
      thumbnailUrl: null,
      bpm: null,
      bpmConfidence: null,
    })),
    transport: { masterVolume: 0.8, masterMuted: false },
    snapshots: [],
    ab: { a: null, b: null },
  };
}

function parseMain(raw: unknown, def: PersistedSession['main']): PersistedSession['main'] {
  if (typeof raw !== 'object' || raw === null) {
    return def;
  }
  const r = raw as Record<string, unknown>;
  return {
    assetId: parseAssetId(r['assetId']),
    loop: typeof r['loop'] === 'boolean' ? r['loop'] : def.loop,
    volume: clampFinite(r['volume'], 0, 1, def.volume),
    pan: clampFinite(r['pan'], -1, 1, def.pan),
    filename: boundedString(r['filename'], 512),
    thumbnailUrl: typeof r['thumbnailUrl'] === 'string' ? persistableUrl(r['thumbnailUrl']) : null,
    bpm: parseBpm(r['bpm']),
    bpmConfidence: parseBpmConfidence(r['bpmConfidence']),
  };
}

function parseTransport(
  raw: unknown,
  def: PersistedSession['transport'],
): PersistedSession['transport'] {
  if (typeof raw !== 'object' || raw === null) {
    return def;
  }
  const r = raw as Record<string, unknown>;
  return {
    masterVolume: clampFinite(r['masterVolume'], 0, 1, def.masterVolume),
    masterMuted: typeof r['masterMuted'] === 'boolean' ? r['masterMuted'] : def.masterMuted,
  };
}

function isOldFormatLayer(l: unknown): boolean {
  return (
    typeof l === 'object' &&
    l !== null &&
    typeof (l as Record<string, unknown>)['slot'] === 'number' &&
    typeof (l as Record<string, unknown>)['id'] !== 'string'
  );
}

export function parseSessionBody(p: Record<string, unknown>): PersistedSession {
  const def = defaultSession();
  const rawLayers: unknown[] = Array.isArray(p['layers']) ? (p['layers'] as unknown[]) : [];

  let layers: PersistedLayer[];
  if (rawLayers.length === 0) {
    // No layer data — produce LAYER_COUNT defaults (backward compat)
    layers = def.layers;
  } else if (rawLayers.some(isOldFormatLayer)) {
    // Old slot-based format: expand to LAYER_COUNT, match by slot or id
    layers = def.layers.map((defLayer) => {
      const rawLayer = rawLayers.find(
        (l) =>
          typeof l === 'object' &&
          l !== null &&
          ((l as Record<string, unknown>)['id'] === defLayer.id ||
            (l as Record<string, unknown>)['slot'] === defLayer.order),
      );
      return parseStoredLayer(rawLayer, defLayer);
    });
  } else {
    // New id/order format: parse each layer in array position (dynamic count)
    layers = rawLayers.slice(0, MAX_LAYER_COUNT).map((raw, i) => {
      const fallback: PersistedLayer = {
        id: `layer-${i}`,
        assetId: null,
        order: i,
        volume: 1,
        pan: 0,
        muted: false,
        soloed: false,
        filename: null,
        thumbnailUrl: null,
        bpm: null,
        bpmConfidence: null,
      };
      return parseStoredLayer(raw, fallback);
    });
  }

  return {
    version: SCHEMA_VERSION,
    savedAt: boundedString(p['savedAt'], 64) ?? def.savedAt,
    main: parseMain(p['main'], def.main),
    layers: normalizeStoredLayers(layers),
    transport: parseTransport(p['transport'], def.transport),
    snapshots: parseSnapshotList(p['snapshots']),
    ab: parseABSlots(p['ab']),
  };
}

export function loadSession(): PersistedSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultSession();
    }
    return parseStoredSession(raw) ?? defaultSession();
  } catch {
    return defaultSession();
  }
}

function parseStoredSession(raw: string): PersistedSession | null {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const body = parsed as Record<string, unknown>;
  const version = body['version'];
  // Older sessions remain valid; v4 adds local media asset references.
  return version === 1 || version === 2 || version === 3 || version === 4
    ? parseSessionBody(body)
    : null;
}

export function loadDurableSessionForCleanup(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseStoredSession(raw) : null;
  } catch {
    // Cleanup must stop if the durable commit cannot be read with certainty.
    return null;
  }
}

export function saveSession(session: PersistedSession): boolean {
  try {
    // Persistence is passive: only the ownership UI may acquire or take over a lease.
    if (!currentSessionOwnershipFence()) {
      lastSaveSucceeded = false;
      return false;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    lastSaveSucceeded = true;
    return true;
  } catch {
    lastSaveSucceeded = false;
    return false;
  }
}

export function sessionPersistenceHealthy(): boolean {
  return lastSaveSucceeded;
}

export function clearSession(): boolean {
  try {
    if (!currentSessionOwnershipFence()) {
      lastSaveSucceeded = false;
      return false;
    }
    localStorage.removeItem(STORAGE_KEY);
    lastSaveSucceeded = true;
    return true;
  } catch {
    lastSaveSucceeded = false;
    return false;
  }
}
