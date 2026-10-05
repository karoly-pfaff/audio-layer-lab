import { describe, expect, it } from 'vitest';
import { isInteractiveShortcutTarget } from './keyboardShortcuts';

describe('isInteractiveShortcutTarget', () => {
  it('ignores native form controls and links', () => {
    expect(isInteractiveShortcutTarget(document.createElement('input'))).toBe(true);
    expect(isInteractiveShortcutTarget(document.createElement('button'))).toBe(true);
    const link = document.createElement('a');
    link.href = '/';
    expect(isInteractiveShortcutTarget(link)).toBe(true);
  });

  it('ignores custom sliders and their nested SVG elements', () => {
    const slider = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    slider.setAttribute('role', 'slider');
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    slider.append(label);
    expect(isInteractiveShortcutTarget(slider)).toBe(true);
    expect(isInteractiveShortcutTarget(label)).toBe(true);
  });

  it('allows global shortcuts on non-interactive layout elements', () => {
    expect(isInteractiveShortcutTarget(document.createElement('main'))).toBe(false);
    expect(isInteractiveShortcutTarget(window)).toBe(false);
  });
});
