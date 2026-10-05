import { beforeEach, describe, expect, it, vi } from 'vitest';

const engine = vi.hoisted(() => {
  let ended: (() => void) | null = null;
  return {
    get ended() {
      return ended;
    },
    playing: false,
    setMainEndedHandler: vi.fn((callback: () => void) => {
      ended = callback;
    }),
    setMainVolume: vi.fn(),
    setMainPan: vi.fn(),
    setMainLoop: vi.fn(),
    setMasterVolume: vi.fn(),
    setMasterMute: vi.fn(),
    setLayerVolume: vi.fn(),
    setLayerPan: vi.fn(),
    setLayerMute: vi.fn(),
    setLayerSolo: vi.fn(),
    stop: vi.fn(),
    clearMainBuffer: vi.fn(),
    removeLayerBuffer: vi.fn(),
  };
});

vi.mock('../audio/AudioEngine', () => ({ audioEngine: engine }));
vi.mock('./mediaRestoration', () => ({ restoreStoredAudio: vi.fn(async () => undefined) }));

describe('useAudioLabStore persistence lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('rehydrates the latest durable session before a newly acquired owner can save', async () => {
    const { useAudioLabStore, restoreOwnedSessionAudio } = await import('./useAudioLabStore');
    const { defaultSession } = await import('./persistence');
    const { takeOverSession } = await import('./sessionOwnership');
    const durable = defaultSession();
    durable.main.filename = 'newer-from-other-tab.wav';
    durable.main.volume = 0.37;
    localStorage.setItem('audio-layer-lab-session', JSON.stringify(durable));
    takeOverSession();

    expect(useAudioLabStore.getState().mainTrack.name).toBe('');
    await expect(restoreOwnedSessionAudio()).resolves.toBe(true);

    expect(useAudioLabStore.getState().mainTrack).toMatchObject({
      name: 'newer-from-other-tab.wav',
      volume: 0.37,
    });
    const saved = JSON.parse(localStorage.getItem('audio-layer-lab-session') ?? '{}') as {
      main?: { filename?: string };
    };
    expect(saved.main?.filename).toBe('newer-from-other-tab.wav');
  });

  it('stops and clears local audio immediately when ownership is lost', async () => {
    const { suspendOwnedSessionAudio } = await import('./useAudioLabStore');
    suspendOwnedSessionAudio();
    expect(engine.stop).toHaveBeenCalled();
    expect(engine.clearMainBuffer).toHaveBeenCalled();
    expect(engine.removeLayerBuffer).toHaveBeenCalled();
  });

  it('refuses restoration without ownership and shares one restoration per ownership fence', async () => {
    const { useAudioLabStore, restoreOwnedSessionAudio } = await import('./useAudioLabStore');
    localStorage.setItem(
      'audio-layer-lab-session-owner',
      JSON.stringify({ id: 'another-tab', fence: 'foreign-fence', expiresAt: Date.now() + 60_000 }),
    );
    await expect(restoreOwnedSessionAudio()).resolves.toBe(false);

    localStorage.removeItem('audio-layer-lab-session-owner');
    const { takeOverSession } = await import('./sessionOwnership');
    takeOverSession();
    let finishRestore!: () => void;
    const restoreGate = new Promise<void>((resolve) => {
      finishRestore = resolve;
    });
    const restorationModule = await import('./mediaRestoration');
    vi.mocked(restorationModule.restoreStoredAudio).mockReturnValueOnce(restoreGate);
    const first = restoreOwnedSessionAudio();
    const second = restoreOwnedSessionAudio();
    expect(second).toBe(first);

    localStorage.setItem(
      'audio-layer-lab-session-owner',
      JSON.stringify({
        id: 'another-tab',
        fence: 'new-foreign-fence',
        expiresAt: Date.now() + 60_000,
      }),
    );
    finishRestore();
    await expect(first).resolves.toBe(false);
    expect(useAudioLabStore.getState().transport.playing).toBe(false);
  });

  it('keeps a visible warning while saving fails and reports recovery', async () => {
    const { useAudioLabStore } = await import('./useAudioLabStore');
    const { takeOverSession } = await import('./sessionOwnership');
    takeOverSession();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });

    useAudioLabStore.setState((state) => ({
      transport: { ...state.transport, masterVolume: 0.4 },
    }));
    expect(useAudioLabStore.getState().statusMessage).toContain('not being saved');

    useAudioLabStore.getState().dismissStatus();
    expect(useAudioLabStore.getState().statusMessage).toContain('not being saved');

    setItem.mockRestore();
    useAudioLabStore.setState((state) => ({
      transport: { ...state.transport, masterVolume: 0.5 },
    }));
    expect(useAudioLabStore.getState().statusMessage).toBe('Session saving restored');
  });

  it('publishes natural playback completion and its position change', async () => {
    const { useAudioLabStore } = await import('./useAudioLabStore');
    const { takeOverSession } = await import('./sessionOwnership');
    takeOverSession();
    useAudioLabStore.setState((state) => ({
      transport: { ...state.transport, playing: true },
    }));
    const revision = useAudioLabStore.getState().transport.positionRevision;

    engine.ended?.();

    expect(useAudioLabStore.getState().transport).toMatchObject({
      playing: false,
      positionRevision: revision + 1,
    });
  });

  it('invalidates a pending preset import when ownership is suspended', async () => {
    const { suspendOwnedSessionAudio, useAudioLabStore } = await import('./useAudioLabStore');
    const { defaultSession } = await import('./persistence');
    const { takeOverSession } = await import('./sessionOwnership');
    takeOverSession();
    let finishRead!: (value: string) => void;
    const text = new Promise<string>((resolve) => {
      finishRead = resolve;
    });
    const stale = defaultSession();
    stale.main.filename = 'old-pending-preset.wav';
    const file = {
      size: 128,
      text: () => text,
    } as File;

    const importing = useAudioLabStore.getState().importPreset(file);
    suspendOwnedSessionAudio();
    finishRead(JSON.stringify(stale));
    await importing;

    expect(useAudioLabStore.getState().mainTrack.name).not.toBe('old-pending-preset.wav');
  });
});
