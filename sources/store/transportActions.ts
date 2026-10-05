import { audioEngine } from '../audio/AudioEngine';
import { JUMP_SECONDS } from '../utils/playbackNavigation';
import { clampFinite } from '../utils/validation';
import type { AudioLabGet, AudioLabSet, TransportActions } from './audioLabStoreTypes';
import { showStatus } from './statusMessages';
import { transportCoordinator } from './transportCoordinator';

function publishPosition(set: AudioLabSet): void {
  set((state) => ({
    transport: {
      ...state.transport,
      positionRevision: state.transport.positionRevision + 1,
    },
  }));
}

export function createTransportActions(set: AudioLabSet, get: AudioLabGet): TransportActions {
  return {
    play: () => {
      const token = transportCoordinator.beginPlay();
      void audioEngine
        .resumeContext()
        .then(() => {
          if (!transportCoordinator.isCurrent(token)) {
            return;
          }
          if (audioEngine.play()) {
            set((state) => ({ transport: { ...state.transport, playing: true } }));
          }
        })
        .catch(() => {
          if (transportCoordinator.isCurrent(token)) {
            showStatus(set, 'Audio blocked — interact with the page first, then try again');
          }
        });
    },
    pause: () => {
      transportCoordinator.cancelPendingPlay();
      audioEngine.pause();
      set((state) => ({
        transport: {
          ...state.transport,
          playing: false,
          positionRevision: state.transport.positionRevision + 1,
        },
      }));
    },
    stop: () => {
      transportCoordinator.cancelPendingPlay();
      audioEngine.stop();
      set((state) => ({
        transport: {
          ...state.transport,
          playing: false,
          positionRevision: state.transport.positionRevision + 1,
        },
      }));
    },
    seekTo: (seconds) => {
      audioEngine.seek(seconds);
      publishPosition(set);
    },
    seekToStart: () => {
      audioEngine.seek(0);
      publishPosition(set);
    },
    jumpBack: (seconds = JUMP_SECONDS) => {
      audioEngine.seek(Math.max(0, audioEngine.currentTime - Math.max(0, seconds)));
      publishPosition(set);
    },
    jumpForward: (seconds = JUMP_SECONDS) => {
      const duration = audioEngine.getMainDuration();
      const limit = duration > 0 && !get().mainTrack.loop ? duration : Infinity;
      audioEngine.seek(Math.min(audioEngine.currentTime + Math.max(0, seconds), limit));
      publishPosition(set);
    },
    setMasterVolume: (volume) => {
      const safeVolume = clampFinite(volume, 0, 1, get().transport.masterVolume);
      audioEngine.setMasterVolume(safeVolume);
      set((state) => ({ transport: { ...state.transport, masterVolume: safeVolume } }));
    },
    toggleMasterMute: () => {
      const masterMuted = !get().transport.masterMuted;
      audioEngine.setMasterMute(masterMuted);
      set((state) => ({ transport: { ...state.transport, masterMuted } }));
    },
    canPlay: () => {
      const state = get();
      return state.mainTrack.buffer !== null || state.layers.some((layer) => layer.buffer !== null);
    },
  };
}
