import type { BonusBet } from '../bonus';
import type { Card } from '../cards';
import { SIX_CARD_ROWS, sixCardRow } from '../uth/bonus';

export interface CspBonusContext {
  player: readonly Card[];
  upcard: Card;
}

/** Evolution's 5+1 Bonus (8.56%): the player's five cards plus the dealer's up card. */
export const CSP_FIVE_PLUS_ONE: BonusBet<CspBonusContext> = {
  id: 'fivePlusOne',
  name: '5+1 Bonus',
  short: '5+1',
  blurb: 'Your five cards plus the dealer’s up card: three of a kind or better.',
  rows: SIX_CARD_ROWS,
  edge: 0.085614,
  resolve: ({ player, upcard }) => sixCardRow([...player, upcard]),
};

export const CSP_BONUSES: readonly BonusBet<CspBonusContext>[] = [CSP_FIVE_PLUS_ONE];
