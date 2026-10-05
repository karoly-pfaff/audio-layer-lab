import type { LayerState } from '../audio/types';

const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'wav',
  'ogg',
  'flac',
  'aac',
  'm4a',
  'opus',
  'weba',
  'webm',
  'aiff',
  'aif',
  'caf',
]);

export function isAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) {
    return true;
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_EXTENSIONS.has(ext);
}

export interface DropAssignment {
  layerId: string;
  file: File;
}

// Assigns audio files from a drop event to empty layer slots in order position.
// Non-audio files count as skipped. Audio files that exceed empty slots are returned
// in overflowFiles so the caller can create new layers for them.
export function assignDropFiles(
  files: File[],
  layers: LayerState[],
): { assignments: DropAssignment[]; overflowFiles: File[]; skipped: number } {
  const audioFiles = files.filter(isAudioFile);
  const skipped = files.length - audioFiles.length;

  const emptyLayers = layers
    .filter((l) => l.loadingState === 'empty')
    .sort((a, b) => a.order - b.order);

  const assignCount = Math.min(audioFiles.length, emptyLayers.length);
  const assignments: DropAssignment[] = [];
  for (let i = 0; i < assignCount; i++) {
    const layer = emptyLayers[i];
    const file = audioFiles[i];
    if (layer && file) {
      assignments.push({ layerId: layer.id, file });
    }
  }

  const overflowFiles = audioFiles.slice(assignCount);
  return { assignments, overflowFiles, skipped };
}
