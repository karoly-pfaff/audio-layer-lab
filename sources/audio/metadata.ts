export interface AudioMetadata {
  title: string | null;
  artist: string | null;
  album: string | null;
  artworkUrl: string | null;
  decodedBytesEstimate?: number;
}

const EMPTY_META: AudioMetadata = { title: null, artist: null, album: null, artworkUrl: null };

interface AudioFormatEstimate {
  duration?: number;
  sampleRate?: number;
  numberOfChannels?: number;
}

function estimateDecodedBytes(
  format?: AudioFormatEstimate,
  targetSampleRate?: number,
): number | undefined {
  const sampleRate =
    typeof targetSampleRate === 'number' &&
    Number.isFinite(targetSampleRate) &&
    targetSampleRate > 0
      ? targetSampleRate
      : format?.sampleRate;
  const values = [format?.duration, sampleRate, format?.numberOfChannels];
  if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return undefined;
  }
  const [duration = 0, decodedSampleRate = 0, numberOfChannels = 0] = values;
  return Math.ceil(
    duration * decodedSampleRate * numberOfChannels * Float32Array.BYTES_PER_ELEMENT,
  );
}

export async function extractMetadata(
  file: File,
  targetSampleRate?: number,
): Promise<AudioMetadata> {
  try {
    const { parseBlob } = await import('music-metadata');
    const meta = await parseBlob(file, { skipCovers: false });

    let artworkUrl: string | null = null;
    const picture = meta.common.picture?.[0];
    if (picture) {
      const imageData = Uint8Array.from(picture.data);
      const blob = new Blob([imageData], { type: picture.format || 'image/jpeg' });
      artworkUrl = URL.createObjectURL(blob);
    }

    const decodedBytesEstimate = estimateDecodedBytes(meta.format, targetSampleRate);

    return {
      title: meta.common.title?.trim() || null,
      artist: meta.common.artist?.trim() || null,
      album: meta.common.album?.trim() || null,
      artworkUrl,
      ...(decodedBytesEstimate === undefined ? {} : { decodedBytesEstimate }),
    };
  } catch {
    return EMPTY_META;
  }
}

export function revokeArtworkUrl(url: string | null): void {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}
