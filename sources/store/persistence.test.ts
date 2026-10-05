import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadSession,
  saveSession,
  clearSession,
  defaultSession,
  SCHEMA_VERSION,
  LAYER_COUNT,
  MAX_LAYER_COUNT,
  sessionPersistenceHealthy,
  loadDurableSessionForCleanup,
} from './persistence';
import { releaseSessionOwnership, takeOverSession } from './sessionOwnership';

describe('persistence', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    takeOverSession();
    clearSession();
  });

  it('reports storage write failures instead of silently claiming persistence', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });

    expect(saveSession(defaultSession())).toBe(false);
    expect(sessionPersistenceHealthy()).toBe(false);
  });

  it('refuses durable writes and clears while another tab owns the session', () => {
    localStorage.setItem(
      'audio-layer-lab-session-owner',
      JSON.stringify({ id: 'other-tab', fence: 'other-fence', expiresAt: Date.now() + 60_000 }),
    );
    expect(saveSession(defaultSession())).toBe(false);
    expect(clearSession()).toBe(false);
    localStorage.removeItem('audio-layer-lab-session-owner');
  });

  it('never acquires a missing lease as a side effect of saving', () => {
    releaseSessionOwnership();

    expect(saveSession(defaultSession())).toBe(false);
    expect(localStorage.getItem('audio-layer-lab-session-owner')).toBeNull();
  });

  it('fails closed when durable storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(loadSession().main.filename).toBeNull();
    expect(loadDurableSessionForCleanup()).toBeNull();
  });

  it('reports a failed durable clear', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(clearSession()).toBe(false);
  });

  it('returns default session when storage is empty', () => {
    const session = loadSession();
    const def = defaultSession();
    expect(session.version).toBe(def.version);
    expect(session.main.loop).toBe(false);
    expect(session.main.filename).toBeNull();
    expect(session.layers).toHaveLength(5);
  });

  it('defaultSession is schema version 4', () => {
    expect(defaultSession().version).toBe(4);
    expect(SCHEMA_VERSION).toBe(4);
  });

  it('defaultSession layers length matches LAYER_COUNT', () => {
    expect(defaultSession().layers).toHaveLength(LAYER_COUNT);
  });

  it('defaultSession includes empty snapshots and ab', () => {
    const def = defaultSession();
    expect(def.snapshots).toEqual([]);
    expect(def.ab).toEqual({ a: null, b: null });
  });

  it('round-trips a session through save and load', () => {
    const session = defaultSession();
    session.main.filename = 'my-track.mp3';
    session.main.loop = true;
    session.main.volume = 0.6;
    session.layers[0].volume = 0.5;
    session.layers[0].pan = -0.3;
    session.transport.masterMuted = true;
    session.transport.masterVolume = 0.9;

    saveSession(session);
    const loaded = loadSession();

    expect(loaded.main.filename).toBe('my-track.mp3');
    expect(loaded.main.loop).toBe(true);
    expect(loaded.main.volume).toBe(0.6);
    expect(loaded.layers[0].volume).toBe(0.5);
    expect(loaded.layers[0].pan).toBe(-0.3);
    expect(loaded.transport.masterMuted).toBe(true);
    expect(loaded.transport.masterVolume).toBe(0.9);
  });

  it('round-trips valid local media references and rejects unsafe asset ids', () => {
    const session = defaultSession();
    const mainAssetId = `sha256-${'a'.repeat(64)}`;
    const layerAssetId = 'random-12345678-abcd-1234-abcd-123456789abc';
    session.main.assetId = mainAssetId;
    session.main.filename = 'main.wav';
    session.layers[0]!.assetId = layerAssetId;
    saveSession(session);

    expect(loadSession().main.assetId).toBe(mainAssetId);
    expect(loadSession().layers[0]?.assetId).toBe(layerAssetId);

    const unsafe = defaultSession() as unknown as Record<string, unknown>;
    unsafe['main'] = { assetId: '../private-file', filename: 'bad.wav' };
    unsafe['layers'] = [{ id: 'layer-0', assetId: 'not/an/asset' }];
    localStorage.setItem('audio-layer-lab-session', JSON.stringify(unsafe));
    expect(loadSession().main.assetId).toBeNull();
    expect(loadSession().layers[0]?.assetId).toBeNull();
  });

  it('round-trips snapshots through save and load', () => {
    const session = defaultSession();
    session.snapshots = [
      {
        id: 'snap1',
        name: 'My Mix',
        createdAt: '2026-01-01T00:00:00.000Z',
        main: {
          volume: 0.7,
          pan: 0,
          loop: true,
          filename: 'beat.mp3',
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
      },
    ];
    saveSession(session);
    const loaded = loadSession();
    expect(loaded.snapshots).toHaveLength(1);
    expect(loaded.snapshots[0].name).toBe('My Mix');
    expect(loaded.snapshots[0].main.volume).toBe(0.7);
  });

  it('round-trips ab slots through save and load', () => {
    const session = defaultSession();
    session.ab.a = {
      id: 'ab-a',
      name: 'A',
      createdAt: '',
      main: {
        volume: 0.5,
        pan: 0,
        loop: false,
        filename: null,
        thumbnailUrl: null,
        bpm: null,
        bpmConfidence: null,
      },
      masterVolume: 0.8,
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
    };
    saveSession(session);
    const loaded = loadSession();
    expect(loaded.ab.a).not.toBeNull();
    expect(loaded.ab.a!.id).toBe('ab-a');
    expect(loaded.ab.b).toBeNull();
  });

  it('migrates v1 session (adds empty snapshots, ab, and null BPM)', () => {
    const v1 = {
      version: 1,
      savedAt: '2026-01-01T00:00:00.000Z',
      main: { loop: true, volume: 0.6, filename: 'old.mp3', thumbnailUrl: null },
      layers: [
        {
          slot: 0,
          volume: 0.7,
          pan: 0.1,
          muted: true,
          soloed: false,
          filename: 'bass.mp3',
          thumbnailUrl: null,
        },
      ],
      transport: { masterVolume: 0.9, masterMuted: false },
      // no snapshots, no ab, no bpm
    };
    localStorage.setItem('audio-layer-lab-session', JSON.stringify(v1));
    const loaded = loadSession();

    // Existing v1 data preserved
    expect(loaded.main.filename).toBe('old.mp3');
    expect(loaded.main.loop).toBe(true);
    expect(loaded.main.volume).toBe(0.6);
    expect(loaded.layers[0].volume).toBe(0.7);
    expect(loaded.layers[0].muted).toBe(true);

    // New fields default to empty / null
    expect(loaded.snapshots).toEqual([]);
    expect(loaded.ab).toEqual({ a: null, b: null });
    expect(loaded.main.bpm).toBeNull();
    expect(loaded.main.bpmConfidence).toBeNull();
    expect(loaded.layers[0].bpm).toBeNull();
    expect(loaded.version).toBe(4);
  });

  it('migrates v2 session to v3 (bpm fields default to null)', () => {
    const v2 = {
      version: 2,
      savedAt: '2026-01-01T00:00:00.000Z',
      main: { loop: false, volume: 0.8, filename: 'track.mp3', thumbnailUrl: null },
      layers: [
        {
          slot: 0,
          volume: 1,
          pan: 0,
          muted: false,
          soloed: false,
          filename: 'loop.wav',
          thumbnailUrl: null,
        },
      ],
      transport: { masterVolume: 0.8, masterMuted: false },
      snapshots: [],
      ab: { a: null, b: null },
      // no bpm fields
    };
    localStorage.setItem('audio-layer-lab-session', JSON.stringify(v2));
    const loaded = loadSession();

    expect(loaded.main.filename).toBe('track.mp3');
    expect(loaded.main.bpm).toBeNull();
    expect(loaded.main.bpmConfidence).toBeNull();
    expect(loaded.layers[0].bpm).toBeNull();
    expect(loaded.layers[0].bpmConfidence).toBeNull();
    expect(loaded.version).toBe(4);
  });

  it('round-trips bpm and bpmConfidence through save and load', () => {
    const session = defaultSession();
    session.main.bpm = 124;
    session.main.bpmConfidence = 'high';
    session.layers[0].bpm = 62;
    session.layers[0].bpmConfidence = 'medium';
    saveSession(session);
    const loaded = loadSession();
    expect(loaded.main.bpm).toBe(124);
    expect(loaded.main.bpmConfidence).toBe('high');
    expect(loaded.layers[0].bpm).toBe(62);
    expect(loaded.layers[0].bpmConfidence).toBe('medium');
  });

  it('returns defaults for corrupted JSON', () => {
    localStorage.setItem('audio-layer-lab-session', '{{not json}}');
    const session = loadSession();
    const def = defaultSession();
    expect(session.main.filename).toBe(def.main.filename);
    expect(session.main.loop).toBe(def.main.loop);
  });

  it('returns defaults for wrong schema version', () => {
    localStorage.setItem('audio-layer-lab-session', JSON.stringify({ version: 999, main: {} }));
    const session = loadSession();
    expect(session.version).toBe(4);
    expect(session.layers).toHaveLength(5);
  });

  it('returns defaults for non-object stored value', () => {
    localStorage.setItem('audio-layer-lab-session', '"just a string"');
    const session = loadSession();
    expect(session.main.filename).toBeNull();
  });

  it('clears session from storage', () => {
    saveSession(defaultSession());
    clearSession();
    expect(localStorage.getItem('audio-layer-lab-session')).toBeNull();
  });

  it('preserves layer slot order across save and load', () => {
    const session = defaultSession();
    session.layers[2].filename = 'bass-loop.mp3';
    session.layers[2].volume = 0.7;
    session.layers[4].muted = true;
    saveSession(session);

    const loaded = loadSession();
    expect(loaded.layers[2].filename).toBe('bass-loop.mp3');
    expect(loaded.layers[2].volume).toBe(0.7);
    expect(loaded.layers[4].muted).toBe(true);
  });

  it('falls back to layer defaults for missing layer fields', () => {
    const raw = {
      version: 2,
      savedAt: new Date().toISOString(),
      main: { loop: false, volume: 0.8, filename: null, thumbnailUrl: null },
      layers: [{ slot: 0 }], // only slot, missing all other fields
      transport: { masterVolume: 0.8, masterMuted: false },
    };
    localStorage.setItem('audio-layer-lab-session', JSON.stringify(raw));
    const session = loadSession();
    expect(session.layers[0].volume).toBe(1); // default
    expect(session.layers[0].pan).toBe(0); // default
    expect(session.layers[0].muted).toBe(false); // default
  });

  it('falls back for missing layers array', () => {
    const raw = {
      version: 2,
      savedAt: new Date().toISOString(),
      main: { loop: false, volume: 0.8, filename: null, thumbnailUrl: null },
      transport: { masterVolume: 0.8, masterMuted: false },
      // no layers key
    };
    localStorage.setItem('audio-layer-lab-session', JSON.stringify(raw));
    const session = loadSession();
    expect(session.layers).toHaveLength(5);
    expect(session.layers[0].volume).toBe(1);
  });

  it('strips externally hosted thumbnail URLs when loading', () => {
    const session = defaultSession();
    session.main.thumbnailUrl = 'https://example.com/thumb.jpg';
    session.layers[1].thumbnailUrl = 'https://example.com/layer.jpg';
    saveSession(session);

    const loaded = loadSession();
    expect(loaded.main.thumbnailUrl).toBeNull();
    expect(loaded.layers[1].thumbnailUrl).toBeNull();
  });

  it('defaultSession produces 5 layers with correct defaults', () => {
    const def = defaultSession();
    expect(def.layers).toHaveLength(5);
    def.layers.forEach((l, i) => {
      expect(l.id).toBe(`layer-${i}`);
      expect(l.order).toBe(i);
      expect(l.volume).toBe(1);
      expect(l.pan).toBe(0);
      expect(l.muted).toBe(false);
      expect(l.soloed).toBe(false);
      expect(l.filename).toBeNull();
    });
  });

  it('clamps non-finite and out-of-range mixer values from storage', () => {
    const raw = defaultSession() as unknown as Record<string, unknown>;
    raw['main'] = { volume: 7, pan: -4, loop: false };
    raw['transport'] = { masterVolume: -2, masterMuted: false };
    raw['layers'] = [{ id: 'layer', volume: 9, pan: 3 }];
    localStorage.setItem('audio-layer-lab-session', JSON.stringify(raw));
    const loaded = loadSession();
    expect(loaded.main.volume).toBe(1);
    expect(loaded.main.pan).toBe(-1);
    expect(loaded.transport.masterVolume).toBe(0);
    expect(loaded.layers[0].volume).toBe(1);
    expect(loaded.layers[0].pan).toBe(1);
  });

  it('caps dynamic layers and normalizes duplicate identities and orders', () => {
    const raw = defaultSession() as unknown as Record<string, unknown>;
    raw['layers'] = Array.from({ length: MAX_LAYER_COUNT + 4 }, () => ({
      id: 'duplicate',
      order: 999,
      volume: 1,
      pan: 0,
    }));
    localStorage.setItem('audio-layer-lab-session', JSON.stringify(raw));
    const loaded = loadSession();
    expect(loaded.layers).toHaveLength(MAX_LAYER_COUNT);
    expect(new Set(loaded.layers.map((layer) => layer.id)).size).toBe(MAX_LAYER_COUNT);
    expect(loaded.layers.map((layer) => layer.order)).toEqual(
      Array.from({ length: MAX_LAYER_COUNT }, (_, index) => index),
    );
  });

  it('rejects unsafe persisted artwork URLs and invalid BPM values', () => {
    const raw = defaultSession() as unknown as Record<string, unknown>;
    raw['main'] = {
      volume: 0.8,
      pan: 0,
      loop: false,
      thumbnailUrl: 'javascript:alert(1)',
      bpm: 10_000,
    };
    localStorage.setItem('audio-layer-lab-session', JSON.stringify(raw));
    const loaded = loadSession();
    expect(loaded.main.thumbnailUrl).toBeNull();
    expect(loaded.main.bpm).toBeNull();
  });
});
