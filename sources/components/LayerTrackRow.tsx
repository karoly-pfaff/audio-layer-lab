import { useRef, useState } from 'react';
import { useAudioLabStore } from '../store/useAudioLabStore';
import type { LayerState } from '../audio/types';
import { audioEngine } from '../audio/AudioEngine';
import { Thumbnail } from './Thumbnail';
import { WaveformDisplay } from './WaveformDisplay';
import { Slider, ToggleButton, Knob } from './MixerControls';
import { BpmBadge } from './BpmBadge';
import { usePlaybackTime } from '../hooks/usePlaybackTime';
import { layerPlayhead } from '../utils/playbackNavigation';
import { getBpmRelation } from '../audio/bpm';
import { isAudioFile } from '../utils/dropAssignment';
import { loopHealthLabel } from '../audio/loopHealth';
import { dropInsertionOrder } from '../utils/layerOrder';

interface LayerTrackRowProps {
  layer: LayerState;
}

interface LayerReorderControlsProps {
  layerId: string;
  layerLabel: string;
  order: number;
  count: number;
  reorderLayer: (layerId: string, order: number) => void;
  setDragging: (dragging: boolean) => void;
}

function LayerReorderControls({
  layerId,
  layerLabel,
  order,
  count,
  reorderLayer,
  setDragging,
}: LayerReorderControlsProps) {
  function handleKeyDown(event: React.KeyboardEvent) {
    const destination =
      event.code === 'ArrowUp'
        ? order - 1
        : event.code === 'ArrowDown'
          ? order + 1
          : event.code === 'Home'
            ? 0
            : event.code === 'End'
              ? count - 1
              : null;
    if (destination !== null) {
      event.preventDefault();
      reorderLayer(layerId, destination);
    }
  }

  return (
    <div
      className="drag-handle"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('application/x-layer-id', layerId);
        event.dataTransfer.effectAllowed = 'move';
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      role="group"
      aria-label={`Reorder ${layerLabel}, currently position ${order + 1} of ${count}`}
      title="Drag to reorder or use the move buttons"
    >
      <button
        className="layer-order-btn"
        type="button"
        onClick={() => reorderLayer(layerId, order - 1)}
        onKeyDown={handleKeyDown}
        disabled={order === 0}
        aria-label={`Move ${layerLabel} up`}
        title="Move layer up"
      >
        <span aria-hidden="true">↑</span>
      </button>
      <button
        className="layer-order-btn"
        type="button"
        onClick={() => reorderLayer(layerId, order + 1)}
        onKeyDown={handleKeyDown}
        disabled={order === count - 1}
        aria-label={`Move ${layerLabel} down`}
        title="Move layer down"
      >
        <span aria-hidden="true">↓</span>
      </button>
    </div>
  );
}

function formatDurationShort(seconds: number): string {
  if (seconds <= 0) {
    return '';
  }
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60);
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

export function LayerTrackRow({ layer }: LayerTrackRowProps) {
  const {
    loadLayer,
    removeLayer,
    reorderLayer,
    setLayerVolume,
    setLayerPan,
    setLayerMute,
    setLayerSolo,
    transport,
    mainTrack,
    layers,
  } = useAudioLabStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragInsert, setDragInsert] = useState<'before' | 'after' | null>(null);

  const currentTime = usePlaybackTime();
  const layerDuration = audioEngine.getLayerDuration(layer.id);
  const playhead = layerPlayhead(currentTime, layerDuration, transport.playing);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      loadLayer(layer.id, file);
    }
    e.target.value = '';
  }

  function handleDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('application/x-layer-id')) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      const rect = e.currentTarget.getBoundingClientRect();
      setDragInsert(e.clientY - rect.top < rect.height / 2 ? 'before' : 'after');
      return;
    }
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
      setDragInsert(null);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragInsert(null);

    const draggedId = e.dataTransfer.getData('application/x-layer-id');
    if (draggedId) {
      if (draggedId !== layer.id) {
        const rect = e.currentTarget.getBoundingClientRect();
        const insertBefore = e.clientY - rect.top < rect.height / 2;
        const sourceOrder = layers.find((candidate) => candidate.id === draggedId)?.order;
        if (sourceOrder !== undefined) {
          reorderLayer(draggedId, dropInsertionOrder(sourceOrder, layer.order, insertBefore));
        }
      }
      return;
    }

    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const audioFile = files.find(isAudioFile);
    if (audioFile) {
      loadLayer(layer.id, audioFile);
    }
  }

  const isLoading = layer.loadingState === 'loading';
  const isFailed = layer.loadingState === 'failed';
  const isPending = layer.loadingState === 'remembered';
  const isEmpty = layer.loadingState === 'empty';
  const isLastLayer = layers.length <= 1;

  const hasHealthIssues = layer.loopIssues && layer.loopIssues.length > 0;
  const healthTitle = layer.loopIssues?.map(loopHealthLabel).join('\n') ?? '';
  const healthSummary = healthTitle.split('\n').join(', ');

  const bpmRelation = layer.bpm && mainTrack.bpm ? getBpmRelation(layer.bpm, mainTrack.bpm) : null;

  const displayName = layer.metadata?.title || layer.name;
  const layerLabel = displayName
    ? `Layer ${layer.order + 1}: ${displayName}`
    : `Layer ${layer.order + 1}`;
  const artist = layer.metadata?.artist;
  const artistAlbum = [artist, layer.metadata?.album].filter(Boolean).join(' · ');

  function loadBtnContent(): string {
    if (isLoading) {
      return '…';
    }
    if (layer.buffer) {
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
      return 'Retry loading layer';
    }
    if (layer.buffer) {
      return 'Replace layer';
    }
    if (isPending) {
      return 'Reload layer';
    }
    return 'Load layer';
  }

  return (
    <div
      className={[
        'layer-row',
        isEmpty ? 'layer-row--empty' : '',
        isPending ? 'layer-row--pending' : '',
        isLoading ? 'layer-row--loading' : '',
        isFailed ? 'layer-row--failed' : '',
        layer.muted ? 'layer-row--muted' : '',
        layer.soloed ? 'layer-row--soloed' : '',
        isDragOver ? 'layer-row--drag-over' : '',
        isDragging ? 'layer-row--dragging' : '',
        dragInsert === 'before' ? 'layer-row--drag-insert-before' : '',
        dragInsert === 'after' ? 'layer-row--drag-insert-after' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="listitem"
      aria-label={layerLabel}
    >
      <LayerReorderControls
        layerId={layer.id}
        layerLabel={layerLabel}
        order={layer.order}
        count={layers.length}
        reorderLayer={reorderLayer}
        setDragging={setIsDragging}
      />

      <Thumbnail url={layer.thumbnailUrl} size={48} />

      <div className="layer-info">
        <div className="layer-name-row">
          <div className="layer-name-left">
            {isLoading ? (
              <span className="track-name track-name--layer track-name--loading">Loading…</span>
            ) : isFailed ? (
              <span className="track-name track-name--layer track-name--failed">
                Decode failed — click ↻ to retry
              </span>
            ) : displayName ? (
              <>
                {isPending && (
                  <span className="reload-badge reload-badge--sm" aria-hidden="true">
                    ↻
                  </span>
                )}
                <span
                  className={`track-name track-name--layer${isPending ? ' track-name--pending' : ''}`}
                >
                  {displayName}
                </span>
                {artistAlbum && <span className="layer-metadata-inline">{artistAlbum}</span>}
                {hasHealthIssues && (
                  <span className="loop-health-warn" title={healthSummary}>
                    <span aria-hidden="true">⚠</span> Loop: {healthSummary}
                  </span>
                )}
              </>
            ) : (
              <span className="track-name track-name--empty track-name--drop">
                drop audio here or click +
              </span>
            )}
          </div>
          {layerDuration > 0 && (
            <span className="layer-duration">{formatDurationShort(layerDuration)}</span>
          )}
          <BpmBadge
            bpm={layer.bpm}
            confidence={layer.bpmConfidence}
            analyzing={layer.bpmAnalyzing}
            relation={bpmRelation}
          />
        </div>
        <WaveformDisplay
          buffer={layer.buffer}
          height={32}
          color="#B0A0E8"
          playhead={playhead}
          duration={layerDuration}
          accessibleLabel={`${layerLabel} seek position`}
        />
      </div>

      <div className="layer-controls">
        <Slider
          label="VOL"
          value={layer.volume}
          onChange={(v) => setLayerVolume(layer.id, v)}
          unit="dB"
          className="layer-slider"
          accessibleLabel={`${layerLabel} volume (VOL)`}
        />
        <Knob
          label="PAN"
          value={layer.pan}
          onChange={(v) => setLayerPan(layer.id, v)}
          accessibleLabel={`${layerLabel} pan`}
        />
      </div>

      <div className="layer-state-controls">
        <ToggleButton
          label="M"
          active={layer.muted}
          onClick={() => setLayerMute(layer.id, !layer.muted)}
          variant="mute"
          title={layer.muted ? 'Unmute layer' : 'Mute layer'}
          ariaLabel={`${layer.muted ? 'Unmute' : 'Mute'} ${layerLabel} (M)`}
        />
        <ToggleButton
          label="S"
          active={layer.soloed}
          onClick={() => setLayerSolo(layer.id, !layer.soloed)}
          variant="solo"
          title={layer.soloed ? 'Unsolo layer' : 'Solo layer'}
          ariaLabel={`${layer.soloed ? 'Unsolo' : 'Solo'} ${layerLabel} (S)`}
        />
      </div>

      <div className="layer-action-controls">
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
          aria-label={`${loadBtnTitle()}: ${layerLabel}`}
          disabled={isLoading}
        >
          {loadBtnContent()}
        </button>
        <button
          className="remove-btn"
          onClick={() => removeLayer(layer.id)}
          type="button"
          title="Remove layer"
          aria-label={`Remove ${layerLabel}`}
          aria-hidden={isLastLayer ? 'true' : undefined}
          tabIndex={isLastLayer ? -1 : undefined}
          style={isLastLayer ? { visibility: 'hidden' } : undefined}
        >
          ✕
        </button>
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
