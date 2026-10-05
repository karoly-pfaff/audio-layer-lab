import type { BpmConfidence } from './types';
import BpmWorker from './bpm.worker?worker';

export type { BpmConfidence };

export type BpmRelation = 'compatible' | 'close' | 'halfDouble' | 'mismatch';

export interface BpmResult {
  bpm: number;
  confidence: BpmConfidence;
}

// Fold bpm into the [60, 120) octave for half/double comparison.
export function normalizeBpm(bpm: number): number {
  let n = bpm;
  while (n >= 120) {
    n /= 2;
  }
  while (n < 60) {
    n *= 2;
  }
  return n;
}

export function maybeHalfDoubleMatch(bpm1: number, bpm2: number): boolean {
  const first = normalizeBpm(bpm1);
  const second = normalizeBpm(bpm2);
  return (
    Math.min(
      Math.abs(first - second),
      Math.abs(first * 2 - second),
      Math.abs(second * 2 - first),
    ) <= 5
  );
}

export function getBpmRelation(bpm1: number, bpm2: number): BpmRelation {
  const diff = Math.abs(bpm1 - bpm2);
  if (diff <= 2) {
    return 'compatible';
  }
  if (diff <= 5) {
    return 'close';
  }
  if (maybeHalfDoubleMatch(bpm1, bpm2)) {
    return 'halfDouble';
  }
  return 'mismatch';
}

export function areBpmsCompatible(bpm1: number, bpm2: number): boolean {
  return getBpmRelation(bpm1, bpm2) !== 'mismatch';
}

export function formatBpm(
  bpm: number | null | undefined,
  confidence?: BpmConfidence | null,
): string {
  if (bpm === null || bpm === undefined) {
    return '';
  }
  const prefix = confidence === 'low' ? '~' : '';
  return `${prefix}${Math.round(bpm)} BPM`;
}

function confidenceFromValue(bpm: number): BpmConfidence {
  if (bpm >= 60 && bpm <= 160) {
    return 'high';
  }
  if (bpm >= 40 && bpm <= 220) {
    return 'medium';
  }
  return 'low';
}

interface BpmWorkerResponse {
  bpm: number | null;
}

interface BpmTask {
  samples: Float32Array;
  sampleRate: number;
  signal?: AbortSignal;
  resolve: (result: BpmResult | null) => void;
}

const MAX_PENDING_ANALYSES = 4;
const MIX_CHUNK_SIZE = 262_144;
const taskQueue: BpmTask[] = [];
let activeTask: { task: BpmTask; worker: Worker; abort: () => void } | null = null;

function resultFromTempo(bpm: number | null): BpmResult | null {
  if (bpm === null || !Number.isFinite(bpm) || bpm <= 0) {
    return null;
  }
  return { bpm: Math.round(bpm * 10) / 10, confidence: confidenceFromValue(bpm) };
}

function finishActive(result: BpmResult | null): void {
  const active = activeTask;
  if (!active) {
    return;
  }
  active.task.signal?.removeEventListener('abort', active.abort);
  active.worker.terminate();
  activeTask = null;
  active.task.resolve(result);
  startNextTask();
}

function startNextTask(): void {
  if (activeTask || taskQueue.length === 0) {
    return;
  }
  const task = taskQueue.shift();
  if (!task) {
    return;
  }
  if (task.signal?.aborted || typeof Worker === 'undefined') {
    task.resolve(null);
    startNextTask();
    return;
  }
  const worker = new BpmWorker();
  const abort = () => {
    if (activeTask?.worker === worker) {
      finishActive(null);
    }
  };
  activeTask = { task, worker, abort };
  task.signal?.addEventListener('abort', abort, { once: true });
  worker.onmessage = (event: MessageEvent<BpmWorkerResponse>) => {
    if (activeTask?.worker === worker) {
      finishActive(resultFromTempo(event.data.bpm));
    }
  };
  worker.onerror = () => {
    if (activeTask?.worker === worker) {
      finishActive(null);
    }
  };
  worker.postMessage({ samples: task.samples.buffer, sampleRate: task.sampleRate }, [
    task.samples.buffer,
  ]);
}

function scheduleAnalysis(
  samples: Float32Array,
  sampleRate: number,
  signal?: AbortSignal,
): Promise<BpmResult | null> {
  if (signal?.aborted || taskQueue.length + Number(activeTask !== null) >= MAX_PENDING_ANALYSES) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    taskQueue.push({ samples, sampleRate, signal, resolve });
    startNextTask();
  });
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function mixDown(buffer: AudioBuffer, signal?: AbortSignal): Promise<Float32Array | null> {
  const maxSamples = Math.min(buffer.length, buffer.sampleRate * 60);
  const data = new Float32Array(maxSamples);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
    buffer.getChannelData(channel),
  );
  for (let start = 0; start < maxSamples; start += MIX_CHUNK_SIZE) {
    if (signal?.aborted) {
      return null;
    }
    const end = Math.min(start + MIX_CHUNK_SIZE, maxSamples);
    for (const channel of channels) {
      for (let index = start; index < end; index++) {
        data[index] = (data[index] ?? 0) + (channel[index] ?? 0) / channels.length;
      }
    }
    if (end < maxSamples) {
      await yieldToEventLoop();
    }
  }
  return data;
}

export async function detectBpm(
  buffer: AudioBuffer,
  signal?: AbortSignal,
): Promise<BpmResult | null> {
  try {
    const samples = await mixDown(buffer, signal);
    return samples ? await scheduleAnalysis(samples, buffer.sampleRate, signal) : null;
  } catch {
    return null;
  }
}

export function resetBpmSchedulerForTests(): void {
  activeTask?.worker.terminate();
  activeTask?.task.resolve(null);
  activeTask = null;
  taskQueue.splice(0).forEach((task) => task.resolve(null));
}
