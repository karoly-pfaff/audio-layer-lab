import { afterEach, describe, expect, it, vi } from 'vitest';
import { blobArrayBuffer } from './mediaStorageHash';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('media storage byte reads', () => {
  it('uses a Blob native arrayBuffer implementation when available', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const arrayBuffer = vi.fn(async () => bytes);

    await expect(blobArrayBuffer({ arrayBuffer } as unknown as Blob)).resolves.toBe(bytes);
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
  });

  it.each([new DOMException('read failed', 'NotReadableError'), null])(
    'reports FileReader failures, including a missing native error (%s)',
    async (nativeError) => {
      class FailingFileReader {
        error = nativeError;
        onerror: (() => void) | null = null;
        onload: (() => void) | null = null;

        readAsArrayBuffer(): void {
          this.onerror?.();
        }
      }
      vi.stubGlobal('FileReader', FailingFileReader);

      await expect(blobArrayBuffer({} as Blob)).rejects.toThrow(
        nativeError ? 'read failed' : 'Unable to read audio file',
      );
    },
  );
});
