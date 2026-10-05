import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('session ownership', () => {
  it('allows one writer, blocks a second module instance, and supports takeover', async () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'tab-a') });
    const first = await import('./sessionOwnership');
    expect(first.ensureSessionOwnership()).toBe(true);
    expect(first.ensureSessionOwnership()).toBe(true);
    expect(first.ownsSession()).toBe(true);
    const firstFence = first.sessionOwnershipFence();
    expect(firstFence).toEqual(expect.any(String));

    vi.resetModules();
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'tab-b') });
    const second = await import('./sessionOwnership');
    expect(second.ensureSessionOwnership()).toBe(false);
    expect(second.sessionOwnershipSnapshot()).toBe('blocked');
    expect(second.currentSessionOwnershipFence()).toBeNull();

    second.takeOverSession();
    expect(second.ownsSession()).toBe(true);
    expect(first.ownsSession()).toBe(false);
    expect(first.isSessionOwnershipFenceCurrent(firstFence!)).toBe(false);
    expect(second.sessionOwnershipFence()).not.toBe(firstFence);
    first.releaseSessionOwnership();
    expect(second.ownsSession()).toBe(true);

    second.releaseSessionOwnership();
    expect(first.ensureSessionOwnership()).toBe(false);
    expect(localStorage.getItem('audio-layer-lab-session-owner')).toBeNull();
    first.takeOverSession();
    expect(first.sessionOwnershipFence()).not.toBe(firstFence);
  });

  it('allows non-destructive in-memory use but disables cleanup when storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError');
    });
    const ownership = await import('./sessionOwnership');

    expect(ownership.ensureSessionOwnership()).toBe(true);
    expect(ownership.ownsSession()).toBe(false);
    expect(ownership.sessionOwnershipSnapshot()).toBe('unavailable');
    expect(ownership.currentSessionOwnershipFence()).toBeNull();
  });

  it('replaces malformed or expired leases', async () => {
    localStorage.setItem('audio-layer-lab-session-owner', '{malformed');
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'replacement-tab') });
    const ownership = await import('./sessionOwnership');
    expect(ownership.ensureSessionOwnership()).toBe(true);

    ownership.releaseSessionOwnership();
    localStorage.setItem(
      'audio-layer-lab-session-owner',
      JSON.stringify({ id: 'expired-tab', expiresAt: Date.now() - 1 }),
    );
    expect(ownership.ensureSessionOwnership()).toBe(false);
    ownership.takeOverSession();
    expect(ownership.ownsSession()).toBe(true);
  });

  it('reports unavailable when a lease cannot be written', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError');
    });
    const ownership = await import('./sessionOwnership');
    expect(ownership.ensureSessionOwnership()).toBe(true);
    expect(ownership.sessionOwnershipSnapshot()).toBe('unavailable');
  });

  it('uses a local fallback id when random UUID support is missing', async () => {
    vi.stubGlobal('crypto', {});
    const ownership = await import('./sessionOwnership');
    expect(ownership.ensureSessionOwnership()).toBe(true);
    expect(ownership.ownsSession()).toBe(true);
  });

  it('does not claim ownership when another writer wins the confirmation race', async () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'racing-tab') });
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      originalSetItem.call(this, key, value);
      if (key === 'audio-layer-lab-session-owner') {
        originalSetItem.call(
          this,
          key,
          JSON.stringify({ id: 'winning-tab', expiresAt: Date.now() + 60_000 }),
        );
      }
    });
    const ownership = await import('./sessionOwnership');

    expect(ownership.ensureSessionOwnership()).toBe(false);
    expect(ownership.sessionOwnershipSnapshot()).toBe('blocked');
  });

  it('reacts to another tab taking ownership through the storage event', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'hook-tab') });
    const ownership = await import('./sessionOwnership');
    const { result, unmount } = renderHook(() => ownership.useSessionOwnership());
    expect(result.current).toBe('owner');

    localStorage.setItem(
      'audio-layer-lab-session-owner',
      JSON.stringify({ id: 'other-tab', expiresAt: Date.now() + 60_000 }),
    );
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'audio-layer-lab-session-owner' }));
    });
    expect(result.current).toBe('blocked');

    localStorage.removeItem('audio-layer-lab-session-owner');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'audio-layer-lab-session-owner' }));
    });
    expect(result.current).toBe('blocked');

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated-key' }));
    });
    expect(result.current).toBe('blocked');
    unmount();
  });

  it('does not reclaim a lease gap before a delayed takeover event is delivered', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'suspended-tab') });
    const ownership = await import('./sessionOwnership');
    const { result, unmount } = renderHook(() => ownership.useSessionOwnership());
    expect(result.current).toBe('owner');

    const takeover = JSON.stringify({
      id: 'new-owner',
      fence: 'new-owner-fence',
      expiresAt: Date.now() + 60_000,
    });
    localStorage.setItem('audio-layer-lab-session-owner', takeover);
    localStorage.removeItem('audio-layer-lab-session-owner');

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current).toBe('blocked');

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'audio-layer-lab-session-owner',
          newValue: takeover,
        }),
      );
    });

    expect(result.current).toBe('blocked');
    expect(ownership.ensureSessionOwnership()).toBe(false);
    expect(localStorage.getItem('audio-layer-lab-session-owner')).toBeNull();
    unmount();
  });

  it('automatically acquires a lease only for a tab that was initially blocked', async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      'audio-layer-lab-session-owner',
      JSON.stringify({ id: 'initial-owner', expiresAt: Date.now() + 60_000 }),
    );
    const ownership = await import('./sessionOwnership');
    const { result, unmount } = renderHook(() => ownership.useSessionOwnership());
    expect(result.current).toBe('blocked');

    localStorage.removeItem('audio-layer-lab-session-owner');
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(result.current).toBe('owner');
    unmount();
  });

  it('renews an expired lease while monitored and tolerates duplicate subscribers', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'renewing-tab') });
    const ownership = await import('./sessionOwnership');
    const first = renderHook(() => ownership.useSessionOwnership());
    const second = renderHook(() => ownership.useSessionOwnership());
    const epoch = renderHook(() => ownership.useSessionOwnershipEpoch());
    const fence = ownership.sessionOwnershipFence();
    const previousEpoch = epoch.result.current;

    localStorage.setItem(
      'audio-layer-lab-session-owner',
      JSON.stringify({ id: 'renewing-tab', fence, expiresAt: Date.now() - 1 }),
    );
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(first.result.current).toBe('owner');
    expect(second.result.current).toBe('owner');
    expect(epoch.result.current).toBeGreaterThan(previousEpoch);
    expect(JSON.parse(localStorage.getItem('audio-layer-lab-session-owner') ?? '{}')).toMatchObject(
      {
        id: 'renewing-tab',
        fence,
      },
    );
    first.unmount();
    second.unmount();
    epoch.unmount();
  });

  it('publishes storage loss that happens while ownership is monitored', async () => {
    vi.useFakeTimers();
    const ownership = await import('./sessionOwnership');
    const { result, unmount } = renderHook(() => ownership.useSessionOwnership());
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError');
    });

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'audio-layer-lab-session-owner' }));
    });

    expect(result.current).toBe('unavailable');
    unmount();
  });
});
