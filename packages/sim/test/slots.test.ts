import { describe, expect, it } from 'vitest';
import {
  bonusValue,
  CARNIVAL_CROWN,
  coinCount,
  coinDistribution,
  countDistribution,
  holdSpinOutcomes,
  LUCKY_FORGE,
  MACHINES,
  playBonus,
  MIDNIGHT_VAULT as M,
  PAPER_LANTERNS,
  PIRATES_HAUL,
  playFreeSpins,
  playHoldSpin,
  playPick,
  potChain,
  Rng,
  slotPayback,
  spinSlot,
  spinWheel,
  triggers,
  triggerSymbol,
  wheelsFor,
  upgradeMap,
  waysScaleFor,
  waysWins,
  windowAt,
  type HeldCoin,
  type MachineDef,
  type PotPower,
} from '../src';

const seeds = { major: M.jackpots.major, grand: M.jackpots.grand };
/** A machine with its pots taken off, to test its bonus as it plays on its own. */
const bare = (machine: MachineDef): MachineDef => ({ ...machine, pots: undefined });
const HS = M.bonus.kind === 'holdSpin' ? M.bonus : null!;

/** Mean and standard error of a sample. */
function stats(xs: number[]): { mean: number; se: number } {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sq = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return { mean, se: Math.sqrt(sq / xs.length) };
}

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
    expect(ace).toMatchObject({ reels: 3, ways: 4, pay: 4 * M.symbols.find((s) => s.id === 'A')!.pays![0] });
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
      let left = HS.respins;
      for (const spin of r.respins) {
        left = spin.landed.length ? HS.respins : left - 1;
        expect(spin.left).toBe(left);
      }
      expect(r.full || left === 0).toBe(true);
      expect(r.coins.length).toBe(6 + r.respins.reduce((n, s) => n + s.landed.length, 0));
    }
  });

  it('pays the Grand on top of every coin when the screen fills', () => {
    const always: MachineDef = { ...M, bonus: { ...HS, land: 1 } };
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
    const exact = dist.slice(HS.trigger).reduce((a, b) => a + b, 0);
    const n = 200_000;
    let hits = 0;
    for (let round = 0; round < n; round++) {
      const grid = M.reels.map((strip, r) => {
        const stop = new Rng('trig', round, r).int(strip.length);
        return [0, 1, 2].map((row) => strip[(stop + row) % strip.length]!);
      });
      if (coinCount(M, grid) >= HS.trigger) hits++;
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
    expect(1 / p.triggerRate).toBeLessThan(160);
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
  it('replays exactly from its seed, on every machine', () => {
    for (const machine of MACHINES) {
      const a = spinSlot({ machine, seed: { run: 'r', round: 7 }, forceFeature: true });
      const b = spinSlot({ machine, seed: { run: 'r', round: 7 }, forceFeature: true });
      expect(b).toEqual(a);
      expect(a.grid.every((reel) => reel.length === 3)).toBe(true);
    }
  });

  it('can be made to land the feature, for testing, on every machine', () => {
    for (const machine of MACHINES) {
      for (let round = 0; round < 20; round++) {
        const r = spinSlot({ machine, seed: { run: 'force', round }, forceFeature: true });
        expect(triggers(machine, r.grid)).toBe(true);
        expect(r.feature?.kind).toBe(machine.bonus.kind === 'upgrade' || machine.bonus.kind === 'collect' ? 'freeSpins' : machine.bonus.kind);
        expect(r.pay).toBeCloseTo(r.waysPay + r.collectPay + r.feature!.pay, 9);
      }
    }
  });
});

describe('every machine', () => {
  it('is designed between 88% and 95%, and the way-pays scale to any target', () => {
    for (const machine of MACHINES) {
      const p = slotPayback(machine);
      expect(p.total, machine.id).toBeGreaterThan(0.88);
      expect(p.total, machine.id).toBeLessThan(0.95);
      expect(1 / p.triggerRate, machine.id).toBeGreaterThan(90);
      expect(1 / p.triggerRate, machine.id).toBeLessThan(160);
      for (const target of [0.88, 0.94, 0.98]) expect(slotPayback(machine, waysScaleFor(machine, target)).total).toBeCloseTo(target, 10);
    }
  });

  it('starts the bonus as often as the scatter distribution says', () => {
    for (const machine of [LUCKY_FORGE, PIRATES_HAUL, CARNIVAL_CROWN, PAPER_LANTERNS]) {
      const exact = slotPayback(machine).triggerRate;
      const id = triggerSymbol(machine);
      expect(countDistribution(machine.reels, 3, id).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      const n = 100_000;
      let hits = 0;
      for (let round = 0; round < n; round++) {
        const grid = machine.reels.map((strip, r) => windowAt(strip, new Rng('trig', machine.id, round, r).int(strip.length), 3));
        if (triggers(machine, grid)) hits++;
      }
      expect(Math.abs(hits / n - exact), machine.id).toBeLessThan(4 * Math.sqrt((exact * (1 - exact)) / n));
    }
  });

  it('pays the base game (ways and collects) as the exact sums say', () => {
    for (const machine of MACHINES) {
      const p = slotPayback(machine);
      const pays: number[] = [];
      for (let round = 0; round < 100_000; round++) {
        const r = spinSlot({ machine, seed: { run: 'base', round } });
        pays.push(r.waysPay + r.collectPay);
      }
      const { mean, se } = stats(pays);
      expect(Math.abs(mean - (p.ways + p.collect)), machine.id).toBeLessThan(4 * se);
    }
  });
});

describe('free spins', () => {
  for (const machine of [LUCKY_FORGE, PIRATES_HAUL]) {
    const bonus = machine.bonus.kind === 'upgrade' || machine.bonus.kind === 'collect' ? machine.bonus : null!;
    it(`${machine.name}: pays, lasts and levels up as the exact chain says`, () => {
      const exact = slotPayback(bare(machine));
      const n = 20_000;
      const pays: number[] = [];
      const spins: number[] = [];
      const reached = exact.levelRates.map(() => 0);
      for (let i = 0; i < n; i++) {
        const f = playFreeSpins(machine, bonus, new Rng('fs', machine.id, i), seeds, 1);
        pays.push(f.pay);
        spins.push(f.spins.length);
        for (let l = 0; l <= f.level; l++) reached[l]!++;
      }
      const pay = stats(pays);
      expect(Math.abs(pay.mean - exact.featurePay)).toBeLessThan(4 * pay.se);
      const len = stats(spins);
      expect(Math.abs(len.mean - exact.featureSpins)).toBeLessThan(4 * len.se);
      exact.levelRates.forEach((p, l) => expect(Math.abs(reached[l]! / n - p)).toBeLessThan(4 * Math.sqrt((p * (1 - p)) / n) + 1e-9));
    });

    it(`${machine.name}: adds spins with every level, and counts a level from the next spin`, () => {
      for (let i = 0; i < 300; i++) {
        const f = playFreeSpins(machine, bonus, new Rng('lv', machine.id, i), seeds, 1);
        let left = bonus.spins;
        let level = 0;
        for (const s of f.spins) {
          expect(s.level).toBe(level);
          left = left - 1 + s.added;
          expect(s.left).toBe(left);
          expect(s.added).toBe(s.levelUps * bonus.extraSpins);
          level += s.levelUps;
        }
        expect(left).toBe(0);
        expect(f.level).toBe(level);
        expect(f.pay).toBeCloseTo(f.spins.reduce((a, s) => a + s.pay, 0), 9);
      }
    });
  }

  it('upgrades every metal a tier per level, capped at the crown', () => {
    const b = LUCKY_FORGE.bonus.kind === 'upgrade' ? LUCKY_FORGE.bonus : null!;
    expect(upgradeMap(b, 0)).toEqual({ bronze: 'bronze', silver: 'silver', gold: 'gold', crown: 'crown' });
    expect(upgradeMap(b, 1)).toEqual({ bronze: 'silver', silver: 'gold', gold: 'crown', crown: 'crown' });
    expect(Object.values(upgradeMap(b, 3))).toEqual(['crown', 'crown', 'crown', 'crown']);
    // At level 3 no bronze, silver or gold is ever shown.
    for (let i = 0; i < 200; i++) {
      const f = playFreeSpins(LUCKY_FORGE, b, new Rng('top', i), seeds, 1);
      for (const s of f.spins) if (s.level === 3) expect(s.grid.flat().some((x) => x === 'bronze' || x === 'silver' || x === 'gold')).toBe(false);
    }
  });

  it('pays the Grand once a feature at most, on a screen of crowns and wilds', () => {
    // Every cell a crown: the Grand on the first spin only.
    const b = LUCKY_FORGE.bonus.kind === 'upgrade' ? LUCKY_FORGE.bonus : null!;
    const crowns = { ...b, reels: b.reels.map(() => ['crown']) };
    const f = playFreeSpins(LUCKY_FORGE, crowns, new Rng('crowns'), seeds, 1);
    expect(f.spins.filter((s) => s.grand)).toHaveLength(1);
    expect(f.spins[0]!.grand).toBe(true);
    expect(f.jackpots).toEqual(['grand']);
  });

  it('has every captain take every doubloon, cash times the multiplier and jackpots as they are', () => {
    const b = PIRATES_HAUL.bonus.kind === 'collect' ? PIRATES_HAUL.bonus : null!;
    for (let i = 0; i < 500; i++) {
      const f = playFreeSpins(PIRATES_HAUL, b, new Rng('cap', i), seeds, 1);
      for (const s of f.spins) {
        const cash = s.coins.reduce((a, c) => a + (c.value.kind === 'cash' ? c.value.x : 0), 0);
        const jp = s.coins.filter((c) => c.value.kind === 'jackpot').length;
        expect(s.collects).toHaveLength(s.coins.length ? s.marks.length : 0);
        for (const c of s.collects) {
          expect(c.jackpots).toHaveLength(jp);
          if (!jp) expect(c.pay).toBeCloseTo(cash * b.multipliers[s.level]!, 9);
        }
      }
    }
  });
});

describe('the wheel', () => {
  const bonus = CARNIVAL_CROWN.bonus.kind === 'wheel' ? CARNIVAL_CROWN.bonus : null!;
  it('climbs a wheel on every Up and pays what the exact sum says', () => {
    const exact = slotPayback(bare(CARNIVAL_CROWN));
    const n = 200_000;
    const pays: number[] = [];
    const reached = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const w = spinWheel(CARNIVAL_CROWN, bonus, new Rng('wheel', i), seeds);
      expect(w.rounds).toHaveLength(1);
      const stops = w.rounds[0]!.stops;
      stops.forEach((s, j) => {
        expect(s.wheel).toBe(j);
        reached[j]!++;
        if (j < stops.length - 1) expect(bonus.wheels[j]![s.wedge]!.kind).toBe('up');
      });
      pays.push(w.pay);
    }
    const { mean, se } = stats(pays);
    expect(Math.abs(mean - exact.featurePay)).toBeLessThan(4 * se);
    exact.levelRates.forEach((p, l) => expect(Math.abs(reached[l]! / n - p)).toBeLessThan(4 * Math.sqrt((p * (1 - p)) / n) + 1e-9));
  });
});

describe('the pick', () => {
  const bonus = PAPER_LANTERNS.bonus.kind === 'pick' ? PAPER_LANTERNS.bonus : null!;
  it('ends on the third of one jackpot, with no other at three, from a board of three of each', () => {
    for (let i = 0; i < 2000; i++) {
      const r = playPick(PAPER_LANTERNS, bonus, new Rng('pick', i), seeds);
      expect(r.boards).toHaveLength(1);
      const p = r.boards[0]!;
      expect(p.won).toBe(p.tier);
      expect(p.picks.at(-1)).toBe(p.tier);
      const counts = { mini: 0, minor: 0, major: 0, grand: 0 };
      for (const t of p.picks) counts[t]++;
      expect(counts[p.tier]).toBe(3);
      for (const [t, n] of Object.entries(counts)) if (t !== p.tier) expect(n).toBeLessThan(3);
      // Before the last pick, nothing had three.
      const before = { mini: 0, minor: 0, major: 0, grand: 0 };
      for (const t of p.picks.slice(0, -1)) expect(++before[t]).toBeLessThan(3);
    }
  });

  it('pays each jackpot as often as its weight says', () => {
    const n = 100_000;
    const won = { mini: 0, minor: 0, major: 0, grand: 0 };
    for (let i = 0; i < n; i++) won[playPick(PAPER_LANTERNS, bonus, new Rng('pw', i), seeds).boards[0]!.tier]++;
    const total = Object.values(bonus.weights).reduce((a, b) => a + b, 0);
    for (const t of ['mini', 'minor', 'major', 'grand'] as const) {
      const p = bonus.weights[t] / total;
      expect(Math.abs(won[t] / n - p)).toBeLessThan(4 * Math.sqrt((p * (1 - p)) / n) + 1e-9);
    }
  });
});

describe('the pots', () => {
  const pots = M.pots!;
  /** The vault with every pot in `mask` always full and the rest never filling. */
  const withLit = (mask: number): MachineDef => ({
    ...M,
    pots: pots.map((p, i) => (mask & (1 << i) ? { ...p, size: 0 } : { ...p, chance: 0 })),
  });
  const start = (cells: number[]): HeldCoin[] => cells.map((cell) => ({ cell, value: { kind: 'cash', x: 1 } }));

  it('start the bonus at the usual rate, whatever they hold', () => {
    const chain = potChain(M);
    const p = slotPayback(M);
    const total = chain.starts.reduce((sum, byN) => sum + byN.reduce((a, b) => a + b, 0), 0);
    expect(total).toBeCloseTo(p.triggerRate, 14);
    for (const rate of chain.litRates) {
      expect(rate).toBeGreaterThan(0.1);
      expect(rate).toBeLessThan(0.7);
    }
    expect(chain.superRate).toBeGreaterThan(0.02);
    expect(chain.superRate).toBeLessThanOrEqual(Math.min(...chain.litRates));
  });

  it('fill from gems on the coins, light only when full, and empty when they join the bonus', () => {
    let held = pots.map(() => 0);
    let lit = 0;
    for (let round = 0; round < 20_000; round++) {
      const r = spinSlot({ machine: M, seed: { run: 'gems', round }, pots: held });
      const cells = new Set(r.coins.map((c) => c.cell));
      for (const g of r.gems) expect(cells.has(g.cell)).toBe(true);
      expect(new Set(r.gems.map((g) => g.cell)).size).toBe(r.gems.length);
      r.filled.forEach((f, i) => expect(f).toBe(Math.min(pots[i]!.size, held[i]! + r.gems.filter((g) => g.pot === i).length)));
      if (r.feature) {
        expect(r.lit).toEqual(pots.flatMap((p, i) => (r.filled[i] === p.size ? [i] : [])));
        expect(r.feature.kind === 'holdSpin' && r.feature.powers).toEqual(r.lit.map((i) => pots[i]!.power.kind));
        lit += r.lit.length;
      } else expect(r.lit).toEqual([]);
      expect(r.pots).toEqual(r.filled.map((f, i) => (r.lit.includes(i) ? 0 : f)));
      held = r.pots;
    }
    expect(lit).toBeGreaterThan(0);
  });

  it('are full when the bonus starts as often as the chain says, carried from spin to spin', () => {
    const exact = potChain(M).litRates;
    let held = pots.map(() => 0);
    const counts = pots.map(() => 0);
    let bonuses = 0;
    for (let round = 0; round < 200_000; round++) {
      const r = spinSlot({ machine: M, seed: { run: 'long', round }, pots: held });
      if (r.feature) {
        bonuses++;
        for (const i of r.lit) counts[i]!++;
      }
      held = r.pots;
    }
    counts.forEach((n, i) => {
      const p = exact[i]!;
      expect(Math.abs(n / bonuses - p)).toBeLessThan(4.5 * Math.sqrt((p * (1 - p)) / bonuses));
    });
  });

  it('boost every coin after every respin, reset to more respins, and collect the cash again', () => {
    const powers = pots.map((p) => p.power);
    const extra = powers.find((p) => p.kind === 'extra')!;
    for (let i = 0; i < 200; i++) {
      const r = playHoldSpin(M, start([0, 1, 2, 3, 4, 5]), new Rng('powers', i), seeds, powers);
      const since = new Map<number, number>();
      const add: Record<number, number> = {};
      let left = extra.kind === 'extra' ? extra.respins : 0;
      const on = new Set([0, 1, 2, 3, 4, 5]);
      for (const spin of r.respins) {
        for (const c of spin.landed) on.add(c.cell);
        left = spin.landed.length ? (extra.kind === 'extra' ? extra.respins : 0) : left - 1;
        expect(spin.left).toBe(left);
        expect(spin.boost).toBeGreaterThan(0);
        for (const cell of on) add[cell] = (add[cell] ?? 0) + spin.boost;
        since.set(r.respins.indexOf(spin), on.size);
      }
      for (const [cell, x] of Object.entries(add)) expect(r.boosted[Number(cell)]).toBeCloseTo(x, 12);
      const boost = Object.values(r.boosted).reduce((a, b) => a + b, 0);
      const cash = r.coins.reduce((sum, c) => sum + (c.value.kind === 'cash' ? c.value.x : 0), 0) + boost;
      expect(r.collected).toBeCloseTo(cash, 12);
      const jackpots = r.coins.reduce((sum, c) => sum + (c.value.kind === 'jackpot' ? (c.value.tier === 'major' ? seeds.major : M.jackpots[c.value.tier]) : 0), 0);
      expect(r.pay).toBeCloseTo(cash * 2 + jackpots + (r.full ? seeds.grand : 0), 9);
    }
  });

  it('pay the bonus what the exact chain says, power by power and all together', () => {
    for (const mask of [1, 2, 4, 7]) {
      const machine = withLit(mask);
      const exact = slotPayback(machine);
      const n = 6000;
      const pays: number[] = [];
      let full = 0;
      for (let round = 0; round < n; round++) {
        const f = spinSlot({ machine, seed: { run: `lit${mask}`, round }, forceFeature: true }).feature!;
        expect(f.kind === 'holdSpin' && f.powers.length).toBe([1, 2, 4].filter((b) => mask & b).length);
        // The Grand is rare and huge: check its rate on its own, and the rest of the pay without it.
        const grand = f.kind === 'holdSpin' && f.full;
        if (grand) full++;
        pays.push(f.pay - (grand ? seeds.grand : 0));
      }
      const { mean, se } = stats(pays);
      expect(Math.abs(mean - (exact.featurePay - exact.fullRate * seeds.grand))).toBeLessThan(4.5 * se);
      expect(Math.abs(full / n - exact.fullRate)).toBeLessThan(4.5 * Math.sqrt((exact.fullRate * (1 - exact.fullRate)) / n) + 1e-9);
    }
  }, 60_000);

  it('leave a machine without pots as it was', () => {
    const r = spinSlot({ machine: bare(LUCKY_FORGE), seed: { run: 'none', round: 3 } });
    expect(r).toMatchObject({ gems: [], filled: [], lit: [], pots: [] });
  });
});

describe('every machine\'s pots', () => {
  const potted = MACHINES.filter((m) => m.id !== M.id);
  /** The machine with every pot in `mask` always full and the rest never filling. */
  const withLit = (machine: MachineDef, mask: number): MachineDef => ({
    ...machine,
    pots: machine.pots!.map((p, i) => (mask & (1 << i) ? { ...p, size: 0 } : { ...p, chance: 0 })),
  });
  const powersIn = (machine: MachineDef, mask: number): PotPower[] => machine.pots!.filter((_, i) => mask & (1 << i)).map((p) => p.power);

  it('are on every machine, rarer pot by pot, with the Super rarest of all', () => {
    for (const machine of MACHINES) {
      const chain = potChain(machine);
      const p = slotPayback(machine);
      const total = chain.starts.reduce((sum, byN) => sum + byN.reduce((a, b) => a + b, 0), 0);
      expect(total, machine.id).toBeCloseTo(p.triggerRate, 14);
      expect(machine.pots, machine.id).toHaveLength(3);
      if (machine === M) continue;
      // The ladder: each pot rarer than the last, and all three rarer still.
      expect(chain.litRates[0]!).toBeGreaterThan(chain.litRates[1]!);
      expect(chain.litRates[1]!).toBeGreaterThan(chain.litRates[2]!);
      expect(chain.superRate).toBeGreaterThan(0.005);
      expect(chain.superRate).toBeLessThan(chain.litRates[2]!);
    }
  });

  it('fill from gems on the scatters, light only when full, and empty when they join the bonus', () => {
    for (const machine of potted) {
      const pots = machine.pots!;
      const scatter = triggerSymbol(machine);
      let held = pots.map(() => 0);
      let lit = 0;
      for (let round = 0; round < 15_000; round++) {
        const r = spinSlot({ machine, seed: { run: 'gems', round }, pots: held });
        for (const g of r.gems) expect(r.grid[Math.floor(g.cell / 3)]![g.cell % 3]).toBe(scatter);
        expect(new Set(r.gems.map((g) => g.cell)).size).toBe(r.gems.length);
        r.filled.forEach((f, i) => expect(f).toBe(Math.min(pots[i]!.size, held[i]! + r.gems.filter((g) => g.pot === i).length)));
        if (r.feature) {
          expect(r.lit).toEqual(pots.flatMap((p, i) => (r.filled[i] === p.size ? [i] : [])));
          expect('powers' in r.feature && r.feature.powers).toEqual(r.lit.map((i) => pots[i]!.power.kind));
          lit += r.lit.length;
        } else expect(r.lit).toEqual([]);
        expect(r.pots).toEqual(r.filled.map((f, i) => (r.lit.includes(i) ? 0 : f)));
        held = r.pots;
      }
      expect(lit, machine.id).toBeGreaterThan(0);
    }
  });

  it('are full when a scatter bonus starts as often as the chain says, carried from spin to spin', () => {
    const machine = CARNIVAL_CROWN;
    const exact = potChain(machine).litRates;
    let held = machine.pots!.map(() => 0);
    const counts = machine.pots!.map(() => 0);
    let bonuses = 0;
    for (let round = 0; round < 300_000; round++) {
      const r = spinSlot({ machine, seed: { run: 'long', round }, pots: held });
      if (r.feature) {
        bonuses++;
        for (const i of r.lit) counts[i]!++;
      }
      held = r.pots;
    }
    counts.forEach((n, i) => {
      const p = exact[i]!;
      expect(Math.abs(n / bonuses - p)).toBeLessThan(4.5 * Math.sqrt((p * (1 - p)) / bonuses));
    });
  }, 60_000);

  it('pay each bonus what the exact sums say, power by power and all together', () => {
    for (const machine of potted) {
      for (const mask of [1, 2, 4, 7]) {
        const powers = powersIn(machine, mask);
        const exact = bonusValue(machine, 1, seeds, powers);
        // Through a spin once, to see the pots hand the bonus their powers; then the bonus on its own, many times.
        const spun = spinSlot({ machine: withLit(machine, mask), seed: { run: `lit${mask}`, round: 0 }, forceFeature: true }).feature!;
        expect('powers' in spun && spun.powers).toEqual(powers.map((p) => p.kind));
        const n = machine.bonus.kind === 'wheel' || machine.bonus.kind === 'pick' ? 40_000 : 4000;
        const pays: number[] = [];
        let grands = 0;
        for (let round = 0; round < n; round++) {
          const f = playBonus(machine, [], new Rng('lit', machine.id, mask, round), seeds, 1, powers);
          // The Grand is rare and huge: check its rate on its own, and the rest of the pay without it.
          const g = f.jackpots.filter((t) => t === 'grand').length;
          grands += g;
          pays.push(f.pay - g * seeds.grand);
        }
        const { mean, se } = stats(pays);
        const label = `${machine.id} mask ${mask}`;
        expect(Math.abs(mean - (exact.pay - exact.jackpots.grand)), label).toBeLessThan(4.5 * se);
        const rate = exact.jackpots.grand / seeds.grand;
        expect(Math.abs(grands / n - rate), label).toBeLessThan(4.5 * Math.sqrt(rate / n) + 1e-9);
      }
    }
  }, 30_000);

  it('start free spins up a level or with more spins, fill the meter faster, and multiply wilds and cash', () => {
    const forge = LUCKY_FORGE.bonus.kind === 'upgrade' ? LUCKY_FORGE.bonus : null!;
    const haul = PIRATES_HAUL.bonus.kind === 'collect' ? PIRATES_HAUL.bonus : null!;
    const powers: PotPower[] = [
      { kind: 'level', levels: 1 },
      { kind: 'spins', add: 3 },
      { kind: 'marks', times: 2 },
      { kind: 'cash', times: 2 },
    ];
    for (const [machine, bonus] of [
      [LUCKY_FORGE, forge],
      [PIRATES_HAUL, haul],
    ] as const) {
      for (let i = 0; i < 200; i++) {
        const f = playFreeSpins(machine, bonus, new Rng('pw', machine.id, i), seeds, 1, powers);
        expect(f.start).toEqual({ spins: bonus.spins + 3, meter: bonus.perLevel, level: 1 });
        expect(f.spins[0]!.level).toBe(1);
        let meter = bonus.perLevel;
        let left = bonus.spins + 3;
        for (const s of f.spins) {
          meter = Math.min(meter + 2 * s.marks.length, bonus.perLevel * bonus.maxLevel);
          expect(s.meter).toBe(meter);
          left = left - 1 + s.added;
          expect(s.left).toBe(left);
          // Every doubloon's cash comes doubled: twice one of the machine's values.
          for (const c of s.coins) if (c.value.kind === 'cash') expect(PIRATES_HAUL.coinValues!.some((v) => v.value.kind === 'cash' && v.value.x * 2 === (c.value as { x: number }).x)).toBe(true);
        }
      }
    }
    // A 2× wild doubles every way through it, and two on one way make 4×.
    const grid = [['A', 'K', 'Q'], ['wild', 'A', 'J'], ['wild', '10', 'K'], ['A', 'K', 'Q'], ['J', 'J', 'J']];
    const win = (x: number) => waysWins(LUCKY_FORGE, grid, 1, x).find((w) => w.symbol === 'A')!;
    expect(win(1).ways).toBe(2);
    // Reel 2: the wild counts 2 beside the ace's 1; reel 3: the wild alone, 2.
    expect(win(2).ways).toBe(6);
    expect(win(2).pay).toBeCloseTo(win(1).pay * 3, 12);
  });

  it('add Ups to the outer wheel, spin a ring on the cash, and play the wheel again', () => {
    const bonus = CARNIVAL_CROWN.bonus.kind === 'wheel' ? CARNIVAL_CROWN.bonus : null!;
    const ring = CARNIVAL_CROWN.pots!.find((p) => p.power.kind === 'ring')!.power;
    const powers: PotPower[] = [{ kind: 'ups', add: 2 }, ring, { kind: 'encore' }];
    const wheels = wheelsFor(bonus, powers);
    const ups = (w: readonly { kind: string }[]) => w.filter((x) => x.kind === 'up').length;
    expect(ups(wheels[0]!)).toBe(ups(bonus.wheels[0]!) + 2);
    const smallest = Math.min(...bonus.wheels[0]!.flatMap((w) => (w.kind === 'cash' ? [w.x] : [])));
    expect(wheels[0]!.some((w) => w.kind === 'cash' && w.x === smallest)).toBe(false);
    expect(wheels.slice(1)).toEqual(bonus.wheels.slice(1));
    for (let i = 0; i < 500; i++) {
      const r = spinWheel(CARNIVAL_CROWN, bonus, new Rng('ring', i), seeds, powers);
      expect(r.rounds).toHaveLength(2);
      for (const round of r.rounds) {
        const last = round.stops.at(-1)!;
        const wedge = wheels[last.wheel]![last.wedge]!;
        expect(wedge.kind).not.toBe('up');
        expect(round.pay).toBeCloseTo(wedge.kind === 'cash' ? wedge.x * round.ring : wedge.kind === 'jackpot' ? (wedge.tier === 'grand' ? seeds.grand : wedge.tier === 'major' ? seeds.major : CARNIVAL_CROWN.jackpots[wedge.tier]) : 0, 9);
      }
      expect(r.pay).toBeCloseTo(r.rounds[0]!.pay + r.rounds[1]!.pay, 9);
    }
  });

  it('drop the Mini from the board, raise the jackpot a tier, and play a second board', () => {
    const bonus = PAPER_LANTERNS.bonus.kind === 'pick' ? PAPER_LANTERNS.bonus : null!;
    const powers: PotPower[] = [{ kind: 'drop', tier: 'mini' }, { kind: 'twin' }, { kind: 'rise', top: 'major' }];
    const up = { mini: 'minor', minor: 'major', major: 'major', grand: 'grand' } as const;
    for (let i = 0; i < 1000; i++) {
      const r = playPick(PAPER_LANTERNS, bonus, new Rng('lp', i), seeds, powers);
      expect(r.tiers).toEqual(['minor', 'major', 'grand']);
      expect(r.boards).toHaveLength(2);
      for (const b of r.boards) {
        expect(b.picks).not.toContain('mini');
        expect(b.picks.at(-1)).toBe(b.tier);
        expect(b.won).toBe(up[b.tier]);
      }
      expect(r.jackpots).toEqual(r.boards.map((b) => b.won));
    }
  });
});
