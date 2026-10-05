import { useAudioLabStore } from '../store/useAudioLabStore';
import { usePlaybackTime } from '../hooks/usePlaybackTime';
import { formatTime } from '../utils/transportUtils';
import { Slider, ToggleButton } from './MixerControls';
import { StereoMeter } from './StereoMeter';

function MainTrackClock() {
  const currentTime = usePlaybackTime();
  const formattedTime = formatTime(currentTime);
  return (
    <output className="main-track-clock" aria-label={`Playback position ${formattedTime}`}>
      {formattedTime}
    </output>
  );
}

export function PlaybackBar() {
  const {
    transport,
    play,
    pause,
    stop,
    seekToStart,
    jumpBack,
    jumpForward,
    setMasterVolume,
    toggleMasterMute,
    canPlay,
  } = useAudioLabStore();
  const playable = canPlay();

  return (
    <footer className="playback-bar" aria-label="Playback controls">
      <div className="playback-clock">
        <MainTrackClock />
      </div>

      <div className="transport-controls">
        <div className="transport-buttons">
          <button
            className="transport-btn transport-btn--jump"
            onClick={seekToStart}
            disabled={!playable}
            type="button"
            title="Restart from beginning (Home)"
            aria-label="Restart from beginning"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
            </svg>
          </button>

          <button
            className="transport-btn transport-btn--jump"
            onClick={() => jumpBack()}
            disabled={!playable}
            type="button"
            title="Jump back 5s (←)"
            aria-label="Jump back 5 seconds"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path d="M11 18V6l-8.5 6 8.5 6zm.5-6 8.5 6V6l-8.5 6z" />
            </svg>
          </button>

          <button
            className={`transport-btn transport-btn--play${transport.playing ? ' transport-btn--active' : ''}`}
            onClick={transport.playing ? pause : play}
            disabled={!playable}
            type="button"
            title={transport.playing ? 'Pause (Space)' : 'Play (Space)'}
            aria-label={transport.playing ? 'Pause playback' : 'Play'}
          >
            {transport.playing ? (
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="20"
                height="20"
                aria-hidden="true"
              >
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="20"
                height="20"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button
            className="transport-btn transport-btn--stop"
            onClick={stop}
            disabled={!playable}
            type="button"
            title="Stop (Esc)"
            aria-label="Stop playback"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
              <rect x="5" y="5" width="14" height="14" rx="1" />
            </svg>
          </button>

          <button
            className="transport-btn transport-btn--jump"
            onClick={() => jumpForward()}
            disabled={!playable}
            type="button"
            title="Jump forward 5s (→)"
            aria-label="Jump forward 5 seconds"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="transport-right">
        <div className="transport-master">
          <Slider
            label="MASTER"
            value={transport.masterVolume}
            onChange={setMasterVolume}
            unit="dB"
            className="transport-master-slider"
            accessibleLabel="Master volume (MASTER)"
          />
          <ToggleButton
            label="M"
            active={transport.masterMuted}
            onClick={toggleMasterMute}
            variant="mute"
            title={transport.masterMuted ? 'Unmute master output (M)' : 'Mute master output (M)'}
            ariaLabel={transport.masterMuted ? 'Unmute master output' : 'Mute master output'}
          />
        </div>
        <StereoMeter />
      </div>
    </footer>
  );
}
