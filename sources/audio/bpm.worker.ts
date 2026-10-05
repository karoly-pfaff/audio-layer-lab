import { analyzeBpmSamples } from './bpmAlgorithm';

interface BpmWorkerRequest {
  samples: ArrayBuffer;
  sampleRate: number;
}

interface BpmWorkerResponse {
  bpm: number | null;
}

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<BpmWorkerRequest>) => void) | null;
  postMessage: (message: BpmWorkerResponse) => void;
};

workerScope.onmessage = (event) => {
  let bpm: number | null = null;
  try {
    bpm = analyzeBpmSamples(new Float32Array(event.data.samples), event.data.sampleRate);
  } catch {
    // Invalid or non-rhythmic input has no usable tempo.
  }
  workerScope.postMessage({ bpm });
};
