import type { BonusBet } from '../bonus';
import type { Card } from '../cards';
import { bestFour, fourCategoryOf, FourCategory, fourTopRank } from '../four';

export interface C4pBonusContext {
  player: readonly Card[];
  dealer: readonly Card[];
}

const LINES: [string, number, (category: FourCategory, top: number) => boolean][] = [
  ['Four of a kind', 50, (c) => c === FourCategory.Quads],
  ['Straight flush', 40, (c) => c === FourCategory.StraightFlush],
  ['Three of a kind', 7, (c) => c === FourCategory.Trips],
  ['Flush', 4, (c) => c === FourCategory.Flush],
  ['Straight', 3, (c) => c === FourCategory.Straight],
  ['Two pair', 2, (c) => c === FourCategory.TwoPair],
  ['Pair of queens or better', 1, (c, top) => c === FourCategory.Pair && top >= 12],
];

/** Wizard of Odds pay table 4, which "most Las Vegas casinos use" (6.78%): the player's best four cards. */
export const C4P_QUEENS_UP: BonusBet<C4pBonusContext> = {
  id: 'queensUp',
  name: 'Queens Up',
  short: 'Queens Up',
  blurb: 'Your best four cards alone: a pair of queens or better.',
  rows: LINES.map(([label, pays]) => ({ label, pays })),
  edge: 0.067772,
  resolve: ({ player }) => {
    const { score } = bestFour(player);
    const category = fourCategoryOf(score);
    const top = fourTopRank(score);
    return LINES.findIndex(([, , test]) => test(category, top));
  },
};

export const C4P_BONUSES: readonly BonusBet<C4pBonusContext>[] = [C4P_QUEENS_UP];
