import { describe, expect, it } from 'vitest';
import { newSeedKey, seedFn, seedsFor } from '../src/seeds';

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

describe('the synchronous seed', () => {
  it('matches the Web Crypto seed exactly', async () => {
    for (let k = 0; k < 5; k++) {
      const key = newSeedKey();
      const slow = await seedsFor(key, [{ game: 'keno', from: 0, count: 20 }, { game: 'blackjack.shoe', from: 3, count: 2 }]);
      const fast = seedFn(key);
      for (let r = 0; r < 20; r++) expect(fast('keno', r)).toBe(slow('keno', r));
      expect(fast('blackjack.shoe', 4)).toBe(slow('blackjack.shoe', 4));
    }
  });
});
