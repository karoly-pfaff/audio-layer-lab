import { afterEach, describe, expect, it, vi } from 'vitest';

const metadataMock = vi.hoisted(() => ({ parseBlob: vi.fn() }));

vi.mock('music-metadata', () => ({ parseBlob: metadataMock.parseBlob }));

import { extractMetadata, revokeArtworkUrl } from './metadata';

describe('revokeArtworkUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls revokeObjectURL for blob: URLs', () => {
    const spy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    revokeArtworkUrl('blob:http://localhost/abc-123');
    expect(spy).toHaveBeenCalledWith('blob:http://localhost/abc-123');
  });

  it('does not call revokeObjectURL for https: URLs', () => {
    const spy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    revokeArtworkUrl('https://example.test/artwork.png');
    expect(spy).not.toHaveBeenCalled();
  });

  it('handles null without throwing', () => {
    expect(() => revokeArtworkUrl(null)).not.toThrow();
  });

  it('handles empty string without throwing', () => {
    expect(() => revokeArtworkUrl('')).not.toThrow();
  });

  it('does not call revokeObjectURL for empty string', () => {
    const spy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    revokeArtworkUrl('');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('extractMetadata fallback behavior', () => {
  it('returns normalized metadata and creates an artwork URL', async () => {
    const artworkUrl = 'blob:http://localhost/cover';
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue(artworkUrl);
    metadataMock.parseBlob.mockResolvedValueOnce({
      common: {
        title: '  Theme  ',
        artist: ' Artist ',
        album: ' Album ',
        picture: [{ data: new Uint8Array([1, 2, 3]), format: 'image/png' }],
      },
    });
    const file = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' });

    await expect(extractMetadata(file)).resolves.toEqual({
      title: 'Theme',
      artist: 'Artist',
      album: 'Album',
      artworkUrl,
    });
    expect(metadataMock.parseBlob).toHaveBeenCalledWith(file, { skipCovers: false });
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect((createObjectURL.mock.calls[0]![0] as Blob).type).toBe('image/png');
  });

  it('uses JPEG for artwork without a declared format', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cover');
    metadataMock.parseBlob.mockResolvedValueOnce({
      common: { picture: [{ data: [4, 5, 6], format: '' }] },
    });
    await extractMetadata(new File(['audio'], 'test.mp3'));
    expect((createObjectURL.mock.calls[0]![0] as Blob).type).toBe('image/jpeg');
  });

  it('returns null fields when tags and artwork are absent', async () => {
    metadataMock.parseBlob.mockResolvedValueOnce({
      common: { title: '   ', artist: '', album: undefined },
    });
    await expect(extractMetadata(new File(['audio'], 'untagged.wav'))).resolves.toEqual({
      title: null,
      artist: null,
      album: null,
      artworkUrl: null,
    });
  });

  it('estimates decoded sample memory when the container format is known', async () => {
    metadataMock.parseBlob.mockResolvedValueOnce({
      common: {},
      format: { duration: 10, sampleRate: 48_000, numberOfChannels: 2 },
    });
    await expect(extractMetadata(new File(['audio'], 'known.wav'))).resolves.toMatchObject({
      decodedBytesEstimate: 3_840_000,
    });
  });

  it('uses the decoding context sample rate when native decoding will resample', async () => {
    metadataMock.parseBlob.mockResolvedValueOnce({
      common: {},
      format: { duration: 1, sampleRate: 8_000, numberOfChannels: 1 },
    });
    await expect(
      extractMetadata(new File(['audio'], 'resampled.wav'), 48_000),
    ).resolves.toMatchObject({
      decodedBytesEstimate: 192_000,
    });
  });

  it('can preflight from duration and channels when only the target sample rate is known', async () => {
    metadataMock.parseBlob.mockResolvedValueOnce({
      common: {},
      format: { duration: 2, numberOfChannels: 2 },
    });
    await expect(
      extractMetadata(new File(['audio'], 'partial.wav'), 48_000),
    ).resolves.toMatchObject({
      decodedBytesEstimate: 768_000,
    });
  });

  it('omits an estimate when container data is incomplete or non-finite', async () => {
    metadataMock.parseBlob.mockResolvedValueOnce({
      common: {},
      format: { duration: Number.POSITIVE_INFINITY, sampleRate: 48_000 },
    });
    await expect(extractMetadata(new File(['audio'], 'unknown.wav'))).resolves.not.toHaveProperty(
      'decodedBytesEstimate',
    );
  });

  it('returns empty metadata when parsing fails', async () => {
    metadataMock.parseBlob.mockRejectedValueOnce(new Error('unsupported'));
    const file = new File(['not real audio'], 'test.mp3', { type: 'audio/mpeg' });
    await expect(extractMetadata(file)).resolves.toEqual({
      title: null,
      artist: null,
      album: null,
      artworkUrl: null,
    });
  });
});
