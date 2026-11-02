import { describe, expect, it } from 'vitest';
import {
  coinCount,
  coinDistribution,
  holdSpinOutcomes,
  MIDNIGHT_VAULT as M,
  playHoldSpin,
  Rng,
  slotPayback,
  spinSlot,
  waysScaleFor,
  waysWins,
  type HeldCoin,
  type MachineDef,
} from '../src';

const seeds = { major: M.jackpots.major, grand: M.jackpots.grand };

describe('243 ways', () => {
  it('pays every way through a symbol or a wild, from the left reel', () => {
    const grid = [
      ['A', 'A', 'K'],
      ['wild', 'A', 'Q'],
      ['A', 'J', '10'],
      ['K', 'K', 'K'],
      ['Q', 'Q', 'Q'],
    ];
    const wins = waysWins(M, grid);
    const ace = wins.find((w) => w.symbol === 'A')!;
    // Two aces on reel 1, an ace and a wild on reel 2, one ace on reel 3: 2 × 2 × 1 ways of three.
    expect(ace).toMatchObject({ reels: 3, ways: 4, pay: 4 * 0.3 });
    expect(ace.cells).toHaveLength(5);
    // The king on reel 1 runs through the wild but not reel 3.
    expect(wins.find((w) => w.symbol === 'K')).toBeUndefined();
  });

  it('needs the left reel, and lets the wild pay nothing of its own', () => {
    const grid = [
      ['J', 'J', 'J'],
      ['wild', 'wild', 'wild'],
      ['wild', 'wild', 'wild'],
      ['wild', 'wild', 'wild'],
      ['10', '10', '10'],
    ];
    const wins = waysWins(M, grid);
    // Only the jack is on reel 1, so only the jack pays, however many wilds follow.
    expect(wins.map((w) => w.symbol)).toEqual(['J']);
    expect(wins[0]).toMatchObject({ symbol: 'J', reels: 4, ways: 3 * 27 });
  });
});

describe('hold & spin', () => {
  const start = (cells: number[]): HeldCoin[] => cells.map((cell) => ({ cell, value: { kind: 'cash', x: 1 } }));

  it('resets the respins whenever a coin lands, and ends when they run out', () => {
    for (let i = 0; i < 200; i++) {
      const r = playHoldSpin(M, start([0, 1, 2, 3, 4, 5]), new Rng('hs', i), seeds);
      let left = M.holdSpin.respins;
      for (const spin of r.respins) {
        left = spin.landed.length ? M.holdSpin.respins : left - 1;
        expect(spin.left).toBe(left);
      }
      expect(r.full || left === 0).toBe(true);
      expect(r.coins.length).toBe(6 + r.respins.reduce((n, s) => n + s.landed.length, 0));
    }
  });

  it('pays the Grand on top of every coin when the screen fills', () => {
    const always: MachineDef = { ...M, holdSpin: { ...M.holdSpin, land: 1 } };
    const r = playHoldSpin(always, start([0, 1, 2, 3, 4, 5]), new Rng('full'), seeds);
    expect(r.full).toBe(true);
    expect(r.jackpots.at(-1)).toBe('grand');
    const coins = r.coins.reduce((sum, c) => sum + (c.value.kind === 'cash' ? c.value.x : c.value.tier === 'major' ? 250 : c.value.tier === 'minor' ? 30 : 10), 0);
    expect(r.pay).toBeCloseTo(coins + M.jackpots.grand, 9);
  });

  it('ends with the coins the exact chain expects', () => {
    const exact = holdSpinOutcomes(M);
    const n = 40_000;
    let coins = 0;
    for (let i = 0; i < n; i++) coins += playHoldSpin(M, start([0, 3, 6, 9, 12, 14]), new Rng('chain', i), seeds).coins.length;
    // Final counts spread over a few coins; four standard errors is generous.
    expect(Math.abs(coins / n - exact.coins[6]!)).toBeLessThan(4 * (2.5 / Math.sqrt(n)));
  });
});

describe('the payback', () => {
  it('lands the feature as often as the coin distribution says', () => {
    const dist = coinDistribution(M);
    expect(dist.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    const exact = dist.slice(M.holdSpin.trigger).reduce((a, b) => a + b, 0);
    const n = 200_000;
    let hits = 0;
    for (let round = 0; round < n; round++) {
      const grid = M.reels.map((strip, r) => {
        const stop = new Rng('trig', round, r).int(strip.length);
        return [0, 1, 2].map((row) => strip[(stop + row) % strip.length]!);
      });
      if (coinCount(M, grid) >= M.holdSpin.trigger) hits++;
    }
    expect(Math.abs(hits / n - exact)).toBeLessThan(4 * Math.sqrt((exact * (1 - exact)) / n));
  });

  it('pays the ways the exact sum says', () => {
    const exact = slotPayback(M).ways;
    const n = 200_000;
    let sum = 0;
    let sq = 0;
    for (let round = 0; round < n; round++) {
      const pay = spinSlot({ machine: M, seed: { run: 'ways', round } }).waysPay;
      sum += pay;
      sq += pay * pay;
    }
    const mean = sum / n;
    const sd = Math.sqrt((sq / n - mean * mean) / n);
    expect(Math.abs(mean - exact)).toBeLessThan(4 * sd);
  });

  it('is designed near 92%, and the way-pays scale to any target', () => {
    const p = slotPayback(M);
    expect(p.total).toBeGreaterThan(0.9);
    expect(p.total).toBeLessThan(0.94);
    expect(1 / p.triggerRate).toBeGreaterThan(90);
    expect(1 / p.triggerRate).toBeLessThan(130);
    for (const target of [0.88, 0.94, 0.98]) expect(slotPayback(M, waysScaleFor(M, target)).total).toBeCloseTo(target, 12);
  });

  it('grows with the progressives', () => {
    const at = slotPayback(M, 1, { major: 500, grand: 4000 });
    const seed = slotPayback(M);
    expect(at.jackpots.grand).toBeCloseTo(seed.jackpots.grand * 2, 12);
    expect(at.total).toBeGreaterThan(seed.total);
  });
});

describe('a spin', () => {
  it('replays exactly from its seed', () => {
    const a = spinSlot({ machine: M, seed: { run: 'r', round: 7 } });
    const b = spinSlot({ machine: M, seed: { run: 'r', round: 7 } });
    expect(b).toEqual(a);
    expect(a.grid.every((reel) => reel.length === 3)).toBe(true);
  });

  it('can be made to land the feature, for testing', () => {
    for (let round = 0; round < 20; round++) {
      const r = spinSlot({ machine: M, seed: { run: 'force', round }, forceFeature: true });
      expect(r.coins.length).toBeGreaterThanOrEqual(6);
      expect(r.feature).not.toBeNull();
      expect(r.pay).toBeCloseTo(r.waysPay + r.feature!.pay, 9);
    }
  });
});
