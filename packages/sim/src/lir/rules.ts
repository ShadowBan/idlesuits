import { Category, type PokerHand } from '../poker';

export interface LirRules {
  /** Paid on every bet still up, by the final five-card hand. */
  pays: Partial<Record<Category, number>>;
  /** A pair this high or better pays the pair line (10 = tens). */
  payPairFrom: number;
}

/** The standard pay table, per Wizard of Odds (3.51% per bet with optimal play). */
export const LIR_RULES: LirRules = {
  pays: {
    [Category.RoyalFlush]: 1000,
    [Category.StraightFlush]: 200,
    [Category.Quads]: 50,
    [Category.FullHouse]: 11,
    [Category.Flush]: 8,
    [Category.Straight]: 5,
    [Category.Trips]: 3,
    [Category.TwoPair]: 2,
    [Category.Pair]: 1,
  },
  payPairFrom: 10,
};

/** N:1 on every bet still up, or -1 when the hand loses. */
export function lirMultiplier(hand: PokerHand, rules: LirRules = LIR_RULES): number {
  if (hand.category === Category.Pair && (hand.madeRank ?? 0) < rules.payPairFrom) return -1;
  return rules.pays[hand.category] ?? -1;
}
