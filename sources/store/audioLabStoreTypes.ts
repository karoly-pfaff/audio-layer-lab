import type { StoreApi } from 'zustand';
import type { LayerState, MainTrackState, TransportState } from '../audio/types';
import type { ABSlots, MixSnapshot } from './snapshots';

export interface AudioLabState {
  mainTrack: MainTrackState;
  layers: LayerState[];
  transport: TransportState;
  snapshots: MixSnapshot[];
  ab: ABSlots;
  statusMessage: string | null;

  loadMainTrack: (file: File) => Promise<void>;
  clearMainTrack: () => void;
  setMainVolume: (volume: number) => void;
  setMainPan: (pan: number) => void;
  setMainLoop: (loop: boolean) => void;
  addLayer: () => void;
  loadLayer: (layerId: string, file: File) => Promise<void>;
  removeLayer: (layerId: string) => void;
  reorderLayer: (layerId: string, targetOrder: number) => void;
  setLayerVolume: (layerId: string, volume: number) => void;
  setLayerPan: (layerId: string, pan: number) => void;
  setLayerMute: (layerId: string, muted: boolean) => void;
  setLayerSolo: (layerId: string, soloed: boolean) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seekTo: (seconds: number) => void;
  seekToStart: () => void;
  jumpBack: (seconds?: number) => void;
  jumpForward: (seconds?: number) => void;
  setMasterVolume: (volume: number) => void;
  toggleMasterMute: () => void;
  dropLayerFiles: (files: File[]) => void;
  resetSession: () => void;
  exportPreset: () => void;
  importPreset: (file: File) => Promise<void>;
  saveSnapshot: (name?: string) => void;
  applySnapshot: (id: string) => void;
  renameSnapshot: (id: string, name: string) => void;
  duplicateSnapshot: (id: string) => void;
  deleteSnapshot: (id: string) => void;
  assignAB: (slot: 'a' | 'b') => void;
  applyAB: (slot: 'a' | 'b') => void;
  dismissStatus: () => void;
  canPlay: () => boolean;
}

export type AudioLabSet = StoreApi<AudioLabState>['setState'];
export type AudioLabGet = StoreApi<AudioLabState>['getState'];

export type TrackActions = Pick<
  AudioLabState,
  | 'loadMainTrack'
  | 'clearMainTrack'
  | 'setMainVolume'
  | 'setMainPan'
  | 'setMainLoop'
  | 'addLayer'
  | 'loadLayer'
  | 'removeLayer'
  | 'reorderLayer'
  | 'setLayerVolume'
  | 'setLayerPan'
  | 'setLayerMute'
  | 'setLayerSolo'
  | 'dropLayerFiles'
>;

export type TransportActions = Pick<
  AudioLabState,
  | 'play'
  | 'pause'
  | 'stop'
  | 'seekTo'
  | 'seekToStart'
  | 'jumpBack'
  | 'jumpForward'
  | 'setMasterVolume'
  | 'toggleMasterMute'
  | 'canPlay'
>;

export type SessionActions = Pick<AudioLabState, 'resetSession' | 'exportPreset' | 'importPreset'>;
export type SnapshotActions = Pick<
  AudioLabState,
  | 'saveSnapshot'
  | 'applySnapshot'
  | 'renameSnapshot'
  | 'duplicateSnapshot'
  | 'deleteSnapshot'
  | 'assignAB'
  | 'applyAB'
>;
