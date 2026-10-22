import { Category } from '../poker';

/** Multiplier paid per unit staked; a category missing from the table pushes. */
export type PayTable = Partial<Record<Category, number>>;

export interface UthRules {
  /** Pays only when the player beats the dealer; otherwise it pushes or loses with the hand. */
  blindPays: PayTable;
  /** Pays on the player's own hand, win or lose, even after a fold. */
  tripsPays: PayTable;
  /** The dealer needs at least this to open. */
  qualifies: Category;
  /** Play bet sizes, in antes, at each decision. */
  preflopRaises: number[];
  flopRaise: number;
  riverRaise: number;
}

export const UTH_RULES: UthRules = {
  blindPays: {
    [Category.Straight]: 1,
    [Category.Flush]: 1.5,
    [Category.FullHouse]: 3,
    [Category.Quads]: 10,
    [Category.StraightFlush]: 50,
    [Category.RoyalFlush]: 500,
  },
  tripsPays: {
    [Category.Trips]: 3,
    [Category.Straight]: 4,
    [Category.Flush]: 7,
    [Category.FullHouse]: 9,
    [Category.Quads]: 30,
    [Category.StraightFlush]: 40,
    [Category.RoyalFlush]: 50,
  },
  qualifies: Category.Pair,
  preflopRaises: [4, 3],
  flopRaise: 2,
  riverRaise: 1,
};

export function payOf(table: PayTable, category: Category): number {
  return table[category] ?? 0;
}
