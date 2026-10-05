import { FADE_IN_S } from './fades';
import { smoothLoopBufferInPlace } from './loopSmooth';
import { computeRMS, rmsToNormalized } from './meters';

interface PlaybackNode {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  panNode: StereoPannerNode;
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export class AudioEngine {
  private context: AudioContext;
  private masterGainNode: GainNode;
  private playbackFadeGain: GainNode;
  private startedAt = 0;
  private pausedAt = 0;
  private isPlaying = false;

  private mainNode: PlaybackNode | null = null;
  private layerNodes: Map<string, PlaybackNode> = new Map();

  private mainBuffer: AudioBuffer | null = null;
  private layerBuffers: Map<string, AudioBuffer> = new Map();

  private mainLoop = false;
  private mainVolume = 1;
  private mainPan = 0;

  private masterVolume = 0.8;
  private masterMuted = false;

  private layerVolumes: Map<string, number> = new Map();
  private layerPans: Map<string, number> = new Map();
  private layerMutes: Map<string, boolean> = new Map();
  private layerSolos: Map<string, boolean> = new Map();
  private layerEffectiveGains: Map<string, GainNode> = new Map();

  private channelSplitter: ChannelSplitterNode;
  private analyserL: AnalyserNode;
  private analyserR: AnalyserNode;
  private meterBufferL: Float32Array<ArrayBuffer>;
  private meterBufferR: Float32Array<ArrayBuffer>;

  // Generation token: increments on every play() to guard onended from stale closures
  private playGeneration = 0;
  private mainEndedCallback: (() => void) | null = null;

  constructor(context: AudioContext = new AudioContext()) {
    this.context = context;
    this.masterGainNode = this.context.createGain();
    this.masterGainNode.gain.value = this.masterVolume;
    this.masterGainNode.connect(this.context.destination);
    this.playbackFadeGain = this.context.createGain();
    this.playbackFadeGain.gain.value = 1;
    this.playbackFadeGain.connect(this.masterGainNode);

    // Stereo metering tap — passive, does not alter the signal path
    this.channelSplitter = this.context.createChannelSplitter(2);
    this.analyserL = this.context.createAnalyser();
    this.analyserL.fftSize = 256;
    this.analyserL.smoothingTimeConstant = 0;
    this.analyserR = this.context.createAnalyser();
    this.analyserR.fftSize = 256;
    this.analyserR.smoothingTimeConstant = 0;
    this.masterGainNode.connect(this.channelSplitter);
    this.channelSplitter.connect(this.analyserL, 0);
    this.channelSplitter.connect(this.analyserR, 1);
    this.meterBufferL = new Float32Array(this.analyserL.fftSize);
    this.meterBufferR = new Float32Array(this.analyserR.fftSize);
  }

  get audioContext(): AudioContext {
    return this.context;
  }

  async resumeContext(): Promise<void> {
    // 'interrupted' is an iOS Safari extension to the spec — treat it like suspended.
    const state = this.context.state as string;
    if (state === 'suspended' || state === 'interrupted') {
      await this.context.resume();
    }
  }

  async decodeFile(file: File): Promise<AudioBuffer> {
    const arrayBuffer = await file.arrayBuffer();
    return this.context.decodeAudioData(arrayBuffer);
  }

  setMainEndedHandler(cb: () => void): void {
    this.mainEndedCallback = cb;
  }

  setMasterVolume(vol: number): void {
    this.masterVolume = clamp(vol, 0, 1, this.masterVolume);
    if (!this.masterMuted) {
      this.masterGainNode.gain.setTargetAtTime(this.masterVolume, this.context.currentTime, 0.01);
    }
  }

  setMasterMute(muted: boolean): void {
    this.masterMuted = muted;
    const targetGain = muted ? 0 : this.masterVolume;
    this.masterGainNode.gain.setTargetAtTime(targetGain, this.context.currentTime, 0.01);
  }

  setMainBuffer(buffer: AudioBuffer): void {
    this.mainBuffer = buffer;
    if (this.isPlaying) {
      this.playGeneration += 1;
      this.stopMainNode();
      this.createMainNode(this.currentTime, this.playGeneration);
    }
  }

  clearMainBuffer(): void {
    this.mainBuffer = null;
    this.stopMainNode();
    if (this.layerBuffers.size === 0) {
      this.stop();
    }
  }

  setMainVolume(vol: number): void {
    this.mainVolume = clamp(vol, 0, 1, this.mainVolume);
    if (this.mainNode) {
      this.mainNode.gainNode.gain.setTargetAtTime(this.mainVolume, this.context.currentTime, 0.01);
    }
  }

  setMainLoop(loop: boolean): void {
    this.mainLoop = loop;
    if (this.mainNode) {
      this.mainNode.source.loop = loop;
    }
  }

  setMainPan(pan: number): void {
    this.mainPan = clamp(pan, -1, 1, this.mainPan);
    if (this.mainNode) {
      this.mainNode.panNode.pan.setTargetAtTime(this.mainPan, this.context.currentTime, 0.01);
    }
  }

  getMainDuration(): number {
    return this.mainBuffer?.duration ?? 0;
  }

  getStereoLevels(): { left: number; right: number } {
    this.analyserL.getFloatTimeDomainData(this.meterBufferL);
    this.analyserR.getFloatTimeDomainData(this.meterBufferR);
    return {
      left: rmsToNormalized(computeRMS(this.meterBufferL)),
      right: rmsToNormalized(computeRMS(this.meterBufferR)),
    };
  }

  getLayerDuration(layerId: string): number {
    return this.layerBuffers.get(layerId)?.duration ?? 0;
  }

  setLayerBuffer(layerId: string, buffer: AudioBuffer): void {
    // The store and engine intentionally share this prepared buffer. Keeping a second full-size
    // smoothed copy would silently double the session's steady-state audio memory.
    this.layerBuffers.set(layerId, smoothLoopBufferInPlace(buffer));
    if (this.isPlaying) {
      this.stopLayerNode(layerId);
      this.createLayerNode(layerId, this.currentTime);
      this.applyAllLayerEffectiveGains();
    }
  }

  setLayerVolume(layerId: string, vol: number): void {
    const current = this.layerVolumes.get(layerId) ?? 1;
    this.layerVolumes.set(layerId, clamp(vol, 0, 1, current));
    this.applyLayerEffectiveGain(layerId);
  }

  setLayerPan(layerId: string, pan: number): void {
    const safePan = clamp(pan, -1, 1, this.layerPans.get(layerId) ?? 0);
    this.layerPans.set(layerId, safePan);
    const node = this.layerNodes.get(layerId);
    if (node) {
      node.panNode.pan.setTargetAtTime(safePan, this.context.currentTime, 0.01);
    }
  }

  setLayerMute(layerId: string, muted: boolean): void {
    this.layerMutes.set(layerId, muted);
    this.applyAllLayerEffectiveGains();
  }

  setLayerSolo(layerId: string, soloed: boolean): void {
    this.layerSolos.set(layerId, soloed);
    this.applyAllLayerEffectiveGains();
  }

  private anySoloed(): boolean {
    for (const [layerId, s] of this.layerSolos.entries()) {
      if (s && this.layerBuffers.has(layerId)) {
        return true;
      }
    }
    return false;
  }

  private resolveLayerGain(layerId: string): number {
    const muted = this.layerMutes.get(layerId) ?? false;
    const soloed = this.layerSolos.get(layerId) ?? false;
    const volume = this.layerVolumes.get(layerId) ?? 1;
    if (muted) {
      return 0;
    }
    if (this.anySoloed() && !soloed) {
      return 0;
    }
    return volume;
  }

  private applyLayerEffectiveGain(layerId: string): void {
    const gainNode = this.layerEffectiveGains.get(layerId);
    if (gainNode) {
      gainNode.gain.setTargetAtTime(this.resolveLayerGain(layerId), this.context.currentTime, 0.01);
    }
  }

  private applyAllLayerEffectiveGains(): void {
    for (const layerId of this.layerEffectiveGains.keys()) {
      this.applyLayerEffectiveGain(layerId);
    }
  }

  private handleMainEnded(): void {
    this.mainNode = null;
    for (const node of this.layerNodes.values()) {
      try {
        node.source.stop();
      } catch {
        /* already stopped */
      }
    }
    this.layerNodes.clear();
    this.layerEffectiveGains.clear();
    this.pausedAt = 0;
    this.startedAt = 0;
    this.isPlaying = false;
    this.mainEndedCallback?.();
  }

  private createMainNode(offset: number, gen: number): void {
    if (!this.mainBuffer) {
      return;
    }

    const source = this.context.createBufferSource();
    source.buffer = this.mainBuffer;
    source.loop = this.mainLoop;

    const gainNode = this.context.createGain();
    gainNode.gain.value = this.mainVolume;

    const panNode = this.context.createStereoPanner();
    panNode.pan.value = this.mainPan;

    source.connect(gainNode);
    gainNode.connect(panNode);
    panNode.connect(this.playbackFadeGain);

    this.mainNode = { source, gainNode, panNode };

    source.onended = () => {
      if (this.playGeneration === gen && this.isPlaying) {
        this.handleMainEnded();
      }
    };

    const duration = this.mainBuffer.duration;
    const startOffset = this.mainLoop && duration > 0 ? offset % duration : offset;
    source.start(0, startOffset);
  }

  private createLayerNode(layerId: string, offset: number): void {
    const buffer = this.layerBuffers.get(layerId);
    if (!buffer) {
      return;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const effectiveGain = this.context.createGain();
    effectiveGain.gain.value = this.resolveLayerGain(layerId);
    this.layerEffectiveGains.set(layerId, effectiveGain);

    const gainNode = this.context.createGain();
    gainNode.gain.value = 1;

    const panNode = this.context.createStereoPanner();
    panNode.pan.value = this.layerPans.get(layerId) ?? 0;

    source.connect(effectiveGain);
    effectiveGain.connect(gainNode);
    gainNode.connect(panNode);
    panNode.connect(this.playbackFadeGain);

    this.layerNodes.set(layerId, { source, gainNode, panNode });

    const loopDuration = buffer.duration;
    const loopedOffset = loopDuration > 0 ? offset % loopDuration : 0;
    source.start(0, loopedOffset);
  }

  play(): boolean {
    if (this.isPlaying) {
      return true;
    }
    if (!this.mainBuffer && this.layerBuffers.size === 0) {
      return false;
    }

    const offset = this.pausedAt;
    this.playGeneration++;
    const gen = this.playGeneration;

    const now = this.context.currentTime;
    this.playbackFadeGain.gain.cancelScheduledValues(now);
    this.playbackFadeGain.gain.setValueAtTime(0, now);
    this.playbackFadeGain.gain.linearRampToValueAtTime(1, now + FADE_IN_S);

    this.createMainNode(offset, gen);

    for (const layerId of this.layerBuffers.keys()) {
      this.createLayerNode(layerId, offset);
    }

    this.startedAt = this.context.currentTime - offset;
    this.pausedAt = 0;
    this.isPlaying = true;
    return true;
  }

  pause(): void {
    if (!this.isPlaying) {
      return;
    }
    this.pausedAt = this.context.currentTime - this.startedAt;
    this.stopAllNodes();
    this.isPlaying = false;
  }

  stop(): void {
    this.stopAllNodes();
    this.pausedAt = 0;
    this.startedAt = 0;
    this.isPlaying = false;
  }

  seek(seconds: number): void {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) {
      this.stopAllNodes();
      this.isPlaying = false;
    }
    const duration = this.getMainDuration();
    const maximum = duration > 0 && !this.mainLoop ? duration : Number.MAX_SAFE_INTEGER;
    this.pausedAt = clamp(seconds, 0, maximum, 0);
    if (wasPlaying) {
      this.play();
    }
  }

  private stopAllNodes(): void {
    this.stopMainNode();
    for (const layerId of [...this.layerNodes.keys()]) {
      this.stopLayerNode(layerId);
    }
  }

  private stopMainNode(): void {
    if (!this.mainNode) {
      return;
    }
    this.mainNode.source.onended = null;
    try {
      this.mainNode.source.stop();
    } catch {
      /* already stopped */
    }
    this.mainNode = null;
  }

  private stopLayerNode(layerId: string): void {
    const node = this.layerNodes.get(layerId);
    if (node) {
      try {
        node.source.stop();
      } catch {
        /* already stopped */
      }
    }
    this.layerNodes.delete(layerId);
    this.layerEffectiveGains.delete(layerId);
  }

  get currentTime(): number {
    if (!this.isPlaying) {
      return this.pausedAt;
    }
    return this.context.currentTime - this.startedAt;
  }

  get playing(): boolean {
    return this.isPlaying;
  }

  removeLayerBuffer(layerId: string): void {
    this.layerBuffers.delete(layerId);
    this.layerVolumes.delete(layerId);
    this.layerPans.delete(layerId);
    this.layerMutes.delete(layerId);
    this.layerSolos.delete(layerId);
    this.stopLayerNode(layerId);
    if (!this.mainBuffer && this.layerBuffers.size === 0) {
      this.stop();
      return;
    }
    this.applyAllLayerEffectiveGains();
  }
}

export const audioEngine = new AudioEngine();
