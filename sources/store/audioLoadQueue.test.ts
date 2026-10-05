import { describe, expect, it, vi } from 'vitest';
import { AudioLoadQueue } from './audioLoadQueue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe('AudioLoadQueue', () => {
  it('bounds concurrent work and starts queued work in order', async () => {
    const queue = new AudioLoadQueue(1, 3);
    const first = deferred<string>();
    const second = vi.fn(async () => 'second');
    const firstResult = queue.schedule(() => first.promise);
    const secondResult = queue.schedule(second);

    expect(second).not.toHaveBeenCalled();
    first.resolve('first');
    await expect(firstResult).resolves.toBe('first');
    await expect(secondResult).resolves.toBe('second');
  });

  it('rejects excess work and removes an aborted queued task', async () => {
    const queue = new AudioLoadQueue(1, 2);
    const active = deferred<void>();
    const controller = new AbortController();
    const first = queue.schedule(() => active.promise);
    const cancelled = queue.schedule(async () => undefined, controller.signal);

    await expect(queue.schedule(async () => undefined)).rejects.toThrow('Too many audio files');
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    active.resolve();
    await first;
  });

  it('rejects pre-cancelled, cancelled-active, and failed operations', async () => {
    const queue = new AudioLoadQueue(1, 3);
    const alreadyCancelled = new AbortController();
    alreadyCancelled.abort();
    await expect(
      queue.schedule(async () => undefined, alreadyCancelled.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });

    const activeController = new AbortController();
    const work = deferred<string>();
    const cancelledActive = queue.schedule(() => work.promise, activeController.signal);
    activeController.abort();
    work.resolve('too late');
    await expect(cancelledActive).rejects.toMatchObject({ name: 'AbortError' });

    await expect(queue.schedule(async () => Promise.reject(new Error('decode')))).rejects.toThrow(
      'decode',
    );
  });

  it('disposes a completed value when active work is cancelled before delivery', async () => {
    const queue = new AudioLoadQueue(1, 1);
    const controller = new AbortController();
    const work = deferred<{ lease: string }>();
    const discard = vi.fn();
    const result = queue.schedule(() => work.promise, controller.signal, discard);

    controller.abort();
    work.resolve({ lease: 'asset-a' });

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(discard).toHaveBeenCalledWith({ lease: 'asset-a' });
  });
});
