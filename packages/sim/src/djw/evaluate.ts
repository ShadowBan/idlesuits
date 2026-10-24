import type { Card } from '../cards';
import { categoryOfScore, pokerScore } from '../poker';

/**
 * DJ Wild hands: five cards from 53, with every deuce and the joker wild.
 * A royal flush outranks five of a kind, and five wilds beat everything.
 */
export enum DjCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  Trips = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  Quads = 7,
  StraightFlush = 8,
  FiveOfAKind = 9,
  RoyalFlush = 10,
  FiveWilds = 11,
}

export const DJ_CATEGORY_NAMES: Record<DjCategory, string> = {
  [DjCategory.HighCard]: 'High card',
  [DjCategory.Pair]: 'Pair',
  [DjCategory.TwoPair]: 'Two pair',
  [DjCategory.Trips]: 'Three of a kind',
  [DjCategory.Straight]: 'Straight',
  [DjCategory.Flush]: 'Flush',
  [DjCategory.FullHouse]: 'Full house',
  [DjCategory.Quads]: 'Four of a kind',
  [DjCategory.StraightFlush]: 'Straight flush',
  [DjCategory.FiveOfAKind]: 'Five of a kind',
  [DjCategory.RoyalFlush]: 'Royal flush',
  [DjCategory.FiveWilds]: 'Five wilds',
};

export const isWild = (card: Card) => !!card.joker || card.rank === 2;

const BASE = 16;
function pack(category: number, a = 0, b = 0, c = 0, d = 0, e = 0): number {
  return ((((category * BASE + a) * BASE + b) * BASE + c) * BASE + d) * BASE + e;
}

export function djCategoryOf(score: number): DjCategory {
  return Math.floor(score / BASE ** 5) as DjCategory;
}

/** The leading rank in a score: the pair, set or high card a hand is named for. */
export function djTopRank(score: number): number {
  return Math.floor(score / BASE ** 4) % BASE;
}

/** The highest top card of a five-rank run holding every rank given (ace low too), or 0. */
function runTop(ranks: number[]): number {
  for (let top = 14; top >= 5; top--) {
    const low = top - 4;
    if (ranks.every((r) => (r >= low && r <= top) || (r === 14 && low === 1))) return top;
  }
  return 0;
}

/**
 * The comparable score of a DJ Wild hand: higher wins, equal ties. Wild cards
 * take whatever makes the best hand, filling the highest ranks they can.
 */
export function djScore(cards: readonly Card[]): number {
  const naturals = cards.filter((c) => !isWild(c));
  const w = cards.length - naturals.length;
  if (w === 5) return pack(DjCategory.FiveWilds);

  const ranks = naturals.map((c) => c.rank).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // Groups by size, then rank: [rank, count], largest first.
  const groups = [...counts.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0]);
  const distinct = groups.length === ranks.length;
  const suited = naturals.every((c) => c.suit === naturals[0]!.suit);
  const top = runTop(ranks);
  const others = (skip: number) => ranks.filter((r) => r !== skip);
  /** Natural kickers, then aces for any wilds not otherwise used. */
  const fill = (list: number[], spare: number) => [...list, ...Array(spare).fill(14)].sort((a, b) => b - a);

  if (suited && distinct && ranks.every((r) => r >= 10)) return pack(DjCategory.RoyalFlush);
  if (groups.length === 1) return pack(DjCategory.FiveOfAKind, groups[0]![0]);
  if (suited && distinct && top) return pack(DjCategory.StraightFlush, top);

  const [rank0, count0] = groups[0]!;
  if (count0 + w >= 4) {
    // The highest rank wilds can lift to four: with any wilds, a lone high card can beat a low pair.
    const quadRank = Math.max(...groups.filter(([, n]) => n + w >= 4).map(([r]) => r));
    const kicker = others(quadRank)[0] ?? 14;
    return pack(DjCategory.Quads, quadRank, kicker);
  }
  if (w === 0 && count0 === 3 && groups[1]?.[1] === 2) return pack(DjCategory.FullHouse, rank0, groups[1][0]);
  if (w === 1 && count0 === 2 && groups[1]?.[1] === 2) return pack(DjCategory.FullHouse, rank0, groups[1][0]);
  if (suited) {
    // Wilds stand in for the highest cards the suit is missing.
    const flush = [...ranks];
    for (let r = 14; flush.length < 5; r--) if (!flush.includes(r)) flush.push(r);
    flush.sort((a, b) => b - a);
    return pack(DjCategory.Flush, ...(flush as [number, number, number, number, number]));
  }
  if (distinct && top) return pack(DjCategory.Straight, top);
  if (count0 + w >= 3) {
    const tripRank = Math.max(...groups.filter(([, n]) => n + w >= 3).map(([r]) => r));
    const [k1 = 14, k2 = 14] = fill(others(tripRank), Math.max(0, w - (3 - (counts.get(tripRank) ?? 0))));
    return pack(DjCategory.Trips, tripRank, k1, k2);
  }
  if (count0 === 2 && groups[1]?.[1] === 2) {
    return pack(DjCategory.TwoPair, rank0, groups[1][0], groups[2]?.[0] ?? 0);
  }
  if (count0 + w >= 2) {
    const pairRank = count0 === 2 ? rank0 : ranks[0]!;
    const [k1 = 0, k2 = 0, k3 = 0] = others(pairRank);
    return pack(DjCategory.Pair, pairRank, k1, k2, k3);
  }
  return pack(DjCategory.HighCard, ...(ranks as [number, number, number, number, number]));
}

/**
 * Whether the hand makes its category without leaning on a wild: no joker, and
 * reading every deuce as a plain deuce gives the same hand (A-2-3-4-5, say).
 * DJ Wild's Trips bet pays more for natural hands.
 */
export function djIsNatural(cards: readonly Card[], score = djScore(cards)): boolean {
  if (cards.some((c) => c.joker)) return false;
  const category = djCategoryOf(score);
  const plain = categoryOfScore(pokerScore(cards)); // standard poker Category, ace-low wheel included
  const asDj: Record<number, DjCategory> = {
    0: DjCategory.HighCard,
    1: DjCategory.Pair,
    2: DjCategory.TwoPair,
    3: DjCategory.Trips,
    4: DjCategory.Straight,
    5: DjCategory.Flush,
    6: DjCategory.FullHouse,
    7: DjCategory.Quads,
    8: DjCategory.StraightFlush,
    9: DjCategory.RoyalFlush,
  };
  return asDj[plain] === category;
}
