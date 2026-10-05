import { describe, it, expect } from 'vitest';
import { defaultSession, parseSessionBody, LAYER_COUNT } from './persistence';
import { buildMixSnapshot, parseSnapshot } from './snapshots';
import { assignDropFiles } from '../utils/dropAssignment';
import type { LayerState, MainTrackState, TransportState } from '../audio/types';

// ── Default layer identity ────────────────────────────────────────────────────

describe('default layer identity', () => {
  it('each default layer has a stable string id of the form "layer-N"', () => {
    const session = defaultSession();
    session.layers.forEach((l, i) => {
      expect(l.id).toBe(`layer-${i}`);
    });
  });

  it('each default layer has an order equal to its position', () => {
    const session = defaultSession();
    session.layers.forEach((l, i) => {
      expect(l.order).toBe(i);
    });
  });

  it('default layers do not have a slot field', () => {
    const session = defaultSession();
    session.layers.forEach((l) => {
      expect(Object.keys(l)).not.toContain('slot');
    });
  });
});

// ── Persistence backward compat: old slot-based sessions ─────────────────────

describe('persistence — old slot-based session parsing', () => {
  it('loads old v3 session with slot-keyed layers and infers id and order', () => {
    const oldV3: Record<string, unknown> = {
      version: 3,
      savedAt: '2026-01-01T00:00:00.000Z',
      main: {
        loop: false,
        volume: 0.8,
        pan: 0,
        filename: null,
        thumbnailUrl: null,
        bpm: null,
        bpmConfidence: null,
      },
      layers: [
        {
          slot: 0,
          volume: 0.7,
          pan: 0.2,
          muted: true,
          soloed: false,
          filename: 'bass.mp3',
          thumbnailUrl: null,
          bpm: 120,
          bpmConfidence: 'high',
        },
        {
          slot: 2,
          volume: 0.5,
          pan: 0,
          muted: false,
          soloed: true,
          filename: null,
          thumbnailUrl: null,
          bpm: null,
          bpmConfidence: null,
        },
      ],
      transport: { masterVolume: 0.9, masterMuted: false },
      snapshots: [],
      ab: { a: null, b: null },
    };
    const session = parseSessionBody(oldV3);

    // Slot 0 → id = 'layer-0', order = 0
    const layer0 = session.layers[0];
    expect(layer0.id).toBe('layer-0');
    expect(layer0.order).toBe(0);
    expect(layer0.volume).toBe(0.7);
    expect(layer0.muted).toBe(true);
    expect(layer0.filename).toBe('bass.mp3');

    // Slot 2 → id = 'layer-2', order = 2
    const layer2 = session.layers[2];
    expect(layer2.id).toBe('layer-2');
    expect(layer2.order).toBe(2);
    expect(layer2.soloed).toBe(true);

    // Missing slots fall back to defaults
    const layer1 = session.layers[1];
    expect(layer1.id).toBe('layer-1');
    expect(layer1.order).toBe(1);
    expect(layer1.volume).toBe(1);
  });

  it('produces exactly LAYER_COUNT layers from an old session with fewer raw layers', () => {
    const session = parseSessionBody({
      version: 3,
      savedAt: '',
      main: {},
      layers: [
        {
          slot: 0,
          volume: 0.5,
          pan: 0,
          muted: false,
          soloed: false,
          filename: null,
          thumbnailUrl: null,
        },
      ],
      transport: { masterVolume: 0.8, masterMuted: false },
    });
    expect(session.layers).toHaveLength(LAYER_COUNT);
  });
});

// ── Persistence new format: id + order ───────────────────────────────────────

describe('persistence — new id/order session round-trip', () => {
  it('round-trips id and order through save/parse', () => {
    const original = defaultSession();
    original.layers[3].volume = 0.4;
    const serialized = JSON.parse(JSON.stringify(original)) as Record<string, unknown>;
    const parsed = parseSessionBody(serialized);

    parsed.layers.forEach((l, i) => {
      expect(l.id).toBe(`layer-${i}`);
      expect(l.order).toBe(i);
    });
    expect(parsed.layers[3].volume).toBe(0.4);
  });
});

// ── Snapshot backward compat: old slot-based snapshots ───────────────────────

describe('snapshot — old slot-based snapshot parsing', () => {
  it('parses old snapshot with slot-keyed layers and infers id and order', () => {
    const raw = {
      id: 'snap1',
      name: 'My Mix',
      createdAt: '2026-01-01T00:00:00.000Z',
      main: {
        volume: 0.7,
        pan: 0,
        loop: false,
        filename: null,
        thumbnailUrl: null,
        bpm: null,
        bpmConfidence: null,
      },
      masterVolume: 0.8,
      masterMuted: false,
      layers: [
        {
          slot: 0,
          volume: 0.6,
          pan: 0,
          muted: false,
          soloed: false,
          filename: null,
          thumbnailUrl: null,
          bpm: null,
          bpmConfidence: null,
        },
        {
          slot: 3,
          volume: 0.9,
          pan: 0.5,
          muted: true,
          soloed: false,
          filename: 'kick.wav',
          thumbnailUrl: null,
          bpm: 140,
          bpmConfidence: 'medium',
        },
      ],
    };
    const snap = parseSnapshot(raw);
    expect(snap).not.toBeNull();

    const sl0 = snap!.layers[0];
    expect(sl0.id).toBe('layer-0');
    expect(sl0.order).toBe(0);
    expect(sl0.volume).toBe(0.6);

    const sl3 = snap!.layers[3];
    expect(sl3.id).toBe('layer-3');
    expect(sl3.order).toBe(3);
    expect(sl3.muted).toBe(true);
    expect(sl3.filename).toBe('kick.wav');

    // Missing slots get defaults
    const sl1 = snap!.layers[1];
    expect(sl1.id).toBe('layer-1');
    expect(sl1.order).toBe(1);
    expect(sl1.volume).toBe(1);
  });
});

// ── Snapshot new format: id + order ──────────────────────────────────────────

describe('snapshot — new id/order snapshot round-trip', () => {
  it('buildMixSnapshot serializes id and order from LayerState', () => {
    const layers: LayerState[] = [
      {
        id: 'layer-0',
        order: 0,
        name: 'bass.mp3',
        buffer: null,
        volume: 0.8,
        muted: false,
        loop: true,
        thumbnailUrl: null,
        pan: 0.1,
        soloed: false,
        loadingState: 'loaded',
        metadata: null,
      },
      {
        id: 'layer-1',
        order: 1,
        name: '',
        buffer: null,
        volume: 1,
        muted: false,
        loop: true,
        thumbnailUrl: null,
        pan: 0,
        soloed: false,
        loadingState: 'empty',
        metadata: null,
      },
    ];
    const main: Pick<
      MainTrackState,
      'volume' | 'pan' | 'loop' | 'name' | 'thumbnailUrl' | 'bpm' | 'bpmConfidence'
    > = {
      volume: 0.8,
      pan: 0,
      loop: false,
      name: '',
      thumbnailUrl: null,
      bpm: null,
      bpmConfidence: null,
    };
    const transport: Pick<TransportState, 'masterVolume' | 'masterMuted'> = {
      masterVolume: 0.9,
      masterMuted: false,
    };
    const snap = buildMixSnapshot(main, transport, layers, 'Test');

    expect(snap.layers[0].id).toBe('layer-0');
    expect(snap.layers[0].order).toBe(0);
    expect(snap.layers[1].id).toBe('layer-1');
    expect(snap.layers[1].order).toBe(1);
  });

  it('round-trips a snapshot that was built from new-format layers', () => {
    const layers: LayerState[] = Array.from({ length: LAYER_COUNT }, (_, i) => ({
      id: `layer-${i}`,
      order: i,
      name: i === 2 ? 'drums.wav' : '',
      buffer: null,
      volume: 1,
      muted: false,
      loop: true,
      thumbnailUrl: null,
      pan: 0,
      soloed: false,
      loadingState: 'empty' as const,
      metadata: null,
    }));
    const main: Pick<
      MainTrackState,
      'volume' | 'pan' | 'loop' | 'name' | 'thumbnailUrl' | 'bpm' | 'bpmConfidence'
    > = {
      volume: 0.8,
      pan: 0,
      loop: false,
      name: '',
      thumbnailUrl: null,
      bpm: null,
      bpmConfidence: null,
    };
    const transport: Pick<TransportState, 'masterVolume' | 'masterMuted'> = {
      masterVolume: 0.8,
      masterMuted: false,
    };
    const built = buildMixSnapshot(main, transport, layers, 'Round-trip');
    const parsed = parseSnapshot(built);

    expect(parsed).not.toBeNull();
    expect(parsed!.layers).toHaveLength(LAYER_COUNT);
    parsed!.layers.forEach((sl, i) => {
      expect(sl.id).toBe(`layer-${i}`);
      expect(sl.order).toBe(i);
    });
    expect(parsed!.layers[2].filename).toBe('drums.wav');
  });
});

// ── Drop assignment uses id not slot ──────────────────────────────────────────

describe('drop assignment uses layerId identity', () => {
  it('returned assignments carry layerId string, not a slot number', () => {
    const layers: LayerState[] = Array.from({ length: 3 }, (_, i) => ({
      id: `layer-${i}`,
      order: i,
      name: '',
      buffer: null,
      volume: 1,
      muted: false,
      loop: true,
      thumbnailUrl: null,
      pan: 0,
      soloed: false,
      loadingState: 'empty' as const,
      metadata: null,
    }));
    const files = [new File([''], 'a.mp3', { type: 'audio/mpeg' })];
    const { assignments } = assignDropFiles(files, layers);
    expect(assignments[0].layerId).toBe('layer-0');
    expect(Object.keys(assignments[0])).not.toContain('slot');
  });

  it('assigns by order when layers are supplied out of order', () => {
    // Layers deliberately in reverse order in the array
    const layers: LayerState[] = [
      {
        id: 'layer-4',
        order: 4,
        name: '',
        buffer: null,
        volume: 1,
        muted: false,
        loop: true,
        thumbnailUrl: null,
        pan: 0,
        soloed: false,
        loadingState: 'empty',
        metadata: null,
      },
      {
        id: 'layer-1',
        order: 1,
        name: '',
        buffer: null,
        volume: 1,
        muted: false,
        loop: true,
        thumbnailUrl: null,
        pan: 0,
        soloed: false,
        loadingState: 'empty',
        metadata: null,
      },
      {
        id: 'layer-0',
        order: 0,
        name: '',
        buffer: null,
        volume: 1,
        muted: false,
        loop: true,
        thumbnailUrl: null,
        pan: 0,
        soloed: false,
        loadingState: 'empty',
        metadata: null,
      },
    ];
    const files = [new File([''], 'a.mp3', { type: 'audio/mpeg' })];
    const { assignments } = assignDropFiles(files, layers);
    // Should assign to the layer with lowest order, which is layer-0
    expect(assignments[0].layerId).toBe('layer-0');
  });
});
