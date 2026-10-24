import { Category } from '../poker';

export interface CspRules {
  /** What the Raise pays when the player beats a qualifying dealer, by the player's hand. */
  raisePays: Partial<Record<Category, number>>;
  /** The Raise is this many antes. */
  raise: number;
}

/** The U.S. pay table, per Wizard of Odds (5.22% per ante with optimal play). */
export const CSP_RULES: CspRules = {
  raisePays: {
    [Category.RoyalFlush]: 100,
    [Category.StraightFlush]: 50,
    [Category.Quads]: 20,
    [Category.FullHouse]: 7,
    [Category.Flush]: 5,
    [Category.Straight]: 4,
    [Category.Trips]: 3,
    [Category.TwoPair]: 2,
    [Category.Pair]: 1,
    [Category.HighCard]: 1,
  },
  raise: 2,
};

/** The dealer qualifies with ace-king or better. */
export function cspQualifies(category: Category, ranks: readonly number[]): boolean {
  return category >= Category.Pair || (ranks[0] === 14 && ranks[1] === 13);
}
