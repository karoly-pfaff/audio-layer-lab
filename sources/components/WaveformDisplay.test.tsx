import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WaveformDisplay } from './WaveformDisplay';

function canvasContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: vi.fn() };
  return {
    clearRect: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    closePath: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
  } as unknown as CanvasRenderingContext2D;
}

function audioBuffer(): AudioBuffer {
  return {
    length: 4,
    duration: 4,
    numberOfChannels: 1,
    sampleRate: 44_100,
    getChannelData: () => new Float32Array([0, 0.5, -0.5, 0]),
  } as unknown as AudioBuffer;
}

describe('WaveformDisplay', () => {
  beforeEach(() => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext());
  });

  it('is keyboard-focusable only when seeking is available', () => {
    const { rerender } = render(<WaveformDisplay buffer={null} />);
    expect(screen.queryByRole('slider')).toBeNull();
    rerender(<WaveformDisplay buffer={audioBuffer()} onSeek={vi.fn()} playhead={0.5} />);
    expect(screen.getByRole('slider')).toHaveAttribute('tabindex', '0');
  });

  it('supports incremental and boundary keyboard seeking', () => {
    const onSeek = vi.fn();
    render(<WaveformDisplay buffer={audioBuffer()} onSeek={onSeek} playhead={0.5} />);
    const waveform = screen.getByRole('slider');
    fireEvent.keyDown(waveform, { key: 'ArrowLeft' });
    fireEvent.keyDown(waveform, { key: 'ArrowDown' });
    fireEvent.keyDown(waveform, { key: 'ArrowRight' });
    fireEvent.keyDown(waveform, { key: 'ArrowUp' });
    fireEvent.keyDown(waveform, { key: 'Home' });
    fireEvent.keyDown(waveform, { key: 'End' });
    fireEvent.keyDown(waveform, { key: 'PageDown' });
    expect(onSeek.mock.calls.map(([ratio]) => ratio)).toEqual([0.49, 0.49, 0.51, 0.51, 0, 1]);
  });

  it('supports clamped pointer seeking and ignores hover movement', () => {
    const onSeek = vi.fn();
    render(<WaveformDisplay buffer={audioBuffer()} onSeek={onSeek} />);
    const waveform = screen.getByRole('slider');
    waveform.setPointerCapture = vi.fn();
    vi.spyOn(waveform, 'getBoundingClientRect').mockReturnValue({
      bottom: 48,
      height: 48,
      left: 10,
      right: 110,
      top: 0,
      width: 100,
      x: 10,
      y: 0,
      toJSON: vi.fn(),
    });
    fireEvent.pointerDown(waveform, { clientX: -10, pointerId: 1 });
    fireEvent.pointerMove(waveform, { clientX: 60, buttons: 0 });
    fireEvent.pointerMove(waveform, { clientX: 60, buttons: 1 });
    fireEvent.pointerMove(waveform, { clientX: 150, buttons: 1 });
    expect(onSeek.mock.calls.map(([ratio]) => ratio)).toEqual([0, 0.5, 1]);
  });

  it('ignores pointer and keyboard input when no seek callback or buffer exists', () => {
    const { container, rerender } = render(<WaveformDisplay buffer={audioBuffer()} />);
    const canvas = container.querySelector('canvas')!;
    fireEvent.pointerDown(canvas, { clientX: 20, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 20, buttons: 1 });
    fireEvent.keyDown(canvas, { key: 'Home' });
    rerender(<WaveformDisplay buffer={null} onSeek={vi.fn()} />);
    fireEvent.pointerDown(canvas, { clientX: 20, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 20, buttons: 1 });
    fireEvent.keyDown(canvas, { key: 'Home' });
  });

  it('draws long waveforms, time ticks, and valid playheads', () => {
    const context = canvasContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    const { rerender } = render(
      <WaveformDisplay buffer={audioBuffer()} duration={65} playhead={0.25} color="#fff" />,
    );
    expect(context.drawImage).toHaveBeenCalled();
    expect(context.save).toHaveBeenCalled();
    rerender(<WaveformDisplay buffer={audioBuffer()} duration={65} playhead={2} color="#fff" />);
  });

  it('tolerates an unavailable offscreen canvas context', () => {
    const context = canvasContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValueOnce(context)
      .mockReturnValueOnce(null);
    expect(() => render(<WaveformDisplay buffer={audioBuffer()} />)).not.toThrow();
  });
});
