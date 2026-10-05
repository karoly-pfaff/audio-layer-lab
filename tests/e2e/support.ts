import type { Locator, Page } from '@playwright/test';

export interface FilePayload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

export function makeWavFile(name: string, frequency = 440): FilePayload {
  const sampleRate = 8_000;
  const durationSeconds = 3;
  const sampleCount = sampleRate * durationSeconds;
  const bytesPerSample = 2;
  const dataLength = sampleCount * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataLength);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataLength, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 0.35;
    buffer.writeInt16LE(Math.round(sample * 0x7fff), 44 + index * bytesPerSample);
  }

  return { name, mimeType: 'audio/wav', buffer };
}

export async function chooseFile(page: Page, button: Locator, file: FilePayload): Promise<void> {
  const chooserPromise = page.waitForEvent('filechooser');
  await button.click();
  const chooser = await chooserPromise;
  await chooser.setFiles(file);
}

export async function setRangeValue(range: Locator, value: number): Promise<void> {
  await range.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, String(nextValue));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
