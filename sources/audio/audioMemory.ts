import type { AudioLabState } from '../store/audioLabStoreTypes';

export const MAX_AUDIO_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_DECODED_AUDIO_BYTES = 256 * 1024 * 1024;
export const MAX_SESSION_DECODED_AUDIO_BYTES = 512 * 1024 * 1024;

export function audioBufferBytes(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
}

function currentSessionAudioBytes(
  state: AudioLabState,
  replacedMain: boolean,
  replacedLayerId?: string,
): number {
  const mainBytes =
    !replacedMain && state.mainTrack.buffer ? audioBufferBytes(state.mainTrack.buffer) : 0;
  return state.layers.reduce(
    (total, layer) =>
      total + (layer.id !== replacedLayerId && layer.buffer ? audioBufferBytes(layer.buffer) : 0),
    mainBytes,
  );
}

export function fitsSessionAudioBudget(
  state: AudioLabState,
  buffer: AudioBuffer,
  target: { kind: 'main' } | { kind: 'layer'; layerId: string },
): boolean {
  const retained = currentSessionAudioBytes(
    state,
    target.kind === 'main',
    target.kind === 'layer' ? target.layerId : undefined,
  );
  return retained + audioBufferBytes(buffer) <= MAX_SESSION_DECODED_AUDIO_BYTES;
}
