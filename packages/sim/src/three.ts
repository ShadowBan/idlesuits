import type { Card } from './cards';

export type ThreeCardHand = 'miniRoyal' | 'straightFlush' | 'trips' | 'straight' | 'flush' | 'pair' | 'high';

/** Worst to best. A straight beats a flush, because with three cards it is the rarer of the two. */
export const THREE_CARD_ORDER: readonly ThreeCardHand[] = [
  'high',
  'pair',
  'flush',
  'straight',
  'trips',
  'straightFlush',
  'miniRoyal',
];

export const THREE_CARD_NAMES: Record<ThreeCardHand, string> = {
  miniRoyal: 'Mini royal',
  straightFlush: 'Straight flush',
  trips: 'Three of a kind',
  straight: 'Straight',
  flush: 'Flush',
  pair: 'Pair',
  high: 'High card',
};

/** The three ranks high to low, and whether they make a straight; A-2-3 plays as 3-high. */
function shape(cards: readonly Card[]) {
  const [a, b, c] = [cards[0]!.rank, cards[1]!.rank, cards[2]!.rank].sort((x, y) => y - x) as [number, number, number];
  const flush = cards[0]!.suit === cards[1]!.suit && cards[1]!.suit === cards[2]!.suit;
  const run = a - b === 1 && b - c === 1;
  const wheel = a === 14 && b === 3 && c === 2;
  return { a, b, c, flush, straight: run || wheel, wheel };
}

/** Three-card poker hands. Aces play high or low, but K-A-2 is no straight. */
export function threeCardHand(cards: readonly Card[]): ThreeCardHand {
  const { a, b, c, flush, straight } = shape(cards);
  if (a === c) return 'trips';
  if (a === b || b === c) return 'pair';
  if (straight && flush) return a === 14 && b === 13 ? 'miniRoyal' : 'straightFlush';
  if (straight) return 'straight';
  if (flush) return 'flush';
  return 'high';
}

/**
 * A single comparable number for a three-card hand: higher wins, equal ties.
 * A mini royal is just the best straight flush here, and A-2-3 is the lowest straight.
 */
export function threeCardScore(cards: readonly Card[]): number {
  const { a, b, c, flush, straight, wheel } = shape(cards);
  const pack = (category: number, x: number, y = 0, z = 0) => ((category * 15 + x) * 15 + y) * 15 + z;
  if (a === c) return pack(4, a);
  if (a === b) return pack(1, a, c);
  if (b === c) return pack(1, b, a);
  const top = wheel ? 3 : a;
  if (straight && flush) return pack(5, top);
  if (straight) return pack(3, top);
  if (flush) return pack(2, a, b, c);
  return pack(0, a, b, c);
}

/** The category of a score from `threeCardScore`: 0 high card … 5 straight flush. */
export function threeCardCategory(score: number): number {
  return Math.floor(score / 15 ** 3);
}
