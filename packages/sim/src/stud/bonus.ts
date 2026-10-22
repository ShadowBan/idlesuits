import type { BonusBet } from '../bonus';
import type { Card } from '../cards';

export type ThreeCardHand = 'miniRoyal' | 'straightFlush' | 'trips' | 'straight' | 'flush' | 'pair' | 'high';

/**
 * Three-card poker ranks: a straight beats a flush, because with three cards
 * it is the rarer of the two. Aces play high or low, but K-A-2 is no straight.
 */
export function threeCardHand(cards: readonly Card[]): ThreeCardHand {
  const [a, b, c] = [...cards].map((card) => card.rank).sort((x, y) => y - x) as [number, number, number];
  if (a === c) return 'trips';
  if (a === b || b === c) return 'pair';
  const flush = cards[0]!.suit === cards[1]!.suit && cards[1]!.suit === cards[2]!.suit;
  const straight = (a - b === 1 && b - c === 1) || (a === 14 && b === 3 && c === 2);
  if (straight && flush) return a === 14 && b === 13 ? 'miniRoyal' : 'straightFlush';
  if (straight) return 'straight';
  if (flush) return 'flush';
  return 'high';
}

export interface StudBonusContext {
  hole: readonly Card[];
  community: readonly Card[];
}

const THREE_CARD_ROWS: [ThreeCardHand, string, number][] = [
  ['miniRoyal', 'Mini royal (A-K-Q suited)', 50],
  ['straightFlush', 'Straight flush', 40],
  ['trips', 'Three of a kind', 30],
  ['straight', 'Straight', 6],
  ['flush', 'Flush', 4],
  ['pair', 'Pair', 1],
];

/** New Jersey pay table 4 (2.14%): the three community cards on their own. */
export const STUD_THREE_CARD: BonusBet<StudBonusContext> = {
  id: 'threeCard',
  name: '3-Card Bonus',
  short: '3-Card',
  blurb: 'The three community cards on their own: any pair or better.',
  rows: THREE_CARD_ROWS.map(([, label, pays]) => ({ label, pays })),
  edge: 472 / 22100,
  resolve: ({ community }) => THREE_CARD_ROWS.findIndex(([hand]) => hand === threeCardHand(community)),
};

export const STUD_BONUSES: readonly BonusBet<StudBonusContext>[] = [STUD_THREE_CARD];
