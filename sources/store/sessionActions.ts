import { buildPersistedSession } from './audioLabState';
import type { AudioLabGet, AudioLabSet, SessionActions } from './audioLabStoreTypes';
import { defaultSession } from './persistence';
import { downloadPreset, parsePreset, serializePreset } from './presets';
import { showStatus } from './statusMessages';
import { pruneUnreferencedAudio } from './assetReferences';
import { sessionIntentCoordinator } from './sessionIntentCoordinator';
import { releaseCurrentSession, replaceWithSession } from './sessionLifecycle';

const MAX_PRESET_FILE_BYTES = 2 * 1024 * 1024;

export function createSessionActions(set: AudioLabSet, get: AudioLabGet): SessionActions {
  return {
    resetSession: () => {
      sessionIntentCoordinator.noteStateMutation();
      releaseCurrentSession(get);
      const session = defaultSession();
      replaceWithSession(set, session);
      pruneUnreferencedAudio(get);
      showStatus(set, 'Session reset');
    },
    exportPreset: () => {
      downloadPreset(serializePreset(buildPersistedSession(get())));
      showStatus(set, 'Preset exported');
    },
    importPreset: async (file) => {
      const intent = sessionIntentCoordinator.beginIntent();
      try {
        if (file.size > MAX_PRESET_FILE_BYTES) {
          showStatus(set, 'Preset file is too large (2 MB maximum)');
          return;
        }
        const rawText = await file.text();
        if (!sessionIntentCoordinator.isCurrent(intent)) {
          return;
        }
        const raw: unknown = JSON.parse(rawText);
        const session = parsePreset(raw);
        releaseCurrentSession(get);
        replaceWithSession(set, session);
        pruneUnreferencedAudio(get);
        const hasSnapshots = session.snapshots.length > 0 || session.ab.a || session.ab.b;
        showStatus(
          set,
          hasSnapshots
            ? 'Preset imported with snapshots — reload audio files to play'
            : 'Preset imported — reload audio files to play',
        );
      } catch {
        if (sessionIntentCoordinator.isCurrent(intent)) {
          showStatus(set, 'Invalid preset file');
        }
      }
    },
  };
}
