import { audioEngine } from '../audio/AudioEngine';
import { extractMetadata, revokeArtworkUrl, type AudioMetadata } from '../audio/metadata';
import { audioLoadQueue } from './audioLoadQueue';
import { requestPersistentStorage, storeAudioFileForSession } from './mediaStorage';
import { pruneDurableUnreferencedAudio } from './assetReferences';
import {
  MAX_AUDIO_FILE_BYTES,
  MAX_DECODED_AUDIO_BYTES,
  audioBufferBytes,
} from '../audio/audioMemory';

export class AudioLoadError extends Error {}

export interface LoadedAudio {
  buffer: AudioBuffer;
  metadata: AudioMetadata;
  assetId: string | null;
  releaseAsset: () => void;
}

export async function disposeLoadedAudio(loaded: LoadedAudio): Promise<void> {
  revokeArtworkUrl(loaded.metadata.artworkUrl);
  loaded.releaseAsset();
  await pruneDurableUnreferencedAudio();
}

export async function loadAudioForTrack(file: File, signal?: AbortSignal): Promise<LoadedAudio> {
  if (file.size > MAX_AUDIO_FILE_BYTES) {
    throw new AudioLoadError('Audio file is too large (100 MB maximum)');
  }
  return audioLoadQueue.schedule(
    async () => {
      void requestPersistentStorage();
      const metadata: AudioMetadata = await extractMetadata(
        file,
        audioEngine.audioContext.sampleRate,
      ).catch(() => ({
        title: null,
        artist: null,
        album: null,
        artworkUrl: null,
      }));
      if (
        metadata.decodedBytesEstimate !== undefined &&
        metadata.decodedBytesEstimate > MAX_DECODED_AUDIO_BYTES
      ) {
        revokeArtworkUrl(metadata.artworkUrl);
        throw new AudioLoadError('Decoded audio is too large (256 MB maximum)');
      }
      const buffer = await audioEngine.decodeFile(file).catch((error: unknown) => {
        revokeArtworkUrl(metadata.artworkUrl);
        throw error;
      });
      if (audioBufferBytes(buffer) > MAX_DECODED_AUDIO_BYTES) {
        revokeArtworkUrl(metadata.artworkUrl);
        throw new AudioLoadError('Decoded audio is too large (256 MB maximum)');
      }
      if (signal?.aborted) {
        revokeArtworkUrl(metadata.artworkUrl);
        throw new DOMException('Audio load cancelled', 'AbortError');
      }
      const stored = await storeAudioFileForSession(file, signal);
      return {
        buffer,
        metadata,
        assetId: stored?.id ?? null,
        releaseAsset: stored?.release ?? (() => undefined),
      };
    },
    signal,
    disposeLoadedAudio,
  );
}

export function audioLoadFailureMessage(error: unknown): string {
  return error instanceof AudioLoadError ||
    (error instanceof Error && error.message === 'Too many audio files are being processed at once')
    ? error.message
    : 'Failed to decode audio';
}
