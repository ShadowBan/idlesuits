import type { BonusBet } from '../bonus';
import type { Card } from '../cards';
import { djCategoryOf, DjCategory, djIsNatural, djScore } from './evaluate';

export interface DjBonusContext {
  player: readonly Card[];
}

const LINES: [string, number, DjCategory, boolean | null][] = [
  ['Five wilds', 2000, DjCategory.FiveWilds, null],
  ['Royal flush, natural', 1000, DjCategory.RoyalFlush, true],
  ['Straight flush, natural', 200, DjCategory.StraightFlush, true],
  ['Royal flush, wild', 90, DjCategory.RoyalFlush, false],
  ['Five of a kind', 70, DjCategory.FiveOfAKind, null],
  ['Four of a kind, natural', 60, DjCategory.Quads, true],
  ['Full house, natural', 30, DjCategory.FullHouse, true],
  ['Flush, natural', 25, DjCategory.Flush, true],
  ['Straight flush, wild', 25, DjCategory.StraightFlush, false],
  ['Straight, natural', 20, DjCategory.Straight, true],
  ['Three of a kind, natural', 6, DjCategory.Trips, true],
  ['Four of a kind, wild', 6, DjCategory.Quads, false],
  ['Full house, wild', 5, DjCategory.FullHouse, false],
  ['Flush, wild', 4, DjCategory.Flush, false],
  ['Straight, wild', 3, DjCategory.Straight, false],
  ['Three of a kind, wild', 1, DjCategory.Trips, false],
];

/** Wizard of Odds' "most commonly used" Trips table, 60-25-6 (6.16%): the player's hand alone, naturals paying more. */
export const DJ_TRIPS: BonusBet<DjBonusContext> = {
  id: 'trips',
  name: 'Trips',
  short: 'Trips',
  blurb: 'Your five cards alone: three of a kind or better. Natural hands, made without a wild, pay more.',
  rows: LINES.map(([label, pays]) => ({ label, pays })),
  edge: 0.061569,
  resolve: ({ player }) => {
    const score = djScore(player);
    const category = djCategoryOf(score);
    const natural = djIsNatural(player, score);
    return LINES.findIndex(([, , c, nat]) => c === category && (nat === null || nat === natural));
  },
};

export const DJ_BONUSES: readonly BonusBet<DjBonusContext>[] = [DJ_TRIPS];
