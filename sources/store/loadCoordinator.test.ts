import { describe, expect, it } from 'vitest';
import { LoadCoordinator } from './loadCoordinator';

describe('LoadCoordinator', () => {
  it('invalidates an earlier main load when a newer one starts', () => {
    const coordinator = new LoadCoordinator();
    const first = coordinator.beginMain();
    const second = coordinator.beginMain();
    expect(coordinator.isMainCurrent(first)).toBe(false);
    expect(coordinator.isMainCurrent(second)).toBe(true);
  });

  it('cancels main and layer loads together', () => {
    const coordinator = new LoadCoordinator();
    const main = coordinator.beginMain();
    const layer = coordinator.beginLayer('drums');
    coordinator.cancelAll();
    expect(coordinator.isMainCurrent(main)).toBe(false);
    expect(coordinator.isLayerCurrent('drums', layer)).toBe(false);
  });

  it('keeps independent layer generations', () => {
    const coordinator = new LoadCoordinator();
    const drums = coordinator.beginLayer('drums');
    const bass = coordinator.beginLayer('bass');
    coordinator.cancelLayer('drums');
    expect(coordinator.isLayerCurrent('drums', drums)).toBe(false);
    expect(coordinator.isLayerCurrent('bass', bass)).toBe(true);
  });

  it('aborts superseded main and layer analysis signals', () => {
    const coordinator = new LoadCoordinator();
    const firstMain = coordinator.beginMain();
    const firstMainSignal = coordinator.mainSignal(firstMain)!;
    const secondMain = coordinator.beginMain();
    expect(firstMainSignal.aborted).toBe(true);
    expect(coordinator.mainSignal(firstMain)).toBeUndefined();
    expect(coordinator.mainSignal(secondMain)?.aborted).toBe(false);

    const firstLayer = coordinator.beginLayer('drums');
    const firstLayerSignal = coordinator.layerSignal('drums', firstLayer)!;
    const secondLayer = coordinator.beginLayer('drums');
    expect(firstLayerSignal.aborted).toBe(true);
    expect(coordinator.layerSignal('drums', firstLayer)).toBeUndefined();
    expect(coordinator.layerSignal('drums', secondLayer)?.aborted).toBe(false);

    coordinator.cancelMain();
    coordinator.cancelLayer('drums');
    expect(coordinator.mainSignal(secondMain)).toBeUndefined();
    expect(coordinator.layerSignal('drums', secondLayer)).toBeUndefined();
  });
});
