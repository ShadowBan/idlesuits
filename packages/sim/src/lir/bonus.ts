import type { BonusBet } from '../bonus';
import type { Card } from '../cards';
import { Category, evaluatePoker } from '../poker';
import { threeCardHand, type ThreeCardHand } from '../three';

export interface LirBonusContext {
  /** The player's own three cards. */
  hole: readonly Card[];
  /** Both community cards. */
  community: readonly Card[];
}

const THREE_ROWS: [ThreeCardHand, string, number][] = [
  ['miniRoyal', 'Mini royal (A-K-Q suited)', 50],
  ['straightFlush', 'Straight flush', 40],
  ['trips', 'Three of a kind', 30],
  ['straight', 'Straight', 6],
  ['flush', 'Flush', 3],
  ['pair', 'Pair', 1],
];

/** Wizard of Odds' most common table (7.10%): the player's three cards alone. */
export const LIR_THREE_CARD: BonusBet<LirBonusContext> = {
  id: 'threeCard',
  name: '3-Card Bonus',
  short: '3-Card',
  blurb: 'Your own three cards: any pair or better.',
  rows: THREE_ROWS.map(([, label, pays]) => ({ label, pays })),
  edge: 1568 / 22100,
  resolve: ({ hole }) => THREE_ROWS.findIndex(([hand]) => hand === threeCardHand(hole)),
};

const FIVE_ROWS: [string, number, (category: Category, pair: number) => boolean][] = [
  ['Royal flush', 20000, (c) => c === Category.RoyalFlush],
  ['Straight flush', 1000, (c) => c === Category.StraightFlush],
  ['Four of a kind', 100, (c) => c === Category.Quads],
  ['Full house', 75, (c) => c === Category.FullHouse],
  ['Flush', 50, (c) => c === Category.Flush],
  ['Straight', 25, (c) => c === Category.Straight],
  ['Three of a kind', 4, (c) => c === Category.Trips],
  ['Two pair', 3, (c) => c === Category.TwoPair],
  ['Tens or better', 1, (c, pair) => c === Category.Pair && pair >= 10],
];

/**
 * Wizard of Odds pay table 2, the one most casinos he surveyed post (23.73%).
 * Quoted "for one": tens or better returns the stake, a push.
 */
export const LIR_FIVE_CARD: BonusBet<LirBonusContext> = {
  id: 'fiveCard',
  name: '5-Card Bonus',
  short: '5-Card',
  blurb: 'Your final five cards: tens or better. Paid "for one", so tens or better just returns the bet.',
  rows: FIVE_ROWS.map(([label, forOne]) => ({ label, pays: forOne - 1 })),
  edge: 0.23727,
  forOne: true,
  resolve: ({ hole, community }) => {
    const hand = evaluatePoker([...hole, ...community]);
    return FIVE_ROWS.findIndex(([, , test]) => test(hand.category, hand.madeRank ?? 0));
  },
};

export const LIR_BONUSES: readonly BonusBet<LirBonusContext>[] = [LIR_THREE_CARD, LIR_FIVE_CARD];
