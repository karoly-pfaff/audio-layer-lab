import type { LayerState } from './types';

export function resolveLayerGain(layer: LayerState, anySoloed: boolean): number {
  if (layer.muted) {
    return 0;
  }
  if (anySoloed && !layer.soloed) {
    return 0;
  }
  return layer.volume;
}

export function anyLayerSoloed(layers: LayerState[]): boolean {
  return layers.some((l) => l.soloed && l.buffer !== null);
}

export function resolveAllLayerGains(layers: LayerState[]): number[] {
  const soloed = anyLayerSoloed(layers);
  return layers.map((l) => resolveLayerGain(l, soloed));
}
