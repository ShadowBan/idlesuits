import type { BonusBet } from '../bonus';
import type { Card } from '../cards';
import type { HandTotal } from './hand';

export interface BjBonusContext {
  /** Free bets the house put up this round: one per free split and one per free double. */
  freeBets: number;
  dealer: readonly Card[];
  dealerTotal: HandTotal;
  dealerBlackjack: boolean;
}

/**
 * Wizard of Odds pay table 1. Wizard quotes 5.77% from a simulation that wins
 * 16.66% of rounds, but under today's rules a round earns a free bet 16.18% of
 * the time (exactly, from the first two cards), so it runs at 8.74% (40M rounds,
 * ±0.12%). Seven is the most a round can earn: three splits and four doubles.
 */
export const BJ_POT_OF_GOLD: BonusBet<BjBonusContext> = {
  id: 'potOfGold',
  name: 'Pot of Gold',
  short: 'Gold',
  blurb: 'Counts the free bets the house gives you this round.',
  rows: [7, 6, 5, 4, 3, 2, 1].map((n, i) => ({
    label: `${n} free bet${n > 1 ? 's' : ''}`,
    pays: [1000, 300, 100, 60, 30, 10, 3][i]!,
  })),
  edge: 0.0874,
  resolve: ({ freeBets }) => (freeBets > 0 ? 7 - Math.min(freeBets, 7) : -1),
};

/** Wizard of Odds (11.76%): the dealer always draws out for this bet, even if every hand has busted. */
export const BJ_PUSH_22: BonusBet<BjBonusContext> = {
  id: 'push22',
  name: 'Push 22',
  short: 'Push 22',
  blurb: 'Pays when the dealer finishes on exactly 22.',
  rows: [{ label: 'Dealer makes 22', pays: 11 }],
  edge: 0.117565,
  resolve: ({ dealerTotal, dealerBlackjack }) => (!dealerBlackjack && dealerTotal.total === 22 ? 0 : -1),
};

export const BJ_BONUSES: readonly BonusBet<BjBonusContext>[] = [BJ_POT_OF_GOLD, BJ_PUSH_22];
