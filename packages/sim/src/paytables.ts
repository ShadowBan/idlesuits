/**
 * A table keyed by a count (flush size, run length...). Counts beyond the
 * largest key extrapolate geometrically, so any size has a defined value.
 */
export interface ScaleTable {
  values: Record<number, number>;
  /** Value at count n > maxKey = values[maxKey] * factor^(n - maxKey). */
  extrapolateFactor: number;
  /** Value for counts below the smallest key. */
  below: number;
}

export function lookupScale(table: ScaleTable, n: number): number {
  const exact = table.values[n];
  if (exact !== undefined) return exact;
  const keys = Object.keys(table.values).map(Number);
  const max = Math.max(...keys);
  if (n > max) return table.values[max]! * table.extrapolateFactor ** (n - max);
  if (n < Math.min(...keys)) return table.below;
  // A gap inside the table: use the nearest lower key.
  const lower = Math.max(...keys.filter((k) => k < n));
  return table.values[lower]!;
}

/** Maximum raise (in antes) by flush size. */
export const DEFAULT_RAISE_CAPS: ScaleTable = {
  values: { 2: 1, 3: 1, 4: 1, 5: 2, 6: 3, 7: 3 },
  extrapolateFactor: 1,
  below: 1,
};

export function maxRaise(table: ScaleTable, size: number): number {
  const keys = Object.keys(table.values).map(Number);
  const max = Math.max(...keys);
  // Raise caps grow linearly past the table (+1 per card), not geometrically.
  if (size > max) return table.values[max]! + (size - max);
  return lookupScale(table, size);
}
