// 10ms linear fade-in + fade-out on loop buffer ends, eliminates click/pop at boundary.
// Creates a new AudioBuffer; the original is not mutated.
export const LOOP_FADE_MS = 10;

function fadeSamplesFor(buffer: AudioBuffer): number {
  return Math.min(
    Math.round(buffer.sampleRate * (LOOP_FADE_MS / 1000)),
    Math.floor(buffer.length / 4),
  );
}

export function smoothLoopBufferInPlace(buffer: AudioBuffer): AudioBuffer {
  const fadeSamples = fadeSamplesFor(buffer);
  if (fadeSamples < 2) {
    return buffer;
  }
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < fadeSamples; i++) {
      const gain = i / fadeSamples;
      data[i] = (data[i] ?? 0) * gain;
      const endIndex = buffer.length - 1 - i;
      data[endIndex] = (data[endIndex] ?? 0) * gain;
    }
  }
  return buffer;
}

export function smoothLoopBuffer(buffer: AudioBuffer, ctx: AudioContext): AudioBuffer {
  const fadeSamples = fadeSamplesFor(buffer);
  if (fadeSamples < 2) {
    return buffer;
  }

  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    dst.set(src);
    for (let i = 0; i < fadeSamples; i++) {
      const g = i / fadeSamples;
      dst[i] = (dst[i] ?? 0) * g;
      const endIndex = buffer.length - 1 - i;
      dst[endIndex] = (dst[endIndex] ?? 0) * g;
    }
  }
  return out;
}
