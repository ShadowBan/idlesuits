import { Category } from '../poker';
import type { PokerHand } from '../poker';

export interface StudRules {
  /** Multiplier paid on every bet for each category. Missing categories lose. */
  pays: Partial<Record<Category, number>>;
  /** A pair at least this high pays the pair line; below it, a push if at least `pushPairFrom`. */
  payPairFrom: number;
  pushPairFrom: number;
  /** Street bet sizes allowed, in antes. */
  raises: number[];
}

export const STUD_RULES: StudRules = {
  pays: {
    [Category.TwoPair]: 2,
    [Category.Trips]: 3,
    [Category.Straight]: 4,
    [Category.Flush]: 6,
    [Category.FullHouse]: 10,
    [Category.Quads]: 40,
    [Category.StraightFlush]: 100,
    [Category.RoyalFlush]: 500,
  },
  payPairFrom: 11,
  pushPairFrom: 6,
  raises: [1, 3],
};

/** What every bet on the table does with this final hand: N:1, 0 for a push, -1 to lose. */
export function studMultiplier(hand: PokerHand, rules: StudRules = STUD_RULES): number {
  if (hand.category === Category.Pair) {
    const pair = hand.madeRank ?? 0;
    if (pair >= rules.payPairFrom) return 1;
    if (pair >= rules.pushPairFrom) return 0;
    return -1;
  }
  return rules.pays[hand.category] ?? -1;
}
