import { coinPay, windowAt } from './spin';
import type { JackpotMeters, JackpotTier, MachineDef } from './types';

/** A machine's payback, in total bets per spin, worked out exactly from its reels: no simulation. */
export interface SlotPayback {
  /** Everything together: 0.94 is 94%. */
  total: number;
  /** From way-pays. */
  ways: number;
  /** From the feature: coins' cash, then each jackpot. */
  cash: number;
  jackpots: Record<JackpotTier, number>;
  /** The chance a spin starts hold & spin. */
  triggerRate: number;
  /** Coins on the screen when the feature ends, on average. */
  featureCoins: number;
  /** The chance the feature fills the screen. */
  fullRate: number;
}

function binomial(n: number, k: number, p: number): number {
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return c * p ** k * (1 - p) ** (n - k);
}

/**
 * The feature, as a Markov chain on (coins held, respins left): for each
 * starting count, the expected coins at the end and the chance of a full
 * screen. Exact, since every empty cell lands a coin independently.
 */
export function holdSpinOutcomes(machine: MachineDef): { coins: number[]; full: number[] } {
  const { respins, land } = machine.holdSpin;
  const cells = machine.reels.length * machine.rows;
  // e[f][s], q[f][s]: expected final coins and chance of a full screen from f coins with s respins left.
  const e: number[][] = Array.from({ length: cells + 1 }, () => Array<number>(respins + 1).fill(0));
  const q: number[][] = Array.from({ length: cells + 1 }, () => Array<number>(respins + 1).fill(0));
  for (let f = cells; f >= 0; f--) {
    for (let s = 0; s <= respins; s++) {
      if (f === cells) {
        e[f]![s] = cells;
        q[f]![s] = 1;
        continue;
      }
      if (s === 0) {
        e[f]![s] = f;
        continue;
      }
      const m = cells - f;
      const none = binomial(m, 0, land);
      let ev = none * e[f]![s - 1]!;
      let full = none * q[f]![s - 1]!;
      for (let k = 1; k <= m; k++) {
        const pk = binomial(m, k, land);
        ev += pk * e[f + k]![respins]!;
        full += pk * q[f + k]![respins]!;
      }
      e[f]![s] = ev;
      q[f]![s] = full;
    }
  }
  return { coins: e.map((row) => row[respins]!), full: q.map((row) => row[respins]!) };
}

/** The chance of each number of coins on a spin, by convolving each reel's own counts. */
export function coinDistribution(machine: MachineDef): number[] {
  const coin = machine.symbols.find((s) => s.kind === 'coin')!.id;
  let dist = [1];
  for (const strip of machine.reels) {
    const reel = Array<number>(machine.rows + 1).fill(0);
    for (let stop = 0; stop < strip.length; stop++) {
      reel[windowAt(strip, stop, machine.rows).filter((s) => s === coin).length]! += 1 / strip.length;
    }
    const next = Array<number>(dist.length + machine.rows).fill(0);
    dist.forEach((p, a) => reel.forEach((q, b) => (next[a + b]! += p * q)));
    dist = next;
  }
  return dist;
}

/**
 * The machine's payback per spin, exactly. Way-pays factor reel by reel: the
 * reels stop independently, so the expected ways for a run of k reels is the
 * product of each reel's expected matching cells, times the chance the next
 * reel has none.
 */
export function slotPayback(machine: MachineDef, waysScale = 1, meters?: JackpotMeters): SlotPayback {
  const m = meters ?? { major: machine.jackpots.major, grand: machine.jackpots.grand };
  const wild = machine.symbols.find((s) => s.kind === 'wild')?.id;

  let ways = 0;
  for (const symbol of machine.symbols) {
    if (symbol.kind !== 'pay' || !symbol.pays) continue;
    const mean: number[] = [];
    const empty: number[] = [];
    for (const strip of machine.reels) {
      let sum = 0;
      let none = 0;
      for (let stop = 0; stop < strip.length; stop++) {
        const n = windowAt(strip, stop, machine.rows).filter((s) => s === symbol.id || s === wild).length;
        sum += n;
        if (n === 0) none++;
      }
      mean.push(sum / strip.length);
      empty.push(none / strip.length);
    }
    for (let k = 3; k <= machine.reels.length; k++) {
      let ev = symbol.pays[k - 3]!;
      for (let r = 0; r < k; r++) ev *= mean[r]!;
      if (k < machine.reels.length) ev *= empty[k]!;
      ways += ev;
    }
  }
  ways *= waysScale;

  const dist = coinDistribution(machine);
  const outcomes = holdSpinOutcomes(machine);
  let triggerRate = 0;
  let coins = 0;
  let fullRate = 0;
  dist.forEach((p, n) => {
    if (n < machine.holdSpin.trigger) return;
    triggerRate += p;
    coins += p * outcomes.coins[n]!;
    fullRate += p * outcomes.full[n]!;
  });

  // Every coin, starting or landed, carries a value drawn the same way.
  const weights = machine.holdSpin.values.reduce((sum, v) => sum + v.weight, 0);
  let cash = 0;
  const jackpots: Record<JackpotTier, number> = { mini: 0, minor: 0, major: 0, grand: fullRate * m.grand };
  for (const { value, weight } of machine.holdSpin.values) {
    const share = (coins * weight) / weights;
    if (value.kind === 'cash') cash += share * value.x;
    else jackpots[value.tier] += share * coinPay(machine, value, m);
  }
  const total = ways + cash + jackpots.mini + jackpots.minor + jackpots.major + jackpots.grand;
  return {
    total,
    ways,
    cash,
    jackpots,
    triggerRate,
    featureCoins: triggerRate ? coins / triggerRate : 0,
    fullRate: triggerRate ? fullRate / triggerRate : 0,
  };
}

/**
 * The way-pay multiplier that brings the machine to `target` payback with the
 * progressives at their seeds: the feature is left as designed and the ways
 * make up the difference. Never below zero.
 */
export function waysScaleFor(machine: MachineDef, target: number): number {
  const base = slotPayback(machine);
  return Math.max(0, (target - (base.total - base.ways)) / base.ways);
}
