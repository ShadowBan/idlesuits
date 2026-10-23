import type { BonusBet } from '../bonus';
import type { Card } from '../cards';
import { threeCardHand, type ThreeCardHand } from '../three';
import { SIX_CARD_ROWS, sixCardRow } from '../uth/bonus';

export interface TcpBonusContext {
  player: readonly Card[];
  dealer: readonly Card[];
}

const PAIR_PLUS_ROWS: [ThreeCardHand[], string, number][] = [
  [['miniRoyal', 'straightFlush'], 'Straight flush', 40],
  [['trips'], 'Three of a kind', 30],
  [['straight'], 'Straight', 6],
  [['flush'], 'Flush', 4],
  [['pair'], 'Pair', 1],
];

/** Wizard of Odds Pairplus pay table 1 (2.32%): the player's three cards alone. */
export const TCP_PAIR_PLUS: BonusBet<TcpBonusContext> = {
  id: 'pairPlus',
  name: 'Pairplus',
  short: 'Pairplus',
  blurb: 'Your three cards alone: any pair or better.',
  rows: PAIR_PLUS_ROWS.map(([, label, pays]) => ({ label, pays })),
  edge: 512 / 22100,
  resolve: ({ player }) => {
    const hand = threeCardHand(player);
    return PAIR_PLUS_ROWS.findIndex(([hands]) => hands.includes(hand));
  },
};

/** Wizard of Odds pay table 1 (8.56%): the best five of the player's and dealer's six cards. */
export const TCP_SIX_CARD: BonusBet<TcpBonusContext> = {
  id: 'sixCard',
  name: '6-Card Bonus',
  short: '6-Card',
  blurb: 'Your three cards plus the dealer’s three: three of a kind or better.',
  rows: SIX_CARD_ROWS,
  edge: 0.085614,
  resolve: ({ player, dealer }) => sixCardRow([...player, ...dealer]),
};

const red = (card: Card) => card.suit === 'H' || card.suit === 'D';
const oneColor = (cards: readonly Card[]) => cards.every((c) => red(c) === red(cards[0]!));

/** Wizard of Odds (3.62%): all one color, yours or all six. */
export const TCP_PRIME: BonusBet<TcpBonusContext> = {
  id: 'prime',
  name: 'Prime',
  short: 'Prime',
  blurb: 'Your three cards all one color, or all six cards on the table.',
  rows: [
    { label: 'All six cards one color', pays: 4 },
    { label: 'Your three cards one color', pays: 3 },
  ],
  edge: 0.036206,
  resolve: ({ player, dealer }) => (oneColor([...player, ...dealer]) ? 0 : oneColor(player) ? 1 : -1),
};

export const TCP_BONUSES: readonly BonusBet<TcpBonusContext>[] = [TCP_PAIR_PLUS, TCP_SIX_CARD, TCP_PRIME];
