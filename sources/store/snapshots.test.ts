import { describe, it, expect } from 'vitest';
import {
  buildMixSnapshot,
  parseSnapshot,
  parseSnapshotList,
  parseABSlots,
  MAX_SNAPSHOTS,
  MAX_NAME_LENGTH,
} from './snapshots';
import type { LayerState, MainTrackState, TransportState } from '../audio/types';
import { MAX_LAYER_COUNT } from './constants';

function makeMain(overrides: Partial<MainTrackState> = {}): MainTrackState {
  return {
    id: 'main',
    name: 'track.mp3',
    buffer: null,
    volume: 0.8,
    pan: 0,
    muted: false,
    loop: false,
    thumbnailUrl: null,
    loadingState: 'loaded',
    metadata: null,
    ...overrides,
  };
}

function makeTransport(overrides: Partial<TransportState> = {}): TransportState {
  return {
    playing: false,
    masterVolume: 0.9,
    masterMuted: false,
    positionRevision: 0,
    ...overrides,
  };
}

function makeLayer(order: number, overrides: Partial<LayerState> = {}): LayerState {
  return {
    id: `layer-${order}`,
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
    ...overrides,
  };
}

// ── buildMixSnapshot ──────────────────────────────────────────────────────────

describe('buildMixSnapshot', () => {
  it('captures main volume and loop', () => {
    const snap = buildMixSnapshot(
      makeMain({ volume: 0.6, loop: true }),
      makeTransport(),
      [],
      'Test',
    );
    expect(snap.main.volume).toBe(0.6);
    expect(snap.main.loop).toBe(true);
  });

  it('captures master volume and mute', () => {
    const snap = buildMixSnapshot(
      makeMain(),
      makeTransport({ masterVolume: 0.7, masterMuted: true }),
      [],
      'Test',
    );
    expect(snap.masterVolume).toBe(0.7);
    expect(snap.masterMuted).toBe(true);
  });

  it('captures layer mix settings', () => {
    const layers = [makeLayer(0, { volume: 0.5, pan: -0.3, muted: true, soloed: false })];
    const snap = buildMixSnapshot(makeMain(), makeTransport(), layers, 'Test');
    expect(snap.layers[0].volume).toBe(0.5);
    expect(snap.layers[0].pan).toBe(-0.3);
    expect(snap.layers[0].muted).toBe(true);
  });

  it('captures layer filename, id, and order', () => {
    const layers = [makeLayer(2, { name: 'drums.mp3' })];
    const snap = buildMixSnapshot(makeMain(), makeTransport(), layers, 'Test');
    expect(snap.layers[0].id).toBe('layer-2');
    expect(snap.layers[0].order).toBe(2);
    expect(snap.layers[0].filename).toBe('drums.mp3');
  });

  it('strips blob: thumbnailUrls to null', () => {
    const layers = [makeLayer(0, { thumbnailUrl: 'blob:http://localhost/xyz' })];
    const snap = buildMixSnapshot(
      makeMain({ thumbnailUrl: 'blob:http://localhost/abc' }),
      makeTransport(),
      layers,
      'Test',
    );
    expect(snap.main.thumbnailUrl).toBeNull();
    expect(snap.layers[0].thumbnailUrl).toBeNull();
  });

  it('strips externally hosted thumbnailUrls', () => {
    const layers = [makeLayer(0, { thumbnailUrl: 'https://example.com/img.jpg' })];
    const snap = buildMixSnapshot(makeMain(), makeTransport(), layers, 'Test');
    expect(snap.layers[0].thumbnailUrl).toBeNull();
  });

  it('truncates name to MAX_NAME_LENGTH', () => {
    const longName = 'A'.repeat(MAX_NAME_LENGTH + 10);
    const snap = buildMixSnapshot(makeMain(), makeTransport(), [], longName);
    expect(snap.name.length).toBe(MAX_NAME_LENGTH);
  });

  it('assigns a non-empty id', () => {
    const snap = buildMixSnapshot(makeMain(), makeTransport(), [], 'Test');
    expect(typeof snap.id).toBe('string');
    expect(snap.id.length).toBeGreaterThan(0);
  });

  it('captures bpm and bpmConfidence from main when present', () => {
    const snap = buildMixSnapshot(
      makeMain({ bpm: 128, bpmConfidence: 'high' }),
      makeTransport(),
      [],
      'Test',
    );
    expect(snap.main.bpm).toBe(128);
    expect(snap.main.bpmConfidence).toBe('high');
  });

  it('captures bpm and bpmConfidence from layers when present', () => {
    const layers = [makeLayer(0, { bpm: 64, bpmConfidence: 'medium' })];
    const snap = buildMixSnapshot(makeMain(), makeTransport(), layers, 'Test');
    expect(snap.layers[0].bpm).toBe(64);
    expect(snap.layers[0].bpmConfidence).toBe('medium');
  });
});

// ── parseSnapshot ─────────────────────────────────────────────────────────────

describe('parseSnapshot', () => {
  it('returns null for null input', () => {
    expect(parseSnapshot(null)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(parseSnapshot('string')).toBeNull();
    expect(parseSnapshot(42)).toBeNull();
  });

  it('round-trips a valid snapshot', () => {
    const layers = [makeLayer(0, { volume: 0.7, pan: 0.5, name: 'bass.mp3' })];
    const original = buildMixSnapshot(
      makeMain({ volume: 0.6, loop: true }),
      makeTransport({ masterVolume: 0.8 }),
      layers,
      'Round-trip test',
    );
    const parsed = parseSnapshot(original);
    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe(original.id);
    expect(parsed!.name).toBe('Round-trip test');
    expect(parsed!.main.volume).toBe(0.6);
    expect(parsed!.main.loop).toBe(true);
    expect(parsed!.masterVolume).toBe(0.8);
    expect(parsed!.layers[0].volume).toBe(0.7);
    expect(parsed!.layers[0].pan).toBe(0.5);
    expect(parsed!.layers[0].filename).toBe('bass.mp3');
  });

  it('clamps volume above 1 to 1', () => {
    const snap = parseSnapshot({
      id: 'x',
      name: 'Test',
      createdAt: '',
      main: {},
      masterVolume: 1.5,
      masterMuted: false,
      layers: [],
    });
    expect(snap!.masterVolume).toBe(1);
  });

  it('clamps volume below 0 to 0', () => {
    const snap = parseSnapshot({
      id: 'x',
      name: 'Test',
      createdAt: '',
      main: {},
      masterVolume: -0.5,
      masterMuted: false,
      layers: [],
    });
    expect(snap!.masterVolume).toBe(0);
  });

  it('clamps layer volume to [0, 1]', () => {
    const snap = parseSnapshot({
      id: 'x',
      name: 'T',
      createdAt: '',
      main: {},
      masterVolume: 0.8,
      masterMuted: false,
      layers: [{ slot: 0, volume: 2.5, pan: 0, muted: false, soloed: false }],
    });
    expect(snap!.layers[0].volume).toBe(1);
  });

  it('clamps layer pan to [-1, 1]', () => {
    const snap = parseSnapshot({
      id: 'x',
      name: 'T',
      createdAt: '',
      main: {},
      masterVolume: 0.8,
      masterMuted: false,
      layers: [{ slot: 0, volume: 1, pan: -3, muted: false, soloed: false }],
    });
    expect(snap!.layers[0].pan).toBe(-1);
  });

  it('truncates name to MAX_NAME_LENGTH', () => {
    const snap = parseSnapshot({
      id: 'x',
      name: 'A'.repeat(60),
      createdAt: '',
      main: {},
      masterVolume: 0.8,
      masterMuted: false,
      layers: [],
    });
    expect(snap!.name.length).toBe(MAX_NAME_LENGTH);
  });

  it('generates a new id when id is empty', () => {
    const snap = parseSnapshot({
      id: '',
      name: 'T',
      createdAt: '',
      main: {},
      masterVolume: 0.8,
      masterMuted: false,
      layers: [],
    });
    expect(snap!.id.length).toBeGreaterThan(0);
  });

  it('fills 5 layer slots even if raw has fewer', () => {
    const snap = parseSnapshot({
      id: 'x',
      name: 'T',
      createdAt: '',
      main: {},
      masterVolume: 0.8,
      masterMuted: false,
      layers: [],
    });
    expect(snap!.layers).toHaveLength(5);
  });

  it('strips blob: thumbnailUrl in layers', () => {
    const snap = parseSnapshot({
      id: 'x',
      name: 'T',
      createdAt: '',
      main: {},
      masterVolume: 0.8,
      masterMuted: false,
      layers: [
        {
          slot: 0,
          volume: 1,
          pan: 0,
          muted: false,
          soloed: false,
          thumbnailUrl: 'blob:http://localhost/xyz',
        },
      ],
    });
    expect(snap!.layers[0].thumbnailUrl).toBeNull();
  });

  it('strips externally hosted thumbnailUrl in layers', () => {
    const snap = parseSnapshot({
      id: 'x',
      name: 'T',
      createdAt: '',
      main: {},
      masterVolume: 0.8,
      masterMuted: false,
      layers: [
        {
          slot: 0,
          volume: 1,
          pan: 0,
          muted: false,
          soloed: false,
          thumbnailUrl: 'https://example.com/img.jpg',
        },
      ],
    });
    expect(snap!.layers[0].thumbnailUrl).toBeNull();
  });

  it('defaults missing main fields', () => {
    const snap = parseSnapshot({
      id: 'x',
      name: 'T',
      createdAt: '',
      main: null,
      masterVolume: 0.8,
      masterMuted: false,
      layers: [],
    });
    expect(snap!.main.volume).toBe(0.8);
    expect(snap!.main.loop).toBe(false);
    expect(snap!.main.filename).toBeNull();
  });

  it('round-trips bpm and bpmConfidence in layers', () => {
    const raw = {
      id: 'x',
      name: 'T',
      createdAt: '',
      main: { bpm: 120, bpmConfidence: 'high' },
      masterVolume: 0.8,
      masterMuted: false,
      layers: [
        {
          slot: 0,
          volume: 1,
          pan: 0,
          muted: false,
          soloed: false,
          bpm: 60,
          bpmConfidence: 'medium',
        },
      ],
    };
    const snap = parseSnapshot(raw);
    expect(snap!.main.bpm).toBe(120);
    expect(snap!.main.bpmConfidence).toBe('high');
    expect(snap!.layers[0].bpm).toBe(60);
    expect(snap!.layers[0].bpmConfidence).toBe('medium');
  });

  it('defaults bpm fields to null when missing', () => {
    const raw = {
      id: 'x',
      name: 'T',
      createdAt: '',
      main: {},
      masterVolume: 0.8,
      masterMuted: false,
      layers: [],
    };
    const snap = parseSnapshot(raw);
    expect(snap!.main.bpm).toBeNull();
    expect(snap!.main.bpmConfidence).toBeNull();
    expect(snap!.layers[0].bpm).toBeNull();
  });

  it('caps layers and assigns unique normalized identities', () => {
    const rawLayers = Array.from({ length: MAX_LAYER_COUNT + 3 }, () => ({
      id: 'duplicate',
      order: 999,
      volume: 1,
      pan: 0,
      muted: false,
      soloed: false,
    }));
    const snap = parseSnapshot({
      id: 'x',
      name: 'T',
      createdAt: '',
      main: {},
      masterVolume: 0.8,
      masterMuted: false,
      layers: rawLayers,
    });
    expect(snap!.layers).toHaveLength(MAX_LAYER_COUNT);
    expect(new Set(snap!.layers.map((layer) => layer.id)).size).toBe(MAX_LAYER_COUNT);
    expect(snap!.layers.map((layer) => layer.order)).toEqual(
      Array.from({ length: MAX_LAYER_COUNT }, (_, index) => index),
    );
  });
});

// ── parseSnapshotList ─────────────────────────────────────────────────────────

describe('parseSnapshotList', () => {
  it('returns empty array for non-array input', () => {
    expect(parseSnapshotList(null)).toEqual([]);
    expect(parseSnapshotList('string')).toEqual([]);
    expect(parseSnapshotList({})).toEqual([]);
  });

  it('returns empty array for empty array', () => {
    expect(parseSnapshotList([])).toEqual([]);
  });

  it('parses valid snapshots', () => {
    const raw = [
      {
        id: 'a',
        name: 'Mix A',
        createdAt: '',
        main: {},
        masterVolume: 0.8,
        masterMuted: false,
        layers: [],
      },
      {
        id: 'b',
        name: 'Mix B',
        createdAt: '',
        main: {},
        masterVolume: 0.7,
        masterMuted: false,
        layers: [],
      },
    ];
    const result = parseSnapshotList(raw);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Mix A');
  });

  it('drops invalid entries', () => {
    const raw = [
      null,
      'string',
      {
        id: 'a',
        name: 'Valid',
        createdAt: '',
        main: {},
        masterVolume: 0.8,
        masterMuted: false,
        layers: [],
      },
    ];
    const result = parseSnapshotList(raw);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Valid');
  });

  it(`limits list to MAX_SNAPSHOTS (${MAX_SNAPSHOTS})`, () => {
    const raw = Array.from({ length: MAX_SNAPSHOTS + 5 }, (_, i) => ({
      id: `snap-${i}`,
      name: `Snap ${i}`,
      createdAt: '',
      main: {},
      masterVolume: 0.8,
      masterMuted: false,
      layers: [],
    }));
    const result = parseSnapshotList(raw);
    expect(result).toHaveLength(MAX_SNAPSHOTS);
  });
});

// ── parseABSlots ──────────────────────────────────────────────────────────────

describe('parseABSlots', () => {
  it('returns null slots for non-object input', () => {
    expect(parseABSlots(null)).toEqual({ a: null, b: null });
    expect(parseABSlots('string')).toEqual({ a: null, b: null });
  });

  it('returns null slots for empty object', () => {
    expect(parseABSlots({})).toEqual({ a: null, b: null });
  });

  it('parses a and b slots', () => {
    const snapRaw = {
      id: 'x',
      name: 'A',
      createdAt: '',
      main: {},
      masterVolume: 0.8,
      masterMuted: false,
      layers: [],
    };
    const result = parseABSlots({ a: snapRaw, b: null });
    expect(result.a).not.toBeNull();
    expect(result.a!.name).toBe('A');
    expect(result.b).toBeNull();
  });

  it('returns null for invalid slot value', () => {
    const result = parseABSlots({ a: 'invalid', b: 42 });
    // parseSnapshot returns null for non-objects... but 'invalid' is a string, not null
    // parseSnapshot('invalid') returns null
    expect(result.a).toBeNull();
    expect(result.b).toBeNull();
  });
});
