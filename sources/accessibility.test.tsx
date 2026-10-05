import { render } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./audio/AudioEngine', () => ({
  audioEngine: {
    currentTime: 0,
    stop: vi.fn(),
    clearMainBuffer: vi.fn(),
    removeLayerBuffer: vi.fn(),
    getLayerDuration: vi.fn(() => 0),
    getMainDuration: vi.fn(() => 0),
    getStereoLevels: vi.fn(() => ({ left: 0, right: 0 })),
    setLayerMute: vi.fn(),
    setLayerPan: vi.fn(),
    setLayerSolo: vi.fn(),
    setLayerVolume: vi.fn(),
    setMainEndedHandler: vi.fn(),
    setMainLoop: vi.fn(),
    setMainPan: vi.fn(),
    setMainVolume: vi.fn(),
    setMasterMute: vi.fn(),
    setMasterVolume: vi.fn(),
  },
}));

function canvasContext(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('application accessibility', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext());
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  it('has no automated WCAG 2.2 A/AA violations', async () => {
    const { container } = render(<App />);
    const result = await axe.run(container, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'],
      },
      rules: {
        // jsdom cannot calculate rendered colors; browser validation covers this rule.
        'color-contrast': { enabled: false },
      },
    });

    const details = result.violations
      .map(
        (violation) =>
          `${violation.id}: ${violation.help}\n${violation.nodes
            .map((node) => `  ${node.target.join(' ')}: ${node.failureSummary ?? ''}`)
            .join('\n')}`,
      )
      .join('\n');

    expect(result.violations, details).toEqual([]);
  });
});
