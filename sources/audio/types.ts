type TrackLoadingState = 'empty' | 'remembered' | 'loading' | 'loaded' | 'failed';

export type LoopHealthIssue = 'tooShort' | 'leadingSilence' | 'trailingSilence' | 'loudBoundary';

export type BpmConfidence = 'low' | 'medium' | 'high';

export interface TrackMetadata {
  title: string | null;
  artist: string | null;
  album: string | null;
}

interface TrackState {
  id: string;
  assetId?: string | null;
  name: string;
  buffer: AudioBuffer | null;
  volume: number;
  muted: boolean;
  loop: boolean;
  thumbnailUrl: string | null;
  loadingState: TrackLoadingState;
  metadata: TrackMetadata | null;
  bpm?: number | null;
  bpmConfidence?: BpmConfidence | null;
  bpmAnalyzing?: boolean;
}

export interface LayerState extends TrackState {
  pan: number;
  soloed: boolean;
  order: number;
  loopIssues?: LoopHealthIssue[] | null;
}

export interface MainTrackState extends TrackState {
  loop: boolean;
  pan: number;
}

export interface TransportState {
  playing: boolean;
  masterVolume: number;
  masterMuted: boolean;
  positionRevision: number;
}

export function parseBpmConfidence(raw: unknown): BpmConfidence | null {
  if (raw === 'low' || raw === 'medium' || raw === 'high') {
    return raw;
  }
  return null;
}
