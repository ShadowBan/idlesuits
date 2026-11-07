import { countDistribution } from './rtp';
import { triggerSymbol } from './spin';
import type { MachineDef } from './types';

/** How the pots stand, in the long run, whenever the bonus starts. */
export interface PotChain {
  /**
   * starts[lit][n]: the chance a spin starts the bonus with `n` coins and
   * exactly the pots in the bitmask `lit` full. Together they sum to the
   * chance a spin starts the bonus at all.
   */
  starts: number[][];
  /** The chance each pot is full when the bonus starts. */
  litRates: number[];
  /** The chance every pot is full at once: the super bonus. */
  superRate: number;
}

/** A spin's gems, pot by pot, with its chance; on a bonus spin, the chance by coin count too. */
interface GemDraw {
  gems: number[];
  p: number;
  byN?: number[];
}

const cache = new WeakMap<MachineDef, PotChain>();

/**
 * The pots, worked out exactly. Their progress carries from spin to spin, so
 * what the bonus is worth depends on where they stand when it starts, which
 * depends on every spin before. This is a Markov chain on the pots' fill.
 *
 * Between two bonuses the pots only ever fill, so the expected spins spent at
 * each fill, from wherever the last bonus left them, comes from one pass in
 * order of fill. The bonus spin then empties the full pots, which gives where
 * the next stretch starts. Repeating that from bonus to bonus settles on the
 * long run. A spin's chance of starting the bonus doesn't depend on the pots,
 * so the bonuses still come at the usual rate; only which pots are full
 * changes from one to the next.
 */
export function potChain(machine: MachineDef): PotChain {
  const hit = cache.get(machine);
  if (hit) return hit;
  const pots = machine.pots ?? [];
  const trigger = machine.bonus.trigger;
  const sizes = pots.map((p) => p.size);
  const strides = sizes.map((_, i) => sizes.slice(i + 1).reduce((a, s) => a * (s + 1), 1));
  const states = sizes.reduce((a, s) => a * (s + 1), 1);
  const masks = 1 << pots.length;
  // Gems ride on whatever starts the bonus: coins for hold & spin, else the scatter.
  const coins = countDistribution(machine.reels, machine.rows, triggerSymbol(machine));
  const keyOf = (gems: number[]) => gems.reduce((k, g, i) => k + g * strides[i]!, 0);

  // Every way a spin's coins can carry gems: each coin carries at most one, pot by pot in turn.
  const quiet = new Map<number, GemDraw>();
  const loud = new Map<number, GemDraw>();
  coins.forEach((pn, n) => {
    if (!pn) return;
    const into = n >= trigger ? loud : quiet;
    const deal = (pot: number, left: number, rest: number, gems: number[], p: number) => {
      if (pot === pots.length) {
        const key = keyOf(gems);
        const d = into.get(key) ?? { gems: [...gems], p: 0, byN: n >= trigger ? Array<number>(coins.length).fill(0) : undefined };
        d.p += pn * p;
        if (d.byN) d.byN[n]! += pn * p;
        into.set(key, d);
        return;
      }
      // Of the coins left, how many carry this pot's gem, given they carry none of the earlier pots'.
      const c = rest > 0 ? Math.min(1, pots[pot]!.chance / rest) : 0;
      let ways = 1;
      for (let k = 0; k <= left; k++) {
        if (k > 0) ways = (ways * (left - k + 1)) / k;
        const pk = ways * c ** k * (1 - c) ** (left - k);
        if (pk < 1e-18) continue;
        gems[pot] = Math.min(k, sizes[pot]!);
        deal(pot + 1, left - k, rest - pots[pot]!.chance, gems, p * pk);
      }
      gems[pot] = 0;
    };
    deal(0, n, 1, pots.map(() => 0), 1);
  });
  const quietDraws = [...quiet.values()];
  const loudDraws = [...loud.values()];

  const fill = (state: number, gems: number[]): { next: number; full: number } => {
    let next = 0;
    let full = 0;
    for (let i = 0; i < pots.length; i++) {
      const f = Math.min(sizes[i]!, Math.floor(state / strides[i]!) % (sizes[i]! + 1) + gems[i]!);
      next += f * strides[i]!;
      if (f === sizes[i]) full |= 1 << i;
    }
    return { next, full };
  };
  const emptied = (state: number, full: number): number => {
    let next = state;
    for (let i = 0; i < pots.length; i++) if (full & (1 << i)) next -= sizes[i]! * strides[i]!;
    return next;
  };

  // Where the pots stand as a stretch between bonuses starts; at first, empty.
  let start = new Float64Array(states);
  start[0] = 1;
  const into = Array.from({ length: masks }, () => new Float64Array(loudDraws.length));
  for (let round = 0; round < 1000; round++) {
    // Expected spins at each fill over the stretch: in order of fill, each takes what flows in and passes it on.
    const spins = Float64Array.from(start);
    for (let s = 0; s < states; s++) {
      if (!spins[s]) continue;
      let stay = 0;
      for (const d of quietDraws) if (fill(s, d.gems).next === s) stay += d.p;
      const here = (spins[s]! /= 1 - stay);
      for (const d of quietDraws) {
        const { next } = fill(s, d.gems);
        if (next !== s) spins[next]! += here * d.p;
      }
    }
    // The bonus spin: its gems go in, the full pots join the bonus, and they empty.
    const next = new Float64Array(states);
    for (const row of into) row.fill(0);
    for (let s = 0; s < states; s++) {
      if (!spins[s]) continue;
      loudDraws.forEach((d, i) => {
        const { next: filled, full } = fill(s, d.gems);
        into[full]![i]! += spins[s]!;
        next[emptied(filled, full)]! += spins[s]! * d.p;
      });
    }
    // Rounding nibbles at the total; keep it whole, and stop once a round changes nothing that matters.
    const total = next.reduce((a, b) => a + b, 0);
    let moved = 0;
    for (let s = 0; s < states; s++) {
      next[s]! /= total;
      moved += Math.abs(next[s]! - start[s]!);
    }
    start = next;
    if (moved < 1e-11) break;
  }

  // So far, per bonus: a stretch holds one. Per spin, that's times the chance a spin starts it.
  const perBonus = Array.from({ length: masks }, () => Array<number>(coins.length).fill(0));
  into.forEach((row, mask) => loudDraws.forEach((d, i) => d.byN!.forEach((p, n) => (perBonus[mask]![n]! += row[i]! * p))));
  const sum = perBonus.reduce((total, byN) => total + byN.reduce((a, b) => a + b, 0), 0);
  const rate = coins.slice(trigger).reduce((a, b) => a + b, 0);
  const starts = perBonus.map((byN) => byN.map((p) => (p / sum) * rate));
  const share = perBonus.map((byN) => byN.reduce((a, b) => a + b, 0) / sum);
  const litRates = pots.map((_, i) => share.reduce((sum, p, mask) => sum + (mask & (1 << i) ? p : 0), 0));
  const chain: PotChain = { starts, litRates, superRate: share[masks - 1] ?? 0 };
  cache.set(machine, chain);
  return chain;
}
