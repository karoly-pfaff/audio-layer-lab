import { describe, it, expect } from 'vitest';
import { serializePreset, parsePreset, isPresetLike, PRESET_SCHEMA } from './presets';
import { defaultSession } from './persistence';
import type { MixSnapshot } from './snapshots';

function makeSnapshot(overrides: Partial<MixSnapshot> = {}): MixSnapshot {
  return {
    id: 'snap1',
    name: 'Test Snap',
    createdAt: '2026-01-01T00:00:00.000Z',
    main: {
      volume: 0.8,
      pan: 0,
      loop: false,
      filename: null,
      thumbnailUrl: null,
      bpm: null,
      bpmConfidence: null,
    },
    masterVolume: 0.9,
    masterMuted: false,
    layers: Array.from({ length: 5 }, (_, i) => ({
      id: `layer-${i}`,
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
    ...overrides,
  };
}

describe('serializePreset', () => {
  it('produces correct schema name and version', () => {
    const preset = serializePreset(defaultSession());
    expect(preset.schema).toBe(PRESET_SCHEMA);
    expect(preset.version).toBe(4);
  });

  it('includes exportedAt as ISO string when not provided', () => {
    const preset = serializePreset(defaultSession());
    expect(typeof preset.exportedAt).toBe('string');
    expect(() => new Date(preset.exportedAt)).not.toThrow();
  });

  it('uses provided exportedAt', () => {
    const ts = '2026-05-28T12:00:00.000Z';
    const preset = serializePreset(defaultSession(), ts);
    expect(preset.exportedAt).toBe(ts);
  });

  it('copies main, layers, and transport from session', () => {
    const session = defaultSession();
    session.main.filename = 'my-track.mp3';
    session.layers[2].volume = 0.4;
    session.transport.masterMuted = true;
    const preset = serializePreset(session);
    expect(preset.main.filename).toBe('my-track.mp3');
    expect(preset.layers[2].volume).toBe(0.4);
    expect(preset.transport.masterMuted).toBe(true);
  });

  it('keeps browser-local media references out of portable presets', () => {
    const session = defaultSession();
    const assetId = `sha256-${'a'.repeat(64)}`;
    session.main.assetId = assetId;
    session.layers[0]!.assetId = assetId;
    session.snapshots = [
      makeSnapshot({
        main: { ...makeSnapshot().main, assetId },
        layers: makeSnapshot().layers.map((layer) => ({ ...layer, assetId })),
      }),
    ];
    session.ab.a = makeSnapshot({ main: { ...makeSnapshot().main, assetId } });

    const preset = serializePreset(session);
    expect(preset.main.assetId).toBeNull();
    expect(preset.layers[0]?.assetId).toBeNull();
    expect(preset.snapshots[0]?.main.assetId).toBeNull();
    expect(preset.snapshots[0]?.layers[0]?.assetId).toBeNull();
    expect(preset.ab.a?.main.assetId).toBeNull();
  });

  it('includes snapshots in preset', () => {
    const session = defaultSession();
    session.snapshots = [makeSnapshot({ name: 'My Snap' })];
    const preset = serializePreset(session);
    expect(preset.snapshots).toHaveLength(1);
    expect(preset.snapshots[0].name).toBe('My Snap');
  });

  it('includes ab slots in preset', () => {
    const session = defaultSession();
    session.ab.a = makeSnapshot({ name: 'A Slot' });
    const preset = serializePreset(session);
    expect(preset.ab.a).not.toBeNull();
    expect(preset.ab.a!.name).toBe('A Slot');
    expect(preset.ab.b).toBeNull();
  });

  it('produces empty snapshots and null ab when session has none', () => {
    const preset = serializePreset(defaultSession());
    expect(preset.snapshots).toEqual([]);
    expect(preset.ab).toEqual({ a: null, b: null });
  });
});

describe('isPresetLike', () => {
  it('returns true for a valid preset-shaped object', () => {
    const preset = serializePreset(defaultSession());
    expect(isPresetLike(preset)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isPresetLike(null)).toBe(false);
  });

  it('returns false for non-object primitives', () => {
    expect(isPresetLike('string')).toBe(false);
    expect(isPresetLike(42)).toBe(false);
  });

  it('returns false when schema field is missing', () => {
    expect(isPresetLike({ version: 2 })).toBe(false);
  });

  it('returns false for wrong schema name', () => {
    expect(isPresetLike({ schema: 'other-app', version: 2 })).toBe(false);
  });
});

describe('parsePreset', () => {
  it('round-trips with serializePreset', () => {
    const session = defaultSession();
    session.main.filename = 'my-track.mp3';
    session.main.loop = true;
    session.layers[1].volume = 0.5;
    session.layers[1].pan = -0.3;
    session.transport.masterMuted = true;
    const preset = serializePreset(session);
    const parsed = parsePreset(preset);
    expect(parsed.main.filename).toBe('my-track.mp3');
    expect(parsed.main.loop).toBe(true);
    expect(parsed.layers[1].volume).toBe(0.5);
    expect(parsed.layers[1].pan).toBe(-0.3);
    expect(parsed.transport.masterMuted).toBe(true);
  });

  it('never binds imported presets to browser-local media', () => {
    const assetId = `sha256-${'b'.repeat(64)}`;
    const preset = serializePreset(defaultSession()) as unknown as Record<string, unknown>;
    preset['main'] = { ...(preset['main'] as object), assetId };
    preset['layers'] = [{ ...(preset['layers'] as Record<string, unknown>[])[0], assetId }];
    const parsed = parsePreset(preset);
    expect(parsed.main.assetId).toBeNull();
    expect(parsed.layers[0]?.assetId).toBeNull();
  });

  it('round-trips snapshots through serialize + parse', () => {
    const session = defaultSession();
    session.snapshots = [makeSnapshot({ name: 'Snap A', masterVolume: 0.7 })];
    const preset = serializePreset(session);
    const parsed = parsePreset(preset);
    expect(parsed.snapshots).toHaveLength(1);
    expect(parsed.snapshots[0].name).toBe('Snap A');
    expect(parsed.snapshots[0].masterVolume).toBe(0.7);
  });

  it('round-trips ab slots through serialize + parse', () => {
    const session = defaultSession();
    session.ab.a = makeSnapshot({ name: 'A Mix' });
    session.ab.b = makeSnapshot({ name: 'B Mix' });
    const preset = serializePreset(session);
    const parsed = parsePreset(preset);
    expect(parsed.ab.a).not.toBeNull();
    expect(parsed.ab.a!.name).toBe('A Mix');
    expect(parsed.ab.b).not.toBeNull();
    expect(parsed.ab.b!.name).toBe('B Mix');
  });

  it('accepts v1 preset and adds empty snapshots/ab', () => {
    const v1Preset = {
      schema: PRESET_SCHEMA,
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      main: { loop: false, volume: 0.8, filename: 'old-track.mp3', thumbnailUrl: null },
      layers: Array.from({ length: 5 }, (_, i) => ({
        slot: i,
        volume: 1,
        pan: 0,
        muted: false,
        soloed: false,
        filename: null,
        thumbnailUrl: null,
      })),
      transport: { masterVolume: 0.8, masterMuted: false },
      // no snapshots, no ab
    };
    const parsed = parsePreset(v1Preset);
    expect(parsed.main.filename).toBe('old-track.mp3');
    expect(parsed.snapshots).toEqual([]);
    expect(parsed.ab).toEqual({ a: null, b: null });
  });

  it('accepts v1 preset that happens to carry snapshots', () => {
    const v1Preset = {
      schema: PRESET_SCHEMA,
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      main: { loop: false, volume: 0.8, filename: null, thumbnailUrl: null },
      layers: Array.from({ length: 5 }, (_, i) => ({
        slot: i,
        volume: 1,
        pan: 0,
        muted: false,
        soloed: false,
        filename: null,
        thumbnailUrl: null,
      })),
      transport: { masterVolume: 0.8, masterMuted: false },
      snapshots: [
        {
          id: 'x',
          name: 'Old Snap',
          createdAt: '',
          main: {},
          masterVolume: 0.8,
          masterMuted: false,
          layers: [],
        },
      ],
    };
    const parsed = parsePreset(v1Preset);
    expect(parsed.snapshots).toHaveLength(1);
    expect(parsed.snapshots[0].name).toBe('Old Snap');
  });

  it('throws on null input', () => {
    expect(() => parsePreset(null)).toThrow();
  });

  it('throws on non-object input', () => {
    expect(() => parsePreset('string')).toThrow();
    expect(() => parsePreset(42)).toThrow();
  });

  it('throws when schema field is missing', () => {
    expect(() => parsePreset({ version: 2 })).toThrow();
  });

  it('throws for wrong schema name', () => {
    expect(() => parsePreset({ schema: 'other-app', version: 2 })).toThrow();
  });

  it('throws for unsupported version number', () => {
    expect(() => parsePreset({ schema: PRESET_SCHEMA, version: 999 })).toThrow();
  });

  it('accepts v3 preset and round-trips bpm fields', () => {
    const session = defaultSession();
    session.main.bpm = 128;
    session.main.bpmConfidence = 'high';
    session.layers[1].bpm = 64;
    session.layers[1].bpmConfidence = 'medium';
    const preset = serializePreset(session);
    expect(preset.version).toBe(4);
    const parsed = parsePreset(preset);
    expect(parsed.main.bpm).toBe(128);
    expect(parsed.main.bpmConfidence).toBe('high');
    expect(parsed.layers[1].bpm).toBe(64);
    expect(parsed.layers[1].bpmConfidence).toBe('medium');
  });

  it('throws for non-numeric version', () => {
    expect(() => parsePreset({ schema: PRESET_SCHEMA, version: 'one' })).toThrow();
  });

  it('rejects completely unrelated JSON', () => {
    expect(() => parsePreset({ foo: 'bar', baz: 42 })).toThrow();
  });

  it('is tolerant for missing individual layer fields, filling defaults', () => {
    const preset = {
      schema: PRESET_SCHEMA,
      version: 2,
      exportedAt: '2026-05-28T00:00:00.000Z',
      main: { loop: false, volume: 0.8, filename: null, thumbnailUrl: null },
      layers: [{ slot: 0 }],
      transport: { masterVolume: 0.8, masterMuted: false },
    };
    const parsed = parsePreset(preset);
    expect(parsed.layers[0].volume).toBe(1);
    expect(parsed.layers[0].pan).toBe(0);
    expect(parsed.layers[0].muted).toBe(false);
    expect(parsed.layers).toHaveLength(5);
  });

  it('strips externally hosted layer thumbnail URLs', () => {
    const session = defaultSession();
    session.layers[3].thumbnailUrl = 'https://example.com/thumb.jpg';
    const preset = serializePreset(session);
    const parsed = parsePreset(preset);
    expect(parsed.layers[3].thumbnailUrl).toBeNull();
  });
});
