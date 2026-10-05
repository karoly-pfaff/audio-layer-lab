import { useRef, useState } from 'react';
import { useAudioLabStore } from '../store/useAudioLabStore';
import { usePlaybackTime } from '../hooks/usePlaybackTime';
import { audioEngine } from '../audio/AudioEngine';
import { Thumbnail } from './Thumbnail';
import { WaveformDisplay } from './WaveformDisplay';
import { Slider, ToggleButton, Knob } from './MixerControls';
import { BpmBadge } from './BpmBadge';
import { isAudioFile } from '../utils/dropAssignment';
import { mainPlaybackRatio } from '../utils/transportUtils';

export function MainTrackPanel() {
  const {
    mainTrack,
    loadMainTrack,
    clearMainTrack,
    setMainVolume,
    setMainPan,
    setMainLoop,
    seekTo,
  } = useAudioLabStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const currentTime = usePlaybackTime();
  const duration = audioEngine.getMainDuration();

  const playhead =
    duration > 0 ? mainPlaybackRatio(currentTime, duration, mainTrack.loop) : undefined;

  const isLoading = mainTrack.loadingState === 'loading';
  const isFailed = mainTrack.loadingState === 'failed';
  const isPending = mainTrack.loadingState === 'remembered';

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      loadMainTrack(file);
    }
    e.target.value = '';
  }

  function handleSeek(ratio: number) {
    seekTo(ratio * duration);
  }

  function handleDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const audioFile = files.find(isAudioFile);
    if (audioFile) {
      loadMainTrack(audioFile);
    }
  }

  function formatHz(buffer: AudioBuffer | null): string {
    if (!buffer) {
      return '--';
    }
    return `${(buffer.sampleRate / 1000).toFixed(1)} kHz`;
  }

  function formatDuration(buffer: AudioBuffer | null): string {
    if (!buffer) {
      return '--:--';
    }
    const s = Math.floor(buffer.duration);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  function loadBtnContent(): string {
    if (isLoading) {
      return '…';
    }
    if (mainTrack.buffer) {
      return '↺';
    }
    if (isPending) {
      return '↻';
    }
    if (isFailed) {
      return '↻';
    }
    return '+';
  }

  function loadBtnTitle(): string {
    if (isLoading) {
      return 'Loading…';
    }
    if (isFailed) {
      return 'Retry loading main track';
    }
    if (mainTrack.buffer) {
      return 'Replace main track';
    }
    if (isPending) {
      return 'Reload main track';
    }
    return 'Load main track';
  }

  const displayTitle = mainTrack.metadata?.title || mainTrack.name;
  const artist = mainTrack.metadata?.artist;
  const album = mainTrack.metadata?.album;
  const artistAlbum = [artist, album].filter(Boolean).join(' · ');

  return (
    <div
      className={[
        'main-track-panel',
        mainTrack.buffer ? 'main-track-panel--loaded' : '',
        isDragOver ? 'main-track-panel--drag-over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="group"
      aria-label="Main track controls"
    >
      <div className="main-track-body">
        <Thumbnail url={mainTrack.thumbnailUrl} size={72} />

        <div className="main-track-info">
          {isLoading ? (
            <span className="track-name track-name--loading">Loading…</span>
          ) : isFailed ? (
            <span className="track-name track-name--failed">
              Failed to decode — click RETRY to try another file
            </span>
          ) : displayTitle ? (
            <div className="track-name-wrap">
              <div className="track-name-left">
                {isPending && (
                  <span className="reload-badge reload-badge--sm" aria-hidden="true">
                    ↻
                  </span>
                )}
                <span className={`track-name${isPending ? ' track-name--pending' : ''}`}>
                  {displayTitle}
                </span>
                {artistAlbum && <span className="track-metadata-secondary">{artistAlbum}</span>}
              </div>
              {mainTrack.buffer && (
                <>
                  <span className="meta-chip">{formatHz(mainTrack.buffer)}</span>
                  <span className="meta-chip">
                    {mainTrack.buffer.numberOfChannels === 1 ? 'MONO' : 'STEREO'}
                  </span>
                  <span className="meta-chip meta-chip--time">
                    {formatDuration(mainTrack.buffer)}
                  </span>
                  <BpmBadge
                    bpm={mainTrack.bpm}
                    confidence={mainTrack.bpmConfidence}
                    analyzing={mainTrack.bpmAnalyzing}
                  />
                </>
              )}
            </div>
          ) : (
            <span className="track-name track-name--empty">
              {isDragOver
                ? 'Drop to load main track'
                : 'No file loaded — drop audio here or click LOAD FILE'}
            </span>
          )}

          <div className="waveform-area">
            <WaveformDisplay
              buffer={mainTrack.buffer}
              height={52}
              color="#8BA8EE"
              playhead={playhead}
              duration={mainTrack.buffer?.duration ?? 0}
              onSeek={mainTrack.buffer ? handleSeek : undefined}
              accessibleLabel="Main track seek position"
            />
          </div>
        </div>

        <div className="main-track-controls">
          <div className="main-track-sliders">
            <Slider
              label="VOL"
              value={mainTrack.volume}
              onChange={setMainVolume}
              unit="dB"
              className="main-slider"
              accessibleLabel="Main track volume (VOL)"
            />
            <Knob
              label="PAN"
              value={mainTrack.pan}
              onChange={setMainPan}
              accessibleLabel="Main track pan"
            />
          </div>
          <div className="main-track-state-controls">
            <ToggleButton
              label="LOOP"
              active={mainTrack.loop}
              onClick={() => setMainLoop(!mainTrack.loop)}
              variant="loop"
              ariaLabel={`${mainTrack.loop ? 'Disable' : 'Enable'} main track loop`}
            />
          </div>

          <div className="main-track-action-controls">
            <button
              className={[
                'load-btn load-btn--sm',
                isLoading ? 'load-btn--loading' : '',
                isFailed ? 'load-btn--failed' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => !isLoading && fileInputRef.current?.click()}
              type="button"
              title={loadBtnTitle()}
              aria-label={loadBtnTitle()}
              disabled={isLoading}
            >
              {loadBtnContent()}
            </button>
            <button
              className="remove-btn"
              onClick={clearMainTrack}
              type="button"
              title="Clear main track"
              aria-label="Clear main track"
              aria-hidden={!mainTrack.buffer && !isPending && !isFailed ? 'true' : undefined}
              tabIndex={!mainTrack.buffer && !isPending && !isFailed ? -1 : undefined}
              style={
                !mainTrack.buffer && !isPending && !isFailed ? { visibility: 'hidden' } : undefined
              }
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
}
