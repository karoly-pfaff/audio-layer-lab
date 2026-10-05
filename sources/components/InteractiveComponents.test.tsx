import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioLabState } from '../store/audioLabStoreTypes';
import type { LayerState, MainTrackState } from '../audio/types';
import type { MixSnapshot } from '../store/snapshots';
import { MAX_LAYER_COUNT } from '../store/persistence';

const store = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
const restoreOwnedSessionAudio = vi.hoisted(() => vi.fn());
const suspendOwnedSessionAudio = vi.hoisted(() => vi.fn());
const ownership = vi.hoisted(() => ({
  epoch: 0,
  status: 'owner' as 'owner' | 'blocked' | 'unavailable',
}));
const takeOverSession = vi.hoisted(() => vi.fn());
const engine = vi.hoisted(() => ({
  currentTime: 0,
  getLayerDuration: vi.fn(() => 0),
  getMainDuration: vi.fn(() => 0),
  getStereoLevels: vi.fn(() => ({ left: 0, right: 0 })),
}));

vi.mock('../store/useAudioLabStore', () => ({
  useAudioLabStore: (selector?: (state: Record<string, unknown>) => unknown) =>
    selector ? selector(store.state) : store.state,
  restoreOwnedSessionAudio,
  suspendOwnedSessionAudio,
}));
vi.mock('../audio/AudioEngine', () => ({ audioEngine: engine }));
vi.mock('../store/sessionOwnership', () => ({
  useSessionOwnership: () => ownership.status,
  useSessionOwnershipEpoch: () => ownership.epoch,
  currentSessionOwnershipFence: () => (ownership.status === 'owner' ? 'test-fence' : null),
  takeOverSession,
}));

import { AppShell } from './AppShell';
import { BpmBadge } from './BpmBadge';
import { LayerTrackRow } from './LayerTrackRow';
import { MainTrackPanel } from './MainTrackPanel';
import { PlaybackBar } from './PlaybackBar';
import { PresetControls } from './PresetControls';
import { SnapshotPanel } from './SnapshotPanel';
import { StereoMeter } from './StereoMeter';
import { Thumbnail } from './Thumbnail';

function audioBuffer(duration = 8): AudioBuffer {
  return {
    duration,
    length: duration * 44_100,
    numberOfChannels: 2,
    sampleRate: 44_100,
    getChannelData: () => new Float32Array([0, 0.5, -0.5, 0]),
  } as unknown as AudioBuffer;
}

function mainTrack(overrides: Partial<MainTrackState> = {}): MainTrackState {
  return {
    id: 'main',
    name: '',
    buffer: null,
    volume: 0.8,
    pan: 0,
    muted: false,
    loop: false,
    thumbnailUrl: null,
    loadingState: 'empty',
    metadata: null,
    ...overrides,
  };
}

function layer(overrides: Partial<LayerState> = {}): LayerState {
  return {
    id: 'layer-0',
    order: 0,
    name: '',
    buffer: null,
    volume: 1,
    pan: 0,
    muted: false,
    soloed: false,
    loop: true,
    thumbnailUrl: null,
    loadingState: 'empty',
    metadata: null,
    ...overrides,
  };
}

function snapshot(overrides: Partial<MixSnapshot> = {}): MixSnapshot {
  return {
    id: 'snapshot-1',
    name: 'My mix',
    createdAt: '2026-01-01T00:00:00.000Z',
    main: {
      volume: 0.8,
      pan: 0,
      loop: false,
      filename: null,
      thumbnailUrl: null,
      bpm: null,
      bpmConfidence: null,
    },
    masterVolume: 0.8,
    masterMuted: false,
    layers: [],
    ...overrides,
  };
}

function baseStore(): AudioLabState {
  const state = {
    mainTrack: mainTrack(),
    layers: [layer()],
    transport: { playing: false, masterVolume: 0.8, masterMuted: false },
    snapshots: [],
    ab: { a: null, b: null },
    statusMessage: null,
  } as unknown as AudioLabState;
  const methods: Array<keyof AudioLabState> = [
    'loadMainTrack',
    'clearMainTrack',
    'setMainVolume',
    'setMainPan',
    'setMainLoop',
    'addLayer',
    'loadLayer',
    'removeLayer',
    'reorderLayer',
    'setLayerVolume',
    'setLayerPan',
    'setLayerMute',
    'setLayerSolo',
    'play',
    'pause',
    'stop',
    'seekTo',
    'seekToStart',
    'jumpBack',
    'jumpForward',
    'setMasterVolume',
    'toggleMasterMute',
    'dropLayerFiles',
    'resetSession',
    'exportPreset',
    'importPreset',
    'saveSnapshot',
    'applySnapshot',
    'renameSnapshot',
    'duplicateSnapshot',
    'deleteSnapshot',
    'assignAB',
    'applyAB',
    'dismissStatus',
    'canPlay',
  ];
  for (const method of methods) {
    Object.assign(state, { [method]: vi.fn() });
  }
  state.canPlay = vi.fn(() => false);
  return state;
}

function canvasContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: vi.fn() };
  return {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    drawImage: vi.fn(),
    fill: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  vi.clearAllMocks();
  restoreOwnedSessionAudio.mockResolvedValue(true);
  store.state = baseStore() as unknown as Record<string, unknown>;
  ownership.epoch = 0;
  ownership.status = 'owner';
  engine.currentTime = 0;
  engine.getLayerDuration.mockReturnValue(0);
  engine.getMainDuration.mockReturnValue(0);
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext());
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('BpmBadge and Thumbnail states', () => {
  it('renders analyzing, confidence, mismatch, half/double, and empty BPM states', () => {
    const { rerender } = render(<BpmBadge analyzing />);
    expect(screen.getByRole('status')).toHaveTextContent('Analyzing BPM');
    rerender(<BpmBadge bpm={120} confidence="low" relation="mismatch" />);
    expect(screen.getByText(/mismatch/)).toBeInTheDocument();
    rerender(<BpmBadge bpm={60} confidence="high" relation="halfDouble" />);
    expect(screen.getByText(/half\/double/)).toBeInTheDocument();
    rerender(<BpmBadge bpm={128} confidence="high" relation="compatible" />);
    expect(screen.getByText('128 BPM')).toBeInTheDocument();
    rerender(<BpmBadge bpm={null} />);
    expect(screen.queryByText(/BPM/)).toBeNull();
  });

  it('shows decorative artwork loading, success, error, and placeholder states', () => {
    const { rerender } = render(<Thumbnail url={null} />);
    expect(document.querySelector('.thumbnail-placeholder')).toBeInTheDocument();
    rerender(<Thumbnail url="https://example.test/art.jpg" />);
    const image = screen.getByRole('presentation');
    expect(document.querySelector('.thumbnail-skeleton')).toBeInTheDocument();
    fireEvent.load(image);
    expect(image).toHaveClass('thumbnail-img--loaded');
    fireEvent.error(image);
    expect(document.querySelector('.thumbnail-placeholder')).toBeInTheDocument();
    rerender(<Thumbnail url="https://example.test/recovered.jpg" />);
    expect(screen.getByRole('presentation')).toHaveAttribute(
      'src',
      'https://example.test/recovered.jpg',
    );
  });
});

describe('StereoMeter', () => {
  it('animates attack and decay levels and stops safely after unmount', () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callbacks.push(callback);
        return callbacks.length;
      }),
    );
    const state = store.state as unknown as AudioLabState;
    state.transport.playing = true;
    engine.getStereoLevels.mockReturnValueOnce({ left: 0.8, right: 0.4 });
    const { container, unmount } = render(<StereoMeter />);
    const bars = container.querySelectorAll<HTMLElement>('.stereo-meter-bar');

    act(() => callbacks.shift()?.(0));
    expect(Number.parseFloat(bars[0]!.style.width)).toBeGreaterThan(0);
    expect(Number.parseFloat(bars[1]!.style.width)).toBeGreaterThan(0);
    expect(callbacks).toHaveLength(1);

    engine.getStereoLevels.mockReturnValueOnce({ left: 0, right: 0 });
    act(() => callbacks.shift()?.(16));
    expect(Number.parseFloat(bars[0]!.style.width)).toBeGreaterThan(0);
    expect(callbacks).toHaveLength(1);

    const pending = callbacks.shift();
    unmount();
    act(() => pending?.(32));
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('does not schedule another frame once idle at silence', () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callbacks.push(callback);
        return callbacks.length;
      }),
    );
    engine.getStereoLevels.mockReturnValueOnce({ left: 0, right: 0 });
    render(<StereoMeter />);
    act(() => callbacks.shift()?.(0));
    expect(callbacks).toHaveLength(0);
  });
});

describe('PresetControls', () => {
  it('imports selected files and runs export and reset actions', () => {
    const state = store.state as unknown as AudioLabState;
    render(<PresetControls />);
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Import preset' }));
    expect(click).toHaveBeenCalledTimes(1);
    const file = new File(['{}'], 'mix.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(state.importPreset).toHaveBeenCalledWith(file);
    fireEvent.change(input, { target: { files: [] } });
    fireEvent.click(screen.getByRole('button', { name: 'Export preset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset session' }));
    expect(state.exportPreset).toHaveBeenCalledTimes(1);
    expect(state.resetSession).toHaveBeenCalledTimes(1);
  });

  it('leaves the current session untouched when destructive actions are cancelled', () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const state = store.state as unknown as AudioLabState;
    render(<PresetControls />);
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['{}'], 'mix.json', { type: 'application/json' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset session' }));
    expect(state.importPreset).not.toHaveBeenCalled();
    expect(state.resetSession).not.toHaveBeenCalled();
  });
});

describe('SnapshotPanel', () => {
  it('operates the snapshot and A/B toolbar', () => {
    const state = store.state as unknown as AudioLabState;
    render(<SnapshotPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Save current mix as a snapshot' }));
    fireEvent.click(screen.getByRole('button', { name: /comparison slot A/ }));
    fireEvent.click(screen.getByRole('button', { name: /comparison slot B/ }));
    expect(state.saveSnapshot).toHaveBeenCalledTimes(1);
    expect(state.assignAB).toHaveBeenCalledWith('a');
    expect(screen.getByRole('button', { name: 'Apply comparison mix A' })).toBeDisabled();
  });

  it('applies, edits, duplicates, deletes, and compares saved snapshots', () => {
    const state = store.state as unknown as AudioLabState;
    const saved = snapshot();
    state.snapshots = [saved];
    state.ab = { a: saved, b: saved };
    render(<SnapshotPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply comparison mix A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply comparison mix B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply snapshot My mix' }));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate snapshot My mix' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete snapshot My mix' }));
    expect(state.applyAB).toHaveBeenCalledTimes(2);
    expect(state.applySnapshot).toHaveBeenCalledWith(saved.id);

    fireEvent.doubleClick(screen.getByText('My mix'));
    const input = screen.getByRole('textbox', { name: 'Rename snapshot My mix' });
    fireEvent.change(input, { target: { value: 'New name' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(state.renameSnapshot).toHaveBeenCalledWith(saved.id, 'New name');
  });

  it('cancels rename with Escape and commits it on blur', () => {
    const state = store.state as unknown as AudioLabState;
    state.snapshots = [snapshot()];
    const { rerender } = render(<SnapshotPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename snapshot My mix' }));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Rename snapshot My mix' }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Blurred' } });
    fireEvent.blur(input);
    expect(state.renameSnapshot).toHaveBeenCalledWith('snapshot-1', 'Blurred');
    rerender(<SnapshotPanel />);
  });
});

describe('MainTrackPanel', () => {
  it('loads empty tracks via picker and drag-and-drop', () => {
    const state = store.state as unknown as AudioLabState;
    const { container } = render(<MainTrackPanel />);
    const panel = screen.getByRole('group', { name: 'Main track controls' });
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Load main track' }));
    expect(click).toHaveBeenCalledTimes(1);
    const file = new File(['audio'], 'main.wav', { type: 'audio/wav' });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.dragOver(panel, { dataTransfer: { types: ['Files'], dropEffect: '' } });
    expect(screen.getByText('Drop to load main track')).toBeInTheDocument();
    fireEvent.drop(panel, { dataTransfer: { files: [file] } });
    expect(state.loadMainTrack).toHaveBeenCalledTimes(2);
    fireEvent.dragLeave(panel, { relatedTarget: document.body });
  });

  it('renders loaded metadata and operates seek, loop, mix, replace, and clear controls', () => {
    const state = store.state as unknown as AudioLabState;
    state.mainTrack = mainTrack({
      name: 'main.wav',
      buffer: audioBuffer(65),
      loadingState: 'loaded',
      metadata: { title: 'Theme', artist: 'Artist', album: 'Album' },
      bpm: 120,
      bpmConfidence: 'high',
    });
    engine.getMainDuration.mockReturnValue(65);
    render(<MainTrackPanel />);
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByText('44.1 kHz')).toBeInTheDocument();
    expect(screen.getByText('STEREO')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enable main track loop' }));
    fireEvent.change(screen.getByRole('slider', { name: /volume/ }), { target: { value: '0.5' } });
    fireEvent.keyDown(screen.getByRole('slider', { name: /pan/ }), { key: 'ArrowRight' });
    const waveform = screen.getByRole('slider', { name: /seek position/ });
    waveform.setPointerCapture = vi.fn();
    Object.defineProperty(waveform, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 100 }),
    });
    fireEvent.pointerDown(waveform, { clientX: 50, pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Replace main track' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear main track' }));
    expect(state.setMainLoop).toHaveBeenCalledWith(true);
    expect(state.setMainVolume).toHaveBeenCalledWith(0.5);
    expect(state.setMainPan).toHaveBeenCalled();
    expect(state.clearMainTrack).toHaveBeenCalledTimes(1);
  });

  it('keeps the looped waveform and keyboard seek aligned with the audible phase', () => {
    const state = store.state as unknown as AudioLabState;
    state.mainTrack = mainTrack({
      name: 'loop.wav',
      buffer: audioBuffer(10),
      loadingState: 'loaded',
      loop: true,
    });
    engine.currentTime = 12;
    engine.getMainDuration.mockReturnValue(10);
    render(<MainTrackPanel />);

    const waveform = screen.getByRole('slider', { name: /seek position/ });
    expect(waveform).toHaveAttribute('aria-valuenow', '20');
    fireEvent.keyDown(waveform, { key: 'ArrowLeft' });
    expect(state.seekTo).toHaveBeenCalledWith(expect.closeTo(1.9));
  });

  it.each([
    ['loading', 'Loading…', 'Loading…'],
    ['failed', 'Failed to decode', 'Retry loading main track'],
    ['remembered', 'remembered.wav', 'Reload main track'],
  ] as const)('renders the %s state', (loadingState, expectedText, accessibleName) => {
    const state = store.state as unknown as AudioLabState;
    state.mainTrack = mainTrack({ name: 'remembered.wav', loadingState });
    render(<MainTrackPanel />);
    expect(screen.getByText(new RegExp(expectedText))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: accessibleName })).toBeInTheDocument();
  });
});

describe('LayerTrackRow', () => {
  it('operates reorder, load, mix, state, remove, and file-drop controls', () => {
    const state = store.state as unknown as AudioLabState;
    state.layers = [layer(), layer({ id: 'layer-1', order: 1 })];
    const { container } = render(<LayerTrackRow layer={state.layers[0]!} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move Layer 1 down' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Move Layer 1 down' }), { code: 'End' });
    fireEvent.change(screen.getByRole('slider', { name: /volume/ }), { target: { value: '0.4' } });
    fireEvent.keyDown(screen.getByRole('slider', { name: /pan/ }), { key: 'ArrowLeft' });
    fireEvent.click(screen.getByRole('button', { name: /Mute Layer 1/ }));
    fireEvent.click(screen.getByRole('button', { name: /Solo Layer 1/ }));
    fireEvent.click(screen.getByRole('button', { name: /Load layer/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Layer 1' }));
    const file = new File(['audio'], 'layer.wav', { type: 'audio/wav' });
    const row = screen.getByRole('listitem');
    fireEvent.dragOver(row, { dataTransfer: { types: ['Files'], dropEffect: '' } });
    fireEvent.drop(row, { dataTransfer: { files: [file], getData: () => '' } });
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(state.reorderLayer).toHaveBeenCalledTimes(2);
    expect(state.loadLayer).toHaveBeenCalledTimes(2);
    expect(state.removeLayer).toHaveBeenCalledWith('layer-0');
  });

  it('renders loaded metadata, duration, loop health, BPM relation, and active states', () => {
    const state = store.state as unknown as AudioLabState;
    state.mainTrack = mainTrack({ bpm: 120 });
    const loaded = layer({
      name: 'layer.wav',
      buffer: audioBuffer(),
      loadingState: 'loaded',
      metadata: { title: 'Drums', artist: 'Artist', album: 'Album' },
      loopIssues: ['tooShort', 'leadingSilence'],
      bpm: 90,
      bpmConfidence: 'medium',
      muted: true,
      soloed: true,
    });
    state.layers = [loaded, layer({ id: 'layer-1', order: 1 })];
    engine.getLayerDuration.mockReturnValue(65);
    render(<LayerTrackRow layer={loaded} />);
    expect(screen.getByText('Drums')).toBeInTheDocument();
    expect(screen.getByText('1:05')).toBeInTheDocument();
    expect(screen.getByText(/Loop:/)).toBeInTheDocument();
    expect(screen.getByText(/mismatch/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Unmute/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Unsolo/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it.each([
    ['loading', 'Loading…', 'Loading…'],
    ['failed', 'Decode failed', 'Retry loading layer'],
    ['remembered', 'remembered.wav', 'Reload layer'],
  ] as const)('renders the %s layer state', (loadingState, text, accessibleName) => {
    const state = store.state as unknown as AudioLabState;
    const current = layer({ name: 'remembered.wav', loadingState });
    state.layers = [current];
    render(<LayerTrackRow layer={current} />);
    expect(screen.getByText(new RegExp(text))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(accessibleName) })).toBeInTheDocument();
  });

  it('supports keyboard and pointer layer reordering', () => {
    const state = store.state as unknown as AudioLabState;
    const current = layer({ id: 'layer-1', order: 1, name: 'Middle' });
    state.layers = [
      layer({ id: 'layer-0', order: 0 }),
      current,
      layer({ id: 'layer-2', order: 2 }),
    ];
    render(<LayerTrackRow layer={current} />);
    const up = screen.getByRole('button', { name: 'Move Layer 2: Middle up' });
    fireEvent.click(up);
    fireEvent.keyDown(up, { code: 'ArrowUp' });
    fireEvent.keyDown(up, { code: 'ArrowDown' });
    fireEvent.keyDown(up, { code: 'Home' });
    fireEvent.keyDown(up, { code: 'KeyA' });
    expect(vi.mocked(state.reorderLayer).mock.calls.map(([, order]) => order)).toEqual([
      0, 0, 2, 0,
    ]);

    const handle = screen.getByRole('group', { name: /Reorder Layer 2: Middle/ });
    const setData = vi.fn();
    const transfer = { setData, effectAllowed: '' };
    fireEvent.dragStart(handle, { dataTransfer: transfer });
    expect(setData).toHaveBeenCalledWith('application/x-layer-id', 'layer-1');
    expect(screen.getByRole('listitem')).toHaveClass('layer-row--dragging');
    fireEvent.dragEnd(handle);
    expect(screen.getByRole('listitem')).not.toHaveClass('layer-row--dragging');
  });

  it('handles before, after, self, file, and non-audio drops', () => {
    const state = store.state as unknown as AudioLabState;
    const current = layer({ id: 'target', order: 1 });
    state.layers = [layer({ id: 'source', order: 0 }), current];
    const { container } = render(<LayerTrackRow layer={current} />);
    const row = screen.getByRole('listitem');
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      bottom: 100,
      height: 100,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: vi.fn(),
    });

    const layerTransfer = (id: string) => ({
      types: ['application/x-layer-id'],
      dropEffect: '',
      getData: vi.fn(() => id),
      files: [],
    });
    const dispatchDrag = (
      type: string,
      dataTransfer: ReturnType<typeof layerTransfer> | Record<string, unknown>,
      clientY = 0,
      relatedTarget: EventTarget | null = null,
    ) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientY,
        relatedTarget,
      });
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
      fireEvent(row, event);
    };
    dispatchDrag('dragover', layerTransfer('source'), 10);
    expect(row).toHaveClass('layer-row--drag-insert-before');
    dispatchDrag('drop', layerTransfer('source'), 10);
    dispatchDrag('dragover', layerTransfer('source'), 90);
    expect(row).toHaveClass('layer-row--drag-insert-after');
    dispatchDrag('drop', layerTransfer('source'), 90);
    dispatchDrag('drop', layerTransfer('target'), 10);
    expect(vi.mocked(state.reorderLayer).mock.calls.map(([, order]) => order)).toEqual([0, 1]);

    const nonAudio = new File(['text'], 'notes.txt', { type: 'text/plain' });
    dispatchDrag('drop', { types: ['Files'], getData: () => '', files: [nonAudio] });
    expect(state.loadLayer).not.toHaveBeenCalled();
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
  });

  it('keeps drag state while moving within the row and clears it when leaving', () => {
    const state = store.state as unknown as AudioLabState;
    const current = layer();
    state.layers = [current];
    const { container } = render(<LayerTrackRow layer={current} />);
    const row = screen.getByRole('listitem');
    const child = container.querySelector('.layer-info')!;
    const transfer = { types: ['Files'], dropEffect: '', getData: () => '', files: [] };
    const dispatchDrag = (type: string, relatedTarget: EventTarget | null = null) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        relatedTarget,
      });
      Object.defineProperty(event, 'dataTransfer', { value: transfer });
      fireEvent(row, event);
    };
    dispatchDrag('dragover');
    expect(row).toHaveClass('layer-row--drag-over');
    dispatchDrag('dragleave', child);
    expect(row).toHaveClass('layer-row--drag-over');
    dispatchDrag('dragleave', document.body);
    expect(row).not.toHaveClass('layer-row--drag-over');
  });
});

describe('shell and playback keyboard interactions', () => {
  it('blocks a second editing tab and offers an explicit takeover', () => {
    ownership.status = 'blocked';
    render(<AppShell />);
    expect(screen.getByRole('heading', { name: /open in another tab/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Take over editing' }));
    expect(takeOverSession).toHaveBeenCalledOnce();
    expect(restoreOwnedSessionAudio).not.toHaveBeenCalled();
    expect(suspendOwnedSessionAudio).toHaveBeenCalledOnce();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('keeps takeover controls locked until the fresh durable session is restored', async () => {
    ownership.status = 'blocked';
    let finishRestore!: (ready: boolean) => void;
    restoreOwnedSessionAudio.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        finishRestore = resolve;
      }),
    );
    const { rerender } = render(<AppShell />);

    ownership.status = 'owner';
    rerender(<AppShell />);
    expect(
      screen.getByRole('heading', { name: /Restoring the latest local session/ }),
    ).toBeVisible();
    expect(screen.queryByRole('list')).toBeNull();

    await act(async () => finishRestore(true));
    expect(screen.getByRole('list')).toBeVisible();
  });

  it('retries restoration after the same owner recovers an expired lease', async () => {
    ownership.status = 'blocked';
    let finishRestore!: (ready: boolean) => void;
    const restoration = new Promise<boolean>((resolve) => {
      finishRestore = resolve;
    });
    restoreOwnedSessionAudio.mockReturnValue(restoration);
    const { rerender } = render(<AppShell />);

    ownership.status = 'owner';
    rerender(<AppShell />);
    expect(restoreOwnedSessionAudio).toHaveBeenCalledTimes(1);

    ownership.epoch += 1;
    rerender(<AppShell />);
    expect(restoreOwnedSessionAudio).toHaveBeenCalledTimes(2);

    await act(async () => finishRestore(true));
    expect(screen.getByRole('list')).toBeVisible();
  });

  it('routes global shortcuts and layer-section drops', () => {
    const state = store.state as unknown as AudioLabState;
    render(<AppShell />);
    fireEvent.keyDown(window, { code: 'Space' });
    fireEvent.keyDown(window, { key: 'M' });
    fireEvent.keyDown(window, { code: 'Home' });
    fireEvent.keyDown(window, { code: 'ArrowLeft' });
    fireEvent.keyDown(window, { code: 'ArrowRight' });
    fireEvent.keyDown(window, { code: 'Escape' });
    expect(state.play).toHaveBeenCalledTimes(1);
    expect(state.toggleMasterMute).toHaveBeenCalledTimes(1);
    expect(state.seekToStart).toHaveBeenCalledTimes(1);
    expect(state.jumpBack).toHaveBeenCalledTimes(1);
    expect(state.jumpForward).toHaveBeenCalledTimes(1);
    expect(state.stop).toHaveBeenCalledTimes(1);
    const list = screen.getByRole('list');
    const file = new File(['audio'], 'drop.wav', { type: 'audio/wav' });
    fireEvent.dragOver(list, { dataTransfer: { types: ['Files'], dropEffect: '' } });
    fireEvent.drop(list, { dataTransfer: { files: [file], getData: () => '' } });
    expect(state.dropLayerFiles).toHaveBeenCalledWith([file]);
  });

  it('pauses when playing and keeps shortcuts away from interactive targets', () => {
    const state = store.state as unknown as AudioLabState;
    state.transport.playing = true;
    render(<AppShell />);
    fireEvent.keyDown(window, { code: 'Space' });
    expect(state.pause).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('slider', { name: /Master volume/ }), { code: 'Space' });
    expect(state.pause).toHaveBeenCalledTimes(1);
  });

  it('operates enabled playback buttons and master volume', () => {
    const state = store.state as unknown as AudioLabState;
    state.canPlay = vi.fn(() => true);
    render(<PlaybackBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Restart from beginning' }));
    fireEvent.click(screen.getByRole('button', { name: 'Jump back 5 seconds' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop playback' }));
    fireEvent.click(screen.getByRole('button', { name: 'Jump forward 5 seconds' }));
    fireEvent.change(screen.getByRole('slider', { name: /Master volume/ }), {
      target: { value: '0.6' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mute master output' }));
    expect(state.seekToStart).toHaveBeenCalledTimes(1);
    expect(state.jumpBack).toHaveBeenCalledTimes(1);
    expect(state.play).toHaveBeenCalledTimes(1);
    expect(state.stop).toHaveBeenCalledTimes(1);
    expect(state.jumpForward).toHaveBeenCalledTimes(1);
    expect(state.setMasterVolume).toHaveBeenCalledWith(0.6);
    expect(state.toggleMasterMute).toHaveBeenCalledTimes(1);
  });

  it('handles layer reorder drops at the list boundary without treating them as files', () => {
    const state = store.state as unknown as AudioLabState;
    render(<AppShell />);
    const list = screen.getByRole('list');
    const transfer = {
      types: ['application/x-layer-id'],
      dropEffect: '',
      getData: () => 'layer-0',
      files: [],
    };
    fireEvent.dragOver(list, { dataTransfer: transfer });
    fireEvent.drop(list, { dataTransfer: transfer });
    expect(state.dropLayerFiles).not.toHaveBeenCalled();
  });

  it('renders the empty state, adds layers, and enforces the maximum', () => {
    const state = store.state as unknown as AudioLabState;
    state.layers = [];
    const { rerender } = render(<AppShell />);
    expect(screen.getByText(/No layers/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Layer' }));
    expect(state.addLayer).toHaveBeenCalledOnce();

    state.layers = Array.from({ length: MAX_LAYER_COUNT }, (_, order) =>
      layer({ id: `layer-${order}`, order }),
    );
    rerender(<AppShell />);
    expect(screen.getByRole('button', { name: '+ Layer' })).toBeDisabled();
  });
});
