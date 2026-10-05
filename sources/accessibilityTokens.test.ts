import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'sources/index.css'), 'utf8');
const backgrounds = [
  [11, 11, 15],
  [15, 15, 20],
  [23, 23, 31],
  [33, 33, 48],
] as const;

function tokenRgba(name: string): { color: number[]; alpha: number } {
  const match = css.match(new RegExp(`--${name}: rgba\\((\\d+), (\\d+), (\\d+), ([0-9.]+)\\)`));
  if (!match) {
    throw new Error(`Missing rgba token: --${name}`);
  }
  return {
    color: [Number(match[1]), Number(match[2]), Number(match[3])],
    alpha: Number(match[4]),
  };
}

function relativeLuminance([red, green, blue]: readonly number[]): number {
  const linear = [red, green, blue].map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function overlay(
  foreground: readonly number[],
  background: readonly number[],
  alpha: number,
): number[] {
  return background.map((channel, index) => foreground[index] * alpha + channel * (1 - alpha));
}

function contrast(foreground: readonly number[], background: readonly number[]): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('accessibility color tokens', () => {
  it.each(['text-secondary', 'text-muted'])('%s has at least 4.5:1 text contrast', (token) => {
    const { color, alpha } = tokenRgba(token);
    for (const background of backgrounds) {
      expect(contrast(overlay(color, background, alpha), background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(['border-soft', 'border'])('%s has at least 3:1 non-text contrast', (token) => {
    const { color, alpha } = tokenRgba(token);
    for (const background of backgrounds) {
      expect(contrast(overlay(color, background, alpha), background)).toBeGreaterThanOrEqual(3);
    }
  });
});
