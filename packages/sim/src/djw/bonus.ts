import type { BonusBet } from '../bonus';
import type { Card } from '../cards';
import { djCategoryOf, DjCategory, djIsNatural, djScore } from './evaluate';

export interface DjBonusContext {
  player: readonly Card[];
  dealer: readonly Card[];
  /** Folding forfeits the Bad Beat, though Trips still pays. */
  folded: boolean;
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

const BAD_BEAT_LINES: [string, number, DjCategory][] = [
  ['Royal flush', 500, DjCategory.RoyalFlush],
  ['Five of a kind', 500, DjCategory.FiveOfAKind],
  ['Straight flush', 500, DjCategory.StraightFlush],
  ['Four of a kind', 300, DjCategory.Quads],
  ['Full house', 200, DjCategory.FullHouse],
  ['Flush', 100, DjCategory.Flush],
  ['Straight', 50, DjCategory.Straight],
  ['Three of a kind', 15, DjCategory.Trips],
];

/**
 * Pennsylvania pay table DJWBB-03, as Hard Rock deals it. Both hands must be
 * three of a kind or better, and it pays on the one that loses, whichever side
 * that is. A tie loses, and so does a fold. No house edge is published; 13.9%
 * is measured (64M rounds, ±0.16%). Strategy cannot move it: every hand that
 * could qualify is played.
 */
export const DJ_BAD_BEAT: BonusBet<DjBonusContext> = {
  id: 'badBeat',
  name: 'Two-Way Bad Beat',
  short: 'Bad Beat',
  blurb: 'Both hands three of a kind or better: pays on the losing one, yours or the dealer’s. Folding forfeits it.',
  rows: BAD_BEAT_LINES.map(([label, pays]) => ({ label, pays })),
  edge: 0.139,
  resolve: ({ player, dealer, folded }) => {
    if (folded) return -1;
    const mine = djScore(player);
    const theirs = djScore(dealer);
    if (mine === theirs) return -1;
    if (djCategoryOf(mine) < DjCategory.Trips || djCategoryOf(theirs) < DjCategory.Trips) return -1;
    const loser = djCategoryOf(Math.min(mine, theirs));
    return BAD_BEAT_LINES.findIndex(([, , c]) => c === loser);
  },
};

export const DJ_BONUSES: readonly BonusBet<DjBonusContext>[] = [DJ_TRIPS, DJ_BAD_BEAT];
