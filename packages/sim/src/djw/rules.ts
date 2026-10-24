import { DjCategory } from './evaluate';

export interface DjRules {
  /** What the Blind pays when the player wins; below a straight it pushes. */
  blindPays: Partial<Record<DjCategory, number>>;
  /** The Play bet, in antes. */
  play: number;
}

/** Shuffle Master's rules, as analysed by Wizard of Odds (3.47% per ante). */
export const DJ_RULES: DjRules = {
  blindPays: {
    [DjCategory.FiveWilds]: 1000,
    [DjCategory.RoyalFlush]: 50,
    [DjCategory.FiveOfAKind]: 10,
    [DjCategory.StraightFlush]: 9,
    [DjCategory.Quads]: 4,
    [DjCategory.FullHouse]: 3,
    [DjCategory.Flush]: 2,
    [DjCategory.Straight]: 1,
  },
  play: 2,
};
