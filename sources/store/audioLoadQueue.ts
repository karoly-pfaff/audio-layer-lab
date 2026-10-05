const DEFAULT_CONCURRENCY = 2;
const DEFAULT_CAPACITY = 13;

interface QueueEntry {
  run: () => void;
  reject: (reason: Error) => void;
  signal?: AbortSignal;
  abort: () => void;
}

function abortedError(): DOMException {
  return new DOMException('Audio load cancelled', 'AbortError');
}

export class AudioLoadQueue {
  private active = 0;
  private readonly pending: QueueEntry[] = [];

  constructor(
    private readonly concurrency = DEFAULT_CONCURRENCY,
    private readonly capacity = DEFAULT_CAPACITY,
  ) {}

  schedule<T>(
    operation: () => Promise<T>,
    signal?: AbortSignal,
    discard?: (value: T) => void | Promise<void>,
  ): Promise<T> {
    if (signal?.aborted) {
      return Promise.reject(abortedError());
    }
    if (this.active + this.pending.length >= this.capacity) {
      return Promise.reject(new Error('Too many audio files are being processed at once'));
    }
    return new Promise<T>((resolve, reject) => {
      const entry: QueueEntry = {
        signal,
        reject,
        abort: () => {
          const index = this.pending.indexOf(entry);
          if (index >= 0) {
            this.pending.splice(index, 1);
            reject(abortedError());
          }
        },
        run: () => {
          signal?.removeEventListener('abort', entry.abort);
          this.active += 1;
          void operation()
            .then(async (value) => {
              if (signal?.aborted) {
                try {
                  await discard?.(value);
                } finally {
                  reject(abortedError());
                }
              } else {
                resolve(value);
              }
            })
            .catch(reject)
            .finally(() => {
              this.active -= 1;
              this.runNext();
            });
        },
      };
      signal?.addEventListener('abort', entry.abort, { once: true });
      this.pending.push(entry);
      this.runNext();
    });
  }

  private runNext(): void {
    while (this.active < this.concurrency) {
      const next = this.pending.shift();
      if (!next) {
        return;
      }
      next.run();
    }
  }
}

export const audioLoadQueue = new AudioLoadQueue();
