import type { BonusBet } from '../bonus';
import type { Card } from '../cards';
import { threeCardHand, type ThreeCardHand } from '../three';

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
