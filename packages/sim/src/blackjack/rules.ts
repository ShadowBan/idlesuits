import type { Rank } from '../cards';

export interface BjRules {
  decks: number;
  /** Dealer draws to soft 17 rather than standing. */
  hitsSoft17: boolean;
  /** Player blackjack pays this multiple of the bet. */
  blackjackPays: number;
  /** A dealer total of exactly 22 pushes every hand that did not bust. */
  push22: boolean;
  /** Two-card hard totals the house doubles for free. */
  freeDoubleTotals: number[];
  /** Pairs of this value cannot be split at all. */
  noSplitValue: number;
  /** Including the first; four means three splits. */
  maxHands: number;
  /** Split aces draw one card each and then stand. */
  splitAcesOneCard: boolean;
  /** Paid doubles on totals the house will not cover, real-money hands only. */
  paidDoubles: boolean;
}

/** Free Bet Blackjack as dealt: six decks, H17, 3:2, push 22. */
export const FREE_BET_RULES: BjRules = {
  decks: 6,
  hitsSoft17: true,
  blackjackPays: 1.5,
  push22: true,
  freeDoubleTotals: [9, 10, 11],
  noSplitValue: 10,
  maxHands: 4,
  splitAcesOneCard: true,
  paidDoubles: true,
};

/** Blackjack counts every ten-valued card the same; an ace is 11 until it must be 1. */
export function cardValue(rank: Rank): number {
  return rank >= 10 && rank <= 13 ? 10 : rank === 14 ? 11 : rank;
}
