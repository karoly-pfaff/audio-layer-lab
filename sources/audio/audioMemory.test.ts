import { describe, expect, it } from 'vitest';
import type { AudioLabState } from '../store/audioLabStoreTypes';
import {
  audioBufferBytes,
  fitsSessionAudioBudget,
  MAX_SESSION_DECODED_AUDIO_BYTES,
} from './audioMemory';

function buffer(bytes: number): AudioBuffer {
  return {
    length: bytes / Float32Array.BYTES_PER_ELEMENT,
    numberOfChannels: 1,
  } as AudioBuffer;
}

function state(): AudioLabState {
  return {
    mainTrack: { buffer: null },
    layers: [
      { id: 'layer-0', buffer: null },
      { id: 'layer-1', buffer: null },
    ],
    transport: { playing: false, masterVolume: 1, masterMuted: false, positionRevision: 0 },
    snapshots: [],
    ab: { a: null, b: null },
    statusMessage: null,
  } as unknown as AudioLabState;
}

describe('audio memory budget', () => {
  it('calculates decoded bytes and accepts a replacement within the global budget', () => {
    const current = state();
    current.mainTrack.buffer = buffer(256 * 1024 * 1024);
    expect(audioBufferBytes(current.mainTrack.buffer)).toBe(256 * 1024 * 1024);
    expect(
      fitsSessionAudioBudget(current, buffer(MAX_SESSION_DECODED_AUDIO_BYTES), { kind: 'main' }),
    ).toBe(true);
  });

  it('counts retained tracks and excludes the layer being replaced', () => {
    const current = state();
    current.mainTrack.buffer = buffer(300 * 1024 * 1024);
    current.layers[0]!.buffer = buffer(150 * 1024 * 1024);
    current.layers[1]!.buffer = buffer(100 * 1024 * 1024);

    expect(
      fitsSessionAudioBudget(current, buffer(100 * 1024 * 1024), {
        kind: 'layer',
        layerId: current.layers[0]!.id,
      }),
    ).toBe(true);
    expect(
      fitsSessionAudioBudget(current, buffer(150 * 1024 * 1024), {
        kind: 'layer',
        layerId: current.layers[0]!.id,
      }),
    ).toBe(false);
  });
});
