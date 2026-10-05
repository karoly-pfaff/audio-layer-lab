import type { Page } from '@playwright/test';

/**
 * Playwright's Windows WebKit build omits Web Audio. Real Safari ships the API,
 * so this deterministic shim keeps non-decoding UI and persistence flows cross-engine.
 * Native Web Audio decoding is exercised separately by the Chromium project.
 */
export async function installWebAudioShimWhenMissing(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if ('AudioContext' in globalThis) {
      return;
    }

    class TestAudioParam {
      value = 0;
      setTargetAtTime(value: number): void {
        this.value = value;
      }
      cancelScheduledValues(): void {}
      setValueAtTime(value: number): void {
        this.value = value;
      }
      linearRampToValueAtTime(value: number): void {
        this.value = value;
      }
    }

    class TestAudioNode {
      connect(): this {
        return this;
      }
    }

    class TestGainNode extends TestAudioNode {
      gain = new TestAudioParam();
    }

    class TestPannerNode extends TestAudioNode {
      pan = new TestAudioParam();
    }

    class TestAnalyserNode extends TestAudioNode {
      fftSize = 256;
      smoothingTimeConstant = 0;
      getFloatTimeDomainData(array: Float32Array): void {
        array.fill(0);
      }
    }

    class TestBufferSourceNode extends TestAudioNode {
      buffer: AudioBuffer | null = null;
      loop = false;
      onended: (() => void) | null = null;
      start(): void {}
      stop(): void {}
    }

    class TestAudioContext {
      readonly destination = new TestAudioNode();
      readonly state = 'running';

      get currentTime(): number {
        return performance.now() / 1_000;
      }

      createGain(): TestGainNode {
        return new TestGainNode();
      }

      createStereoPanner(): TestPannerNode {
        return new TestPannerNode();
      }

      createChannelSplitter(): TestAudioNode {
        return new TestAudioNode();
      }

      createAnalyser(): TestAnalyserNode {
        return new TestAnalyserNode();
      }

      createBufferSource(): TestBufferSourceNode {
        return new TestBufferSourceNode();
      }

      createBuffer(channelCount: number, length: number, sampleRate: number): AudioBuffer {
        const channels = Array.from({ length: channelCount }, () => new Float32Array(length));
        return {
          duration: length / sampleRate,
          length,
          numberOfChannels: channelCount,
          sampleRate,
          getChannelData: (channel: number) => channels[channel]!,
        } as AudioBuffer;
      }

      async decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> {
        const signature = String.fromCharCode(...new Uint8Array(data.slice(0, 4)));
        if (data.byteLength < 44 || signature !== 'RIFF') {
          throw new DOMException('Invalid audio data', 'EncodingError');
        }
        const sampleRate = 8_000;
        const length = Math.max(1, Math.floor((data.byteLength - 44) / 2));
        return this.createBuffer(1, length, sampleRate);
      }

      async resume(): Promise<void> {}
    }

    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      value: TestAudioContext,
    });
  });
}
