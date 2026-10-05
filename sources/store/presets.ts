import { parseSessionBody, type PersistedSession } from './persistence';
import { type MixSnapshot, type ABSlots, parseSnapshotList, parseABSlots } from './snapshots';

export const PRESET_SCHEMA = 'audio-layer-lab-session';
const SUPPORTED_VERSIONS = [1, 2, 3, 4];

export interface PresetData {
  schema: string;
  version: number;
  exportedAt: string;
  main: PersistedSession['main'];
  layers: PersistedSession['layers'];
  transport: PersistedSession['transport'];
  snapshots: MixSnapshot[];
  ab: ABSlots;
}

function snapshotWithoutLocalAssets(snapshot: MixSnapshot): MixSnapshot {
  return {
    ...snapshot,
    main: { ...snapshot.main, assetId: null },
    layers: snapshot.layers.map((layer) => ({ ...layer, assetId: null })),
  };
}

function withoutLocalAssets(session: PersistedSession): PersistedSession {
  return {
    ...session,
    main: { ...session.main, assetId: null },
    layers: session.layers.map((layer) => ({ ...layer, assetId: null })),
    snapshots: session.snapshots.map(snapshotWithoutLocalAssets),
    ab: {
      a: session.ab.a ? snapshotWithoutLocalAssets(session.ab.a) : null,
      b: session.ab.b ? snapshotWithoutLocalAssets(session.ab.b) : null,
    },
  };
}

export function serializePreset(session: PersistedSession, exportedAt?: string): PresetData {
  const portable = withoutLocalAssets(session);
  return {
    schema: PRESET_SCHEMA,
    version: portable.version,
    exportedAt: exportedAt ?? new Date().toISOString(),
    main: { ...portable.main },
    layers: portable.layers.map((layer) => ({ ...layer })),
    transport: { ...portable.transport },
    snapshots: portable.snapshots.map((snapshot) => ({
      ...snapshot,
      layers: snapshot.layers.map((layer) => ({ ...layer })),
    })),
    ab: {
      a: portable.ab.a
        ? { ...portable.ab.a, layers: portable.ab.a.layers.map((layer) => ({ ...layer })) }
        : null,
      b: portable.ab.b
        ? { ...portable.ab.b, layers: portable.ab.b.layers.map((layer) => ({ ...layer })) }
        : null,
    },
  };
}

export function isPresetLike(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const p = raw as Record<string, unknown>;
  return p['schema'] === PRESET_SCHEMA && typeof p['version'] === 'number';
}

export function parsePreset(raw: unknown): PersistedSession {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid preset: not an object');
  }
  const p = raw as Record<string, unknown>;
  if (p['schema'] !== PRESET_SCHEMA) {
    throw new Error('Invalid preset: unrecognized schema');
  }
  const version = p['version'];
  if (typeof version !== 'number' || !SUPPORTED_VERSIONS.includes(version)) {
    throw new Error(`Invalid preset: unsupported version`);
  }
  // parseSessionBody handles both v1 (no snapshots/ab → empty defaults) and v2
  const session = parseSessionBody(p);
  // v1 presets may carry snapshots/ab from PresetData even though version=1;
  // parseSessionBody already defaulted these, but honour them if present
  if (version === 1) {
    session.snapshots = parseSnapshotList(p['snapshots']);
    session.ab = parseABSlots(p['ab']);
  }
  return withoutLocalAssets(session);
}

export function downloadPreset(preset: PresetData): void {
  const json = JSON.stringify(preset, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `audio-layer-lab-session-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
