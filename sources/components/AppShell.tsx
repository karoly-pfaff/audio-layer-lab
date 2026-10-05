import { useEffect, useRef, useState } from 'react';
import { TransportBar } from './TransportBar';
import { PlaybackBar } from './PlaybackBar';
import { MainTrackPanel } from './MainTrackPanel';
import { LayerTrackRow } from './LayerTrackRow';
import { SnapshotPanel } from './SnapshotPanel';
import { StatusMessage } from './StatusMessage';
import {
  restoreOwnedSessionAudio,
  suspendOwnedSessionAudio,
  useAudioLabStore,
} from '../store/useAudioLabStore';
import { MAX_LAYER_COUNT } from '../store/persistence';
import { isInteractiveShortcutTarget } from '../utils/keyboardShortcuts';
import {
  currentSessionOwnershipFence,
  takeOverSession,
  useSessionOwnership,
  useSessionOwnershipEpoch,
} from '../store/sessionOwnership';

export function AppShell() {
  const ownership = useSessionOwnership();
  const ownershipEpoch = useSessionOwnershipEpoch();
  const ownershipFence = ownership === 'owner' ? currentSessionOwnershipFence() : null;
  const [readyFence, setReadyFence] = useState(ownershipFence);
  useEffect(() => {
    let active = true;
    if (ownership === 'owner') {
      void restoreOwnedSessionAudio().then((ready) => {
        if (active && ready) {
          setReadyFence(ownershipFence);
        }
      });
    } else {
      suspendOwnedSessionAudio();
    }
    return () => {
      active = false;
    };
  }, [ownership, ownershipFence, ownershipEpoch]);
  if (ownership === 'blocked') {
    return (
      <main className="session-conflict" aria-labelledby="session-conflict-title">
        <div className="session-conflict-card" role="alert">
          <h1 id="session-conflict-title">Audio Layer Lab is open in another tab</h1>
          <p>
            Only one tab can edit the locally saved session at a time. Continue in the other tab,
            close it, or take over editing here.
          </p>
          <button type="button" onClick={takeOverSession}>
            Take over editing
          </button>
        </div>
      </main>
    );
  }
  if (ownership === 'owner' && readyFence !== ownershipFence) {
    return (
      <main className="session-conflict" aria-busy="true" aria-live="polite">
        <div className="session-conflict-card" role="status">
          <h1>Restoring the latest local session…</h1>
          <p>Audio and mix state are being handed over safely.</p>
        </div>
      </main>
    );
  }
  return <EditableAppShell />;
}

function EditableAppShell() {
  const {
    layers,
    transport,
    play,
    pause,
    stop,
    toggleMasterMute,
    seekToStart,
    jumpBack,
    jumpForward,
    dropLayerFiles,
    addLayer,
  } = useAudioLabStore();

  const playingRef = useRef(transport.playing);
  useEffect(() => {
    playingRef.current = transport.playing;
  }, [transport.playing]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isInteractiveShortcutTarget(e.target)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (playingRef.current) {
          pause();
        } else {
          play();
        }
      } else if (e.code === 'Escape') {
        stop();
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMasterMute();
      } else if (e.code === 'Home') {
        e.preventDefault();
        seekToStart();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        jumpBack();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        jumpForward();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [play, pause, stop, toggleMasterMute, seekToStart, jumpBack, jumpForward]);

  function handleLayersDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('application/x-layer-id')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    } else if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  function handleLayersDrop(e: React.DragEvent) {
    e.preventDefault();
    // Layer reorder drops are handled (and stopPropagation'd) by individual rows;
    // this handler only fires for drops between rows or on empty space.
    if (e.dataTransfer.getData('application/x-layer-id')) {
      return;
    }
    dropLayerFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to mixer
      </a>
      <div className="scanlines" aria-hidden="true" />
      <div className="grid-bg" aria-hidden="true" />

      <TransportBar />

      <main id="main-content" className="app-main" tabIndex={-1}>
        <section className="main-section" aria-labelledby="main-track-heading">
          <div className="main-header">
            <h2 id="main-track-heading" className="panel-label">
              Main track
            </h2>
          </div>
          <MainTrackPanel />
        </section>

        <section className="layers-section" aria-labelledby="layer-tracks-heading">
          <div className="layers-header">
            <h2 id="layer-tracks-heading" className="panel-label">
              Layer tracks
            </h2>
            <span className="layers-hint">All layers loop</span>
            <button
              className="add-layer-btn"
              type="button"
              onClick={addLayer}
              title={`Add layer (max ${MAX_LAYER_COUNT})`}
              disabled={layers.length >= MAX_LAYER_COUNT}
            >
              + Layer
            </button>
          </div>
          <div
            className="layers-list"
            onDragOver={handleLayersDragOver}
            onDrop={handleLayersDrop}
            aria-label="Layer tracks — drop audio files here to load"
            role="list"
          >
            {layers.length === 0 && (
              <div className="layers-empty">
                No layers — click <strong>+ Layer</strong> to add one, or drop audio files here
              </div>
            )}
            {layers.map((layer) => (
              <LayerTrackRow key={layer.id} layer={layer} />
            ))}
          </div>
        </section>

        <SnapshotPanel />
      </main>
      <StatusMessage />
      <PlaybackBar />
    </div>
  );
}
