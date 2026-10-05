import { describe, it, expect } from 'vitest';
import { isAudioFile, assignDropFiles } from './dropAssignment';
import type { LayerState } from '../audio/types';

function makeFile(name: string, type = ''): File {
  return new File([''], name, { type });
}

function makeLayer(order: number, loadingState: LayerState['loadingState'] = 'empty'): LayerState {
  return {
    id: `layer-${order}`,
    name: '',
    buffer: null,
    volume: 1,
    muted: false,
    loop: true,
    thumbnailUrl: null,
    pan: 0,
    soloed: false,
    order,
    loadingState,
    metadata: null,
  };
}

// ── isAudioFile ───────────────────────────────────────────────────────────────

describe('isAudioFile', () => {
  it('accepts file with audio/ MIME type', () => {
    expect(isAudioFile(makeFile('track.mp3', 'audio/mpeg'))).toBe(true);
  });

  it('accepts file with audio/* MIME type variants', () => {
    expect(isAudioFile(makeFile('loop.wav', 'audio/wav'))).toBe(true);
    expect(isAudioFile(makeFile('loop.ogg', 'audio/ogg'))).toBe(true);
  });

  it('accepts file by extension when MIME is empty', () => {
    expect(isAudioFile(makeFile('beat.mp3'))).toBe(true);
    expect(isAudioFile(makeFile('sample.flac'))).toBe(true);
    expect(isAudioFile(makeFile('loop.wav'))).toBe(true);
    expect(isAudioFile(makeFile('stem.m4a'))).toBe(true);
    expect(isAudioFile(makeFile('drone.aiff'))).toBe(true);
  });

  it('rejects image files', () => {
    expect(isAudioFile(makeFile('photo.jpg', 'image/jpeg'))).toBe(false);
    expect(isAudioFile(makeFile('icon.png', 'image/png'))).toBe(false);
  });

  it('rejects text files', () => {
    expect(isAudioFile(makeFile('readme.txt', 'text/plain'))).toBe(false);
  });

  it('rejects files with no extension and no MIME', () => {
    expect(isAudioFile(makeFile('noext'))).toBe(false);
  });

  it('is case-insensitive for extensions', () => {
    expect(isAudioFile(makeFile('TRACK.MP3'))).toBe(true);
    expect(isAudioFile(makeFile('loop.WAV'))).toBe(true);
  });
});

// ── assignDropFiles ───────────────────────────────────────────────────────────

describe('assignDropFiles', () => {
  it('returns empty assignments for empty file list', () => {
    const layers = [makeLayer(0), makeLayer(1)];
    const { assignments, skipped } = assignDropFiles([], layers);
    expect(assignments).toHaveLength(0);
    expect(skipped).toBe(0);
  });

  it('assigns a single audio file to the first empty slot', () => {
    const layers = [makeLayer(0), makeLayer(1)];
    const { assignments, skipped } = assignDropFiles([makeFile('a.mp3', 'audio/mpeg')], layers);
    expect(assignments).toHaveLength(1);
    expect(assignments[0].layerId).toBe('layer-0');
    expect(skipped).toBe(0);
  });

  it('skips non-audio files', () => {
    const layers = [makeLayer(0)];
    const { assignments, skipped } = assignDropFiles([makeFile('img.jpg', 'image/jpeg')], layers);
    expect(assignments).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('assigns multiple files to consecutive empty slots', () => {
    const layers = [makeLayer(0), makeLayer(1), makeLayer(2)];
    const files = [makeFile('a.mp3', 'audio/mpeg'), makeFile('b.wav', 'audio/wav')];
    const { assignments, skipped } = assignDropFiles(files, layers);
    expect(assignments).toHaveLength(2);
    expect(assignments[0].layerId).toBe('layer-0');
    expect(assignments[1].layerId).toBe('layer-1');
    expect(skipped).toBe(0);
  });

  it('skips occupied (loaded) slots', () => {
    const layers = [makeLayer(0, 'loaded'), makeLayer(1, 'empty'), makeLayer(2, 'empty')];
    const files = [makeFile('a.mp3', 'audio/mpeg'), makeFile('b.wav', 'audio/wav')];
    const { assignments } = assignDropFiles(files, layers);
    expect(assignments[0].layerId).toBe('layer-1');
    expect(assignments[1].layerId).toBe('layer-2');
  });

  it('skips remembered slots', () => {
    const layers = [makeLayer(0, 'remembered'), makeLayer(1, 'empty')];
    const files = [makeFile('a.mp3', 'audio/mpeg')];
    const { assignments } = assignDropFiles(files, layers);
    expect(assignments[0].layerId).toBe('layer-1');
  });

  it('returns overflow audio files in overflowFiles (not counted as skipped)', () => {
    const layers = [makeLayer(0)];
    const files = [makeFile('a.mp3', 'audio/mpeg'), makeFile('b.wav', 'audio/wav')];
    const { assignments, overflowFiles, skipped } = assignDropFiles(files, layers);
    expect(assignments).toHaveLength(1);
    expect(overflowFiles).toHaveLength(1);
    expect(overflowFiles[0].name).toBe('b.wav');
    expect(skipped).toBe(0); // only non-audio counts as skipped
  });

  it('skipped counts only non-audio; overflow is separate in overflowFiles', () => {
    const layers = [makeLayer(0)];
    const files = [
      makeFile('a.mp3', 'audio/mpeg'),
      makeFile('b.wav', 'audio/wav'),
      makeFile('img.jpg', 'image/jpeg'),
    ];
    const { assignments, overflowFiles, skipped } = assignDropFiles(files, layers);
    expect(assignments).toHaveLength(1);
    expect(overflowFiles).toHaveLength(1); // b.wav
    expect(skipped).toBe(1); // img.jpg only
  });

  it('assigns slots in ascending order position', () => {
    // Layers supplied in non-order sequence — should still assign by order
    const layers = [makeLayer(2), makeLayer(0), makeLayer(1)];
    const files = [makeFile('a.mp3', 'audio/mpeg'), makeFile('b.wav', 'audio/wav')];
    const { assignments } = assignDropFiles(files, layers);
    expect(assignments[0].layerId).toBe('layer-0');
    expect(assignments[1].layerId).toBe('layer-1');
  });

  it('returns empty assignments when all slots are occupied; file goes to overflowFiles', () => {
    const layers = [makeLayer(0, 'loaded'), makeLayer(1, 'loaded')];
    const files = [makeFile('a.mp3', 'audio/mpeg')];
    const { assignments, overflowFiles, skipped } = assignDropFiles(files, layers);
    expect(assignments).toHaveLength(0);
    expect(overflowFiles).toHaveLength(1);
    expect(skipped).toBe(0);
  });
});
