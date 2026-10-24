import type { Card } from './cards';

/**
 * Four-card poker hands, as Crazy 4 Poker ranks them: with four cards, three
 * of a kind is rarer than a flush or straight, so it ranks above both.
 */
export enum FourCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  Straight = 3,
  Flush = 4,
  Trips = 5,
  StraightFlush = 6,
  Quads = 7,
}

export const FOUR_CARD_NAMES: Record<FourCategory, string> = {
  [FourCategory.HighCard]: 'High card',
  [FourCategory.Pair]: 'Pair',
  [FourCategory.TwoPair]: 'Two pair',
  [FourCategory.Straight]: 'Straight',
  [FourCategory.Flush]: 'Flush',
  [FourCategory.Trips]: 'Three of a kind',
  [FourCategory.StraightFlush]: 'Straight flush',
  [FourCategory.Quads]: 'Four of a kind',
};

const UNIT = 15 ** 4;

function pack(category: number, a = 0, b = 0, c = 0, d = 0): number {
  return (((category * 15 + a) * 15 + b) * 15 + c) * 15 + d;
}

export function fourCategoryOf(score: number): FourCategory {
  return Math.floor(score / UNIT) as FourCategory;
}

/** The top rank in a score: the quads, trips, pair or high card that leads the hand. */
export function fourTopRank(score: number): number {
  return Math.floor(score / 15 ** 3) % 15;
}

/** Score exactly four cards. A-2-3-4 is the lowest straight, J-Q-K-A the highest. */
export function fourCardScore(cards: readonly Card[]): number {
  const r = [cards[0]!.rank, cards[1]!.rank, cards[2]!.rank, cards[3]!.rank].sort((x, y) => y - x) as [
    number,
    number,
    number,
    number,
  ];
  const s = cards[0]!.suit;
  const flush = cards[1]!.suit === s && cards[2]!.suit === s && cards[3]!.suit === s;
  const [a, b, c, d] = r;

  if (a === d) return pack(FourCategory.Quads, a);
  if (a === c) return pack(FourCategory.Trips, a, d);
  if (b === d) return pack(FourCategory.Trips, b, a);

  const distinct = a !== b && b !== c && c !== d;
  let straight = 0;
  if (distinct) {
    if (a - d === 3) straight = a;
    else if (a === 14 && b === 4 && d === 2) straight = 4; // A-2-3-4
  }
  if (straight && flush) return pack(FourCategory.StraightFlush, straight);
  if (flush) return pack(FourCategory.Flush, a, b, c, d);
  if (straight) return pack(FourCategory.Straight, straight);

  if (a === b && c === d) return pack(FourCategory.TwoPair, a, c);
  if (a === b) return pack(FourCategory.Pair, a, c, d);
  if (b === c) return pack(FourCategory.Pair, b, a, d);
  if (c === d) return pack(FourCategory.Pair, c, a, b);
  return pack(FourCategory.HighCard, a, b, c, d);
}

const scratch = new Array<Card>(4);

/** The best four of five cards: its score, and which card is left out. */
export function bestFour(cards: readonly Card[]): { score: number; discard: number } {
  let best = -1;
  let discard = 0;
  for (let skip = 0; skip < cards.length; skip++) {
    let k = 0;
    for (let i = 0; i < cards.length; i++) if (i !== skip) scratch[k++] = cards[i]!;
    const score = fourCardScore(scratch);
    if (score > best) {
      best = score;
      discard = skip;
    }
  }
  return { score: best, discard };
}
