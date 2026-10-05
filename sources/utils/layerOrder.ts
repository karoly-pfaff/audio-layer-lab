// Moves the layer with layerId to targetOrder, recompacts orders 0..N-1.
// Returns a new array; original is not mutated. If layerId is not found, returns the original array.
export function applyReorder<T extends { id: string; order: number }>(
  layers: readonly T[],
  layerId: string,
  targetOrder: number,
): T[] {
  const fromIdx = layers.findIndex((l) => l.id === layerId);
  if (fromIdx === -1) {
    return layers as T[];
  }
  const clamped = Math.max(0, Math.min(layers.length - 1, targetOrder));
  const result = [...layers];
  const [moved] = result.splice(fromIdx, 1);
  if (!moved) {
    return layers as T[];
  }
  result.splice(clamped, 0, moved);
  return result.map((l, i) => ({ ...l, order: i })) as T[];
}

export function dropInsertionOrder(
  sourceOrder: number,
  targetOrder: number,
  insertBefore: boolean,
): number {
  const boundary = targetOrder + (insertBefore ? 0 : 1);
  return sourceOrder < boundary ? boundary - 1 : boundary;
}
