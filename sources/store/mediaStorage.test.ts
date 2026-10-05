import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredAudio,
  loadAudioFile,
  mediaStorageFailureReason,
  pruneStoredAudio,
  requestPersistentStorage,
  resetMediaStorageForTests,
  storeAudioFile,
  storeAudioFileForSession,
} from './mediaStorage';
import { takeOverSession } from './sessionOwnership';

interface OpfsMock {
  files: Map<string, Blob>;
  storage: StorageManager;
  removeFile: ReturnType<typeof vi.fn>;
  removeDirectory: ReturnType<typeof vi.fn>;
}

function installStorage(storage?: Partial<StorageManager>): void {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: storage,
  });
}

function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function putRawAssetRecord(record: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('audio-layer-lab-media', 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains('assets')) {
        open.result.createObjectStore('assets', { keyPath: 'id' });
      }
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction('assets', 'readwrite');
      transaction.objectStore('assets').put(record);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  });
}

function createOpfsMock(failWrites = false, afterClose?: () => void): OpfsMock {
  const files = new Map<string, Blob>();
  const removeFile = vi.fn(async (name: string) => {
    files.delete(name);
  });
  const directory = {
    getFileHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
      if (!options?.create && !files.has(name)) {
        throw new DOMException('Missing', 'NotFoundError');
      }
      return {
        createWritable: async () => {
          if (failWrites) {
            throw new DOMException('Quota exceeded', 'QuotaExceededError');
          }
          return {
            write: async (value: Blob) => {
              files.set(name, value);
            },
            close: async () => afterClose?.(),
          };
        },
        getFile: async () => new File([files.get(name)!], name, { type: files.get(name)!.type }),
      };
    }),
    removeEntry: removeFile,
  };
  const removeDirectory = vi.fn(async () => files.clear());
  const root = {
    getDirectoryHandle: vi.fn(async (_name: string, options?: { create?: boolean }) => {
      if (!options?.create && files.size === 0) {
        throw new DOMException('Missing', 'NotFoundError');
      }
      return directory;
    }),
    removeEntry: removeDirectory,
  };
  return {
    files,
    removeFile,
    removeDirectory,
    storage: {
      getDirectory: vi.fn(async () => root),
      persist: vi.fn(async () => true),
    } as unknown as StorageManager,
  };
}

beforeEach(() => {
  resetMediaStorageForTests();
  localStorage.clear();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('crypto', {
    subtle: { digest: async () => new Uint8Array(32).buffer },
    randomUUID: () => '12345678-abcd-1234-abcd-123456789abc',
  });
  installStorage();
  takeOverSession();
});

describe('media storage', () => {
  it('stores, deduplicates, reads, keeps, and prunes an IndexedDB fallback Blob', async () => {
    const file = new File(['audio-content'], 'original.wav', {
      type: 'audio/wav',
      lastModified: 123,
    });
    const id = await storeAudioFile(file);
    const duplicateId = await storeAudioFile(file);

    expect(id).toMatch(/^(sha256|random)-/);
    expect(duplicateId).toBe(id);
    const restored = await loadAudioFile(id!, 'display-name.wav');
    expect(restored?.name).toBe('display-name.wav');
    expect(restored?.type).toBe('audio/wav');
    expect(await blobText(restored!)).toBe('audio-content');

    await pruneStoredAudio(new Set([id!]));
    expect(await loadAudioFile(id!)).not.toBeNull();
    await pruneStoredAudio(new Set());
    expect(await loadAudioFile(id!)).toBeNull();
  });

  it('uses OPFS when available and removes its files during reset', async () => {
    const opfs = createOpfsMock();
    installStorage(opfs.storage);
    const id = await storeAudioFile(new File(['opfs-audio'], 'loop.ogg', { type: 'audio/ogg' }));

    expect([...opfs.files.keys()]).toEqual([expect.stringContaining(`${id}--`)]);
    expect(await blobText((await loadAudioFile(id!))!)).toBe('opfs-audio');
    await clearStoredAudio();
    expect(await loadAudioFile(id!)).toBeNull();
    expect(opfs.files.size).toBe(0);
    expect(opfs.removeDirectory).not.toHaveBeenCalled();
  });

  it('falls back to IndexedDB when an OPFS write fails', async () => {
    installStorage(createOpfsMock(true).storage);
    const id = await storeAudioFile(new File(['fallback'], 'fallback.mp3', { type: 'audio/mpeg' }));
    const restored = await loadAudioFile(id!);
    expect(await blobText(restored!)).toBe('fallback');
  });

  it('falls back when OPFS becomes unavailable while cleaning up a failed write', async () => {
    const opfs = createOpfsMock(true);
    const getDirectory = vi
      .fn()
      .mockResolvedValueOnce(await opfs.storage.getDirectory())
      .mockRejectedValueOnce(new DOMException('Transient failure', 'UnknownError'));
    installStorage({ ...opfs.storage, getDirectory } as StorageManager);
    const id = await storeAudioFile(new File(['fallback'], 'transient.wav'));
    expect(id).toMatch(/^sha256-/);
    expect(await loadAudioFile(id!)).not.toBeNull();
    expect(mediaStorageFailureReason()).toBeNull();
  });

  it('reports missing OPFS content and removes unindexed OPFS writes', async () => {
    const opfs = createOpfsMock();
    installStorage(opfs.storage);
    const id = await storeAudioFile(new File(['audio'], 'missing.wav'));
    opfs.files.clear();
    await expect(loadAudioFile(id!)).resolves.toBeNull();

    vi.stubGlobal('indexedDB', undefined);
    resetMediaStorageForTests();
    const orphanId = await storeAudioFile(new File(['orphan'], 'orphan.wav'));
    expect(orphanId).toBeNull();
    expect(opfs.files.size).toBe(0);
  });

  it('repairs an indexed OPFS record when its content has disappeared', async () => {
    const opfs = createOpfsMock();
    installStorage(opfs.storage);
    const file = new File(['recoverable-audio'], 'recover.wav', { type: 'audio/wav' });
    const id = await storeAudioFile(file);
    opfs.files.clear();

    expect(await loadAudioFile(id!)).toBeNull();
    expect(await storeAudioFile(file)).toBe(id);
    expect(await blobText((await loadAudioFile(id!))!)).toBe('recoverable-audio');
  });

  it('migrates a legacy OPFS record to an ownership-fenced immutable filename', async () => {
    const opfs = createOpfsMock();
    installStorage(opfs.storage);
    const file = new File(['legacy-audio'], 'legacy.wav', { type: 'audio/wav', lastModified: 9 });
    const id = `sha256-${'00'.repeat(32)}`;
    opfs.files.set(id, file);
    await putRawAssetRecord({
      id,
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
      backend: 'opfs',
    });

    expect(await blobText((await loadAudioFile(id))!)).toBe('legacy-audio');
    await expect(storeAudioFile(file)).resolves.toBe(id);

    expect(opfs.files.has(id)).toBe(false);
    expect([...opfs.files.keys()]).toEqual([expect.stringContaining(`${id}--`)]);
    expect(await blobText((await loadAudioFile(id))!)).toBe('legacy-audio');
  });

  it('does not prune a concurrently stored asset before its state reference is published', async () => {
    const randomUUID = vi
      .fn()
      .mockReturnValueOnce('11111111-1111-1111-1111-111111111111')
      .mockReturnValueOnce('22222222-2222-2222-2222-222222222222');
    vi.stubGlobal('crypto', { randomUUID });
    const referenced = new Set<string>();
    const firstPromise = storeAudioFileForSession(new File(['first'], 'first.wav'));
    const secondPromise = storeAudioFileForSession(new File(['second'], 'second.wav'));

    const first = await firstPromise;
    expect(first).not.toBeNull();
    referenced.add(first!.id);
    first!.release();
    const pruning = pruneStoredAudio(() => new Set(referenced));

    const second = await secondPromise;
    expect(second).not.toBeNull();
    referenced.add(second!.id);
    second!.release();
    await pruning;
    await pruneStoredAudio(() => new Set(referenced));

    expect(await loadAudioFile(first!.id)).not.toBeNull();
    expect(await loadAudioFile(second!.id)).not.toBeNull();
  });

  it('does not persist a load that is cancelled while its content hash is pending', async () => {
    let finishDigest!: () => void;
    const digestGate = new Promise<void>((resolve) => {
      finishDigest = resolve;
    });
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn(async () => {
          await digestGate;
          return new Uint8Array(32).buffer;
        }),
      },
      randomUUID: () => '12345678-abcd-1234-abcd-123456789abc',
    });
    const controller = new AbortController();
    const storing = storeAudioFileForSession(
      new File(['private-audio-content'], 'cancelled.wav'),
      controller.signal,
    );

    controller.abort();
    finishDigest();

    await expect(storing).resolves.toBeNull();
    await expect(loadAudioFile(`sha256-${'00'.repeat(32)}`)).resolves.toBeNull();
  });

  it('keeps a deduplicated asset protected until every active lease is released', async () => {
    const file = new File(['shared'], 'shared.wav');
    const first = await storeAudioFileForSession(file);
    const second = await storeAudioFileForSession(file);
    expect(first?.id).toBe(second?.id);

    first?.release();
    await pruneStoredAudio(new Set());
    expect(await loadAudioFile(second!.id)).not.toBeNull();

    second?.release();
    await pruneStoredAudio(new Set());
    expect(await loadAudioFile(second!.id)).toBeNull();
  });

  it('preserves leased audio during a storage clear and removes it after release', async () => {
    const stored = await storeAudioFileForSession(new File(['leased'], 'leased.wav'));
    await clearStoredAudio();
    expect(await loadAudioFile(stored!.id)).not.toBeNull();

    stored?.release();
    await clearStoredAudio();
    expect(await loadAudioFile(stored!.id)).toBeNull();
  });

  it('does not run destructive cleanup after another tab takes session ownership', async () => {
    const id = await storeAudioFile(new File(['tab-a'], 'tab-a.wav'));
    expect(id).not.toBeNull();
    localStorage.setItem(
      'audio-layer-lab-session-owner',
      JSON.stringify({ id: 'other-tab', expiresAt: Date.now() + 60_000 }),
    );

    await pruneStoredAudio(new Set());

    expect(await loadAudioFile(id!)).not.toBeNull();
  });

  it('stops queued cleanup if ownership or the durable keep-set disappears', async () => {
    const id = await storeAudioFile(new File(['guarded'], 'guarded.wav'));
    await pruneStoredAudio(() => null);
    expect(await loadAudioFile(id!)).not.toBeNull();

    await pruneStoredAudio(() => {
      localStorage.setItem(
        'audio-layer-lab-session-owner',
        JSON.stringify({ id: 'new-owner', fence: 'new-fence', expiresAt: Date.now() + 60_000 }),
      );
      return new Set();
    });
    expect(await loadAudioFile(id!)).not.toBeNull();
  });

  it('discards an OPFS write if ownership changes before its record is committed', async () => {
    const opfs = createOpfsMock(false, () => {
      localStorage.setItem(
        'audio-layer-lab-session-owner',
        JSON.stringify({ id: 'new-owner', fence: 'new-fence', expiresAt: Date.now() + 60_000 }),
      );
    });
    installStorage(opfs.storage);

    await expect(storeAudioFile(new File(['late-write'], 'late.wav'))).resolves.toBeNull();
    expect(opfs.files.size).toBe(0);
    expect(mediaStorageFailureReason()).toBe('StorageUnavailable');
  });

  it('cannot delete a replacement written after takeover while an old OPFS cleanup is pending', async () => {
    const opfs = createOpfsMock();
    installStorage(opfs.storage);
    const file = new File(['same-content'], 'shared.wav', { type: 'audio/wav' });
    const id = await storeAudioFile(file);
    const oldOpfsName = [...opfs.files.keys()][0]!;
    let continueRemoval!: () => void;
    let markRemovalStarted!: () => void;
    const removalStarted = new Promise<void>((resolve) => {
      markRemovalStarted = resolve;
    });
    const removalGate = new Promise<void>((resolve) => {
      continueRemoval = resolve;
    });
    opfs.removeFile.mockImplementationOnce(async (name: string) => {
      expect(name).toBe(oldOpfsName);
      markRemovalStarted();
      await removalGate;
      opfs.files.delete(name);
    });

    const oldCleanup = pruneStoredAudio(new Set());
    await removalStarted;

    vi.resetModules();
    const nextOwnership = await import('./sessionOwnership');
    const nextStorage = await import('./mediaStorage');
    nextOwnership.takeOverSession();
    const replacementId = await nextStorage.storeAudioFile(file);
    expect(replacementId).toBe(id);
    const replacementOpfsName = [...opfs.files.keys()].find((name) => name !== oldOpfsName);
    expect(replacementOpfsName).toEqual(expect.stringContaining(`${id}--`));

    continueRemoval();
    await oldCleanup;

    expect(opfs.files.has(replacementOpfsName!)).toBe(true);
    await expect(nextStorage.loadAudioFile(id!)).resolves.not.toBeNull();
  });

  it('requests persistent storage at most once and tolerates unavailable or rejected APIs', async () => {
    const persist = vi.fn(async () => true);
    installStorage({ persist } as unknown as StorageManager);
    await expect(requestPersistentStorage()).resolves.toBe(true);
    await expect(requestPersistentStorage()).resolves.toBe(false);
    expect(persist).toHaveBeenCalledTimes(1);

    resetMediaStorageForTests();
    installStorage({
      persist: vi.fn(async () => Promise.reject(new Error('denied'))),
    } as unknown as StorageManager);
    await expect(requestPersistentStorage()).resolves.toBe(false);

    resetMediaStorageForTests();
    installStorage();
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });

  it('degrades safely when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    resetMediaStorageForTests();
    const file = new File(['audio'], 'offline.wav', { type: 'audio/wav' });
    await expect(storeAudioFile(file)).resolves.toBeNull();
    expect(mediaStorageFailureReason()).toBe('StorageUnavailable');
    await expect(loadAudioFile('sha256-' + 'a'.repeat(64))).resolves.toBeNull();
    await expect(pruneStoredAudio(new Set())).resolves.toBeUndefined();
    await expect(clearStoredAudio()).resolves.toBeUndefined();
  });

  it('uses a random content id when SubtleCrypto is unavailable', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => '12345678-abcd-1234-abcd-123456789abc' });
    const id = await storeAudioFile(new File(['audio'], 'random.wav'));
    expect(id).toBe('random-12345678-abcd-1234-abcd-123456789abc');
  });

  it('uses a timestamp fallback without Web Crypto and records useful failure labels', async () => {
    vi.stubGlobal('crypto', undefined);
    const id = await storeAudioFile(new File(['audio'], 'fallback-id.wav'));
    expect(id).toMatch(/^random-[a-z0-9]+-[a-z0-9]+$/);

    resetMediaStorageForTests();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('crypto', { subtle: { digest: async () => Promise.reject('digest-failed') } });
    await expect(storeAudioFile(new File(['audio'], 'failure.wav'))).resolves.toBeNull();
    expect(mediaStorageFailureReason()).toBe('digest-failed');

    resetMediaStorageForTests();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('crypto', {
      subtle: { digest: async () => Promise.reject({ name: 'DataError' }) },
    });
    await storeAudioFile(new File(['audio'], 'named-failure.wav'));
    expect(mediaStorageFailureReason()).toBe('DataError');

    resetMediaStorageForTests();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('crypto', {
      subtle: { digest: async () => Promise.reject({ name: '' }) },
    });
    await storeAudioFile(new File(['audio'], 'unnamed-failure.wav'));
    expect(mediaStorageFailureReason()).toBe('UnknownError');
  });
});
