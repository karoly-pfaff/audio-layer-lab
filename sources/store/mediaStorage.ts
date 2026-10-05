import { isSessionOwnershipFenceCurrent, sessionOwnershipFence } from './sessionOwnership';
import { readOpfsFile, removeOpfsFile, storageManager, writeOpfsFile } from './opfsStorage';
import { audioContentId, blobArrayBuffer } from './mediaStorageHash';

const DATABASE_NAME = 'audio-layer-lab-media';
const DATABASE_VERSION = 1;
const ASSET_STORE = 'assets';

type StorageBackend = 'opfs' | 'indexeddb';

interface AudioAssetRecord {
  id: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  backend: StorageBackend;
  bytes?: ArrayBuffer;
  revision?: string;
  opfsName?: string;
  ownerFence?: string | null;
}

export interface StoredAudioLease {
  id: string;
  release: () => void;
}

let databasePromise: Promise<IDBDatabase | null> | null = null;
let persistenceRequested = false;
let lastStorageFailure: string | null = null;
let mutationQueue: Promise<void> = Promise.resolve();
const protectedAssetCounts = new Map<string, number>();
let revisionSequence = 0;

function createStorageRevision(): string {
  revisionSequence += 1;
  return `${Date.now().toString(36)}-${revisionSequence.toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function recordRevision(record: AudioAssetRecord): string {
  return (
    record.revision ??
    `legacy:${record.backend}:${record.opfsName ?? record.id}:${record.size}:${record.lastModified}`
  );
}

function fenceAllowsMutation(fence: string | null): boolean {
  return fence !== null && isSessionOwnershipFenceCurrent(fence);
}

function writeStillAllowed(fence: string, signal?: AbortSignal): boolean {
  return !signal?.aborted && fenceAllowsMutation(fence);
}

function serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function protectAsset(id: string): () => void {
  protectedAssetCounts.set(id, (protectedAssetCounts.get(id) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    const remaining = (protectedAssetCounts.get(id) ?? 1) - 1;
    if (remaining > 0) {
      protectedAssetCounts.set(id, remaining);
    } else {
      protectedAssetCounts.delete(id);
    }
  };
}

function isAssetProtected(id: string): boolean {
  return (protectedAssetCounts.get(id) ?? 0) > 0;
}

function errorLabel(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const name = (error as { name?: unknown }).name;
    return typeof name === 'string' && name ? name : 'UnknownError';
  }
  return typeof error === 'string' && error ? error.slice(0, 80) : 'UnknownError';
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(ASSET_STORE)) {
        request.result.createObjectStore(ASSET_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open media storage'));
  });
}

async function getDatabase(): Promise<IDBDatabase | null> {
  databasePromise ??= openDatabase().catch(() => null);
  return databasePromise;
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Media storage request failed'));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Media storage failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Media storage aborted'));
  });
}

async function readRecord(id: string): Promise<AudioAssetRecord | null> {
  const database = await getDatabase();
  if (!database) {
    return null;
  }
  const transaction = database.transaction(ASSET_STORE, 'readonly');
  const completed = transactionComplete(transaction);
  const value = await requestValue(transaction.objectStore(ASSET_STORE).get(id));
  await completed;
  return (value as AudioAssetRecord | undefined) ?? null;
}

async function readAllAssetIds(): Promise<string[]> {
  const database = await getDatabase();
  if (!database) {
    return [];
  }
  const transaction = database.transaction(ASSET_STORE, 'readonly');
  const completed = transactionComplete(transaction);
  const keys = await requestValue(transaction.objectStore(ASSET_STORE).getAllKeys());
  await completed;
  return keys.filter((key): key is string => typeof key === 'string');
}

async function writeRecord(record: AudioAssetRecord): Promise<boolean> {
  const database = await getDatabase();
  if (!database) {
    return false;
  }
  const transaction = database.transaction(ASSET_STORE, 'readwrite');
  transaction.objectStore(ASSET_STORE).put(record);
  await transactionComplete(transaction);
  return true;
}

async function deleteRecordIfUnchanged(record: AudioAssetRecord): Promise<boolean> {
  const database = await getDatabase();
  if (!database) {
    return true;
  }
  const transaction = database.transaction(ASSET_STORE, 'readwrite');
  const completed = transactionComplete(transaction);
  const store = transaction.objectStore(ASSET_STORE);
  const current = (await requestValue(store.get(record.id))) as AudioAssetRecord | undefined;
  if (current && recordRevision(current) === recordRevision(record)) {
    store.delete(record.id);
  }
  await completed;
  return !current || recordRevision(current) === recordRevision(record);
}

async function deleteAsset(id: string, fence: string | null): Promise<void> {
  if (!fenceAllowsMutation(fence)) {
    return;
  }
  const record = await readRecord(id);
  if (!record || !fenceAllowsMutation(fence)) {
    return;
  }
  const mayRemoveContent = await deleteRecordIfUnchanged(record);
  if (mayRemoveContent && record.backend === 'opfs') {
    await removeOpfsFile(record.opfsName ?? record.id);
  }
}

async function recordFor(
  file: File,
  details: Omit<AudioAssetRecord, 'name' | 'type' | 'size' | 'lastModified' | 'bytes'>,
): Promise<AudioAssetRecord> {
  return {
    ...details,
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
    ...(details.backend === 'indexeddb' ? { bytes: await blobArrayBuffer(file) } : {}),
  };
}

async function saveNewAsset(
  file: File,
  id: string,
  ownerFence: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const revision = createStorageRevision();
  const opfsName = `${id}--${revision}`;
  try {
    if (await writeOpfsFile(opfsName, file)) {
      if (!writeStillAllowed(ownerFence, signal)) {
        await removeOpfsFile(opfsName);
        return false;
      }
      const record = await recordFor(file, {
        id,
        backend: 'opfs',
        revision,
        ownerFence,
        opfsName,
      });
      if (!writeStillAllowed(ownerFence, signal)) {
        await removeOpfsFile(opfsName);
        return false;
      }
      const saved = await writeRecord(record);
      if (!saved) {
        await removeOpfsFile(opfsName);
      }
      return saved;
    }
  } catch {
    await removeOpfsFile(opfsName);
  }
  if (!writeStillAllowed(ownerFence, signal)) {
    return false;
  }
  const record = await recordFor(file, { id, backend: 'indexeddb', revision, ownerFence });
  return writeStillAllowed(ownerFence, signal) ? writeRecord(record) : false;
}

async function recordHasContent(record: AudioAssetRecord): Promise<boolean> {
  if (record.backend === 'indexeddb') {
    return record.bytes !== undefined;
  }
  return (await readOpfsFile(record.opfsName ?? record.id)) !== null;
}

async function saveOrRepairAsset(
  file: File,
  id: string,
  ownerFence: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const existing = await readRecord(id);
  if (
    writeStillAllowed(ownerFence, signal) &&
    existing?.revision &&
    existing.ownerFence === ownerFence &&
    (await recordHasContent(existing))
  ) {
    return true;
  }
  if (!writeStillAllowed(ownerFence, signal)) {
    return false;
  }
  const saved = await saveNewAsset(file, id, ownerFence, signal);
  if (saved && existing?.backend === 'opfs') {
    const oldOpfsName = existing.opfsName ?? existing.id;
    const current = await readRecord(id);
    const currentOpfsName = current?.backend === 'opfs' ? (current.opfsName ?? current.id) : null;
    if (currentOpfsName !== oldOpfsName) {
      await removeOpfsFile(oldOpfsName);
    }
  }
  return saved;
}

export async function requestPersistentStorage(): Promise<boolean> {
  const manager = storageManager();
  if (persistenceRequested || !manager?.persist) {
    return false;
  }
  persistenceRequested = true;
  try {
    return await manager.persist();
  } catch {
    return false;
  }
}

export async function storeAudioFileForSession(
  file: File,
  signal?: AbortSignal,
): Promise<StoredAudioLease | null> {
  let release: (() => void) | null = null;
  try {
    const ownerFence = sessionOwnershipFence();
    if (!ownerFence) {
      lastStorageFailure = 'SessionOwnershipUnavailable';
      return null;
    }
    const id = await audioContentId(file);
    if (!writeStillAllowed(ownerFence, signal)) {
      lastStorageFailure = signal?.aborted ? 'AbortError' : 'SessionOwnershipLost';
      return null;
    }
    release = protectAsset(id);
    const saved = await serializeMutation(() => saveOrRepairAsset(file, id, ownerFence, signal));
    lastStorageFailure = saved ? null : 'StorageUnavailable';
    if (!saved) {
      release();
      return null;
    }
    return { id, release };
  } catch (error) {
    release?.();
    lastStorageFailure = errorLabel(error);
    return null;
  }
}

export async function storeAudioFile(file: File): Promise<string | null> {
  const stored = await storeAudioFileForSession(file);
  stored?.release();
  return stored?.id ?? null;
}

export function mediaStorageFailureReason(): string | null {
  return lastStorageFailure;
}

export async function loadAudioFile(id: string, displayName?: string): Promise<File | null> {
  try {
    const record = await readRecord(id);
    if (!record) {
      return null;
    }
    const storedFile =
      record.backend === 'opfs'
        ? await readOpfsFile(record.opfsName ?? record.id)
        : record.bytes
          ? new Blob([record.bytes], { type: record.type })
          : null;
    if (!storedFile) {
      return null;
    }
    return new File([storedFile], displayName ?? record.name, {
      type: record.type || storedFile.type,
      lastModified: record.lastModified,
    });
  } catch {
    return null;
  }
}

type ReferencedAssetIds = ReadonlySet<string> | (() => ReadonlySet<string> | null);

function currentKeepIds(source: ReferencedAssetIds): ReadonlySet<string> | null {
  return typeof source === 'function' ? source() : source;
}

export async function pruneStoredAudio(keepIds: ReferencedAssetIds): Promise<void> {
  try {
    await serializeMutation(async () => {
      const fence = sessionOwnershipFence();
      if (!fence) {
        return;
      }
      const ids = await readAllAssetIds();
      for (const id of ids) {
        const current = currentKeepIds(keepIds);
        if (!isSessionOwnershipFenceCurrent(fence) || !current) {
          return;
        }
        if (!current.has(id) && !isAssetProtected(id)) {
          await deleteAsset(id, fence);
        }
      }
    });
  } catch {
    // Cleanup is best effort; referenced media must remain usable.
  }
}

export async function clearStoredAudio(): Promise<void> {
  try {
    await serializeMutation(async () => {
      const fence = sessionOwnershipFence();
      if (!fence) {
        return;
      }
      const ids = await readAllAssetIds();
      for (const id of ids) {
        if (!isAssetProtected(id)) {
          await deleteAsset(id, fence);
        }
      }
    });
  } catch {
    // Resetting the in-memory session must not depend on browser storage availability.
  }
}

export function resetMediaStorageForTests(): void {
  databasePromise?.then((database) => database?.close()).catch(() => undefined);
  databasePromise = null;
  persistenceRequested = false;
  lastStorageFailure = null;
  mutationQueue = Promise.resolve();
  protectedAssetCounts.clear();
  revisionSequence = 0;
}
