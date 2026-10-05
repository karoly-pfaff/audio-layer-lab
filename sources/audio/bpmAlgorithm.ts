import MusicTempo from 'music-tempo';

const TARGET_STEP_SECONDS = 0.01;
const FFT_BUFFER_SIZE = 2048;

export function analyzeBpmSamples(data: Float32Array, sampleRate: number): number | null {
  if (data.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return null;
  }
  const hopSize = Math.min(
    FFT_BUFFER_SIZE,
    Math.max(1, Math.round(sampleRate * TARGET_STEP_SECONDS)),
  );
  const tempo = new MusicTempo(data, {
    bufferSize: FFT_BUFFER_SIZE,
    hopSize,
    timeStep: hopSize / sampleRate,
  }).tempo;
  const bpm = Number(tempo);
  return Number.isFinite(bpm) && bpm > 0 ? bpm : null;
}
