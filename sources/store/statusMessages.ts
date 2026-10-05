import type { AudioLabSet } from './audioLabStoreTypes';

export function showStatus(set: AudioLabSet, message: string): void {
  set({ statusMessage: message });
}

export function dismissStatus(set: AudioLabSet): void {
  set({ statusMessage: null });
}
