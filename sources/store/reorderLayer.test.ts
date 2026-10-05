import { describe, it, expect } from 'vitest';
import { applyReorder, dropInsertionOrder } from '../utils/layerOrder';
import { defaultSession, parseSessionBody } from './persistence';
import { buildMixSnapshot, parseSnapshot } from './snapshots';
import { assignDropFiles } from '../utils/dropAssignment';
import type { LayerState, MainTrackState, TransportState } from '../audio/types';

// ── applyReorder — pure reorder logic ─────────────────────────────────────────

describe('applyReorder — pure reorder logic', () => {
  type Stub = { id: string; order: number; name: string; buffer: null };

  function make(id: string, order: number): Stub {
    return { id, order, name: 'test', buffer: null };
  }

  it('moves a layer from the start to the end', () => {
    const layers = [make('a', 0), make('b', 1), make('c', 2)];
    const result = applyReorder(layers, 'a', 2);
    expect(result.map((l) => l.id)).toEqual(['b', 'c', 'a']);
    expect(result.map((l) => l.order)).toEqual([0, 1, 2]);
  });

  it('moves a layer from the end to the start', () => {
    const layers = [make('a', 0), make('b', 1), make('c', 2)];
    const result = applyReorder(layers, 'c', 0);
    expect(result.map((l) => l.id)).toEqual(['c', 'a', 'b']);
    expect(result.map((l) => l.order)).toEqual([0, 1, 2]);
  });

  it('moves a layer from position 1 to position 3', () => {
    const layers = [make('a', 0), make('b', 1), make('c', 2), make('d', 3)];
    const result = applyReorder(layers, 'b', 3);
    expect(result.map((l) => l.id)).toEqual(['a', 'c', 'd', 'b']);
    expect(result.map((l) => l.order)).toEqual([0, 1, 2, 3]);
  });

  it('ids are stable after reorder — all original ids present', () => {
    const layers = [make('layer-x', 0), make('layer-y', 1), make('layer-z', 2)];
    const result = applyReorder(layers, 'layer-x', 1);
    const ids = result.map((l) => l.id);
    expect(ids).toContain('layer-x');
    expect(ids).toContain('layer-y');
    expect(ids).toContain('layer-z');
  });

  it('moved layer gets the target order value', () => {
    const layers = [make('layer-x', 0), make('layer-y', 1), make('layer-z', 2)];
    const result = applyReorder(layers, 'layer-x', 1);
    expect(result.find((l) => l.id === 'layer-x')!.order).toBe(1);
  });

  it('orders are always compact 0..N-1 after reorder', () => {
    const layers = [make('a', 0), make('b', 1), make('c', 2), make('d', 3)];
    const result = applyReorder(layers, 'b', 3);
    expect(result.map((l) => l.order)).toEqual([0, 1, 2, 3]);
  });

  it('clamps targetOrder below 0 to position 0', () => {
    const layers = [make('a', 0), make('b', 1), make('c', 2)];
    const result = applyReorder(layers, 'c', -5);
    expect(result[0].id).toBe('c');
    expect(result[0].order).toBe(0);
  });

  it('clamps targetOrder beyond length-1 to the last position', () => {
    const layers = [make('a', 0), make('b', 1), make('c', 2)];
    const result = applyReorder(layers, 'a', 99);
    expect(result[result.length - 1].id).toBe('a');
    expect(result[result.length - 1].order).toBe(2);
  });

  it('returns the original array reference when layerId is not found', () => {
    const layers = [make('a', 0), make('b', 1)];
    const result = applyReorder(layers, 'unknown', 0);
    expect(result).toBe(layers);
  });

  it('does not mutate the original array', () => {
    const layers = [make('a', 0), make('b', 1), make('c', 2)];
    const original = layers.map((l) => ({ ...l }));
    applyReorder(layers, 'a', 2);
    layers.forEach((l, i) => {
      expect(l.id).toBe(original[i].id);
      expect(l.order).toBe(original[i].order);
    });
  });

  it('preserves non-order fields (name, buffer) after reorder', () => {
    const layers = [make('x', 0), make('y', 1)];
    const result = applyReorder(layers, 'x', 1);
    const moved = result.find((l) => l.id === 'x')!;
    expect(moved.name).toBe('test');
    expect(moved.buffer).toBeNull();
  });

  it('no-op move (same order) returns compacted array', () => {
    const layers = [make('a', 0), make('b', 1), make('c', 2)];
    const result = applyReorder(layers, 'b', 1);
    expect(result.map((l) => l.id)).toEqual(['a', 'b', 'c']);
    expect(result.map((l) => l.order)).toEqual([0, 1, 2]);
  });
});

describe('dropInsertionOrder', () => {
  it('corrects downward insertion boundaries after removing the source', () => {
    expect(dropInsertionOrder(0, 2, true)).toBe(1);
    expect(dropInsertionOrder(0, 2, false)).toBe(2);
  });

  it('preserves upward insertion boundaries', () => {
    expect(dropInsertionOrder(3, 1, true)).toBe(1);
    expect(dropInsertionOrder(3, 1, false)).toBe(2);
  });
});

// ── persistence round-trip after reorder ──────────────────────────────────────

describe('applyReorder — persistence round-trip', () => {
  it('serialized and re-parsed session preserves reordered layer order', () => {
    const session = defaultSession();
    // Move layer-0 to position 2
    session.layers = applyReorder(session.layers, 'layer-0', 2);

    const serialized = JSON.parse(JSON.stringify(session)) as Record<string, unknown>;
    const parsed = parseSessionBody(serialized);

    expect(parsed.layers).toHaveLength(5);
    expect(parsed.layers[0].id).toBe('layer-1');
    expect(parsed.layers[1].id).toBe('layer-2');
    expect(parsed.layers[2].id).toBe('layer-0');
    expect(parsed.layers[3].id).toBe('layer-3');
    expect(parsed.layers[4].id).toBe('layer-4');
  });

  it('orders are compact 0..N-1 after round-trip', () => {
    const session = defaultSession();
    session.layers = applyReorder(session.layers, 'layer-4', 0);
    const serialized = JSON.parse(JSON.stringify(session)) as Record<string, unknown>;
    const parsed = parseSessionBody(serialized);
    parsed.layers.forEach((l, i) => {
      expect(l.order).toBe(i);
    });
  });
});

// ── snapshot captures reordered order ────────────────────────────────────────

describe('applyReorder — snapshot captures reordered order', () => {
  const main: Pick<
    MainTrackState,
    'volume' | 'pan' | 'loop' | 'name' | 'thumbnailUrl' | 'bpm' | 'bpmConfidence'
  > = {
    volume: 1,
    pan: 0,
    loop: false,
    name: '',
    thumbnailUrl: null,
    bpm: null,
    bpmConfidence: null,
  };
  const transport: Pick<TransportState, 'masterVolume' | 'masterMuted'> = {
    masterVolume: 1,
    masterMuted: false,
  };

  it('buildMixSnapshot serializes the reordered layer order', () => {
    // layer-1 first, layer-0 second (after reorder)
    const layers: LayerState[] = [
      {
        id: 'layer-1',
        order: 0,
        name: 'b.mp3',
        buffer: null,
        volume: 1,
        muted: false,
        loop: true,
        thumbnailUrl: null,
        pan: 0,
        soloed: false,
        loadingState: 'loaded',
        metadata: null,
      },
      {
        id: 'layer-0',
        order: 1,
        name: 'a.mp3',
        buffer: null,
        volume: 1,
        muted: false,
        loop: true,
        thumbnailUrl: null,
        pan: 0,
        soloed: false,
        loadingState: 'loaded',
        metadata: null,
      },
      {
        id: 'layer-2',
        order: 2,
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
    const snap = buildMixSnapshot(main, transport, layers, 'Reordered');
    expect(snap.layers[0].id).toBe('layer-1');
    expect(snap.layers[0].order).toBe(0);
    expect(snap.layers[1].id).toBe('layer-0');
    expect(snap.layers[1].order).toBe(1);
  });

  it('snapshot round-trips the reordered layer positions', () => {
    const layers: LayerState[] = [
      {
        id: 'layer-2',
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
      {
        id: 'layer-0',
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
        id: 'layer-1',
        order: 2,
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
    const snap = buildMixSnapshot(main, transport, layers, 'Test');
    const parsed = parseSnapshot(snap);
    expect(parsed).not.toBeNull();
    expect(parsed!.layers[0].id).toBe('layer-2');
    expect(parsed!.layers[1].id).toBe('layer-0');
    expect(parsed!.layers[2].id).toBe('layer-1');
    parsed!.layers.forEach((sl, i) => {
      expect(sl.order).toBe(i);
    });
  });

  it('A/B snapshot captures reordered order', () => {
    // Simulate A/B capture after reordering: layer-4 moved to first
    const layers: LayerState[] = [
      {
        id: 'layer-4',
        order: 0,
        name: 'kick.wav',
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
        id: 'layer-0',
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
        id: 'layer-1',
        order: 2,
        name: 'bass.mp3',
        buffer: null,
        volume: 0.8,
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
    const parsed = parseSnapshot(snap);
    expect(parsed).not.toBeNull();
    expect(parsed!.layers[0].id).toBe('layer-4');
    expect(parsed!.layers[0].filename).toBe('kick.wav');
    expect(parsed!.layers[2].muted).toBe(true);
  });
});

// ── drop assignment fills by order after reorder ─────────────────────────────

describe('assignDropFiles — fills by order after reorder', () => {
  it('assigns to the lowest-order empty layer even when array is out of insertion order', () => {
    // After reorder: layer-2 is at order 0, layer-0 is at order 1 (loaded), layer-1 at order 2
    const layers: LayerState[] = [
      {
        id: 'layer-2',
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
      {
        id: 'layer-0',
        order: 1,
        name: 'loaded.mp3',
        buffer: null,
        volume: 1,
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
        order: 2,
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
    const files = [new File([''], 'new.mp3', { type: 'audio/mpeg' })];
    const { assignments } = assignDropFiles(files, layers);
    // layer-2 has order 0 and is empty — should be first assignment
    expect(assignments[0].layerId).toBe('layer-2');
  });

  it('assigns to both empty layers in order after reorder', () => {
    const layers: LayerState[] = [
      {
        id: 'layer-3',
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
    const files = [
      new File([''], 'a.mp3', { type: 'audio/mpeg' }),
      new File([''], 'b.mp3', { type: 'audio/mpeg' }),
    ];
    const { assignments } = assignDropFiles(files, layers);
    expect(assignments[0].layerId).toBe('layer-3'); // order 0 first
    expect(assignments[1].layerId).toBe('layer-1'); // order 1 second
  });
});
