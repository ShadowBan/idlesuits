import { describe, expect, it } from 'vitest';
import { newSeedKey, seedsFor } from '../src/seeds';

describe('round seeds', () => {
  it('are the same for the same key, game and round, and differ otherwise', async () => {
    const key = newSeedKey();
    const a = await seedsFor(key, [{ game: 'keno', from: 4, count: 3 }]);
    const b = await seedsFor(key, [{ game: 'keno', from: 5, count: 1 }]);
    const other = await seedsFor(newSeedKey(), [{ game: 'keno', from: 4, count: 3 }]);
    expect(a('keno', 5)).toBe(b('keno', 5));
    expect(a('keno', 4)).not.toBe(a('keno', 5));
    expect(a('keno', 4)).not.toBe(other('keno', 4));
    expect(a('keno', 4)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuse a round that was not worked out', async () => {
    const seed = await seedsFor(newSeedKey(), [{ game: 'keno', from: 0, count: 1 }]);
    expect(() => seed('keno', 1)).toThrow();
    expect(() => seed('charms', 0)).toThrow();
  });
});
