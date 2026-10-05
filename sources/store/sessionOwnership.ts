import { useSyncExternalStore } from 'react';

const OWNER_KEY = 'audio-layer-lab-session-owner';
const OWNER_TTL_MS = 15_000;
const HEARTBEAT_MS = 5_000;

type OwnershipStatus = 'owner' | 'blocked' | 'unavailable';

interface OwnershipRecord {
  id: string;
  fence?: string;
  expiresAt: number;
}

const ownerId =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const listeners = new Set<() => void>();
let status: OwnershipStatus | null = null;
let monitoringStarted = false;
let activeFence: string | null = null;
let fenceSequence = 0;
let automaticClaimEnabled = true;
let ownershipEpoch = 0;

function publishOwnershipChange(): void {
  ownershipEpoch += 1;
  listeners.forEach((listener) => listener());
}

function createFence(): string {
  fenceSequence += 1;
  return `${ownerId}-${Date.now().toString(36)}-${fenceSequence.toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function parseRecord(raw: string | null): OwnershipRecord | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>)['id'] === 'string' &&
      typeof (parsed as Record<string, unknown>)['expiresAt'] === 'number'
    ) {
      return parsed as OwnershipRecord;
    }
  } catch {
    // A malformed lease is treated as expired and replaced by a valid one.
  }
  return null;
}

function readRecord(): OwnershipRecord | null | undefined {
  try {
    return parseRecord(localStorage.getItem(OWNER_KEY));
  } catch {
    return undefined;
  }
}

function writeRecord(record: OwnershipRecord): boolean {
  try {
    localStorage.setItem(OWNER_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

function updateStatus(next: OwnershipStatus): OwnershipStatus {
  if (status === 'owner' && next === 'blocked') {
    automaticClaimEnabled = false;
  }
  if (next !== 'owner') {
    activeFence = null;
  }
  if (status !== next) {
    status = next;
    publishOwnershipChange();
  }
  return next;
}

function isActiveForeignOwner(
  current: OwnershipRecord | null,
  now: number,
  force: boolean,
): boolean {
  return !force && current !== null && current.id !== ownerId && current.expiresAt > now;
}

function canRenewFence(
  current: OwnershipRecord | null,
  force: boolean,
): current is OwnershipRecord & { fence: string } {
  return Boolean(
    !force &&
    current?.id === ownerId &&
    typeof current.fence === 'string' &&
    current.fence === activeFence,
  );
}

function claimOwnership(force = false): OwnershipStatus {
  const now = Date.now();
  const current = readRecord();
  if (current === undefined) {
    return updateStatus('unavailable');
  }
  if (isActiveForeignOwner(current, now, force)) {
    return updateStatus('blocked');
  }
  const fence = canRenewFence(current, force) ? current.fence : createFence();
  if (!writeRecord({ id: ownerId, fence, expiresAt: now + OWNER_TTL_MS })) {
    return updateStatus('unavailable');
  }
  const confirmed = readRecord();
  if (confirmed?.id === ownerId && confirmed.fence === fence) {
    const previousStatus = status;
    const previousFence = activeFence;
    const recoveredExpiredLease =
      current?.id === ownerId && current.fence === fence && current.expiresAt <= now;
    activeFence = fence;
    const next = updateStatus('owner');
    if (previousStatus === 'owner' && (previousFence !== activeFence || recoveredExpiredLease)) {
      publishOwnershipChange();
    }
    return next;
  }
  return updateStatus('blocked');
}

function refreshOwnership(): void {
  const current = readRecord();
  if (current === undefined) {
    updateStatus('unavailable');
    return;
  }
  if (current?.id === ownerId) {
    claimOwnership();
    return;
  }
  if (!current || current.expiresAt <= Date.now()) {
    // Once this tab has owned a particular lease, losing that lease is a fencing event.
    // Never silently bridge the gap: another tab may have taken over and already unloaded
    // before this tab gets CPU time again.
    if (status === 'owner') {
      updateStatus('blocked');
      return;
    }
    if (automaticClaimEnabled) {
      claimOwnership();
    } else {
      updateStatus('blocked');
    }
    return;
  }
  updateStatus('blocked');
}

function startMonitoring(): void {
  if (monitoringStarted || typeof window === 'undefined') {
    return;
  }
  monitoringStarted = true;
  window.addEventListener('storage', (event) => {
    if (event.key === OWNER_KEY || event.key === null) {
      const eventRecord = event.key === OWNER_KEY ? parseRecord(event.newValue) : null;
      const current = readRecord();
      if (eventRecord?.id !== undefined && eventRecord.id !== ownerId && current?.id !== ownerId) {
        // Use the event payload as evidence of a takeover. Reading only current storage is
        // unsafe because the winning tab may have unloaded before this queued event runs.
        updateStatus('blocked');
        return;
      }
      refreshOwnership();
    }
  });
  window.addEventListener('beforeunload', releaseSessionOwnership);
  window.setInterval(refreshOwnership, HEARTBEAT_MS);
}

export function ensureSessionOwnership(): boolean {
  const current = readRecord();
  if (
    status === 'owner' &&
    current !== undefined &&
    current?.id === ownerId &&
    current.expiresAt > Date.now()
  ) {
    return true;
  }
  if (status === 'owner' && current?.id === ownerId && current.fence === activeFence) {
    return claimOwnership() === 'owner';
  }
  if (status === 'owner' || !automaticClaimEnabled) {
    updateStatus('blocked');
    return false;
  }
  return claimOwnership() !== 'blocked';
}

export function ownsSession(): boolean {
  return currentSessionOwnershipFence() !== null;
}

export function sessionOwnershipFence(): string | null {
  return currentSessionOwnershipFence();
}

export function currentSessionOwnershipFence(): string | null {
  if (status !== 'owner' || !activeFence) {
    return null;
  }
  const current = readRecord();
  return current?.id === ownerId && current.fence === activeFence && current.expiresAt > Date.now()
    ? activeFence
    : null;
}

export function isSessionOwnershipFenceCurrent(fence: string): boolean {
  const current = readRecord();
  return current?.id === ownerId && current.fence === fence && current.expiresAt > Date.now();
}

export function takeOverSession(): void {
  automaticClaimEnabled = true;
  claimOwnership(true);
}

export function releaseSessionOwnership(): void {
  const current = readRecord();
  if (current?.id === ownerId) {
    try {
      localStorage.removeItem(OWNER_KEY);
    } catch {
      // Storage may disappear during page teardown.
    }
  }
  activeFence = null;
}

export function sessionOwnershipSnapshot(): OwnershipStatus {
  if (status === null) {
    claimOwnership();
  }
  return status ?? 'unavailable';
}

function subscribeSessionOwnership(listener: () => void): () => void {
  listeners.add(listener);
  startMonitoring();
  refreshOwnership();
  return () => listeners.delete(listener);
}

export function useSessionOwnership(): OwnershipStatus {
  return useSyncExternalStore(
    subscribeSessionOwnership,
    sessionOwnershipSnapshot,
    sessionOwnershipSnapshot,
  );
}

function sessionOwnershipEpochSnapshot(): number {
  if (status === null) {
    claimOwnership();
  }
  return ownershipEpoch;
}

export function useSessionOwnershipEpoch(): number {
  return useSyncExternalStore(
    subscribeSessionOwnership,
    sessionOwnershipEpochSnapshot,
    sessionOwnershipEpochSnapshot,
  );
}
