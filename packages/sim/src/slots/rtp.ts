import { coinPay, freeSpinsStart, isFullTop, jackpotPay, levelAt, pickTiers, risen, symbolOf, triggerSymbol, upgradeMap, wedgePay, wheelsFor, windowAt } from './spin';
import { potChain } from './pots';
import type { CollectBonus, HoldSpinBonus, JackpotMeters, JackpotTier, MachineDef, PickBonus, PotPower, UpgradeBonus, WheelBonus } from './types';
import { JACKPOT_TIERS, powerOf } from './types';

/** A machine's payback, in total bets per spin, worked out exactly from its reels: no simulation. */
export interface SlotPayback {
  /** Everything together: 0.94 is 94%. */
  total: number;
  /** From way-pays on the base game. */
  ways: number;
  /** From collectors on the base game. */
  collect: number;
  /** From the bonus, everything in it: ways, cash and jackpots. */
  feature: number;
  /** Every jackpot, from wherever it's won. */
  jackpots: Record<JackpotTier, number>;
  /** The chance a spin starts the bonus. */
  triggerRate: number;
  /** What a bonus pays on average, in total bets. */
  featurePay: number;
  /** Hold & spin: coins on the screen when it ends, on average. */
  featureCoins: number;
  /** Hold & spin: the chance it fills the screen. Forge: the chance of a full screen of the top tier. */
  fullRate: number;
  /** Free spins played in a feature, on average. */
  featureSpins: number;
  /** Free spins: the chance a feature reaches each level, from level 0. The wheel: the chance a play reaches each wheel. */
  levelRates: number[];
  /** Pots: the chance each is full when the bonus starts, in the long run. */
  potRates: number[];
  /** Pots: the chance every one is full at once. */
  superRate: number;
}

type Strips = readonly (readonly string[])[];

function binomial(n: number, k: number, p: number): number {
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return c * p ** k * (1 - p) ** (n - k);
}

function noTiers(): Record<JackpotTier, number> {
  return { mini: 0, minor: 0, major: 0, grand: 0 };
}

/**
 * The expected way-pays on one spin of these strips, exactly. Way-pays factor
 * reel by reel: the reels stop independently, so the expected ways for a run
 * of k reels is the product of each reel's expected matching cells, times the
 * chance the next reel has none. `map` shows each symbol as another, for
 * upgraded reels. A wild multiplier `wildX` weights each wild cell by it: the
 * ways through a reel are then the sum of those weights, still independent
 * reel to reel.
 */
export function waysEV(machine: MachineDef, strips: Strips, map: Record<string, string> = {}, wildX = 1): number {
  const wild = symbolOf(machine, 'wild');
  let ways = 0;
  for (const symbol of machine.symbols) {
    if (symbol.kind !== 'pay' || !symbol.pays) continue;
    const mean: number[] = [];
    const empty: number[] = [];
    for (const strip of strips) {
      let sum = 0;
      let none = 0;
      for (let stop = 0; stop < strip.length; stop++) {
        const n = windowAt(strip, stop, machine.rows).reduce((sum, s) => {
          const shown = map[s] ?? s;
          return sum + (shown === symbol.id ? 1 : shown === wild ? wildX : 0);
        }, 0);
        sum += n;
        if (n === 0) none++;
      }
      mean.push(sum / strip.length);
      empty.push(none / strip.length);
    }
    for (let k = 3; k <= strips.length; k++) {
      let ev = symbol.pays[k - 3]!;
      for (let r = 0; r < k; r++) ev *= mean[r]!;
      if (k < strips.length) ev *= empty[k]!;
      ways += ev;
    }
  }
  return ways;
}

/** The chance of each number of `id` on a spin, by convolving each reel's own counts. */
export function countDistribution(strips: Strips, rows: number, id: string): number[] {
  let dist = [1];
  for (const strip of strips) {
    const reel = Array<number>(rows + 1).fill(0);
    for (let stop = 0; stop < strip.length; stop++) {
      reel[windowAt(strip, stop, rows).filter((s) => s === id).length]! += 1 / strip.length;
    }
    const next = Array<number>(dist.length + rows).fill(0);
    dist.forEach((p, a) => reel.forEach((q, b) => (next[a + b]! += p * q)));
    dist = next;
  }
  return dist;
}

/** The chance of each number of coins on a spin. */
export function coinDistribution(machine: MachineDef): number[] {
  return countDistribution(machine.reels, machine.rows, symbolOf(machine, 'coin')!);
}

/**
 * E[collectors × coins] on one spin of these strips: what a collect pays is
 * every collector times every coin, so this times a coin's mean value is its
 * expected pay. Reels are independent, so only a reel against itself needs
 * counting cell by cell.
 */
export function collectorCoinProduct(strips: Strips, rows: number, collector: string, coin: string): number {
  let ek = 0;
  let en = 0;
  let same = 0;
  for (const strip of strips) {
    let k = 0;
    let n = 0;
    let kn = 0;
    for (let stop = 0; stop < strip.length; stop++) {
      const w = windowAt(strip, stop, rows);
      const a = w.filter((s) => s === collector).length;
      const b = w.filter((s) => s === coin).length;
      k += a;
      n += b;
      kn += a * b;
    }
    k /= strip.length;
    n /= strip.length;
    kn /= strip.length;
    ek += k;
    en += n;
    same += kn - k * n;
  }
  return ek * en + same;
}

/** A coin's mean cash, and its mean pay from each jackpot. */
function coinMeans(machine: MachineDef, meters: JackpotMeters): { cash: number; jackpots: Record<JackpotTier, number> } {
  const values = machine.coinValues ?? [];
  const weights = values.reduce((sum, v) => sum + v.weight, 0);
  let cash = 0;
  const jackpots = noTiers();
  for (const { value, weight } of values) {
    if (value.kind === 'cash') cash += (value.x * weight) / weights;
    else jackpots[value.tier] += (coinPay(machine, value, meters) * weight) / weights;
  }
  return { cash, jackpots };
}

/**
 * Hold & spin, as a Markov chain on (coins held, respins left): for each
 * starting count, the expected coins at the end, the chance of a full screen,
 * and the expected sum, over every respin, of the coins on the screen after
 * it (what a boost on every coin is paid on). Exact, since every empty cell
 * lands a coin independently. `respins` is the count to reset to, the usual
 * one unless a pot adds more.
 */
export function holdSpinOutcomes(machine: MachineDef, respins?: number): { coins: number[]; full: number[]; boosts: number[] } {
  if (machine.bonus.kind !== 'holdSpin') throw new Error(`${machine.id} has no hold & spin`);
  const { land } = machine.bonus;
  const top = respins ?? machine.bonus.respins;
  const cells = machine.reels.length * machine.rows;
  // e, q, b [f][s]: expected final coins, chance of a full screen, and coins summed over the respins to come, from f coins with s respins left.
  const grid = () => Array.from({ length: cells + 1 }, () => Array<number>(top + 1).fill(0));
  const e = grid();
  const q = grid();
  const b = grid();
  for (let f = cells; f >= 0; f--) {
    for (let s = 0; s <= top; s++) {
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
      let boost = none * (f + b[f]![s - 1]!);
      for (let k = 1; k <= m; k++) {
        const pk = binomial(m, k, land);
        ev += pk * e[f + k]![top]!;
        full += pk * q[f + k]![top]!;
        boost += pk * (f + k + b[f + k]![top]!);
      }
      e[f]![s] = ev;
      q[f]![s] = full;
      b[f]![s] = boost;
    }
  }
  return { coins: e.map((row) => row[top]!), full: q.map((row) => row[top]!), boosts: b.map((row) => row[top]!) };
}

/** What a bonus is worth when it starts, in total bets, broken down. */
interface FeatureValue {
  /** Per feature. */
  pay: number;
  jackpots: Record<JackpotTier, number>;
  coins: number;
  full: number;
  spins: number;
  levelRates: number[];
}

/**
 * Free spins, as a Markov chain on (spins left, meter). Each spin's pay is
 * linear, so it's enough to know how many spins are played at each level, on
 * average, and what one spin at that level is worth. The meter's count on a
 * spin is the convolution of each reel's. The forge's Grand, paid once, needs
 * the chance of at least one full screen, and a full screen has no hammers.
 * Pots' powers move where the chain starts, stretch each mark's step, weight
 * the wilds in the ways, or multiply the doubloons' cash.
 */
export function freeSpinsValue(machine: MachineDef, bonus: UpgradeBonus | CollectBonus, scale: number, meters: JackpotMeters, powers: readonly PotPower[] = []): FeatureValue {
  const levels = bonus.maxLevel + 1;
  const cap = bonus.perLevel * bonus.maxLevel;
  const start = freeSpinsStart(bonus, powers);
  const most = start.spins + bonus.extraSpins * bonus.maxLevel;
  const times = powerOf(powers, 'marks')?.times ?? 1;
  const wildX = powerOf(powers, 'wilds')?.x ?? 1;
  const cashX = powerOf(powers, 'cash')?.times ?? 1;
  const mark = bonus.kind === 'upgrade' ? bonus.hammer : symbolOf(machine, 'collector')!;
  // The meter's step on a spin: each mark counts `times` over.
  const marks: number[] = [];
  countDistribution(bonus.reels, machine.rows, mark).forEach((p, k) => (marks[k * times] = (marks[k * times] ?? 0) + p));
  // Probability that a spin at each level is a full screen of the top tier, reel by reel.
  const fullAt = Array.from({ length: levels }, (_, level) => {
    if (bonus.kind !== 'upgrade') return 0;
    const map = upgradeMap(bonus, level);
    return bonus.reels.reduce((p, strip) => {
      let hits = 0;
      for (let stop = 0; stop < strip.length; stop++) {
        if (isFullTop(machine, bonus, [windowAt(strip, stop, machine.rows).map((s) => map[s] ?? s)])) hits++;
      }
      return p * (hits / strip.length);
    }, 1);
  });

  // spinsAt[s][m]: expected spins played at each level from s spins left and meter m.
  // grand[s][m]: the chance of at least one full screen from there. reach[s][m][l]: the chance of reaching level l.
  const size = most + bonus.extraSpins * bonus.maxLevel + 1;
  const spinsAt = Array.from({ length: size }, () => Array.from({ length: cap + 1 }, () => Array<number>(levels).fill(0)));
  const grand = Array.from({ length: size }, () => Array<number>(cap + 1).fill(0));
  const reach = Array.from({ length: size }, (_, s) =>
    Array.from({ length: cap + 1 }, (_, m) => Array.from({ length: levels }, (_, l) => (levelAt(bonus, m) >= l ? 1 : 0))),
  );
  // A spin can only move the meter up, so work from the top of the meter down; at the same meter, spins left go down by one.
  for (let m = cap; m >= 0; m--) {
    const level = levelAt(bonus, m);
    for (let s = 1; s < size; s++) {
      const here = spinsAt[s]![m]!;
      here[level]! += 1;
      let g = fullAt[level]!;
      const r = reach[s]![m]!;
      for (let l = 0; l < levels; l++) if (l > level) r[l] = 0;
      marks.forEach((p, k) => {
        if (!p) return;
        const next = Math.min(m + k, cap);
        const left = Math.min(size - 1, s - 1 + (levelAt(bonus, next) - level) * bonus.extraSpins);
        const there = spinsAt[left]![next]!;
        for (let l = 0; l < levels; l++) here[l]! += p * there[l]!;
        // A full screen holds no hammers, so it only comes with k = 0.
        g += (k === 0 ? p - fullAt[level]! : p) * grand[left]![next]!;
        for (let l = level + 1; l < levels; l++) r[l]! += p * reach[left]![next]![l]!;
      });
      grand[s]![m] = g;
    }
  }

  const perLevel = spinsAt[start.spins]![start.meter]!;
  const spins = perLevel.reduce((a, b) => a + b, 0);
  const jackpots = noTiers();
  let pay = 0;
  for (let level = 0; level < levels; level++) {
    if (!perLevel[level]) continue;
    const map = bonus.kind === 'upgrade' ? upgradeMap(bonus, level) : {};
    pay += perLevel[level]! * waysEV(machine, bonus.reels, map, wildX) * scale;
  }
  if (bonus.kind === 'collect') {
    const kn = collectorCoinProduct(bonus.reels, machine.rows, mark, symbolOf(machine, 'coin')!);
    const means = coinMeans(machine, meters);
    for (let level = 0; level < levels; level++) pay += perLevel[level]! * kn * means.cash * cashX * bonus.multipliers[level]!;
    for (const t of JACKPOT_TIERS) jackpots[t] = spins * kn * means.jackpots[t];
  } else {
    jackpots.grand = grand[start.spins]![start.meter]! * meters.grand;
  }
  pay += JACKPOT_TIERS.reduce((sum, t) => sum + jackpots[t], 0);
  return { pay, jackpots, coins: 0, full: grand[start.spins]![start.meter]!, spins, levelRates: reach[start.spins]![start.meter]! };
}

/**
 * The wheel, wheel by wheel from the outside in: each wedge equally likely,
 * "up" on to the next wheel. The ring's mean multiplies the cash; an encore
 * plays it all twice.
 */
function wheelValue(machine: MachineDef, bonus: WheelBonus, meters: JackpotMeters, powers: readonly PotPower[] = []): FeatureValue {
  const ring = powerOf(powers, 'ring');
  const ringMean = ring ? ring.values.reduce((s, v) => s + v.value * v.weight, 0) / ring.values.reduce((s, v) => s + v.weight, 0) : 1;
  const plays = powers.some((p) => p.kind === 'encore') ? 2 : 1;
  const jackpots = noTiers();
  let reachHere = 1;
  let pay = 0;
  const levelRates: number[] = [];
  for (const wedges of wheelsFor(bonus, powers)) {
    levelRates.push(reachHere);
    let up = 0;
    for (const w of wedges) {
      const p = reachHere / wedges.length;
      if (w.kind === 'up') up += p;
      else if (w.kind === 'jackpot') jackpots[w.tier] += plays * p * wedgePay(machine, w, meters);
      else pay += plays * p * w.x * ringMean;
    }
    reachHere = up;
  }
  pay += JACKPOT_TIERS.reduce((sum, t) => sum + jackpots[t], 0);
  return { pay, jackpots, coins: 0, full: 0, spins: 0, levelRates };
}

/** The pick: each jackpot on the board by its weight, raised a tier with the rise, and twice with the twin. */
function pickValue(machine: MachineDef, bonus: PickBonus, meters: JackpotMeters, powers: readonly PotPower[] = []): FeatureValue {
  const tiers = pickTiers(powers);
  const plays = powers.some((p) => p.kind === 'twin') ? 2 : 1;
  const weights = tiers.reduce((sum, t) => sum + bonus.weights[t], 0);
  const jackpots = noTiers();
  for (const t of tiers) {
    const won = risen(t, powers);
    jackpots[won] += (plays * bonus.weights[t] * jackpotPay(machine, won, meters)) / weights;
  }
  return { pay: JACKPOT_TIERS.reduce((sum, t) => sum + jackpots[t], 0), jackpots, coins: 0, full: 0, spins: 0, levelRates: [] };
}

/**
 * Hold & spin, from how often each mix of full pots and starting coins
 * starts it: the pots' long-run chain if the machine has pots, else just the
 * coin count. Every coin, starting or landed, carries a value drawn the same
 * way; a boost adds its mean to every coin after every respin; a collector
 * pays every coin's cash, boost included, again.
 */
function holdSpinValue(machine: MachineDef, bonus: HoldSpinBonus, meters: JackpotMeters, triggerDist: number[]): FeatureValue {
  const pots = machine.pots ?? [];
  const starts = pots.length ? potChain(machine).starts : [triggerDist.map((p, n) => (n >= bonus.trigger ? p : 0))];
  const rate = starts.reduce((sum, byN) => sum + byN.reduce((a, b) => a + b, 0), 0);
  const means = coinMeans(machine, meters);
  const outcomes = new Map<number, ReturnType<typeof holdSpinOutcomes>>();
  const jackpots = noTiers();
  let coins = 0;
  let full = 0;
  let cash = 0;
  starts.forEach((byN, lit) => {
    const powers = pots.filter((_, i) => lit & (1 << i)).map((p) => p.power);
    const extra = powers.find((p) => p.kind === 'extra')?.respins ?? bonus.respins;
    const boost = powers.find((p) => p.kind === 'boost');
    const boostMean = boost ? boost.values.reduce((s, v) => s + v.value * v.weight, 0) / boost.values.reduce((s, v) => s + v.weight, 0) : 0;
    const twice = powers.some((p) => p.kind === 'collect') ? 2 : 1;
    if (!outcomes.has(extra)) outcomes.set(extra, holdSpinOutcomes(machine, extra));
    const o = outcomes.get(extra)!;
    byN.forEach((p, n) => {
      if (!p) return;
      const w = p / rate;
      coins += w * o.coins[n]!;
      full += w * o.full[n]!;
      cash += w * twice * (o.coins[n]! * means.cash + boostMean * o.boosts[n]!);
    });
  });
  for (const t of JACKPOT_TIERS) jackpots[t] = coins * means.jackpots[t];
  jackpots.grand += full * meters.grand;
  const pay = cash + JACKPOT_TIERS.reduce((sum, t) => sum + jackpots[t], 0);
  return { pay, jackpots, coins, full, spins: 0, levelRates: [] };
}

/** What a bonus is worth with these pots' powers in it; hold & spin is handled with its coins, in `holdSpinValue`. */
export function bonusValue(machine: MachineDef, scale: number, meters: JackpotMeters, powers: readonly PotPower[] = []): FeatureValue {
  const bonus = machine.bonus;
  switch (bonus.kind) {
    case 'holdSpin':
      throw new Error('hold & spin is worth what its coins say: see holdSpinValue');
    case 'upgrade':
    case 'collect':
      return freeSpinsValue(machine, bonus, scale, meters, powers);
    case 'wheel':
      return wheelValue(machine, bonus, meters, powers);
    case 'pick':
      return pickValue(machine, bonus, meters, powers);
  }
}

function featureValue(machine: MachineDef, scale: number, meters: JackpotMeters, triggerDist: number[]): FeatureValue {
  const bonus = machine.bonus;
  if (bonus.kind === 'holdSpin') return holdSpinValue(machine, bonus, meters, triggerDist);
  const pots = machine.pots ?? [];
  if (!pots.length) return bonusValue(machine, scale, meters);
  // Each mix of full pots, as often as the pots' chain says it starts the bonus.
  const { starts } = potChain(machine);
  const shares = starts.map((byN) => byN.reduce((a, b) => a + b, 0));
  const rate = shares.reduce((a, b) => a + b, 0);
  const total: FeatureValue = { pay: 0, jackpots: noTiers(), coins: 0, full: 0, spins: 0, levelRates: [] };
  shares.forEach((share, mask) => {
    if (!share) return;
    const w = share / rate;
    const v = bonusValue(
      machine,
      scale,
      meters,
      pots.filter((_, i) => mask & (1 << i)).map((p) => p.power),
    );
    total.pay += w * v.pay;
    total.coins += w * v.coins;
    total.full += w * v.full;
    total.spins += w * v.spins;
    for (const t of JACKPOT_TIERS) total.jackpots[t] += w * v.jackpots[t];
    v.levelRates.forEach((r, l) => (total.levelRates[l] = (total.levelRates[l] ?? 0) + w * r));
  });
  return total;
}

/** The machine's payback per spin, exactly. */
export function slotPayback(machine: MachineDef, waysScale = 1, meters?: JackpotMeters): SlotPayback {
  const m = meters ?? { major: machine.jackpots.major, grand: machine.jackpots.grand };
  const ways = waysEV(machine, machine.reels) * waysScale;

  const jackpots = noTiers();
  let collect = 0;
  const collector = symbolOf(machine, 'collector');
  const coin = symbolOf(machine, 'coin');
  if (collector && coin && machine.coinValues) {
    const kn = collectorCoinProduct(machine.reels, machine.rows, collector, coin);
    const means = coinMeans(machine, m);
    collect = kn * means.cash;
    for (const t of JACKPOT_TIERS) {
      jackpots[t] += kn * means.jackpots[t];
      collect += kn * means.jackpots[t];
    }
  }

  const dist = countDistribution(machine.reels, machine.rows, triggerSymbol(machine));
  const triggerRate = dist.slice(machine.bonus.trigger).reduce((a, b) => a + b, 0);
  const value = featureValue(machine, waysScale, m, dist);
  for (const t of JACKPOT_TIERS) jackpots[t] += triggerRate * value.jackpots[t];
  const feature = triggerRate * value.pay;
  return {
    total: ways + collect + feature,
    ways,
    collect,
    feature,
    jackpots,
    triggerRate,
    featurePay: value.pay,
    featureCoins: value.coins,
    fullRate: value.full,
    featureSpins: value.spins,
    levelRates: value.levelRates,
    potRates: machine.pots?.length ? potChain(machine).litRates : [],
    superRate: machine.pots?.length ? potChain(machine).superRate : 0,
  };
}

/**
 * The way-pay multiplier that brings the machine to `target` payback with the
 * progressives at their seeds: everything else is left as designed and the
 * ways, base game and free spins alike, make up the difference. The payback
 * is linear in the multiplier. Never below zero.
 */
export function waysScaleFor(machine: MachineDef, target: number): number {
  const fixed = slotPayback(machine, 0).total;
  const slope = slotPayback(machine, 1).total - fixed;
  return Math.max(0, (target - fixed) / slope);
}
