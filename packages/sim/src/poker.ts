import { SUITS, type Card, type Rank, type Suit } from './cards';

/** Poker hand categories, worst to best. */
export enum Category {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  Trips = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  Quads = 7,
  StraightFlush = 8,
  RoyalFlush = 9,
}

export const CATEGORY_NAMES: Record<Category, string> = {
  [Category.HighCard]: 'High card',
  [Category.Pair]: 'Pair',
  [Category.TwoPair]: 'Two pair',
  [Category.Trips]: 'Three of a kind',
  [Category.Straight]: 'Straight',
  [Category.Flush]: 'Flush',
  [Category.FullHouse]: 'Full house',
  [Category.Quads]: 'Four of a kind',
  [Category.StraightFlush]: 'Straight flush',
  [Category.RoyalFlush]: 'Royal flush',
};

export interface PokerHand {
  category: Category;
  /** Tiebreak ranks, most significant first. */
  ranks: Rank[];
  /** Single comparable number: higher wins. */
  score: number;
  /** The rank of the pair, trips or quads, when there is one. */
  madeRank?: Rank;
}

/** The high card of the best straight in this rank set, or 0. Aces play low too. */
function straightHigh(mask: number): number {
  const wheel = mask | ((mask & (1 << 14)) >>> 13); // ace counts as 1
  for (let high = 14; high >= 5; high--) {
    let run = true;
    for (let i = 0; i < 5; i++) {
      if (!(wheel & (1 << (high - i)))) {
        run = false;
        break;
      }
    }
    if (run) return high;
  }
  return 0;
}

function score(category: Category, ranks: readonly number[]): number {
  let value = category;
  for (let i = 0; i < 5; i++) value = value * 15 + (ranks[i] ?? 0);
  return value;
}

/** Best five-card hand out of however many cards are given (five to seven). */
export function evaluatePoker(cards: readonly Card[]): PokerHand {
  const counts = new Map<Rank, number>();
  const bySuit = new Map<Suit, number>();
  const suitRanks = new Map<Suit, number>();
  let mask = 0;

  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
    bySuit.set(card.suit, (bySuit.get(card.suit) ?? 0) + 1);
    suitRanks.set(card.suit, (suitRanks.get(card.suit) ?? 0) | (1 << card.rank));
    mask |= 1 << card.rank;
  }

  const flushSuit = SUITS.find((suit) => (bySuit.get(suit) ?? 0) >= 5);
  if (flushSuit) {
    const suited = suitRanks.get(flushSuit)!;
    const high = straightHigh(suited);
    if (high) {
      const category = high === 14 ? Category.RoyalFlush : Category.StraightFlush;
      return { category, ranks: [high as Rank], score: score(category, [high]) };
    }
    const top = ranksDescending(suited).slice(0, 5);
    return { category: Category.Flush, ranks: top, score: score(Category.Flush, top) };
  }

  // Ranks grouped by how many of them there are, then by rank.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const [topRank, topCount] = groups[0]!;
  const second = groups[1];

  if (topCount === 4) {
    const kicker = groups.find((g) => g[0] !== topRank)![0];
    const ranks = [topRank, kicker];
    return { category: Category.Quads, ranks, score: score(Category.Quads, ranks), madeRank: topRank };
  }

  if (topCount === 3 && second && second[1] >= 2) {
    const ranks = [topRank, second[0]];
    return { category: Category.FullHouse, ranks, score: score(Category.FullHouse, ranks), madeRank: topRank };
  }

  const high = straightHigh(mask);
  if (high) return { category: Category.Straight, ranks: [high as Rank], score: score(Category.Straight, [high]) };

  const kickers = (used: Rank[], take: number) =>
    groups
      .filter((g) => !used.includes(g[0]))
      .map((g) => g[0])
      .sort((a, b) => b - a)
      .slice(0, take);

  if (topCount === 3) {
    const ranks = [topRank, ...kickers([topRank], 2)];
    return { category: Category.Trips, ranks, score: score(Category.Trips, ranks), madeRank: topRank };
  }

  if (topCount === 2 && second?.[1] === 2) {
    const pairs = groups
      .filter((g) => g[1] === 2)
      .map((g) => g[0])
      .sort((a, b) => b - a);
    const [high1, high2] = [pairs[0]!, pairs[1]!];
    const ranks = [high1, high2, ...kickers([high1, high2], 1)];
    return { category: Category.TwoPair, ranks, score: score(Category.TwoPair, ranks), madeRank: high1 };
  }

  if (topCount === 2) {
    const ranks = [topRank, ...kickers([topRank], 3)];
    return { category: Category.Pair, ranks, score: score(Category.Pair, ranks), madeRank: topRank };
  }

  const ranks = ranksDescending(mask).slice(0, 5);
  return { category: Category.HighCard, ranks, score: score(Category.HighCard, ranks) };
}

function ranksDescending(mask: number): Rank[] {
  const ranks: Rank[] = [];
  for (let rank = 14; rank >= 2; rank--) if (mask & (1 << rank)) ranks.push(rank as Rank);
  return ranks;
}

/** Positive if a wins, negative if b wins, 0 on a tie. */
export function comparePoker(a: PokerHand, b: PokerHand): number {
  return a.score - b.score;
}

export function handName(hand: PokerHand): string {
  return CATEGORY_NAMES[hand.category];
}

// ---------------------------------------------------------------------------
// Allocation-free scoring for hot loops (river enumeration, batch runs). Gives
// exactly the same score as evaluatePoker; the category is score / 15^5.

const SUIT_INDEX: Record<Suit, number> = { S: 0, H: 1, D: 2, C: 3 };
const CATEGORY_UNIT = 15 ** 5;

/** Best straight high card for every possible 15-bit rank mask, precomputed once. */
const STRAIGHT_HIGH = (() => {
  const table = new Uint8Array(1 << 15);
  for (let mask = 0; mask < 1 << 15; mask++) table[mask] = straightHigh(mask);
  return table;
})();

const rankCount = new Uint8Array(15);
const suitCount = new Uint8Array(4);
const suitMask = new Uint16Array(4);

function pack(category: number, a = 0, b = 0, c = 0, d = 0, e = 0): number {
  return ((((category * 15 + a) * 15 + b) * 15 + c) * 15 + d) * 15 + e;
}

/** The comparable score of the best five-card hand, with no allocation. */
export function pokerScore(cards: readonly Card[]): number {
  rankCount.fill(0);
  suitCount.fill(0);
  suitMask.fill(0);
  let mask = 0;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!;
    const s = SUIT_INDEX[card.suit];
    rankCount[card.rank]!++;
    suitCount[s]!++;
    suitMask[s]! |= 1 << card.rank;
    mask |= 1 << card.rank;
  }

  for (let s = 0; s < 4; s++) {
    if (suitCount[s]! < 5) continue;
    const suited = suitMask[s]!;
    const high = STRAIGHT_HIGH[suited]!;
    if (high) return pack(high === 14 ? Category.RoyalFlush : Category.StraightFlush, high);
    const top: number[] = [];
    for (let r = 14; r >= 2 && top.length < 5; r--) if (suited & (1 << r)) top.push(r);
    return pack(Category.Flush, top[0], top[1], top[2], top[3], top[4]);
  }

  let quad = 0, trip = 0, trip2 = 0, pair1 = 0, pair2 = 0, pair3 = 0;
  for (let r = 14; r >= 2; r--) {
    const n = rankCount[r]!;
    if (n === 4) quad = r;
    else if (n === 3) { if (!trip) trip = r; else if (!trip2) trip2 = r; }
    else if (n === 2) { if (!pair1) pair1 = r; else if (!pair2) pair2 = r; else if (!pair3) pair3 = r; }
  }

  // The highest single cards not already used, for kickers.
  const kick = (skip1: number, skip2: number, take: number): number[] => {
    const out: number[] = [];
    for (let r = 14; r >= 2 && out.length < take; r--) {
      if (r !== skip1 && r !== skip2 && rankCount[r]! > 0) out.push(r);
    }
    return out;
  };

  if (quad) return pack(Category.Quads, quad, kick(quad, 0, 1)[0]);
  if (trip && (trip2 || pair1)) return pack(Category.FullHouse, trip, Math.max(trip2, pair1));
  const high = STRAIGHT_HIGH[mask]!;
  if (high) return pack(Category.Straight, high);
  if (trip) {
    const k = kick(trip, 0, 2);
    return pack(Category.Trips, trip, k[0], k[1]);
  }
  if (pair1 && pair2) return pack(Category.TwoPair, pair1, pair2, kick(pair1, pair2, 1)[0]);
  if (pair1) {
    const k = kick(pair1, 0, 3);
    return pack(Category.Pair, pair1, k[0], k[1], k[2]);
  }
  const k = kick(0, 0, 5);
  return pack(Category.HighCard, k[0], k[1], k[2], k[3], k[4]);
}

export function categoryOfScore(score: number): Category {
  return Math.floor(score / CATEGORY_UNIT) as Category;
}

/** The five cards that make the best hand, for highlighting. Brute force; display only. */
export function bestFive(cards: readonly Card[]): Card[] {
  if (cards.length <= 5) return [...cards];
  let best: Card[] = [];
  let bestScore = -1;
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const five = [cards[a]!, cards[b]!, cards[c]!, cards[d]!, cards[e]!];
            const s = pokerScore(five);
            if (s > bestScore) {
              bestScore = s;
              best = five;
            }
          }
  return best;
}
