import { describe, it, expect } from 'vitest';
import {
  defaultSession,
  parseSessionBody,
  LAYER_COUNT,
  MAX_LAYER_COUNT,
  generateLayerId,
} from './persistence';
import { buildMixSnapshot, parseSnapshot } from './snapshots';
import { assignDropFiles } from '../utils/dropAssignment';
import type { LayerState, MainTrackState, TransportState } from '../audio/types';

// ── Constants ─────────────────────────────────────────────────────────────────

describe('MAX_LAYER_COUNT', () => {
  it('equals 12', () => {
    expect(MAX_LAYER_COUNT).toBe(12);
  });

  it('is greater than LAYER_COUNT', () => {
    expect(MAX_LAYER_COUNT).toBeGreaterThan(LAYER_COUNT);
  });
});

// ── generateLayerId ───────────────────────────────────────────────────────────

describe('generateLayerId', () => {
  it('returns a non-empty string', () => {
    expect(typeof generateLayerId()).toBe('string');
    expect(generateLayerId().length).toBeGreaterThan(0);
  });

  it('two sequential calls return different values', () => {
    expect(generateLayerId()).not.toBe(generateLayerId());
  });

  it('generated ids start with "layer-"', () => {
    expect(generateLayerId().startsWith('layer-')).toBe(true);
  });

  it('generated ids do not collide with default layer-N ids', () => {
    // Default ids are exactly "layer-0" through "layer-N".
    // generateLayerId appends a timestamp+random suffix that is longer.
    const id = generateLayerId();
    for (let i = 0; i < MAX_LAYER_COUNT; i++) {
      expect(id).not.toBe(`layer-${i}`);
    }
  });
});

// ── parseSessionBody — dynamic layer count ────────────────────────────────────

describe('parseSessionBody — dynamic layer count', () => {
  it('parses a new-format session with 3 layers as exactly 3 layers', () => {
    const raw = {
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
          id: 'layer-0',
          order: 0,
          volume: 0.9,
          pan: 0,
          muted: false,
          soloed: false,
          filename: null,
          thumbnailUrl: null,
          bpm: null,
          bpmConfidence: null,
        },
        {
          id: 'layer-1',
          order: 1,
          volume: 0.8,
          pan: 0,
          muted: false,
          soloed: false,
          filename: 'bass.mp3',
          thumbnailUrl: null,
          bpm: null,
          bpmConfidence: null,
        },
        {
          id: 'layer-2',
          order: 2,
          volume: 0.7,
          pan: 0,
          muted: true,
          soloed: false,
          filename: null,
          thumbnailUrl: null,
          bpm: null,
          bpmConfidence: null,
        },
      ],
      transport: { masterVolume: 0.8, masterMuted: false },
    };
    const session = parseSessionBody(raw as Record<string, unknown>);
    expect(session.layers).toHaveLength(3);
    expect(session.layers[0].id).toBe('layer-0');
    expect(session.layers[1].filename).toBe('bass.mp3');
    expect(session.layers[2].muted).toBe(true);
  });

  it('parses a new-format session with 7 layers as exactly 7 layers', () => {
    const raw = {
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
      layers: Array.from({ length: 7 }, (_, i) => ({
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
      transport: { masterVolume: 0.8, masterMuted: false },
    };
    const session = parseSessionBody(raw as Record<string, unknown>);
    expect(session.layers).toHaveLength(7);
    session.layers.forEach((l, i) => {
      expect(l.id).toBe(`layer-${i}`);
      expect(l.order).toBe(i);
    });
  });

  it('new-format session round-trips through JSON with dynamic layer count', () => {
    const original = defaultSession();
    // Simulate adding 2 more layers
    original.layers.push({
      id: 'layer-custom-a',
      order: 5,
      volume: 0.6,
      pan: 0.3,
      muted: false,
      soloed: false,
      filename: 'kick.wav',
      thumbnailUrl: null,
      bpm: 120,
      bpmConfidence: 'high',
    });
    original.layers.push({
      id: 'layer-custom-b',
      order: 6,
      volume: 1,
      pan: 0,
      muted: false,
      soloed: false,
      filename: null,
      thumbnailUrl: null,
      bpm: null,
      bpmConfidence: null,
    });
    const serialized = JSON.parse(JSON.stringify(original)) as Record<string, unknown>;
    const parsed = parseSessionBody(serialized);

    expect(parsed.layers).toHaveLength(7);
    expect(parsed.layers[5].id).toBe('layer-custom-a');
    expect(parsed.layers[5].filename).toBe('kick.wav');
    expect(parsed.layers[5].volume).toBe(0.6);
    expect(parsed.layers[6].id).toBe('layer-custom-b');
    expect(parsed.layers[6].order).toBe(6);
  });

  it('old slot-based 5-layer session still produces LAYER_COUNT layers', () => {
    const raw = {
      version: 2,
      savedAt: '',
      main: {},
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
    };
    const session = parseSessionBody(raw as Record<string, unknown>);
    expect(session.layers).toHaveLength(LAYER_COUNT);
  });

  it('empty layers array produces LAYER_COUNT defaults', () => {
    const raw = {
      version: 3,
      savedAt: '',
      main: {},
      layers: [],
      transport: { masterVolume: 0.8, masterMuted: false },
    };
    const session = parseSessionBody(raw as Record<string, unknown>);
    expect(session.layers).toHaveLength(LAYER_COUNT);
    session.layers.forEach((l, i) => {
      expect(l.id).toBe(`layer-${i}`);
    });
  });
});

// ── parseSnapshot — dynamic layer count ──────────────────────────────────────

describe('parseSnapshot — dynamic layer count', () => {
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

  it('buildMixSnapshot + parseSnapshot round-trips a 3-layer set', () => {
    const layers: LayerState[] = Array.from({ length: 3 }, (_, i) => ({
      id: `layer-${i}`,
      order: i,
      name: i === 1 ? 'bass.mp3' : '',
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
    const built = buildMixSnapshot(main, transport, layers, 'Three');
    const parsed = parseSnapshot(built);

    expect(parsed).not.toBeNull();
    expect(parsed!.layers).toHaveLength(3);
    parsed!.layers.forEach((sl, i) => {
      expect(sl.id).toBe(`layer-${i}`);
      expect(sl.order).toBe(i);
    });
    expect(parsed!.layers[1].filename).toBe('bass.mp3');
  });

  it('buildMixSnapshot + parseSnapshot round-trips a 7-layer set', () => {
    const layers: LayerState[] = Array.from({ length: 7 }, (_, i) => ({
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
    const built = buildMixSnapshot(main, transport, layers, 'Seven');
    const parsed = parseSnapshot(built);

    expect(parsed).not.toBeNull();
    expect(parsed!.layers).toHaveLength(7);
  });

  it('old slot-based snapshot still expands to LAYER_COUNT', () => {
    const raw = {
      id: 'old1',
      name: 'Old',
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
      masterVolume: 0.8,
      masterMuted: false,
      layers: [
        {
          slot: 0,
          volume: 0.7,
          pan: 0,
          muted: false,
          soloed: false,
          filename: null,
          thumbnailUrl: null,
          bpm: null,
          bpmConfidence: null,
        },
        {
          slot: 2,
          volume: 0.5,
          pan: 0,
          muted: true,
          soloed: false,
          filename: null,
          thumbnailUrl: null,
          bpm: null,
          bpmConfidence: null,
        },
      ],
    };
    const parsed = parseSnapshot(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.layers).toHaveLength(LAYER_COUNT);
    expect(parsed!.layers[0].volume).toBe(0.7);
    expect(parsed!.layers[2].muted).toBe(true);
  });

  it('snapshot with empty layers array gets LAYER_COUNT defaults', () => {
    const raw = {
      id: 'x',
      name: 'Empty',
      createdAt: '',
      main: {},
      masterVolume: 0.8,
      masterMuted: false,
      layers: [],
    };
    const parsed = parseSnapshot(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.layers).toHaveLength(LAYER_COUNT);
  });

  it('A/B snapshot with custom layer count round-trips', () => {
    // Simulate an A/B snapshot built from a 3-layer session
    const layers: LayerState[] = [
      {
        id: 'layer-0',
        order: 0,
        name: 'a.mp3',
        buffer: null,
        volume: 0.9,
        muted: false,
        loop: true,
        thumbnailUrl: null,
        pan: 0,
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
      {
        id: 'layer-2',
        order: 2,
        name: 'b.mp3',
        buffer: null,
        volume: 0.5,
        muted: true,
        loop: true,
        thumbnailUrl: null,
        pan: 0,
        soloed: false,
        loadingState: 'loaded',
        metadata: null,
      },
    ];
    const snap = buildMixSnapshot(main, transport, layers, 'A');
    expect(snap.layers).toHaveLength(3);

    const reparsed = parseSnapshot(snap);
    expect(reparsed).not.toBeNull();
    expect(reparsed!.layers).toHaveLength(3);
    expect(reparsed!.layers[0].filename).toBe('a.mp3');
    expect(reparsed!.layers[2].muted).toBe(true);
  });
});

// ── assignDropFiles — overflowFiles ──────────────────────────────────────────

describe('assignDropFiles — overflowFiles', () => {
  function makeLayer(
    order: number,
    loadingState: LayerState['loadingState'] = 'empty',
  ): LayerState {
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
      loadingState,
      metadata: null,
    };
  }

  function makeFile(name: string, type = 'audio/mpeg'): File {
    return new File([''], name, { type });
  }

  it('overflow audio files appear in overflowFiles, not skipped', () => {
    const layers = [makeLayer(0)]; // only 1 empty slot
    const files = [makeFile('a.mp3'), makeFile('b.mp3'), makeFile('c.mp3')];
    const { assignments, overflowFiles, skipped } = assignDropFiles(files, layers);
    expect(assignments).toHaveLength(1);
    expect(overflowFiles).toHaveLength(2);
    expect(overflowFiles[0].name).toBe('b.mp3');
    expect(overflowFiles[1].name).toBe('c.mp3');
    expect(skipped).toBe(0);
  });

  it('non-audio files count as skipped; audio overflow goes to overflowFiles', () => {
    const layers: LayerState[] = []; // no empty slots
    const files = [makeFile('a.mp3'), new File([''], 'photo.jpg', { type: 'image/jpeg' })];
    const { assignments, overflowFiles, skipped } = assignDropFiles(files, layers);
    expect(assignments).toHaveLength(0);
    expect(overflowFiles).toHaveLength(1);
    expect(overflowFiles[0].name).toBe('a.mp3');
    expect(skipped).toBe(1); // photo.jpg
  });

  it('no overflow when all files fit in empty slots', () => {
    const layers = [makeLayer(0), makeLayer(1), makeLayer(2)];
    const files = [makeFile('a.mp3'), makeFile('b.mp3')];
    const { assignments, overflowFiles, skipped } = assignDropFiles(files, layers);
    expect(assignments).toHaveLength(2);
    expect(overflowFiles).toHaveLength(0);
    expect(skipped).toBe(0);
  });

  it('all files overflow when no empty slots exist', () => {
    const layers = [makeLayer(0, 'loaded'), makeLayer(1, 'loaded')];
    const files = [makeFile('a.mp3'), makeFile('b.mp3'), makeFile('c.mp3')];
    const { assignments, overflowFiles, skipped } = assignDropFiles(files, layers);
    expect(assignments).toHaveLength(0);
    expect(overflowFiles).toHaveLength(3);
    expect(skipped).toBe(0);
  });
});
