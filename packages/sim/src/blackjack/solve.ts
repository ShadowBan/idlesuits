import { cardValue, type BjRules } from './rules';
import type { Action, StrategyChart, StrategyTables } from './strategy';

/**
 * An infinite-deck solver. It ignores the cards already dealt, which costs a
 * little accuracy against a six-deck shoe but produces the same charts a
 * casino prints, and it derives them from the rules instead of hard-coding.
 */

/** Ranks as blackjack sees them: 2..9, ten-value, ace. */
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const P = RANKS.map((r) => (r === 10 ? 4 / 13 : 1 / 13));

interface Count {
  total: number;
  /** Aces still counted as eleven. */
  aces: number;
}

function add({ total, aces }: Count, value: number): Count {
  let t = total + value;
  let a = aces + (value === 11 ? 1 : 0);
  while (t > 21 && a > 0) {
    t -= 10;
    a--;
  }
  return { total: t, aces: a };
}

/** Dealer end states: totals 17..21, exactly 22, or 23+. */
export type DealerOutcome = 17 | 18 | 19 | 20 | 21 | 22 | 23;
type Dist = Map<DealerOutcome, number>;

function mergeInto(target: Dist, source: Dist, weight: number) {
  for (const [k, v] of source) target.set(k, (target.get(k) ?? 0) + v * weight);
}

export class BjSolver {
  private readonly dealerMemo = new Map<string, Dist>();
  private readonly handMemo = new Map<string, number>();

  constructor(private readonly rules: BjRules) {}

  /** Where the dealer's hand ends up, given an upcard and no dealer blackjack. */
  dealerDist(upcard: number): Dist {
    const start: Count = { total: upcard, aces: upcard === 11 ? 1 : 0 };
    const dist: Dist = new Map();
    // The dealer has already peeked, so the hole card cannot complete a blackjack.
    const excluded = upcard === 11 ? 10 : upcard === 10 ? 11 : null;
    let weight = 0;
    RANKS.forEach((rank, i) => {
      if (rank === excluded) return;
      weight += P[i]!;
    });
    RANKS.forEach((rank, i) => {
      if (rank === excluded) return;
      mergeInto(dist, this.playDealer(add(start, rank)), P[i]! / weight);
    });
    return dist;
  }

  private playDealer(count: Count): Dist {
    const key = `${count.total}|${count.aces}`;
    const hit = this.dealerMemo.get(key);
    if (hit) return hit;

    const dist: Dist = new Map();
    const soft = count.aces > 0;
    const stands = count.total > 21 || count.total > 17 || (count.total === 17 && !(soft && this.rules.hitsSoft17));
    if (stands) {
      dist.set(Math.min(count.total, 23) as DealerOutcome, 1);
    } else {
      RANKS.forEach((rank, i) => mergeInto(dist, this.playDealer(add(count, rank)), P[i]!));
    }
    this.dealerMemo.set(key, dist);
    return dist;
  }

  /**
   * What standing on `total` is worth, per unit of win. `lossUnit` is 0 for a
   * free-bet hand, which cannot lose anything, and -1 for real money.
   */
  standEv(total: number, dealer: Dist, lossUnit: number, winUnit = 1): number {
    let ev = 0;
    for (const [outcome, p] of dealer) {
      if (outcome === 22 && this.rules.push22) continue; // push
      if (outcome >= 23 || total > outcome) ev += p * winUnit;
      else if (total < outcome) ev += p * lossUnit;
    }
    return ev;
  }

  /** Best EV from here, drawing or standing. Doubling is handled by the caller. */
  private playEv(count: Count, dealer: Dist, upcard: number, lossUnit: number): number {
    if (count.total > 21) return lossUnit;
    const key = `${count.total}|${count.aces}|${upcard}|${lossUnit}`;
    const memo = this.handMemo.get(key);
    if (memo !== undefined) return memo;

    const stand = this.standEv(count.total, dealer, lossUnit);
    let hit = 0;
    RANKS.forEach((rank, i) => {
      hit += P[i]! * this.playEv(add(count, rank), dealer, upcard, lossUnit);
    });
    const best = Math.max(stand, hit);
    this.handMemo.set(key, best);
    return best;
  }

  /** One card then stop, at double stakes. */
  private doubleEv(count: Count, dealer: Dist, winUnit: number, lossUnit: number): number {
    let ev = 0;
    RANKS.forEach((rank, i) => {
      const after = add(count, rank);
      ev += P[i]! * (after.total > 21 ? lossUnit : this.standEv(after.total, dealer, lossUnit, winUnit));
    });
    return ev;
  }

  /**
   * Splitting, approximated as two independent hands: the first keeps the real
   * wager, the second rides on the house's free bet. Resplits are ignored,
   * which slightly understates a split's value.
   */
  private splitEv(pairValue: number, dealer: Dist, upcard: number, lossUnit: number): number {
    const oneHand = (unitLoss: number) => {
      if (pairValue === 11 && this.rules.splitAcesOneCard) {
        let ev = 0;
        RANKS.forEach((rank, i) => {
          const after = add({ total: 11, aces: 1 }, rank);
          ev += P[i]! * this.standEv(after.total, dealer, unitLoss);
        });
        return ev;
      }
      let ev = 0;
      RANKS.forEach((rank, i) => {
        const start = add({ total: pairValue, aces: pairValue === 11 ? 1 : 0 }, rank);
        ev += P[i]! * this.bestTwoCardEv(start, dealer, upcard, unitLoss, false).ev;
      });
      return ev;
    };
    // The free hand can lose nothing, so it is solved with a zero loss unit.
    return oneHand(lossUnit) + oneHand(0);
  }

  /** The best action on a two-card hand, and what it is worth. */
  bestTwoCardEv(
    count: Count,
    dealer: Dist,
    upcard: number,
    lossUnit: number,
    canSplit: boolean,
    pairValue?: number,
  ): { action: Action; ev: number } {
    const stand = this.standEv(count.total, dealer, lossUnit);
    let hit = 0;
    RANKS.forEach((rank, i) => {
      hit += P[i]! * this.playEv(add(count, rank), dealer, upcard, lossUnit);
    });

    let best: { action: Action; ev: number } = stand >= hit ? { action: 'S', ev: stand } : { action: 'H', ev: hit };

    const hard = count.aces === 0;
    const free = hard && this.rules.freeDoubleTotals.includes(count.total);
    if (free) {
      // The house covers the second unit: a win pays two, a loss still costs one.
      const ev = this.doubleEv(count, dealer, 2, lossUnit);
      if (ev > best.ev) best = { action: stand > hit ? 'Ds' : 'D', ev };
    } else if (this.rules.paidDoubles && lossUnit !== 0) {
      const ev = this.doubleEv(count, dealer, 2, lossUnit * 2);
      if (ev > best.ev) best = { action: stand > hit ? 'Ds' : 'D', ev };
    }

    if (canSplit && pairValue !== undefined && pairValue !== this.rules.noSplitValue) {
      const ev = this.splitEv(pairValue, dealer, upcard, lossUnit);
      if (ev > best.ev) best = { action: 'P', ev };
    }
    return best;
  }

  /** Solves both charts: real-money hands, and free-bet hands that cannot lose. */
  solve(): StrategyTables {
    const regimes = [
      ['real', -1],
      ['free', 0],
    ] as const;
    const tables = {} as StrategyTables;

    for (const [regime, lossUnit] of regimes) {
      const hard: StrategyChart = {};
      const soft: StrategyChart = {};
      const pairs: StrategyChart = {};

      for (const upcard of RANKS) {
        const dealer = this.dealerDist(upcard);

        for (let total = 5; total <= 20; total++) {
          (hard[total] ??= {})[upcard] = this.bestTwoCardEv({ total, aces: 0 }, dealer, upcard, lossUnit, false).action;
        }
        for (let other = 2; other <= 9; other++) {
          const total = 11 + other;
          (soft[total] ??= {})[upcard] = this.bestTwoCardEv({ total, aces: 1 }, dealer, upcard, lossUnit, false).action;
        }
        for (const pair of RANKS) {
          const count: Count = pair === 11 ? { total: 12, aces: 1 } : { total: pair * 2, aces: 0 };
          const best = this.bestTwoCardEv(count, dealer, upcard, lossUnit, true, pair);
          (pairs[pair] ??= {})[upcard] = best.action;
        }
      }
      tables[regime] = { hard, soft, pairs };
    }
    return tables;
  }
}

export function solveStrategy(rules: BjRules): StrategyTables {
  return new BjSolver(rules).solve();
}

export { cardValue };
